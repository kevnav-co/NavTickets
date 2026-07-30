import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Cron job: Recordatorios de tareas y alertas de vencimiento.
 *
 * Reemplaza la Cloud Function `taskScheduler` de Firebase.
 * Se ejecuta cada 5 minutos via Vercel Cron.
 *
 * URL: /api/cron/task-reminders
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verificar que sea un cron (Vercel no envía secret automáticamente;
  // se recomienda usar CRON_SECRET en producción)
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Configuración de Supabase faltante' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const today = new Date().toISOString().split('T')[0];
    const results = {
      remindersSent: 0,
      dueDateAlerts: 0,
      errors: [] as string[],
    };

    // 1. Tareas con recordatorio para hoy y que no han notificado
    const { data: tasksWithReminder, error: err1 } = await supabase
      .from('tasks')
      .select('*')
      .eq('completed', false)
      .eq('reminder_notification_sent', false)
      .eq('reminder', today);

    if (err1) {
      results.errors.push(`Error consultando reminders: ${err1.message}`);
    } else if (tasksWithReminder) {
      for (const task of tasksWithReminder) {
        // Crear notificación
        const { error: notifError } = await supabase.from('notifications').insert({
          company_id: task.company_id,
          user_id: task.assigned_to || task.created_by,
          title: 'Recordatorio de tarea',
          body: `Tarea: ${task.title}`,
          text: `Recordatorio: ${task.title}`,
          type: 'info',
          path: `/tasks/${task.id}`,
        });

        if (notifError) {
          results.errors.push(`Error notificando task ${task.id}: ${notifError.message}`);
        } else {
          // Marcar como notificado
          await supabase.from('tasks').update({ reminder_notification_sent: true }).eq('id', task.id);
          results.remindersSent++;
        }
      }
    }

    // 2. Tareas con fecha de vencimiento próxima (hoy o vencidas)
    const { data: overdueTasks, error: err2 } = await supabase
      .from('tasks')
      .select('*')
      .eq('completed', false)
      .eq('due_date_notification_sent', false)
      .lte('due_date', today)
      .not('due_date', 'is', null);

    if (err2) {
      results.errors.push(`Error consultando vencidas: ${err2.message}`);
    } else if (overdueTasks) {
      for (const task of overdueTasks) {
        const { error: notifError } = await supabase.from('notifications').insert({
          company_id: task.company_id,
          user_id: task.assigned_to || task.created_by,
          title: 'Tarea vencida',
          body: `La tarea "${task.title}" está vencida`,
          text: `Vencida: ${task.title}`,
          type: 'alert',
          path: `/tasks/${task.id}`,
        });

        if (notifError) {
          results.errors.push(`Error notificando vencida ${task.id}: ${notifError.message}`);
        } else {
          await supabase.from('tasks').update({ due_date_notification_sent: true }).eq('id', task.id);
          results.dueDateAlerts++;
        }
      }
    }

    return res.status(200).json({
      message: 'Cron ejecutado exitosamente',
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[TaskReminders] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}