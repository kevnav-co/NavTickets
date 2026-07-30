import { z } from 'zod';

// ─── Roles ──────────────────────────────────────────────
export const UserRoleEnum = z.enum([
  'admin', 'technician', 'supervisor', 'developer', 'aux_admin', 'super_admin'
]);
export type UserRoleType = z.infer<typeof UserRoleEnum>;

// ─── Schema ──────────────────────────────────────────────
export const UserSchema = z.object({
  id: z.string(),
  companyId: z.string().min(1),
  name: z.string().min(1, 'El nombre es obligatorio'),
  role: UserRoleEnum,
  username: z.string().min(1, 'El nombre de usuario es obligatorio'),
  password: z.string().optional(),
  identification: z.string().optional().default(''),
  address: z.string().optional().default(''),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationUpdatedAt: z.string().optional(),
  fcmToken: z.string().optional(),
  signature: z.string().optional(),
});

export type UserInput = z.input<typeof UserSchema>;
export type UserOutput = z.output<typeof UserSchema>;