// NavTicket - Edge Function: notificar al SUPER_ADMIN cuando llega una consulta de soporte.
// Replica el patrón de `send-test-notification.ts`: cliente service-role de Supabase
// + OneSignal REST. Envía push a TODOS los super_admins que tengan player id
// (fcm_token) y les abre /#/admin/support al tocar la notificación.
//
// Invocado desde el frontend (SupportModal) tras crear un support_ticket, con el
// access_token del usuario que crea la consulta.

import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }
  const token = authHeader.substring(7);

  try {
    // ─── Autenticar al llamador ───────────────────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response('Invalid token', { status: 401 });
    }

    const body = await req.json();
    const { companyId, subject, message } = body as {
      companyId: string;
      subject: string;
      message: string;
    };
    if (!companyId || !subject) {
      return new Response(JSON.stringify({ error: 'companyId y subject son requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ─── El llamador debe pertenecer a esa empresa ────────────────────────
    const { data: caller } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', user.id)
      .single();
    if (!caller || caller.company_id !== companyId) {
      return new Response('Forbidden: no perteneces a esta empresa', { status: 403 });
    }

    // ─── Resolver nombre de la empresa para el mensaje ────────────────────
    let companyName = 'una empresa';
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single();
    if (company?.name) companyName = company.name;

    // ─── Todos los super_admins con player id ─────────────────────────────
    const { data: superAdmins, error: err } = await supabase
      .from('users')
      .select('id, company_id, fcm_token')
      .eq('role', 'super_admin');

    if (err) throw err;
    const targets = (superAdmins || []).filter(sa => sa.fcm_token);
    if (targets.length === 0) {
      return new Response(JSON.stringify({ success: true, notified: 0, reason: 'NO_SUPER_ADMIN_TOKENS' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const oneSignalAppId = process.env.ONESIGNAL_APP_ID;
    const oneSignalApiKey = process.env.ONESIGNAL_API_KEY;
    const base = process.env.VERCEL_API_BASE || 'https://navtickets.vercel.app';

    let notified = 0;
    if (oneSignalAppId && oneSignalApiKey) {
      // Un solo request apuntando a todos los player ids (incluye los sin token ya filtrados)
      const playerIds = targets.map(t => t.fcm_token);
      const pushBody = {
        app_id: oneSignalAppId,
        include_player_ids: playerIds,
        headings: { en: '🛟 Nueva consulta de soporte' },
        contents: { en: `${companyName}: ${subject}` },
        url: `${base}/#/admin/support`,
        data: { path: '/admin/support' },
      };
      const resp = await fetch(`https://onesignal.com/api/v1/notifications`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${oneSignalApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pushBody),
      });
      if (!resp.ok) {
        const errBody = await resp.json();
        console.error('[Support Notify] OneSignal error:', JSON.stringify(errBody));
      } else {
        notified = targets.length;
      }
    } else {
      console.warn('[Support Notify] OneSignal no configurado (faltan secretos)');
    }

    return new Response(JSON.stringify({ success: true, notified, to: targets.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[Support Notify] Error:', error);
    return new Response(JSON.stringify({ error: error.message, message: message || '' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}