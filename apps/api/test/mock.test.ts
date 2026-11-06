import { describe, expect, it } from 'vitest';
import { MockSyrveClient, MOCK_ORG, MOCK_PROGRAM } from '../src/syrve/mock.js';
import { discoverSyrve } from '../src/syrve/index.js';

async function setup() {
  const s = new MockSyrveClient();
  const id = await s.createOrUpdateCustomer(MOCK_ORG.id, { phone: '+380501112233', name: 'Іра' });
  await s.addCustomerToProgram(MOCK_ORG.id, id, MOCK_PROGRAM.id);
  const c = (await s.getCustomer(MOCK_ORG.id, id))!;
  return { s, id, walletId: c.walletBalances[0]!.walletId };
}

describe('MockSyrveClient', () => {
  it('знаходить організацію й програму (О1)', async () => {
    const r = await discoverSyrve(new MockSyrveClient());
    expect(r.organization.id).toBe(MOCK_ORG.id);
    expect(r.program.id).toBe(MOCK_PROGRAM.id);
  });

  it('не створює дубль за телефоном', async () => {
    const { s, id } = await setup();
    const again = await s.createOrUpdateCustomer(MOCK_ORG.id, { phone: '+380501112233', name: 'Ірина' });
    expect(again).toBe(id);
  });

  it('нараховує, списує і не дає піти в мінус', async () => {
    const { s, id, walletId } = await setup();
    await s.topUp(MOCK_ORG.id, { customerId: id, walletId, sum: 100 });
    await s.chargeOff(MOCK_ORG.id, { customerId: id, walletId, sum: 30 });
    expect((await s.getCustomer(MOCK_ORG.id, id))!.walletBalances[0]!.balance).toBe(70);
    await expect(s.chargeOff(MOCK_ORG.id, { customerId: id, walletId, sum: 71 })).rejects.toThrow();
  });

  it('транзакції за revision', async () => {
    const { s, id, walletId } = await setup();
    await s.topUp(MOCK_ORG.id, { customerId: id, walletId, sum: 10 });
    const p1 = await s.getTransactionsByRevision(MOCK_ORG.id, 0);
    expect(p1.transactions).toHaveLength(1);
    const p2 = await s.getTransactionsByRevision(MOCK_ORG.id, p1.maxRevision);
    expect(p2.transactions).toHaveLength(0);
  });
});
