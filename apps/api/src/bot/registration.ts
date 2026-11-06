import { randomInt } from 'node:crypto';
import type { Guest, PrismaClient } from '@prisma/client';
import type { SyrveClient } from '../syrve/index.js';

export interface SyrveContext {
  organizationId: string;
  programId: string;
  /** Гаманець програми: за ним шукаємо баланс (customer/info не віддає programId) */
  walletId?: string;
}

export interface RegisterInput {
  telegramId: bigint;
  phone: string; // вже нормалізований +380…
  name: string;
}

export class PhoneTakenError extends Error {
  constructor() {
    super('Цей номер уже привʼязаний до іншого Telegram-акаунта');
    this.name = 'PhoneTakenError';
  }
}

/** Номер картки: 10 цифр. */
export function generateCardNumber(): string {
  return Array.from({ length: 10 }, () => randomInt(0, 10)).join('');
}

/**
 * О2: гість у Syrve + програма + картка, запис у нашу БД.
 * Ідемпотентна: повторний виклик (напр. після збою посеред) не створює дублів —
 * телефон шукається в Syrve перед створенням, програма/картка додаються лише якщо їх ще нема.
 */
export async function registerGuest(
  deps: { prisma: PrismaClient; syrve: SyrveClient; ctx: SyrveContext },
  input: RegisterInput,
): Promise<Guest> {
  const { prisma, syrve, ctx } = deps;
  const { organizationId: org, programId } = ctx;

  const byTelegram = await prisma.guest.findUnique({ where: { telegramId: input.telegramId } });
  if (byTelegram) return byTelegram;
  const byPhone = await prisma.guest.findUnique({ where: { phone: input.phone } });
  if (byPhone) throw new PhoneTakenError();

  const existing = await syrve.findCustomerByPhone(org, input.phone);
  const customerId = await syrve.createOrUpdateCustomer(org, {
    id: existing?.id,
    phone: input.phone,
    name: existing?.name || input.name,
  });

  const customer = existing ?? (await syrve.getCustomer(org, customerId));
  if (!customer?.walletBalances.some((w) => w.walletId === ctx.walletId)) {
    await syrve.addCustomerToProgram(org, customerId, programId);
  }

  let cardNumber = customer?.cards[0]?.number;
  if (!cardNumber) {
    cardNumber = generateCardNumber();
    await syrve.addCard(org, customerId, cardNumber);
  }

  return prisma.guest.create({
    data: {
      telegramId: input.telegramId,
      phone: input.phone,
      name: existing?.name || input.name,
      syrveCustomerId: customerId,
      cardNumber,
    },
  });
}
