<script setup lang="ts">
const props = defineProps<{ guest: Guest; type: 'topup' | 'chargeoff' }>();
const emit = defineEmits<{ done: [guest: Guest] }>();
const open = defineModel<boolean>('open', { required: true });

const api = useApi();
const toast = useToast();

const isTopup = computed(() => props.type === 'topup');
const amount = ref<number | undefined>();
const reason = ref('');
const loading = ref(false);
const error = ref('');

const quickReasons = computed(() =>
  isTopup.value ? ['Подарунок', 'Компенсація', 'Акція'] : ['Оплата бонусами', 'Виправлення помилки'],
);

watch(open, (v) => {
  if (v) {
    amount.value = undefined;
    reason.value = '';
    error.value = '';
  }
});

const balance = computed(() => props.guest.balance ?? 0);
const tooMuch = computed(() => !isTopup.value && (amount.value ?? 0) > balance.value);
const balanceAfter = computed(() =>
  amount.value && amount.value > 0 ? balance.value + (isTopup.value ? amount.value : -amount.value) : null,
);
const valid = computed(() => !!amount.value && amount.value > 0 && reason.value.trim().length >= 3 && !tooMuch.value);

async function submit() {
  if (!valid.value || loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    const updated = await api<Guest>(`/guests/${props.guest.customerId}/operations`, {
      method: 'POST',
      body: { type: props.type, amount: Number(amount.value), reason: reason.value.trim() },
    });
    toast.add({
      title: `${isTopup.value ? 'Нараховано' : 'Списано'} ${formatNumber(Number(amount.value))} ${bonusWord(Number(amount.value))}`,
      description: `Баланс: ${formatNumber(updated.balance ?? 0)}`,
      color: 'success',
      icon: 'i-lucide-check',
    });
    open.value = false;
    emit('done', updated);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="isTopup ? 'Нарахувати бонуси' : 'Списати бонуси'" :description="`${guest.name} · зараз ${formatNumber(balance)} ${bonusWord(balance)}`">
    <template #body>
      <form class="space-y-4" @submit.prevent="submit">
        <UFormField label="Кількість бонусів" :error="tooMuch ? `Максимум для списання — ${formatNumber(balance)}` : undefined">
          <UInput v-model.number="amount" type="number" :min="0" step="any" inputmode="decimal" autofocus size="xl" class="w-full" placeholder="0" />
        </UFormField>
        <UFormField label="Причина" hint="обовʼязково">
          <UInput v-model="reason" size="lg" class="w-full" maxlength="200" placeholder="Напр. подарунок на день народження" />
          <div class="mt-2 flex flex-wrap gap-1.5">
            <UButton v-for="r in quickReasons" :key="r" :label="r" size="xs" color="neutral" variant="outline" @click="reason = r" />
          </div>
        </UFormField>
        <p v-if="balanceAfter !== null && !tooMuch" class="text-sm text-toned">
          Баланс після операції: <b>{{ formatNumber(balanceAfter) }}</b>
        </p>
        <UAlert v-if="error" color="error" variant="subtle" :title="error" />
        <button type="submit" class="hidden" />
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Скасувати" color="neutral" variant="ghost" @click="open = false" />
        <UButton
          :label="isTopup ? 'Нарахувати' : 'Списати'"
          :color="isTopup ? 'success' : 'error'"
          :loading="loading"
          :disabled="!valid"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
