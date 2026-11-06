import { describe, expect, it } from 'vitest';
import { buildGuestSearch } from '../src/admin/search.js';

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
