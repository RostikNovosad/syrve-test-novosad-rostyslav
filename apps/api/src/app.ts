import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Config } from './config.js';
import { MockSyrveClient } from './syrve/mock.js';
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

  // Dev-ендпоінт для демо О6: лише в mock-режимі
  if (config.SYRVE_MODE === 'mock' && syrve instanceof MockSyrveClient) {
    app.post<{ Body: { customerId: string; sum: number; comment?: string } }>(
      '/dev/simulate-transaction',
      async (req, reply) => {
        const { customerId, sum, comment } = req.body ?? ({} as never);
        if (!customerId || typeof sum !== 'number' || sum === 0) {
          return reply.code(400).send({ error: 'потрібні customerId та ненульове число sum' });
        }
        syrve.simulateTransaction(customerId, sum, comment);
        return { ok: true };
      },
    );
  }

  return app;
}
