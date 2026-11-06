import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { logAction } from './audit.js';
import { HttpError, ownerOnly, type AdminRole, type AuthedAdmin } from './permissions.js';

export const MIN_PASSWORD = 8;
const LOGIN_RE = /^[a-zA-Z0-9._-]{3,50}$/;
export const ROLE_TEXT: Record<AdminRole, string> = { owner: 'власник', manager: 'менеджер' };

type Db = Pick<PrismaClient, 'adminUser' | 'bonusOperation'>;

const toDto = (a: { id: string; login: string; role: AdminRole; isActive: boolean; createdAt: Date }) => ({
  id: a.id,
  login: a.login,
  role: a.role,
  isActive: a.isActive,
  createdAt: a.createdAt.toISOString(),
});

function checkPassword(password: string) {
  if (password.length < MIN_PASSWORD) throw new HttpError(`Пароль має містити щонайменше ${MIN_PASSWORD} символів`, 400);
}

/** Не можна лишити систему без жодного активного власника. */
async function assertAnotherOwner(db: Db, exceptId: string) {
  const others = await db.adminUser.count({ where: { role: 'owner', isActive: true, id: { not: exceptId } } });
  if (others === 0) throw new HttpError('Має лишитися хоча б один активний власник', 409);
}

export async function createAdmin(db: Db, input: { login: string; password: string; role: AdminRole }) {
  const login = input.login.trim();
  if (!LOGIN_RE.test(login)) throw new HttpError('Логін: 3–50 символів, латиниця, цифри, крапка, дефіс або підкреслення', 400);
  checkPassword(input.password);
  if (await db.adminUser.findUnique({ where: { login } })) throw new HttpError('Працівник із таким логіном уже є', 409);
  const created = await db.adminUser.create({
    data: { login, role: input.role, passwordHash: await bcrypt.hash(input.password, 10) },
  });
  return toDto(created);
}

export async function updateAdmin(
  db: Db,
  actor: AuthedAdmin,
  id: string,
  patch: { role?: AdminRole; isActive?: boolean; password?: string },
) {
  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) throw new HttpError('Працівника не знайдено', 404);

  const roleChanged = patch.role !== undefined && patch.role !== target.role;
  const deactivated = patch.isActive === false && target.isActive;
  if (id === actor.id && (roleChanged || deactivated)) {
    throw new HttpError('Не можна змінити власну роль або вимкнути власний доступ', 409);
  }
  if (target.role === 'owner' && target.isActive && ((roleChanged && patch.role !== 'owner') || deactivated)) {
    await assertAnotherOwner(db, id);
  }

  const data: { role?: AdminRole; isActive?: boolean; passwordHash?: string } = {};
  if (roleChanged) data.role = patch.role;
  if (patch.isActive !== undefined && patch.isActive !== target.isActive) data.isActive = patch.isActive;
  if (patch.password !== undefined) {
    checkPassword(patch.password);
    data.passwordHash = await bcrypt.hash(patch.password, 10);
  }
  const updated = Object.keys(data).length ? await db.adminUser.update({ where: { id }, data }) : target;

  // Що змінилося — для журналу (пароль без значення)
  const changes: Record<string, unknown> = {};
  if (data.role) changes.role = [ROLE_TEXT[target.role], ROLE_TEXT[data.role]];
  if (data.isActive !== undefined) changes.isActive = [target.isActive ? 'активний' : 'вимкнений', data.isActive ? 'активний' : 'вимкнений'];
  if (data.passwordHash) changes.password = 'змінено';
  return { admin: toDto(updated), changes };
}

export async function deleteAdmin(db: Db, actor: AuthedAdmin, id: string) {
  const target = await db.adminUser.findUnique({ where: { id } });
  if (!target) throw new HttpError('Працівника не знайдено', 404);
  if (id === actor.id) throw new HttpError('Не можна видалити власний обліковий запис', 409);
  if (target.role === 'owner' && target.isActive) await assertAnotherOwner(db, id);
  if ((await db.bonusOperation.count({ where: { adminId: id } })) > 0) {
    throw new HttpError('У працівника є історія операцій — видалити не можна, вимкніть його доступ', 409);
  }
  await db.adminUser.delete({ where: { id } });
  return target;
}

export async function adminUsersRoutes(app: FastifyInstance, { prisma }: { prisma: PrismaClient }) {
  const TAG = ['admin'];
  const guard = { preHandler: ownerOnly };
  const roleSchema = { type: 'string', enum: ['owner', 'manager'] } as const;
  const onError = (req: { log: { error: (e: Error) => void } }) => (e: Error) => req.log.error(e);

  app.get('/admins', { ...guard, schema: { tags: TAG } }, async () => {
    const rows = await prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
    return { items: rows.map(toDto) };
  });

  app.post(
    '/admins',
    {
      ...guard,
      schema: {
        tags: TAG,
        body: {
          type: 'object',
          required: ['login', 'password', 'role'],
          properties: { login: { type: 'string', maxLength: 100 }, password: { type: 'string', maxLength: 200 }, role: roleSchema },
        },
      },
    },
    async (req, reply) => {
      const created = await createAdmin(prisma, req.body as { login: string; password: string; role: AdminRole });
      await logAction(
        prisma,
        req.admin,
        { action: 'admin.create', targetType: 'admin', targetId: created.id, targetLabel: created.login, details: { role: ROLE_TEXT[created.role] } },
        onError(req),
      );
      return reply.code(201).send(created);
    },
  );

  app.patch(
    '/admins/:id',
    {
      ...guard,
      schema: {
        tags: TAG,
        body: {
          type: 'object',
          properties: { role: roleSchema, isActive: { type: 'boolean' }, password: { type: 'string', maxLength: 200 } },
        },
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { admin, changes } = await updateAdmin(prisma, req.admin, id, req.body as never);
      if (Object.keys(changes).length) {
        await logAction(
          prisma,
          req.admin,
          { action: 'admin.update', targetType: 'admin', targetId: admin.id, targetLabel: admin.login, details: changes as never },
          onError(req),
        );
      }
      return admin;
    },
  );

  app.delete('/admins/:id', { ...guard, schema: { tags: TAG } }, async (req) => {
    const target = await deleteAdmin(prisma, req.admin, (req.params as { id: string }).id);
    await logAction(
      prisma,
      req.admin,
      { action: 'admin.delete', targetType: 'admin', targetLabel: target.login },
      onError(req),
    );
    return { ok: true };
  });
}
