import { useState, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabase';
import type { QueryFilter } from './useSupabaseQuery';

/**
 * Options for the pagination hook.
 */
interface UsePaginatedCollectionOptions {
  /** Array of filters applied to the query. */
  filters?: QueryFilter[];
  /** Number of items per page. */
  pageSize?: number;
  /** Order by configuration. */
  orderBy?: { column: string; ascending?: boolean };
}

// Simple in‑memory cache to avoid refetching the same query within a short period.
const globalCache = new Map<string, { data: any[]; hasMore: boolean; fetchedAt: number }>();
const CACHE_EXPIRATION_MS = 1000 * 60 * 5; // 5 minutes

/**
 * Hook to fetch a collection from Supabase with cursor‑based pagination.
 * It returns data, loading flags and helpers to load more pages or refresh.
 */
export const usePaginatedCollection = <T extends { id: string }>(
  collectionName: string,
  options: UsePaginatedCollectionOptions = {}
) => {
  const { filters = [], pageSize = 20, orderBy } = options;

  // Build a stable cache key based on collection name, filters, pageSize and order.
  const queryKey = useMemo(() => {
    return `${collectionName}-${JSON.stringify(filters)}-${pageSize}-${JSON.stringify(orderBy)}`;
  }, [collectionName, filters, pageSize, orderBy]);

  const [data, setData] = useState<T[]>(() => {
    const cached = globalCache.get(queryKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_EXPIRATION_MS) {
      return cached.data as T[];
    }
    return [];
  });
  const [loading, setLoading] = useState(!globalCache.has(queryKey));
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => globalCache.get(queryKey)?.hasMore ?? true);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(0);

  const fetchDocs = useCallback(
    async (isInitialLoad = false) => {
      if (isInitialLoad) setLoading(true);
      else setLoadingMore(true);

      try {
        const currentPage = isInitialLoad ? 0 : page + 1;
        const from = currentPage * pageSize;
        const to = from + pageSize - 1;

        // Build the Supabase query.
        let query: any = (supabase as any).from(collectionName).select('*');
        // Apply filters.
        for (const f of filters) {
          // The supabase client supports .eq, .neq, .gt, .gte, .lt, .lte, .like, .in, .is.
          // We'll map the generic operators to the corresponding method.
          const op = f.operator;
          if (op === 'eq') query = query.eq(f.column, f.value);
          else if (op === 'neq') query = query.neq(f.column, f.value);
          else if (op === 'gt') query = query.gt(f.column, f.value);
          else if (op === 'gte') query = query.gte(f.column, f.value);
          else if (op === 'lt') query = query.lt(f.column, f.value);
          else if (op === 'lte') query = query.lte(f.column, f.value);
          else if (op === 'like') query = query.like(f.column, f.value);
          else if (op === 'in') query = query.in(f.column, f.value);
          else if (op === 'is') query = query.is(f.column, f.value);
          else console.warn(`Unsupported filter operator '${op}'`);
        }
        // Apply ordering if provided.
        if (orderBy) {
          query = query.order(orderBy.column, { ascending: orderBy.ascending ?? false });
        }
        // Apply range for pagination.
        query = query.range(from, to);

        const { data: newDocs, error: err } = await query;
        if (err) throw new Error(err.message);

        const finalHasMore = (newDocs || []).length === pageSize;
        setHasMore(finalHasMore);
        if (isInitialLoad) {
          setPage(0);
          setData(newDocs as T[]);
        } else {
          setPage(currentPage);
          setData(prev => [...prev, ...(newDocs as T[])]);
        }
        // Update cache.
        globalCache.set(queryKey, {
          data: isInitialLoad ? (newDocs as T[]) : [...(data as T[]), ...(newDocs as T[])],
          hasMore: finalHasMore,
          fetchedAt: Date.now(),
        });
        setError(null);
      } catch (err) {
        setError(err as Error);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [collectionName, filters, pageSize, orderBy, page, data, queryKey]
  );

  const loadMore = useCallback(() => {
    if (!loading && !loadingMore && hasMore) fetchDocs(false);
  }, [loading, loadingMore, hasMore, fetchDocs]);

  const initialLoad = useCallback(() => {
    const cached = globalCache.get(queryKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_EXPIRATION_MS) {
      setData(cached.data as T[]);
      setHasMore(cached.hasMore);
      setLoading(false);
    } else {
      fetchDocs(true);
    }
  }, [fetchDocs, queryKey]);

  const refresh = useCallback(() => {
    globalCache.delete(queryKey);
    setData([]);
    setPage(0);
    setHasMore(true);
    fetchDocs(true);
  }, [fetchDocs, queryKey]);

  return { data, loading, loadingMore, hasMore, error, initialLoad, loadMore, refresh };
};
