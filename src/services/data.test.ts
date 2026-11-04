import { describe, it, expect, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

import { collectStorageUrls } from './data';

describe('collectStorageUrls', () => {
  it('encuentra evidencias, firmas y garantías en cualquier nivel', () => {
    const base = 'https://x.supabase.co/storage/v1/object/public/order-photos/orders/1';
    const order = {
      initialEvidence: [`${base}/a.jpg`, 'data:image/jpeg;base64,AAA'],
      finalEvidence: [`${base}/b.jpg`],
      closingData: { technicianSignature: `${base}/sig.png`, evidenceImages: [`${base}/c.jpg`] },
      warrantyJobs: [{ evidenceImages: [`${base}/d.jpg`] }],
      description: 'ver https://example.com',
    };
    expect(collectStorageUrls(order).sort()).toEqual(
      ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'sig.png'].map(f => `${base}/${f}`).sort(),
    );
  });
});
