<script setup lang="ts">
const admin = useAdmin();
const route = useRoute();

// Вкладка «Системні дії» — лише для власника. Активна вкладка живе в адресі (?tab=system)
const tabs = computed(() => [
  { label: 'Бонуси', value: 'bonus', icon: 'i-lucide-coins' },
  ...(admin.value?.role === 'owner' ? [{ label: 'Системні дії', value: 'system', icon: 'i-lucide-shield' }] : []),
]);
const tab = computed({
  get: () => (route.query.tab === 'system' && admin.value?.role === 'owner' ? 'system' : 'bonus'),
  set: (v: string) => navigateTo({ query: v === 'bonus' ? {} : { tab: v } }, { replace: true }),
});
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-semibold text-highlighted">Журнал</h1>
      <p class="text-sm text-muted">
        {{ tab === 'bonus' ? 'Ручні нарахування й списання з панелі: хто, коли, скільки і чому' : 'Входи в панель, робота з гостями та керування працівниками' }}
      </p>
    </div>
    <UTabs v-if="tabs.length > 1" v-model="tab" :items="tabs" :content="false" class="w-full" />
    <UCard class="shadow-sm" :ui="{ body: 'p-0 sm:p-0' }">
      <OperationsTable v-if="tab === 'bonus'" />
      <AuditTable v-else />
    </UCard>
  </div>
</template>
