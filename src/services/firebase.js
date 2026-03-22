import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyB_k9w2F0I591-8mUyuHr_5B-TVQea0Tfo',
  authDomain: 'huzz-10264.firebaseapp.com',
  projectId: 'huzz-10264',
  storageBucket: 'huzz-10264.firebasestorage.app',
  messagingSenderId: '19254029866',
  appId: '1:19254029866:web:fe891e5819c8c94c589d53',
};

// One consistent modular firebase instance for native (avoid compat: it pulls Node internals via undici)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// IMPORTANT: initializeAuth before getAuth to ensure RN persistence
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  // Only fall back when Auth is already initialized.
  // Falling back for other errors can trigger the broken default init path.
  if (e && typeof e === 'object' && e.code === 'auth/already-initialized') {
    auth = getAuth(app);
      // Ensure persistence is set even if auth was already initialized
      // Note: setPersistence can only be called before sign-in, so this is best-effort
      // For React Native, we want AsyncStorage persistence which is already set via initializeAuth
      // If we're here, persistence should already be configured, but we can't change it after init
  } else {
    throw e;
  }
}

// Use the default Firestore database for the new project.
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
