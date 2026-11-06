import { describe, expect, it } from 'vitest';
import { createAdmin, deleteAdmin, updateAdmin } from '../src/admin/admins.js';
import { checkCredentials } from '../src/admin/session.js';
import bcrypt from 'bcryptjs';
import assert from 'node:assert';

type A = { id: string; login: string; role: 'owner' | 'manager'; isActive: boolean; passwordHash: string; createdAt: Date };

/** In-memory дублер Prisma для adminUser / bonusOperation. */
function fake(admins: Partial<A>[], opsByAdmin: Record<string, number> = {}) {
  const rows: A[] = admins.map((a, i) => ({ id: `a${i + 1}`, login: `u${i + 1}`, role: 'manager', isActive: true, passwordHash: 'h', createdAt: new Date(), ...a }));
  const db: any = {
    rows,
    adminUser: {
      findUnique: async ({ where }: any) => {
        const r = rows.find((x) => (where.id ? x.id === where.id : x.login === where.login));
        return r ? { ...r } : null; // копія, як у справжньому Prisma
      },
      count: async ({ where }: any) =>
        rows.filter((r) => r.role === where.role && r.isActive === where.isActive && r.id !== where.id.not).length,
      create: async ({ data }: any) => {
        const r = { id: `n${rows.length + 1}`, isActive: true, createdAt: new Date(), ...data };
        rows.push(r);
        return r;
      },
      update: async ({ where, data }: any) => ({ ...Object.assign(rows.find((r) => r.id === where.id)!, data) }),
      delete: async ({ where }: any) => void rows.splice(rows.findIndex((r) => r.id === where.id), 1),
    },
    bonusOperation: { count: async ({ where }: any) => opsByAdmin[where.adminId] ?? 0 },
  };
  return db;
}
const actor = (id = 'a1') => ({ id, login: 'x', role: 'owner' as const });

describe('createAdmin', () => {
  it('створює працівника з хешем пароля', async () => {
    const db = fake([{ role: 'owner' }]);
    const r = await createAdmin(db, { login: ' anna ', password: 'secret123', role: 'manager' });
    expect(r).toMatchObject({ login: 'anna', role: 'manager', isActive: true });
    expect(await bcrypt.compare('secret123', db.rows.at(-1).passwordHash)).toBe(true);
  });
  it('відхиляє короткий пароль, поганий логін і дубль', async () => {
    const db = fake([{ login: 'anna' }]);
    await expect(createAdmin(db, { login: 'bob', password: 'short', role: 'manager' })).rejects.toThrow(/Пароль/);
    await expect(createAdmin(db, { login: 'a b', password: 'secret123', role: 'manager' })).rejects.toThrow(/Логін/);
    await expect(createAdmin(db, { login: 'anna', password: 'secret123', role: 'manager' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('updateAdmin', () => {
  it('змінює роль іншого працівника й повертає зміни для журналу', async () => {
    const db = fake([{ role: 'owner' }, { role: 'manager' }]);
    const r = await updateAdmin(db, actor('a1'), 'a2', { role: 'owner' });
    expect(r.admin.role).toBe('owner');
    expect(r.changes).toEqual({ role: ['менеджер', 'власник'] });
  });
  it('не дає змінити власну роль чи вимкнути себе', async () => {
    const db = fake([{ role: 'owner' }, { role: 'owner' }]);
    await expect(updateAdmin(db, actor('a1'), 'a1', { role: 'manager' })).rejects.toMatchObject({ status: 409 });
    await expect(updateAdmin(db, actor('a1'), 'a1', { isActive: false })).rejects.toMatchObject({ status: 409 });
  });
  it('не дає позбутися останнього активного власника', async () => {
    const db = fake([{ role: 'owner' }, { role: 'owner', isActive: false }]);
    await expect(updateAdmin(db, actor('a3'), 'a1', { isActive: false })).rejects.toThrow(/власник/);
  });
  it('змінює пароль і не показує його у changes', async () => {
    const db = fake([{ role: 'owner' }, {}]);
    const r = await updateAdmin(db, actor(), 'a2', { password: 'newpass123' });
    expect(r.changes).toEqual({ password: 'змінено' });
    expect(await bcrypt.compare('newpass123', db.rows[1].passwordHash)).toBe(true);
  });
  it('404 для невідомого працівника', async () => {
    await expect(updateAdmin(fake([{}]), actor(), 'zzz', { isActive: false })).rejects.toMatchObject({ status: 404 });
  });
});

describe('deleteAdmin', () => {
  it('видаляє працівника без історії', async () => {
    const db = fake([{ role: 'owner' }, {}]);
    await deleteAdmin(db, actor(), 'a2');
    expect(db.rows).toHaveLength(1);
  });
  it('не видаляє себе, останнього власника й працівника з історією операцій', async () => {
    const db = fake([{ role: 'owner' }, { role: 'owner' }, {}], { a3: 4 });
    await expect(deleteAdmin(db, actor('a1'), 'a1')).rejects.toMatchObject({ status: 409 });
    await expect(deleteAdmin(db, actor('a1'), 'a3')).rejects.toThrow(/історі/);
    const solo = fake([{ role: 'owner' }, {}]);
    await expect(deleteAdmin(solo, actor('a2'), 'a1')).rejects.toThrow(/власник/);
  });
});

describe('checkCredentials', () => {
  it('вимкнений працівник не може увійти навіть із правильним паролем', async () => {
    const passwordHash = await bcrypt.hash('secret123', 4);
    const prisma: any = { adminUser: { findUnique: async () => ({ id: 'a1', passwordHash, isActive: false }) } };
    expect(await checkCredentials(prisma, 'x', 'secret123')).toBeNull();
    prisma.adminUser.findUnique = async () => ({ id: 'a1', passwordHash, isActive: true });
    expect(await checkCredentials(prisma, 'x', 'secret123')).not.toBeNull();
  });
});

import { seedManager } from '../src/admin/session.js';

describe('seedManager', () => {
  it('створює менеджера, якщо логіну ще немає', async () => {
    const create = async ({ data }: any) => data;
    const calls: any[] = [];
    const prisma: any = { adminUser: { findUnique: async () => null, create: async (a: any) => void calls.push(a) } };
    expect(await seedManager(prisma, 'user', 'user')).toBe(true);
    expect(calls[0].data).toMatchObject({ login: 'user', role: 'manager' });
    expect(await bcrypt.compare('user', calls[0].data.passwordHash)).toBe(true);
    void create;
  });
  it('наявного користувача не чіпає', async () => {
    const prisma: any = { adminUser: { findUnique: async () => ({ id: 'x' }), create: async () => assert.fail() } };
    expect(await seedManager(prisma, 'user', 'user')).toBe(false);
  });
});
