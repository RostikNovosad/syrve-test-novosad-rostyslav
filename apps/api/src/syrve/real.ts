import { TokenProvider } from './token.js';
import {
  SyrveError,
  type Customer,
  type LoyaltyProgram,
  type Organization,
  type SyrveClient,
  type TransactionsPage,
  type WalletChange,
  type WalletTransaction,
} from './types.js';

interface RealOptions {
  apiUrl: string;
  tokens: TokenProvider;
  fetchImpl?: typeof fetch;
}

const NOT_FOUND_RE = /not found|there is no user|Validation_IncorrectPhone|не найден|не знайден|doesn.?t exist|does not exist/i;

/* eslint-disable @typescript-eslint/no-explicit-any */
// Форми відповідей Syrve описані за документацією /docs; уточнюються за docs/syrve-notes.md.

export class RealSyrveClient implements SyrveClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: RealOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** POST із Bearer-токеном; при 401 один раз оновлює токен і повторює запит. */
  async post<T = any>(path: string, body: unknown): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.opts.tokens.get();
      const res = await this.fetchImpl(`${this.opts.apiUrl}/api/1/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.status === 401 && attempt === 0) {
        this.opts.tokens.invalidate();
        continue;
      }
      const text = await res.text();
      const data = text ? safeJson(text) : null;
      if (!res.ok) {
        const b = data as { errorDescription?: string; message?: string } | null;
        const desc = b?.errorDescription ?? b?.message;
        throw new SyrveError(`Syrve ${path}: ${res.status}${desc ? ` — ${desc}` : ''}`, res.status, data);
      }
      return data as T;
    }
    throw new SyrveError(`Syrve ${path}: 401 після оновлення токена`, 401);
  }

  async getOrganizations(): Promise<Organization[]> {
    const r = await this.post('organizations', {});
    return (r.organizations ?? []).map((o: any) => ({ id: o.id, name: o.name }));
  }

  async getPrograms(organizationId: string): Promise<LoyaltyProgram[]> {
    const r = await this.post('loyalty/syrve/program', { organizationId });
    // У відповіді Syrve ключ саме "Programs" (з великої літери)
    return (r.Programs ?? r.programs ?? []).map((p: any) => ({
      id: p.id,
      name: p.name ?? '',
      isActive: p.isActive ?? true,
      walletId: p.walletId ?? undefined,
    }));
  }

  async findCustomerByPhone(organizationId: string, phone: string): Promise<Customer | null> {
    return this.info(organizationId, { type: 'phone', phone });
  }

  async getCustomer(organizationId: string, customerId: string): Promise<Customer | null> {
    return this.info(organizationId, { type: 'id', id: customerId });
  }

  private async info(organizationId: string, lookup: Record<string, string>): Promise<Customer | null> {
    try {
      const r = await this.post('loyalty/syrve/customer/info', { organizationId, ...lookup });
      return r?.id ? toCustomer(r) : null;
    } catch (e) {
      // Гостя не знайдено: 404 або 400 з текстом "not found". Інші помилки (напр. невірний organizationId) пробрасуємо.
      if (e instanceof SyrveError && (e.status === 404 || (e.status === 400 && NOT_FOUND_RE.test(`${e.message} ${JSON.stringify(e.body ?? '')}`)))) {
        return null;
      }
      throw e;
    }
  }

  async createOrUpdateCustomer(
    organizationId: string,
    data: { id?: string; phone: string; name: string },
  ): Promise<string> {
    const r = await this.post('loyalty/syrve/customer/create_or_update', {
      organizationId,
      ...data,
    });
    return r.id;
  }

  async addCustomerToProgram(organizationId: string, customerId: string, programId: string) {
    const r = await this.post('loyalty/syrve/customer/program/add', { organizationId, customerId, programId });
    return { walletId: r?.walletId as string | undefined };
  }

  async addCard(organizationId: string, customerId: string, cardNumber: string) {
    await this.post('loyalty/syrve/customer/card/add', {
      organizationId,
      customerId,
      cardTrack: cardNumber,
      cardNumber,
    });
  }

  async topUp(organizationId: string, c: WalletChange) {
    await this.post('loyalty/syrve/customer/wallet/topup', {
      organizationId,
      customerId: c.customerId,
      walletId: c.walletId,
      sum: c.sum,
      comment: c.comment,
    });
  }

  async chargeOff(organizationId: string, c: WalletChange) {
    await this.post('loyalty/syrve/customer/wallet/chargeoff', {
      organizationId,
      customerId: c.customerId,
      walletId: c.walletId,
      sum: c.sum,
      comment: c.comment,
    });
  }

  async getTransactionsByRevision(
    organizationId: string,
    customerId: string,
    revision: number,
    pageSize = 100,
  ): Promise<TransactionsPage> {
    const r = await this.post('loyalty/syrve/customer/transactions/by_revision', {
      organizationId,
      customerId,
      revision,
      pageSize,
    });
    const transactions: WalletTransaction[] = (r.transactions ?? []).map((t: any) => {
      const before = t.balanceBefore ?? undefined;
      const after = t.balanceAfter ?? undefined;
      return {
        id: t.id,
        customerId,
        walletId: t.walletId,
        // знак поля sum в документації не описаний — надійніше рахувати різницю балансів
        sum: before !== undefined && after !== undefined ? round2(after - before) : Number(t.sum),
        balanceBefore: before,
        balanceAfter: after,
        comment: t.comment ?? undefined,
        createdAt: t.whenCreated,
        revision: Number(t.revision ?? 0),
      };
    });
    const maxRevision = Math.max(Number(r.lastRevision ?? 0), revision, ...transactions.map((t) => t.revision));
    return { transactions, maxRevision };
  }
}

function toCustomer(r: any): Customer {
  return {
    id: r.id,
    name: r.name ?? '',
    phone: r.phone ?? '',
    cards: (r.cards ?? []).map((c: any) => ({ number: c.number ?? c.track, track: c.track })),
    walletBalances: (r.walletBalances ?? []).map((w: any) => ({
      walletId: w.id, // у customer/info id елемента walletBalances — це id гаманця
      name: w.name,
      balance: Number(w.balance ?? 0),
    })),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
