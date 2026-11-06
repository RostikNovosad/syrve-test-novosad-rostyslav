import { randomUUID } from 'node:crypto';
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

export const MOCK_ORG: Organization = { id: 'mock-org-1', name: 'Тестове кафе (mock)' };
export const MOCK_PROGRAM: LoyaltyProgram = { id: 'mock-program-1', name: 'Бонусна програма (mock)', isActive: true };
export const MOCK_WALLET_ID = 'mock-wallet-1';

/** Імітатор Syrve в памʼяті: дозволяє запускати й демонструвати сервіс без доступу до Syrve. */
export class MockSyrveClient implements SyrveClient {
  private customers = new Map<string, Customer>();
  private transactions: WalletTransaction[] = [];
  private revision = 0;

  async getOrganizations() {
    return [MOCK_ORG];
  }

  async getPrograms() {
    return [MOCK_PROGRAM];
  }

  async findCustomerByPhone(_org: string, phone: string) {
    for (const c of this.customers.values()) if (c.phone === phone) return structuredClone(c);
    return null;
  }

  async getCustomer(_org: string, customerId: string) {
    const c = this.customers.get(customerId);
    return c ? structuredClone(c) : null;
  }

  async createOrUpdateCustomer(_org: string, data: { id?: string; phone: string; name: string }) {
    const existing =
      (data.id ? this.customers.get(data.id) : undefined) ??
      [...this.customers.values()].find((c) => c.phone === data.phone);
    if (existing) {
      existing.name = data.name;
      existing.phone = data.phone;
      return existing.id;
    }
    const id = randomUUID();
    this.customers.set(id, { id, name: data.name, phone: data.phone, cards: [], walletBalances: [] });
    return id;
  }

  async addCustomerToProgram(_org: string, customerId: string, programId: string) {
    const c = this.mustGet(customerId);
    if (!c.walletBalances.some((w) => w.programId === programId)) {
      c.walletBalances.push({ walletId: MOCK_WALLET_ID, programId, name: MOCK_PROGRAM.name, balance: 0 });
    }
  }

  async addCard(_org: string, customerId: string, cardNumber: string) {
    const c = this.mustGet(customerId);
    if (!c.cards.some((x) => x.number === cardNumber)) c.cards.push({ number: cardNumber, track: cardNumber });
  }

  async topUp(_org: string, change: WalletChange) {
    this.apply(change, +1);
  }

  async chargeOff(_org: string, change: WalletChange) {
    this.apply(change, -1);
  }

  async getTransactionsByRevision(_org: string, revision: number): Promise<TransactionsPage> {
    const transactions = this.transactions.filter((t) => t.revision > revision);
    return { transactions, maxRevision: Math.max(revision, this.revision) };
  }

  /** Dev: імітує транзакцію, зроблену поза нашим сервісом (напр. у кабінеті Syrve). */
  simulateTransaction(customerId: string, sum: number, comment = 'Імітація (mock)') {
    this.apply({ customerId, walletId: MOCK_WALLET_ID, sum: Math.abs(sum), comment }, sum >= 0 ? +1 : -1);
  }

  private apply(change: WalletChange, sign: 1 | -1) {
    if (!(change.sum > 0)) throw new SyrveError('Сума має бути більшою за 0', 400);
    const c = this.mustGet(change.customerId);
    const wallet = c.walletBalances.find((w) => w.walletId === change.walletId);
    if (!wallet) throw new SyrveError('Гаманець не знайдено', 404);
    if (sign < 0 && wallet.balance < change.sum) throw new SyrveError('Недостатньо коштів', 400);
    wallet.balance = round2(wallet.balance + sign * change.sum);
    this.transactions.push({
      id: randomUUID(),
      customerId: c.id,
      walletId: wallet.walletId,
      sum: sign * change.sum,
      balanceAfter: wallet.balance,
      comment: change.comment,
      createdAt: new Date().toISOString(),
      revision: ++this.revision,
    });
  }

  private mustGet(customerId: string): Customer {
    const c = this.customers.get(customerId);
    if (!c) throw new SyrveError('Гостя не знайдено', 404);
    return c;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
