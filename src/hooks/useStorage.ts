import { useCallback, useState } from 'react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { compressImage } from '../utils';

/**
 * Hook que proporciona una función para subir archivos a Firebase Storage.
 * Incluye la compresión de imágenes antes de la subida.
 */
export const useStorage = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const uploadFile = useCallback(async (file: File, path: string): Promise<string> => {
    setIsUploading(true);
    setError(null);

    try {
      // 1. Comprimir la imagen antes de subirla
      const compressedFile = await compressImage(file);
      
      // 2. Subir el archivo a Firebase Storage
      const storage = getStorage();
      const storageRef = ref(storage, path);
      const snapshot = await uploadBytes(storageRef, compressedFile);
      
      // 3. Obtener la URL de descarga
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      return downloadURL;

    } catch (err: any) {
      console.error("Error durante la subida del archivo:", err);
      setError(err);
      throw err; // Relanzar el error para que el llamador pueda manejarlo
    } finally {
      setIsUploading(false);
    }
  }, []);

  return { uploadFile, isUploading, error };
};