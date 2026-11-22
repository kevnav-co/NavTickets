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

/** Tipos de imagen que aceptan los buckets de fotos (sin SVG: puede llevar scripts). */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
/** Logos y favicons de empresa: los mismos menos GIF. */
export const ALLOWED_COMPANY_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const isAllowedImageType = (type: string, allowed: readonly string[] = ALLOWED_IMAGE_TYPES): boolean =>
  allowed.includes(type.split(';')[0].trim().toLowerCase());

export const extensionForImageType = (type: string): string =>
  ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[
    type.split(';')[0].trim().toLowerCase()
  ] ?? 'bin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ruta dentro del bucket con la empresa como primera carpeta: `{companyId}/orders/…`.
 * Las políticas de Storage (migración 052) solo dejan subir, reemplazar y borrar
 * dentro de la carpeta de la propia empresa. Rechaza rutas con `..` o vacías y no
 * duplica el prefijo si ya lo trae.
 */
export const companyScopedPath = (companyId: string, path: string): string => {
  if (!UUID_RE.test(companyId)) throw new Error('Empresa no válida para guardar el archivo');
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = clean.split('/');
  if (!clean || parts.some((p) => p === '' || p === '.' || p === '..')) {
    throw new Error('Ruta de archivo no válida');
  }
  return parts[0].toLowerCase() === companyId.toLowerCase() ? clean : `${companyId}/${clean}`;
};
