import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Endpoint para enviar notificaciones push de prueba (solo admin/developer).
 *
 * Reemplaza la Cloud Function `sendTestNotification` de Firebase.
 * En la migración post-FCM, usará OneSignal API.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { userId, title, body } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'Faltan campos requeridos: userId, title, body' });
    }

    // TODO: Integrar con OneSignal API
    // const onesignal = new OneSignal(process.env.ONESIGNAL_APP_ID, process.env.ONESIGNAL_API_KEY);
    // await onesignal.createNotification({ ... });

    return res.status(200).json({
      message: 'Notificación enviada (stub — integrar OneSignal)',
      data: { userId, title, body },
    });
  } catch (err: any) {
    console.error('[SendPush] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}