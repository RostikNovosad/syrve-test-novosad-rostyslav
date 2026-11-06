<script setup lang="ts">
definePageMeta({ layout: 'blank' });

const api = useApi();
const admin = useAdmin();
const form = reactive({ login: '', password: '' });
const loading = ref(false);
const error = ref('');

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    admin.value = await api<{ login: string }>('/auth/login', { method: 'POST', body: form });
    await navigateTo('/');
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <UCard class="w-full max-w-sm shadow-lg">
    <form class="space-y-4" @submit.prevent="submit">
      <div class="flex items-center gap-3">
        <span class="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <UIcon name="i-lucide-gem" class="size-5" />
        </span>
        <div>
          <h1 class="text-lg font-semibold leading-tight text-highlighted">Вхід у панель</h1>
          <p class="text-sm text-muted">Програма лояльності закладу</p>
        </div>
      </div>
      <UFormField label="Логін">
        <UInput v-model="form.login" autofocus autocomplete="username" class="w-full" size="lg" />
      </UFormField>
      <UFormField label="Пароль">
        <UInput v-model="form.password" type="password" autocomplete="current-password" class="w-full" size="lg" />
      </UFormField>
      <UAlert v-if="error" color="error" variant="subtle" :title="error" />
      <UButton type="submit" label="Увійти" size="lg" block :loading="loading" :disabled="!form.login || !form.password" />
    </form>
  </UCard>
</template>
