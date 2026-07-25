
import { useState, useCallback, useMemo } from 'react';
import { collection, query, getDocs, limit, startAfter, QueryConstraint, DocumentSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';

interface UsePaginatedCollectionOptions {
  constraints?: QueryConstraint[];
  pageSize?: number;
}

// Caché simple en memoria para evitar re-lecturas excesivas en la misma sesión.
// La clave es collectionName + un hash simplificado de los constraints.
const globalCache = new Map<string, { data: any[], lastDoc: DocumentSnapshot | null, hasMore: boolean, fetchedAt: number }>();
const CACHE_EXPIRATION_MS = 1000 * 60 * 5; // 5 minutos

/**
 * Hook para cargar y paginar colecciones de Firestore de forma eficiente.
 */
export const usePaginatedCollection = <T extends { id: string }>(collectionName: string, options: UsePaginatedCollectionOptions = {}) => {
  const { constraints = [], pageSize = 20 } = options;

  // Generar clave de caché única para esta consulta específica.
  const queryKey = useMemo(() => {
    return `${collectionName}-${JSON.stringify(constraints.map(c => c.type))}-${pageSize}`;
  }, [collectionName, constraints, pageSize]);

  const [data, setData] = useState<T[]>(() => {
    const cached = globalCache.get(queryKey);
    if (cached && (Date.now() - cached.fetchedAt < CACHE_EXPIRATION_MS)) {
        return cached.data as T[];
    }
    return [];
  });

  const [loading, setLoading] = useState(!globalCache.has(queryKey));
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(() => globalCache.get(queryKey)?.hasMore ?? true);
  const [error, setError] = useState<Error | null>(null);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(() => globalCache.get(queryKey)?.lastDoc ?? null);

  const baseQuery = useMemo(() => {
    if (!collectionName) return null;
    return query(collection(db, collectionName), ...constraints);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, JSON.stringify(constraints)]);

  const fetchDocs = useCallback(async (isInitialLoad = false) => {
    if (!baseQuery) {
      setData([]);
      setLoading(false);
      setHasMore(false);
      return;
    }

    if (isInitialLoad) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const queryConstraints: QueryConstraint[] = [limit(pageSize)];
      if (!isInitialLoad && lastDoc) {
        queryConstraints.push(startAfter(lastDoc));
      }
      
      const q = query(baseQuery, ...queryConstraints);
      const snapshot = await getDocs(q);
      const newDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));

      const finalLastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
      const finalHasMore = newDocs.length === pageSize;

      setLastDoc(finalLastDoc);
      setHasMore(finalHasMore);
      
      setData(prev => {
          const updatedData = isInitialLoad ? newDocs : [...prev, ...newDocs];
          // Actualizar caché global
          globalCache.set(queryKey, {
              data: updatedData,
              lastDoc: finalLastDoc,
              hasMore: finalHasMore,
              fetchedAt: Date.now()
          });
          return updatedData;
      });
      
      setError(null);
    } catch (err) {
      console.error(`Error al obtener la colección paginada '${collectionName}':`, err);
      setError(err as Error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [baseQuery, pageSize, lastDoc, collectionName, queryKey]);

  const loadMore = useCallback(() => {
    if (!loading && !loadingMore && hasMore) {
      fetchDocs(false);
    }
  }, [loading, loadingMore, hasMore, fetchDocs]);

  const initialLoad = useCallback(() => {
    const cached = globalCache.get(queryKey);
    const isCacheValid = cached && (Date.now() - cached.fetchedAt < CACHE_EXPIRATION_MS);

    if (baseQuery && (data.length === 0 || !isCacheValid)) {
        fetchDocs(true);
    } else {
        setLoading(false);
    }
  }, [baseQuery, data.length, fetchDocs, queryKey]);

  const refresh = useCallback(() => {
    globalCache.delete(queryKey);
    setData([]);
    setLastDoc(null);
    setHasMore(true);
    if (baseQuery) {
      fetchDocs(true);
    }
  }, [fetchDocs, baseQuery, queryKey]);

  return { data, loading, loadingMore, hasMore, error, initialLoad, loadMore, refresh };
};
