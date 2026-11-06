import type { PrismaClient } from '@prisma/client';
import type { Customer, SyrveClient, SyrveContext } from '../syrve/index.js';
import { SyrveError } from '../syrve/index.js';
import { HttpError } from './permissions.js';

export class OperationError extends HttpError {}

export const MAX_AMOUNT = 1_000_000;

export interface OperationInput {
  customerId: string;
  adminId: string;
  type: 'topup' | 'chargeoff';
  amount: number;
  reason: string;
}

/** Гаманець гостя в програмі: за walletId програми, інакше перший. */
export function pickWallet(customer: Customer, programWalletId?: string) {
  return customer.walletBalances.find((w) => w.walletId === programWalletId) ?? customer.walletBalances[0];
}

/**
 * О5: ручне нарахування/списання. Баланс перевіряється свіжим запитом до Syrve (не кешуємо),
 * операція фіксується в журналі: pending → done/failed.
 */
export async function applyOperation(
  deps: { prisma: PrismaClient; syrve: SyrveClient; ctx: SyrveContext },
  input: OperationInput,
): Promise<{ operationId: string; customer: Customer }> {
  const { prisma, syrve, ctx } = deps;
  const amount = Math.round(input.amount * 100) / 100;
  const reason = input.reason.trim();

  if (!Number.isFinite(amount) || amount <= 0) throw new OperationError('Сума має бути більшою за нуль', 400);
  if (amount > MAX_AMOUNT) throw new OperationError(`Сума не може перевищувати ${MAX_AMOUNT}`, 400);
  if (reason.length < 3) throw new OperationError('Вкажіть причину (щонайменше 3 символи)', 400);
  if (reason.length > 200) throw new OperationError('Причина задовга (максимум 200 символів)', 400);

  const customer = await syrve.getCustomer(ctx.organizationId, input.customerId);
  if (!customer) throw new OperationError('Гостя не знайдено в Syrve', 404);
  const wallet = pickWallet(customer, ctx.walletId);
  if (!wallet) throw new OperationError('Гість не підключений до програми лояльності', 409);
  if (input.type === 'chargeoff' && amount > wallet.balance) {
    throw new OperationError(`Недостатньо бонусів: на рахунку ${wallet.balance}, а списати потрібно ${amount}`, 409);
  }

  const local = await prisma.guest.findUnique({ where: { syrveCustomerId: customer.id } });
  const op = await prisma.bonusOperation.create({
    data: {
      guestId: local?.id,
      syrveCustomerId: customer.id,
      guestPhone: customer.phone,
      guestName: customer.name,
      adminId: input.adminId,
      type: input.type,
      amount,
      reason,
    },
  });

  try {
    const change = { customerId: customer.id, walletId: wallet.walletId, sum: amount, comment: reason };
    if (input.type === 'topup') await syrve.topUp(ctx.organizationId, change);
    else await syrve.chargeOff(ctx.organizationId, change);
  } catch (e) {
    await prisma.bonusOperation.update({
      where: { id: op.id },
      data: { status: 'failed', error: (e as Error).message, completedAt: new Date() },
    });
    throw new OperationError(
      e instanceof SyrveError ? `Syrve відхилив операцію: ${e.message}` : 'Не вдалося виконати операцію',
      502,
    );
  }

  await prisma.bonusOperation.update({ where: { id: op.id }, data: { status: 'done', completedAt: new Date() } });
  // Свіжий баланс після операції
  const fresh = (await syrve.getCustomer(ctx.organizationId, customer.id)) ?? customer;
  return { operationId: op.id, customer: fresh };
}
