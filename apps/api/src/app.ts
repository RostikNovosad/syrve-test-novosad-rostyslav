import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Config } from './config.js';
import { devRoutes } from './routes/dev.js';
import { discoverSyrve, type SyrveClient } from './syrve/index.js';

export interface AppDeps {
  config: Config;
  prisma: PrismaClient;
  syrve: SyrveClient;
}

export async function buildApp({ config, prisma, syrve }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: 'info' },
  });

  await app.register(swagger, {
    openapi: { info: { title: 'Syrve Loyalty API', version: '0.1.0' } },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      return reply.code(503).send({ status: 'error', db: 'down', syrveMode: config.SYRVE_MODE });
    }
    return { status: 'ok', db: 'up', syrveMode: config.SYRVE_MODE };
  });

  // О1: перевірка звʼязку з Syrve (організація + програма)
  app.get('/health/syrve', async (_req, reply) => {
    try {
      const { organization, program } = await discoverSyrve(syrve);
      return { status: 'ok', mode: config.SYRVE_MODE, organization, program };
    } catch (e) {
      return reply.code(502).send({ status: 'error', message: (e as Error).message });
    }
  });

  if (config.ENABLE_DEV_ROUTES) {
    await app.register(async (scope) => devRoutes(scope, syrve));
  }

  return app;
}
