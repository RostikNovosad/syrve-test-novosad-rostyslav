<script setup lang="ts">
import { CalendarDate, type DateValue } from '@internationalized/date';

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

// Календар: вибір діапазону дат (UCalendar працює з CalendarDate, а стан тримаємо рядками YYYY-MM-DD)
const toDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new CalendarDate(y!, m!, d!);
};
const calendarRange = computed({
  get: () => ({ start: toDate(from.value), end: toDate(to.value) }),
  set: (r: { start?: DateValue | null; end?: DateValue | null }) => {
    // Застосовуємо, лише коли вибрано обидві межі
    if (r.start && r.end) {
      from.value = r.start.toString();
      to.value = r.end.toString();
      calendarOpen.value = false;
    }
  },
});
const calendarOpen = ref(false);
const today = computed(() => toDate(ymd(new Date())));
const fmtShort = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
const rangeLabel = computed(() => `${fmtShort(from.value)} — ${fmtShort(to.value)}`);

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

// Графік по днях: шкала «гарного» максимуму (1/2/5·10ⁿ), щоб лінії сітки мали круглі значення
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].map((m) => m * mag).find((c) => c >= v) ?? v) as number;
}
const maxValue = computed(() => niceMax(Math.max(0, ...(stats.value?.daily ?? []).flatMap((d) => [d.earned, d.spent]))));

// Підписи осі X: для короткого періоду — кожен день, для довгого — рівномірно (~8 підписів) + завжди перший і останній
const xLabel = (i: number): string | null => {
  const days = stats.value?.daily ?? [];
  const n = days.length;
  const d = new Date(`${days[i]!.date}T12:00:00`);
  const withMonth = d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
  if (n <= 14) return i === 0 || d.getDate() === 1 ? withMonth : String(d.getDate());
  const step = Math.ceil(n / 8);
  // Останній день підписуємо завжди (там найсвіжіші дані); сусідній регулярний підпис прибираємо, щоб не злипалися
  if (i === n - 1) return withMonth;
  return i % step === 0 && n - 1 - i >= step / 2 ? withMonth : null;
};
const isToday = (iso: string) => iso === ymd(new Date());

// Підказка одна на весь графік: позиціонується всередині картки й не вилазить за її межі
const hovered = ref<number | null>(null);
const tip = computed(() => {
  const n = stats.value?.daily.length ?? 0;
  const i = hovered.value;
  if (i === null || !n) return null;
  const center = ((i + 0.5) / n) * 100;
  // Біля країв вирівнюємо підказку по краю, інакше по центру стовпчика
  const style = center < 18 ? { left: '0' } : center > 82 ? { right: '0' } : { left: `${center}%`, transform: 'translateX(-50%)' };
  return { d: stats.value!.daily[i]!, style };
});
const pct = (v: number) => `${v > 0 ? Math.max(2, (v / maxValue.value) * 100) : 0}%`;
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
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="p in presets"
        :key="p.days"
        type="button"
        class="cursor-pointer rounded-full border px-5 py-2 text-sm font-medium transition-colors"
        :class="activePreset === p.days
          ? 'border-indigo-600 bg-indigo-600 text-white'
          : 'border-default bg-default text-toned hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:bg-white/5'"
        @click="setPreset(p.days)"
      >
        {{ p.label }}
      </button>
      <UPopover v-model:open="calendarOpen">
        <UButton
          :label="rangeLabel"
          icon="i-lucide-calendar"
          size="lg"
          :color="activePreset ? 'neutral' : 'primary'"
          :variant="activePreset ? 'outline' : 'solid'"
          class="rounded-full px-5"
        />
        <template #content>
          <UCalendar v-model="calendarRange" range :max-value="today" class="p-2" />
        </template>
      </UPopover>
    </div>

    <UAlert v-if="error" color="error" variant="subtle" :title="error" />

    <template v-else-if="stats">
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" :class="loading ? 'opacity-60 transition-opacity' : ''">
        <UCard v-for="c in cards" :key="c.label">
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

      <UCard>
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-semibold text-highlighted">Нарахування і списання по днях</h2>
          <div class="flex gap-4 text-xs text-muted">
            <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-emerald-500" />Нараховано</span>
            <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-rose-500" />Списано</span>
          </div>
        </div>
        <div class="mb-4 flex flex-wrap gap-2">
          <span class="rounded-lg bg-muted px-3 py-1.5 text-sm text-toned">
            Різниця: <b class="tabular-nums text-highlighted">{{ stats.bonuses.net >= 0 ? '+' : '−' }}{{ formatNumber(Math.abs(stats.bonuses.net)) }}</b>
          </span>
          <span class="rounded-lg bg-muted px-3 py-1.5 text-sm text-toned">
            Транзакцій: <b class="tabular-nums text-highlighted">{{ formatNumber(stats.bonuses.transactions) }}</b>
          </span>
        </div>

        <!-- Зверху лишаємо місце під підказку, щоб вона була всередині картки -->
        <div class="relative pt-14" @mouseleave="hovered = null">
          <!-- Обгортка по ширині графіка, щоб відсотки збігалися зі стовпцями -->
          <div v-if="tip" class="pointer-events-none absolute inset-x-0 top-0 h-0">
            <div class="absolute top-0 z-10 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white" :style="tip.style">
              <div class="font-medium">{{ dayLabel(tip.d.date) }}</div>
              <div>+{{ formatNumber(tip.d.earned) }} / −{{ formatNumber(tip.d.spent) }}</div>
              <div v-if="tip.d.newGuests" class="text-slate-300">нових гостей: {{ tip.d.newGuests }}</div>
            </div>
          </div>

          <div role="img" aria-label="Нарахування і списання по днях">
            <div>
              <div class="relative h-52">
                <!-- Базова лінія -->
                <div class="absolute inset-x-0 bottom-0 border-t border-slate-400 dark:border-slate-500" />
                <!-- Кожен день — окрема колонка з фоном, тож дні без операцій теж видно -->
                <div class="absolute inset-0 flex gap-px sm:gap-0.5">
                  <div
                    v-for="(d, i) in stats.daily"
                    :key="d.date"
                    class="flex h-full min-w-0 flex-1 items-end justify-center gap-px rounded-t-sm px-px transition-colors"
                    :class="hovered === i ? 'bg-indigo-100/70 dark:bg-indigo-400/15' : 'bg-slate-100/70 dark:bg-white/[.04]'"
                    @mouseenter="hovered = i"
                  >
                    <div class="w-full max-w-4 rounded-t-sm bg-emerald-500" :style="{ height: pct(d.earned) }" />
                    <div class="w-full max-w-4 rounded-t-sm bg-rose-500" :style="{ height: pct(d.spent) }" />
                  </div>
                </div>
              </div>

              <!-- Вісь X: дата під кожною колонкою (для довгого періоду — через кілька днів) -->
              <div class="mt-1.5 flex gap-px sm:gap-0.5">
                <div v-for="(d, i) in stats.daily" :key="d.date" class="relative h-5 min-w-0 flex-1">
                  <span
                    v-if="xLabel(i)"
                    class="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-xs tabular-nums"
                    :class="isToday(d.date) ? 'font-semibold text-highlighted' : hovered === i ? 'font-medium text-highlighted' : 'text-muted'"
                  >
                    {{ xLabel(i) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
