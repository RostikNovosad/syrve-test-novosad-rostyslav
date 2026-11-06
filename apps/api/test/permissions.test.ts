import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { requireRole, type AdminRole } from '../src/admin/permissions.js';

async function appWithRole(role: AdminRole | null) {
  const app = Fastify();
  app.decorateRequest('admin', null as never);
  app.addHook('preHandler', async (req) => {
    if (role) req.admin = { id: 'a1', login: 'x', role };
  });
  app.get('/owner', { preHandler: requireRole('owner') }, async () => ({ ok: true }));
  app.get('/any', { preHandler: requireRole('owner', 'manager') }, async () => ({ ok: true }));
  return app;
}

describe('requireRole', () => {
  it('власник проходить на owner-маршрут', async () => {
    const res = await (await appWithRole('owner')).inject('/owner');
    expect(res.statusCode).toBe(200);
  });

  it('менеджера не пускає на owner-маршрут (403 українською)', async () => {
    const res = await (await appWithRole('manager')).inject('/owner');
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatch(/прав/);
  });

  it('менеджер проходить, коли роль дозволена', async () => {
    expect((await (await appWithRole('manager')).inject('/any')).statusCode).toBe(200);
  });

  it('без авторизованого адміна — 403', async () => {
    expect((await (await appWithRole(null)).inject('/owner')).statusCode).toBe(403);
  });
});
