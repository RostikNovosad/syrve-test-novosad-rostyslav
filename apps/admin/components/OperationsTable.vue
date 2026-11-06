<script setup lang="ts">
// Журнал ручних операцій із пагінацією. Без customerId — загальний (з колонкою «Гість»).
const props = defineProps<{ customerId?: string; refreshKey?: number }>();

const api = useApi();
const PAGE_SIZE = 10;
const page = ref(1);
const items = ref<Operation[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
let seq = 0;

async function load() {
  const mine = ++seq;
  loading.value = true;
  error.value = '';
  try {
    const r = await api<{ items: Operation[]; total: number }>('/operations', {
      query: { customerId: props.customerId, limit: PAGE_SIZE, offset: (page.value - 1) * PAGE_SIZE },
    });
    if (mine !== seq) return; // застаріла відповідь
    items.value = r.items;
    total.value = r.total;
  } catch (e) {
    if (mine === seq) error.value = errorMessage(e);
  } finally {
    if (mine === seq) loading.value = false;
  }
}

// Новий гість або нова операція → повертаємось на першу сторінку
watch(() => [props.customerId, props.refreshKey], () => {
  page.value = 1;
  load();
}, { immediate: true });
watch(page, load);
</script>

<template>
  <div>
    <UAlert v-if="error" color="error" variant="subtle" :title="error" />
    <div v-else-if="!loading && !items.length" class="flex flex-col items-center gap-2 py-10 text-dimmed">
      <UIcon name="i-lucide-inbox" class="size-8" />
      <p class="text-sm">Операцій поки немає</p>
    </div>
    <div v-else class="overflow-x-auto" :class="loading ? 'opacity-60 transition-opacity' : ''">
      <table class="w-full table-fixed text-left text-base">
        <thead class="bg-muted text-xs uppercase tracking-wide text-muted">
          <tr>
            <th v-if="!customerId" class="px-4 py-2.5 font-medium">Гість</th>
            <th class="px-4 py-2.5 font-medium">Бонуси</th>
            <th class="px-4 py-2.5 font-medium">Причина</th>
            <th class="px-4 py-2.5 font-medium">Змінено</th>
            <th class="px-4 py-2.5 font-medium">Дата</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="o in items" :key="o.id" class="align-top">
            <td v-if="!customerId" class="px-4 py-3">
              <NuxtLink :to="`/guests/${o.customerId}`" class="font-medium text-highlighted hover:text-indigo-600 dark:hover:text-indigo-300">{{ o.guestName }}</NuxtLink>
              <div class="text-xs text-muted">{{ formatPhone(o.guestPhone) }}</div>
            </td>
            <td class="px-4 py-3">
              <span
                class="inline-block rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums"
                :class="
                  o.status !== 'done'
                    ? 'bg-muted text-dimmed line-through'
                    : o.type === 'topup'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                      : 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400'
                "
              >
                {{ o.type === 'topup' ? '+' : '−' }}{{ formatNumber(o.amount) }}
              </span>
            </td>
            <!-- Довгий текст переноситься на нові рядки, а не обрізається -->
            <td class="break-words px-4 py-3 text-toned">
              {{ o.reason }}
              <UBadge v-if="o.status === 'failed'" label="Не виконано" color="error" variant="subtle" size="sm" class="ml-1" />
              <UBadge v-else-if="o.status === 'pending'" label="Виконується" color="warning" variant="subtle" size="sm" class="ml-1" />
            </td>
            <td class="break-words px-4 py-3 text-muted">{{ o.admin }}</td>
            <td class="px-4 py-3 text-muted">{{ formatDate(o.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="total > PAGE_SIZE" class="flex items-center justify-between gap-3 border-t border-default px-4 py-3">
      <span class="hidden text-sm text-muted sm:inline">Усього: {{ total }}</span>
      <UPagination v-model:page="page" :items-per-page="PAGE_SIZE" :total="total" :sibling-count="1" show-edges />
    </div>
  </div>
</template>
