// Código QR del enlace público del asistente. La librería (qrcode-generator, MIT,
// sin dependencias) se carga bajo demanda para no engordar el bundle principal.
// Se usa solo la matriz de módulos: el SVG lo dibuja React y el PNG un canvas,
// sin pasar nunca HTML generado por innerHTML.

export type QrMatrix = boolean[][];

/** Matriz de módulos (true = oscuro) con corrección de errores M. */
export async function makeQrMatrix(text: string): Promise<QrMatrix> {
  const { default: qrcode } = await import('qrcode-generator');
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/**
 * Trazo SVG de los módulos oscuros, en unidades de módulo y desplazado por el
 * margen (zona silenciosa). Une los módulos contiguos de cada fila en un solo
 * rectángulo para que el trazo sea corto.
 */
export function qrSvgPath(matrix: QrMatrix, margin = 4): string {
  const parts: string[] = [];
  matrix.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < row.length && row[c]) c++;
      parts.push(`M${start + margin} ${r + margin}h${c - start}v1h-${c - start}z`);
    }
  });
  return parts.join('');
}

/** PNG del QR (fondo blanco, módulos negros) como data URL, para descargar o imprimir. */
export function qrPngDataUrl(matrix: QrMatrix, cellSize = 12, margin = 4): string {
  const n = matrix.length;
  const size = (n + margin * 2) * cellSize;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite dibujar el código QR.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000000';
  matrix.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) ctx.fillRect((c + margin) * cellSize, (r + margin) * cellSize, cellSize, cellSize);
    }),
  );
  return canvas.toDataURL('image/png');
}
