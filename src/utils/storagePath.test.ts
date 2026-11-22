import { describe, it, expect } from 'vitest';
import { storageObjectFromPublicUrl } from './storagePath';

describe('storageObjectFromPublicUrl', () => {
  it('separa bucket y ruta, decodificando y sin query', () => {
    expect(storageObjectFromPublicUrl('https://x.supabase.co/storage/v1/object/public/order-photos/orders/1/a%20b.jpg?t=1'))
      .toEqual({ bucket: 'order-photos', path: 'orders/1/a b.jpg' });
  });
  it('devuelve null si no es una URL pública de Storage', () => {
    expect(storageObjectFromPublicUrl('https://example.com/a.jpg')).toBeNull();
    expect(storageObjectFromPublicUrl('https://x.supabase.co/storage/v1/object/public/solo-bucket')).toBeNull();
  });
});

describe('safeFileName', () => {
  it('elimina separadores de ruta, espacios y tildes', async () => {
    const { safeFileName } = await import('./storagePath');
    expect(safeFileName('../../otra empresa/foto ñandú.jpg')).toBe('otra_empresa_foto_nandu.jpg');
    expect(safeFileName('...')).toBe('archivo');
  });
});

import { companyScopedPath, extensionForImageType, isAllowedImageType, ALLOWED_COMPANY_IMAGE_TYPES } from './storagePath';

describe('companyScopedPath', () => {
  const C = '5a000000-0000-0000-0000-00000000000a';
  it('antepone la empresa', () => {
    expect(companyScopedPath(C, 'orders/abc/initialPhotos/1.jpg')).toBe(`${C}/orders/abc/initialPhotos/1.jpg`);
  });
  it('no duplica el prefijo y quita barras iniciales', () => {
    expect(companyScopedPath(C, `/${C}/orders/x.jpg`)).toBe(`${C}/orders/x.jpg`);
  });
  it('rechaza rutas con .., vacías o con empresa no válida', () => {
    expect(() => companyScopedPath(C, 'orders/../../otra/x.jpg')).toThrow();
    expect(() => companyScopedPath(C, '')).toThrow();
    expect(() => companyScopedPath(C, 'orders//x.jpg')).toThrow();
    expect(() => companyScopedPath('', 'orders/x.jpg')).toThrow();
  });
});

describe('tipos de imagen', () => {
  it('admite JPEG/PNG/WebP/GIF y rechaza SVG', () => {
    expect(isAllowedImageType('image/jpeg')).toBe(true);
    expect(isAllowedImageType('image/png; charset=binary')).toBe(true);
    expect(isAllowedImageType('image/svg+xml')).toBe(false);
    expect(isAllowedImageType('')).toBe(false);
  });
  it('los logos no admiten GIF', () => {
    expect(isAllowedImageType('image/gif', ALLOWED_COMPANY_IMAGE_TYPES)).toBe(false);
  });
  it('la extensión sale del tipo real', () => {
    expect(extensionForImageType('image/jpeg')).toBe('jpg');
    expect(extensionForImageType('image/svg+xml')).toBe('bin');
  });
});
