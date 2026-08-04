import OneSignal from 'react-onesignal';

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID;

/**
 * Initialize OneSignal SDK
 * Call this once at app startup
 */
export const initOneSignal = async (): Promise<void> => {
  if (!ONESIGNAL_APP_ID) {
    console.warn('[OneSignal] VITE_ONESIGNAL_APP_ID not configured');
    return;
  }

  try {
    // Initialize OneSignal
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      autoRegister: true,
      notificationClickHandlerAction: 'focus',
      welcomeNotification: {
        disable: true,
      },
      // Add service worker path for PWA
      serviceWorkerPath: '/sw.js',
    });

    // Enable logging in development
    if (import.meta.env.DEV) {
      OneSignal.Debug.setLogLevel('debug');
    }

    // Handle notification received when app is in foreground
    OneSignal.Notifications.addEventListener('foregroundWillDisplay', (event) => {
      console.log('[OneSignal] Notification received in foreground:', event.notification);
      // Allow the notification to display
      event.notification.display();
    });

    // Handle notification click
    OneSignal.Notifications.addEventListener('click', (event) => {
      console.log('[OneSignal] Notification clicked:', event);
      handleNotificationOpen(event);
    });

    console.log('[OneSignal] Initialized successfully');
  } catch (error) {
    console.error('[OneSignal] Initialization error:', error);
  }
};

/**
 * Request notification permission and get token
 * Returns OneSignal push token
 */
export const requestNotificationPermission = async (): Promise<string | null> => {
  if (!ONESIGNAL_APP_ID) {
    console.warn('[OneSignal] Not configured');
    return null;
  }

  try {
    const permission = await OneSignal.Notifications.requestPermission();

    if (permission) {
      // Wait a bit for the subscription to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      const pushToken = OneSignal.User.PushSubscription.token;

      if (pushToken) {
        console.log('[OneSignal] Push token obtained:', pushToken);
        return pushToken;
      }
    }

    return null;
  } catch (error) {
    console.error('[OneSignal] Permission error:', error);
    return null;
  }
};

/**
 * Get the current OneSignal push token
 */
export const getOneSignalToken = (): string | null => {
  try {
    return OneSignal.User.PushSubscription.token;
  } catch (error) {
    console.error('[OneSignal] Get token error:', error);
    return null;
  }
};

/**
 * Set external user ID for targeting
 */
export const setExternalUserId = async (userId: string): Promise<void> => {
  try {
    await OneSignal.login(userId);
    console.log('[OneSignal] External user ID set:', userId);
  } catch (error) {
    console.error('[OneSignal] Set external user ID error:', error);
  }
};

/**
 * Remove external user ID (logout)
 */
export const removeExternalUserId = async (): Promise<void> => {
  try {
    await OneSignal.logout();
    console.log('[OneSignal] External user ID removed');
  } catch (error) {
    console.error('[OneSignal] Remove external user ID error:', error);
  }
};

/**
 * Send a tag (for segmentation)
 */
export const sendTag = async (key: string, value: string): Promise<void> => {
  try {
    await OneSignal.User.addTag(key, value);
  } catch (error) {
    console.error('[OneSignal] Send tag error:', error);
  }
};

/**
 * Handle notification click - navigate based on payload
 */
const handleNotificationOpen = (event: { notification: any; result: any }): void => {
  const data = event.notification?.additionalData;
  if (!data) return;

  const path = data.path;
  if (!path) return;

  // Navigate using hash router (since app uses HashRouter)
  if (!window.location.hash.includes(path)) {
    window.location.hash = path;
  }
};

/**
 * Check if OneSignal is supported in this browser
 */
export const isOneSignalSupported = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window && 'PushManager' in window;
};

export default OneSignal;