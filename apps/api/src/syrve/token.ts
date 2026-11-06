import { SyrveError } from './types.js';

interface TokenOptions {
  apiUrl: string;
  apiLogin: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Час життя токена Syrve — 1 година */
  ttlMs?: number;
  /** Оновлюємо за стільки мс до спливу */
  skewMs?: number;
}

/** Кеш токена з автооновленням; одночасно виконується лише один refresh. */
export class TokenProvider {
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly skewMs: number;

  constructor(private readonly opts: TokenOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
    this.ttlMs = opts.ttlMs ?? 60 * 60 * 1000;
    this.skewMs = opts.skewMs ?? 5 * 60 * 1000;
  }

  async get(): Promise<string> {
    if (this.token && this.now() < this.expiresAt - this.skewMs) return this.token;
    return this.refresh();
  }

  /** Скинути кеш (після 401) і отримати новий токен. */
  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  refresh(): Promise<string> {
    if (!this.inflight) {
      this.inflight = this.fetchToken().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async fetchToken(): Promise<string> {
    const res = await this.fetchImpl(`${this.opts.apiUrl}/api/1/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiLogin: this.opts.apiLogin }),
    });
    const body = (await res.json().catch(() => null)) as { token?: string } | null;
    if (!res.ok || !body?.token) {
      throw new SyrveError(`Не вдалося отримати токен Syrve (${res.status})`, res.status, body);
    }
    this.token = body.token;
    this.expiresAt = this.now() + this.ttlMs;
    return body.token;
  }
}
