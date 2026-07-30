import { z } from 'zod';

// ─── TaskNote Schema (sub-documento) ─────────────────────
export const TaskNoteSchema = z.object({
  id: z.string(),
  userId: z.string(),
  userName: z.string(),
  text: z.string(),
  createdAt: z.string(),
});
export type TaskNoteType = z.infer<typeof TaskNoteSchema>;

// ─── Schema ──────────────────────────────────────────────
export const TaskSchema = z.object({
  id: z.string(),
  companyId: z.string().min(1),
  title: z.string().min(1, 'El título es obligatorio'),
  completed: z.boolean().default(false),
  important: z.boolean().default(false),
  createdAt: z.string(),
  completedAt: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  reminder: z.string().nullable().optional(),
  repeat: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  note: z.string().optional(),
  files: z.array(z.string()).optional(),
  assignedTo: z.string().optional(),
  createdBy: z.string().optional(),
  participants: z.array(z.string()).optional(),
  reminderNotificationSent: z.boolean().optional().default(false),
  dueDateNotificationSent: z.boolean().optional().default(false),
});

export type TaskInput = z.input<typeof TaskSchema>;
export type TaskOutput = z.output<typeof TaskSchema>;