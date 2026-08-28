/**
 * @file src/utils/csv.ts
 * Helper para exportar filas a CSV y descargarlas como archivo.
 * Fase 6 — Informes/Export.
 */

const escapeCell = (value: unknown): string => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Serializa filas a CSV (con BOM UTF-8 para que Excel abra acentos bien).
 */
export const toCsv = (headers: string[], rows: unknown[][]): string => {
  const headerLine = headers.map(escapeCell).join(',');
  const bodyLines = rows.map(row => row.map(escapeCell).join(','));
  return '﻿' + [headerLine, ...bodyLines].join('\r\n');
};

/**
 * Dispara la descarga de un CSV en el navegador.
 */
export const downloadCsv = (filename: string, csv: string): void => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Helper one-liner para generar + descargar de una vez. */
export const exportCsv = (filename: string, headers: string[], rows: unknown[][]): void =>
  downloadCsv(filename, toCsv(headers, rows));