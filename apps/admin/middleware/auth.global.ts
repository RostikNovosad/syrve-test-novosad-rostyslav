export default defineNuxtRouteMiddleware(async (to) => {
  const admin = useAdmin();
  if (admin.value === undefined) {
    try {
      admin.value = await useApi()<{ login: string; role: AdminRole }>('/auth/me');
    } catch {
      admin.value = null;
    }
  }
  if (!admin.value && to.path !== '/login') return navigateTo('/login');
  if (admin.value && to.path === '/login') return navigateTo('/');
  // Сторінки з definePageMeta({ roles: [...] }) доступні лише вказаним ролям
  const roles = to.meta.roles as AdminRole[] | undefined;
  if (admin.value && roles && !roles.includes(admin.value.role)) return navigateTo('/guests');
});
