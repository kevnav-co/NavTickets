import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const MANAGER_ROLES = ['admin', 'developer', 'super_admin'];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function sendOneSignalPush(playerId: string, title: string, body: string, icon: string) {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_API_KEY;
  if (!appId || !apiKey) return { success: false, error: 'ONESIGNAL_NOT_CONFIGURED' };

  const appUrl = process.env.APP_URL || 'https://navtickets.vercel.app';
  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { Authorization: `Basic ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: appId,
        include_player_ids: [playerId],
        headings: { en: title },
        contents: { en: body },
        data: { path: '/' },
        url: `${appUrl}/#/`,
        chrome_web_icon: icon,
        chrome_web_badge: icon,
      }),
    });
    if (!response.ok) throw new Error(JSON.stringify(await response.json()));
    const result = await response.json();
    return { success: true, notificationId: result.id };
  } catch (error) {
    console.error('[Send Test Notification] OneSignal error:', error);
    return { success: false, error: 'ONESIGNAL_ERROR' };
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.substring(7));
    if (authError || !user) return json({ error: 'Invalid token' }, 401);

    const { data: caller } = await supabase
      .from('users')
      .select('role, company_id')
      .eq('supabase_auth_id', user.id)
      .single();
    if (!caller || !MANAGER_ROLES.includes(caller.role)) {
      return json({ error: 'Forbidden: Admin or Developer only' }, 403);
    }

    const { userId } = (await req.json()) as { userId?: string };
    if (!userId) return json({ error: 'userId required' }, 400);

    const { data: targetUser } = await supabase
      .from('users')
      .select('id, name, company_id, onesignal_player_id')
      .eq('id', userId)
      .single();
    if (!targetUser) return json({ success: false, error: 'USER_NOT_FOUND' }, 404);

    if (caller.role !== 'super_admin' && targetUser.company_id !== caller.company_id) {
      return json({ error: 'Forbidden: user belongs to another company' }, 403);
    }

    let companyName = 'Empresa';
    let companyLogo = '/assets/icon-app.png';
    const { data: company } = await supabase
      .from('companies')
      .select('name, theme')
      .eq('id', targetUser.company_id)
      .single();
    if (company) {
      companyName = company.name || companyName;
      companyLogo = company.theme?.iconUrl || company.theme?.logoUrl || companyLogo;
    }

    const title = `🔔 Test Push - ${companyName}`;
    const message = `Notificación de prueba enviada a ${targetUser.name || 'usuario'}. Si ves esto, ¡las notificaciones funcionan correctamente!`;

    const { error: notifError } = await supabase.from('notifications').insert({
      company_id: targetUser.company_id,
      user_id: targetUser.id,
      title,
      body: message,
      text: title,
      path: '/',
      type: 'info',
      read: false,
    });
    if (notifError) console.error('[Send Test Notification] Insert error:', notifError);

    const playerId: string | null = targetUser.onesignal_player_id;
    const pushResult = playerId
      ? await sendOneSignalPush(playerId, title, message, companyLogo)
      : { success: false, error: 'NO_PLAYER_ID' };

    return json({
      success: pushResult.success,
      message: pushResult.success
        ? `Push enviado exitosamente a ${targetUser.name}.`
        : `Push falló: ${pushResult.error}. Notificación interna creada.`,
      userName: targetUser.name,
      playerIdPreview: playerId ? `${playerId.substring(0, 12)}...` : 'NO_TOKEN',
    });
  } catch (error: any) {
    console.error('[Send Test Notification] Error:', error);
    return json({ error: error.message }, 500);
  }
}
