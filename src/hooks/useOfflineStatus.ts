import { useConnectivityStatus } from './useConnectivityStatus';

/**
 * Hook para monitorear el estado de conexión y sincronización.
 * Reemplaza la versión anterior que usaba waitForPendingWrites de Firebase.
 * Ahora usa useSyncManager (a través de DataContext) para la sincronización.
 */
export const useOfflineStatus = () => {
  const { isOffline } = useConnectivityStatus();
  const isOnline = !isOffline;

  return {
    isInternetAvailable: isOnline,
    isSyncing: false,
    pendingChanges: isOffline,
  };
};