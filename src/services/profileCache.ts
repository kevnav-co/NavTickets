import type { User } from '../types';

/**
 * Copia local del perfil del usuario, para pasar la puerta de autenticación
 * sin cobertura.
 *
 * El perfil se pide por red a la tabla `users`; sin conexión la petición falla
 * y la aplicación, al no tener usuario, mostraba el formulario de entrada aunque
 * la sesión siguiera viva y la caché de datos estuviera llena. Guardar aquí el
 * último perfil obtenido permite restaurarlo en ese caso.
 *
 * Vive en localStorage y no en la base local porque la autenticación se
 * resuelve antes de que exista la capa de datos, y así tampoco arrastra Dexie a
 * la pantalla de entrada. Se guarda junto al identificador de autenticación y
 * solo se devuelve para ese mismo identificador: nunca sirve para otra cuenta.
 */

const KEY = 'navtickets_profile_cache';

interface CachedProfile {
  authUserId: string;
  profile: User;
  savedAt: string;
}

export function readCachedProfile(authUserId: string): User | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedProfile;
    if (parsed.authUserId !== authUserId || !parsed.profile?.id) return null;
    return parsed.profile;
  } catch {
    return null;
  }
}

export function writeCachedProfile(authUserId: string, profile: User): void {
  try {
    const entry: CachedProfile = { authUserId, profile, savedAt: new Date().toISOString() };
    localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // Almacenamiento lleno o bloqueado: se sigue sin copia local.
  }
}

export function clearCachedProfile(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nada que limpiar si el almacenamiento no está disponible.
  }
}
