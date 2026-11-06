import { describe, expect, it, vi } from 'vitest';
import { normalizePhone } from '../src/bot/phone.js';
import { PhoneTakenError, registerGuest } from '../src/bot/registration.js';
import type { Customer, SyrveClient } from '../src/syrve/index.js';

describe('normalizePhone', () => {
  it.each(['+380501234567', '380501234567', '0501234567', '050 123-45-67'])('%s', (raw) => {
    expect(normalizePhone(raw)).toBe('+380501234567');
  });
  it('відхиляє не-українські', () => {
    expect(normalizePhone('+48123456789')).toBeNull();
  });
});

const ORG = 'org-1';
const PROGRAM = 'prog-1';

/** Мінімальний тестовий дублер Syrve (лише для юніт-тестів, не режим сервісу). */
class FakeSyrve {
  customers = new Map<string, Customer>();
  async findCustomerByPhone(_o: string, phone: string) {
    return [...this.customers.values()].find((c) => c.phone === phone) ?? null;
  }
  async getCustomer(_o: string, id: string) {
    return this.customers.get(id) ?? null;
  }
  async createOrUpdateCustomer(_o: string, d: { id?: string; phone: string; name: string }) {
    const id = d.id ?? `c${this.customers.size + 1}`;
    const c = this.customers.get(id) ?? { id, name: d.name, phone: d.phone, cards: [], walletBalances: [] };
    this.customers.set(id, { ...c, name: d.name, phone: d.phone });
    return id;
  }
  async addCustomerToProgram(_o: string, id: string, programId: string) {
    this.customers.get(id)!.walletBalances.push({ walletId: 'w1', programId, balance: 0 });
    return { walletId: 'w1' };
  }
  async addCard(_o: string, id: string, number: string) {
    this.customers.get(id)!.cards.push({ number });
  }
}
const newSyrve = () => new FakeSyrve() as unknown as SyrveClient & FakeSyrve;

function fakePrisma() {
  const rows: any[] = [];
  return {
    rows,
    guest: {
      findUnique: vi.fn(async ({ where }: any) =>
        rows.find((r) => (where.telegramId !== undefined ? r.telegramId === where.telegramId : r.phone === where.phone)) ?? null),
      create: vi.fn(async ({ data }: any) => (rows.push(data), data)),
      update: vi.fn(async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data)),
    },
  } as any;
}

describe('registerGuest', () => {
  const ctx = { organizationId: ORG, programId: PROGRAM, walletId: 'w1' };

  it('створює гостя, програму й картку', async () => {
    const syrve = newSyrve();
    const prisma = fakePrisma();
    const g = await registerGuest({ prisma, syrve, ctx }, { telegramId: 1n, phone: '+380501234567', name: 'Іра' });
    const c = await syrve.getCustomer(ORG, g.syrveCustomerId);
    expect(c?.cards[0]?.number).toBe(g.cardNumber);
    expect(c?.walletBalances).toHaveLength(1);
  });

  it('повторна реєстрація того ж telegram не дублює', async () => {
    const syrve = newSyrve();
    const prisma = fakePrisma();
    const input = { telegramId: 1n, phone: '+380501234567', name: 'Іра' };
    await registerGuest({ prisma, syrve, ctx }, input);
    await registerGuest({ prisma, syrve, ctx }, input);
    expect(prisma.rows).toHaveLength(1);
  });

  it('використовує існуючого гостя Syrve за телефоном', async () => {
    const syrve = newSyrve();
    const existingId = await syrve.createOrUpdateCustomer(ORG, { phone: '+380501234567', name: 'З кабінету' });
    const g = await registerGuest({ prisma: fakePrisma(), syrve, ctx }, { telegramId: 2n, phone: '+380501234567', name: 'Нове' });
    expect(g.syrveCustomerId).toBe(existingId);
  });

  it('телефон іншого telegram-акаунта → помилка', async () => {
    const syrve = newSyrve();
    const prisma = fakePrisma();
    await registerGuest({ prisma, syrve, ctx }, { telegramId: 1n, phone: '+380501234567', name: 'А' });
    await expect(
      registerGuest({ prisma, syrve, ctx }, { telegramId: 2n, phone: '+380501234567', name: 'Б' }),
    ).rejects.toBeInstanceOf(PhoneTakenError);
  });

  it('гість, створений адміном без Telegram, привʼязується до акаунта в боті', async () => {
    const syrve = newSyrve();
    const prisma = fakePrisma();
    const created = await registerGuest({ prisma, syrve, ctx }, { telegramId: null, phone: '+380501234567', name: 'Адмін' });
    prisma.rows[0].id = 'g1';
    const linked = await registerGuest({ prisma, syrve, ctx }, { telegramId: 7n, phone: '+380501234567', name: 'Бот' });
    expect(prisma.rows).toHaveLength(1);
    expect(linked.telegramId).toBe(7n);
    expect(linked.syrveCustomerId).toBe(created.syrveCustomerId);
  });

  it('двічі створити гостя з одним номером з панелі не можна', async () => {
    const syrve = newSyrve();
    const prisma = fakePrisma();
    await registerGuest({ prisma, syrve, ctx }, { telegramId: null, phone: '+380501234567', name: 'А' });
    await expect(
      registerGuest({ prisma, syrve, ctx }, { telegramId: null, phone: '+380501234567', name: 'Б' }),
    ).rejects.toBeInstanceOf(PhoneTakenError);
  });
});
