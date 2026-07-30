import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Webhook: Notificar al usuario cuando se le asigna/actualiza una tarea.
 *
 * Se invoca desde un trigger de PostgreSQL cuando se inserta/actualiza una tarea.
 * Reemplaza la Cloud Function `ontaskassigned` de Firebase.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Configuración de Supabase faltante' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { type: eventType, record } = req.body;

    if (!record) {
      return res.status(400).json({ error: 'Cuerpo inválido: se requiere record' });
    }

    const taskId = record.id;
    const assignedTo = record.assigned_to;
    const companyId = record.company_id;
    const taskTitle = record.title || 'Tarea sin título';
    const previousAssignee = req.body.old_record?.assigned_to;
    const createdBy = record.created_by;

    const results: string[] = [];

    // 1. Notificar al asignado (si es nuevo)
    if (assignedTo && (eventType === 'INSERT' || assignedTo !== previousAssignee)) {
      const { error: notifError } = await supabase.from('notifications').insert({
        company_id: companyId,
        user_id: assignedTo,
        title: eventType === 'INSERT' ? 'Nueva tarea asignada' : 'Tarea reasignada',
        body: `Te han asignado la tarea: ${taskTitle}`,
        text: `Nueva tarea: ${taskTitle}`,
        type: 'info',
        path: `/tasks/${taskId}`,
      });

      if (notifError) throw notifError;
      results.push(`Notificado a asignado (${assignedTo})`);
    }

    // 2. Notificar al creador si la tarea fue completada
    if (eventType === 'UPDATE' && record.completed && createdBy && createdBy !== assignedTo) {
      const { error: notifError } = await supabase.from('notifications').insert({
        company_id: companyId,
        user_id: createdBy,
        title: 'Tarea completada',
        body: `La tarea "${taskTitle}" ha sido marcada como completada`,
        text: `Completada: ${taskTitle}`,
        type: 'success',
        path: `/tasks/${taskId}`,
      });

      if (notifError) throw notifError;
      results.push(`Notificado a creador (${createdBy})`);
    }

    return res.status(200).json({
      message: 'Notificaciones procesadas',
      data: results,
    });
  } catch (err: any) {
    console.error('[OnTaskAssigned] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}