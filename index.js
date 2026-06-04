/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidVisibility } from '@notifee/react-native';

// Register background handler early to ensure notifications process when the app is in the background or killed
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('[Background Message Handler] Message handled in the background!', remoteMessage);
  
  // We don't call notifee.displayNotification here because the FCM payload already
  // contains a 'notification' block, which means Google Play Services will automatically
  // display the notification natively in the system tray when the app is killed/backgrounded.
});

AppRegistry.registerComponent(appName, () => App);
