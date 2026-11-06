import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPrisma } from './db.js';
import { createSyrveClient, discoverSyrve } from './syrve/index.js';

const config = loadConfig();
const prisma = createPrisma();
const syrve = createSyrveClient(config);
const app = await buildApp({ config, prisma, syrve });

try {
  const { organization, program } = await discoverSyrve(syrve);
  app.log.info(`Syrve (${config.SYRVE_MODE}): організація "${organization.name}", програма "${program.name}"`);
} catch (e) {
  // Не валимо сервіс: /health/syrve покаже проблему
  app.log.error(`Syrve недоступний: ${(e as Error).message}`);
}

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
