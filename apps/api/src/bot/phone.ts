/**
 * Нормалізує український номер до +380XXXXXXXXX.
 * Приймає: +380501234567, 380501234567, 0501234567, 050 123 45 67 тощо.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let national: string;
  if (digits.length === 12 && digits.startsWith('380')) national = digits.slice(3);
  else if (digits.length === 10 && digits.startsWith('0')) national = digits.slice(1);
  else return null;
  return `+380${national}`;
}
