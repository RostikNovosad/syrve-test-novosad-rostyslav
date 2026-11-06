import type { PrismaClient } from '@prisma/client';
import type { SyrveClient, SyrveContext, WalletTransaction } from '../syrve/index.js';

const PAGE_SIZE = 100;
const MAX_ATTEMPTS = 5;
const SEND_BATCH = 50;

export interface NotificationDeps {
  prisma: PrismaClient;
  syrve: SyrveClient;
  resolveCtx: () => Promise<SyrveContext>;
  /** Надсилання в Telegram; кидає помилку, якщо не вдалося. Без нього (бот вимкнено) транзакції лише збираються. */
  send?: (telegramId: bigint, text: string) => Promise<void>;
  log?: { info: (m: string) => void; error: (m: string) => void };
}

const fmt = (n: number) => new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(Math.abs(n));

export function notificationText(sum: number, balance: number): string {
  const verb = sum > 0 ? 'Нараховано' : 'Списано';
  return `${verb} бонусів: ${fmt(sum)}\nБаланс: ${fmt(balance)}`;
}

/**
 * Один прохід worker: (1) забирає нові транзакції гостів з Syrve, зберігає їх для статистики
 * й кладе сповіщення в outbox (лише гостям із Telegram), (2) відправляє те, що чекає в outbox.
 * Єдине місце, що надсилає сповіщення про зміну балансу, — тому операції з панелі
 * й з кабінету Syrve поводяться однаково, а одна транзакція дає одне повідомлення.
 */
export async function runNotificationTick(deps: NotificationDeps): Promise<void> {
  await collectTransactions(deps);
  if (deps.send) await deliverPending({ ...deps, send: deps.send });
}

async function collectTransactions(deps: NotificationDeps) {
  const { prisma, log } = deps;
  const ctx = await deps.resolveCtx();
  // Усі гості: транзакції потрібні для статистики, сповіщення йдуть лише тим, хто в Telegram
  const guests = await prisma.guest.findMany();
  for (const guest of guests) {
    try {
      await collectForGuest(deps, ctx, guest);
    } catch (e) {
      // Збій по одному гостю не блокує інших; курсор не рухали — спробуємо наступного разу
      log?.error(`Сповіщення: гість ${guest.syrveCustomerId}: ${(e as Error).message}`);
    }
  }
}

async function collectForGuest(
  { prisma, syrve }: NotificationDeps,
  ctx: SyrveContext,
  guest: { id: string; telegramId: bigint | null; syrveCustomerId: string; lastRevision: bigint | null; createdAt: Date },
) {
  const baseline = guest.lastRevision === null;
  let revision = Number(guest.lastRevision ?? 0);

  for (;;) {
    const page = await syrve.getTransactionsByRevision(ctx.organizationId, guest.syrveCustomerId, revision, PAGE_SIZE);
    const txs = [...page.transactions].sort((a, b) => a.revision - b.revision);

    // Історія для статистики: усі ненульові транзакції нашого гаманця (включно зі старою історією)
    const history = txs.filter((tx) => tx.sum && (!ctx.walletId || tx.walletId === ctx.walletId));

    const rows: { transactionId: string; text: string }[] = [];
    for (const tx of txs) {
      if (guest.telegramId === null) break; // без Telegram сповіщати нікого
      if (!isNotifiable(tx, ctx, baseline, guest.createdAt)) continue;
      if (await prisma.processedTransaction.findUnique({ where: { id: tx.id } })) continue;
      rows.push({ transactionId: tx.id, text: notificationText(tx.sum, await balanceAfter(syrve, ctx, guest, tx)) });
    }

    await prisma.$transaction([
      // Усі транзакції сторінки (і ті, що не сповіщаємо) позначаємо обробленими: дедуп по id
      ...txs.map((tx) =>
        prisma.processedTransaction.upsert({ where: { id: tx.id }, create: { id: tx.id }, update: {} }),
      ),
      prisma.loyaltyTransaction.createMany({
        data: history.map((tx) => ({
          id: tx.id,
          guestId: guest.id,
          walletId: tx.walletId,
          sum: tx.sum,
          balanceAfter: tx.balanceAfter ?? null,
          comment: tx.comment ?? null,
          occurredAt: Number.isFinite(Date.parse(tx.createdAt)) ? new Date(tx.createdAt) : new Date(),
          revision: BigInt(tx.revision),
        })),
        skipDuplicates: true,
      }),
      ...rows.map((r) =>
        prisma.notification.create({ data: { ...r, telegramId: guest.telegramId! } }),
      ),
      prisma.guest.update({ where: { id: guest.id }, data: { lastRevision: BigInt(page.maxRevision) } }),
    ]);

    const advanced = page.maxRevision > revision;
    revision = page.maxRevision;
    if (txs.length < PAGE_SIZE || !advanced) return;
  }
}

function isNotifiable(tx: WalletTransaction, ctx: SyrveContext, baseline: boolean, guestCreatedAt: Date): boolean {
  if (ctx.walletId && tx.walletId !== ctx.walletId) return false; // інший гаманець — не наші бонуси
  if (!tx.sum) return false;
  if (baseline) {
    // Перший прохід: стара історія (до появи гостя в нас) не розсилається; нові операції — так
    const created = Date.parse(tx.createdAt);
    return Number.isFinite(created) && created >= guestCreatedAt.getTime();
  }
  return true;
}

async function balanceAfter(
  syrve: SyrveClient,
  ctx: SyrveContext,
  guest: { syrveCustomerId: string },
  tx: WalletTransaction,
): Promise<number> {
  if (tx.balanceAfter !== undefined) return tx.balanceAfter;
  const customer = await syrve.getCustomer(ctx.organizationId, guest.syrveCustomerId);
  return customer?.walletBalances.find((w) => w.walletId === tx.walletId)?.balance ?? 0;
}

async function deliverPending({ prisma, send, log }: NotificationDeps & { send: NonNullable<NotificationDeps['send']> }) {
  const pending = await prisma.notification.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: SEND_BATCH,
  });
  for (const n of pending) {
    try {
      await send(n.telegramId, n.text);
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: 'sent', sentAt: new Date(), attempts: n.attempts + 1 },
      });
    } catch (e) {
      const attempts = n.attempts + 1;
      // 403 — гість заблокував бота: повторювати марно
      const blocked = (e as { error_code?: number }).error_code === 403;
      const failed = blocked || attempts >= MAX_ATTEMPTS;
      await prisma.notification.update({
        where: { id: n.id },
        data: { attempts, status: failed ? 'failed' : 'pending' },
      });
      log?.error(`Сповіщення ${n.id}: ${(e as Error).message}${failed ? ' — залишено як failed' : ''}`);
    }
  }
}

/** Запускає періодичні проходи; наступний не починається, поки триває попередній. */
export function startNotificationWorker(deps: NotificationDeps, intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runNotificationTick(deps);
    } catch (e) {
      deps.log?.error(`Worker сповіщень: ${(e as Error).message}`);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
