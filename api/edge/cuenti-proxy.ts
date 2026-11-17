import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const IMPORT_ROLES = ['admin', 'developer', 'super_admin', 'supervisor', 'aux_admin'];

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // Only handle /api/cuenti/clients or /cuenti/clients paths
  if (!path.includes('cuenti/clients')) {
    return new Response('Not Found', { status: 404 });
  }

  // Autenticar: exige una sesión real con un rol que pueda importar clientes.
  // El endpoint usa el cliente service_role, así que no puede quedar abierto.
  // `users.id` no es el id de Supabase Auth: el vínculo es `supabase_auth_id`.
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
  if (authError || !user) {
    return new Response('Invalid token', { status: 401 });
  }
  const { data: caller } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('supabase_auth_id', user.id)
    .single();
  if (!caller || !IMPORT_ROLES.includes(caller.role)) {
    return new Response('Forbidden', { status: 403 });
  }
  // Los datos de Cuenti pertenecen a una sola empresa: si CUENTI_COMPANY_ID está
  // definido, solo esa empresa (o super_admin) puede consultarlos.
  const allowedCompany = process.env.CUENTI_COMPANY_ID;
  if (allowedCompany && caller.company_id !== allowedCompany && caller.role !== 'super_admin') {
    return new Response('Forbidden', { status: 403 });
  }

  // Puente GCP con la lista de clientes Cuenti. Antes el frontend golpeaba ESTA
  // URL directo (quedaba hardcodeada en el bundle y era alcanzable por cualquiera
  // sin auth). Ahora la URL vive solo server-side: el browser ve /api/cuenti/clients
  // y este edge (autenticado por JWT + rol) hace el fetch upstream.
  const cuentiURL = 'https://api-iawzelmu2a-uc.a.run.app/cuenti/clients';
  console.log(`[Cuenti Proxy] Fetching from: ${cuentiURL}`);

  try {
    const cuentiResponse = await fetch(cuentiURL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
      },
    });

    const responseBodyText = await cuentiResponse.text();
    console.log(`[Cuenti Proxy] Status: ${cuentiResponse.status}`);

    if (!cuentiResponse.ok) {
      console.error('[Cuenti Proxy] Error from Cuenti API:', responseBodyText);
      return new Response(`Error from Cuenti API: ${responseBodyText}`, { status: cuentiResponse.status });
    }

    let dataFromCuenti;
    try {
      dataFromCuenti = JSON.parse(responseBodyText);
    } catch (parseError) {
      console.error('[Cuenti Proxy] Invalid JSON from Cuenti:', parseError);
      return new Response('La respuesta de Cuenti no pudo ser procesada como JSON.', { status: 500 });
    }

    // Log successful request to Supabase for audit
    try {
      await supabase.from('api_logs').insert({
        endpoint: 'cuenti/clients',
        status_code: 200,
        response_size: responseBodyText.length,
        created_at: new Date().toISOString(),
      });
    } catch (logError) {
      console.warn('[Cuenti Proxy] Failed to log to Supabase:', logError);
    }

    console.log('[Cuenti Proxy] Success - returning data');
    return new Response(JSON.stringify(dataFromCuenti), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    console.error('[Cuenti Proxy] Fatal error:', error);
    return new Response('Error interno del servidor al procesar la solicitud para Cuenti.', { status: 500 });
  }
}