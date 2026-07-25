import imageCompression from 'browser-image-compression';

/**
 * Comprime una imagen utilizando la librería browser-image-compression para un control
 * avanzado y un rendimiento óptimo.
 *
 * La función devuelve un Blob para mantener la compatibilidad con el código existente,
 * ya que la librería subyacente produce un objeto File (que es un tipo de Blob).
 *
 * @param {File} file - El archivo de imagen a comprimir.
 * @returns {Promise<Blob>} - Una promesa que se resuelve con la imagen comprimida como un Blob.
 */
export const compressImage = async (file: File): Promise<Blob> => {
  const options = {
    maxSizeMB: 0.1,          // Límite máximo de 100 KB
    maxWidthOrHeight: 720,   // Resolución máxima de 720px en el lado más largo
    useWebWorker: false,     // Desactivado para evitar timeouts en el dev server de Vite.
    initialQuality: 0.15,     // Calidad JPEG al 15%
    alwaysKeepResolution: false, // Permite que la resolución se reduzca si es necesario
    fileType: 'image/jpeg', // Forzar la salida a JPEG para mejor compresión
  };

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
