import { useEffect, useCallback, useState } from 'react';
import { useData } from '../context/DataContext';
import { useValidatedActions } from './useValidatedActions';
import { ServiceOrderSchema } from '../schemas/order.schema';
import { EquipmentSchema } from '../schemas/equipment.schema';
import { useConnectivityStatus } from './useConnectivityStatus';
import { useSupabaseStorage } from './useSupabaseStorage';

// Helper function to recursively find base64 strings and their paths in an object.
const findBase64Fields = (obj: any, path: string[] = []): { path: string[]; value: string }[] => {
  const results: { path: string[]; value: string }[] = [];
  if (!obj || typeof obj !== 'object') return results;

  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const value = obj[key];
    const currentPath = [...path, key];
    if (typeof value === 'string' && value.startsWith('data:image/')) {
      results.push({ path: currentPath, value });
    } else if (Array.isArray(value)) {
      value.forEach((item, idx) => {
        if (typeof item === 'string' && item.startsWith('data:image/')) {
          results.push({ path: [...currentPath, String(idx)], value: item });
        } else if (typeof item === 'object') {
          results.push(...findBase64Fields(item, [...currentPath, String(idx)]));
        }
      });
    } else if (typeof value === 'object') {
      results.push(...findBase64Fields(value, currentPath));
    }
  }
  return results;
};

// Helper to set a nested value in an immutable way.
const setNestedValue = (obj: any, path: string[], value: any): any => {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  const clone = Array.isArray(obj) ? [...obj] : { ...obj };
  clone[head] = setNestedValue(clone[head], rest, value);
  return clone;
};

export const useBackgroundSync = () => {
  const { text: connectionText } = useConnectivityStatus();
  const { orders, equipment } = useData();
  const { updateValidated } = useValidatedActions();
  const [isSyncing, setIsSyncing] = useState(false);

  // Supabase storage hooks for the appropriate buckets.
  const orderStorage = useSupabaseStorage({ bucket: 'order-photos' });
  const equipmentStorage = useSupabaseStorage({ bucket: 'equipment-photos' });

  const syncBase64ToStorage = useCallback(async () => {
    if (connectionText !== 'Online' || isSyncing) return;
    setIsSyncing(true);
    try {
      // 1. Sync Orders
      for (const order of orders) {
        const base64Fields = findBase64Fields(order);
        if (!base64Fields.length) continue;
        console.log(`Syncing offline images for order ${order.id}...`);
        let updatedOrder = { ...order };
        let hasChanges = false;
        for (const field of base64Fields) {
          try {
            const rootField = field.path[0];
            const filePath = `orders/${order.id}/${rootField}/${Date.now()}_sync.jpg`;
            const { url, error } = await orderStorage.uploadBase64(filePath, field.value);
            if (error) throw new Error(error);
            updatedOrder = setNestedValue(updatedOrder, field.path, url);
            hasChanges = true;
          } catch (e) {
            console.error(`Failed to upload base64 for order ${order.id} at ${field.path.join('.')}:`, e);
          }
        }
        if (hasChanges) {
          const updates: any = {};
          base64Fields.forEach(f => {
            const root = f.path[0];
            updates[root] = updatedOrder[root as keyof typeof updatedOrder];
          });
          await updateValidated('orders', order.id, updates, ServiceOrderSchema);
          console.log(`Successfully synced order ${order.id}`);
        }
      }

      // 2. Sync Equipment
      for (const equip of equipment) {
        const base64Fields = findBase64Fields(equip);
        if (!base64Fields.length) continue;
        console.log(`Syncing offline images for equipment ${equip.id}...`);
        let updatedEquip = { ...equip };
        let hasChanges = false;
        for (const field of base64Fields) {
          try {
            const rootField = field.path[0];
            const filePath = `equipment/${equip.id}/${rootField}/${Date.now()}_sync.jpg`;
            const { url, error } = await equipmentStorage.uploadBase64(filePath, field.value);
            if (error) throw new Error(error);
            updatedEquip = setNestedValue(updatedEquip, field.path, url);
            hasChanges = true;
          } catch (e) {
            console.error(`Failed to upload base64 for equipment ${equip.id} at ${field.path.join('.')}:`, e);
          }
        }
        if (hasChanges) {
          const updates: any = {};
          base64Fields.forEach(f => {
            const root = f.path[0];
            updates[root] = updatedEquip[root as keyof typeof updatedEquip];
          });
          await updateValidated('equipment', equip.id, updates, EquipmentSchema);
          console.log(`Successfully synced equipment ${equip.id}`);
        }
      }
    } catch (err) {
      console.error('Error in background sync:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [orders, equipment, connectionText, isSyncing, updateValidated, orderStorage, equipmentStorage]);

  // Trigger sync when coming online.
  useEffect(() => {
    if (connectionText === 'Online' && (orders.length > 0 || equipment.length > 0)) {
      const timer = setTimeout(() => syncBase64ToStorage(), 5000);
      return () => clearTimeout(timer);
    }
  }, [connectionText, orders, equipment, syncBase64ToStorage]);
};
