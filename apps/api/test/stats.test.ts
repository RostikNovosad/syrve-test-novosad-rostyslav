import { describe, expect, it } from 'vitest';
import { buildDaily, enumerateDays, getStats, resolvePeriod } from '../src/admin/stats.js';

describe('enumerateDays', () => {
  it('усі київські дні періоду включно, без дублів', () => {
    // 2026-01-01 00:00 Київ = 2025-12-31T22:00Z
    const days = enumerateDays(new Date('2025-12-31T22:00:00Z'), new Date('2026-01-03T21:59:59.999Z'));
    expect(days).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
  });
  it('один день', () => {
    expect(enumerateDays(new Date('2026-06-10T00:00:00Z'), new Date('2026-06-10T10:00:00Z'))).toEqual(['2026-06-10']);
  });
});

describe('buildDaily', () => {
  it('заповнює дні без подій нулями', () => {
    const r = buildDaily(['a', 'b', 'c'], [{ day: 'b', earned: 10, spent: 3 }], [{ day: 'c', count: 2 }]);
    expect(r).toEqual([
      { date: 'a', earned: 0, spent: 0, newGuests: 0 },
      { date: 'b', earned: 10, spent: 3, newGuests: 0 },
      { date: 'c', earned: 0, spent: 0, newGuests: 2 },
    ]);
  });
});

describe('resolvePeriod', () => {
  const now = new Date('2026-03-31T12:00:00Z');
  it('за замовчуванням останні 30 днів', () => {
    const { from, to } = resolvePeriod(undefined, undefined, now);
    expect(to).toEqual(now);
    expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(29);
  });
  it('відхиляє перевернутий і задовгий період', () => {
    expect(() => resolvePeriod('2026-02-01T00:00:00Z', '2026-01-01T00:00:00Z')).toThrow(/пізніше/);
    expect(() => resolvePeriod('2024-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).toThrow(/довшим/);
  });
});

describe('getStats', () => {
  it('збирає гостей, суми нарахувань і списань та ряд по днях', async () => {
    const calls: any[] = [];
    const prisma: any = {
      guest: {
        count: async ({ where }: any = {}) => {
          calls.push(where);
          if (!where) return 10; // усього
          if (where.createdAt && where.telegramId) return 2; // нові з Telegram
          if (where.createdAt) return 4; // нові
          return 7; // з Telegram
        },
      },
      loyaltyTransaction: {
        aggregate: async ({ where }: any) => ({ _sum: { sum: where.sum.gt !== undefined ? 150.5 : -40.25 } }),
        count: async () => 9,
      },
      $queryRaw: async (strings: TemplateStringsArray) =>
        strings.join('').includes('loyalty_transactions')
          ? [{ day: '2026-01-02', earned: '100.50', spent: '40.25' }]
          : [{ day: '2026-01-02', count: '4' }],
    };
    const r = await getStats(prisma, new Date('2025-12-31T22:00:00Z'), new Date('2026-01-02T21:59:59Z'));
    expect(r.guests).toEqual({ total: 10, inTelegram: 7, new: 4, newInTelegram: 2 });
    expect(r.bonuses).toEqual({ earned: 150.5, spent: 40.25, net: 110.25, transactions: 9 });
    expect(r.daily).toEqual([
      { date: '2026-01-01', earned: 0, spent: 0, newGuests: 0 },
      { date: '2026-01-02', earned: 100.5, spent: 40.25, newGuests: 4 },
    ]);
  });
});
