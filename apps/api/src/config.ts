import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  SYRVE_API_URL: z.string().url().default('https://api-eu.syrve.live'),
  SYRVE_API_LOGIN: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  // Як часто worker перевіряє нові транзакції Syrve (О6)
  NOTIFY_INTERVAL_SECONDS: z.coerce.number().int().min(1).default(20),
  SESSION_SECRET: z.string().default(''),
  // Перший адміністратор (створюється/оновлюється на старті, якщо обидва задані)
  ADMIN_LOGIN: z.string().default(''),
  ADMIN_PASSWORD: z.string().default(''),
  // Необовʼязковий менеджер (роль manager); створюється на старті, якщо його ще немає
  SEED_MANAGER_LOGIN: z.string().default(''),
  SEED_MANAGER_PASSWORD: z.string().default(''),
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
