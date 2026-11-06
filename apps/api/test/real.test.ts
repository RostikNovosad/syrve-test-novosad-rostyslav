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
