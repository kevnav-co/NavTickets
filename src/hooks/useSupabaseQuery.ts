import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { offlineCache } from './useOfflineCache';
import { useConnectivityStatus } from './useConnectivityStatus';
import { snakeToCamel } from '../utils/caseConverter';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type QueryFilter = {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'is';
  value: any;
};

export type OrderBy = {
  column: string;
  ascending?: boolean;
};

interface UseSupabaseQueryOptions {
  /** Nombre de la tabla en Supabase */
  table: string;
  /** Filtros a aplicar */
  filters?: QueryFilter[];
  /** Ordenamiento */
  orderBy?: OrderBy;
  /** Límite de resultados */
  limit?: number;
  /** Suscribirse a cambios Realtime */
  realtime?: boolean;
  /** Forzar el uso de caché offline aunque haya conexión */
  forceOffline?: boolean;
  /** Función de transformación de snake_case a camelCase */
  transform?: (data: any) => any;
  /** Habilitar/deshabilitar la query (similar a TanStack Query enabled) */
  enabled?: boolean;
}

interface UseSupabaseQueryResult<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  isFromCache: boolean;
  pendingWrites: number;
  refetch: () => Promise<void>;
}

/**
 * Hook para consultas reactivas a Supabase con soporte offline.
 *
 * - Cuando hay conexión: consulta a Supabase + actualiza caché offline
 * - Cuando no hay conexión: sirve desde caché IndexedDB
 * - Con Realtime: se suscribe a cambios en la tabla
 */
export function useSupabaseQuery<T extends { id: string }>(
  collection: string,
  options: UseSupabaseQueryOptions = {}
): UseSupabaseQueryResult<T> {
  const {
    table = collection,
    filters = [],
    orderBy,
    limit: queryLimit,
    realtime = true,
    forceOffline = false,
    transform,
    enabled = true,
  } = options;

  const { isOnline } = useConnectivityStatus();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const mountedRef = useRef(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const applyFilters = useCallback(
    (query: ReturnType<typeof supabase.from<T>['select']>) => {
      let q = query;
      for (const f of filters) {
        if (f.operator === 'in') {
          q = q.in(f.column, f.value);
        } else if (f.operator === 'is') {
          q = q.is(f.column, f.value);
        } else {
          q = q[f.operator](f.column, f.value);
        }
      }
      if (orderBy) {
        q = q.order(orderBy.column, { ascending: orderBy.ascending ?? true });
      }
      if (queryLimit) {
        q = q.limit(queryLimit);
      }
      return q;
    },
    [filters, orderBy, queryLimit]
  );

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setError('Supabase no está configurado');
      setLoading(false);
      return;
    }

    // ─── Modo offline: servir desde caché ──────────────────────────────────
    if (forceOffline || !isOnline) {
      try {
        const cached = await offlineCache.getAll<T>(collection);
        const pending = await offlineCache.getPendingCountByCollection();
        if (mountedRef.current) {
          setData(cached);
          setIsFromCache(true);
          setPendingWrites(pending[collection] || 0);
          setLoading(false);
          setError(null);
        }
      } catch (err: any) {
        if (mountedRef.current) {
          setError(err.message);
          setLoading(false);
        }
      }
      return;
    }

    // ─── Modo online: consultar Supabase ───────────────────────────────────
    try {
      setLoading(true);
      const query = applyFilters(
        supabase.from(table).select('*')
      );

      const { data: result, error: queryError } = await query;

      if (queryError) {
        throw queryError;
      }

      const transformed = (result || []).map((item: any) => {
        const camel = transform ? transform(item) : snakeToCamel(item);
        return camel as T;
      });

      if (mountedRef.current) {
        setData(transformed);
        setIsFromCache(false);
        setError(null);
        setLoading(false);
      }

      // Actualizar caché offline en segundo plano
      offlineCache.setAll(collection, transformed).catch(console.warn);
    } catch (err: any) {
      console.error(`[SupabaseQuery] Error fetching ${table}:`, err);

      // Fallback a caché si hay error de conexión
      if (err.message?.includes('Failed to fetch') || err.code === 'NETWORK_ERROR') {
        try {
          const cached = await offlineCache.getAll<T>(collection);
          if (mountedRef.current) {
            setData(cached);
            setIsFromCache(true);
          }
        } catch {
          // Ignorar error del caché
        }
      }

      if (mountedRef.current) {
        setError(err.message);
        setLoading(false);
      }
    }
  }, [table, collection, filters, orderBy, queryLimit, forceOffline, isOnline, applyFilters, transform]);

  // ─── Realtime subscription ──────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled || !realtime || !isSupabaseConfigured() || forceOffline || !isOnline) return;

    // Limpiar suscripción anterior
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channelName = `realtime-${table}-${Date.now()}`;
    const channel = supabase.channel(channelName);

    channel.on(
      'postgres_changes' as any,
      {
        event: '*',
        schema: 'public',
        table,
      },
      (payload: any) => {
        const event = payload.eventType as string;
        const newRecord = payload.new as any;
        const oldRecord = payload.old as any;

        setData(prev => {
          if (event === 'INSERT') {
            const camel = transform
              ? transform(newRecord)
              : snakeToCamel(newRecord);
            if (!prev.find(d => d.id === camel.id)) {
              return [...prev, camel as T];
            }
          } else if (event === 'UPDATE') {
            const camel = transform
              ? transform(newRecord)
              : snakeToCamel(newRecord);
            return prev.map(d => (d.id === camel.id ? (camel as T) : d));
          } else if (event === 'DELETE') {
            const deletedId = oldRecord?.id || newRecord?.id;
            return prev.filter(d => d.id !== deletedId);
          }
          return prev;
        });
      }
    );

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, table, realtime, forceOffline, isOnline, transform]);

  // ─── Efecto principal ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, fetchData]);

  // ─── Cleanup de Realtime al desmontar ───────────────────────────────────────

  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    isFromCache,
    pendingWrites,
    refetch: fetchData,
  };
}