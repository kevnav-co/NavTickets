import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

/**
 * Webhook: Notificar al usuario cuando se le asigna/actualiza una tarea.
 *
 * Se invoca desde un trigger de PostgreSQL cuando se inserta/actualiza una tarea.
 * Reemplaza la Cloud Function `ontaskassigned` de Firebase.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Configuración de Supabase faltante' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json();
    const { type: eventType, record } = body;

    if (!record) {
      return new Response(JSON.stringify({ error: 'Cuerpo inválido: se requiere record' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const taskId = record.id;
    const assignedTo = record.assigned_to;
    const companyId = record.company_id;
    const taskTitle = record.title || 'Tarea sin título';
    const previousAssignee = body.old_record?.assigned_to;
    const createdBy = record.created_by;

    const results: string[] = [];

    // 1. Notificar al asignado (si es nuevo)
    if (assignedTo && (eventType === 'INSERT' || assignedTo !== previousAssignee)) {
      const { error: notifError } = await supabase.from('notifications').insert({
        company_id: companyId,
        user_id: assignedTo,
        title: eventType === 'INSERT' ? 'Nueva tarea asignada' : 'Tarea reasignada',
        body: `Te han asignado la tarea: ${taskTitle}`,
        type: 'info',
        path: `/tasks/${taskId}`,
        read: false,
        created_at: new Date().toISOString(),
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
        type: 'success',
        path: `/tasks/${taskId}`,
        read: false,
        created_at: new Date().toISOString(),
      });

      if (notifError) throw notifError;
      results.push(`Notificado a creador (${createdBy})`);
    }

    return new Response(JSON.stringify({
      message: 'Notificaciones procesadas',
      data: results,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[OnTaskAssigned] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}