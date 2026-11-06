import type { FastifyInstance } from 'fastify';
import { MockSyrveClient } from '../syrve/mock.js';
import { RealSyrveClient } from '../syrve/real.js';
import { SyrveError, type SyrveClient } from '../syrve/types.js';

const TAG = ['dev'];
const orgQuery = {
  type: 'object',
  required: ['organizationId'],
  properties: { organizationId: { type: 'string' } },
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

  app.get('/dev/syrve/organizations', { schema: { tags: TAG } }, () => syrve.getOrganizations());

  app.get('/dev/syrve/programs', { schema: { tags: TAG, querystring: orgQuery } }, (req) =>
    syrve.getPrograms((req.query as { organizationId: string }).organizationId),
  );

  app.get(
    '/dev/syrve/customer',
    {
      schema: {
        tags: TAG,
        description: 'Пошук гостя за телефоном (+380…)',
        querystring: {
          type: 'object',
          required: ['organizationId', 'phone'],
          properties: { organizationId: { type: 'string' }, phone: { type: 'string', examples: ['+380501234567'] } },
        },
      },
    },
    async (req, reply) => {
      const q = req.query as { organizationId: string; phone: string };
      const c = await syrve.findCustomerByPhone(q.organizationId, q.phone);
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
          required: ['organizationId', 'phone', 'name'],
          properties: {
            organizationId: { type: 'string' },
            id: { type: 'string' },
            phone: { type: 'string', examples: ['+380501234567'] },
            name: { type: 'string', examples: ['Тест Гість'] },
          },
        },
      },
    },
    async (req) => {
      const { organizationId, ...data } = req.body as { organizationId: string; id?: string; phone: string; name: string };
      return { id: await syrve.createOrUpdateCustomer(organizationId, data) };
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
          required: ['organizationId', 'customerId', 'programId'],
          properties: { organizationId: { type: 'string' }, customerId: { type: 'string' }, programId: { type: 'string' } },
        },
      },
    },
    async (req) => {
      const b = req.body as { organizationId: string; customerId: string; programId: string };
      await syrve.addCustomerToProgram(b.organizationId, b.customerId, b.programId);
      return { ok: true };
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
          required: ['organizationId', 'customerId', 'cardNumber'],
          properties: { organizationId: { type: 'string' }, customerId: { type: 'string' }, cardNumber: { type: 'string' } },
        },
      },
    },
    async (req) => {
      const b = req.body as { organizationId: string; customerId: string; cardNumber: string };
      await syrve.addCard(b.organizationId, b.customerId, b.cardNumber);
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
            required: ['organizationId', 'customerId', 'walletId', 'sum'],
            properties: {
              organizationId: { type: 'string' },
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
          organizationId: string; customerId: string; walletId: string; sum: number; comment?: string;
        };
        await (kind === 'topup' ? syrve.topUp : syrve.chargeOff).call(syrve, organizationId, change);
        return { ok: true };
      },
    );
  }

  app.get(
    '/dev/syrve/transactions',
    {
      schema: {
        tags: TAG,
        description: 'customer/transactions/by_revision',
        querystring: {
          type: 'object',
          required: ['organizationId'],
          properties: { organizationId: { type: 'string' }, revision: { type: 'integer', default: 0 } },
        },
      },
    },
    (req) => {
      const q = req.query as { organizationId: string; revision?: number };
      return syrve.getTransactionsByRevision(q.organizationId, q.revision ?? 0);
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
