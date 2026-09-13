import { useEffect, useState, useCallback } from 'react';
import {
  initOneSignal,
  requestNotificationPermission,
  getOneSignalToken,
  setExternalUserId,
  removeExternalUserId,
  isOneSignalSupported
} from '../services/oneSignal';
import { useConnectivityStatus } from './useConnectivityStatus';

export interface OneSignalState {
  permission: NotificationPermission | 'unsupported' | boolean;
  pushToken: string | null;
  isSupported: boolean;
  isLoading: boolean;
  /** Motivo (legible) si `initOneSignal` falló o el SDK no cargó. null = OK. */
  initError: string | null;
  /** Motivo (legible) si falló el último intento de activar (requestPermission). */
  actionError: string | null;
}

/**
 * Hook for OneSignal push notifications
 * Replaces Firebase messaging logic
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

  // Initialize OneSignal on mount
  useEffect(() => {
    let cancelled = false;
    const supported = isOneSignalSupported();
    setState(prev => ({ ...prev, isSupported: supported }));

    if (supported) {
      initOneSignal().then(result => {
        if (cancelled) return;
        setState(prev =>
          result.ok
            ? prev
            : { ...prev, initError: result.error || 'No se pudo inicializar OneSignal.' },
        );
      });

      // Set initial permission state
      if (typeof Notification !== 'undefined') {
        setState(prev => ({ ...prev, permission: Notification.permission }));
      }
    }
    return () => { cancelled = true; };
  }, []);

  // Sync external user ID when user changes
  useEffect(() => {
    if (!state.isSupported || !isOnline) return;

    if (currentUser?.id) {
      setExternalUserId(currentUser.id);
    } else {
      removeExternalUserId();
    }
  }, [currentUser?.id, isOnline, state.isSupported]);

  // Silent token refresh (when permission already granted)
  const silentTokenRefresh = useCallback(async () => {
    if (!state.isSupported || !isOnline || !currentUser?.id) return;
    const permission = await OneSignal.Notifications.permission;
    if (!permission) return;

    try {
      const token = getOneSignalToken();
      // Nuevo hogar del player id: onesignal_player_id (fallback a fcm_token legado).
      const storedPlayerId = currentUser.onesignalPlayerId ?? currentUser.fcmToken;
      if (token && token !== storedPlayerId && updateUserFcmToken) {
        await updateUserFcmToken(currentUser.id, token);
        setState(prev => ({ ...prev, pushToken: token }));
      }
    } catch (error) {
      console.warn('[OneSignal] Silent token refresh failed:', error);
    }
  }, [currentUser?.id, currentUser?.onesignalPlayerId, currentUser?.fcmToken, isOnline, state.isSupported, updateUserFcmToken]);

  // Run silent token refresh when user/online status changes
  useEffect(() => {
    if (currentUser?.id && isOnline) {
      const timer = setTimeout(silentTokenRefresh, 2000); // Small delay for OneSignal init
      return () => clearTimeout(timer);
    }
  }, [currentUser?.id, isOnline, silentTokenRefresh]);

  // Request permission (user gesture required on iOS)
  const enableNotifications = useCallback(async () => {
    if (!state.isSupported || !currentUser?.id || !updateUserFcmToken || state.isLoading) return;

    setState(prev => ({ ...prev, isLoading: true, actionError: null }));

    try {
      const token = await requestNotificationPermission();
      if (token) {
        await updateUserFcmToken(currentUser.id, token);
        console.log('[OneSignal] Notification permission granted and token saved');
      } else {
        // Sin token: o se rechazó el permiso, o el SDK no respondió (colgado).
        setState(prev => ({
          ...prev,
          permission: Notification.permission,
          pushToken: null,
          actionError: Notification.permission === 'denied'
            ? 'Permiso bloqueado. Ajústalo en los permisos del navegador para este sitio.'
            : 'No se obtuvo la suscripción. Revisa el estado del SDK OneSignal (¿CDN bloqueado?).',
        }));
      }
      setState(prev => ({
        ...prev,
        permission: Notification.permission,
        pushToken: token,
        isLoading: false,
      }));
    } catch (error: any) {
      console.error('[OneSignal] Enable notifications error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        actionError: error?.message || String(error),
      }));
    }
  }, [currentUser?.id, state.isSupported, updateUserFcmToken, state.isLoading]);

  // Update permission state when it changes
  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setState(prev => ({ ...prev, permission: 'unsupported' }));
      return;
    }

    const handlePermissionChange = () => {
      setState(prev => ({ ...prev, permission: Notification.permission }));
    };

    // Check periodically (no event for permission change)
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