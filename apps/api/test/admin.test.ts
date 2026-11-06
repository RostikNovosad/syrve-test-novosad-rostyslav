import { describe, expect, it, vi } from 'vitest';
import { applyOperation, OperationError } from '../src/admin/operations.js';
import { createSessionToken, verifySessionToken } from '../src/admin/session.js';
import { SyrveError, type Customer } from '../src/syrve/index.js';

describe('сесія', () => {
  const secret = 'x'.repeat(32);
  it('валідний токен повертає id адміна', () => {
    expect(verifySessionToken(createSessionToken('a1', secret), secret)).toBe('a1');
  });
  it('відхиляє підроблений підпис, інший секрет і прострочений токен', () => {
    const t = createSessionToken('a1', secret);
    expect(verifySessionToken(t.replace('a1', 'a2'), secret)).toBeNull();
    expect(verifySessionToken(t, 'y'.repeat(32))).toBeNull();
    expect(verifySessionToken(t, secret, Date.now() + 9 * 3600_000)).toBeNull();
    expect(verifySessionToken(undefined, secret)).toBeNull();
  });
});

const ctx = { organizationId: 'org', programId: 'p', walletId: 'w1' };
const customer = (balance: number): Customer => ({
  id: 'c1',
  name: 'Тест',
  phone: '+380501234567',
  cards: [{ number: '123' }],
  walletBalances: [{ walletId: 'w1', balance }],
});

function setup(balance = 100) {
  let current = balance;
  const syrve = {
    getCustomer: vi.fn(async () => customer(current)),
    topUp: vi.fn(async (_o: string, c: { sum: number }) => void (current += c.sum)),
    chargeOff: vi.fn(async (_o: string, c: { sum: number }) => void (current -= c.sum)),
  };
  const prisma = {
    guest: { findUnique: vi.fn(async () => ({ id: 'g1' })) },
    bonusOperation: {
      create: vi.fn(async () => ({ id: 'op1' })),
      update: vi.fn(async () => ({})),
    },
  };
  const run = (type: 'topup' | 'chargeoff', amount: number, reason = 'Подарунок') =>
    applyOperation({ prisma: prisma as never, syrve: syrve as never, ctx }, { customerId: 'c1', adminId: 'a1', type, amount, reason });
  return { syrve, prisma, run };
}

describe('applyOperation', () => {
  it('нараховує й повертає свіжий баланс; журнал pending → done', async () => {
    const { run, prisma, syrve } = setup(100);
    const r = await run('topup', 50);
    expect(r.customer.walletBalances[0]!.balance).toBe(150);
    expect(syrve.topUp).toHaveBeenCalledWith('org', expect.objectContaining({ walletId: 'w1', sum: 50, comment: 'Подарунок' }));
    expect(prisma.bonusOperation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'done' }) }));
  });

  it('не дозволяє списати більше за баланс і не пише в журнал', async () => {
    const { run, prisma, syrve } = setup(30);
    await expect(run('chargeoff', 31)).rejects.toThrow(/Недостатньо/);
    expect(syrve.chargeOff).not.toHaveBeenCalled();
    expect(prisma.bonusOperation.create).not.toHaveBeenCalled();
  });

  it('дозволяє списати рівно весь баланс', async () => {
    const { run } = setup(30);
    expect((await run('chargeoff', 30)).customer.walletBalances[0]!.balance).toBe(0);
  });

  it.each([0, -5, NaN])('відхиляє суму %s', async (amount) => {
    await expect(setup().run('topup', amount)).rejects.toBeInstanceOf(OperationError);
  });

  it('вимагає причину', async () => {
    await expect(setup().run('topup', 10, '  ')).rejects.toThrow(/причину/);
  });

  it('помилка Syrve → журнал failed, клієнту зрозуміле повідомлення', async () => {
    const { run, prisma, syrve } = setup();
    syrve.topUp.mockRejectedValueOnce(new SyrveError('boom', 500));
    await expect(run('topup', 10)).rejects.toMatchObject({ status: 502 });
    expect(prisma.bonusOperation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }));
  });
});
