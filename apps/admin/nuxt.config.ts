// Адмін-панель: SPA (без SSR), `nuxt generate` → статика, яку віддає Fastify
export default defineNuxtConfig({
  compatibilityDate: '2025-07-01',
  ssr: false,
  // DevTools і vue-tracer додають ~20 запитів і сповільнюють холодний старт dev-режиму
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  // Світла тема за замовчуванням; вибір користувача памʼятається в localStorage
  colorMode: { preference: 'light', fallback: 'light', classSuffix: '' },
  app: {
    head: {
      htmlAttrs: { lang: 'uk' },
      title: 'Панель лояльності',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  // Під час розробки `nuxt dev` проксує API на Fastify (npm run dev у корені)
  nitro: { devProxy: { '/api': { target: 'http://localhost:3000/api', changeOrigin: true } } },
  telemetry: false,
});
