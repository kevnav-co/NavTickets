import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Verify admin role via JWT
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response('Invalid token', { status: 401 });
    }

    // Check if user is admin in our users table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile || !['admin', 'super_admin', 'developer'].includes(profile.role)) {
      return new Response('Forbidden: Admin only', { status: 403 });
    }

    const body = await req.json();
    const { userId, newPassword } = body as { userId: string; newPassword: string };

    if (!userId || !newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return new Response(JSON.stringify({ error: 'Invalid request: userId and newPassword (min 6 chars) required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update password via Supabase Admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      console.error('[Update Password] Error:', updateError);
      return new Response(JSON.stringify({ error: 'Error updating password' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Update Password] Fatal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}