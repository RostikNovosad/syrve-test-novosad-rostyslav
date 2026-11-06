import { describe, expect, it, vi } from 'vitest';
import { notificationText, runNotificationTick } from '../src/worker/notifications.js';
import type { SyrveClient, WalletTransaction } from '../src/syrve/index.js';

const CTX = { organizationId: 'org', programId: 'p', walletId: 'w1' };
const T0 = Date.parse('2026-01-01T12:00:00Z');

/** In-memory дублер Prisma лише для потрібних worker-у викликів. */
function fakePrisma(guests: any[]) {
  const processed = new Set<string>();
  const notifications: any[] = [];
  const history = new Map<string, any>();
  const api: any = {
    guests,
    processed,
    notifications,
    history,
    guest: {
      findMany: async () => guests,
      update: ({ where, data }: any) => async () => Object.assign(guests.find((g) => g.id === where.id), data),
    },
    processedTransaction: {
      findUnique: async ({ where }: any) => (processed.has(where.id) ? { id: where.id } : null),
      upsert: ({ create }: any) => async () => void processed.add(create.id),
    },
    loyaltyTransaction: {
      createMany: ({ data }: any) => async () => {
        for (const d of data) if (!history.has(d.id)) history.set(d.id, d); // skipDuplicates
      },
    },
    notification: {
      create: ({ data }: any) => async () => {
        if (notifications.some((n) => n.transactionId === data.transactionId)) throw new Error('unique');
        notifications.push({ id: `n${notifications.length + 1}`, status: 'pending', attempts: 0, createdAt: new Date(), ...data });
      },
      findMany: async ({ where }: any) => notifications.filter((n) => n.status === where.status),
      update: async ({ where, data }: any) => Object.assign(notifications.find((n) => n.id === where.id), data),
    },
    $transaction: async (ops: (() => Promise<unknown>)[]) => {
      for (const op of ops) await op();
    },
  };
  // guest.update / processedTransaction.upsert / notification.create повертають відкладену операцію
  // (як PrismaPromise у $transaction([...])); notification.update викликається напряму з deliverPending
  return api;
}

const guest = (over: any = {}) => ({
  id: 'g1',
  telegramId: 100n,
  syrveCustomerId: 'c1',
  lastRevision: null,
  createdAt: new Date(T0),
  ...over,
});

const tx = (id: string, revision: number, sum: number, after: number, whenMs = T0 + 1000, walletId = 'w1'): WalletTransaction => ({
  id,
  customerId: 'c1',
  walletId,
  sum,
  balanceBefore: after - sum,
  balanceAfter: after,
  createdAt: new Date(whenMs).toISOString(),
  revision,
});

function fakeSyrve(all: WalletTransaction[]) {
  return {
    getTransactionsByRevision: vi.fn(async (_o: string, _c: string, revision: number, pageSize = 100) => {
      const transactions = all.filter((t) => t.revision > revision).slice(0, pageSize);
      return { transactions, maxRevision: Math.max(revision, ...transactions.map((t) => t.revision)) };
    }),
    getCustomer: vi.fn(),
  } as unknown as SyrveClient & { getTransactionsByRevision: ReturnType<typeof vi.fn> };
}

const run = (prisma: any, syrve: SyrveClient, send = vi.fn(async () => {})) =>
  runNotificationTick({ prisma, syrve, resolveCtx: async () => CTX, send }).then(() => send);

describe('notificationText', () => {
  it('нарахування й списання', () => {
    expect(notificationText(50, 120)).toBe('Нараховано бонусів: 50\nБаланс: 120');
    expect(notificationText(-30.5, 10)).toBe('Списано бонусів: 30,5\nБаланс: 10');
  });
});

describe('worker сповіщень', () => {
  it('baseline: стара історія не розсилається, нова після появи гостя — розсилається', async () => {
    const old = tx('t-old', 1, 100, 100, T0 - 86_400_000);
    const fresh = tx('t-new', 2, 20, 120);
    const prisma = fakePrisma([guest()]);
    const send = await run(prisma, fakeSyrve([old, fresh]));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(100n, 'Нараховано бонусів: 20\nБаланс: 120');
    expect(prisma.guests[0].lastRevision).toBe(2n);
  });

  it('одна транзакція — одне повідомлення при повторних проходах (навіть якщо Syrve віддає її знову)', async () => {
    const t = tx('t1', 1, 10, 10);
    const prisma = fakePrisma([guest({ lastRevision: 0n })]);
    const syrve = fakeSyrve([t]);
    const send = await run(prisma, syrve);
    prisma.guests[0].lastRevision = 0n; // імітуємо, що курсор не зберігся / Syrve повторив
    await run(prisma, syrve, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(prisma.notifications).toHaveLength(1);
  });

  it('списання, транзакції чужого гаманця й нульові пропускаються правильно', async () => {
    const prisma = fakePrisma([guest({ lastRevision: 0n })]);
    const send = await run(
      prisma,
      fakeSyrve([tx('a', 1, -15, 85), tx('b', 2, 5, 5, T0, 'other'), tx('c', 3, 0, 85)]),
    );
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(100n, 'Списано бонусів: 15\nБаланс: 85');
    expect(prisma.guests[0].lastRevision).toBe(3n); // курсор іде далі навіть через пропущені
  });

  it('гості без Telegram: транзакції зберігаються для статистики, сповіщень немає', async () => {
    const prisma = fakePrisma([guest({ telegramId: null, lastRevision: 0n })]);
    const syrve = fakeSyrve([tx('a', 1, 5, 5)]);
    const send = await run(prisma, syrve);
    expect(syrve.getTransactionsByRevision).toHaveBeenCalled();
    expect(prisma.history.has('a')).toBe(true);
    expect(prisma.notifications).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('статистика: зберігає всю історію (і стару), лише ненульові транзакції нашого гаманця, без дублів', async () => {
    const prisma = fakePrisma([guest()]);
    const syrve = fakeSyrve([
      tx('old', 1, 100, 100, T0 - 86_400_000),
      tx('new', 2, -30, 70),
      tx('zero', 3, 0, 70),
      tx('foreign', 4, 9, 9, T0, 'other'),
    ]);
    await run(prisma, syrve);
    expect([...prisma.history.keys()].sort()).toEqual(['new', 'old']);
    expect(prisma.history.get('new')).toMatchObject({ guestId: 'g1', sum: -30, balanceAfter: 70, revision: 2n });
    prisma.guests[0].lastRevision = 0n; // Syrve віддає те саме знову
    await run(prisma, syrve);
    expect(prisma.history.size).toBe(2);
  });

  it('помилка Telegram: повтор у наступному проході, не втрачається', async () => {
    const prisma = fakePrisma([guest({ lastRevision: 0n })]);
    const syrve = fakeSyrve([tx('a', 1, 5, 5)]);
    const send = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
    await run(prisma, syrve, send);
    expect(prisma.notifications[0].status).toBe('pending');
    await run(prisma, syrve, send);
    expect(prisma.notifications[0].status).toBe('sent');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('бот заблоковано (403): одразу failed', async () => {
    const prisma = fakePrisma([guest({ lastRevision: 0n })]);
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('Forbidden'), { error_code: 403 }));
    await run(prisma, fakeSyrve([tx('a', 1, 5, 5)]), send);
    expect(prisma.notifications[0].status).toBe('failed');
  });

  it('збій Syrve по одному гостю не блокує інших', async () => {
    const prisma = fakePrisma([guest({ id: 'g1', syrveCustomerId: 'bad', lastRevision: 0n }), guest({ id: 'g2', telegramId: 200n, lastRevision: 0n })]);
    const syrve = fakeSyrve([tx('a', 1, 5, 5)]);
    (syrve.getTransactionsByRevision as any).mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    const send = await run(prisma, syrve);
    expect(send).toHaveBeenCalledWith(200n, expect.any(String));
  });
});

describe('worker без бота', () => {
  it('збирає транзакції, але не створює й не відправляє сповіщення', async () => {
    const prisma = fakePrisma([guest({ lastRevision: 0n })]);
    await runNotificationTick({ prisma, syrve: fakeSyrve([tx('a', 1, 5, 5)]), resolveCtx: async () => CTX });
    expect(prisma.history.has('a')).toBe(true);
    expect(prisma.notifications.every((n: any) => n.status === 'pending')).toBe(true);
  });
});
