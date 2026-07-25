
/**
 * @file src/utils/pdfGenerator.ts
 * @description
 * Este archivo contiene toda la lógica para generar el "Acta de Servicio" en formato PDF.
 * Utiliza las librerías jsPDF y jspdf-autotable para construir el documento a partir de
 * los datos de la orden de servicio, cliente, técnico, y las evidencias fotográficas.
 */

import { ServiceOrder, Client, Equipment, User } from '../types';

// --- Funciones de Ayuda (Helpers) para formateo de datos ---

const formatIsoToTime = (isoString?: string): string => {
  if (!isoString) return 'N/A';
  try {
    return new Date(isoString).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return 'N/A'; }
};

const calculateDuration = (startIso?: string, endIso?: string): string => {
  if (!startIso || !endIso) return 'N/A';
  try {
    const diffMs = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (diffMs < 0) return 'N/A';
    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  } catch { return 'N/A'; }
};

const getBrokenImageDataUrl = (): string => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const size = 64;
  canvas.width = size;
  canvas.height = size;

  if (ctx) {
    ctx.fillStyle = '#E0E0E0';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#D32F2F';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(size * 0.2, size * 0.2);
    ctx.lineTo(size * 0.8, size * 0.8);
    ctx.moveTo(size * 0.8, size * 0.2);
    ctx.lineTo(size * 0.2, size * 0.8);
    ctx.stroke();
  }
  return canvas.toDataURL('image/png');
};

const BROKEN_IMAGE_PLACEHOLDER = getBrokenImageDataUrl();

const imageToDataUrl = (source: string | Blob): Promise<string> => {
  return new Promise(async (resolve) => {
    if (!source) {
      return resolve('');
    }

    if (source instanceof Blob) {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(BROKEN_IMAGE_PLACEHOLDER);
      reader.readAsDataURL(source);
      return;
    }

    if (typeof source === 'string') {
      if (source.startsWith('data:image')) {
        return resolve(source);
      }
      try {
        const response = await fetch(source);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(BROKEN_IMAGE_PLACEHOLDER);
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error(`Error fetching image ${source}:`, error);
        resolve(BROKEN_IMAGE_PLACEHOLDER);
      }
    } else {
      resolve(BROKEN_IMAGE_PLACEHOLDER);
    }
  });
};

interface PdfGeneratorParams {
  order: ServiceOrder;
  client: Client;
  technician: User;
  selectedEquips: Equipment[];
  tasks: string[];
  additionalComments: string;
  approverName: string;
  approverId: string;
  techSignature: string | null;
  clientSignature: string | null;
  setPdfProgress: (progress: number) => void;
  setNotification: (notification: { show: boolean; title: string; message: string }) => void;
}

export const generateServiceActa = async (
  { order, client, technician, selectedEquips, tasks, additionalComments, approverName, approverId, techSignature, clientSignature, setPdfProgress, setNotification }: PdfGeneratorParams, 
  action: 'download' | 'share' | 'view' = 'download'
) => {
  try {
    setPdfProgress(5);
    const logoUrl = "https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Logo-Nit.png?alt=media&token=eaf958c8-f13e-442c-a57f-10298590bce2";

    setPdfProgress(10);
    const [logoBase64, techSignatureBase64, clientSignatureBase64] = await Promise.all([
      imageToDataUrl(logoUrl),
      imageToDataUrl(techSignature || ''),
      imageToDataUrl(clientSignature || ''),
    ]);
    
    setPdfProgress(25);
    // Carga dinámica de librerías pesadas
    const { jsPDF } = await import('jspdf');
    const autoTableModule = await import('jspdf-autotable');
    const autoTable = autoTableModule.default || autoTableModule;

    const doc = new jsPDF({ format: 'legal' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 12;
    let lastY = 5;

    const drawnImages = new Set<string>();

    if (logoBase64) {
      doc.addImage(logoBase64, 'JPEG', (pageWidth - 80) / 2, lastY, 80, 28);
      lastY += 33;
    }

    doc.setFontSize(14).setFont("helvetica", "bold").text(`ACTA DE ${order.orderType === 'Preventivo' ? 'MP' : 'MC'}-${order.orderNumber}`, pageWidth / 2, lastY, { align: 'center' });
    lastY += 3;

    autoTable(doc, {
      body: [
        [{ content: 'NOMBRE:', styles: { fontStyle: 'bold' } }, client.name, { content: 'DIRECCIÓN:', styles: { fontStyle: 'bold' } }, client.address],
        [{ content: 'CC/NIT:', styles: { fontStyle: 'bold' } }, client.identification || 'N/A', { content: 'TELÉFONO:', styles: { fontStyle: 'bold' } }, client.contact],
      ],
      startY: lastY, theme: 'plain', styles: { fontSize: 9, cellPadding: 0.5 }, columnStyles: { 0: { cellWidth: 25 }, 2: { cellWidth: 25 } }, margin: { left: margin, right: margin }
    });
    lastY = (doc as any).lastAutoTable.finalY + 3;

    const tableStyles: any = { theme: 'grid', headStyles: { fillColor: [230, 230, 230], textColor: 40, fontStyle: 'bold', halign: 'center', lineWidth: 0.1, lineColor: 150 }, bodyStyles: { textColor: 50, lineWidth: 0.1, lineColor: 200 }, styles: { fontSize: 8.5, cellPadding: 2, halign: 'center' }, margin: { left: margin, right: margin } };
    
    autoTable(doc, { ...tableStyles, startY: lastY, head: [['EQUIPO', 'TENSIÓN', 'GARANTÍA']], body: selectedEquips.map(e => { let warrantyText = order.warrantyExpiration ? new Date(order.warrantyExpiration + 'T00:00:00').toLocaleDateString('es-CO') : 'N/A'; return [e.name.toUpperCase(), e.voltage || 'N/A', warrantyText]; }) });
    lastY = (doc as any).lastAutoTable.finalY;

    autoTable(doc, { ...tableStyles, startY: lastY, head: [['FECHA', 'INICIO', 'FIN', 'DURACIÓN']], body: [[order.scheduledDate ? new Date(order.scheduledDate + 'T12:00:00').toLocaleDateString('es-CO') : 'N/A', formatIsoToTime(order.startTime), formatIsoToTime(order.endTime), calculateDuration(order.startTime, order.endTime)]] });
    lastY = (doc as any).lastAutoTable.finalY;

    if (order.description) {
        autoTable(doc, { ...tableStyles, startY: lastY, head: [['DESCRIPCIÓN DE LA ORDEN']], body: [[{ content: order.description, styles: { halign: 'left' } }]], headStyles: { ...tableStyles.headStyles, halign: 'left' }, bodyStyles: { ...tableStyles.bodyStyles, halign: 'left' } });
        lastY = (doc as any).lastAutoTable.finalY;
    }

    if (tasks.length > 0) {
      const proceduresInColumns = tasks.reduce((acc, task, i) => i % 2 === 0 ? [...acc, [`• ${task}`]] : [...acc.slice(0, -1), [...acc.slice(-1)[0], `• ${task}`]], [] as string[][]);
      autoTable(doc, { ...tableStyles, startY: lastY, head: [[{ content: 'PROCEDIMIENTOS', colSpan: 2, styles: { ...tableStyles.headStyles, halign: 'left' } }]], body: proceduresInColumns, bodyStyles: { ...tableStyles.bodyStyles, halign: 'left' } });
      lastY = (doc as any).lastAutoTable.finalY;
    }

    const obsText = [order.closingData?.generalObservations, order.observations, additionalComments].filter(Boolean).join('\n\n');
    if (obsText) {
      autoTable(doc, { ...tableStyles, startY: lastY, head: [['OBSERVACIONES']], body: [[{ content: obsText, styles: { halign: 'left' } }]], headStyles: { ...tableStyles.headStyles, halign: 'left' }, bodyStyles: { ...tableStyles.bodyStyles, halign: 'left' } });
      lastY = (doc as any).lastAutoTable.finalY;
    }

    setPdfProgress(50);

    const drawEvidence = (title: string, imageUrls: string[]) => {
      const uniqueImages = [...new Set(imageUrls.filter(Boolean))]
                             .filter(url => !drawnImages.has(url));

      if (uniqueImages.length === 0) return;

      const chunkSize = 4; // Restaurado a 4 imágenes por fila
      const imgSize = (pageWidth - margin * 2 - (chunkSize - 1) * 4) / chunkSize;
      const rowHeight = imgSize + 8;

      autoTable(doc, {
        startY: lastY,
        head: [[title]],
        headStyles: { ...tableStyles.headStyles, halign: 'left' },
        body: [['']],
        margin: { left: margin, right: margin },
        didDrawCell: (data) => {
          if (data.row.section === 'body') {
            let y = data.cell.y + 4;
            for (let i = 0; i < uniqueImages.length; i += chunkSize) {
              const chunk = uniqueImages.slice(i, i + chunkSize);
              chunk.forEach((img, colIndex) => {
                drawnImages.add(img);
                const x = data.cell.x + (colIndex * (imgSize + 4));
                try {
                  const format = img.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
                  doc.addImage(img, format, x, y, imgSize, imgSize, undefined, 'FAST');
                } catch (e) {
                  console.error("Error adding image to PDF:", e);
                  doc.addImage(BROKEN_IMAGE_PLACEHOLDER, 'PNG', x, y, imgSize, imgSize, undefined, 'FAST');
                }
              });
              if (i + chunkSize < uniqueImages.length) { y += rowHeight; }
            }
          }
        },
        bodyStyles: { minCellHeight: Math.ceil(uniqueImages.length / chunkSize) * rowHeight }
      });
      lastY = (doc as any).lastAutoTable.finalY;
    };
    
    // --- Proceso de Evidencias a Prueba de Fallos ---

    // 1. Dibuja Evidencias ANTES
    // Se aplica .flat(Infinity) para "aplanar" cualquier array anidado que pueda existir
    // en la base de datos debido a errores anteriores. Esto sanea la estructura de datos.
    const initialEvidenceUrls = (Array.isArray(order.initialEvidence) ? order.initialEvidence : []).flat(Infinity);
    if (initialEvidenceUrls.length > 0) {
        setPdfProgress(65);
        const preloadedInitial = await Promise.all(initialEvidenceUrls.map(imageToDataUrl));
        drawEvidence("EVIDENCIAS (ANTES):", preloadedInitial);
    }

    // 2. Dibuja Evidencias DESPUÉS
    const finalEvidenceUrls = (Array.isArray(order.finalEvidence) ? order.finalEvidence : []).flat(Infinity);
    if (finalEvidenceUrls.length > 0) {
        setPdfProgress(85);
        const preloadedFinal = await Promise.all(finalEvidenceUrls.map(imageToDataUrl));
        drawEvidence("EVIDENCIAS (DESPUÉS):", preloadedFinal);
    }

    setPdfProgress(95);

    const pageHeight = doc.internal.pageSize.getHeight();
    const signatureBlockHeight = 50;
    if (lastY > pageHeight - signatureBlockHeight - margin) {
      doc.addPage();
      lastY = margin;
    }

    const finalY = Math.max(lastY + 15, pageHeight - signatureBlockHeight - margin);

    const drawSig = (title: string, name: string, id: string, sigImg: string | null, x: number) => {
      doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(100).text(title, x, finalY);
      if (sigImg) try { doc.addImage(sigImg, 'JPEG', x, finalY + 2, 40, 15, undefined, 'FAST') } catch (_) {};
      doc.setLineWidth(0.2).setDrawColor(100).line(x, finalY + 22, x + 80, finalY + 22);
      doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(40).text(name.toUpperCase(), x, finalY + 26);
      doc.setFont('helvetica', 'normal').text(`C.C. ${id}`, x, finalY + 30);
    };

    drawSig("MANTENIMIENTO REALIZADO POR:", technician.name, technician.identification || '', techSignatureBase64, margin);
    drawSig("RECIBIDO Y APROBADO POR:", approverName || client.name, approverId || client.identification || '', clientSignatureBase64, pageWidth - margin - 80);

    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(150).text("Cra. 8 #36-31, Montería, Cordoba. CEL: 3133788705", pageWidth / 2, pageHeight - 10, { align: 'center' });

    setPdfProgress(100);
    const fileName = `ACTA_${order.orderType === 'Preventivo' ? 'MP' : 'MC'}-${order.orderNumber}_${client.name}.pdf`;

    if (action === 'share' && navigator.share) {
      const file = new File([doc.output('blob')], fileName, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
      } else {
        doc.save(fileName);
      }
    } else if (action === 'view') {
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, '_blank');
    } else {
      doc.save(fileName);
    }

  } catch (err) {
    console.error("Error in PDF generation: ", err);
    setNotification({ show: true, title: "Error de PDF", message: `An unexpected error occurred: ${err instanceof Error ? err.message : String(err)}` });
  }
};
