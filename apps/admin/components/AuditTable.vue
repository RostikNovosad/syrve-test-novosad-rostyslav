<script setup lang="ts">
// Журнал системних дій адміністраторів (лише для власника)
const api = useApi();
const PAGE_SIZE = 10;
const page = ref(1);
const items = ref<AuditEntry[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
let seq = 0;

async function load() {
  const mine = ++seq;
  loading.value = true;
  error.value = '';
  try {
    const r = await api<{ items: AuditEntry[]; total: number }>('/audit', {
      query: { limit: PAGE_SIZE, offset: (page.value - 1) * PAGE_SIZE },
    });
    if (mine !== seq) return;
    items.value = r.items;
    total.value = r.total;
  } catch (e) {
    if (mine === seq) error.value = errorMessage(e);
  } finally {
    if (mine === seq) loading.value = false;
  }
}
watch(page, load, { immediate: true });

const FIELD_LABELS: Record<string, string> = { name: 'імʼя', phone: 'телефон', login: 'логін', role: 'роль', isActive: 'доступ', password: 'пароль' };

/** { name: ['А','Б'] } → «імʼя: А → Б» */
function describe(e: AuditEntry): string {
  const d = e.details as Record<string, unknown> | null;
  if (!d) return '';
  return Object.entries(d)
    .map(([k, v]) => (Array.isArray(v) ? `${FIELD_LABELS[k] ?? k}: ${v[0]} → ${v[1]}` : `${FIELD_LABELS[k] ?? k}: ${v}`))
    .join('; ');
}
</script>

<template>
  <div>
    <UAlert v-if="error" color="error" variant="subtle" :title="error" />
    <div v-else-if="!loading && !items.length" class="flex flex-col items-center gap-2 py-10 text-dimmed">
      <UIcon name="i-lucide-inbox" class="size-8" />
      <p class="text-sm">Дій поки немає</p>
    </div>
    <div v-else class="overflow-x-auto" :class="loading ? 'opacity-60 transition-opacity' : ''">
      <table class="w-full table-fixed text-left text-base">
        <thead class="bg-muted text-xs uppercase tracking-wide text-muted">
          <tr>
            <th class="px-4 py-2.5 font-medium">Дія</th>
            <th class="px-4 py-2.5 font-medium">Обʼєкт</th>
            <th class="px-4 py-2.5 font-medium">Хто</th>
            <th class="px-4 py-2.5 font-medium">Дата</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="e in items" :key="e.id" class="align-top">
            <td class="px-4 py-3">
              <div class="flex items-center gap-2 font-medium text-highlighted">
                <UIcon :name="AUDIT_ACTIONS[e.action]?.icon ?? 'i-lucide-activity'" class="size-4 shrink-0 text-muted" />
                {{ AUDIT_ACTIONS[e.action]?.label ?? e.action }}
              </div>
            </td>
            <td class="break-words px-4 py-3 text-toned">
              <template v-if="e.targetLabel">
                <NuxtLink v-if="e.targetType === 'guest' && e.targetId" :to="`/guests/${e.targetId}`" class="hover:text-indigo-600 dark:hover:text-indigo-300">{{ e.targetLabel }}</NuxtLink>
                <span v-else>{{ e.targetLabel }}</span>
              </template>
              <span v-else class="text-dimmed">—</span>
              <div v-if="describe(e)" class="text-xs text-muted">{{ describe(e) }}</div>
            </td>
            <td class="break-words px-4 py-3 text-muted">{{ e.admin }}</td>
            <td class="px-4 py-3 text-muted">{{ formatDate(e.createdAt) }}</td>
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
