import { supabase } from './supabase';
import { ServiceOrder } from '../types';

/**
 * Deletes a service order and all associated evidence images from Supabase Storage.
 *
 * The function extracts storage paths from any string URLs that appear in the
 * order's evidence arrays, deletes those files from their Storage bucket,
 * and then deletes the order record from the 'orders' table.
 */
export const deleteOrderWithEvidence = async (order: ServiceOrder): Promise<void> => {
  // Gather any string URLs that look like Supabase public URLs.
  const evidenceItems = [
    ...(order.initialEvidence || []),
    ...(order.closingData?.evidenceImages || []),
  ];

  const storageUrls = evidenceItems.filter(
    (item): item is string => typeof item === 'string' && item.includes('supabase.co/storage/v1/object/public')
  );

  // URL pública: .../storage/v1/object/public/<bucket>/<ruta>. Se agrupa por bucket.
  const pathsByBucket = new Map<string, string[]>();
  for (const url of storageUrls) {
    const [bucket, ...parts] = decodeURIComponent(url.split('/object/public/')[1]?.split('?')[0] ?? '').split('/');
    if (!bucket || parts.length === 0) continue;
    pathsByBucket.set(bucket, [...(pathsByBucket.get(bucket) ?? []), parts.join('/')]);
  }

  for (const [bucket, paths] of pathsByBucket) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) {
      console.warn(`Failed to delete some evidence files from bucket ${bucket}:`, error.message);
    }
  }

  // Delete the order record from Supabase.
  const { error: dbError } = await supabase.from('orders').delete().eq('id', order.id);
  if (dbError) {
    throw new Error(`Failed to delete order ${order.id}: ${dbError.message}`);
  }
  console.log(`Order ${order.id} and its evidence have been deleted.`);
};
