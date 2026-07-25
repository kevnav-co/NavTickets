
import { useState, useEffect } from 'react';
import { collection, query, getCountFromServer, Query, QueryConstraint } from 'firebase/firestore';
import { db } from '../services/firebase';

export const useFirestoreCount = (collectionName: string, ...queryConstraints: QueryConstraint[]) => {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCount = async () => {
      setLoading(true);
      try {
        const coll = collection(db, collectionName);
        const q: Query = query(coll, ...queryConstraints);
        const snapshot = await getCountFromServer(q);
        setCount(snapshot.data().count);
        setError(null);
      } catch (err) {
        console.error(err);
        setError('Error al obtener el conteo de documentos.');
      }
      setLoading(false);
    };

    fetchCount();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, JSON.stringify(queryConstraints)]); // Rehacer si la consulta cambia

  return { count, loading, error };
};
