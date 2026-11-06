import { describe, expect, it, vi } from 'vitest';
import { TokenProvider } from '../src/syrve/token.js';

const ok = (token: string) => new Response(JSON.stringify({ token }), { status: 200 });

describe('TokenProvider', () => {
  it('кешує токен', async () => {
    const f = vi.fn(async () => ok('t1'));
    const p = new TokenProvider({ apiUrl: 'http://x', apiLogin: 'k', fetchImpl: f as never });
    expect(await p.get()).toBe('t1');
    expect(await p.get()).toBe('t1');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('оновлює токен до спливу', async () => {
    let t = 0;
    let n = 0;
    const f = vi.fn(async () => ok(`t${++n}`));
    const p = new TokenProvider({ apiUrl: 'http://x', apiLogin: 'k', fetchImpl: f as never, now: () => t });
    expect(await p.get()).toBe('t1');
    t = 56 * 60 * 1000; // < 5 хв до спливу
    expect(await p.get()).toBe('t2');
  });

  it('один refresh одночасно', async () => {
    const f = vi.fn(async () => ok('t1'));
    const p = new TokenProvider({ apiUrl: 'http://x', apiLogin: 'k', fetchImpl: f as never });
    await Promise.all([p.get(), p.get(), p.get()]);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
