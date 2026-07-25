
import { useState, useEffect } from 'react';
import { getConnectivityStatus, ConnectivityStatus } from '../utils/connectivity';

export const useConnectivityStatus = (): ConnectivityStatus => {
  const [status, setStatus] = useState<ConnectivityStatus>(getConnectivityStatus);

  useEffect(() => {
    const updateStatus = () => {
      setStatus(getConnectivityStatus());
    };

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('controllerchange', updateStatus);
    }

    updateStatus();

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('controllerchange', updateStatus);
      }
    };
  }, []);

  return status;
};

export type { ConnectivityStatus };
