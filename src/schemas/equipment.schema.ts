import { z } from 'zod';

// ─── Enums ──────────────────────────────────────────────
export const EquipmentStatusEnum = z.enum(['Activa', 'Inactiva', 'En Mantenimiento', 'Retirada']);
export type EquipmentStatusType = z.infer<typeof EquipmentStatusEnum>;

export const VoltageEnum = z.enum(['110V', '220V', '330V']);
export type VoltageType = z.infer<typeof VoltageEnum>;

export const GasTypeEnum = z.enum(['Natural', 'Propano', 'No usa']);
export type GasTypeType = z.infer<typeof GasTypeEnum>;

// ─── Schema ──────────────────────────────────────────────
export const EquipmentSchema = z.object({
  id: z.string(),
  companyId: z.string().min(1),
  clientId: z.string().optional().default(''),
  name: z.string().min(1, 'El nombre del equipo es obligatorio'),
  brand: z.string().optional().default(''),
  description: z.string().optional().default(''),
  serialNumber: z.string().min(1, 'El número de serie es obligatorio'),
  location: z.string().optional().default(''),
  voltage: VoltageEnum,
  gasType: GasTypeEnum.optional().default('No usa'),
  status: EquipmentStatusEnum.default('Activa'),
  imageUrl: z.string().optional(),
  createdAt: z.string().optional(),
  lastMaintenanceDate: z.string().optional(),
  maintenanceFrequency: z.number().int().positive().optional(),
  nextMaintenanceNotificationSent: z.boolean().optional().default(false),
});

export type EquipmentInput = z.input<typeof EquipmentSchema>;
export type EquipmentOutput = z.output<typeof EquipmentSchema>;