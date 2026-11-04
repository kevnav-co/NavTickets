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
