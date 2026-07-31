import { initializeApp, getApp, getApps } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA9Sp8BjaMMFTsyecq_ctsDq3si_tu8Bas",
  authDomain: "conciliacion-logistca.firebaseapp.com",
  projectId: "conciliacion-logistca",
  storageBucket: "conciliacion-logistca.firebasestorage.app",
  messagingSenderId: "678083653774",
  appId: "1:678083653774:web:7280508cb091b8efd8d9df"
};

// Initialize Firebase App gracefully
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Retrieve the specific custom Firestore database ID safely with local cache fallback
let db: any;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  }, "ai-studio-7257e416-c916-4773-80bd-ca9334204e28");
} catch (e) {
  // Fallback if already initialized or cache setup encounters an issue
  const { getFirestore } = require('firebase/firestore');
  db = getFirestore(app, "ai-studio-7257e416-c916-4773-80bd-ca9334204e28");
}

export { app, db };




