import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface NotificationPayload {
  userId: string;
  title: string;
  body: string;
  path: string;
  companyId?: string;
}

async function sendOneSignalNotification(userId: string, payload: NotificationPayload, _companyName: string, companyLogo: string) {
  const oneSignalAppId = process.env.ONESIGNAL_APP_ID;
  const oneSignalApiKey = process.env.ONESIGNAL_API_KEY;

  if (!oneSignalAppId || !oneSignalApiKey) {
    console.warn('[Send Test Notification] OneSignal not configured');
    return { success: false, error: 'ONESIGNAL_NOT_CONFIGURED' };
  }

  // Get user's OneSignal player ID from Supabase (stored in fcm_token column)
  const { data: user } = await supabase
    .from('users')
    .select('fcm_token')
    .eq('id', userId)
    .single();

  if (!user?.fcm_token) {
    return { success: false, error: 'NO_PLAYER_ID' };
  }

  try {
    const response = await fetch(`https://onesignal.com/api/v1/notifications`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${oneSignalApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: oneSignalAppId,
        include_player_ids: [user.fcm_token],
        headings: { en: payload.title },
        contents: { en: payload.body },
        data: { url: payload.path },
        url: `${process.env.VERCEL_API_BASE || 'https://your-app.vercel.app'}#${payload.path}`,
        chrome_web_icon: companyLogo,
        chrome_web_badge: companyLogo,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(JSON.stringify(error));
    }

    const result = await response.json();
    return { success: true, notificationId: result.id };
  } catch (error) {
    console.error('[Send Test Notification] OneSignal error:', error);
    return { success: false, error: 'ONESIGNAL_ERROR' };
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Verify admin/developer role
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response('Invalid token', { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role, company_id')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'developer', 'super_admin'].includes(profile.role)) {
      return new Response('Forbidden: Admin or Developer only', { status: 403 });
    }

    const body = await req.json();
    const { userId } = body as { userId: string };

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get target user
    const { data: targetUser, error: targetError } = await supabase
      .from('users')
      .select('id, name, company_id, fcm_token')
      .eq('id', userId)
      .single();

    if (targetError || !targetUser) {
      return new Response(JSON.stringify({ success: false, error: 'USER_NOT_FOUND' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Resolve company branding
    const companyId = targetUser.company_id || 'default';
    let companyName = 'Empresa';
    let companyLogo = '/assets/icon-app.png';

    const { data: company } = await supabase
      .from('companies')
      .select('name, theme')
      .eq('id', companyId)
      .single();

    if (company) {
      companyName = company.name || 'Empresa';
      companyLogo = company.theme?.logoUrl || '/assets/logo-inicio.png';
    }

    const title = `🔔 Test Push - ${companyName}`;
    const message = `Notificación de prueba enviada a ${targetUser.name || 'usuario'}. Si ves esto, ¡las notificaciones funcionan correctamente!`;

    // 1. Create internal notification in Supabase
    await supabase.from('notifications').insert({
      user_id: userId,
      company_id: companyId,
      title,
      body: message,
      path: '/',
      type: 'test',
      read: false,
      created_at: new Date().toISOString(),
    });

    // 2. Send push via OneSignal
    const pushResult = await sendOneSignalNotification(userId, {
      userId,
      title,
      body: message,
      path: '/',
      companyId,
    }, companyName, companyLogo);

    // 3. Also try Web Push if user has subscription (for PWA)
    // This would require storing Web Push subscriptions in the users table

    return new Response(JSON.stringify({
      success: pushResult.success,
      message: pushResult.success
        ? `Push enviado exitosamente a ${targetUser.name}.`
        : `Push falló: ${pushResult.error}. Notificación interna creada.`,
      userName: targetUser.name,
      playerIdPreview: targetUser.fcm_token
        ? `${targetUser.fcm_token.substring(0, 12)}...`
        : 'NO_TOKEN',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Send Test Notification] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}