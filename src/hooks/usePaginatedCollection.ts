import { useState, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import type { QueryFilter } from './useSupabaseQuery';

interface UsePaginatedCollectionOptions {
  filters?: QueryFilter[];
  orderBy?: { column: string; ascending?: boolean };
  pageSize?: number;
}

/**
 * Hook para cargar y paginar colecciones de Supabase de forma eficiente.
 * Reemplaza la versión anterior que usaba paginación de Firestore.
 */
export const usePaginatedCollection = <T extends { id: string }>(
  tableName: string,
  options: UsePaginatedCollectionOptions = {}
) => {
  const { filters = [], orderBy, pageSize = 20 } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [offset, setOffset] = useState(0);

  const fetchDocs = useCallback(async (isInitialLoad = false) => {
    if (!isSupabaseConfigured()) {
      setError(new Error('Supabase no está configurado'));
      setLoading(false);
      return;
    }

    if (isInitialLoad) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      let query = supabase
        .from(tableName)
        .select('*');

      // Aplicar filtros
      for (const f of filters) {
        if (f.operator === 'in') {
          query = (query as any).in(f.column, f.value);
        } else if (f.operator === 'is') {
          query = (query as any).is(f.column, f.value);
        } else {
          query = (query as any)[f.operator](f.column, f.value);
        }
      }

      // Aplicar ordenamiento
      if (orderBy) {
        query = query.order(orderBy.column, { ascending: orderBy.ascending ?? false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // Aplicar paginación
      let rangeFrom = isInitialLoad ? 0 : offset;
      let rangeTo = rangeFrom + pageSize - 1;
      query = query.range(rangeFrom, rangeTo);

      const { data: results, error: queryError } = await query;

      if (queryError) throw queryError;

      const mappedResults = (results || []).map((r: any) => ({
        id: r.id,
        ...r,
      })) as T[];

      setHasMore(mappedResults.length === pageSize);
      setData(prev => isInitialLoad ? mappedResults : [...prev, ...mappedResults]);
      setOffset(prev => isInitialLoad ? pageSize : prev + pageSize);
      setError(null);
    } catch (err) {
      console.error(`Error al obtener la colección paginada '${tableName}':`, err);
      setError(err as Error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [tableName, filters, orderBy, pageSize, offset]);

  const initialLoad = useCallback(() => {
    setOffset(0);
    setData([]);
    setHasMore(true);
    fetchDocs(true);
  }, [fetchDocs]);

  const loadMore = useCallback(() => {
    if (!loading && !loadingMore && hasMore) {
      fetchDocs(false);
    }
  }, [loading, loadingMore, hasMore, fetchDocs]);

  const refresh = useCallback(() => {
    setOffset(0);
    setData([]);
    setHasMore(true);
    fetchDocs(true);
  }, [fetchDocs]);

  return { data, loading, loadingMore, hasMore, error, initialLoad, loadMore, refresh };
};