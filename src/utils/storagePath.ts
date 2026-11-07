/** Extrae bucket y ruta de una URL pública de Supabase Storage (.../object/public/<bucket>/<ruta>). */
export const storageObjectFromPublicUrl = (url: string): { bucket: string; path: string } | null => {
  const tail = url.split('/object/public/')[1];
  if (!tail) return null;
  const [bucket, ...parts] = decodeURIComponent(tail.split('?')[0]).split('/');
  if (!bucket || parts.length === 0) return null;
  return { bucket, path: parts.join('/') };
};

/** Nombre de archivo seguro para una ruta de Storage: sin separadores, espacios ni caracteres especiales. */
export const safeFileName = (name: string, maxLength = 80): string => {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-maxLength);
  return cleaned || 'archivo';
};
