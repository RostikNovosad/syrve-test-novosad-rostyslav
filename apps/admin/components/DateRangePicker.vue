<script setup lang="ts">
// Вибір діапазону дат в одному календарі (дві дати кліком). Значення — рядки YYYY-MM-DD, порожній рядок — не вибрано.
import { CalendarDate, type DateValue } from '@internationalized/date';

const props = withDefaults(defineProps<{ placeholder?: string; maxToday?: boolean }>(), { placeholder: 'Обрати дати', maxToday: true });
const from = defineModel<string>('from', { default: '' });
const to = defineModel<string>('to', { default: '' });
const open = ref(false);

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new CalendarDate(y!, m!, d!);
};
const range = computed({
  get: () => (from.value && to.value ? { start: toDate(from.value), end: toDate(to.value) } : { start: undefined, end: undefined }),
  set: (r: { start?: DateValue | null; end?: DateValue | null }) => {
    // Застосовуємо, лише коли вибрано обидві межі
    if (r.start && r.end) {
      from.value = r.start.toString();
      to.value = r.end.toString();
      open.value = false;
    }
  },
});
const fmt = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
const label = computed(() => (from.value && to.value ? `${fmt(from.value)} — ${fmt(to.value)}` : props.placeholder));
const today = computed(() => toDate(ymd(new Date())));
const selected = computed(() => !!(from.value && to.value));
function clear() {
  from.value = '';
  to.value = '';
}
</script>

<template>
  <div class="flex w-full items-center">
    <UPopover v-model:open="open" class="min-w-0 flex-1">
      <UButton
        :label="label"
        icon="i-lucide-calendar"
        size="lg"
        color="neutral"
        variant="outline"
        :class="['w-full justify-start', selected ? 'rounded-r-none text-highlighted' : 'text-muted']"
      />
      <template #content>
        <UCalendar v-model="range" range :max-value="maxToday ? today : undefined" class="p-2" />
      </template>
    </UPopover>
    <UButton v-if="selected" icon="i-lucide-x" size="lg" color="neutral" variant="outline" class="-ml-px rounded-l-none" aria-label="Очистити дати" @click="clear" />
  </div>
</template>
