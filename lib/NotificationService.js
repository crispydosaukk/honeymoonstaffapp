import messaging from '@react-native-firebase/messaging';
import { db } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';

/**
 * Request notification permissions and get the FCM token
 */
export const requestUserPermission = async () => {
  try {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      console.log('[Notification] Authorization status:', authStatus);
      const token = await getFcmToken();
      return token;
    }
  } catch (error) {
    console.error('[Notification] Permission error:', error);
  }
  return null;
};

/**
 * Get the FCM token and store it locally
 */
export const getFcmToken = async () => {
  try {
    let fcmToken = await AsyncStorage.getItem('fcmToken');
    if (!fcmToken) {
      fcmToken = await messaging().getToken();
      if (fcmToken) {
        console.log('[Notification] New FCM Token Generated');
        await AsyncStorage.setItem('fcmToken', fcmToken);
      }
    }
    
    // Always attempt to sync with Firestore if we have a token
    if (fcmToken) {
      syncTokenWithFirestore(fcmToken);
    }
    
    return fcmToken;
  } catch (error) {
    console.error('[Notification] Error getting token:', error);
    return null;
  }
};

/**
 * Sync the token with the user's staff record in Firestore
 */
export const syncTokenWithFirestore = async (token) => {
  try {
    const staffDataStr = await AsyncStorage.getItem('staffData');
    if (staffDataStr) {
      const staffData = JSON.parse(staffDataStr);
      const staffId = staffData.id || staffData.uid;
      
      if (staffId) {
        const staffRef = doc(db, 'staff', staffId);
        await updateDoc(staffRef, {
          fcmToken: token,
          lastTokenUpdate: new Date().toISOString(),
          platform: Platform.OS
        });
        console.log('[Notification] Token synced with Firestore for staff:', staffId);
      }
    }
  } catch (error) {
    console.error('[Notification] Error syncing token:', error);
  }
};

/**
 * Set up notification listeners for foreground, background, and quit states
 */
export const setupNotificationListeners = () => {
  // Handle foreground messages
  const unsubscribeOnMessage = messaging().onMessage(async remoteMessage => {
    console.log('[Notification] Foreground Message:', remoteMessage);
    // Alert is now handled by the in-app banner in HomeScreen/NotificationScreen
  });

  // Handle notification opening from background state
  messaging().onNotificationOpenedApp(remoteMessage => {
    console.log('[Notification] App opened from background:', remoteMessage.notification);
  });

  // Check if app was opened from a quit state via a notification
  messaging()
    .getInitialNotification()
    .then(remoteMessage => {
      if (remoteMessage) {
        console.log('[Notification] App opened from quit state:', remoteMessage.notification);
      }
    });

  // Handle token refresh
  const unsubscribeOnTokenRefresh = messaging().onTokenRefresh(token => {
    console.log('[Notification] Token refreshed:', token);
    AsyncStorage.setItem('fcmToken', token);
    syncTokenWithFirestore(token);
  });

  return () => {
    unsubscribeOnMessage();
    unsubscribeOnTokenRefresh();
  };
};
