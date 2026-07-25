
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app } from '../services/firebase';

/**
 * Requests permission to show notifications and retrieves the FCM token.
 * @returns The FCM token if permission is granted, otherwise null.
 */
export const getFCMToken = async (): Promise<string | null> => {
  const messagingSupported = await isSupported();
  if (!messagingSupported) {
    console.warn('Firebase Messaging is not supported in this browser.');
    return null;
  }

  const messaging = getMessaging(app);

  try {
    const VAPID_KEY = 'BED4eP1e3O95scTlqCDXrsjCwM9FOoD4Z0WURxk7H5QDUgG4v43-ik1Mpt8jqSSr9sD8qpQLko-an14f1obSyTI';

    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
      console.log('Notification permission granted.');
      const currentToken = await getToken(messaging, {
        vapidKey: VAPID_KEY,
      });

      if (currentToken) {
        console.log('FCM Token obtained:', currentToken);
        return currentToken;
      } else {
        console.log('Could not get FCM token. Permission might be required.');
        return null;
      }
    } else {
      console.log('Notification permission not granted.');
      return null;
    }
  } catch (error) {
    console.error('An error occurred while retrieving FCM token:', error);
    return null;
  }
};
