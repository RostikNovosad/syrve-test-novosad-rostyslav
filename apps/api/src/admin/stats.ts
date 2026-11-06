import type { PrismaClient } from '@prisma/client';
import { HttpError } from './permissions.js';

/** Дні в статистиці рахуємо за київським часом: сервіс для українських закладів. */
export const STATS_TZ = 'Europe/Kyiv';
export const MAX_PERIOD_DAYS = 366;

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: STATS_TZ }); // YYYY-MM-DD

export interface DailyPoint {
  date: string;
  earned: number;
  spent: number;
  newGuests: number;
}

/** Усі календарні дні (київські) між from і to включно. */
export function enumerateDays(from: Date, to: Date): string[] {
  const days = new Set<string>();
  for (let t = from.getTime(); t <= to.getTime(); t += 12 * 3600_000) days.add(dayFmt.format(t));
  days.add(dayFmt.format(to));
  return [...days];
}

/** Зводить рядки з БД у суцільний ряд по днях (дні без подій — нулі). */
export function buildDaily(
  days: string[],
  tx: { day: string; earned: number; spent: number }[],
  guests: { day: string; count: number }[],
): DailyPoint[] {
  const txBy = new Map(tx.map((r) => [r.day, r]));
  const guestsBy = new Map(guests.map((r) => [r.day, r.count]));
  return days.map((date) => ({
    date,
    earned: txBy.get(date)?.earned ?? 0,
    spent: txBy.get(date)?.spent ?? 0,
    newGuests: guestsBy.get(date) ?? 0,
  }));
}

export function resolvePeriod(fromIso?: string, toIso?: string, now = new Date()): { from: Date; to: Date } {
  const to = toIso ? new Date(toIso) : now;
  const from = fromIso ? new Date(fromIso) : new Date(to.getTime() - 29 * 86_400_000);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) throw new HttpError('Некоректний період', 400);
  if (from > to) throw new HttpError('Початок періоду пізніше за його кінець', 400);
  if (to.getTime() - from.getTime() > MAX_PERIOD_DAYS * 86_400_000) {
    throw new HttpError(`Період не може бути довшим за ${MAX_PERIOD_DAYS} днів`, 400);
  }
  return { from, to };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Статистика за період: гості (усього, нові, з Telegram) та нарахування/списання за всіма
 * транзакціями гаманця Syrve, які зберіг worker (панель, кабінет Syrve, каса).
 */
export async function getStats(prisma: PrismaClient, from: Date, to: Date) {
  const inPeriod = { gte: from, lte: to };
  const [total, inTelegram, newGuests, newInTelegram, earned, spent, txCount, txDaily, guestsDaily] = await Promise.all([
    prisma.guest.count(),
    prisma.guest.count({ where: { telegramId: { not: null } } }),
    prisma.guest.count({ where: { createdAt: inPeriod } }),
    prisma.guest.count({ where: { createdAt: inPeriod, telegramId: { not: null } } }),
    prisma.loyaltyTransaction.aggregate({ _sum: { sum: true }, where: { occurredAt: inPeriod, sum: { gt: 0 } } }),
    prisma.loyaltyTransaction.aggregate({ _sum: { sum: true }, where: { occurredAt: inPeriod, sum: { lt: 0 } } }),
    prisma.loyaltyTransaction.count({ where: { occurredAt: inPeriod } }),
    prisma.$queryRaw<{ day: string; earned: unknown; spent: unknown }[]>`
      SELECT to_char((occurred_at AT TIME ZONE 'UTC' AT TIME ZONE ${STATS_TZ})::date, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(sum) FILTER (WHERE sum > 0), 0) AS earned,
             COALESCE(-SUM(sum) FILTER (WHERE sum < 0), 0) AS spent
      FROM loyalty_transactions
      WHERE occurred_at >= ${from} AND occurred_at <= ${to}
      GROUP BY 1`,
    prisma.$queryRaw<{ day: string; count: unknown }[]>`
      SELECT to_char((created_at AT TIME ZONE 'UTC' AT TIME ZONE ${STATS_TZ})::date, 'YYYY-MM-DD') AS day,
             COUNT(*) AS count
      FROM guests
      WHERE created_at >= ${from} AND created_at <= ${to}
      GROUP BY 1`,
  ]);

  const earnedSum = Number(earned._sum.sum ?? 0);
  const spentSum = -Number(spent._sum.sum ?? 0);
  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    guests: { total, inTelegram, new: newGuests, newInTelegram },
    bonuses: { earned: round2(earnedSum), spent: round2(spentSum), net: round2(earnedSum - spentSum), transactions: txCount },
    daily: buildDaily(
      enumerateDays(from, to),
      txDaily.map((r) => ({ day: r.day, earned: Number(r.earned), spent: Number(r.spent) })),
      guestsDaily.map((r) => ({ day: r.day, count: Number(r.count) })),
    ),
  };
}
