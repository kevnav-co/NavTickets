// Enlaces firmados para las fotos privadas, con caché en memoria y peticiones
// agrupadas: una pantalla con 20 fotos hace una sola llamada por bucket.
import { supabase } from './supabase';
import { offlineStorageUrl, privateStorageRef, type StorageRef } from '../utils/storageUrls';

const TTL_SECONDS = 60 * 60;          // validez del enlace
const REFRESH_MARGIN_MS = 5 * 60_000; // se renueva 5 min antes de caducar

const cache = new Map<string, { url: string; expiresAt: number }>();
let queue: { key: string; ref: StorageRef; resolve: (u: string) => void }[] = [];
let scheduled = false;

const supabaseUrl = () => String(import.meta.env.VITE_SUPABASE_URL ?? '');
const keyOf = (ref: StorageRef) => `${ref.bucket}/${ref.path}`;

async function flush() {
  scheduled = false;
  const batch = queue;
  queue = [];
  const byBucket = new Map<string, typeof batch>();
  for (const item of batch) byBucket.set(item.ref.bucket, [...(byBucket.get(item.ref.bucket) ?? []), item]);

  for (const [bucket, items] of byBucket) {
    const paths = [...new Set(items.map((i) => i.ref.path))];
    let signed = new Map<string, string>();
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, TTL_SECONDS);
      if (error) throw error;
      signed = new Map((data ?? []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as [string, string]] : [])));
    } catch (e) {
      console.warn('[storageUrls] No se pudieron firmar enlaces:', e);
    }
    const expiresAt = Date.now() + TTL_SECONDS * 1000;
    for (const item of items) {
      const url = signed.get(item.ref.path);
      if (url) {
        cache.set(item.key, { url, expiresAt });
        item.resolve(url);
      } else {
        // Sin firma (sin conexión, sin permiso o archivo inexistente): la copia en
        // caché del service worker, si existe; si no, la imagen no se mostrará.
        item.resolve(offlineStorageUrl(supabaseUrl(), item.ref));
      }
    }
  }
}

/** Devuelve la URL con la que mostrar un archivo. Las URLs que no son de fotos privadas no cambian. */
export function resolveStorageUrl(url: string): Promise<string> {
  const ref = privateStorageRef(url);
  if (!ref) return Promise.resolve(url);
  const key = keyOf(ref);
  const hit = cache.get(key);
  if (hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now()) return Promise.resolve(hit.url);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.resolve(offlineStorageUrl(supabaseUrl(), ref));
  }
  return new Promise((resolve) => {
    queue.push({ key, ref, resolve });
    if (!scheduled) {
      scheduled = true;
      setTimeout(() => void flush(), 0);
    }
  });
}

/** Versión síncrona: la URL ya firmada si está en caché. */
export function cachedStorageUrl(url: string): string | null {
  const ref = privateStorageRef(url);
  if (!ref) return url;
  const hit = cache.get(keyOf(ref));
  return hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now() ? hit.url : null;
}

/** Solo para pruebas. */
export function __resetStorageUrlCache() {
  cache.clear();
  queue = [];
  scheduled = false;
}
