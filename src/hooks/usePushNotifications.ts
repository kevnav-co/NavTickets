// src/hooks/usePushNotifications.ts
//
// Hook unificado de notificaciones push.
// FASE ACTUAL: Usa Firebase Cloud Messaging (FCM) bajo el capó.
// PRÓXIMA FASE (Fase 5): Se reemplazará por OneSignal SDK.
// Todo el código FCM está aislado aquí para facilitar el reemplazo.

import { useCallback } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { getMessagingInstance } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';

const VAPID_KEY = "BED4eP1e3O95scTlqCDXrsjCwM9FOoD4Z0WURxk7H5QDUgG4v43-ik1Mpt8jqSSr9sD8qpQLko-an14f1obSyTI";

/**
 * Hook que gestiona el ciclo de vida de notificaciones push:
 * - Solicitud de permiso al usuario (user gesture)
 * - Refresco silencioso del token
 * - Manejo de mensajes en foreground
 * - Persistencia del token en el perfil del usuario
 */
export function usePushNotifications() {
  const { currentUser } = useAuth();
  const { updateItem } = useData();

  /**
   * Solicita permiso de notificación al usuario (debe llamarse desde un
   * gesto del usuario para iOS Safari). Luego obtiene y guarda el token FCM.
   */
  const requestPermission = useCallback(async (): Promise<NotificationPermission | null> => {
    if (typeof Notification === 'undefined') return null;

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await refreshToken();
      }
      return permission;
    } catch (err) {
      console.warn('[PushNotifications] Error requesting permission:', err);
      return null;
    }
  }, []);

  /**
   * Obtiene el token FCM y lo guarda en el perfil del usuario.
   * Se puede llamar repetidamente; solo persiste si el token cambió.
   */
  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (!currentUser || typeof Notification === 'undefined') return null;
    if (Notification.permission !== 'granted') return null;

    try {
      const msgInstance = await getMessagingInstance();
      if (!msgInstance) return null;

      // Esperar SW con timeout (iOS puede ser lento)
      const swReady = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);

      // Hasta 2 intentos
      let token: string | null = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          token = await getToken(msgInstance, {
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: swReady || undefined,
          });
          if (token) break;
        } catch (tokenErr) {
          console.warn(`[PushNotifications] Token attempt ${attempt}/2:`, tokenErr);
          if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (token && token !== currentUser.fcmToken) {
        await updateItem('users', currentUser.id, { fcmToken: token });
      }

      return token;
    } catch (err) {
      console.warn('[PushNotifications] Error refreshing token:', err);
      return null;
    }
  }, [currentUser, updateItem]);

  /**
   * Escucha mensajes en foreground y dispara Notification API nativa.
   */
  const startForegroundListener = useCallback(
    (onNotification?: (payload: any) => void) => {
      let unsub: (() => void) | undefined;

      (async () => {
        const msgInstance = await getMessagingInstance();
        if (!msgInstance) return;

        unsub = onMessage(msgInstance, (payload) => {
          console.log('[PushNotifications] Foreground message:', payload);

          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const notification = new Notification(
              payload.notification?.title || 'Notificación',
              {
                body: payload.notification?.body,
                icon: 'https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Logo-Inicio.png?alt=media&token=b516cd08-2ece-445d-ac69-0b91d444d78f',
                data: payload.data,
              }
            );

            notification.onclick = (event) => {
              event.preventDefault();
              window.focus();
              const path = payload.data?.path;
              if (path) {
                window.location.hash = path;
              }
              notification.close();
            };
          }

          onNotification?.(payload);
        });
      })();

      return () => unsub?.();
    },
    []
  );

  return { requestPermission, refreshToken, startForegroundListener };
}

export type UsePushNotificationsReturn = ReturnType<typeof usePushNotifications>;