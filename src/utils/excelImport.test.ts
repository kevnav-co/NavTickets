import { describe, expect, it } from 'vitest';
import { rowsToObjects } from './excelImport';

describe('rowsToObjects', () => {
  it('usa la primera fila como encabezados y omite celdas vacías', () => {
    expect(rowsToObjects([
      ['Identificación', 'Nombre', 'Correo'],
      ['900123', 'ACME', null],
      [null, null, null],
      ['800456', ' ', 'b@x.co'],
    ])).toEqual([
      { 'Identificación': '900123', Nombre: 'ACME' },
      { 'Identificación': '800456', Correo: 'b@x.co' },
    ]);
  });

  it('renombra encabezados repetidos y descarta columnas sin encabezado', () => {
    expect(rowsToObjects([
      ['Telefono', 'Telefono', null],
      ['1', '2', 'sin título'],
    ])).toEqual([{ Telefono: '1', Telefono_1: '2' }]);
  });

  it('conserva números, booleanos y fechas', () => {
    const d = new Date('2026-01-02T00:00:00Z');
    expect(rowsToObjects([['n', 'b', 'f'], [42, true, d]])).toEqual([{ n: 42, b: true, f: d }]);
  });

  it('hoja vacía o solo encabezados', () => {
    expect(rowsToObjects([])).toEqual([]);
    expect(rowsToObjects([['a', 'b']])).toEqual([]);
  });
});

describe('lectura de un .xlsx real', () => {
  it('lee la primera hoja de un archivo de Excel', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { readSheet } = await import('read-excel-file/node');
    const path = fileURLToPath(new URL('./__fixtures__/clientes.xlsx', import.meta.url));
    const rows = await readSheet(readFileSync(path));
    expect(rowsToObjects(rows as never)).toEqual([
      { 'Identificación': 900123456, Nombre: 'ACME Plásticos', Ciudad: 'Cali' },
      { 'Identificación': 800987654, Nombre: 'Polímeros del Valle' },
    ]);
  });
});

describe('readFirstSheet', () => {
  it('rechaza .xls y archivos de más de 5 MB antes de leerlos', async () => {
    const { readFirstSheet } = await import('./excelImport');
    await expect(readFirstSheet(new File(['x'], 'viejo.xls'))).rejects.toThrow('.xlsx');
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.xlsx');
    await expect(readFirstSheet(big)).rejects.toThrow('5 MB');
  });
});
