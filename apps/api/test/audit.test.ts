import { describe, expect, it, vi } from 'vitest';
import { diffFields, logAction } from '../src/admin/audit.js';

describe('diffFields', () => {
  it('повертає лише змінені поля зі старим і новим значенням', () => {
    expect(diffFields({ name: 'А', phone: '+1' }, { name: 'Б', phone: '+1' })).toEqual({ name: ['А', 'Б'] });
  });
  it('порожній обʼєкт, якщо нічого не змінилося', () => {
    expect(diffFields({ name: 'А' }, { name: 'А' })).toEqual({});
  });
});

describe('logAction', () => {
  const admin = { id: 'a1', login: 'boss' };
  it('пише знімок логіну й дані цілі', async () => {
    const create = vi.fn(async () => ({}));
    await logAction({ auditLog: { create } } as never, admin, { action: 'guest.create', targetType: 'guest', targetId: 'c1', targetLabel: 'Ім' });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ adminId: 'a1', adminLogin: 'boss', action: 'guest.create', targetId: 'c1', targetLabel: 'Ім' }),
    });
  });
  it('збій журналу не кидає помилку, а передається в onError', async () => {
    const create = vi.fn(async () => {
      throw new Error('db down');
    });
    const onError = vi.fn();
    await expect(logAction({ auditLog: { create } } as never, admin, { action: 'auth.login' }, onError)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
  });
});
