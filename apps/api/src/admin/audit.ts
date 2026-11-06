import type { Prisma, PrismaClient } from '@prisma/client';

export type AuditAction =
  | 'auth.login'
  | 'guest.create'
  | 'guest.update'
  | 'admin.create'
  | 'admin.update'
  | 'admin.delete';

export interface AuditEntry {
  action: AuditAction;
  targetType?: 'guest' | 'admin';
  targetId?: string;
  targetLabel?: string;
  details?: Prisma.InputJsonValue;
}

/**
 * Записує системну дію адміна. Збій журналу не повинен ламати саму дію,
 * тому помилка лише повертається в `onError` (логер) і не кидається далі.
 */
export async function logAction(
  prisma: PrismaClient,
  admin: { id: string; login: string },
  entry: AuditEntry,
  onError?: (e: Error) => void,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        adminId: admin.id,
        adminLogin: admin.login,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        targetLabel: entry.targetLabel,
        details: entry.details,
      },
    });
  } catch (e) {
    onError?.(e as Error);
  }
}

/** Різниця між старими й новими значеннями: лише змінені поля, у форматі { поле: [було, стало] }. */
export function diffFields<T extends Record<string, string>>(before: T, after: T): Record<string, [string, string]> {
  const out: Record<string, [string, string]> = {};
  for (const k of Object.keys(after)) if (before[k] !== after[k]) out[k] = [before[k] as string, after[k] as string];
  return out;
}
