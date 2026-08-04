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
}

/**
 * Hook for OneSignal push notifications
 * Replaces Firebase messaging logic
 */
export const useOneSignal = (currentUser?: { id: string; fcmToken?: string } | null, updateUserFcmToken?: (userId: string, token: string) => Promise<void>) => {
  const [state, setState] = useState<OneSignalState>({
    permission: 'default',
    pushToken: null,
    isSupported: false,
    isLoading: false,
  });
  const { isOnline } = useConnectivityStatus();

  // Initialize OneSignal on mount
  useEffect(() => {
    const supported = isOneSignalSupported();
    setState(prev => ({ ...prev, isSupported: supported }));

    if (supported) {
      initOneSignal();

      // Set initial permission state
      if (typeof Notification !== 'undefined') {
        setState(prev => ({ ...prev, permission: Notification.permission }));
      }
    }
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
      if (token && token !== currentUser.fcmToken && updateUserFcmToken) {
        await updateUserFcmToken(currentUser.id, token);
        setState(prev => ({ ...prev, pushToken: token }));
      }
    } catch (error) {
      console.warn('[OneSignal] Silent token refresh failed:', error);
    }
  }, [currentUser?.id, currentUser?.fcmToken, isOnline, state.isSupported, updateUserFcmToken]);

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

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const token = await requestNotificationPermission();
      setState(prev => ({
        ...prev,
        permission: Notification.permission,
        pushToken: token,
        isLoading: false
      }));

      if (token) {
        await updateUserFcmToken(currentUser.id, token);
        console.log('[OneSignal] Notification permission granted and token saved');
      }
    } catch (error) {
      console.error('[OneSignal] Enable notifications error:', error);
      setState(prev => ({ ...prev, isLoading: false }));
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