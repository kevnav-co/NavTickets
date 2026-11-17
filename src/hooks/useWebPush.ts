import { useEffect, useState, useCallback, useRef } from 'react';
import { getOrCreatePushSubscription, requestNotificationPermission, savePushSubscription } from '../utils/webPush';
import { useConnectivityStatus } from './useConnectivityStatus';

export interface WebPushState {
  permission: NotificationPermission | 'unsupported' | boolean;
  pushToken: string | null;
  isSupported: boolean;
  isLoading: boolean;
  initError: string | null;
  actionError: string | null;
}

/**
 * Hook para Web Push API (VAPID).
 * Gestiona permisos, crea la suscripción del navegador y la guarda en
 * `push_subscriptions` (donde la busca la Edge Function send-push). El endpoint
 * también se copia en `users.onesignal_player_id` (nombre heredado) para el panel
 * de diagnóstico.
 */
export const useWebPush = (
  currentUser?: { id: string; companyId?: string; fcmToken?: string; onesignalPlayerId?: string } | null,
  updatePushToken?: (userId: string, token: string) => Promise<void>,
) => {
  const [state, setState] = useState<WebPushState>({
    permission: 'default',
    pushToken: null,
    isSupported: false,
    isLoading: false,
    initError: null,
    actionError: null,
  });
  const { isOnline } = useConnectivityStatus();
  // La suscripción se guarda una vez por sesión y usuario: el guardado es idempotente,
  // pero no hace falta repetirlo en cada render.
  const savedFor = useRef<string | null>(null);

  // Verificar soporte en mount
  useEffect(() => {
    const supported = typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
    setState(prev => ({ ...prev, isSupported: supported }));

    if (supported && typeof Notification !== 'undefined') {
      setState(prev => ({ ...prev, permission: Notification.permission }));
    }
  }, []);

  // Refresco silencioso (cuando el permiso ya está otorgado): asegura que la
  // suscripción de este navegador esté guardada para el usuario actual.
  const silentTokenRefresh = useCallback(async () => {
    if (!state.isSupported || !isOnline || !currentUser?.id || !currentUser.companyId) return;
    if (Notification.permission !== 'granted') return;
    if (savedFor.current === currentUser.id) return;

    try {
      const subscription = await getOrCreatePushSubscription();
      await savePushSubscription(subscription, currentUser.id, currentUser.companyId);
      savedFor.current = currentUser.id;
      const endpoint = subscription.endpoint;
      const stored = currentUser.onesignalPlayerId ?? currentUser.fcmToken;
      if (updatePushToken && endpoint !== stored) await updatePushToken(currentUser.id, endpoint);
      setState(prev => ({ ...prev, pushToken: endpoint }));
    } catch (error) {
      console.warn('[WebPush] Silent token refresh failed:', error);
    }
  }, [currentUser?.id, currentUser?.companyId, currentUser?.onesignalPlayerId, currentUser?.fcmToken, isOnline, state.isSupported, updatePushToken]);

  // Ejecutar refresh silencioso cuando el usuario o conectividad cambia
  useEffect(() => {
    if (currentUser?.id && isOnline) {
      const timer = setTimeout(silentTokenRefresh, 2000);
      return () => clearTimeout(timer);
    }
  }, [currentUser?.id, isOnline, silentTokenRefresh]);

  // Solicitar permiso de notificaciones
  const enableNotifications = useCallback(async () => {
    if (!state.isSupported || !currentUser?.id || !updatePushToken || state.isLoading) return;

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

      if (!currentUser.companyId) throw new Error('El usuario no tiene empresa: no se puede guardar la suscripción.');

      // Obtener o crear la suscripción y guardarla donde la busca send-push
      const subscription = await getOrCreatePushSubscription();
      await savePushSubscription(subscription, currentUser.id, currentUser.companyId);
      savedFor.current = currentUser.id;
      const endpoint = subscription.endpoint;
      await updatePushToken(currentUser.id, endpoint);
      setState(prev => ({
        ...prev,
        permission: Notification.permission,
        pushToken: endpoint,
        isLoading: false,
      }));
    } catch (error: any) {
      console.error('[WebPush] Enable notifications error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        actionError: error?.message || 'Error al habilitar notificaciones.',
      }));
    }
  }, [currentUser?.id, currentUser?.companyId, state.isSupported, updatePushToken, state.isLoading]);

  // Monitorear cambios de permiso vía Permissions API (sin polling)
  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setState(prev => ({ ...prev, permission: 'unsupported' }));
      return;
    }

    setState(prev => ({ ...prev, permission: Notification.permission }));

    let permStatus: PermissionStatus | null = null;
    const handleChange = () => {
      setState(prev => ({ ...prev, permission: Notification.permission }));
    };

    navigator.permissions?.query({ name: 'notifications' }).then(status => {
      permStatus = status;
      status.addEventListener('change', handleChange);
    }).catch(() => {});

    return () => {
      permStatus?.removeEventListener('change', handleChange);
    };
  }, []);

  return {
    ...state,
    enableNotifications,
    silentTokenRefresh,
  };
};
