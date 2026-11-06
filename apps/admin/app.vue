<script setup lang="ts">
import { uk } from '@nuxt/ui/locale';
</script>

<template>
  <UApp :locale="uk">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
