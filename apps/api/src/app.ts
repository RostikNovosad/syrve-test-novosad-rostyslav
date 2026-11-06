import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Config } from './config.js';
import { adminRoutes } from './admin/routes.js';
import { discoverSyrve, type SyrveClient, type SyrveContext } from './syrve/index.js';

export interface AppDeps {
  config: Config;
  prisma: PrismaClient;
  syrve: SyrveClient;
  resolveCtx: () => Promise<SyrveContext>;
  /** Підпис сесій адмін-панелі */
  sessionSecret: string;
  /** Папка зібраної адмінки (nuxt generate); якщо немає — адмінка не віддається */
  adminStaticDir?: string;
}

// dist/ і src/ лежать на одному рівні, тому шлях однаковий у dev і в Docker
const DEFAULT_ADMIN_DIR = resolve(import.meta.dirname, '../../admin/.output/public');

export async function buildApp({ config, prisma, syrve, resolveCtx, sessionSecret, adminStaticDir = DEFAULT_ADMIN_DIR }: AppDeps): Promise<FastifyInstance> {
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
      return reply.code(503).send({ status: 'error', db: 'down' });
    }
    return { status: 'ok', db: 'up' };
  });

  // О1: перевірка звʼязку з Syrve (організація + програма)
  app.get('/health/syrve', async (_req, reply) => {
    try {
      const { organization, program } = await discoverSyrve(syrve);
      return { status: 'ok', organization, program };
    } catch (e) {
      return reply.code(502).send({ status: 'error', message: (e as Error).message });
    }
  });

  await app.register(async (scope) => adminRoutes(scope, { config, prisma, syrve, resolveCtx, sessionSecret }), {
    prefix: '/api/admin',
  });

  // Адмінка (Nuxt SPA): статика + fallback на index.html для клієнтських маршрутів
  if (existsSync(adminStaticDir)) {
    await app.register(fastifyStatic, { root: adminStaticDir });
    app.setNotFoundHandler((req, reply) => {
      // Старі адреси панелі (до появи лендінгу на «/») → /admin/*
      const legacy = /^\/(login|guests|journal|stats|admins)(\/.*)?$/.exec(req.url);
      if (req.method === 'GET' && legacy) return reply.redirect(`/admin${req.url}`, 301);
      const isPage = req.method === 'GET' && !/^\/(api|docs|health)(\/|$)/.test(req.url) && !/\.\w+$/.test(req.url.split('?')[0]!);
      if (isPage) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Не знайдено' });
    });
  } else {
    app.log.warn(`Адмінку не знайдено (${adminStaticDir}) — зберіть її: npm run build -w apps/admin`);
  }

  return app;
}
