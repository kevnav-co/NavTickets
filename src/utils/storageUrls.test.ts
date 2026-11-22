import { describe, expect, it } from 'vitest';
import { offlineStorageUrl, privateStorageRef, stripSignedToken } from './storageUrls';

const BASE = 'https://abc.supabase.co';

describe('privateStorageRef', () => {
  it('reconoce fotos de órdenes y equipos por su URL pública', () => {
    expect(privateStorageRef(`${BASE}/storage/v1/object/public/order-photos/c1/orders/o1/a%20b.jpg`))
      .toEqual({ bucket: 'order-photos', path: 'c1/orders/o1/a b.jpg' });
    expect(privateStorageRef(`${BASE}/storage/v1/object/public/equipment-photos/equipment/e1/x.png`))
      .toEqual({ bucket: 'equipment-photos', path: 'equipment/e1/x.png' });
  });
  it('también reconoce una URL ya firmada', () => {
    expect(privateStorageRef(`${BASE}/storage/v1/object/sign/order-photos/c1/a.jpg?token=xyz`))
      .toEqual({ bucket: 'order-photos', path: 'c1/a.jpg' });
  });
  it('deja tal cual logos públicos, data:, blob: y URLs externas', () => {
    expect(privateStorageRef(`${BASE}/storage/v1/object/public/company-assets/companies/c1/logo.png`)).toBeNull();
    expect(privateStorageRef('data:image/png;base64,AAA')).toBeNull();
    expect(privateStorageRef('blob:https://x/1')).toBeNull();
    expect(privateStorageRef('https://example.com/a.jpg')).toBeNull();
    expect(privateStorageRef(undefined)).toBeNull();
  });
});

describe('claves de caché sin conexión', () => {
  it('la URL sin token coincide con la firmada sin su token', () => {
    const ref = { bucket: 'order-photos', path: 'c1/orders/o1/a b.jpg' };
    const offline = offlineStorageUrl(`${BASE}/`, ref);
    expect(offline).toBe(`${BASE}/storage/v1/object/sign/order-photos/c1/orders/o1/a%20b.jpg`);
    expect(stripSignedToken(`${offline}?token=abc.def`)).toBe(offline);
  });
  it('stripSignedToken no toca otras URLs', () => {
    const u = `${BASE}/storage/v1/object/public/order-photos/a.jpg?token=x`;
    expect(stripSignedToken(u)).toBe(u);
    expect(stripSignedToken('no es url')).toBe('no es url');
  });
});
