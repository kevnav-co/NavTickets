/**
 * @file src/utils/reportPdf.ts
 * Generador genérico de PDF (tabla) para los informes. Fase 6.
 * Reutiliza jsPDF + jspdf-autotable vía import() dinámico (patrón de pdfGenerator.ts),
 * pero sin acoplarse al Acta de Servicio.
 */

export interface ReportTableColumn {
  header: string;
  key: string;
}

/** Renderiza/descarga un informe simple (título + subtítulo + tabla) en PDF. */
export const exportReportPdf = async (
  filename: string,
  title: string,
  subtitle: string,
  headers: string[],
  rows: unknown[][]
): Promise<void> => {
  const { jsPDF } = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = autoTableModule.default || autoTableModule;

  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const pageHeight = doc.internal.pageSize.getHeight();

  // Encabezado
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(40);
  doc.text(title, margin, 16);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(120);
  doc.text(subtitle, margin, 22);
  doc.setFontSize(8).setTextColor(150);
  const today = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  doc.text(`Generado: ${today}`, pageWidth - margin, 16, { align: 'right' });

  autoTable(doc, {
    head: [headers],
    body: rows.map(r => r.map(cell => (cell === null || cell === undefined ? '—' : String(cell)))),
    startY: 28,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [123, 17, 19], textColor: 255, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { textColor: 50 },
    alternateRowStyles: { fillColor: [250, 247, 247] },
    margin: { left: margin, right: margin },
    didParseCell: (data: any) => {
      // Número de página en el footer.
      if (data.section === 'foot') data.cell.styles.halign = 'center';
    },
    foot: [[`Página ` + (doc as any).internal?.getNumberOfPages?.() || '']],
  });

  // Paginación en footer
  const finalY = (doc as any).lastAutoTable?.finalY ?? 30;
  return new Promise<void>((resolve) => {
    // Guardar en cada página un footer simple.
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(150);
      doc.text(`${filename} — Página ${i} de ${pageCount}`, margin, pageHeight - 6);
    }
    doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
    resolve();
  });
};