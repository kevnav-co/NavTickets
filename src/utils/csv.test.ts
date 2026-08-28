import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

describe('toCsv (Fase 6 — Informes)', () => {
  it('serializa header + filas con CRLF', () => {
    const csv = toCsv(['Técnico', 'Total'], [['Ana', 3], ['Luis', 5]]);
    expect(csv).toContain('Técnico,Total\r\nAna,3\r\nLuis,5');
  });

  it('escapa celdas con comas, comillas y saltos de línea', () => {
    const csv = toCsv(['Nombre'], [['Ana, María "La" \n Siguiente']]);
    expect(csv).toContain('"Ana, María ""La"" \n Siguiente"');
  });

  it('convierte null/undefined a celda vacía', () => {
    const csv = toCsv(['A', 'B'], [[null, undefined]]);
    expect(csv).toContain(',');
    expect(csv).not.toContain('null');
    expect(csv).not.toContain('undefined');
  });
});