import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyBI6yf2ci31kM7j92OgZgSGQUhEvVdLNWg",
  authDomain: "honeymoonstaff-prod.firebaseapp.com",
  projectId: "honeymoonstaff-prod",
  storageBucket: "honeymoonstaff-prod.firebasestorage.app",
  messagingSenderId: "583520600420",
  appId: "1:583520600420:web:fb55f82473a92ffac2fa71",
  measurementId: "G-0YDJHR0RR5"
};

let app;
let authInstance;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} else {
  app = getApp();
  authInstance = getAuth(app);
}

export const auth = authInstance;
export const db = getFirestore(app);

export default app;
