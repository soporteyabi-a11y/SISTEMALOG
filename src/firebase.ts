import { initializeApp, getApp, getApps } from 'firebase/app';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App using the central platform project configuration
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Target the official shared Firestore database for multi-PC synchronization
const primaryDbId = firebaseConfig.firestoreDatabaseId || 'ai-studio-7257e416-c916-4773-80bd-ca9334204e28';

// Clear any accidental stale '(default)' database override from local storage
if (typeof window !== 'undefined') {
  const currentOverride = localStorage.getItem('override_firestore_db_id');
  if (currentOverride === '(default)') {
    localStorage.removeItem('override_firestore_db_id');
  }
}

const overrideDbId = typeof window !== 'undefined' ? localStorage.getItem('override_firestore_db_id') : null;
const databaseId = overrideDbId || primaryDbId;

let db: any;
try {
  db = initializeFirestore(app, {
    localCache: memoryLocalCache()
  }, databaseId);
} catch (e) {
  const { getFirestore } = require('firebase/firestore');
  db = getFirestore(app, databaseId);
}

export { app, db, firebaseConfig, databaseId };







