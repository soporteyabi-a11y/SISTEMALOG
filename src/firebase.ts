import { initializeApp, getApp, getApps } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App using the central platform project configuration
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Use the exact database ID from firebase-applet-config.json
const databaseId = firebaseConfig.firestoreDatabaseId;

let db: any;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  }, databaseId);
} catch (e) {
  const { getFirestore } = require('firebase/firestore');
  db = getFirestore(app, databaseId);
}

export { app, db, firebaseConfig };





