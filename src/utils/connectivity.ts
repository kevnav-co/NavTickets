
export interface ConnectivityStatus {
  text: 'Online' | 'En Caché' | 'Híbrido';
  color: 'green' | 'orange' | 'blue';
  isOffline: boolean;
  /** Derivado de isOffline. Los hooks que leen `isOnline` (useSupabaseActions,
   *  useSyncManager, useSupabaseQuery, etc.) dependen de que exista aquí. */
  isOnline: boolean;
}

export const getConnectivityStatus = (): ConnectivityStatus => {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const hasServiceWorker = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;

  if (!isOnline) {
    return { text: 'En Caché', color: 'orange', isOffline: true, isOnline: false };
  }

  if (hasServiceWorker) {
    // Modo Híbrido ahora se considera funcionalmente online.
    return { text: 'Híbrido', color: 'blue', isOffline: false, isOnline: true };
  }

  return { text: 'Online', color: 'green', isOffline: false, isOnline: true };
};
