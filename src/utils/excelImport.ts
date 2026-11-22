// Importación de Excel (.xlsx) para el análisis de clientes y equipos.
// Sustituye a `xlsx@0.18.5` (SheetJS en npm), que tenía vulnerabilidades sin
// parche al leer archivos manipulados. `read-excel-file` (MIT) solo lee .xlsx y
// se carga bajo demanda.

export type ExcelCell = string | number | boolean | Date | null;
export type ExcelRecord = Record<string, string | number | boolean | Date>;

export const MAX_EXCEL_IMPORT_BYTES = 5 * 1024 * 1024;

/**
 * Filas de una hoja → objetos con la primera fila como encabezados, igual que
 * `XLSX.utils.sheet_to_json`: se omiten las celdas vacías y las filas sin datos, y
 * un encabezado repetido se renombra como `Nombre_1`, `Nombre_2`…
 */
export function rowsToObjects(rows: ExcelCell[][]): ExcelRecord[] {
  if (rows.length === 0) return [];
  const seen = new Map<string, number>();
  const headers = rows[0].map((h, i) => {
    const base = h === null || h === undefined || String(h).trim() === '' ? `__EMPTY_${i}` : String(h).trim();
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}_${n}`;
  });
  const out: ExcelRecord[] = [];
  for (const row of rows.slice(1)) {
    const obj: ExcelRecord = {};
    row.forEach((v, i) => {
      if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return;
      if (i >= headers.length || headers[i].startsWith('__EMPTY_')) return;
      obj[headers[i]] = v;
    });
    if (Object.keys(obj).length > 0) out.push(obj);
  }
  return out;
}

/** Lee la primera hoja de un .xlsx. Rechaza otros formatos y archivos de más de 5 MB. */
export async function readFirstSheet(file: File): Promise<ExcelRecord[]> {
  if (file.size > MAX_EXCEL_IMPORT_BYTES) throw new Error('El archivo supera el límite de 5 MB para importación.');
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Solo se admiten archivos .xlsx (Excel 2007 o posterior).');
  const { readSheet } = await import('read-excel-file/browser');
  const rows = (await readSheet(file)) as ExcelCell[][];
  return rowsToObjects(rows);
}
