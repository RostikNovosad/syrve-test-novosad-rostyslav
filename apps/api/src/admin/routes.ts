import type { FastifyInstance, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient } from '@prisma/client';
import { normalizePhone } from '../bot/phone.js';
import { PhoneTakenError, registerGuest } from '../bot/registration.js';
import type { Config } from '../config.js';
import type { Customer, SyrveClient, SyrveContext } from '../syrve/index.js';
import { SyrveError } from '../syrve/index.js';
import { buildGuestSearch } from './search.js';
import { applyOperation, MAX_AMOUNT, OperationError, pickWallet } from './operations.js';
import {
  checkCredentials,
  createSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SEC,
  verifySessionToken,
} from './session.js';

export interface AdminDeps {
  config: Config;
  prisma: PrismaClient;
  syrve: SyrveClient;
  resolveCtx: () => Promise<SyrveContext>;
  sessionSecret: string;
}

const TAG = ['admin'];

function toGuestDto(c: Customer, ctx: SyrveContext, inTelegram: boolean) {
  const wallet = pickWallet(c, ctx.walletId);
  return {
    customerId: c.id,
    name: c.name,
    phone: c.phone,
    cardNumber: c.cards[0]?.number ?? null,
    balance: wallet?.balance ?? null, // null — гість не в програмі лояльності
    inTelegram,
  };
}

export async function adminRoutes(app: FastifyInstance, deps: AdminDeps) {
  const { prisma, syrve, resolveCtx, sessionSecret } = deps;

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof OperationError) return reply.code(err.status).send({ error: err.message });
    if (err instanceof SyrveError) {
      req.log.error({ err, body: err.body }, 'Syrve error');
      return reply.code(502).send({ error: 'Syrve тимчасово недоступний, спробуйте ще раз' });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 429) return reply.code(429).send({ error: 'Забагато спроб. Зачекайте хвилину.' });
    if (status && status < 500) return reply.code(status).send({ error: 'Некоректний запит' });
    req.log.error(err);
    return reply.code(500).send({ error: 'Внутрішня помилка сервера' });
  });

  // CSRF: cookie SameSite=Strict + обовʼязковий кастомний заголовок на змінюючих запитах
  app.addHook('onRequest', async (req, reply) => {
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'admin-panel') {
      return reply.code(403).send({ error: 'Заборонено' });
    }
  });

  const adminIdOf = (req: FastifyRequest) => verifySessionToken(req.cookies[SESSION_COOKIE], sessionSecret);

  app.post(
    '/auth/login',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        tags: TAG,
        body: {
          type: 'object',
          required: ['login', 'password'],
          properties: { login: { type: 'string', maxLength: 100 }, password: { type: 'string', maxLength: 200 } },
        },
      },
    },
    async (req, reply) => {
      const { login, password } = req.body as { login: string; password: string };
      const admin = await checkCredentials(prisma, login.trim(), password);
      if (!admin) return reply.code(401).send({ error: 'Невірний логін або пароль' });
      reply.setCookie(SESSION_COOKIE, createSessionToken(admin.id, sessionSecret), {
        httpOnly: true,
        sameSite: 'strict',
        secure: req.protocol === 'https',
        path: '/',
        maxAge: SESSION_TTL_SEC,
      });
      return { login: admin.login };
    },
  );

  app.post('/auth/logout', { schema: { tags: TAG } }, async (_req, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  // Усе нижче — лише для авторизованих
  await app.register(async (secured) => {
    const adminMap = new WeakMap<FastifyRequest, { id: string; login: string }>();
    secured.addHook('preHandler', async (req, reply) => {
      const id = adminIdOf(req);
      const admin = id ? await prisma.adminUser.findUnique({ where: { id } }) : null;
      if (!admin) return reply.code(401).send({ error: 'Потрібен вхід' });
      adminMap.set(req, { id: admin.id, login: admin.login });
    });

    secured.get('/auth/me', { schema: { tags: TAG } }, async (req) => ({ login: adminMap.get(req)!.login }));

    /** Гість із Syrve, якого ще немає в нашій БД (створений у кабінеті Syrve), потрапляє в список при першому відкритті. */
    const ensureLocal = async (c: Customer) => {
      const found = await prisma.guest.findUnique({ where: { syrveCustomerId: c.id } });
      if (found) return found;
      const byPhone = await prisma.guest.findUnique({ where: { phone: c.phone } });
      if (byPhone || !c.phone) return byPhone;
      return prisma.guest.create({
        data: { phone: c.phone, name: c.name, syrveCustomerId: c.id, cardNumber: c.cards[0]?.number ?? null },
      });
    };

    const guestById = async (customerId: string) => {
      const ctx = await resolveCtx();
      const customer = await syrve.getCustomer(ctx.organizationId, customerId);
      if (!customer) return null;
      const local = await ensureLocal(customer);
      return toGuestDto(customer, ctx, local?.telegramId != null);
    };

    // О4: пошук гостя за телефоном
    secured.get(
      '/guests/lookup',
      {
        schema: {
          tags: TAG,
          querystring: { type: 'object', required: ['phone'], properties: { phone: { type: 'string', maxLength: 30 } } },
        },
      },
      async (req, reply) => {
        const phone = normalizePhone((req.query as { phone: string }).phone);
        if (!phone) return reply.code(400).send({ error: 'Введіть український номер, напр. 050 123 45 67' });
        const ctx = await resolveCtx();
        const customer = await syrve.findCustomerByPhone(ctx.organizationId, phone);
        if (!customer) return reply.code(404).send({ error: 'Гостя з таким номером не знайдено' });
        const local = await ensureLocal(customer);
        return toGuestDto(customer, ctx, local?.telegramId != null);
      },
    );

    // Д2: список гостей з пошуком за номером або імʼям і пагінацією
    secured.get(
      '/guests',
      {
        schema: {
          tags: TAG,
          querystring: {
            type: 'object',
            properties: {
              q: { type: 'string', maxLength: 60 },
              page: { type: 'integer', minimum: 1, default: 1 },
              limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            },
          },
        },
      },
      async (req) => {
        const { q = '', page = 1, limit = 10 } = req.query as { q?: string; page?: number; limit?: number };
        const where = buildGuestSearch(q);
        const [rows, total] = await Promise.all([
          prisma.guest.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip: (page - 1) * limit }),
          prisma.guest.count({ where }),
        ]);
        return {
          total,
          items: rows.map((g) => ({
            customerId: g.syrveCustomerId,
            name: g.name,
            phone: g.phone,
            cardNumber: g.cardNumber,
            inTelegram: g.telegramId !== null,
            createdAt: g.createdAt.toISOString(),
          })),
        };
      },
    );

    // Створення гостя: Syrve (гість + програма + картка) і запис у нашій БД, без Telegram
    secured.post(
      '/guests',
      {
        schema: {
          tags: TAG,
          body: {
            type: 'object',
            required: ['name', 'phone'],
            properties: { name: { type: 'string', minLength: 1, maxLength: 100 }, phone: { type: 'string', maxLength: 30 } },
          },
        },
      },
      async (req, reply) => {
        const body = req.body as { name: string; phone: string };
        const name = body.name.trim();
        const phone = normalizePhone(body.phone);
        if (!name) return reply.code(400).send({ error: 'Вкажіть імʼя гостя' });
        if (!phone) return reply.code(400).send({ error: 'Введіть український номер, напр. 050 123 45 67' });
        const ctx = await resolveCtx();
        try {
          const guest = await registerGuest({ prisma, syrve, ctx }, { telegramId: null, phone, name });
          return reply.code(201).send({ customerId: guest.syrveCustomerId });
        } catch (e) {
          if (e instanceof PhoneTakenError) {
            return reply.code(409).send({ error: 'Гість із таким номером уже є в списку' });
          }
          throw e;
        }
      },
    );

    // Редагування імені та телефону (змінюється і в Syrve)
    secured.patch(
      '/guests/:customerId',
      {
        schema: {
          tags: TAG,
          body: {
            type: 'object',
            properties: { name: { type: 'string', minLength: 1, maxLength: 100 }, phone: { type: 'string', maxLength: 30 } },
          },
        },
      },
      async (req, reply) => {
        const { customerId } = req.params as { customerId: string };
        const body = req.body as { name?: string; phone?: string };
        const ctx = await resolveCtx();
        const customer = await syrve.getCustomer(ctx.organizationId, customerId);
        if (!customer) return reply.code(404).send({ error: 'Гостя не знайдено' });

        const name = body.name?.trim() ?? customer.name;
        const phone = body.phone !== undefined ? normalizePhone(body.phone) : customer.phone;
        if (!name) return reply.code(400).send({ error: 'Вкажіть імʼя гостя' });
        if (!phone) return reply.code(400).send({ error: 'Введіть український номер, напр. 050 123 45 67' });

        if (phone !== customer.phone) {
          const taken = await prisma.guest.findUnique({ where: { phone } });
          if (taken && taken.syrveCustomerId !== customerId) {
            return reply.code(409).send({ error: 'Цей номер уже належить іншому гостю' });
          }
        }
        await syrve.createOrUpdateCustomer(ctx.organizationId, { id: customerId, phone, name });
        await prisma.guest.updateMany({ where: { syrveCustomerId: customerId }, data: { name, phone } });
        return guestById(customerId);
      },
    );

    secured.get('/guests/:customerId', { schema: { tags: TAG } }, async (req, reply) => {
      const dto = await guestById((req.params as { customerId: string }).customerId);
      return dto ?? reply.code(404).send({ error: 'Гостя не знайдено' });
    });

    // О5: нарахування/списання
    secured.post(
      '/guests/:customerId/operations',
      {
        schema: {
          tags: TAG,
          body: {
            type: 'object',
            required: ['type', 'amount', 'reason'],
            properties: {
              type: { type: 'string', enum: ['topup', 'chargeoff'] },
              amount: { type: 'number', exclusiveMinimum: 0, maximum: MAX_AMOUNT },
              reason: { type: 'string', maxLength: 200 },
            },
          },
        },
      },
      async (req) => {
        const { customerId } = req.params as { customerId: string };
        const body = req.body as { type: 'topup' | 'chargeoff'; amount: number; reason: string };
        const ctx = await resolveCtx();
        const { customer } = await applyOperation(
          { prisma, syrve, ctx },
          { customerId, adminId: adminMap.get(req)!.id, ...body },
        );
        const local = await prisma.guest.findUnique({ where: { syrveCustomerId: customer.id } });
        return toGuestDto(customer, ctx, local?.telegramId != null);
      },
    );

    // Журнал: хто, коли, скільки, чому
    secured.get(
      '/operations',
      {
        schema: {
          tags: TAG,
          querystring: {
            type: 'object',
            properties: {
              customerId: { type: 'string' },
              limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
              offset: { type: 'integer', minimum: 0, default: 0 },
            },
          },
        },
      },
      async (req) => {
        const q = req.query as { customerId?: string; limit?: number; offset?: number };
        const where = q.customerId ? { syrveCustomerId: q.customerId } : {};
        const [rows, total] = await Promise.all([
          prisma.bonusOperation.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: q.limit ?? 20,
            skip: q.offset ?? 0,
            include: { admin: { select: { login: true } } },
          }),
          prisma.bonusOperation.count({ where }),
        ]);
        return {
          total,
          items: rows.map((o) => ({
            id: o.id,
            createdAt: o.createdAt.toISOString(),
            type: o.type,
            amount: Number(o.amount),
            reason: o.reason,
            status: o.status,
            error: o.error,
            guestName: o.guestName,
            guestPhone: o.guestPhone,
            customerId: o.syrveCustomerId,
            admin: o.admin.login,
          })),
        };
      },
    );
  });
}
