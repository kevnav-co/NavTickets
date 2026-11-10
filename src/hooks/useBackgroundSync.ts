import { useEffect, useCallback, useMemo, useRef } from 'react';
import { useData } from '../context/DataContext';
import { useValidatedActions } from './useValidatedActions';
import { ServiceOrderSchema } from '../schemas/order.schema';
import { EquipmentSchema } from '../schemas/equipment.schema';
import { useConnectivityStatus } from './useConnectivityStatus';
import { useSupabaseStorage } from './useSupabaseStorage';

type Base64Field = { path: string[]; value: string };

/** Busca recursivamente imágenes guardadas como data URL (capturadas offline) y su ruta dentro del objeto. */
export const findBase64Fields = (obj: unknown, path: string[] = []): Base64Field[] => {
  if (typeof obj === 'string') return obj.startsWith('data:image/') ? [{ path, value: obj }] : [];
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) => findBase64Fields(value, [...path, key]));
};

/** Extensión de archivo según el MIME de la data URL (las firmas son PNG, las fotos JPEG). */
export const extensionForDataUrl = (dataUrl: string): string => {
  const mime = /^data:image\/([a-z0-9.+-]+)[;,]/i.exec(dataUrl)?.[1]?.toLowerCase() ?? 'jpeg';
  return mime === 'jpeg' ? 'jpg' : mime.replace('svg+xml', 'svg');
};

const setNestedValue = (obj: any, path: string[], value: unknown): any => {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  clone[head] = setNestedValue(clone[head], rest, value);
  return clone;
};

/**
 * Sube a Storage las imágenes que quedaron como base64 al capturarse sin conexión y
 * reemplaza la data URL por la URL del archivo. Se reintenta en cada reconexión;
 * un fallo en una imagen no bloquea las demás.
 */
export const useBackgroundSync = () => {
  const { isOnline } = useConnectivityStatus();
  const { orders, equipment } = useData();
  const { updateValidated } = useValidatedActions();
  const { uploadBase64: uploadOrderImage } = useSupabaseStorage({ bucket: 'order-photos' });
  const { uploadBase64: uploadEquipmentImage } = useSupabaseStorage({ bucket: 'equipment-photos' });
  const syncingRef = useRef(false);

  const pendingOrders = useMemo(() => orders.filter(o => findBase64Fields(o).length > 0), [orders]);
  const pendingEquipment = useMemo(() => equipment.filter(e => findBase64Fields(e).length > 0), [equipment]);

  const syncRecord = useCallback(async (
    collection: 'orders' | 'equipment',
    record: { id: string },
    upload: (path: string, base64: string) => Promise<{ url: string | null; error: string | null }>,
  ) => {
    const fields = findBase64Fields(record);
    let updated: any = record;
    const changedRoots = new Set<string>();
    for (const field of fields) {
      const root = field.path[0];
      const filePath = `${collection}/${record.id}/${root}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extensionForDataUrl(field.value)}`;
      const { url, error } = await upload(filePath, field.value);
      if (error || !url || url.startsWith('data:')) {
        console.error(`[BackgroundSync] No se pudo subir ${collection}/${record.id} (${field.path.join('.')}):`, error);
        continue;
      }
      updated = setNestedValue(updated, field.path, url);
      changedRoots.add(root);
    }
    if (changedRoots.size === 0) return;
    const updates = Object.fromEntries([...changedRoots].map(root => [root, updated[root]]));
    await updateValidated(collection, record.id, updates, collection === 'orders' ? ServiceOrderSchema : EquipmentSchema as any);
  }, [updateValidated]);

  const syncAll = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      for (const order of pendingOrders) await syncRecord('orders', order, uploadOrderImage).catch(err => console.error('[BackgroundSync]', err));
      for (const equip of pendingEquipment) await syncRecord('equipment', equip, uploadEquipmentImage).catch(err => console.error('[BackgroundSync]', err));
    } finally {
      syncingRef.current = false;
    }
  }, [pendingOrders, pendingEquipment, syncRecord, uploadOrderImage, uploadEquipmentImage]);

  useEffect(() => {
    if (!isOnline || (pendingOrders.length === 0 && pendingEquipment.length === 0)) return;
    const timer = setTimeout(syncAll, 5000);
    return () => clearTimeout(timer);
  }, [isOnline, pendingOrders, pendingEquipment, syncAll]);
};
