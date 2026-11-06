<script setup lang="ts">
const api = useApi();
const route = useRoute();
const id = computed(() => String(route.params.id));

const guest = ref<Guest | null>(null);
const loading = ref(true);
const error = ref('');
const opType = ref<'topup' | 'chargeoff'>('topup');
const opOpen = ref(false);
const editOpen = ref(false);
const journalKey = ref(0);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    guest.value = await api<Guest>(`/guests/${id.value}`);
  } catch (e) {
    guest.value = null;
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
watch(id, load, { immediate: true });

function startOperation(type: 'topup' | 'chargeoff') {
  opType.value = type;
  opOpen.value = true;
}

function onOperation(updated: Guest) {
  guest.value = updated;
  journalKey.value++;
}
</script>

<template>
  <div class="space-y-5">
    <UButton to="/guests" label="Усі гості" icon="i-lucide-arrow-left" color="neutral" variant="link" class="-ml-2.5 px-2.5" />

    <UAlert v-if="error" color="error" variant="subtle" :title="error" />
    <div v-else-if="loading && !guest" class="py-16 text-center text-sm text-dimmed">Завантаження…</div>

    <template v-if="guest">
      <UCard class="shadow-sm">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-semibold text-highlighted">Гість</h2>
            <UButton label="Редагувати" icon="i-lucide-pencil" color="neutral" variant="outline" @click="editOpen = true" />
          </div>
        </template>

        <!-- Ряд 1: аватар і імʼя зліва, баланс справа -->
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div class="flex min-w-0 items-center gap-4">
            <span class="flex size-14 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xl font-semibold uppercase text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
              {{ guest.name?.[0] ?? '?' }}
            </span>
            <h1 class="truncate text-2xl font-semibold text-highlighted">{{ guest.name || 'Без імені' }}</h1>
          </div>

          <div class="rounded-xl bg-indigo-50 px-6 py-3 text-center dark:bg-indigo-500/10">
            <template v-if="guest.balance !== null">
              <div class="text-4xl font-semibold tabular-nums text-indigo-700 dark:text-indigo-300">{{ formatNumber(guest.balance) }}</div>
              <div class="text-sm text-indigo-600/80 dark:text-indigo-300/70">{{ bonusWord(guest.balance) }} на рахунку</div>
            </template>
            <div v-else class="text-sm text-muted">Не в програмі</div>
          </div>
        </div>

        <!-- Ряд 2: додаткова інформація одним рядком «підпис: значення» -->
        <!-- -mx компенсують відступи картки, щоб розділювач був на всю її ширину -->
        <div class="-mx-4 mt-6 grid gap-x-6 gap-y-2 border-t border-default px-4 pt-5 text-sm sm:-mx-6 sm:grid-cols-3 sm:px-6 lg:grid-cols-[repeat(3,auto)] lg:justify-between">
          <div class="flex flex-wrap items-center gap-x-2 lg:flex-nowrap">
            <span class="whitespace-nowrap text-muted">Телефон:</span>
            <span class="whitespace-nowrap font-medium text-highlighted">{{ formatPhone(guest.phone) }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-x-2 lg:flex-nowrap">
            <span class="whitespace-nowrap text-muted">Картка:</span>
            <span class="whitespace-nowrap font-medium text-highlighted">{{ guest.cardNumber ?? 'немає' }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-x-2 lg:flex-nowrap">
            <span class="whitespace-nowrap text-muted">Telegram:</span>
            <UBadge :label="guest.inTelegram ? 'Підключено' : 'Не підключено'" :color="guest.inTelegram ? 'info' : 'neutral'" variant="subtle" />
          </div>
        </div>
      </UCard>

      <UCard class="shadow-sm">
        <template #header>
          <h2 class="font-semibold text-highlighted">Керування бонусами</h2>
        </template>
        <UAlert
          v-if="guest.balance === null"
          color="warning"
          variant="subtle"
          title="Гість ще не підключений до програми лояльності"
          description="Нарахування й списання недоступні."
        />
        <div v-else class="flex flex-wrap items-center gap-3">
          <UButton label="Нарахувати" icon="i-lucide-plus" size="lg" color="success" @click="startOperation('topup')" />
          <UButton label="Списати" icon="i-lucide-minus" size="lg" color="error" variant="soft" :disabled="guest.balance <= 0" @click="startOperation('chargeoff')" />
          <span v-if="guest.balance <= 0" class="text-sm text-muted">Списувати нічого — баланс порожній</span>
        </div>
      </UCard>

      <UCard class="shadow-sm" :ui="{ body: 'p-0 sm:p-0' }">
        <template #header>
          <h2 class="font-semibold text-highlighted">Історія операцій</h2>
        </template>
        <OperationsTable :customer-id="guest.customerId" :refresh-key="journalKey" />
      </UCard>

      <OperationModal v-model:open="opOpen" :guest="guest" :type="opType" @done="onOperation" />
      <GuestFormModal v-model:open="editOpen" :guest="guest" @saved="load" />
    </template>
  </div>
</template>
