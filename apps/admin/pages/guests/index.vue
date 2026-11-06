<script setup lang="ts">
const api = useApi();
const PAGE_SIZE = 10;
const MIN_SEARCH = 3; // як і на сервері: коротший рядок не фільтрує список
const DEBOUNCE_MS = 400;

const q = ref('');
type Tri = 'all' | 'yes' | 'no';
const telegram = ref<Tri>('all');
const card = ref<Tri>('all');
const from = ref(''); // YYYY-MM-DD
const to = ref('');
const sort = ref<'createdAt' | 'name' | 'phone'>('createdAt');
const order = ref<'asc' | 'desc'>('desc');
const triItems = (yes: string, no: string) => [
  { label: 'Усі', value: 'all' },
  { label: yes, value: 'yes' },
  { label: no, value: 'no' },
];
const hasFilters = computed(() => telegram.value !== 'all' || card.value !== 'all' || !!from.value || !!to.value);
// Межі дати — за місцевим часом користувача, на сервер йдуть як ISO
const dayStart = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const dayEnd = (d: string) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : undefined);

function sortBy(field: typeof sort.value) {
  if (sort.value === field) order.value = order.value === 'asc' ? 'desc' : 'asc';
  else {
    sort.value = field;
    order.value = field === 'createdAt' ? 'desc' : 'asc';
  }
}
const sortIcon = (field: typeof sort.value) =>
  sort.value !== field ? 'i-lucide-chevrons-up-down' : order.value === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down';
function resetFilters() {
  telegram.value = card.value = 'all';
  from.value = to.value = '';
}
// Пошуковий рядок, який реально йде на сервер; поки він коротший за 3 символи, показуємо весь список
const active = computed(() => (q.value.trim().length >= MIN_SEARCH ? q.value.trim() : ''));
const tooShort = computed(() => q.value.trim().length > 0 && q.value.trim().length < MIN_SEARCH);
const page = ref(1);
const items = ref<GuestListItem[]>([]);
const total = ref(0);
const loading = ref(true);
const error = ref('');
const formOpen = ref(false);
const finding = ref(false);
const findError = ref('');
let seq = 0;

async function load() {
  const mine = ++seq;
  loading.value = true;
  error.value = '';
  try {
    const r = await api<{ items: GuestListItem[]; total: number }>('/guests', {
      query: {
        q: active.value || undefined,
        telegram: telegram.value === 'all' ? undefined : telegram.value,
        card: card.value === 'all' ? undefined : card.value,
        from: dayStart(from.value),
        to: dayEnd(to.value),
        sort: sort.value,
        order: order.value,
        page: page.value,
        limit: PAGE_SIZE,
      },
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

// Дебаунс: запит йде, коли користувач зробив паузу, і лише якщо змінився сам пошуковий рядок
let timer: ReturnType<typeof setTimeout>;
watch(active, () => {
  findError.value = '';
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (page.value === 1) load();
    else page.value = 1;
  }, DEBOUNCE_MS);
});
watch(page, load);
// Фільтри й сортування застосовуються одразу; результат завжди з першої сторінки
watch([telegram, card, from, to, sort, order], () => {
  if (page.value === 1) load();
  else page.value = 1;
});
onMounted(load);
onBeforeUnmount(() => clearTimeout(timer));

const looksLikePhone = computed(() => q.value.replace(/\D/g, '').length >= 9);

// Гостя може не бути в списку (створений у кабінеті Syrve): шукаємо в Syrve за номером
async function findInSyrve() {
  finding.value = true;
  findError.value = '';
  try {
    const g = await api<Guest>('/guests/lookup', { query: { phone: q.value } });
    await navigateTo(`/guests/${g.customerId}`);
  } catch (e) {
    findError.value = errorMessage(e);
  } finally {
    finding.value = false;
  }
}

function create() {
  formOpen.value = true;
}

async function onSaved(id: string) {
  await navigateTo(`/guests/${id}`);
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold text-highlighted">Гості</h1>
        <p class="text-sm text-muted">Зареєстровані в програмі лояльності</p>
      </div>
      <UButton label="Додати гостя" icon="i-lucide-plus" size="lg" @click="create" />
    </div>

    <UCard class="shadow-sm" :ui="{ body: 'p-0 sm:p-0' }">
      <div class="border-b border-default p-4">
        <UInput
          v-model="q"
          icon="i-lucide-search"
          size="lg"
          class="w-full"
          placeholder="Пошук за номером або імʼям"
          autocomplete="off"
        />
        <p v-if="tooShort" class="mt-2 text-sm text-muted">Введіть щонайменше {{ MIN_SEARCH }} символи, щоб почати пошук</p>
        <div class="mt-3 flex flex-wrap items-end gap-3">
          <UFormField label="Telegram" size="sm">
            <USelect v-model="telegram" :items="triItems('Підключено', 'Немає')" value-key="value" class="w-40" />
          </UFormField>
          <UFormField label="Картка" size="sm">
            <USelect v-model="card" :items="triItems('Є', 'Немає')" value-key="value" class="w-32" />
          </UFormField>
          <UFormField label="Зареєстровано від" size="sm">
            <UInput v-model="from" type="date" :max="to || undefined" class="w-40" />
          </UFormField>
          <UFormField label="до" size="sm">
            <UInput v-model="to" type="date" :min="from || undefined" class="w-40" />
          </UFormField>
          <UButton v-if="hasFilters" label="Скинути" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="resetFilters" />
        </div>
      </div>

      <UAlert v-if="error" class="m-4" color="error" variant="subtle" :title="error" />

      <div v-else-if="!loading && !items.length" class="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <UIcon name="i-lucide-user-search" class="size-9 text-dimmed" />
        <p class="text-sm text-muted">{{ active || hasFilters ? 'Нікого не знайдено за цими умовами' : 'Гостей поки немає' }}</p>
        <UButton v-if="looksLikePhone" label="Шукати цей номер у Syrve" icon="i-lucide-search" variant="soft" :loading="finding" @click="findInSyrve" />
        <p v-if="findError" class="text-sm text-rose-600">{{ findError }}</p>
      </div>

      <div v-else class="overflow-x-auto" :class="loading ? 'opacity-60 transition-opacity' : ''">
        <table class="w-full text-left text-base">
          <thead class="bg-muted text-xs uppercase tracking-wide text-muted">
            <tr>
              <th class="px-4 py-2.5 font-medium">
                <button class="inline-flex items-center gap-1 uppercase hover:text-highlighted" @click="sortBy('name')">Гість <UIcon :name="sortIcon('name')" class="size-3.5" /></button>
              </th>
              <th class="px-4 py-2.5 font-medium">
                <button class="inline-flex items-center gap-1 uppercase hover:text-highlighted" @click="sortBy('phone')">Телефон <UIcon :name="sortIcon('phone')" class="size-3.5" /></button>
              </th>
              <th class="hidden px-4 py-2.5 font-medium md:table-cell">Картка</th>
              <th class="hidden px-4 py-2.5 font-medium lg:table-cell">
                <button class="inline-flex items-center gap-1 uppercase hover:text-highlighted" @click="sortBy('createdAt')">Зареєстровано <UIcon :name="sortIcon('createdAt')" class="size-3.5" /></button>
              </th>
              <th class="hidden px-4 py-2.5 font-medium sm:table-cell">Telegram</th>
              <th class="w-12 px-4 py-2.5" />
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr
              v-for="g in items"
              :key="g.customerId"
              class="cursor-pointer transition-colors hover:bg-indigo-50/60 dark:hover:bg-white/5"
              @click="navigateTo(`/guests/${g.customerId}`)"
            >
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold uppercase text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                    {{ g.name?.[0] ?? '?' }}
                  </span>
                  <span class="whitespace-nowrap font-medium text-highlighted">{{ g.name || 'Без імені' }}</span>
                </div>
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-toned">{{ formatPhone(g.phone) }}</td>
              <td class="hidden px-4 py-3 text-muted md:table-cell">{{ g.cardNumber ?? '—' }}</td>
              <td class="hidden whitespace-nowrap px-4 py-3 text-muted lg:table-cell">{{ formatDate(g.createdAt) }}</td>
              <td class="hidden px-4 py-3 sm:table-cell">
                <UBadge :label="g.inTelegram ? 'Підключено' : 'Немає'" :color="g.inTelegram ? 'info' : 'neutral'" variant="subtle" />
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-right">
                <UIcon name="i-lucide-chevron-right" class="size-5 align-middle text-dimmed" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="total > PAGE_SIZE" class="flex items-center justify-between gap-3 border-t border-default px-4 py-3">
        <span class="hidden text-sm text-muted sm:inline">Усього: {{ total }}</span>
        <UPagination v-model:page="page" :items-per-page="PAGE_SIZE" :total="total" :sibling-count="1" show-edges />
      </div>
    </UCard>

    <GuestFormModal v-model:open="formOpen" @saved="onSaved" />
  </div>
</template>
