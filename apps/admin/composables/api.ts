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

export type AdminRole = 'owner' | 'manager';
export const ROLE_LABELS: Record<AdminRole, string> = { owner: 'Власник', manager: 'Менеджер' };

export function useAdmin() {
  // undefined — ще не перевіряли сесію, null — не авторизований
  return useState<{ login: string; role: AdminRole } | null | undefined>('admin', () => undefined);
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

export interface AuditEntry {
  id: string;
  createdAt: string;
  admin: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  details: Record<string, [string, string]> | { role?: string } | null;
}

export const AUDIT_ACTIONS: Record<string, { label: string; icon: string }> = {
  'auth.login': { label: 'Вхід у панель', icon: 'i-lucide-log-in' },
  'guest.create': { label: 'Створено гостя', icon: 'i-lucide-user-plus' },
  'guest.update': { label: 'Змінено гостя', icon: 'i-lucide-user-pen' },
  'admin.create': { label: 'Додано працівника', icon: 'i-lucide-shield-plus' },
  'admin.update': { label: 'Змінено працівника', icon: 'i-lucide-shield-check' },
  'admin.delete': { label: 'Видалено працівника', icon: 'i-lucide-shield-x' },
};

export interface AdminUserItem {
  id: string;
  login: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
}
