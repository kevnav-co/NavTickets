
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSupabaseQuery, type QueryFilter, snakeToCamel } from './useSupabaseQuery';

export interface UseCollectionOptions {
  filters?: QueryFilter[];
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  realtime?: boolean;
}

/**
 * Hook genérico y reactivo para suscribirse a una colección de Supabase con opciones dinámicas.
 * Proporciona funcionalidad de carga, error y refresco manual.
 *
 * @param collectionName El nombre de la tabla en Supabase.
 * @param options Un objeto opcional para configurar la consulta (filtros, orden, límite).
 * @returns Un objeto con los datos, estados de carga/error y una función para forzar el refresco.
 */
export const useCollection = <T extends { id: string }>(collectionName: string, options: UseCollectionOptions = {}) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const forceRefresh = useCallback(() => {
    setRefreshTrigger(v => v + 1);
  }, []);

  const supabaseQueryOptions = useMemo(() => ({
    table: collectionName,
    filters: options.filters || [],
    orderBy: options.orderBy,
    limit: options.limit,
    realtime: options.realtime ?? true,
    transform: snakeToCamel,
  }), [collectionName, options.filters, options.orderBy, options.limit, options.realtime]);

  const {
    data,
    loading,
    error,
    isFromCache,
    refetch,
  } = useSupabaseQuery<T>(collectionName, supabaseQueryOptions);

  // Trigger refetch when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      refetch();
    }
  }, [refreshTrigger, refetch]);

  return { data, loading, error, isRefreshing: loading && refreshTrigger > 0, forceRefresh, isFromCache };
};
