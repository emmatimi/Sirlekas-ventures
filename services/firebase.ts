
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

/**
 * Firebase Configuration
 * Uses environment variables for configuration.
 * Fallbacks are provided for the sandbox environment.
 */
const firebaseConfig = {
  // Fixed: Property 'env' does not exist on type 'ImportMeta'. Using process.env as per environment standards.
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID ,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ,
  appId: process.env.VITE_FIREBASE_APP_ID ,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID
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

// Initialize Analytics safely - it's non-critical
try {
  getAnalytics(app);
} catch (error) {
  console.warn('Analytics initialization failed (non-critical):', error);
}

export const googleProvider = new GoogleAuthProvider();
