import { supabase } from './supabase';
import { ServiceOrder } from '../types';
import { storageObjectFromPublicUrl } from '../utils/storagePath';

/** Todas las URLs de Supabase Storage referenciadas en cualquier campo del objeto (evidencias, firmas, garantías). */
export const collectStorageUrls = (value: unknown): string[] => {
  if (typeof value === 'string') return storageObjectFromPublicUrl(value) ? [value] : [];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>).flatMap(collectStorageUrls);
};

/**
 * Borra de Supabase Storage los archivos de una orden, agrupados por bucket.
 * Llamar después de eliminar el registro: si esto falla quedan archivos huérfanos,
 * nunca una orden apuntando a archivos inexistentes.
 */
export const deleteOrderEvidenceFiles = async (order: ServiceOrder): Promise<void> => {
  const pathsByBucket = new Map<string, string[]>();
  for (const url of new Set(collectStorageUrls(order))) {
    const obj = storageObjectFromPublicUrl(url);
    if (!obj) continue;
    pathsByBucket.set(obj.bucket, [...(pathsByBucket.get(obj.bucket) ?? []), obj.path]);
  }

  for (const [bucket, paths] of pathsByBucket) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) {
      console.warn(`Failed to delete some evidence files from bucket ${bucket}:`, error.message);
    }
  }
};
