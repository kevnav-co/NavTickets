import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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

    const orderId = record.id;
    const technicianId = record.technician_id;
    const companyId = record.company_id;
    const orderName = record.name || `Orden #${record.order_number}`;
    const previousTechnicianId = req.body.old_record?.technician_id;

    // Si no hay técnico asignado, no notificar
    if (!technicianId) {
      return res.status(200).json({ message: 'Sin técnico asignado, no se notifica' });
    }

    const isNewAssignment = eventType === 'INSERT' || technicianId !== previousTechnicianId;

    if (isNewAssignment) {
      // Crear notificación en la base de datos
      const { error: notifError } = await supabase.from('notifications').insert({
        company_id: companyId,
        user_id: technicianId,
        title: eventType === 'INSERT' ? 'Nueva orden asignada' : 'Orden reasignada',
        body: `Te han asignado la orden: ${orderName}`,
        text: `Nueva orden: ${orderName}`,
        type: 'info',
        path: `/orders/${orderId}`,
      });

      if (notifError) {
        throw notifError;
      }
    }

    // TODO: Integrar con OneSignal para push notification en tiempo real
    // const onesignal = new OneSignal(...);
    // await onesignal.createNotification({ ... });

    return res.status(200).json({
      message: 'Notificación procesada',
      data: { orderId, technicianId, eventType },
    });
  } catch (err: any) {
    console.error('[OnOrderAssigned] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}