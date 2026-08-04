/**
 * Determina el bucket de Supabase Storage según el path del archivo.
 *
 * Convención de paths:
 * - orders/* -> 'order-photos'
 * - equipment/* -> 'equipment-photos'
 * - users/* -> 'user-photos'
 * - clients/* -> 'client-photos'
 * - default -> 'order-photos'
 */
export const bucketForPath = (path: string): string => {
  if (path.startsWith('orders/')) return 'order-photos';
  if (path.startsWith('equipment/')) return 'equipment-photos';
  if (path.startsWith('users/')) return 'user-photos';
  if (path.startsWith('clients/')) return 'client-photos';
  return 'order-photos'; // default bucket
};

/**
 * Genera un path estándar para almacenar archivos.
 */
export const generateStoragePath = (
  collection: 'orders' | 'equipment' | 'users' | 'clients',
  docId: string,
  fieldName: string,
  fileName: string
): string => {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${collection}/${docId}/${fieldName}/${timestamp}_${sanitizedFileName}`;
};