import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Variables de entorno no configuradas. ' +
    'Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env'
  );
}

export const supabase = createClient<Database>(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // No usamos magic links
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

/**
 * Helper para verificar si el cliente Supabase está configurado.
 * Útil para mostrar un estado degradado si faltan las variables de entorno.
 */
export const isSupabaseConfigured = (): boolean => {
  return !!(supabaseUrl && supabaseAnonKey);
};

/**
 * Devuelve el access_token de la sesión activa (para enviar como `Bearer`
 * a las Edge Functions y que identifiquen al usuario real), o null si no hay
 * sesión. Nunca usar la anon key como identidad.
 */
export const authAccessToken = async (): Promise<string | null> => {
  if (!isSupabaseConfigured()) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
};

/**
 * ¿Queda una sesión guardada de una entrada anterior? Es síncrono y no toca la
 * red, al contrario que `getSession`.
 *
 * Sirve para distinguir dos situaciones que por lo demás se parecen, porque en
 * ambas el perfil del usuario está sin resolver: quien nunca ha entrado y está
 * ante el formulario, y quien ya entró pero ahora no tiene cobertura, de modo
 * que el perfil no se puede pedir. Al primero no hay que abrirle la caché local;
 * al segundo es justo lo que le salva la jornada.
 */
export const hasPersistedSession = (): boolean => {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.+-auth-token$/.test(key)) return true;
    }
  } catch {
    // Almacenamiento bloqueado (ventana privada): se asume que no hay sesión.
  }
  return false;
};