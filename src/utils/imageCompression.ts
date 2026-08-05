import imageCompression from 'browser-image-compression';
import { useState, useEffect } from 'react';

/**
 * Comprime una imagen utilizando la librería browser-image-compression para un control
 * avanzado y un rendimiento óptimo.
 *
 * La función devuelve un Blob para mantener la compatibilidad con el código existente,
 * ya que la librería subyacente produce un objeto File (que es un tipo de Blob).
 *
 * @param {File} file - El archivo de imagen a comprimir.
 * @param {object} options - Opciones de compresión personalizadas.
 * @returns {Promise<Blob>} - Una promesa que se resuelve con la imagen comprimida como un Blob.
 */
interface CompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'webp' | 'auto';
}

export const compressImage = async (
  file: File,
  customOptions: CompressionOptions = {}
): Promise<Blob> => {
  const format = customOptions.format || 'webp';
  const quality = customOptions.quality || 0.2;

  const options = {
    maxSizeMB: customOptions.maxSizeMB || 0.1,          // Límite máximo de 100 KB
    maxWidthOrHeight: customOptions.maxWidthOrHeight || 720,   // Resolución máxima de 720px
    useWebWorker: false,     // Desactivado para evitar timeouts en el dev server de Vite.
    initialQuality: quality,  // Calidad adaptable
    alwaysKeepResolution: false, // Permite que la resolución se reduzca si es necesario
    fileType: format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/jpeg',
  } as const;

  try {
    // La librería devuelve un objeto File, que es un subtipo de Blob.
    // La firma de la función se mantiene como Promise<Blob> por compatibilidad.
    const compressedFile = await imageCompression(file, options);
    return compressedFile;
  } catch (error) {
    console.error('Error durante la compresión de la imagen:', error);
    // En caso de error, devolvemos el archivo original para no romper el flujo.
    // Un File es un Blob, por lo que es seguro devolverlo directamente.
    return file;
  }
};

/**
 * Hook para imágenes con lazy loading y WebP fallback
 */
export const useOptimizedImage = (src: string, placeholder?: string) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(placeholder || src);

  useEffect(() => {
    if (!src) return;

    // Try WebP first if it's a remote image
    if (src.startsWith('http') && !src.includes('webp')) {
      // Could convert to WebP via a CDN or service
      setCurrentSrc(placeholder || src);
    }

    const img = new Image();
    img.src = src;
    img.onload = () => {
      setIsLoaded(true);
      if (!hasError) setCurrentSrc(src);
    };
    img.onerror = () => {
      setHasError(true);
      if (placeholder) setCurrentSrc(placeholder);
    };
  }, [src, placeholder, hasError]);

  return { isLoaded, hasError, currentSrc };
};