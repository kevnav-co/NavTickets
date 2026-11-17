import { describe, it, expect, vi } from 'vitest';

vi.mock('../context/DataContext', () => ({ useData: () => ({}) }));
vi.mock('./useValidatedActions', () => ({ useValidatedActions: () => ({}) }));
vi.mock('./useSupabaseStorage', () => ({ useSupabaseStorage: () => ({}) }));

import { extensionForDataUrl, findBase64Fields } from './useBackgroundSync';

describe('findBase64Fields', () => {
  it('encuentra data URLs en raíz, arrays y objetos anidados', () => {
    const order = {
      id: 'o1',
      initialEvidence: ['https://x/a.jpg', 'data:image/jpeg;base64,AAA'],
      closingData: { technicianSignature: 'data:image/png;base64,BBB', notes: 'ok' },
      warrantyJobs: [{ evidenceImages: ['data:image/webp;base64,CCC'] }],
    };
    expect(findBase64Fields(order).map(f => f.path.join('.'))).toEqual([
      'initialEvidence.1',
      'closingData.technicianSignature',
      'warrantyJobs.0.evidenceImages.0',
    ]);
  });

  it('ignora strings que no son imágenes', () => {
    expect(findBase64Fields({ a: 'data:text/plain;base64,xx', b: 'hola' })).toEqual([]);
  });
});

describe('extensionForDataUrl', () => {
  it('usa el MIME real', () => {
    expect(extensionForDataUrl('data:image/png;base64,x')).toBe('png');
    expect(extensionForDataUrl('data:image/jpeg;base64,x')).toBe('jpg');
    expect(extensionForDataUrl('data:image/webp;base64,x')).toBe('webp');
    expect(extensionForDataUrl('data:image/svg+xml;base64,x')).toBe('svg');
  });
});
