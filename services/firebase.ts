
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

/**
 * Firebase Configuration
 * Uses environment variables for configuration.
 * Fallbacks are provided for the sandbox environment.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Handle initialization safely
let app;
try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
} catch (error) {
  console.warn("Firebase initialization failed. Auth bypass remains available.", error);
  // Create a minimal fake app if initialization fails completely
  app = { options: firebaseConfig } as any;
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);

// Initialize Analytics safely - it's non-critical
try {
  getAnalytics(app);
} catch (error) {
  console.warn('Analytics initialization failed (non-critical):', error);
}

export const googleProvider = new GoogleAuthProvider();
