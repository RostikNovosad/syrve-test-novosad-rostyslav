import { describe, expect, it, vi } from 'vitest';
import { RealSyrveClient } from '../src/syrve/real.js';
import { TokenProvider } from '../src/syrve/token.js';

describe('RealSyrveClient', () => {
  it('на 401 оновлює токен і повторює запит один раз', async () => {
    let tokenN = 0;
    const calls: string[] = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('access_token')) return new Response(JSON.stringify({ token: `t${++tokenN}` }));
      const auth = (init.headers as Record<string, string>).Authorization;
      calls.push(String(auth));
      if (auth === 'Bearer t1') return new Response('{}', { status: 401 });
      return new Response(JSON.stringify({ organizations: [{ id: 'o', name: 'Org' }] }));
    });
    const tokens = new TokenProvider({ apiUrl: 'http://x', apiLogin: 'k', fetchImpl: f as never });
    const c = new RealSyrveClient({ apiUrl: 'http://x', tokens, fetchImpl: f as never });
    expect(await c.getOrganizations()).toEqual([{ id: 'o', name: 'Org' }]);
    expect(calls).toEqual(['Bearer t1', 'Bearer t2']);
  });
});

// Фікстури відповідають OpenAPI-специфікації Syrve (/api-docs/docs)
describe('RealSyrveClient: форми відповідей за документацією', () => {
  function client(responses: Record<string, unknown>, status = 200) {
    const f = vi.fn(async (url: string) => {
      if (url.endsWith('access_token')) return new Response(JSON.stringify({ token: 't' }));
      const key = Object.keys(responses).find((k) => url.endsWith(k))!;
      return new Response(JSON.stringify(responses[key]), { status });
    });
    const tokens = new TokenProvider({ apiUrl: 'http://x', apiLogin: 'k', fetchImpl: f as never });
    return new RealSyrveClient({ apiUrl: 'http://x', tokens, fetchImpl: f as never });
  }

  it('програми: ключ Programs та walletId', async () => {
    const c = client({ 'loyalty/syrve/program': { Programs: [{ id: 'p1', name: 'P', isActive: true, walletId: 'w1' }] } });
    expect(await c.getPrograms('o')).toEqual([{ id: 'p1', name: 'P', isActive: true, walletId: 'w1' }]);
  });

  it('customer/info: walletBalances[].id — це walletId', async () => {
    const c = client({
      'customer/info': {
        id: 'c1', name: 'Іра', phone: '+380501112233',
        cards: [{ id: 'k', track: 'T1', number: '123' }],
        walletBalances: [{ id: 'w1', name: 'Бонуси', type: 1, balance: 42.5 }],
      },
    });
    const g = await c.findCustomerByPhone('o', '+380501112233');
    expect(g?.walletBalances).toEqual([{ walletId: 'w1', name: 'Бонуси', balance: 42.5 }]);
    expect(g?.cards[0]?.number).toBe('123');
  });

  it('гостя не знайдено → null, інша 400 → помилка', async () => {
    const nf = client({ 'customer/info': { errorDescription: 'Customer not found' } }, 400);
    expect(await nf.findCustomerByPhone('o', '+380')).toBeNull();
    const real = client(
      { 'customer/info': { errorCode: 'Validation_IncorrectPhone', message: 'There is no user with phone +380680245450' } },
      400,
    );
    expect(await real.findCustomerByPhone('o', '+380')).toBeNull();
    const bad = client({ 'customer/info': { errorDescription: 'Invalid organizationId' } }, 400);
    await expect(bad.findCustomerByPhone('o', '+380')).rejects.toThrow(/Invalid organizationId/);
  });

  it('by_revision: зміна рахується з balanceBefore/After, lastRevision', async () => {
    const c = client({
      'by_revision': {
        transactions: [{ id: 't1', walletId: 'w1', sum: 10, balanceBefore: 5, balanceAfter: 15, whenCreated: '2025-01-01 10:00:00.000', revision: 7 }],
        lastRevision: 7,
      },
    });
    const r = await c.getTransactionsByRevision('o', 'c1', 0);
    expect(r.maxRevision).toBe(7);
    expect(r.transactions[0]).toMatchObject({ id: 't1', customerId: 'c1', sum: 10, balanceAfter: 15 });
  });
});
