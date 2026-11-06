export interface Guest {
  customerId: string;
  name: string;
  phone: string;
  cardNumber: string | null;
  /** null — гість не підключений до програми лояльності */
  balance: number | null;
  inTelegram: boolean;
}

export interface GuestListItem {
  customerId: string;
  name: string;
  phone: string;
  cardNumber: string | null;
  inTelegram: boolean;
  createdAt: string;
}

export interface Operation {
  id: string;
  createdAt: string;
  type: 'topup' | 'chargeoff';
  amount: number;
  reason: string;
  status: 'pending' | 'done' | 'failed';
  error: string | null;
  guestName: string;
  guestPhone: string;
  customerId: string;
  admin: string;
}

export function useAdmin() {
  // undefined — ще не перевіряли сесію, null — не авторизований
  return useState<{ login: string } | null | undefined>('admin', () => undefined);
}

export function useApi() {
  const admin = useAdmin();
  return $fetch.create({
    baseURL: '/api/admin',
    timeout: 15_000, // якщо API не запущений, dev-проксі може висіти без відповіді
    headers: { 'x-requested-with': 'admin-panel' },
    onResponseError({ request, response }) {
      if (response.status === 401 && !String(request).includes('/auth/')) {
        admin.value = null;
        navigateTo('/login');
      }
    },
  });
}

/** Текст помилки з відповіді API (вже українською) */
export function errorMessage(e: unknown): string {
  const data = (e as { data?: { error?: string } })?.data;
  return data?.error ?? 'Не вдалося звʼязатися із сервером. Спробуйте ще раз.';
}
