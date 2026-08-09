import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  const cuentiURL = 'https://app.cuenti.com/jServerj4ErpPro/com/j4ErpPro/server/adm/cliente/ConsultarClientePaginado/1/0';
  console.log(`[Cuenti Proxy] Fetching from: ${cuentiURL}`);

  try {
    const cuentiResponse = await fetch(cuentiURL, {
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