// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const saved: { name: string; pdf: string }[] = [];

vi.mock('jspdf', async (importOriginal) => {
  const mod = await importOriginal<typeof import('jspdf')>();
  class CapturingPDF extends mod.jsPDF {
    constructor(...args: ConstructorParameters<typeof mod.jsPDF>) {
      super(...args);
      (this as any).save = (name: string) => { saved.push({ name, pdf: this.output() }); return this; };
    }
  }
  return { ...mod, jsPDF: CapturingPDF, default: CapturingPDF };
});

import { exportReportPdf } from './reportPdf';
import { generateServiceActa } from './pdfGenerator';

describe('generación de PDF (jsPDF 4 + autotable 5)', () => {
  beforeEach(() => { saved.length = 0; });

  it('exportReportPdf genera un PDF multipágina con la tabla', async () => {
    await exportReportPdf('informe', 'Órdenes', 'Noviembre', ['N°', 'Cliente'], Array.from({ length: 80 }, (_, i) => [i, `Cliente ${i}`]));
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('informe.pdf');
    expect(saved[0].pdf.startsWith('%PDF-')).toBe(true);
    expect(saved[0].pdf).toContain('Cliente 79');
  });

  it('generateServiceActa genera el acta sin notificar error', async () => {
    const notify = vi.fn();
    await generateServiceActa({
      order: { id: 'o1', orderNumber: 7, name: 'MANT', description: 'Cambio de resistencia', scheduledDate: '2026-11-03', procedures: ['Inspección', 'Limpieza'], equipmentIds: [] } as any,
      client: { id: 'c1', name: 'Cliente', address: 'Calle 1' } as any,
      technician: { id: 't1', name: 'Técnico' } as any,
      selectedEquips: [{ id: 'e1', name: 'Horno', voltage: '220V' }] as any,
      tasks: ['Ajuste'], additionalComments: 'OK', approverName: 'Jefe', approverId: '123',
      techSignature: null, clientSignature: null,
      setPdfProgress: () => {}, setNotification: notify,
    }, 'download');
    expect(notify).not.toHaveBeenCalled();
    expect(saved).toHaveLength(1);
    expect(saved[0].pdf.startsWith('%PDF-')).toBe(true);
  });
});
