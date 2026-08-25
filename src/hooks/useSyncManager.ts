import { useEffect, useCallback, useRef, useState } from 'react';
import { useConnectivityStatus } from './useConnectivityStatus';
import { offlineCache } from './useOfflineCache';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { toSnakeCase } from '../utils/caseConverter';

interface SyncManagerResult {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  lastSyncResult: 'success' | 'partial' | 'failed' | null;
  triggerSync: () => Promise<void>;
}

/**
 * Hook que gestiona la sincronización automática de operaciones offline.
 *
 * Cuando la conexión se recupera, automáticamente:
 * 1. Lee la cola de escrituras pendientes desde IndexedDB
 * 2. Ejecuta cada operación contra Supabase
 * 3. Elimina las operaciones exitosas de la cola
 * 4. Reintenta las fallidas (máximo 3 intentos)
 */
export function useSyncManager(): SyncManagerResult {
  const { isOnline, text: connectionText } = useConnectivityStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<'success' | 'partial' | 'failed' | null>(null);
  const syncingRef = useRef(false);
  const wasOfflineRef = useRef(false);

  // ─── Actualizar conteo de pendientes ────────────────────────────────────────

  const updatePendingCount = useCallback(async () => {
    try {
      const pending = await offlineCache.getPendingWrites();
      setPendingCount(pending.length);
    } catch {
      // Ignorar
    }
  }, []);

  // ─── Sincronizar ────────────────────────────────────────────────────────────

  const triggerSync = useCallback(async () => {
    if (!isOnline || !isSupabaseConfigured() || syncingRef.current) return;

    syncingRef.current = true;
    setIsSyncing(true);
    let syncedCount = 0;
    let failedCount = 0;

    try {
      const pending = await offlineCache.getPendingWrites();
      if (pending.length === 0) {
        setIsSyncing(false);
        syncingRef.current = false;
        setLastSyncAt(new Date());
        setLastSyncResult('success');
        return;
      }

      console.log(`[SyncManager] Sincronizando ${pending.length} operaciones pendientes...`);

      for (const write of pending) {
        try {
          const table = write.collection;
          let error: any = null;

          switch (write.action) {
            case 'create': {
              // Upsert idempotente: el id de `write.data` es el UUID del cliente
              // (ver addItem offline en useSupabaseActions) → retry sin duplicar.
              const { error: e } = await supabase
                .from(table)
                .upsert(toSnakeCase(write.data), { onConflict: 'id' });
              error = e;
              break;
            }
            case 'update': {
              const { error: e } = await supabase
                .from(table)
                .update(toSnakeCase(write.data))
                .eq('id', write.docId);
              error = e;
              break;
            }
            case 'delete': {
              const { error: e } = await supabase
                .from(table)
                .delete()
                .eq('id', write.docId);
              error = e;
              break;
            }
          }

          if (error) {
            failedCount++;
            console.warn(`[SyncManager] Error sincronizando ${write.action} ${write.docId}:`, error.message);
            await offlineCache.incrementRetry(write.id!, error.message);

            // Eliminar si excede 3 reintentos
            if (write.retries >= 3) {
              console.warn(`[SyncManager] Descartando operación tras ${write.retries} reintentos:`, write.id);
              await offlineCache.removePendingWrite(write.id!);
            }
          } else {
            syncedCount++;
            await offlineCache.removePendingWrite(write.id!);
          }
        } catch (err: any) {
          failedCount++;
          console.warn(`[SyncManager] Error en lote:`, err.message);
        }
      }

      console.log(`[SyncManager] Sincronización completada: ${syncedCount} exitosas, ${failedCount} fallidas`);
      setLastSyncAt(new Date());
      setLastSyncResult(failedCount === 0 ? 'success' : syncedCount > 0 ? 'partial' : 'failed');
    } catch (err) {
      console.error('[SyncManager] Error de sincronización:', err);
      setLastSyncResult('failed');
    } finally {
      setIsSyncing(false);
      syncingRef.current = false;
      await updatePendingCount();
    }
  }, [isOnline, updatePendingCount]);

  // ─── Efecto: detectar reconexión ───────────────────────────────────────────

  useEffect(() => {
    if (!wasOfflineRef.current && !isOnline) {
      wasOfflineRef.current = true;
    }

    if (wasOfflineRef.current && isOnline) {
      console.log('[SyncManager] Conexión recuperada, iniciando sincronización...');
      wasOfflineRef.current = false;
      const timer = setTimeout(() => triggerSync(), 3000); // Esperar 3s para estabilizar
      return () => clearTimeout(timer);
    }
  }, [isOnline, triggerSync]);

  // ─── Efecto: conteo inicial y polling ──────────────────────────────────────

  useEffect(() => {
    updatePendingCount();
    const interval = setInterval(updatePendingCount, 30000); // Cada 30s
    return () => clearInterval(interval);
  }, [updatePendingCount]);

  // ─── Sincronizar también cuando cambia connectionText ───────────────────────

  useEffect(() => {
    if (connectionText === 'Online' && pendingCount > 0 && !syncingRef.current) {
      const timer = setTimeout(() => triggerSync(), 5000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionText]);

  return {
    isSyncing,
    pendingCount,
    lastSyncAt,
    lastSyncResult,
    triggerSync,
  };
}