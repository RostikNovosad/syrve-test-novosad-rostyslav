export default defineNuxtRouteMiddleware(async (to) => {
  const admin = useAdmin();
  if (admin.value === undefined) {
    try {
      admin.value = await useApi()<{ login: string }>('/auth/me');
    } catch {
      admin.value = null;
    }
  }
  if (!admin.value && to.path !== '/login') return navigateTo('/login');
  if (admin.value && to.path === '/login') return navigateTo('/');
});
