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
