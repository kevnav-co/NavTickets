import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

/**
 * Webhook: Notificar al técnico cuando se le asigna/actualiza una orden.
 *
 * Se invoca desde un trigger de PostgreSQL cuando se inserta/actualiza una orden.
 * Reemplaza la Cloud Function `onorderassigned` de Firebase.
 *
 * Cuerpo esperado (desde Supabase Database Webhook):
 * {
 *   type: 'INSERT' | 'UPDATE',
 *   table: 'orders',
 *   record: { ... },
 *   old_record: { ... }
 * }
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

    const orderId = record.id;
    const technicianId = record.technician_id;
    const companyId = record.company_id;
    const orderName = record.name || `Orden #${record.order_number}`;
    const previousTechnicianId = body.old_record?.technician_id;

    // Si no hay técnico asignado, no notificar
    if (!technicianId) {
      return new Response(JSON.stringify({ message: 'Sin técnico asignado, no se notifica' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const isNewAssignment = eventType === 'INSERT' || technicianId !== previousTechnicianId;

    if (isNewAssignment) {
      // Crear notificación en la base de datos
      const { error: notifError } = await supabase.from('notifications').insert({
        company_id: companyId,
        user_id: technicianId,
        title: eventType === 'INSERT' ? 'Nueva orden asignada' : 'Orden reasignada',
        body: `Te han asignado la orden: ${orderName}`,
        type: 'info',
        path: `/orders/${orderId}`,
        read: false,
        created_at: new Date().toISOString(),
      });

      if (notifError) {
        throw notifError;
      }

      // TODO: Integrar con OneSignal para push notification en tiempo real
      // await fetch('https://onesignal.com/api/v1/notifications', { ... });
    }

    return new Response(JSON.stringify({
      message: 'Notificación procesada',
      data: { orderId, technicianId, eventType },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[OnOrderAssigned] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}