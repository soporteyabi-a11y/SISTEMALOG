import { db, firebaseConfig } from './firebase';
import { doc, getDoc, getDocFromServer, setDoc, onSnapshot } from 'firebase/firestore';

// Cache for tracking last saved payloads per document to eliminate duplicate cloud writes
const lastSavedPayloads = new Map<string, string>();
const saveCooldowns = new Map<string, number>();

// Cloud connection status tracker with real-time metadata
let isCloudConnected = true;
let isSyncedWithServer = false;
let lastServerSyncTime: string | null = null;
let cloudErrorCount = 0;
let isFromCacheState = false;

export interface CloudStatusInfo {
  connected: boolean;
  isSyncedWithServer: boolean;
  lastServerSyncTime: string | null;
  errorCount: number;
  isFromCache: boolean;
  projectId: string;
  databaseId: string;
}

const statusListeners = new Set<(status: CloudStatusInfo) => void>();

function notifyStatusListeners() {
  const info: CloudStatusInfo = {
    connected: isCloudConnected,
    isSyncedWithServer,
    lastServerSyncTime,
    errorCount: cloudErrorCount,
    isFromCache: isFromCacheState,
    projectId: firebaseConfig.projectId || 'gen-lang-client-0902545089',
    databaseId: firebaseConfig.firestoreDatabaseId || 'ai-studio-remixconciliacin-5a9d3a5a-0e19-4821-a3ea-6c2e4e072f8d'
  };
  statusListeners.forEach(cb => cb(info));
}

export function subscribeCloudStatus(callback: (status: CloudStatusInfo) => void): () => void {
  statusListeners.add(callback);
  callback({
    connected: isCloudConnected,
    isSyncedWithServer,
    lastServerSyncTime,
    errorCount: cloudErrorCount,
    isFromCache: isFromCacheState,
    projectId: firebaseConfig.projectId || 'gen-lang-client-0902545089',
    databaseId: firebaseConfig.firestoreDatabaseId || 'ai-studio-remixconciliacin-5a9d3a5a-0e19-4821-a3ea-6c2e4e072f8d'
  });
  return () => {
    statusListeners.delete(callback);
  };
}

export function getCloudStatus(): CloudStatusInfo {
  return {
    connected: isCloudConnected,
    isSyncedWithServer,
    lastServerSyncTime,
    errorCount: cloudErrorCount,
    isFromCache: isFromCacheState,
    projectId: firebaseConfig.projectId || 'gen-lang-client-0902545089',
    databaseId: firebaseConfig.firestoreDatabaseId || 'ai-studio-remixconciliacin-5a9d3a5a-0e19-4821-a3ea-6c2e4e072f8d'
  };
}

/**
 * Save data to Firestore with strict duplicate prevention, rate limiting, and concurrency audit fields.
 * Guarantees that identical payloads are NEVER written twice to Cloud Firestore.
 */
export async function saveToCloud(collectionName: string, docId: string, data: any, userEmail: string = 'soporteyabi@gmail.com'): Promise<boolean> {
  const key = `${collectionName}/${docId}`;
  
  try {
    const serialized = JSON.stringify(data);
    
    // 1. Strict Payload Deduplication: Skip if the data is identical to what was last saved
    if (lastSavedPayloads.get(key) === serialized) {
      return true; // Already saved, return immediately without performing a write
    }

    // 2. Rate Limiting: Prevent more than 1 write per 300ms for the exact same document path
    const now = Date.now();
    const lastWriteTime = saveCooldowns.get(key) || 0;
    if (now - lastWriteTime < 300) {
      // Cooldown active - update cache to latest, but skip redundant rapid write
      lastSavedPayloads.set(key, serialized);
      return true;
    }

    // Update trackers before writing
    lastSavedPayloads.set(key, serialized);
    saveCooldowns.set(key, now);

    const docRef = doc(db, collectionName, docId);
    const timestamp = new Date().toISOString();
    
    await setDoc(docRef, { 
      data, 
      updatedAt: timestamp,
      updatedBy: userEmail,
      deviceAppletId: 'multi-pc-shared-v1'
    });
    
    isCloudConnected = true;
    isSyncedWithServer = true;
    lastServerSyncTime = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    notifyStatusListeners();
    return true;
  } catch (error) {
    console.warn(`[Firebase] Error saving to ${collectionName}/${docId}:`, error);
    isCloudConnected = false;
    cloudErrorCount++;
    notifyStatusListeners();
    // Reset cache on error to allow retry
    lastSavedPayloads.delete(key);
    return false;
  }
}

// Force a fresh read directly from the cloud server bypassing IndexedDB cache
export async function forceRefreshFromCloud(collectionName: string, docId: string): Promise<any | null> {
  try {
    const docRef = doc(db, collectionName, docId);
    const docSnap = await getDocFromServer(docRef);
    if (docSnap.exists()) {
      const docData = docSnap.data();
      isCloudConnected = true;
      isSyncedWithServer = true;
      lastServerSyncTime = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      isFromCacheState = false;
      notifyStatusListeners();
      return docData ? docData.data : null;
    }
  } catch (error) {
    console.warn(`[Firebase] Force refresh from server failed for ${collectionName}/${docId}, falling back to standard read:`, error);
  }
  return loadFromCloud(collectionName, docId);
}

// Load data once from Firestore
export async function loadFromCloud(collectionName: string, docId: string): Promise<any | null> {
  try {
    const docRef = doc(db, collectionName, docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const docData = docSnap.data();
      isCloudConnected = true;
      isFromCacheState = docSnap.metadata.fromCache;
      notifyStatusListeners();
      return docData ? docData.data : null;
    }
  } catch (error) {
    console.warn(`[Firebase] Error loading from ${collectionName}/${docId}:`, error);
    isCloudConnected = false;
    cloudErrorCount++;
    notifyStatusListeners();
  }
  return null;
}

/**
 * Subscribe to live cloud changes using Firestore onSnapshot.
 * Triggers updates across all PCs sharing the exact same Firestore collection/document.
 */
export function subscribeToCloud(
  collectionName: string, 
  docId: string, 
  callback: (data: any, rawDoc?: any) => void
): () => void {
  const key = `${collectionName}/${docId}`;
  
  try {
    const docRef = doc(db, collectionName, docId);
    return onSnapshot(docRef, { includeMetadataChanges: true }, (docSnap) => {
      try {
        isCloudConnected = true;
        isFromCacheState = docSnap.metadata.fromCache;

        if (!docSnap.metadata.fromCache) {
          isSyncedWithServer = true;
          lastServerSyncTime = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        notifyStatusListeners();

        // Ignore local uncommitted write echoes to prevent UI feedback jitter
        if (docSnap.metadata.hasPendingWrites) {
          return;
        }

        if (docSnap.exists()) {
          const docData = docSnap.data();
          if (docData && docData.data !== undefined) {
            // Seed the deduplication cache with incoming cloud data so we don't save back what we just received
            const serialized = JSON.stringify(docData.data);
            lastSavedPayloads.set(key, serialized);
            callback(docData.data, docData);
          }
        }
      } catch (innerErr) {
        console.warn(`[Firebase] Error parsing snapshot data for ${collectionName}/${docId}:`, innerErr);
      }
    }, (error) => {
      console.warn(`[Firebase] Subscription error/paused for ${collectionName}/${docId}:`, error);
      isCloudConnected = false;
      cloudErrorCount++;
      notifyStatusListeners();
    });
  } catch (error) {
    console.error(`[Firebase] Failed to establish subscription for ${collectionName}/${docId}:`, error);
    isCloudConnected = false;
    cloudErrorCount++;
    notifyStatusListeners();
    return () => {};
  }
}

/**
 * Universal Backup Exporter: Collects all application keys from localStorage into a complete JSON backup object.
 */
export function generateFullBackupObject(): Record<string, any> {
  const backupKeys = [
    'lp_orders',
    'lp_deleted_orders',
    'lp_carriers',
    'lp_customers',
    'lp_novedades',
    'lp_reminders',
    'pedidos_empleados_products',
    'pedidos_empleados_orders',
    'pedidos_empleados_config',
    'citas_appointments',
    'citas_clients',
    'citas_archived',
    'liq_catalog',
    'liq_clientes',
    'liq_historial',
    'horas_extras_records',
    'horas_extras_workers',
    'horas_extras_config',
    'provisiones_saved_vouchers'
  ];

  const backupData: Record<string, any> = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    owner: 'soporteyabi@gmail.com',
    data: {}
  };

  backupKeys.forEach(key => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        backupData.data[key] = JSON.parse(raw);
      }
    } catch (e) {
      console.warn(`[Backup] Failed to parse key ${key}`, e);
    }
  });

  return backupData;
}

/**
 * Universal Backup Importer: Restores all application data into localStorage and triggers sync to Cloud Firestore.
 */
export async function restoreFullBackupObject(backupJson: any): Promise<{ success: boolean; itemCount: number; message: string }> {
  try {
    if (!backupJson || typeof backupJson !== 'object' || !backupJson.data) {
      return { success: false, itemCount: 0, message: 'El archivo JSON no tiene un formato de respaldo válido.' };
    }

    const dataObj = backupJson.data;
    let itemCount = 0;

    // Save each key to localStorage
    Object.keys(dataObj).forEach(key => {
      const val = dataObj[key];
      if (val !== undefined && val !== null) {
        localStorage.setItem(key, JSON.stringify(val));
        if (Array.isArray(val)) {
          itemCount += val.length;
        } else if (typeof val === 'object') {
          itemCount += Object.keys(val).length;
        } else {
          itemCount++;
        }
      }
    });

    // Cloud syncing mapping for restored data
    const syncMapping: Record<string, { col: string; doc: string }> = {
      lp_orders: { col: 'app_state', doc: 'orders' },
      lp_deleted_orders: { col: 'app_state', doc: 'deleted_orders' },
      lp_carriers: { col: 'app_state', doc: 'carriers' },
      lp_customers: { col: 'app_state', doc: 'customers' },
      lp_novedades: { col: 'app_state', doc: 'novedades' },
      lp_reminders: { col: 'app_state', doc: 'reminders' },
      pedidos_empleados_products: { col: 'pedidos_empleados_state', doc: 'products' },
      pedidos_empleados_orders: { col: 'pedidos_empleados_state', doc: 'orders' },
      citas_appointments: { col: 'citas_state', doc: 'appointments' },
      citas_clients: { col: 'citas_state', doc: 'clients' },
      citas_archived: { col: 'citas_state', doc: 'archived' },
      liq_catalog: { col: 'liq_state', doc: 'catalog' },
      liq_clientes: { col: 'liq_state', doc: 'clientes' },
      liq_historial: { col: 'liq_state', doc: 'historial' },
      horas_extras_records: { col: 'horas_extras_state', doc: 'records' },
      horas_extras_workers: { col: 'horas_extras_state', doc: 'workers' },
      provisiones_saved_vouchers: { col: 'provisiones_state', doc: 'saved_vouchers' }
    };

    // Best-effort write to cloud
    for (const [localKey, target] of Object.entries(syncMapping)) {
      if (dataObj[localKey] !== undefined) {
        saveToCloud(target.col, target.doc, dataObj[localKey]);
      }
    }

    return {
      success: true,
      itemCount,
      message: `Respaldo restaurado exitosamente. Se importaron ${itemCount} registros.`
    };
  } catch (error: any) {
    return {
      success: false,
      itemCount: 0,
      message: `Error al restaurar respaldo: ${error.message || error}`
    };
  }
}


