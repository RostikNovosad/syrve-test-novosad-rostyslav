import { describe, expect, it } from 'vitest';
import { buildGuestOrder, buildGuestSearch, buildGuestWhere } from '../src/admin/search.js';

describe('buildGuestSearch', () => {
  it.each(['', '  ', 'ab', '+3', '05'])('«%s» (коротше за 3 символи) → без фільтра', (q) => {
    expect(buildGuestSearch(q)).toEqual({});
  });

  it.each(['+38', '380', '+380'])('«%s» — лише код країни → без фільтра, а не «нічого не знайдено»', (q) => {
    expect(buildGuestSearch(q)).toEqual({});
  });

  it('початок номера 050… порівнюється з початком, а не з будь-яким місцем', () => {
    expect(buildGuestSearch('050')).toEqual({
      OR: [{ name: { contains: '050', mode: 'insensitive' } }, { phone: { startsWith: '+38050' } }],
    });
  });

  it('+38050 і 38050 теж шукають за початком номера', () => {
    for (const q of ['+38050', '38050', '+380 50']) {
      const w = buildGuestSearch(q) as { OR: Record<string, unknown>[] };
      expect(w.OR[1]).toEqual({ phone: { startsWith: `+38050` } });
    }
  });

  it('середина номера шукається де завгодно', () => {
    expect(buildGuestSearch('245')).toEqual({
      OR: [{ name: { contains: '245', mode: 'insensitive' } }, { phone: { contains: '245' } }],
    });
  });

  it('імʼя шукається без регістру і без фільтра за телефоном', () => {
    expect(buildGuestSearch('Ростік')).toEqual({ OR: [{ name: { contains: 'Ростік', mode: 'insensitive' } }] });
  });
});

describe('buildGuestWhere', () => {
  it('без фільтрів — лише порожній пошук', () => {
    expect(buildGuestWhere({})).toEqual({ AND: [{}] });
  });

  it('поєднує пошук, Telegram, картку й дати через AND', () => {
    const where = buildGuestWhere({ q: 'Іван', telegram: 'yes', card: 'no', from: '2026-01-01T00:00:00.000Z', to: '2026-01-31T21:59:59.999Z' });
    expect(where.AND).toEqual([
      { OR: [{ name: { contains: 'Іван', mode: 'insensitive' } }] },
      { telegramId: { not: null } },
      { cardNumber: null },
      { createdAt: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-01-31T21:59:59.999Z') } },
    ]);
  });

  it('telegram=no — гості без Telegram; одна межа дати теж працює', () => {
    expect(buildGuestWhere({ telegram: 'no', from: '2026-02-01T00:00:00Z' }).AND).toEqual([
      {},
      { telegramId: null },
      { createdAt: { gte: new Date('2026-02-01T00:00:00Z') } },
    ]);
  });

  it('некоректна дата ігнорується', () => {
    expect(buildGuestWhere({ from: 'not-a-date' }).AND).toEqual([{}]);
  });
});

describe('buildGuestOrder', () => {
  it('за замовчуванням — нові зверху, id для стабільності', () => {
    expect(buildGuestOrder()).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
  });
  it('приймає лише дозволені поля й напрямки', () => {
    expect(buildGuestOrder('name', 'asc')).toEqual([{ name: 'asc' }, { id: 'asc' }]);
    expect(buildGuestOrder('passwordHash', 'sideways')).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
  });
});
