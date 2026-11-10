import { describe, it, expect } from 'vitest';
import { ServiceOrderSchema } from './order.schema';

describe('ServiceOrderSchema (actualización parcial)', () => {
  it('acepta null para limpiar los tiempos de garantía al cerrar un trabajo de garantía', () => {
    const result = ServiceOrderSchema.partial().safeParse({
      status: 'Cerrado',
      isUnderWarrantyReview: false,
      warrantyJobs: [{ reopenedAt: '2026-11-01T10:00:00Z', technicianSignature: null, clientSignature: null }],
      warrantyStartTime: null,
      warrantyEndTime: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('NewServiceOrderSchema (alta de orden)', () => {
  it('conserva companyId: sin él RLS/NOT NULL rechazan el insert', async () => {
    const { NewServiceOrderSchema } = await import('./order.schema');
    const result = NewServiceOrderSchema.safeParse({
      companyId: 'c1', orderNumber: 1, name: 'X', description: 'd', technicianId: 't',
      scheduledDate: '2026-11-03', timeSlot: '08:00', serviceName: 'S', orderType: 'Correctivo', equipmentIds: ['e1'],
    });
    expect(result.success && result.data.companyId).toBe('c1');
  });
});
