import { describe, it, expect, vi, beforeEach } from 'vitest';

const upsert = vi.fn();
vi.mock('../services/supabase', () => ({
  supabase: { from: (table: string) => ({ upsert: (...args: unknown[]) => upsert(table, ...args) }) },
}));

import { savePushSubscription } from './webPush';

const sub = (json: unknown) => ({ toJSON: () => json }) as unknown as PushSubscription;

beforeEach(() => {
  upsert.mockReset();
  vi.stubGlobal('navigator', { userAgent: 'Prueba/1.0' });
});

describe('savePushSubscription', () => {
  it('guarda endpoint y claves en push_subscriptions sin duplicar por endpoint', async () => {
    upsert.mockResolvedValue({ error: null });
    await savePushSubscription(sub({ endpoint: 'https://push.example/abc', keys: { auth: 'A', p256dh: 'P' } }), 'u1', 'c1');
    expect(upsert).toHaveBeenCalledWith(
      'push_subscriptions',
      { user_id: 'u1', company_id: 'c1', endpoint: 'https://push.example/abc', auth: 'A', p256dh: 'P', user_agent: 'Prueba/1.0' },
      { onConflict: 'endpoint', ignoreDuplicates: true },
    );
  });

  it('rechaza una suscripción sin claves', async () => {
    await expect(savePushSubscription(sub({ endpoint: 'https://push.example/abc' }), 'u1', 'c1')).rejects.toThrow(/claves/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('propaga el error de la base de datos', async () => {
    upsert.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } });
    await expect(savePushSubscription(sub({ endpoint: 'e', keys: { auth: 'A', p256dh: 'P' } }), 'u1', 'c1')).rejects.toThrow(/row-level security/);
  });
});
