import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPrisma } from './db.js';
import { createBot } from './bot/index.js';
import { createSyrveClient, discoverSyrve } from './syrve/index.js';

const config = loadConfig();
const prisma = createPrisma();
const syrve = createSyrveClient(config);
const app = await buildApp({ config, prisma, syrve });

try {
  const { organization, program } = await discoverSyrve(syrve);
  app.log.info(`Syrve: організація "${organization.name}", програма "${program.name}"`);
} catch (e) {
  // Не валимо сервіс: /health/syrve покаже проблему
  app.log.error(`Syrve недоступний: ${(e as Error).message}`);
}

let bot: ReturnType<typeof createBot> | undefined;
if (config.TELEGRAM_BOT_TOKEN) {
  let cached: Promise<{ organizationId: string; programId: string; walletId?: string }> | undefined;
  const resolveCtx = () =>
    (cached ??= discoverSyrve(syrve)
      .then((d) => ({ organizationId: d.organization.id, programId: d.program.id, walletId: d.program.walletId }))
      .catch((e) => {
        cached = undefined; // не кешуємо помилку
        throw e;
      }));
  bot = createBot({ token: config.TELEGRAM_BOT_TOKEN, prisma, syrve, resolveCtx });
  // long polling у фоні; помилка бота не валить API
  bot.start({ onStart: (me) => app.log.info(`Telegram-бот @${me.username} запущено`) }).catch((e) => {
    app.log.error(`Telegram-бот зупинено: ${(e as Error).message}`);
  });
} else {
  app.log.warn('TELEGRAM_BOT_TOKEN не задано — бот не запущено');
}

const shutdown = async () => {
  await bot?.stop();
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
