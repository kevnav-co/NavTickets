
import { useState, useEffect, useRef } from 'react';
import { waitForPendingWrites } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useConnectivityStatus } from './useConnectivityStatus';

export const useOfflineStatus = () => {
  const { isOffline } = useConnectivityStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(false);
  const prevIsOffline = useRef(isOffline);

  useEffect(() => {
    if (isOffline) {
      setPendingChanges(true);
    }
  }, [isOffline]);

  useEffect(() => {
    const wasOffline = prevIsOffline.current;
    const isNowOnline = !isOffline;

    if (wasOffline && isNowOnline && pendingChanges) {
      const syncPendingWrites = async () => {
        if (!db) return;
        console.log('🔌 Conexión recuperada. Iniciando sincronización de datos pendientes...');
        setIsSyncing(true);
        try {
          await waitForPendingWrites(db);
          console.log('✅ Sincronización completada.');
          setPendingChanges(false); // Limpiar el flag tras sincronizar
        } catch (error) {
          console.error("Error durante la sincronización de escrituras pendientes:", error);
          // Mantenemos pendingChanges en true si la sincronización falla, para reintentar luego.
        } finally {
          setIsSyncing(false);
        }
      };
      syncPendingWrites();
    }
    prevIsOffline.current = isOffline;
  }, [isOffline, pendingChanges]);

  const isInternetAvailable = !isOffline;

  return { isInternetAvailable, isSyncing, pendingChanges };
};
