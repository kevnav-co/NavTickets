import { z } from 'zod';

// ─── Schema Inventario (Fase 6) ────────────────────────────────────────────
export const InventoryItemSchema = z.object({
  id: z.string(),
  companyId: z.string().min(1),
  sku: z.string().optional().default(''),
  name: z.string().min(1, 'El nombre del repuesto es obligatorio'),
  unit: z.string().optional().default('unidad'),
  quantity: z.number().min(0, 'La cantidad no puede ser negativa').default(0),
  unitCost: z.number().min(0, 'El costo no puede ser negativo').optional().default(0),
  lowStockThreshold: z.number().min(0).optional().default(0),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type InventoryItemInput = z.input<typeof InventoryItemSchema>;
export type InventoryItemOutput = z.output<typeof InventoryItemSchema>;