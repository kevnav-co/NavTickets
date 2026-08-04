import { supabase } from './supabase';
import { ServiceOrder } from '../types';

/**
 * Deletes a service order and all associated evidence images from Supabase Storage.
 *
 * The function extracts storage paths from any string URLs that appear in the
 * order's evidence arrays, deletes those files from the 'order-photos' bucket,
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

  // Convert URLs to bucket paths.
  const pathsToDelete = storageUrls.map(url => {
    try {
      const [, bucket, ...rest] = url.split('/public/');
      // After '/public/' we have '<bucket>/<path>'. Return the path portion.
      const parts = rest[0].split('/');
      // Remove the bucket name (first part) and join the rest as path.
      parts.shift(); // remove bucket name
      return parts.join('/');
    } catch {
      // If parsing fails, fallback to the whole URL (delete will error silently).
      return url;
    }
  });

  if (pathsToDelete.length > 0) {
    const { error } = await supabase.storage.from('order-photos').remove(pathsToDelete);
    if (error) {
      console.warn('Failed to delete some evidence files from Supabase Storage:', error.message);
    }
  }

  // Delete the order record from Supabase.
  const { error: dbError } = await supabase.from('orders').delete().eq('id', order.id);
  if (dbError) {
    throw new Error(`Failed to delete order ${order.id}: ${dbError.message}`);
  }
  console.log(`Order ${order.id} and its evidence have been deleted.`);
};
