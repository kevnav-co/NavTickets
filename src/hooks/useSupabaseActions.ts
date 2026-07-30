import { useCallback, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { offlineCache } from './useOfflineCache';
import { useConnectivityStatus } from './useConnectivityStatus';

interface UseSupabaseActionsOptions {
  /** Forzar operaciones offline aunque haya conexión */
  forceOffline?: boolean;
}

interface UseSupabaseActionsResult {
  addItem: (collection: string, data: any, table?: string) => Promise<{ data: any | null; error: string | null }>;
  updateItem: (collection: string, id: string, data: any, table?: string) => Promise<{ error: string | null }>;
  deleteItem: (collection: string, id: string, table?: string) => Promise<{ error: string | null }>;
  syncPendingWrites: () => Promise<{ synced: number; failed: number }>;
  isSyncing: boolean;
  pendingCount: number;
}

/**
 * Hook para operaciones CRUD contra Supabase con cola offline.
 *
 * Cuando está offline, las operaciones se encolan en IndexedDB
 * y se sincronizan automáticamente al recuperar la conexión.
 */
export function useSupabaseActions(
  options: UseSupabaseActionsOptions = {}
): UseSupabaseActionsResult {
  const { forceOffline = false } = options;
  const { isOnline } = useConnectivityStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // ─── Create ────────────────────────────────────────────────────────────────
  const addItem = useCallback(
    async (collection: string, data: any, table?: string): Promise<{ data: any | null; error: string | null }> => {
      const targetTable = table || collection;

      if (!isSupabaseConfigured()) {
        return { data: null, error: 'Supabase no está configurado' };
      }

      // ─── Modo offline: encolar ───────────────────────────────────────────
      if (forceOffline || !isOnline) {
        const tempId = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        await offlineCache.enqueueWrite(collection, 'create', tempId, data);
        setPendingCount(prev => prev + 1);
        return { data: { ...data, id: tempId }, error: null };
      }

      // ─── Modo online: insertar directamente ──────────────────────────────
      try {
        const camelToSnakeData = toSnakeCase(data);
        const { data: result, error } = await supabase
          .from(targetTable)
          .insert(camelToSnakeData)
          .select()
          .single();

        if (error) throw error;

        // Actualizar caché offline
        if (result) {
          const camelResult = snakeToCamel(result);
          await offlineCache.set(collection, camelResult.id, camelResult);
        }

        return { data: result ? snakeToCamel(result) : null, error: null };
      } catch (err: any) {
        console.error(`[SupabaseActions] Error creating in ${targetTable}:`, err);
        return { data: null, error: err.message };
      }
    },
    [forceOffline, isOnline]
  );

  // ─── Update ────────────────────────────────────────────────────────────────
  const updateItem = useCallback(
    async (collection: string, id: string, data: any, table?: string): Promise<{ error: string | null }> => {
      const targetTable = table || collection;

      if (!isSupabaseConfigured()) {
        return { error: 'Supabase no está configurado' };
      }

      // ─── Modo offline: encolar ───────────────────────────────────────────
      if (forceOffline || !isOnline) {
        await offlineCache.enqueueWrite(collection, 'update', id, data);
        // Actualizar caché local inmediatamente para UI responsiva
        const existing = await offlineCache.get<any>(collection, id);
        if (existing) {
          await offlineCache.set(collection, id, { ...existing, ...data });
        }
        setPendingCount(prev => prev + 1);
        return { error: null };
      }

      // ─── Modo online: actualizar directamente ────────────────────────────
      try {
        const camelToSnakeData = toSnakeCase(data);
        const { error } = await supabase
          .from(targetTable)
          .update(camelToSnakeData)
          .eq('id', id);

        if (error) throw error;

        // Actualizar caché offline
        const existing = await offlineCache.get<any>(collection, id);
        if (existing) {
          await offlineCache.set(collection, id, { ...existing, ...data });
        }

        return { error: null };
      } catch (err: any) {
        console.error(`[SupabaseActions] Error updating in ${targetTable}:`, err);
        return { error: err.message };
      }
    },
    [forceOffline, isOnline]
  );

  // ─── Delete ────────────────────────────────────────────────────────────────
  const deleteItem = useCallback(
    async (collection: string, id: string, table?: string): Promise<{ error: string | null }> => {
      const targetTable = table || collection;

      if (!isSupabaseConfigured()) {
        return { error: 'Supabase no está configurado' };
      }

      // ─── Modo offline: encolar ───────────────────────────────────────────
      if (forceOffline || !isOnline) {
        await offlineCache.enqueueWrite(collection, 'delete', id, {});
        // Eliminar del caché local inmediatamente
        await offlineCache.remove(collection, id);
        setPendingCount(prev => prev + 1);
        return { error: null };
      }

      // ─── Modo online: eliminar directamente ──────────────────────────────
      try {
        const { error } = await supabase
          .from(targetTable)
          .delete()
          .eq('id', id);

        if (error) throw error;

        // Eliminar del caché offline
        await offlineCache.remove(collection, id);

        return { error: null };
      } catch (err: any) {
        console.error(`[SupabaseActions] Error deleting from ${targetTable}:`, err);
        return { error: err.message };
      }
    },
    [forceOffline, isOnline]
  );

  // ─── Sync pending writes ───────────────────────────────────────────────────
  const syncPendingWrites = useCallback(async (): Promise<{ synced: number; failed: number }> => {
    if (!isOnline || !isSupabaseConfigured()) {
      return { synced: 0, failed: 0 };
    }

    setIsSyncing(true);
    let synced = 0;
    let failed = 0;

    try {
      const pending = await offlineCache.getPendingWrites();

      for (const write of pending) {
        try {
          const targetTable = write.collection; // Same name by default
          let error: any = null;

          switch (write.action) {
            case 'create': {
              const { error: e } = await supabase
                .from(targetTable)
                .insert(toSnakeCase(write.data));
              error = e;
              break;
            }
            case 'update': {
              const { error: e } = await supabase
                .from(targetTable)
                .update(toSnakeCase(write.data))
                .eq('id', write.docId);
              error = e;
              break;
            }
            case 'delete': {
              const { error: e } = await supabase
                .from(targetTable)
                .delete()
                .eq('id', write.docId);
              error = e;
              break;
            }
          }

          if (error) {
            failed++;
            await offlineCache.incrementRetry(write.id!, error.message);
          } else {
            synced++;
            await offlineCache.removePendingWrite(write.id!);
          }
        } catch (err: any) {
          failed++;
          await offlineCache.incrementRetry(write.id!, err.message);
        }
      }
    } catch (err) {
      console.error('[SupabaseActions] Sync error:', err);
    }

    // Actualizar contador
    const pendingByCollection = await offlineCache.getPendingCountByCollection();
    const totalPending = Object.values(pendingByCollection).reduce((a, b) => a + b, 0);
    setPendingCount(totalPending);
    setIsSyncing(false);

    return { synced, failed };
  }, [isOnline]);

  return {
    addItem,
    updateItem,
    deleteItem,
    syncPendingWrites,
    isSyncing,
    pendingCount,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CAMEL_TO_SNAKE: Record<string, string> = {};
// Invertir el mapa de snakeToCamel
const SNAKE_TO_CAMEL_MAP: Record<string, string> = {
  company_id: 'companyId',
  client_id: 'clientId',
  client_name: 'clientName',
  technician_id: 'technicianId',
  scheduled_date: 'scheduledDate',
  time_slot: 'timeSlot',
  scheduled_end_time: 'scheduledEndTime',
  actual_start_date: 'actualStartDate',
  order_type: 'orderType',
  service_name: 'serviceName',
  warranty_period: 'warrantyPeriod',
  warranty_expiration: 'warrantyExpiration',
  is_under_warranty_review: 'isUnderWarrantyReview',
  warranty_jobs: 'warrantyJobs',
  warranty_start_time: 'warrantyStartTime',
  warranty_end_time: 'warrantyEndTime',
  closing_data: 'closingData',
  warranty_notification_sent: 'warrantyNotificationSent',
  last_updated_by: 'lastUpdatedBy',
  serial_number: 'serialNumber',
  gas_type: 'gasType',
  image_url: 'imageUrl',
  last_maintenance_date: 'lastMaintenanceDate',
  maintenance_frequency: 'maintenanceFrequency',
  next_maintenance_notification_sent: 'nextMaintenanceNotificationSent',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  completed_at: 'completedAt',
  due_date: 'dueDate',
  reminder_notification_sent: 'reminderNotificationSent',
  due_date_notification_sent: 'dueDateNotificationSent',
  assigned_to: 'assignedTo',
  created_by: 'createdBy',
  fcm_token: 'fcmToken',
  location_updated_at: 'locationUpdatedAt',
  supabase_auth_id: 'supabaseAuthId',
  time_ago: 'timeAgo',
  order_number: 'orderNumber',
};

for (const [snake, camel] of Object.entries(SNAKE_TO_CAMEL_MAP)) {
  CAMEL_TO_SNAKE[camel] = snake;
}

function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = CAMEL_TO_SNAKE[key] || key.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
    // Convertir objetos/arrays a JSON para JSONB columns
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      result[snakeKey] = JSON.stringify(value);
    } else {
      result[snakeKey] = value;
    }
  }
  return result;
}

function snakeToCamel(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = SNAKE_TO_CAMEL_MAP[key] || key.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
    // Parsear strings JSON
    if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
      try {
        result[camelKey] = JSON.parse(value);
      } catch {
        result[camelKey] = value;
      }
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}