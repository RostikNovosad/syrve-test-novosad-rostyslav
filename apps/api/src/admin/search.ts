import type { Prisma } from '@prisma/client';

export const MIN_SEARCH_LENGTH = 3;

/**
 * Фільтр списку гостей за рядком пошуку (імʼя або номер).
 * - коротше за MIN_SEARCH_LENGTH символів → без фільтра (весь список);
 * - «+3», «+38», «380» — це лише початок коду країни, який є в усіх номерів → без фільтра;
 * - «+380…», «380…», «050…» — початок номера (порівнюємо з початком);
 * - інші цифри («245») — шматок номера де завгодно;
 * - імʼя шукається за входженням без урахування регістру.
 */
export function buildGuestSearch(raw: string): Prisma.GuestWhereInput {
  const text = raw.trim();
  if (text.length < MIN_SEARCH_LENGTH) return {};

  const digits = text.replace(/\D/g, '');
  const phoneLike = digits.length > 0 && /^[\d\s()+-]+$/.test(text);
  const or: Prisma.GuestWhereInput[] = [{ name: { contains: text, mode: 'insensitive' } }];

  if (phoneLike) {
    // Усі номери починаються з +380, тож початок коду країни нічого не відфільтровує
    if ('380'.startsWith(digits)) return {};
    if (digits.startsWith('380')) or.push({ phone: { startsWith: `+${digits}` } });
    else if (digits.startsWith('0')) or.push({ phone: { startsWith: `+380${digits.slice(1)}` } });
    else or.push({ phone: { contains: digits } });
  }
  return { OR: or };
}

export const GUEST_SORT_FIELDS = ['createdAt', 'name', 'phone'] as const;
export type GuestSortField = (typeof GUEST_SORT_FIELDS)[number];

export interface GuestFilters {
  q?: string;
  /** yes — гість підключений до Telegram, no — створений лише з панелі */
  telegram?: 'yes' | 'no';
  /** yes — є номер картки, no — картки ще немає */
  card?: 'yes' | 'no';
  /** Межі дати реєстрації (ISO date-time, включно) */
  from?: string;
  to?: string;
}

const validDate = (s?: string) => (s && Number.isFinite(Date.parse(s)) ? new Date(s) : undefined);

/** Фільтри списку гостей; усі умови поєднуються через AND, баланс не використовується (він лише в Syrve). */
export function buildGuestWhere(f: GuestFilters): Prisma.GuestWhereInput {
  const and: Prisma.GuestWhereInput[] = [buildGuestSearch(f.q ?? '')];
  if (f.telegram === 'yes') and.push({ telegramId: { not: null } });
  if (f.telegram === 'no') and.push({ telegramId: null });
  if (f.card === 'yes') and.push({ cardNumber: { not: null } });
  if (f.card === 'no') and.push({ cardNumber: null });
  const from = validDate(f.from);
  const to = validDate(f.to);
  if (from || to) and.push({ createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } });
  return { AND: and };
}

/** Сортування лише за дозволеними полями; id як другий ключ робить пагінацію стабільною. */
export function buildGuestOrder(sort: string = 'createdAt', order: string = 'desc'): Prisma.GuestOrderByWithRelationInput[] {
  const field: GuestSortField = (GUEST_SORT_FIELDS as readonly string[]).includes(sort) ? (sort as GuestSortField) : 'createdAt';
  const dir = order === 'asc' ? 'asc' : 'desc';
  return [{ [field]: dir }, { id: 'asc' }];
}
