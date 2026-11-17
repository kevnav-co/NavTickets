/**
 * Web Push API utilities
 * Permisos, suscripción del navegador y registro en push_subscriptions.
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
    console.warn("Notificaciones no soportadas en este navegador");
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
 * Devuelve la suscripción push de este navegador y, si no existe, la crea con la
 * clave pública VAPID (VITE_VAPID_PUBLIC_KEY, la misma que VAPID_PUBLIC_KEY de
 * send-push). Exige permiso concedido y un service worker activo.
 */
export const getOrCreatePushSubscription = async (): Promise<PushSubscription> => {
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    throw new Error("Falta VITE_VAPID_PUBLIC_KEY: no se puede suscribir este navegador a las notificaciones.");
  }
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
  });
};

/**
 * Guarda la suscripción en `push_subscriptions` (migración 040), que es donde la
 * busca la Edge Function send-push. Va por el cliente de Supabase, que envía la
 * clave pública del proyecto en `apikey` y la sesión del usuario en
 * `Authorization` (la RLS solo deja insertar suscripciones propias).
 * Idempotente: si el endpoint ya está guardado, no hace nada.
 */
export const savePushSubscription = async (
  subscription: PushSubscription,
  userId: string,
  companyId: string,
): Promise<void> => {
  const json = subscription.toJSON() as Partial<PushSubscriptionJSON>;
  if (!json.endpoint || !json.keys?.auth || !json.keys?.p256dh) {
    throw new Error("La suscripción del navegador no trae endpoint o claves.");
  }
  const { supabase } = await import("../services/supabase");
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        company_id: companyId,
        endpoint: json.endpoint,
        auth: json.keys.auth,
        p256dh: json.keys.p256dh,
        user_agent: navigator.userAgent.slice(0, 500),
      },
      { onConflict: "endpoint", ignoreDuplicates: true },
    );
  if (error) throw new Error(`No se pudo guardar la suscripción push: ${error.message}`);
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
