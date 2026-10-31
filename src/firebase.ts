import { initializeApp, getApp, getApps } from 'firebase/app';
import { initializeFirestore, memoryLocalCache, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App using the central platform project configuration
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Target the official shared Firestore database for multi-PC synchronization
const primaryDbId = firebaseConfig.firestoreDatabaseId || '(default)';

// Clear obsolete ai-studio project override if present
if (typeof window !== 'undefined') {
  const currentOverride = localStorage.getItem('override_firestore_db_id');
  if (currentOverride && currentOverride.startsWith('ai-studio-')) {
    localStorage.removeItem('override_firestore_db_id');
  }
}

const overrideDbId = typeof window !== 'undefined' ? localStorage.getItem('override_firestore_db_id') : null;
const databaseId = overrideDbId || primaryDbId;

let db: any;
try {
  db = initializeFirestore(app, {
    localCache: memoryLocalCache()
  }, databaseId === '(default)' ? undefined : databaseId);
} catch (e) {
  try {
    db = databaseId === '(default)' ? getFirestore(app) : getFirestore(app, databaseId);
  } catch (err) {
    db = getFirestore(app);
  }
}

export { app, db, firebaseConfig, databaseId };







