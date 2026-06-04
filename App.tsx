import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import Screens
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import ProfileScreen from './screens/ProfileScreen';
import NotificationScreen from './screens/NotificationScreen';

import { auth, db } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { requestUserPermission, setupNotificationListeners } from './lib/NotificationService';

const Stack = createNativeStackNavigator();

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState('Login');
  const [initialParams, setInitialParams] = useState({});

  useEffect(() => {
    // Listen for Firebase Auth changes
    const checkSession = async (user: any) => {
      try {
        if (user) {
          let staffDataStr = await AsyncStorage.getItem('staffData');
          let staffData = null;

          if (staffDataStr) {
            staffData = JSON.parse(staffDataStr);
          } else {
            console.log('[Auth] Firebase user found but no local profile data. Fetching from Firestore...');
            // Fetch additional staff data from Firestore directly
            const staffDoc = await getDoc(doc(db, "staff", user.uid));
            if (staffDoc.exists()) {
              const data = staffDoc.data();
              staffData = {
                id: user.uid,
                ...data,
                token: await user.getIdToken()
              };
              // Save restored data to local storage
              await AsyncStorage.setItem('staffData', JSON.stringify(staffData));
              await AsyncStorage.setItem('staffToken', staffData.token);
            } else {
              // Try fetching as admin/manager
              const adminDoc = await getDoc(doc(db, "users", user.uid));
              if (adminDoc.exists()) {
                const data = adminDoc.data();
                staffData = {
                  id: user.uid,
                  ...data,
                  token: await user.getIdToken()
                };
                await AsyncStorage.setItem('staffData', JSON.stringify(staffData));
                await AsyncStorage.setItem('staffToken', staffData.token);
              }
            }
          }

          if (staffData) {
            setInitialParams({ staff: staffData });
            setInitialRoute('Home');
            console.log('[Auth] Session restored:', staffData.full_name);
          } else {
            console.log('[Auth] Firebase user found but profile not found in Firestore.');
            setInitialRoute('Login');
          }
        } else {
          console.log('[Auth] No active session found');
          setInitialRoute('Login');
        }
      } catch (err) {
        console.error('[Auth] Error during session check:', err);
        setInitialRoute('Login');
      } finally {
        setIsLoading(false);
      }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      checkSession(user);
    });

    // Initialize Notifications
    requestUserPermission();
    const unsubscribeNotifications = setupNotificationListeners();

    return () => {
      unsubscribeAuth();
      unsubscribeNotifications();
    };
  }, []);


  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B1221' }}>
        <ActivityIndicator size="large" color="#D0B079" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator 
            initialRouteName={initialRoute}
            screenOptions={{
              headerShown: false,
              animation: 'none',
            }}
          >
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Home" component={HomeScreen} initialParams={initialParams} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Notification" component={NotificationScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;
