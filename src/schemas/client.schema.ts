import { z } from 'zod';

// ─── Schema ──────────────────────────────────────────────
export const ClientSchema = z.object({
  id: z.string(),
  companyId: z.string().min(1),
  name: z.string().min(1, 'El nombre del cliente es obligatorio'),
  address: z.string().min(1, 'La dirección es obligatoria'),
  contact: z.string().min(1, 'El contacto es obligatorio'),
  identification: z.string().optional().default(''),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  neighborhood: z.string().optional().default(''),
  city: z.string().optional().default(''),
});

export type ClientInput = z.input<typeof ClientSchema>;
export type ClientOutput = z.output<typeof ClientSchema>;