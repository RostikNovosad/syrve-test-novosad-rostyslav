const nf = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 });
export const formatNumber = (n: number) => nf.format(n);

/** 1 бонус, 2 бонуси, 5 бонусів */
export function bonusWord(n: number): string {
  const int = Math.abs(Math.trunc(n));
  const last = int % 10;
  const lastTwo = int % 100;
  if (n % 1 !== 0) return 'бонуса';
  if (lastTwo >= 11 && lastTwo <= 14) return 'бонусів';
  if (last === 1) return 'бонус';
  if (last >= 2 && last <= 4) return 'бонуси';
  return 'бонусів';
}

const timeFmt = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('uk-UA', { dateStyle: 'short' });
/** «19:34 06.11.26» — спочатку час, потім дата */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${timeFmt.format(d)} ${dayFmt.format(d)}`;
}

/** +380501234567 → +38 050 123 45 67 */
export function formatPhone(p: string): string {
  const m = /^\+38(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(p);
  return m ? `+38 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : p;
}
