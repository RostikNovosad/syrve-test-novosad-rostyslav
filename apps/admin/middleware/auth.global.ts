// Лендінг на «/» публічний; авторизація потрібна лише для /admin/*
export default defineNuxtRouteMiddleware(async (to) => {
  if (!to.path.startsWith('/admin')) return;
  const admin = useAdmin();
  if (admin.value === undefined) {
    try {
      admin.value = await useApi()<{ login: string; role: AdminRole }>('/auth/me');
    } catch {
      admin.value = null;
    }
  }
  const isLogin = to.path === '/admin/login';
  if (!admin.value && !isLogin) return navigateTo('/admin/login');
  if (admin.value && isLogin) return navigateTo('/admin');
  // Сторінки з definePageMeta({ roles: [...] }) доступні лише вказаним ролям
  const roles = to.meta.roles as AdminRole[] | undefined;
  if (admin.value && roles && !roles.includes(admin.value.role)) return navigateTo('/admin/guests');
});
