<script setup lang="ts">
// Створення (user не передано) або редагування працівника: роль, доступ, новий пароль. Логін не змінюється.
const props = defineProps<{ user?: AdminUserItem | null; self?: boolean }>();
const emit = defineEmits<{ saved: [] }>();
const open = defineModel<boolean>('open', { required: true });

const api = useApi();
const toast = useToast();
const form = reactive({ login: '', password: '', role: 'manager' as AdminRole, isActive: true });
const loading = ref(false);
const error = ref('');
const editing = computed(() => !!props.user);
const roleItems = (Object.keys(ROLE_LABELS) as AdminRole[]).map((value) => ({ value, label: ROLE_LABELS[value] }));

watch(open, (v) => {
  if (!v) return;
  form.login = props.user?.login ?? '';
  form.password = '';
  form.role = props.user?.role ?? 'manager';
  form.isActive = props.user?.isActive ?? true;
  error.value = '';
});

const valid = computed(() => (editing.value ? form.password === '' || form.password.length >= 8 : form.login.trim().length >= 3 && form.password.length >= 8));

async function submit() {
  if (!valid.value || loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    if (props.user) {
      await api(`/admins/${props.user.id}`, {
        method: 'PATCH',
        // Власну роль і доступ не надсилаємо: сервер їх однаково заборонить змінювати
        body: { ...(props.self ? {} : { role: form.role, isActive: form.isActive }), ...(form.password ? { password: form.password } : {}) },
      });
    } else {
      await api('/admins', { method: 'POST', body: { login: form.login, password: form.password, role: form.role } });
    }
    toast.add({ title: editing.value ? 'Зміни збережено' : 'Працівника додано', color: 'success', icon: 'i-lucide-check' });
    open.value = false;
    emit('saved');
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
    :title="editing ? `Працівник ${user?.login}` : 'Новий працівник'"
    :description="editing ? 'Змініть роль, доступ або задайте новий пароль' : 'Працівник входитиме в панель за цим логіном і паролем'"
  >
    <template #body>
      <form class="space-y-4" @submit.prevent="submit">
        <UFormField v-if="!editing" label="Логін" hint="латиниця, цифри, . - _">
          <UInput v-model="form.login" autofocus size="lg" class="w-full" maxlength="50" autocomplete="off" />
        </UFormField>
        <UFormField :label="editing ? 'Новий пароль' : 'Пароль'" :hint="editing ? 'лишіть порожнім, щоб не змінювати' : 'щонайменше 8 символів'">
          <UInput v-model="form.password" type="password" size="lg" class="w-full" maxlength="200" autocomplete="new-password" />
        </UFormField>
        <UFormField label="Роль" :hint="self ? 'свою роль змінити не можна' : undefined">
          <USelect v-model="form.role" :items="roleItems" value-key="value" size="lg" class="w-full" :disabled="self" />
        </UFormField>
        <USwitch v-if="editing && !self" v-model="form.isActive" label="Має доступ до панелі" />
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
