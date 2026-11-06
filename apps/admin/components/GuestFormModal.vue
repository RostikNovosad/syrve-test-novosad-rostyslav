<script setup lang="ts">
// Створення (guest не передано) або редагування гостя.
const props = defineProps<{ guest?: Guest | null }>();
const emit = defineEmits<{ saved: [customerId: string] }>();
const open = defineModel<boolean>('open', { required: true });

const api = useApi();
const toast = useToast();
const form = reactive({ name: '', phone: '' });
const loading = ref(false);
const error = ref('');
const editing = computed(() => !!props.guest);

watch(open, (v) => {
  if (!v) return;
  form.name = props.guest?.name ?? '';
  form.phone = props.guest?.phone ?? '';
  error.value = '';
});

const valid = computed(() => form.name.trim().length > 0 && form.phone.trim().length > 0);

async function submit() {
  if (!valid.value || loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    let id: string;
    if (props.guest) {
      await api(`/guests/${props.guest.customerId}`, { method: 'PATCH', body: { name: form.name, phone: form.phone } });
      id = props.guest.customerId;
    } else {
      id = (await api<{ customerId: string }>('/guests', { method: 'POST', body: { name: form.name, phone: form.phone } })).customerId;
    }
    toast.add({ title: editing.value ? 'Зміни збережено' : 'Гостя додано', color: 'success', icon: 'i-lucide-check' });
    open.value = false;
    emit('saved', id);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="editing ? 'Редагувати гостя' : 'Новий гість'"
    :description="editing ? 'Зміни збережуться і в Syrve' : 'Гостя буде створено в Syrve, підключено до програми лояльності й видано картку'"
  >
    <template #body>
      <form class="space-y-4" @submit.prevent="submit">
        <UFormField label="Імʼя">
          <UInput v-model="form.name" autofocus size="lg" class="w-full" maxlength="100" placeholder="Імʼя та прізвище" />
        </UFormField>
        <UFormField label="Телефон">
          <UInput v-model="form.phone" type="tel" size="lg" class="w-full" placeholder="050 123 45 67" />
        </UFormField>
        <UAlert v-if="error" color="error" variant="subtle" :title="error" />
        <button type="submit" class="hidden" />
      </form>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Скасувати" color="neutral" variant="ghost" @click="open = false" />
        <UButton :label="editing ? 'Зберегти' : 'Додати'" :loading="loading" :disabled="!valid" @click="submit" />
      </div>
    </template>
  </UModal>
</template>
