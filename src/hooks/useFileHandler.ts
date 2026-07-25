import { useState, useCallback } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../services/firebase';
import { compressImage } from '../utils/imageCompression';
import { useConnectivityStatus } from '../hooks/useConnectivityStatus';
import { blobToBase64 } from '../utils/blobConverter';

type DocumentWithId = { id: string; [key: string]: any };

interface UseFileHandlerProps<T extends DocumentWithId> {
  doc: T;
  updateDoc: (updates: Partial<T>) => Promise<void>;
  storagePath: string;
}

export const useFileHandler = <T extends DocumentWithId>({
  doc,
  updateDoc,
  storagePath,
}: UseFileHandlerProps<T>) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const connectivityStatus = useConnectivityStatus();

  const handleSelectImage = (url: string) => setSelectedImage(url);
  const handleCloseModal = () => setSelectedImage(null);

  const getFileUrl = (file: string | Blob): string => {
    if (typeof file === 'string') {
      return file;
    }
    return URL.createObjectURL(file);
  };

  const handleUpload = useCallback(async (files: File[], fieldName: keyof T, isArray: boolean = false) => {
    if (!doc || !doc.id) {
      setError("El documento no tiene un ID válido para subir archivos.");
      return;
    }
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      const compressionPromises = files.map(file => compressImage(file));
      const compressedBlobs = await Promise.all(compressionPromises);

      let finalFileRepresentations: string[];

      if (connectivityStatus.text === 'Online') {
        finalFileRepresentations = await Promise.all(
          compressedBlobs.map(async (blob, index) => {
            if (!blob) {
              throw new Error(`La compresión falló para el archivo: ${files[index].name}`);
            }
            const originalFile = files[index];
            const filePath = `${storagePath}/${doc.id}/${String(fieldName)}/${Date.now()}_${originalFile.name}`;
            const storageRef = ref(storage, filePath);
            const snapshot = await uploadBytesResumable(storageRef, blob);
            const downloadURL = await getDownloadURL(snapshot.ref);
            return downloadURL;
          })
        );
      } else { 
        const base64Promises = compressedBlobs.map(blob => {
          if (!blob) return Promise.reject('Uno de los archivos comprimidos es nulo.');
          return blobToBase64(blob);
        });
        finalFileRepresentations = await Promise.all(base64Promises);
      }

      let updatedValue: any;
      if (isArray) {
        const currentFiles = (doc[fieldName] as any[] | undefined) || [];
        // **CORRECCIÓN DEFINITIVA**: Aplanar tanto los datos existentes como los nuevos para sanear
        // cualquier estructura anidada y corrupta antes de combinar y guardar.
        const sanitizedCurrentFiles = Array.isArray(currentFiles) ? currentFiles.flat(Infinity) : [];
        const combinedFiles = [...sanitizedCurrentFiles, ...finalFileRepresentations];
        updatedValue = [...new Set(combinedFiles)];
      } else {
        const oldRepresentation = doc[fieldName];
        if (connectivityStatus.text === 'Online' && typeof oldRepresentation === 'string' && oldRepresentation.includes('firebasestorage')) {
          try {
            const oldFileRef = ref(storage, oldRepresentation);
            await deleteObject(oldFileRef);
          } catch (deleteError: any) {
            if (deleteError.code !== 'storage/object-not-found') {
              console.warn("No se pudo eliminar el archivo antiguo:", deleteError);
            }
          }
        }
        updatedValue = finalFileRepresentations[finalFileRepresentations.length - 1];
      }

      await updateDoc({ [fieldName]: updatedValue } as Partial<T>);

    } catch (e: any) {
      console.error(`Error al procesar archivos para ${String(fieldName)}:`, e);
      setError(`Error al procesar archivos: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  }, [doc, updateDoc, storagePath, connectivityStatus]);

  const handleRemove = useCallback(async (indexOrUrl: number | string, fieldName: keyof T, isArray: boolean = false) => {
    const currentFiles = doc[fieldName];
    if (currentFiles === undefined || currentFiles === null) return;

    let representationToRemove: string | undefined;
    let updatedValue: any;

    if (isArray && Array.isArray(currentFiles)) {
      // **CORRECCIÓN**: Aplanar el array antes de buscar el elemento a eliminar.
      const flattenedFiles = currentFiles.flat(Infinity);
      const target = typeof indexOrUrl === 'number' ? flattenedFiles[indexOrUrl] : indexOrUrl;
      representationToRemove = target;
      updatedValue = flattenedFiles.filter((rep: any) => rep !== representationToRemove);
    } else if (!isArray && typeof currentFiles === 'string') {
      representationToRemove = currentFiles;
      updatedValue = null;
    } else {
      console.warn("Argumentos no válidos para handleRemove:", { indexOrUrl, fieldName, isArray });
      return;
    }

    if (!representationToRemove) {
      console.warn("Se intentó eliminar un archivo que no existe.");
      return;
    }

    try {
      if (typeof representationToRemove === 'string' && representationToRemove.startsWith('https://firebasestorage')) {
        const fileRef = ref(storage, representationToRemove);
        await deleteObject(fileRef);
      }
      await updateDoc({ [fieldName]: updatedValue } as Partial<T>);
    } catch (e: any) {
      if (e.code !== 'storage/object-not-found') {
        console.error("Error al eliminar el archivo:", e);
        setError(`Error al eliminar el archivo: ${e.message}`);
      }
    }
  }, [doc, updateDoc]);

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
