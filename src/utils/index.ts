import { supabase } from '../services/supabase';
import { bucketForPath } from './storagePaths';

export const MAX_IMAGE_SIZE_MB = 7;
export const MAX_VIDEO_SIZE_MB = 10;

/**
 * Genera un nombre de usuario a partir de un nombre completo.
 * Ej: "Kevin Navas" -> "knavas"
 */
export const getUsername = (fullName: string): string => {
  if (!fullName || typeof fullName !== 'string') return '';
  const names = fullName.trim().toLowerCase().split(' ');
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];

  const firstName = names[0];
  const lastName = names[names.length - 1];

  return `${firstName.charAt(0)}${lastName}`;
};


/**
 * Valida el tamaño de un archivo y muestra alerta si excede el límite.
 * Retorna true si es válido, false si no.
 */
export const validateFile = (file: File, type: 'image' | 'video' = 'image'): boolean => {
  const limitMB = type === 'video' ? MAX_VIDEO_SIZE_MB : MAX_IMAGE_SIZE_MB;
  if (file.size > limitMB * 1024 * 1024) {
    alert(`El archivo excede el límite máximo de ${limitMB} MB.`);
    return false;
  }
  return true;
};


/**
 * Sube una imagen base64 a Supabase Storage y retorna la URL pública.
 * USADO PRINCIPALMENTE PARA FIRMAS.
 */
export const uploadImageToStorage = async (path: string, base64Image: string): Promise<string> => {
  if (!base64Image || !base64Image.startsWith('data:')) return base64Image;

  // Determine bucket from path
  const bucket = bucketForPath(path);

  try {
    // Convert base64 to blob
    const response = await fetch(base64Image);
    const blob = await response.blob();

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });

    if (uploadError) {
      console.error(`Error subiendo imagen a ${path}:`, uploadError);
      throw uploadError;
    }

    // Get public URL
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  } catch (error: any) {
    console.error(`Error subiendo imagen a ${path}:`, error);
    throw error;
  }
};

/**
 * Elimina una imagen de Supabase Storage dada su URL o path.
 */
export const deleteImageFromStorage = async (imageUrl: string): Promise<void> => {
  if (!imageUrl) return;

  try {
    let pathToDelete: string;
    let bucket: string;

    // If it's a Supabase public URL, extract path and bucket
    if (imageUrl.includes('supabase.co/storage/v1/object/public/')) {
      const parts = imageUrl.split('/public/')[1]?.split('/');
      if (parts && parts.length >= 2) {
        bucket = parts[0];
        pathToDelete = parts.slice(1).join('/');
      } else {
        console.warn('No se pudo extraer path de la URL de Supabase:', imageUrl);
        return;
      }
    }
    // If it's a Firebase URL, we can't delete from Supabase - just log and return
    else if (imageUrl.includes('firebasestorage.googleapis.com')) {
      console.warn('URL de Firebase Storage detectada, no se puede eliminar desde Supabase:', imageUrl);
      return;
    }
    // Assume it's a raw path
    else {
      bucket = bucketForPath(imageUrl);
      pathToDelete = imageUrl;
    }

    const { error } = await supabase.storage.from(bucket).remove([pathToDelete]);
    if (error) {
      console.error('Error eliminando imagen de storage:', error);
      throw error;
    }
    console.log("Imagen eliminada correctamente:", pathToDelete);
  } catch (error: any) {
    console.error("Error eliminando imagen de storage:", error);
    throw error;
  }
};

// Re-exportar para mantener un único punto de importación
export * from './imageCompression';
export * from './gpsCache';
export * from './connectivity';
