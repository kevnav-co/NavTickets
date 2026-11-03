import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const IMPORT_ROLES = ['admin', 'developer', 'super_admin', 'supervisor', 'aux_admin'];
const CUENTI_URL = 'https://app.cuenti.com/jServerj4ErpPro/com/j4ErpPro/server/adm/cliente/ConsultarClientePaginado/1/0';

const text = (body: string, status: number) => new Response(body, { status });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') return text('Method Not Allowed', 405);

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return text('Unauthorized', 401);

  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.substring(7));
  if (authError || !user) return text('Invalid token', 401);

  const { data: caller } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('supabase_auth_id', user.id)
    .single();
  if (!caller || !IMPORT_ROLES.includes(caller.role)) return text('Forbidden', 403);

  // Las credenciales Cuenti pertenecen a una sola empresa: si CUENTI_COMPANY_ID está definido, solo ella accede.
  const allowedCompany = process.env.CUENTI_COMPANY_ID;
  if (allowedCompany && caller.company_id !== allowedCompany && caller.role !== 'super_admin') {
    return text('Forbidden', 403);
  }

  try {
    const cuentiResponse = await fetch(CUENTI_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'X-Auth-Token': process.env.CUENTI_API_TOKEN || '',
        'X-Auth-Token-Empresa': process.env.CUENTI_EMPRESA_ID || '',
        'X-Auth-Token-Id-Usuario': process.env.CUENTI_USER_ID || '',
        'X-Auth-Token-Usuario': process.env.CUENTI_USER_ID || '',
      },
    });

    const responseBodyText = await cuentiResponse.text();
    if (!cuentiResponse.ok) {
      console.error('[Cuenti Proxy] Error from Cuenti API:', cuentiResponse.status, responseBodyText);
      return text('Error al consultar la API de Cuenti.', 502);
    }

    try {
      JSON.parse(responseBodyText);
    } catch {
      return text('La respuesta de Cuenti no pudo ser procesada como JSON.', 502);
    }

    return new Response(responseBodyText, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[Cuenti Proxy] Fatal error:', error);
    return text('Error interno del servidor al procesar la solicitud para Cuenti.', 500);
  }
}
