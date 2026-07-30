import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Proxy para la API de Cuenti ERP.
 *
 * Reemplaza la Cloud Function `api` de Firebase.
 * Se autentica con CUENTI_API_TOKEN desde las env vars de Vercel.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const token = process.env.CUENTI_API_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'CUENTI_API_TOKEN no configurado' });
  }

  // Ejemplo: GET /api/cuenti?search=cliente
  // TODO: Implementar la lógica de proxy según la API de Cuenti
  try {
    return res.status(200).json({
      message: 'Cuenti API Proxy funcionando',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[Cuenti Proxy] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}