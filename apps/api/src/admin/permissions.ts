import type { FastifyReply, FastifyRequest } from 'fastify';

export type AdminRole = 'owner' | 'manager';

export interface AuthedAdmin {
  id: string;
  login: string;
  role: AdminRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Заповнюється хуком авторизації для всіх захищених маршрутів */
    admin: AuthedAdmin;
  }
}

/**
 * Middleware ролей: пропускає лише адмінів із переліку, інакше 403.
 * Підключається як preHandler після хука авторизації (який виставляє req.admin).
 */
export function requireRole(...roles: AdminRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return reply.code(403).send({ error: 'Недостатньо прав для цієї дії' });
    }
  };
}

export const ownerOnly = requireRole('owner');
