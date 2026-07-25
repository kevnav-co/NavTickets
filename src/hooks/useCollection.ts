
import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, onSnapshot, QueryConstraint } from 'firebase/firestore';
import { db } from '../services/firebase';

export interface UseCollectionOptions {
  constraints?: QueryConstraint[];
}

/**
 * Hook genérico y reactivo para suscribirse a una colección de Firestore con opciones dinámicas.
 * Proporciona funcionalidad de carga, error y refresco manual.
 * 
 * @param collectionName El nombre de la colección de Firestore.
 * @param options Un objeto opcional para configurar la consulta (filtros, orden, límite).
 * @returns Un objeto con los datos, estados de carga/error y una función para forzar el refresco.
 */
export const useCollection = <T extends { id: string }>(collectionName: string, options: UseCollectionOptions = {}) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const forceRefresh = useCallback(() => {
    setRefreshTrigger(v => v + 1);
  }, []);

  const memoizedQuery = useMemo(() => {
    // CORRECCIÓN: Prevenir error si el nombre de la colección está vacío.
    if (!collectionName) {
      return null;
    }
    const { constraints = [] } = options;
    const coll = collection(db, collectionName);
    return query(coll, ...constraints);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, JSON.stringify(options)]);

  useEffect(() => {
    // CORRECCIÓN: Si la query es nula, no hacer nada y resetear el estado.
    if (!memoizedQuery) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    if (refreshTrigger > 0) {
      setIsRefreshing(true);
    }

    const unsubscribe = onSnapshot(memoizedQuery, 
      (snapshot) => {
        const items = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as T);
        setData(items);
        setError(null);
        setLoading(false);
        setIsRefreshing(false);
      },
      (err) => {
        console.error(`Error en la suscripción a la colección '${collectionName}':`, err);
        setError(err as Error);
        setLoading(false);
        setIsRefreshing(false);
      }
    );

    return () => unsubscribe();

  }, [memoizedQuery, refreshTrigger, collectionName]);

  return { data, loading, error, isRefreshing, forceRefresh };
};
