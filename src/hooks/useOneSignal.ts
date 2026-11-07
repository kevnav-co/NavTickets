import { useEffect, useState, useCallback } from 'react';
import { requestNotificationPermission } from '../utils/webPush';
import { useConnectivityStatus } from './useConnectivityStatus';

export interface OneSignalState {
  permission: NotificationPermission | 'unsupported' | boolean;
  pushToken: string | null;
  isSupported: boolean;
  isLoading: boolean;
  initError: string | null;
  actionError: string | null;
}

/**
 * Hook para Web Push API (reemplaza OneSignal)
 * Interfaz compatible con Header.tsx
 */
export const useOneSignal = (currentUser?: { id: string; fcmToken?: string; onesignalPlayerId?: string } | null, updateUserFcmToken?: (userId: string, token: string) => Promise<void>) => {
  const [state, setState] = useState<OneSignalState>({
    permission: 'default',
    pushToken: null,
    isSupported: false,
    isLoading: false,
    initError: null,
    actionError: null,
  });
  const { isOnline } = useConnectivityStatus();

  // Verificar soporte en mount
  useEffect(() => {
    const supported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
    setState(prev => ({ ...prev, isSupported: supported }));

    if (supported && typeof Notification !== 'undefined') {
      setState(prev => ({ ...prev, permission: Notification.permission }));
    }
  }, []);

  // Silent token refresh (cuando el permiso ya está otorgado)
  const silentTokenRefresh = useCallback(async () => {
    if (!state.isSupported || !isOnline || !currentUser?.id) return;
    if (Notification.permission !== 'granted') return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription && updateUserFcmToken) {
        const endpoint = subscription.endpoint;
        const stored = currentUser.onesignalPlayerId ?? currentUser.fcmToken;
        if (endpoint !== stored) {
          await updateUserFcmToken(currentUser.id, endpoint);
          setState(prev => ({ ...prev, pushToken: endpoint }));
        }
      }
    } catch (error) {
      console.warn('[WebPush] Silent token refresh failed:', error);
    }
  }, [currentUser?.id, currentUser?.onesignalPlayerId, currentUser?.fcmToken, isOnline, state.isSupported, updateUserFcmToken]);

  // Ejecutar refresh silencioso cuando el usuario o conectividad cambia
  useEffect(() => {
    if (currentUser?.id && isOnline) {
      const timer = setTimeout(silentTokenRefresh, 2000);
      return () => clearTimeout(timer);
    }
  }, [currentUser?.id, isOnline, silentTokenRefresh]);

  // Solicitar permiso de notificaciones
  const enableNotifications = useCallback(async () => {
    if (!state.isSupported || !currentUser?.id || !updateUserFcmToken || state.isLoading) return;

    setState(prev => ({ ...prev, isLoading: true, actionError: null }));

    try {
      const hasPermission = await requestNotificationPermission();
      if (!hasPermission) {
        setState(prev => ({
          ...prev,
          permission: Notification.permission,
          pushToken: null,
          actionError: Notification.permission === 'denied'
            ? 'Permiso bloqueado. Ajústalo en los permisos del navegador para este sitio.'
            : 'No se pudo habilitar las notificaciones push.',
          isLoading: false,
        }));
        return;
      }

      // Obtener la suscripción y registrarla
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await updateUserFcmToken(currentUser.id, endpoint);
        setState(prev => ({
          ...prev,
          permission: Notification.permission,
          pushToken: endpoint,
          isLoading: false,
        }));
      }
    } catch (error: any) {
      console.error('[WebPush] Enable notifications error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        actionError: error?.message || 'Error al habilitar notificaciones.',
      }));
    }
  }, [currentUser?.id, state.isSupported, updateUserFcmToken, state.isLoading]);

  // Monitorear cambios de permiso
  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setState(prev => ({ ...prev, permission: 'unsupported' }));
      return;
    }

    const handlePermissionChange = () => {
      setState(prev => ({ ...prev, permission: Notification.permission }));
    };

    const interval = setInterval(handlePermissionChange, 5000);
    handlePermissionChange();

    return () => clearInterval(interval);
  }, []);

  return {
    ...state,
    enableNotifications,
    silentTokenRefresh,
  };
};
