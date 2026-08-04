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
 * Busca y obtiene los datos de un usuario desde la tabla 'users' de Supabase
 * utilizando su UID (el ID de autenticación de Firebase/Supabase).
 * @param uid El ID único del usuario.
 * @returns El objeto de usuario con sus datos de la app (incluyendo el rol), o null si no se encuentra.
 */
export const getUserDataById = async (uid: string): Promise<User | null> => {
  if (!uid) return null;

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', uid)
      .single();

    if (error || !data) {
      console.warn(`ADVERTENCIA: Usuario autenticado con UID (${uid}) pero sin documento correspondiente en la tabla 'users'.`);
      return null;
    }

    const userData = data as any;

    // Construye el objeto de usuario a partir de la tabla de Supabase
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
      // No incluyas la contraseña aquí, ya que no debe estar expuesta en el cliente
    };
    return user;
  } catch (error) {
    console.error("Error fetching user data:", error);
    return null;
  }
};