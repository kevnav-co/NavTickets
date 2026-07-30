import { useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { useConnectivityStatus } from './useConnectivityStatus';

type BucketName = 'order-photos' | 'equipment-photos' | 'public';

interface UseSupabaseStorageOptions {
  bucket: BucketName;
  maxSizeMB?: number;
}

interface UseSupabaseStorageResult {
  uploadFile: (path: string, file: File | Blob) => Promise<{ url: string | null; error: string | null }>;
  uploadBase64: (path: string, base64: string) => Promise<{ url: string | null; error: string | null }>;
  deleteFile: (path: string) => Promise<{ error: string | null }>;
  getPublicUrl: (path: string) => string;
  isUploading: boolean;
  error: string | null;
}

/**
 * Hook para subir/eliminar archivos en Supabase Storage.
 *
 * Reemplaza el uso de Firebase Storage (ref, uploadBytes, getDownloadURL).
 *
 * Buckets disponibles:
 *   - order-photos:   Fotos de órdenes de servicio
 *   - equipment-photos: Fotos de equipos
 *   - public:         Archivos públicos (logos, etc.)
 */
export function useSupabaseStorage(
  options: UseSupabaseStorageOptions
): UseSupabaseStorageResult {
  const { bucket, maxSizeMB = 10 } = options;
  const { isOnline } = useConnectivityStatus();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Sube un archivo (File/Blob) a Supabase Storage.
   *
   * @param path - Ruta dentro del bucket (ej: "orderId/filename.jpg")
   * @param file - Archivo a subir
   */
  const uploadFile = useCallback(
    async (path: string, file: File | Blob): Promise<{ url: string | null; error: string | null }> => {
      if (!isSupabaseConfigured()) {
        return { url: null, error: 'Supabase no está configurado' };
      }

      if (!isOnline) {
        // Si está offline, convertir a base64 y devolver para guardar localmente
        try {
          const base64 = await blobToBase64(file);
          return { url: base64, error: null };
        } catch {
          return { url: null, error: 'Sin conexión y no se pudo convertir la imagen' };
        }
      }

      // Validar tamaño
      const maxBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxBytes) {
        return { url: null, error: `El archivo excede el límite de ${maxSizeMB}MB` };
      }

      setIsUploading(true);
      setError(null);

      try {
        const { data, error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: true,
            contentType: file.type || 'image/jpeg',
          });

        if (uploadError) throw uploadError;

        // Obtener URL pública
        const { data: { publicUrl } } = supabase.storage
          .from(bucket)
          .getPublicUrl(data.path);

        setIsUploading(false);
        return { url: publicUrl, error: null };
      } catch (err: any) {
        console.error(`[SupabaseStorage] Error uploading to ${bucket}:`, err);
        setIsUploading(false);
        setError(err.message);
        return { url: null, error: err.message };
      }
    },
    [bucket, maxSizeMB, isOnline]
  );

  /**
   * Sube una imagen en formato base64 a Supabase Storage.
   * Útil para sincronizar fotos tomadas offline.
   */
  const uploadBase64 = useCallback(
    async (path: string, base64: string): Promise<{ url: string | null; error: string | null }> => {
      if (!isSupabaseConfigured()) {
        return { url: null, error: 'Supabase no está configurado' };
      }

      if (!isOnline) {
        return { url: base64, error: null };
      }

      setIsUploading(true);
      setError(null);

      try {
        // Convertir base64 a Blob
        const response = await fetch(base64);
        const blob = await response.blob();

        const { data, error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(path, blob, {
            cacheControl: '3600',
            upsert: true,
            contentType: blob.type || 'image/jpeg',
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from(bucket)
          .getPublicUrl(data.path);

        setIsUploading(false);
        return { url: publicUrl, error: null };
      } catch (err: any) {
        console.error('[SupabaseStorage] Error uploading base64:', err);
        setIsUploading(false);
        setError(err.message);
        return { url: null, error: err.message };
      }
    },
    [bucket, isOnline]
  );

  /**
   * Elimina un archivo de Supabase Storage.
   */
  const deleteFile = useCallback(
    async (path: string): Promise<{ error: string | null }> => {
      if (!isSupabaseConfigured()) {
        return { error: 'Supabase no está configurado' };
      }

      try {
        const { error: deleteError } = await supabase.storage
          .from(bucket)
          .remove([path]);

        if (deleteError) throw deleteError;
        return { error: null };
      } catch (err: any) {
        console.error('[SupabaseStorage] Error deleting file:', err);
        return { error: err.message };
      }
    },
    [bucket]
  );

  /**
   * Obtiene la URL pública de un archivo.
   */
  const getPublicUrl = useCallback(
    (path: string): string => {
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(path);
      return publicUrl;
    },
    [bucket]
  );

  return {
    uploadFile,
    uploadBase64,
    deleteFile,
    getPublicUrl,
    isUploading,
    error,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convierte un Blob a base64.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}