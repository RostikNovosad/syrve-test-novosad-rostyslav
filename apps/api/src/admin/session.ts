import { createHmac, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_SEC = 8 * 60 * 60;

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url');

/** Підписаний токен сесії без стану на сервері: `<adminId>.<exp>.<hmac>`. */
export function createSessionToken(adminId: string, secret: string, now = Date.now()): string {
  const payload = `${adminId}.${Math.floor(now / 1000) + SESSION_TTL_SEC}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(sign(payload, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [adminId, exp] = payload.split('.');
  if (!adminId || Number(exp) * 1000 < now) return null;
  return adminId;
}

// Хеш для вирівнювання часу відповіді, коли логіну не існує
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export async function checkCredentials(prisma: PrismaClient, login: string, password: string) {
  const admin = await prisma.adminUser.findUnique({ where: { login } });
  const ok = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);
  return admin && ok ? admin : null;
}

/** Створює або оновлює пароль першого адміна з env. */
export async function seedAdmin(prisma: PrismaClient, login: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.adminUser.upsert({
    where: { login },
    create: { login, passwordHash },
    update: { passwordHash },
  });
}
