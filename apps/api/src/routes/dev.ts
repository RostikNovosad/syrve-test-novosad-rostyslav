import type { FastifyInstance } from 'fastify';
import { MockSyrveClient } from '../syrve/mock.js';
import { RealSyrveClient } from '../syrve/real.js';
import { SyrveError, type SyrveClient } from '../syrve/types.js';

const TAG = ['dev'];
const ORG_DESC = 'Необовʼязково: за замовчуванням — перша організація з Syrve';
const orgQuery = {
  type: 'object',
  required: [],
  properties: { organizationId: { type: 'string', description: ORG_DESC } },
} as const;

/**
 * Dev-ендпоінти для ручного тестування (Postman/Swagger). Без авторизації —
 * вмикаються лише через ENABLE_DEV_ROUTES=true, у продакшені не вмикати.
 */
export async function devRoutes(app: FastifyInstance, syrve: SyrveClient) {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof SyrveError) {
      // Віддаємо тіло помилки Syrve як є — це корисно для налагодження
      return reply.code(err.status && err.status >= 400 ? err.status : 502).send({
        error: err.message,
        syrveBody: err.body,
      });
    }
    return reply.send(err);
  });

  let cachedOrg: string | undefined;
  const org = async (given?: string) => {
    if (given) return given;
    cachedOrg ??= (await syrve.getOrganizations())[0]?.id;
    if (!cachedOrg) throw new SyrveError('Syrve не повернув жодної організації', 502);
    return cachedOrg;
  };

  app.get('/dev/syrve/organizations', { schema: { tags: TAG } }, () => syrve.getOrganizations());

  app.get('/dev/syrve/programs', { schema: { tags: TAG, querystring: orgQuery } }, async (req) =>
    syrve.getPrograms(await org((req.query as { organizationId?: string }).organizationId)),
  );

  app.get(
    '/dev/syrve/customer',
    {
      schema: {
        tags: TAG,
        description: 'Пошук гостя за телефоном (+380…)',
        querystring: {
          type: 'object',
          required: ['phone'],
          properties: { organizationId: { type: 'string', description: ORG_DESC }, phone: { type: 'string', examples: ['+380501234567'] } },
        },
      },
    },
    async (req, reply) => {
      const q = req.query as { organizationId?: string; phone: string };
      const c = await syrve.findCustomerByPhone(await org(q.organizationId), q.phone);
      return c ?? reply.code(404).send({ error: 'Гостя не знайдено' });
    },
  );

  app.get(
    '/dev/syrve/customer/:id',
    {
      schema: {
        tags: TAG,
        description: 'customer/info за id гостя',
        params: { type: 'object', properties: { id: { type: 'string' } } },
        querystring: { type: 'object', properties: { organizationId: { type: 'string', description: ORG_DESC } } },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const q = req.query as { organizationId?: string };
      const c = await syrve.getCustomer(await org(q.organizationId), id);
      return c ?? reply.code(404).send({ error: 'Гостя не знайдено' });
    },
  );

  app.post(
    '/dev/syrve/customer',
    {
      schema: {
        tags: TAG,
        description: 'customer/create_or_update',
        body: {
          type: 'object',
          required: ['phone', 'name'],
          properties: {
            organizationId: { type: 'string', description: ORG_DESC },
            id: { type: 'string' },
            phone: { type: 'string', examples: ['+380501234567'] },
            name: { type: 'string', examples: ['Тест Гість'] },
          },
        },
      },
    },
    async (req) => {
      const { organizationId, ...data } = req.body as { organizationId?: string; id?: string; phone: string; name: string };
      return { id: await syrve.createOrUpdateCustomer(await org(organizationId), data) };
    },
  );

  app.post(
    '/dev/syrve/customer/program',
    {
      schema: {
        tags: TAG,
        description: 'customer/program/add',
        body: {
          type: 'object',
          required: ['customerId', 'programId'],
          properties: { organizationId: { type: 'string', description: ORG_DESC }, customerId: { type: 'string' }, programId: { type: 'string' } },
        },
      },
    },
    async (req) => {
      const b = req.body as { organizationId?: string; customerId: string; programId: string };
      return syrve.addCustomerToProgram(await org(b.organizationId), b.customerId, b.programId);
    },
  );

  app.post(
    '/dev/syrve/customer/card',
    {
      schema: {
        tags: TAG,
        description: 'customer/card/add',
        body: {
          type: 'object',
          required: ['customerId', 'cardNumber'],
          properties: { organizationId: { type: 'string', description: ORG_DESC }, customerId: { type: 'string' }, cardNumber: { type: 'string' } },
        },
      },
    },
    async (req) => {
      const b = req.body as { organizationId?: string; customerId: string; cardNumber: string };
      await syrve.addCard(await org(b.organizationId), b.customerId, b.cardNumber);
      return { ok: true };
    },
  );

  for (const [kind, desc] of [
    ['topup', 'Нарахування (customer/wallet/topup)'],
    ['chargeoff', 'Списання (customer/wallet/chargeoff)'],
  ] as const) {
    app.post(
      `/dev/syrve/wallet/${kind}`,
      {
        schema: {
          tags: TAG,
          description: desc,
          body: {
            type: 'object',
            required: ['customerId', 'walletId', 'sum'],
            properties: {
              organizationId: { type: 'string', description: ORG_DESC },
              customerId: { type: 'string' },
              walletId: { type: 'string' },
              sum: { type: 'number', exclusiveMinimum: 0 },
              comment: { type: 'string' },
            },
          },
        },
      },
      async (req) => {
        const { organizationId, ...change } = req.body as {
          organizationId?: string; customerId: string; walletId: string; sum: number; comment?: string;
        };
        await (kind === 'topup' ? syrve.topUp : syrve.chargeOff).call(syrve, await org(organizationId), change);
        return { ok: true };
      },
    );
  }

  app.get(
    '/dev/syrve/transactions',
    {
      schema: {
        tags: TAG,
        description: 'customer/transactions/by_revision — транзакції ОДНОГО гостя (customerId обовʼязковий)',
        querystring: {
          type: 'object',
          required: ['customerId'],
          properties: {
            organizationId: { type: 'string', description: ORG_DESC },
            customerId: { type: 'string' },
            revision: { type: 'integer', default: 0 },
            pageSize: { type: 'integer', default: 100 },
          },
        },
      },
    },
    async (req) => {
      const q = req.query as { organizationId?: string; customerId: string; revision?: number; pageSize?: number };
      return syrve.getTransactionsByRevision(await org(q.organizationId), q.customerId, q.revision ?? 0, q.pageSize);
    },
  );

  if (syrve instanceof RealSyrveClient) {
    app.post(
      '/dev/syrve/raw',
      {
        schema: {
          tags: TAG,
          description:
            'Сирий запит до Syrve з автоматичним токеном. path — після /api/1/, напр. "loyalty/syrve/program". Відповідь — як є, для вивчення форм у docs/syrve-notes.md.',
          body: {
            type: 'object',
            required: ['path'],
            properties: {
              path: { type: 'string', examples: ['organizations'] },
              body: { type: 'object', additionalProperties: true, default: {} },
            },
          },
        },
      },
      async (req) => {
        const b = req.body as { path: string; body?: unknown };
        return syrve.post(b.path.replace(/^\/+/, ''), b.body ?? {});
      },
    );
  }

  if (syrve instanceof MockSyrveClient) {
    app.post(
      '/dev/simulate-transaction',
      {
        schema: {
          tags: TAG,
          description: 'Mock: імітує транзакцію поза нашим сервісом (демо О6). sum<0 — списання.',
          body: {
            type: 'object',
            required: ['customerId', 'sum'],
            properties: { customerId: { type: 'string' }, sum: { type: 'number' }, comment: { type: 'string' } },
          },
        },
      },
      async (req, reply) => {
        const { customerId, sum, comment } = req.body as { customerId: string; sum: number; comment?: string };
        if (sum === 0) return reply.code(400).send({ error: 'sum не може бути 0' });
        syrve.simulateTransaction(customerId, sum, comment);
        return { ok: true };
      },
    );
  }
}
