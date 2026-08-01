import { useEffect, useCallback, useState } from 'react';
import { useData } from '../context/DataContext';
import { useValidatedActions } from './useValidatedActions';
import { ServiceOrderSchema } from '../schemas/order.schema';
import { EquipmentSchema } from '../schemas/equipment.schema';
import { useConnectivityStatus } from './useConnectivityStatus';
import { useSupabaseStorage } from './useSupabaseStorage';

// Helper function to recursively find base64 strings and their paths
const findBase64Fields = (obj: any, path: string[] = []): { path: string[], value: string }[] => {
  let results: { path: string[], value: string }[] = [];

  if (!obj || typeof obj !== 'object') return results;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      const currentPath = [...path, key];

      if (typeof value === 'string' && value.startsWith('data:image/')) {
        results.push({ path: currentPath, value });
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'string' && item.startsWith('data:image/')) {
            results.push({ path: [...currentPath, String(index)], value: item });
          } else if (typeof item === 'object') {
            results = [...results, ...findBase64Fields(item, [...currentPath, String(index)])];
          }
        });
      } else if (typeof value === 'object') {
        results = [...results, ...findBase64Fields(value, currentPath)];
      }
    }
  }

  return results;
};

// Helper function to set a value at a specific path in an object
const setNestedValue = (obj: any, path: string[], value: any): any => {
  if (path.length === 0) return value;

  const [currentKey, ...remainingPath] = path;

  if (Array.isArray(obj)) {
    const newArr = [...obj];
    const index = parseInt(currentKey, 10);
    newArr[index] = setNestedValue(newArr[index], remainingPath, value);
    return newArr;
  } else {
    const newObj = { ...obj };
    newObj[currentKey] = setNestedValue(newObj[currentKey], remainingPath, value);
    return newObj;
  }
};

export const useBackgroundSync = () => {
  const { text: connectionText } = useConnectivityStatus();
  const { orders, equipment } = useData();
  const { updateValidated } = useValidatedActions();
  const { uploadBase64 } = useSupabaseStorage({ bucket: 'order-photos' });
  const [isSyncing, setIsSyncing] = useState(false);

  const syncBase64ToStorage = useCallback(async () => {
    if (connectionText !== 'Online' || isSyncing) return;

    setIsSyncing(true);

    try {
      // 1. Check Orders
      for (const order of orders) {
        const base64Fields = findBase64Fields(order);

        if (base64Fields.length > 0) {
          console.log(`Syncing offline images for order ${order.id}...`);
          let updatedOrder = { ...order };
          let hasChanges = false;

          for (const field of base64Fields) {
            try {
              const rootFieldName = field.path[0];
              const filePath = `orders/${order.id}/${rootFieldName}/${Date.now()}_sync.jpg`;

              const { url, error } = await uploadBase64(filePath, field.value);
              if (error) throw new Error(error);

              updatedOrder = setNestedValue(updatedOrder, field.path, url);
              hasChanges = true;
            } catch (err) {
              console.error(`Failed to upload base64 image for order ${order.id} at path ${field.path.join('.')}:`, err);
            }
          }

          if (hasChanges) {
            const updates: any = {};
            base64Fields.forEach(field => {
              const rootKey = field.path[0];
              updates[rootKey] = updatedOrder[rootKey as keyof typeof updatedOrder];
            });

            await updateValidated('orders', order.id, updates, ServiceOrderSchema);
            console.log(`Successfully synced order ${order.id} to cloud storage.`);
          }
        }
      }

      // 2. Check Equipment
      for (const equip of equipment) {
        const base64Fields = findBase64Fields(equip);

        if (base64Fields.length > 0) {
          console.log(`Syncing offline images for equipment ${equip.id}...`);
          let updatedEquip = { ...equip };
          let hasChanges = false;

          for (const field of base64Fields) {
            try {
              const rootFieldName = field.path[0];
              const filePath = `equipment/${equip.id}/${rootFieldName}/${Date.now()}_sync.jpg`;

              const { url, error } = await uploadBase64(filePath, field.value);
              if (error) throw new Error(error);

              updatedEquip = setNestedValue(updatedEquip, field.path, url);
              hasChanges = true;
            } catch (err) {
              console.error(`Failed to upload base64 image for equipment ${equip.id} at path ${field.path.join('.')}:`, err);
            }
          }

          if (hasChanges) {
            const updates: any = {};
            base64Fields.forEach(field => {
              const rootKey = field.path[0];
              updates[rootKey] = updatedEquip[rootKey as keyof typeof updatedEquip];
            });

            await updateValidated('equipment', equip.id, updates, EquipmentSchema);
            console.log(`Successfully synced equipment ${equip.id} to cloud storage.`);
          }
        }
      }
    } catch (error) {
      console.error('Error in background sync:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [orders, equipment, connectionText, isSyncing, updateValidated, uploadBase64]);

  // Run the sync when online, but debounce/throttle it
  useEffect(() => {
    if (connectionText === 'Online' && (orders.length > 0 || equipment.length > 0)) {
      const timer = setTimeout(() => {
        syncBase64ToStorage();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [connectionText, orders, equipment, syncBase64ToStorage]);
};