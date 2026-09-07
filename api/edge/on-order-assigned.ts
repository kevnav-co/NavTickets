import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

/**
 * Comparación timed-safe de strings usando un digest SHA-256, para no filtrar
 * info vía timing cuando se valida el secreto del webhook. En runtime edge
 * (Vercel/Deno) `crypto.subtle` está disponible.
 */
async function timingSafeEqualStrings(a: string, b: string): Promise<boolean> {
  const digest = async (s: string) => {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(s)
    );
    return new Uint8Array(buf);
  };
  const [da, db] = await Promise.all([digest(a), digest(b)]);
  if (da.length !== db.length) return false;
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}

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

  // Validar secreto compartido del webhook (lo manda el trigger BD en
  // `Authorization: Bearer <app.webhook_secret>`, migración 003). Sin esto
  // cualquiera que llegue a la URL podría insertar notificaciones arbitrarias
  // con el client service_role. Si no hay WEBHOOK_SECRET configurado, no se
  // endurece (compat con setups que aún no lo definen).
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const authHeader = req.headers.get('authorization');
  const provided = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const authorized = webhookSecret
    ? provided !== null && (await timingSafeEqualStrings(provided, webhookSecret))
    : true;
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
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
      const orderMsg = `Te han asignado la orden: ${orderName}`;
      const { error: notifError } = await supabase.from('notifications').insert({
        company_id: companyId,
        user_id: technicianId,
        title: eventType === 'INSERT' ? 'Nueva orden asignada' : 'Orden reasignada',
        body: orderMsg,
        // `text` es NOT NULL en la tabla; sin rellenarlo el insert falla 500 y
        // la notificación nunca aparece en la bandeja.
        text: orderMsg,
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