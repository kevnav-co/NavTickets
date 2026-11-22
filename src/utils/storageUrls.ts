// Fotos privadas (paso 2): los registros siguen guardando la URL pública de cada
// archivo como identificador (`…/object/public/<bucket>/<ruta>`), pero los buckets
// de fotos son privados y para mostrarlas hace falta un enlace firmado. Esta es la
// parte pura; la firma y la caché viven en src/services/storageUrls.ts.
import { storageObjectFromPublicUrl } from './storagePath';

/** Buckets cuyos archivos solo se ven con enlace firmado (migración 053). */
export const PRIVATE_BUCKETS = ['order-photos', 'equipment-photos'] as const;

export interface StorageRef {
  bucket: string;
  path: string;
}

/** Bucket y ruta si la URL apunta a un bucket privado de este proyecto; si no, null (se usa tal cual). */
export function privateStorageRef(url: string | null | undefined): StorageRef | null {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null;
  if (!/\/storage\/v1\/object\/(public|sign|authenticated)\//.test(url)) return null;
  const normalized = url.replace(/\/object\/(sign|authenticated)\//, '/object/public/');
  const obj = storageObjectFromPublicUrl(normalized);
  if (!obj || !(PRIVATE_BUCKETS as readonly string[]).includes(obj.bucket)) return null;
  return obj;
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/**
 * URL firmada sin token: es la clave con la que el service worker guarda la foto
 * (src/sw.ts quita el token). Sirve para mostrar sin conexión una foto ya vista.
 */
export function offlineStorageUrl(supabaseUrl: string, ref: StorageRef): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/sign/${ref.bucket}/${encodePath(ref.path)}`;
}

/** Quita el token de una URL firmada; el resto de URLs no cambian. Lo usa el service worker. */
export function stripSignedToken(url: string): string {
  try {
    const u = new URL(url);
    if (!u.pathname.includes('/storage/v1/object/sign/')) return url;
    u.searchParams.delete('token');
    return u.toString();
  } catch {
    return url;
  }
}
