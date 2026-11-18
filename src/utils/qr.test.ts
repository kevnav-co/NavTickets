import { describe, expect, it } from 'vitest';
import { makeQrMatrix, qrSvgPath } from './qr';

describe('qrSvgPath', () => {
  it('une los módulos contiguos de una fila y aplica el margen', () => {
    const m = [
      [true, true, false, true],
      [false, false, false, false],
      [false, true, true, true],
    ];
    expect(qrSvgPath(m, 1)).toBe('M1 1h2v1h-2zM4 1h1v1h-1zM2 3h3v1h-3z');
  });

  it('una matriz vacía no dibuja nada', () => {
    expect(qrSvgPath([[false, false]], 4)).toBe('');
  });
});

describe('makeQrMatrix', () => {
  it('genera una matriz cuadrada con los patrones de posición en las esquinas', async () => {
    const m = await makeQrMatrix('https://navtickets.vercel.app/#/asistente/plasticos-del-sur');
    const n = m.length;
    expect(n).toBeGreaterThanOrEqual(21);
    expect((n - 17) % 4).toBe(0); // tamaño de una versión QR: 17 + 4·v
    m.forEach(row => expect(row).toHaveLength(n));
    // Esquina superior izquierda: anillo exterior oscuro de 7×7 con hueco claro.
    expect(m[0].slice(0, 7).every(Boolean)).toBe(true);
    expect(m[1][1]).toBe(false);
    expect(m[3][3]).toBe(true);
    expect(m[0][n - 1]).toBe(true);
    expect(m[n - 1][0]).toBe(true);
  });
});
