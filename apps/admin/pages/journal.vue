<template>
  <div class="space-y-5">
    <div>
      <h1 class="text-2xl font-semibold text-highlighted">Журнал</h1>
      <p class="text-sm text-muted">Ручні нарахування й списання з панелі: хто, коли, скільки і чому</p>
    </div>
    <UCard class="shadow-sm" :ui="{ body: 'p-0 sm:p-0' }">
      <OperationsTable />
    </UCard>
  </div>
</template>
