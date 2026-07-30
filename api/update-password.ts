import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Actualiza la contraseña de un usuario (solo admin).
 *
 * Reemplaza la Cloud Function `updateUserPassword` de Firebase.
 * Requiere autorización de administrador.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Configuración de Supabase faltante' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { userId, newPassword, requesterRole } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'Faltan userId y/o newPassword' });
    }

    if (requesterRole !== 'admin' && requesterRole !== 'developer' && requesterRole !== 'super_admin') {
      return res.status(403).json({ error: 'No autorizado: se requiere rol de administrador' });
    }

    // Obtener el supabase_auth_id del usuario
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('supabase_auth_id')
      .eq('id', userId)
      .single();

    if (userError || !user?.supabase_auth_id) {
      return res.status(404).json({ error: 'Usuario no encontrado o sin auth_id vinculado' });
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.supabase_auth_id,
      { password: newPassword }
    );

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    return res.status(200).json({ message: 'Contraseña actualizada exitosamente' });
  } catch (err: any) {
    console.error('[UpdatePassword] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}