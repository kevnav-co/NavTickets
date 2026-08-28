import { describe, it, expect } from 'vitest';
import { InventoryItemSchema } from './inventory.schema';

describe('InventoryItemSchema (Fase 6)', () => {
  it('acepta un repuesto válido con defaults', () => {
    const parsed = InventoryItemSchema.safeParse({ id: 'abc', companyId: 'co', name: 'FILTRO HIDRÁULICO 20μ' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.quantity).toBe(0);
      expect(parsed.data.unit).toBe('unidad');
      expect(parsed.data.unitCost).toBe(0);
      expect(parsed.data.lowStockThreshold).toBe(0);
      expect(parsed.data.sku).toBe('');
    }
  });

  it('requiere el nombre del repuesto', () => {
    const parsed = InventoryItemSchema.safeParse({ name: '' });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some(i => i.path[0] === 'name')).toBe(true);
    }
  });

  it('rechaza cantidades negativas', () => {
    const parsed = InventoryItemSchema.safeParse({ name: 'X', quantity: -2 });
    expect(parsed.success).toBe(false);
  });

  it('rechaza costo unitario negativo', () => {
    const parsed = InventoryItemSchema.safeParse({ name: 'X', unitCost: -1 });
    expect(parsed.success).toBe(false);
  });

  it('normaliza números a valores por defecto cuando se omite', () => {
    const parsed = InventoryItemSchema.safeParse({ name: 'FILTRO', id: 'abc', companyId: 'co' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.quantity).toBeGreaterThanOrEqual(0);
      expect(parsed.data.unitCost).toBeGreaterThanOrEqual(0);
    }
  });
});