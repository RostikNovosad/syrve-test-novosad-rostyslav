<script setup lang="ts">
definePageMeta({ roles: ['owner'] });

const api = useApi();
const me = useAdmin();
const toast = useToast();

const items = ref<AdminUserItem[]>([]);
const PAGE_SIZE = 10;
const page = ref(1);
// Працівників небагато, тож список вантажимо цілком, а сторінки нарізаємо на клієнті
const pageItems = computed(() => items.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
const loading = ref(true);
const error = ref('');
const formOpen = ref(false);
const editing = ref<AdminUserItem | null>(null);
const removing = ref<AdminUserItem | null>(null);
const removeOpen = computed({ get: () => !!removing.value, set: (v) => !v && (removing.value = null) });
const removeLoading = ref(false);
const removeError = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    items.value = (await api<{ items: AdminUserItem[] }>('/admins')).items;
    // Після видалення останньої сторінки не лишаємось на порожній
    page.value = Math.min(page.value, Math.max(1, Math.ceil(items.value.length / PAGE_SIZE)));
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function add() {
  editing.value = null;
  formOpen.value = true;
}
function edit(u: AdminUserItem) {
  editing.value = u;
  formOpen.value = true;
}
function ask(u: AdminUserItem) {
  removeError.value = '';
  removing.value = u;
}
async function remove() {
  if (!removing.value) return;
  removeLoading.value = true;
  removeError.value = '';
  try {
    await api(`/admins/${removing.value.id}`, { method: 'DELETE' });
    toast.add({ title: 'Працівника видалено', color: 'success', icon: 'i-lucide-check' });
    removing.value = null;
    await load();
  } catch (e) {
    removeError.value = errorMessage(e);
  } finally {
    removeLoading.value = false;
  }
}
const isSelf = (u: AdminUserItem) => u.login === me.value?.login;
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-highlighted">Працівники</h1>
      </div>
      <UButton label="Додати працівника" icon="i-lucide-plus" size="lg" @click="add" />
    </div>

    <UCard :ui="{ body: 'p-0 sm:p-0' }">
      <UAlert v-if="error" class="m-4" color="error" variant="subtle" :title="error" />
      <div v-else class="overflow-x-auto" :class="loading ? 'opacity-60 transition-opacity' : ''">
        <table class="w-full text-left text-base">
          <thead class="bg-muted text-xs uppercase tracking-wide text-muted">
            <tr>
              <th class="px-4 py-2.5 font-medium">Логін</th>
              <th class="px-4 py-2.5 font-medium">Роль</th>
              <th class="hidden px-4 py-2.5 font-medium sm:table-cell">Доступ</th>
              <th class="hidden px-4 py-2.5 font-medium md:table-cell">Додано</th>
              <th class="w-24 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="u in pageItems" :key="u.id">
              <td class="px-4 py-3 font-medium text-highlighted">
                {{ u.login }}
              </td>
              <td class="px-4 py-3">
                <UBadge :label="ROLE_LABELS[u.role]" :color="u.role === 'owner' ? 'primary' : 'neutral'" variant="subtle" />
              </td>
              <td class="hidden px-4 py-3 sm:table-cell">
                <UBadge :label="u.isActive ? 'Активний' : 'Вимкнений'" :color="u.isActive ? 'success' : 'error'" variant="subtle" />
              </td>
              <td class="hidden px-4 py-3 text-muted md:table-cell">{{ formatDate(u.createdAt) }}</td>
              <td class="whitespace-nowrap px-4 py-3 text-right">
                <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" aria-label="Редагувати" @click="edit(u)" />
                <UButton v-if="!isSelf(u)" icon="i-lucide-trash-2" color="error" variant="ghost" aria-label="Видалити" @click="ask(u)" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="items.length" class="flex flex-wrap items-center justify-between gap-3 border-t border-default px-4 py-3">
        <span class="text-sm text-muted">Усього: {{ items.length }}</span>
        <UPagination v-model:page="page" :items-per-page="PAGE_SIZE" :total="items.length" :sibling-count="1" show-edges />
      </div>
    </UCard>

    <AdminFormModal v-model:open="formOpen" :user="editing" :self="!!editing && isSelf(editing)" @saved="load" />

    <UModal v-model:open="removeOpen" title="Видалити працівника?" :description="`Обліковий запис «${removing?.login}» буде видалено. Якщо в нього є історія операцій — вимкніть доступ замість видалення.`">
      <template #body>
        <UAlert v-if="removeError" color="error" variant="subtle" :title="removeError" />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Скасувати" color="neutral" variant="ghost" @click="removing = null" />
          <UButton label="Видалити" color="error" :loading="removeLoading" @click="remove" />
        </div>
      </template>
    </UModal>
  </div>
</template>
