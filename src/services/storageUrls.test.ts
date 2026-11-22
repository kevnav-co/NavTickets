// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createSignedUrls = vi.fn();
vi.mock('./supabase', () => ({
  supabase: { storage: { from: (bucket: string) => ({ createSignedUrls: (paths: string[], ttl: number) => createSignedUrls(bucket, paths, ttl) }) } },
}));
vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co');

import { __resetStorageUrlCache, cachedStorageUrl, resolveStorageUrl } from './storageUrls';

const pub = (bucket: string, path: string) => `https://abc.supabase.co/storage/v1/object/public/${bucket}/${path}`;

beforeEach(() => {
  __resetStorageUrlCache();
  createSignedUrls.mockImplementation(async (bucket: string, paths: string[]) => ({
    data: paths.map((p) => ({ path: p, signedUrl: `https://abc.supabase.co/storage/v1/object/sign/${bucket}/${p}?token=t-${p}`, error: null })),
    error: null,
  }));
});
afterEach(() => vi.clearAllMocks());

describe('resolveStorageUrl', () => {
  it('agrupa en una llamada por bucket y guarda en caché', async () => {
    const urls = [pub('order-photos', 'c/a.jpg'), pub('order-photos', 'c/b.jpg'), pub('equipment-photos', 'c/e.jpg'), pub('order-photos', 'c/a.jpg')];
    const out = await Promise.all(urls.map(resolveStorageUrl));
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
    expect(createSignedUrls).toHaveBeenCalledWith('order-photos', ['c/a.jpg', 'c/b.jpg'], 3600);
    expect(out[0]).toContain('token=t-c/a.jpg');
    expect(out[3]).toBe(out[0]);
    expect(cachedStorageUrl(urls[1])).toBe(out[1]);
    await resolveStorageUrl(urls[0]);
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });

  it('las URLs que no son de fotos privadas no se firman', async () => {
    expect(await resolveStorageUrl('data:image/png;base64,A')).toBe('data:image/png;base64,A');
    expect(await resolveStorageUrl(pub('company-assets', 'companies/c/logo.png'))).toBe(pub('company-assets', 'companies/c/logo.png'));
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('si la firma falla, usa la copia sin conexión del service worker', async () => {
    createSignedUrls.mockResolvedValueOnce({ data: null, error: new Error('sin red') });
    expect(await resolveStorageUrl(pub('order-photos', 'c/z.jpg')))
      .toBe('https://abc.supabase.co/storage/v1/object/sign/order-photos/c/z.jpg');
  });

  it('sin conexión no intenta firmar', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(await resolveStorageUrl(pub('order-photos', 'c/off.jpg')))
      .toBe('https://abc.supabase.co/storage/v1/object/sign/order-photos/c/off.jpg');
    expect(createSignedUrls).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
