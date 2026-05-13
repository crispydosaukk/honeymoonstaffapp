import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyBI6yf2ci31kM7j92OgZgSGQUhEvVdLNWg",
  authDomain: "honeymoonstaff-prod.firebaseapp.com",
  projectId: "honeymoonstaff-prod",
  storageBucket: "honeymoonstaff-prod.firebasestorage.app",
  messagingSenderId: "583520600420",
  appId: "1:583520600420:web:fb55f82473a92ffac2fa71",
  measurementId: "G-0YDJHR0RR5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
