/**
 * Web Push API utilities
 * Maneja registro de suscripciones y permisos de notificaciones
 */

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
}

/**
 * Solicitar permiso de notificaciones al usuario
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!("Notification" in window)) {
    console.log("Notificaciones no soportadas en este navegador");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission === "denied") {
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === "granted";
};

/**
 * Registrar suscripción de push en Supabase
 */
export const registerPushSubscription = async (
  subscription: PushSubscriptionJSON,
  userId: string,
  companyId: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<boolean> => {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
        "apikey": supabaseKey,
      },
      body: JSON.stringify({
        user_id: userId,
        company_id: companyId,
        endpoint: subscription.endpoint,
        auth: subscription.keys.auth,
        p256dh: subscription.keys.p256dh,
        user_agent: navigator.userAgent,
      }),
    });

    if (!response.ok) {
      console.error("Failed to register push subscription:", await response.text());
      return false;
    }

    console.log("Push subscription registered successfully");
    return true;
  } catch (error) {
    console.error("Error registering push subscription:", error);
    return false;
  }
};

/**
 * Unregister push subscription from Supabase
 */
export const unregisterPushSubscription = async (
  endpoint: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<boolean> => {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,
      {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey,
        },
      }
    );

    if (!response.ok) {
      console.error("Failed to unregister push subscription:", await response.text());
      return false;
    }

    console.log("Push subscription unregistered");
    return true;
  } catch (error) {
    console.error("Error unregistering push subscription:", error);
    return false;
  }
};

/**
 * Solicitar y registrar push en un paso
 */
export const enablePushNotifications = async (
  userId: string,
  companyId: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<boolean> => {
  // 1. Solicitar permiso
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) {
    console.log("Notificaciones no permitidas por el usuario");
    return false;
  }

  // 2. Verificar si el navegador soporta service workers
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.log("Push notifications no soportadas");
    return false;
  }

  try {
    // 3. Registrar service worker (si no está registrado)
    const registration = await navigator.serviceWorker.ready;

    // 4. Obtener suscripción existente o crear una nueva
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // VAPID public key - debe coincidir con la privada en el servidor
      const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.error("VITE_VAPID_PUBLIC_KEY no configurada");
        return false;
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
      });
    }

    // 5. Registrar en Supabase
    const subscriptionJSON = subscription.toJSON() as PushSubscriptionJSON;
    return await registerPushSubscription(
      subscriptionJSON,
      userId,
      companyId,
      supabaseUrl,
      supabaseKey
    );
  } catch (error) {
    console.error("Error enabling push notifications:", error);
    return false;
  }
};

/**
 * Convertir VAPID public key de base64 a Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
