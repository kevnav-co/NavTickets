import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from '../services/firebase';

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
 * Sube una imagen base64 a Firebase Storage y retorna la URL pública.
 * USADO PRINCIPALMENTE PARA FIRMAS.
 */
export const uploadImageToStorage = async (path: string, base64Image: string): Promise<string> => {
  if (!storage || !base64Image || !base64Image.startsWith('data:')) return base64Image;

  const metadata = { contentType: 'image/jpeg' };

  try {
    const storageRef = ref(storage, path);
    await uploadString(storageRef, base64Image, 'data_url', metadata);
    return await getDownloadURL(storageRef);
  } catch (error: any) {
    console.error(`Error subiendo imagen a ${path}:`, error);
    throw error;
  }
};

/**
 * Elimina una imagen de Firebase Storage dada su URL.
 */
export const deleteImageFromStorage = async (imageUrl: string): Promise<void> => {
  if (!storage || !imageUrl || !imageUrl.includes('firebasestorage.googleapis.com')) return;

  try {
    const fileRef = ref(storage, imageUrl);
    await deleteObject(fileRef);
    console.log("Imagen eliminada correctamente:", imageUrl);
  } catch (error: any) {
    if (error.code === 'storage/object-not-found') {
      console.warn("Imagen no encontrada en storage (ya eliminada):", imageUrl);
    } else {
      console.error("Error eliminando imagen de storage:", error);
    }
  }
};

// Re-exportar para mantener un único punto de importación
export * from './imageCompression';
export * from './gpsCache';
export * from './connectivity';
