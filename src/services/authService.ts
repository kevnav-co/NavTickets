import { createClient } from '@supabase/supabase-js';
import { User } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';

// Cliente de Supabase creado de forma perezosa para evitar problemas de inicialización
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      console.error("Error: Las variables de entorno de Supabase no están configuradas.");
      throw new Error("Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY");
    }

    supabaseClient = createClient(url, anonKey, {
      auth: { persistSession: false }
    });
  }
  return supabaseClient;
}

/**
 * Valida las credenciales del usuario contra la base de datos de Supabase.
 * @param username El nombre de usuario a verificar.
 * @param password La contraseña a verificar.
 * @returns El objeto User en caso de éxito, o null en caso de fallo.
 */
export const loginUser = async (username: string, password?: string): Promise<User | null> => {
  if (!username || !password) {
    console.error("El nombre de usuario y la contraseña son obligatorios.");
    return null;
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !data) {
      console.log(`Intento de login fallido: No se encontró el usuario "${username}".`);
      return null;
    }

    const userData = data as any;

    if (userData.password === password) {
      console.log(`Login exitoso para el usuario "${username}".`);

      const user: User = {
        id: userData.id,
        companyId: userData.company_id || 'default',
        name: userData.name || '',
        role: userData.role || 'technician',
        username: userData.username || '',
        identification: userData.identification || '',
        email: userData.email || '',
        phone: userData.phone || '',
        latitude: userData.latitude || 0,
        longitude: userData.longitude || 0,
        signature: userData.signature || undefined,
        fcmToken: userData.fcm_token || undefined,
        locationUpdatedAt: userData.location_updated_at || undefined,
        createdAt: userData.created_at,
        updatedAt: userData.updated_at,
        password: userData.password || '',
      };

      return user;
    } else {
      console.log(`Intento de login fallido: Contraseña incorrecta para "${username}".`);
      return null;
    }
  } catch (error) {
    console.error("Error crítico durante la validación del usuario en la base de datos:", error);
    return null;
  }
};

/**
 * Cierra la sesión del usuario (manejado por el contexto).
 */
export const logoutUser = async (): Promise<void> => {
    console.log("Logout solicitado. El estado del usuario debe ser limpiado por el AuthContext.");
    return Promise.resolve();
};