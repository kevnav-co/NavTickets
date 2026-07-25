
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAL1DUSVBfy-XJSbz83S-x867xirOcRx9Y",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "navas-33818730-80986.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://navas-33818730-80986-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "navas-33818730-80986",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "navas-33818730-80986.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "174914174318",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:174914174318:web:c7eb16cc147bad4c51557f",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Export other Firebase services
export const auth = getAuth(app);
export const realtimeDB = getDatabase(app);
export const storage = getStorage(app);

// --- FCM: Lazy/conditional init for iOS Safari compatibility ---
// getMessaging() crashes silently on iOS Safari if called at module load time.
// Using isSupported() + lazy singleton ensures it only initializes on supported environments.
// For iOS PWA (standalone mode), isSupported() may return false even though push works —
// we detect this case and attempt initialization anyway.
let _messagingInstance: Messaging | null = null;
let _messagingChecked = false;

/**
 * Returns the Firebase Messaging instance if the current browser supports it.
 * Enhanced for iOS Safari PWA — attempts initialization even when isSupported()
 * returns false in standalone mode (iOS 16.4+).
 */
export const getMessagingInstance = async (): Promise<Messaging | null> => {
  if (_messagingChecked) return _messagingInstance;

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;

  try {
    const supported = await isSupported();
    if (supported) {
      _messagingInstance = getMessaging(app);
    } else if (isStandalone && 'Notification' in window && 'PushManager' in window) {
      // iOS PWA standalone: isSupported() may return false but push is available
      console.info('[FCM] isSupported()=false but running as PWA with PushManager. Attempting init...');
      try {
        _messagingInstance = getMessaging(app);
        console.info('[FCM] Messaging initialized successfully in PWA standalone mode.');
      } catch (initError) {
        console.warn('[FCM] PWA standalone init failed:', initError);
      }
    } else {
      console.warn('[FCM] Firebase Messaging is not supported in this browser/environment.',
        { isStandalone, hasNotification: 'Notification' in window, hasPushManager: 'PushManager' in window }
      );
    }
  } catch (error) {
    console.warn('[FCM] Error checking messaging support:', error);
  }
  _messagingChecked = true;
  return _messagingInstance;
};

// Legacy export kept for backward compatibility (null-safe).
// Prefer getMessagingInstance() in new code.
export const messaging: Messaging | null = null;

// Initialize Firestore with the persistent cache for offline support
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({})
});
