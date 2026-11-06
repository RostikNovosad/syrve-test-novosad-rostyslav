import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPrisma } from './db.js';
import { createBot } from './bot/index.js';
import { randomBytes } from 'node:crypto';
import { seedAdmin } from './admin/session.js';
import { startNotificationWorker } from './worker/notifications.js';
import { createSyrveClient, createSyrveContext, discoverSyrve } from './syrve/index.js';

const config = loadConfig();
const prisma = createPrisma();
const syrve = createSyrveClient(config);
const resolveCtx = createSyrveContext(syrve);

let sessionSecret = config.SESSION_SECRET;
if (sessionSecret.length < 16) {
  // Без нормального секрету працюємо з випадковим: після рестарту сесії скидаються
  sessionSecret = randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET не задано (або <16 символів) — використано тимчасовий, сесії скинуться після рестарту');
}
const app = await buildApp({ config, prisma, syrve, resolveCtx, sessionSecret });

if (config.ADMIN_LOGIN && config.ADMIN_PASSWORD) {
  await seedAdmin(prisma, config.ADMIN_LOGIN, config.ADMIN_PASSWORD);
  app.log.info(`Адміністратор "${config.ADMIN_LOGIN}" готовий до входу`);
} else {
  app.log.warn('ADMIN_LOGIN/ADMIN_PASSWORD не задано — перший адмін не створено, вхід у панель неможливий');
}

try {
  // Прогріваємо токен, організацію й програму, щоб перший запит із панелі не чекав на них
  const ctx = await resolveCtx();
  app.log.info(`Syrve готовий: організація ${ctx.organizationId}, програма ${ctx.programId}`);
} catch (e) {
  // Не валимо сервіс: /health/syrve покаже проблему
  app.log.error(`Syrve недоступний: ${(e as Error).message}`);
}

let bot: ReturnType<typeof createBot> | undefined;
if (config.TELEGRAM_BOT_TOKEN) {
  bot = createBot({ token: config.TELEGRAM_BOT_TOKEN, prisma, syrve, resolveCtx });
  // long polling у фоні; помилка бота не валить API
  bot.start({ onStart: (me) => app.log.info(`Telegram-бот @${me.username} запущено`) }).catch((e) => {
    app.log.error(`Telegram-бот зупинено: ${(e as Error).message}`);
  });
} else {
  app.log.warn('TELEGRAM_BOT_TOKEN не задано — бот не запущено');
}

let stopWorker: (() => void) | undefined;
if (bot) {
  const api = bot.api;
  stopWorker = startNotificationWorker(
    {
      prisma,
      syrve,
      resolveCtx,
      send: async (telegramId, text) => void (await api.sendMessage(Number(telegramId), text)),
      log: { info: (m) => app.log.info(m), error: (m) => app.log.error(m) },
    },
    config.NOTIFY_INTERVAL_SECONDS * 1000,
  );
  app.log.info(`Worker сповіщень запущено (кожні ${config.NOTIFY_INTERVAL_SECONDS} с)`);
} else {
  app.log.warn('Worker сповіщень не запущено: немає TELEGRAM_BOT_TOKEN');
}

const shutdown = async () => {
  stopWorker?.();
  await bot?.stop();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
