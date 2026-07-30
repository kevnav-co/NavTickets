import { z } from 'zod';

// ─── Enums ──────────────────────────────────────────────
export const OrderStatusEnum = z.enum(['Pendiente', 'En Progreso', 'Cerrado']);
export type OrderStatusType = z.infer<typeof OrderStatusEnum>;

export const PriorityEnum = z.enum(['Baja', 'Media', 'Alta', 'Urgente']);
export type PriorityType = z.infer<typeof PriorityEnum>;

export const OrderTypeEnum = z.enum(['Correctivo', 'Preventivo']);
export type OrderTypeType = z.infer<typeof OrderTypeEnum>;

// ─── WarrantyJob Schema (sub-documento) ─────────────────
export const WarrantyJobSchema = z.object({
  reopenedAt: z.string(),
  technicianId: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().nullable().optional(),
  tasksPerformed: z.array(z.string()).optional(),
  additionalComments: z.string().optional(),
  evidenceImages: z.array(z.union([z.string(), z.instanceof(Blob)])).optional(),
  technicianSignature: z.string().nullable().optional(),
  clientSignature: z.string().nullable().optional(),
  closingDescription: z.string().optional(),
});
export type WarrantyJobType = z.infer<typeof WarrantyJobSchema>;

// ─── ClosingData Schema (sub-documento) ─────────────────
export const ClosingDataSchema = z.object({
  tasksPerformed: z.array(z.string()).optional(),
  additionalComments: z.string().optional(),
  approverName: z.string().optional(),
  approverId: z.string().optional(),
  technicianSignature: z.string().nullable().optional(),
  clientSignature: z.string().nullable().optional(),
  generalObservations: z.string().optional(),
  closingDescription: z.string().optional(),
  evidenceImages: z.array(z.union([z.string(), z.instanceof(Blob)])).optional(),
});
export type ClosingDataType = z.infer<typeof ClosingDataSchema>;

// ─── Schema Principal ──────────────────────────────────
export const ServiceOrderSchema = z.object({
  id: z.string(),
  companyId: z.string().min(1),
  orderNumber: z.number().int().positive('El número de orden debe ser positivo'),
  name: z.string().min(1, 'El nombre es obligatorio'),
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  equipmentIds: z.array(z.string()).default([]),
  technicianId: z.string().min(1, 'El técnico es obligatorio'),
  scheduledDate: z.string().min(1, 'La fecha programada es obligatoria'),
  timeSlot: z.string().min(1, 'El horario es obligatorio'),
  scheduledEndTime: z.string().optional(),
  actualStartDate: z.string().optional(),
  description: z.string().min(1, 'La descripción es obligatoria'),
  status: OrderStatusEnum.default('Pendiente'),
  observations: z.string().optional().default(''),
  initialPhotos: z.array(z.union([z.string(), z.instanceof(Blob)])).optional(),
  initialEvidence: z.array(z.union([z.string(), z.instanceof(Blob)])).optional(),
  finalEvidence: z.array(z.union([z.string(), z.instanceof(Blob)])).optional(),
  currentWarrantyEvidence: z.array(z.union([z.string(), z.instanceof(Blob)])).optional(),
  procedures: z.array(z.string()).default([]),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  orderType: OrderTypeEnum,
  serviceName: z.string().min(1, 'El nombre del servicio es obligatorio'),
  warrantyPeriod: z.number().int().positive('El período de garantía debe ser positivo').optional(),
  warrantyExpiration: z.string().nullable().optional(),
  priority: PriorityEnum.default('Media'),
  isUnderWarrantyReview: z.boolean().optional().default(false),
  warrantyJobs: z.array(WarrantyJobSchema).optional(),
  warrantyStartTime: z.string().optional(),
  warrantyEndTime: z.string().optional(),
  closingData: ClosingDataSchema.optional(),
  warrantyNotificationSent: z.boolean().optional().default(false),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  lastUpdatedBy: z.string().optional(),
});

export type ServiceOrderInput = z.input<typeof ServiceOrderSchema>;
export type ServiceOrderOutput = z.output<typeof ServiceOrderSchema>;