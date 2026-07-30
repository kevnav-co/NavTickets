import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Cron job diario: Verificación de vencimientos de garantía y mantenimiento.
 *
 * Reemplaza la Cloud Function `dailyExpirationCheck` de Firebase.
 * Se ejecuta diariamente a las 8:00 AM via Vercel Cron.
 *
 * URL: /api/cron/expiration-check
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
      expiringWarranties: 0,
      pendingMaintenance: 0,
      notificationsSent: 0,
      errors: [] as string[],
    };

    // 1. Órdenes con garantía próxima a vencer
    const { data: expiringOrders, error: err1 } = await supabase
      .from('orders')
      .select('*, users!inner(*)')
      .eq('warranty_notification_sent', false)
      .lte('warranty_expiration', today)
      .not('warranty_expiration', 'is', null);

    if (err1) {
      results.errors.push(`Error consultando garantías: ${err1.message}`);
    } else if (expiringOrders) {
      for (const order of expiringOrders) {
        // Notificar al técnico asignado
        if (order.technician_id) {
          const { error: nErr } = await supabase.from('notifications').insert({
            company_id: order.company_id,
            user_id: order.technician_id,
            title: 'Garantía próxima a vencer',
            body: `Orden #${order.order_number}: ${order.name}`,
            text: `Garantía por vencer: ${order.name}`,
            type: 'alert',
            path: `/orders/${order.id}`,
          });
          if (nErr) results.errors.push(`Error notif orden ${order.id}: ${nErr.message}`);
          else results.notificationsSent++;
        }

        await supabase.from('orders').update({ warranty_notification_sent: true }).eq('id', order.id);
        results.expiringWarranties++;
      }
    }

    // 2. Equipos con mantenimiento vencido o próximo
    const { data: overdueEquipment, error: err2 } = await supabase
      .from('equipment')
      .select('*')
      .eq('next_maintenance_notification_sent', false)
      .not('last_maintenance_date', 'is', null)
      .not('maintenance_frequency', 'is', null);

    if (err2) {
      results.errors.push(`Error consultando equipos: ${err2.message}`);
    } else if (overdueEquipment) {
      for (const equip of overdueEquipment) {
        // Calcular próxima fecha de mantenimiento
        const lastDate = new Date(equip.last_maintenance_date + 'T12:00:00');
        const nextDate = new Date(lastDate);
        nextDate.setMonth(nextDate.getMonth() + (equip.maintenance_frequency || 6));
        const nextDateStr = nextDate.toISOString().split('T')[0];

        if (nextDateStr <= today) {
          // Buscar usuarios de esta compañía para notificar
          const { data: companyUsers } = await supabase
            .from('users')
            .select('id')
            .eq('company_id', equip.company_id);

          if (companyUsers) {
            for (const user of companyUsers) {
              const { error: nErr } = await supabase.from('notifications').insert({
                company_id: equip.company_id,
                user_id: user.id,
                title: 'Mantenimiento de equipo vencido',
                body: `${equip.name} - Serial: ${equip.serial_number}`,
                text: `Mantenimiento vencido: ${equip.name}`,
                type: 'alert',
                path: `/equipment/${equip.id}`,
              });
              if (!nErr) results.notificationsSent++;
            }
          }

          await supabase.from('equipment').update({ next_maintenance_notification_sent: true }).eq('id', equip.id);
          results.pendingMaintenance++;
        }
      }
    }

    return res.status(200).json({
      message: 'Expiration check ejecutado exitosamente',
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[ExpirationCheck] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}