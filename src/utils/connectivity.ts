
export interface ConnectivityStatus {
  text: 'Online' | 'En Caché' | 'Híbrido';
  color: 'green' | 'orange' | 'blue';
  isOffline: boolean;
}

export const getConnectivityStatus = (): ConnectivityStatus => {
  const isOnline = navigator.onLine;
  const hasServiceWorker = !!navigator.serviceWorker.controller;

  if (!isOnline) {
    return { text: 'En Caché', color: 'orange', isOffline: true };
  }

  if (hasServiceWorker) {
    // Modo Híbrido ahora se considera funcionalmente online.
    return { text: 'Híbrido', color: 'blue', isOffline: false };
  }

  return { text: 'Online', color: 'green', isOffline: false };
};
