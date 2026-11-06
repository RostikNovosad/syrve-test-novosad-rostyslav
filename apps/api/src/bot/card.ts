import type { Guest } from '@prisma/client';
import QRCode from 'qrcode';
import type { SyrveClient } from '../syrve/index.js';
import type { SyrveContext } from './registration.js';

export interface CardView {
  cardNumber: string;
  /** Баланс по гаманцю програми (читається з Syrve щоразу, не кешується) */
  balance: number;
  caption: string;
}

const fmt = (n: number) => new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(n);

/** О3: номер картки + баланс із Syrve. */
export async function getCardView(
  deps: { syrve: SyrveClient; ctx: SyrveContext },
  guest: Guest,
): Promise<CardView> {
  const customer = await deps.syrve.getCustomer(deps.ctx.organizationId, guest.syrveCustomerId);
  if (!customer) throw new Error('Гостя не знайдено в Syrve');
  const wallet =
    customer.walletBalances.find((w) => w.walletId === deps.ctx.walletId) ?? customer.walletBalances[0];
  const balance = wallet?.balance ?? 0;
  const cardNumber = customer.cards[0]?.number ?? guest.cardNumber ?? '—';
  return {
    cardNumber,
    balance,
    caption: `💳 Ваша картка: ${cardNumber}\n💰 Баланс: ${fmt(balance)} бонусів`,
  };
}

/** QR із номером картки (PNG). */
export function cardQr(cardNumber: string): Promise<Buffer> {
  return QRCode.toBuffer(cardNumber, { width: 512, margin: 2 });
}
