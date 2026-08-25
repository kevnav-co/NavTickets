import { useCallback, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { offlineCache } from './useOfflineCache';
import { useConnectivityStatus } from './useConnectivityStatus';
import { toSnakeCase, snakeToCamel } from '../utils/caseConverter';

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
        // PK estable generado por el cliente (UUID v4), NO `offline_<timestamp>`.
        // Razón: guardamos el id DENTRO de `data` y el sync lo inserta con ese
        // mismo id → los vínculos/evidencia que referencian este pk sobreviven
        // al sync y el re-envío es idempotente (upsert onConflict:'id').
        const tempId = crypto.randomUUID?.()
          ?? `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        await offlineCache.enqueueWrite(collection, 'create', tempId, { ...data, id: tempId });
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
              // Upsert idempotente: write.data ya trae el id del cliente (UUID),
              // así que un retry no duplica y los vínculos por id se mantienen.
              const { error: e } = await supabase
                .from(targetTable)
                .upsert(toSnakeCase(write.data), { onConflict: 'id' });
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

