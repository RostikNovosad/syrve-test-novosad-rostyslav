<script setup lang="ts">
definePageMeta({ roles: ['owner'] });

const api = useApi();
const presets = [
  { label: '7 днів', days: 7 },
  { label: '30 днів', days: 30 },
  { label: '90 днів', days: 90 },
];

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => ymd(new Date(Date.now() - (n - 1) * 86_400_000));

const from = ref(daysAgo(30));
const to = ref(ymd(new Date()));
const stats = ref<Stats | null>(null);
const loading = ref(true);
const error = ref('');
let seq = 0;

const activePreset = computed(() => presets.find((p) => from.value === daysAgo(p.days) && to.value === ymd(new Date()))?.days);
const setPreset = (days: number) => {
  from.value = daysAgo(days);
  to.value = ymd(new Date());
};

async function load() {
  if (!from.value || !to.value) return;
  const mine = ++seq;
  loading.value = true;
  error.value = '';
  try {
    // Межі дня — за місцевим часом користувача
    const r = await api<Stats>('/stats', {
      query: { from: new Date(`${from.value}T00:00:00`).toISOString(), to: new Date(`${to.value}T23:59:59.999`).toISOString() },
    });
    if (mine === seq) stats.value = r;
  } catch (e) {
    if (mine === seq) error.value = errorMessage(e);
  } finally {
    if (mine === seq) loading.value = false;
  }
}
watch([from, to], load, { immediate: true });

// Графік по днях: стовпці нарахувань і списань, висота — від найбільшого значення
const maxValue = computed(() => Math.max(1, ...(stats.value?.daily ?? []).flatMap((d) => [d.earned, d.spent])));
const pct = (v: number) => `${Math.max(v > 0 ? 3 : 0, (v / maxValue.value) * 100)}%`;
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });

const cards = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { label: 'Гостей усього', value: formatNumber(s.guests.total), hint: `${formatNumber(s.guests.inTelegram)} у Telegram`, icon: 'i-lucide-users', tone: 'indigo' },
    { label: 'Нові реєстрації', value: formatNumber(s.guests.new), hint: `${formatNumber(s.guests.newInTelegram)} у Telegram`, icon: 'i-lucide-user-plus', tone: 'sky' },
    { label: 'Нараховано', value: `+${formatNumber(s.bonuses.earned)}`, hint: `${bonusWord(s.bonuses.earned)} за період`, icon: 'i-lucide-trending-up', tone: 'emerald' },
    { label: 'Списано', value: `−${formatNumber(s.bonuses.spent)}`, hint: `${bonusWord(s.bonuses.spent)} за період`, icon: 'i-lucide-trending-down', tone: 'rose' },
  ];
});
const TONES: Record<string, string> = {
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
};
</script>

<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-semibold text-highlighted">Статистика</h1>
      <p class="text-sm text-muted">Гості та рух бонусів за період — з панелі, кабінету Syrve й каси</p>
    </div>

    <UCard class="shadow-sm">
      <div class="flex flex-wrap items-end gap-3">
        <div class="flex gap-1.5">
          <UButton
            v-for="p in presets"
            :key="p.days"
            :label="p.label"
            size="sm"
            :color="activePreset === p.days ? 'primary' : 'neutral'"
            :variant="activePreset === p.days ? 'solid' : 'outline'"
            @click="setPreset(p.days)"
          />
        </div>
        <UFormField label="Від" size="sm"><UInput v-model="from" type="date" :max="to" class="w-40" /></UFormField>
        <UFormField label="До" size="sm"><UInput v-model="to" type="date" :min="from" :max="ymd(new Date())" class="w-40" /></UFormField>
      </div>
    </UCard>

    <UAlert v-if="error" color="error" variant="subtle" :title="error" />

    <template v-else-if="stats">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" :class="loading ? 'opacity-60 transition-opacity' : ''">
        <UCard v-for="c in cards" :key="c.label" class="shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm text-muted">{{ c.label }}</p>
              <p class="mt-1 text-2xl font-semibold tabular-nums text-highlighted">{{ c.value }}</p>
              <p class="mt-1 text-xs text-muted">{{ c.hint }}</p>
            </div>
            <span class="flex size-9 shrink-0 items-center justify-center rounded-lg" :class="TONES[c.tone]"><UIcon :name="c.icon" class="size-5" /></span>
          </div>
        </UCard>
      </div>

      <UCard class="shadow-sm">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="font-semibold text-highlighted">Нарахування і списання по днях</h2>
            <p class="text-xs text-muted">
              Баланс за період: {{ stats.bonuses.net >= 0 ? '+' : '−' }}{{ formatNumber(Math.abs(stats.bonuses.net)) }} · {{ formatNumber(stats.bonuses.transactions) }} транзакцій
            </p>
          </div>
          <div class="flex gap-4 text-xs text-muted">
            <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-emerald-500" />Нараховано</span>
            <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-rose-500" />Списано</span>
          </div>
        </div>
        <div class="flex h-48 items-end gap-px sm:gap-0.5" role="img" aria-label="Нарахування і списання по днях">
          <div v-for="d in stats.daily" :key="d.date" class="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-px">
            <div class="w-full max-w-3 rounded-t-sm bg-emerald-500" :style="{ height: pct(d.earned) }" />
            <div class="w-full max-w-3 rounded-t-sm bg-rose-500" :style="{ height: pct(d.spent) }" />
            <div class="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow group-hover:block">
              {{ dayLabel(d.date) }}: +{{ formatNumber(d.earned) }} / −{{ formatNumber(d.spent) }}<template v-if="d.newGuests"> · нових гостей: {{ d.newGuests }}</template>
            </div>
          </div>
        </div>
        <div class="mt-2 flex justify-between text-xs text-muted">
          <span>{{ dayLabel(stats.daily[0]!.date) }}</span>
          <span>{{ dayLabel(stats.daily[stats.daily.length - 1]!.date) }}</span>
        </div>
        <p class="mt-3 text-xs text-dimmed">Нові операції зʼявляються тут із невеликою затримкою: сервіс підтягує їх із Syrve періодично.</p>
      </UCard>
    </template>
  </div>
</template>
