<script setup lang="ts">
const admin = useAdmin();
const api = useApi();
const route = useRoute();
const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === 'dark');
const toggleTheme = () => (colorMode.preference = isDark.value ? 'light' : 'dark');

// roles — для яких ролей пункт видно (без roles — усім)
const allNav: { label: string; to: string; icon: string; roles?: AdminRole[] }[] = [
  { label: 'Працівники', to: '/admins', icon: 'i-lucide-shield-user', roles: ['owner'] },
  { label: 'Статистика', to: '/stats', icon: 'i-lucide-chart-column', roles: ['owner'] },
  { label: 'Гості', to: '/guests', icon: 'i-lucide-users' },
  { label: 'Журнал', to: '/journal', icon: 'i-lucide-scroll-text' },
];
const nav = computed(() => allNav.filter((n) => !n.roles || (admin.value && n.roles.includes(admin.value.role))));

// Десктоп: згорнутий/розгорнутий сайдбар (памʼятаємо вибір). Мобайл: висувне меню поверх сторінки.
const collapsed = useCookie<boolean>('sidebar-collapsed', { default: () => false, maxAge: 60 * 60 * 24 * 365 });
const mobileOpen = ref(false);

function toggle() {
  if (window.matchMedia('(min-width: 1024px)').matches) collapsed.value = !collapsed.value;
  else mobileOpen.value = !mobileOpen.value;
}
watch(() => route.fullPath, () => (mobileOpen.value = false));

const isActive = (to: string) => route.path === to || route.path.startsWith(`${to}/`);

async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  admin.value = null;
  await navigateTo('/login');
}
</script>

<template>
  <div class="flex h-screen flex-col bg-slate-100 dark:bg-slate-950">
    <!-- Хедер на всю ширину: лого зліва, перемикач теми справа -->
    <header class="z-40 flex h-14 shrink-0 items-center gap-3 border-b border-default bg-default px-4">
      <!-- Лише мобайл: сайдбар прихований, тож відкриваємо його звідси -->
      <UButton class="lg:hidden" icon="i-lucide-menu" color="neutral" variant="ghost" aria-label="Меню" @click="mobileOpen = true" />
      <NuxtLink to="/guests" class="flex items-center gap-2.5">
        <span class="flex size-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <UIcon name="i-lucide-gem" class="size-4.5" />
        </span>
        <span class="text-base font-semibold tracking-tight text-highlighted">Лояльність</span>
      </NuxtLink>
      <UButton
        class="ml-auto"
        :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
        color="neutral"
        variant="ghost"
        :aria-label="isDark ? 'Світла тема' : 'Темна тема'"
        :title="isDark ? 'Світла тема' : 'Темна тема'"
        @click="toggleTheme"
      />
    </header>

    <div class="relative flex min-h-0 flex-1">
      <div v-if="mobileOpen" class="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" @click="mobileOpen = false" />

      <!-- Сайдбар. Усі елементи мають однакові відступи в обох станах, текст лише ховається, тому нічого не «стрибає» -->
      <aside
        class="fixed bottom-0 left-0 top-14 z-40 flex w-64 flex-col overflow-hidden border-r border-default bg-default px-3 pb-3 pt-2 text-toned transition-[width,transform] duration-200 lg:static lg:z-auto lg:translate-x-0"
        :class="[mobileOpen ? 'translate-x-0' : '-translate-x-full', collapsed ? 'is-collapsed lg:w-[4.5rem]' : 'lg:w-64']"
      >
        <button class="item mb-1 hover:bg-elevated" :title="collapsed ? 'Розгорнути' : 'Згорнути'" @click="toggle">
          <!-- Мобайл: кнопка закриває висувне меню; десктоп: згортає/розгортає -->
          <UIcon name="i-lucide-x" class="size-5 shrink-0 lg:hidden" />
          <UIcon :name="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'" class="hidden size-5 shrink-0 lg:block" />
          <span class="label lg:hidden">Закрити меню</span>
          <span class="label hidden lg:inline">{{ collapsed ? 'Розгорнути' : 'Згорнути' }}</span>
        </button>

        <nav class="flex flex-1 flex-col gap-1">
          <NuxtLink
            v-for="n in nav"
            :key="n.to"
            :to="n.to"
            :title="n.label"
            class="item"
            :class="isActive(n.to) ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-white' : 'hover:bg-elevated'"
          >
            <UIcon :name="n.icon" class="size-5 shrink-0" />
            <span class="label">{{ n.label }}</span>
          </NuxtLink>
        </nav>

        <!-- Користувач і вихід: картка завжди 48px заввишки, у згорнутому стані лише ширина менша -->
        <div class="space-y-1">
          <div class="flex h-12 items-center gap-3 overflow-hidden rounded-xl bg-elevated p-1.5" :title="admin?.login">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold uppercase text-white">
              {{ admin?.login?.[0] ?? '?' }}
            </span>
            <div class="label min-w-0 leading-tight">
              <div class="truncate text-sm font-medium text-highlighted">{{ admin?.login }}</div>
              <div class="text-xs text-muted">{{ admin ? ROLE_LABELS[admin.role] : '' }}</div>
            </div>
          </div>
          <button class="item hover:bg-elevated" title="Вийти" @click="logout">
            <UIcon name="i-lucide-log-out" class="size-5 shrink-0" />
            <span class="label">Вийти</span>
          </button>
        </div>
      </aside>

      <main class="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div class="mx-auto max-w-5xl">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* Іконка завжди на одній відстані від лівого краю (центр = 36px при ширині 72px), тому в згорнутому стані вона по центру */
.item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.75rem;
  overflow: hidden;
  white-space: nowrap;
  border-radius: 0.5rem;
  padding: 0.625rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color 0.15s, color 0.15s;
}
.label {
  white-space: nowrap;
  transition: opacity 0.15s;
}
/* У згорнутому стані підписи ховаються плавно (на десктопі), а не обрізаються на півслові */
@media (min-width: 1024px) {
  .is-collapsed .label {
    opacity: 0;
  }
}
</style>
