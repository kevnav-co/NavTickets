// NavTicket - notificar al super_admin del soporte de una nueva consulta.
// Llama a la function Vercel `api/edge/support-notify` (misma origin) con el
// access_token del usuario que crea el ticket. Fire-and-forget: si falla (p.ej.
// offline o error), el contador de no-leídos por realtime igual lo cubre.

import { supabase } from './supabase';

export async function notifySupportNewTicket(payload: {
  companyId: string;
  subject: string;
  message: string;
}): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    await fetch(`${window.location.origin}/api/support-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('[Support Notify] no se pudo notificar al super_admin:', error);
  }
}