import { useState, useCallback, useEffect, useRef } from 'react';
import { compressImage } from '../utils/imageCompression';
import { useConnectivityStatus } from './useConnectivityStatus';
import { blobToBase64 } from '../utils/blobConverter';
import { useSupabaseStorage } from './useSupabaseStorage';
import { safeFileName, storageObjectFromPublicUrl } from '../utils/storagePath';

type DocumentWithId = { id: string; [key: string]: any };

interface UseFileHandlerProps<T extends DocumentWithId> {
  doc: T;
  updateDoc: (updates: Partial<T>) => Promise<void>;
  storagePath: string;
}

/**
 * Hook para manejar subida/eliminación de archivos con soporte offline.
 *
 * - Online: sube a Supabase Storage y guarda la URL pública.
 * - Offline: convierte a base64 y guarda localmente (se sincroniza al volver online).
 *
 * Buckets soportados según storagePath:
 *   - 'orders'     -> 'order-photos'
 *   - 'equipment'  -> 'equipment-photos'
 */
export const useFileHandler = <T extends DocumentWithId>({
  doc,
  updateDoc,
  storagePath,
}: UseFileHandlerProps<T>) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { isOnline } = useConnectivityStatus();

  // Determine bucket based on storagePath
  const bucketName = storagePath === 'equipment' ? 'equipment-photos' : 'order-photos';
  const { uploadBase64, deleteFile } = useSupabaseStorage({ bucket: bucketName });

  const handleSelectImage = (url: string) => setSelectedImage(url);
  const handleCloseModal = () => setSelectedImage(null);

  // Un object URL por Blob, reutilizado entre renders y revocado al desmontar.
  const objectUrlsRef = useRef(new Map<Blob, string>());
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const getFileUrl = (file: string | Blob): string => {
    if (typeof file === 'string') return file;
    let url = objectUrlsRef.current.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      objectUrlsRef.current.set(file, url);
    }
    return url;
  };

  const deleteStoredFile = useCallback(async (representation: unknown) => {
    if (typeof representation !== 'string') return;
    const obj = storageObjectFromPublicUrl(representation);
    if (obj?.bucket !== bucketName) return;
    const { error: deleteError } = await deleteFile(obj.path);
    if (deleteError) console.warn('No se pudo eliminar el archivo anterior de Storage:', deleteError);
  }, [bucketName, deleteFile]);

  const handleUpload = useCallback(async (files: File[], fieldName: keyof T, isArray: boolean = false) => {
    if (!doc || !doc.id) {
      setError('El documento no tiene un ID válido para subir archivos.');
      return;
    }
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      const compressionPromises = files.map(file => compressImage(file));
      const compressedBlobs = await Promise.all(compressionPromises);

      let finalFileRepresentations: string[];

      // ---- ONLINE PATH ----
      if (isOnline) {
        finalFileRepresentations = await Promise.all(
          compressedBlobs.map(async (blob, index) => {
            if (!blob) throw new Error(`La compresión falló para: ${files[index].name}`);
            const originalFile = files[index];
            const filePath = `${storagePath}/${doc.id}/${String(fieldName)}/${Date.now()}_${safeFileName(originalFile.name)}`;

            const { url, error: uploadError } = await uploadBase64(filePath, await blobToBase64(blob));
            if (uploadError) throw new Error(uploadError);
            if (!url) throw new Error('No se obtuvo URL');
            return url;
          })
        );
      }
      // ---- OFFLINE PATH ----
      else {
        const base64Promises = compressedBlobs.map(blob => {
          if (!blob) return Promise.reject('Uno de los archivos comprimidos es nulo.');
          return blobToBase64(blob);
        });
        finalFileRepresentations = await Promise.all(base64Promises);
      }

      let updatedValue: any;
      let replaced: unknown;
      if (isArray) {
        const currentFiles = (doc[fieldName] as any[] | undefined) || [];
        const sanitizedCurrentFiles = Array.isArray(currentFiles) ? currentFiles.flat(Infinity) : [];
        const combinedFiles = [...sanitizedCurrentFiles, ...finalFileRepresentations];
        updatedValue = [...new Set(combinedFiles)];
      } else {
        replaced = doc[fieldName];
        updatedValue = finalFileRepresentations[finalFileRepresentations.length - 1];
      }

      await updateDoc({ [fieldName]: updatedValue } as Partial<T>);
      // El archivo reemplazado se borra solo después de que el documento ya no lo referencia.
      if (isOnline) await deleteStoredFile(replaced);
    } catch (e: any) {
      console.error(`Error al procesar archivos para ${String(fieldName)}:`, e);
      setError(`Error al procesar archivos: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  }, [doc, updateDoc, storagePath, isOnline, uploadBase64, deleteStoredFile]);

  const handleRemove = useCallback(async (indexOrUrl: number | string, fieldName: keyof T, isArray: boolean = false) => {
    const currentFiles = doc[fieldName];
    if (currentFiles === undefined || currentFiles === null) return;

    let representationToRemove: string | undefined;
    let updatedValue: any;

    if (isArray && Array.isArray(currentFiles)) {
      const flattenedFiles = currentFiles.flat(Infinity);
      const target = typeof indexOrUrl === 'number' ? flattenedFiles[indexOrUrl] : indexOrUrl;
      representationToRemove = target;
      updatedValue = flattenedFiles.filter((rep: any) => rep !== representationToRemove);
    } else if (!isArray && typeof currentFiles === 'string') {
      representationToRemove = currentFiles;
      updatedValue = null;
    } else {
      console.warn('Argumentos no válidos para handleRemove:', { indexOrUrl, fieldName, isArray });
      return;
    }

    if (!representationToRemove) {
      console.warn('Se intentó eliminar un archivo que no existe.');
      return;
    }

    try {
      await updateDoc({ [fieldName]: updatedValue } as Partial<T>);
      await deleteStoredFile(representationToRemove);
    } catch (e: any) {
      console.error('Error al eliminar el archivo:', e);
      setError(`Error al eliminar el archivo: ${e.message}`);
    }
  }, [doc, updateDoc, deleteStoredFile]);

  return {
    isUploading,
    error,
    selectedImage,
    handleSelectImage,
    handleCloseModal,
    getFileUrl,
    handleUpload,
    handleRemove,
  };
};