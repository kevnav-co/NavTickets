import { z } from 'zod';

// ─── NotificationType Enum ──────────────────────────────
export const NotificationTypeEnum = z.enum(['info', 'alert', 'success']);
export type NotificationTypeType = z.infer<typeof NotificationTypeEnum>;

// ─── Schema ──────────────────────────────────────────────
export const AppNotificationSchema = z.object({
  id: z.string(),
  companyId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  timestamp: z.string(),
  read: z.boolean().default(false),
  type: NotificationTypeEnum.default('info'),
  path: z.string().optional(),
  text: z.string().min(1),
  timeAgo: z.string(),
});

export type AppNotificationInput = z.input<typeof AppNotificationSchema>;
export type AppNotificationOutput = z.output<typeof AppNotificationSchema>;