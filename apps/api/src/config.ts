import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().min(1),
    SYRVE_MODE: z.enum(['mock', 'real']).default('mock'),
    SYRVE_API_URL: z.string().url().default('https://api-eu.syrve.live'),
    SYRVE_API_LOGIN: z.string().default(''),
    TELEGRAM_BOT_TOKEN: z.string().default(''),
    SESSION_SECRET: z.string().default(''),
  })
  .superRefine((env, ctx) => {
    if (env.SYRVE_MODE === 'real' && !env.SYRVE_API_LOGIN) {
      ctx.addIssue({
        code: 'custom',
        path: ['SYRVE_API_LOGIN'],
        message: 'потрібен для SYRVE_MODE=real',
      });
    }
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Невірна конфігурація: ${details}`);
  }
  return parsed.data;
}
