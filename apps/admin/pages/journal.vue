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
    </div>
    <!-- Явні вкладки: контейнер із фоном і рамкою, активна залита акцентним кольором -->
    <UTabs
      v-if="tabs.length > 1"
      v-model="tab"
      :items="tabs"
      :content="false"
      :ui="{
        root: 'items-start',
        list: 'w-full border border-default bg-default p-1 sm:w-fit',
        trigger: 'px-5 py-2 text-sm font-medium text-toned hover:bg-elevated data-[state=active]:text-inverted data-[state=active]:hover:bg-transparent',
        indicator: 'rounded-md',
      }"
    />
    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <OperationsTable v-if="tab === 'bonus'" />
      <AuditTable v-else />
    </UCard>
  </div>
</template>
