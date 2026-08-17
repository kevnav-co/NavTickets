import { useQuery, useMutation, useQueryClient, QueryKey } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { offlineCache } from './useOfflineCache';
import { useConnectivityStatus } from './useConnectivityStatus';
import { snakeToCamel } from '../utils/caseConverter';

export type QueryFilter = {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'is';
  value: any;
};

export type OrderBy = {
  column: string;
  ascending?: boolean;
};

interface UseSupabaseTanStackQueryOptions<T> {
  /** Nombre de la tabla en Supabase */
  table: string;
  /** Query key para TanStack Query */
  queryKey: QueryKey;
  /** Filtros a aplicar */
  filters?: QueryFilter[];
  /** Ordenamiento */
  orderBy?: OrderBy;
  /** Límite de resultados */
  limit?: number;
  /** Función de transformación personalizada */
  transform?: (data: any) => T;
  /** Habilitar/deshabilitar la query */
  enabled?: boolean;
  /** Tiempo en ms que los datos se consideran frescos (default: 5 min) */
  staleTime?: number;
  /** Tiempo en ms antes de garbage collection (default: 30 min) */
  gcTime?: number;
}

/**
 * Hook que usa TanStack Query para consultas a Supabase con:
 * - Deduplicación automática de queries con la misma key
 * - Caché inteligente con staleTime/gcTime
 * - Background refetching
 * - Soporte offline vía IndexedDB (fallback)
 * - Realtime subscriptions opcionales
 */
export function useSupabaseTanStackQuery<T extends { id: string }>(
  options: UseSupabaseTanStackQueryOptions<T>
) {
  const {
    table,
    queryKey,
    filters = [],
    orderBy,
    limit: queryLimit,
    transform,
    enabled = true,
    staleTime = 5 * 60 * 1000, // 5 min
    gcTime = 30 * 60 * 1000,   // 30 min
  } = options;

  const { isOnline } = useConnectivityStatus();
  const queryClient = useQueryClient();

  const applyFilters = (query: ReturnType<typeof supabase.from<T>['select']>) => {
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
  };

  // Query principal con TanStack Query
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!isSupabaseConfigured()) {
        throw new Error('Supabase no está configurado');
      }

      // Modo offline: servir desde caché IndexedDB
      if (!isOnline) {
        const cached = await offlineCache.getAll<T>(table);
        return { data: cached, fromCache: true };
      }

      // Modo online: consultar Supabase
      const q = applyFilters(supabase.from(table).select('*'));
      const { data: result, error: queryError } = await q;

      if (queryError) {
        throw queryError;
      }

      const transformed = (result || []).map((item: any) => {
        const camel = transform ? transform(item) : snakeToCamel(item);
        return camel as T;
      });

      // Actualizar caché offline en background
      offlineCache.setAll(table, transformed).catch(console.warn);

      return { data: transformed, fromCache: false };
    },
    enabled: enabled && isSupabaseConfigured(),
    staleTime,
    gcTime,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: (previousData) => previousData, // Keep previous data while fetching
  });

  // Realtime subscription - opcional, se puede habilitar por componente
  const subscribeRealtime = (
    onInsert?: (record: T) => void,
    onUpdate?: (record: T) => void,
    onDelete?: (id: string) => void
  ) => {
    if (!isSupabaseConfigured() || !isOnline) return () => {};

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

        if (event === 'INSERT' && onInsert) {
          const camel = transform ? transform(newRecord) : snakeToCamel(newRecord);
          onInsert(camel as T);
          // Invalidar query para refetch
          queryClient.invalidateQueries({ queryKey });
        } else if (event === 'UPDATE' && onUpdate) {
          const camel = transform ? transform(newRecord) : snakeToCamel(newRecord);
          onUpdate(camel as T);
          queryClient.invalidateQueries({ queryKey });
        } else if (event === 'DELETE' && onDelete) {
          const deletedId = oldRecord?.id || newRecord?.id;
          onDelete(deletedId);
          queryClient.invalidateQueries({ queryKey });
        }
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  // Prefetch helper
  const prefetch = async () => {
    await queryClient.prefetchQuery({
      queryKey,
      queryFn: query.queryFn,
      staleTime,
      gcTime,
    });
  };

  return {
    ...query,
    data: query.data?.data ?? [],
    isFromCache: query.data?.fromCache ?? false,
    subscribeRealtime,
    prefetch,
  };
}

/**
 * Hook para mutaciones (create, update, delete) con invalidación automática de queries
 */
export function useSupabaseMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: {
    onMutate?: (variables: TVariables) => Promise<(() => void) | void>;
    onSuccess?: (data: TData, variables: TVariables) => void;
    onError?: (error: Error, variables: TVariables) => void;
    invalidateKeys?: QueryKey[];
  }
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onMutate: options?.onMutate,
    onSuccess: (data, variables) => {
      // Invalidar queries relacionadas
      if (options?.invalidateKeys) {
        options.invalidateKeys.forEach(key => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
      options?.onSuccess?.(data, variables);
    },
    onError: options?.onError,
  });
}

/**
 * Query keys consistentes para toda la app
 */
export const QUERY_KEYS = {
  clients: (companyId?: string) => ['clients', companyId] as QueryKey,
  orders: (companyId?: string) => ['orders', companyId] as QueryKey,
  equipment: (companyId?: string) => ['equipment', companyId] as QueryKey,
  users: (companyId?: string) => ['users', companyId] as QueryKey,
  notifications: (userId?: string) => ['notifications', userId] as QueryKey,
  singleClient: (id: string) => ['client', id] as QueryKey,
  singleOrder: (id: string) => ['order', id] as QueryKey,
  singleEquipment: (id: string) => ['equipment', id] as QueryKey,
  singleUser: (id: string) => ['user', id] as QueryKey,
} as const;