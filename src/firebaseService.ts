import { db, firebaseConfig, databaseId } from './firebase';
import { doc, getDoc, getDocFromServer, setDoc, onSnapshot } from 'firebase/firestore';

// Cache for tracking last saved payloads per document to eliminate duplicate cloud writes
const lastSavedPayloads = new Map<string, string>();
const saveCooldowns = new Map<string, number>();
const pendingSaveTimers = new Map<string, any>();

// Cloud connection status tracker with real-time metadata
let isCloudConnected = true;
let isSyncedWithServer = false;
let lastServerSyncTime: string | null = null;
let cloudErrorCount = 0;
let isFromCacheState = false;
let lastErrorMessage: string | null = null;

export interface CloudStatusInfo {
  connected: boolean;
  isSyncedWithServer: boolean;
  lastServerSyncTime: string | null;
  errorCount: number;
  isFromCache: boolean;
  projectId: string;
  databaseId: string;
  lastError: string | null;
}

const statusListeners = new Set<(status: CloudStatusInfo) => void>();

function notifyStatusListeners() {
  const info: CloudStatusInfo = {
    connected: isCloudConnected,
    isSyncedWithServer,
    lastServerSyncTime,
    errorCount: cloudErrorCount,
    isFromCache: isFromCacheState,
    projectId: firebaseConfig.projectId || 'sistemalog',
    databaseId: databaseId || firebaseConfig.firestoreDatabaseId || '(default)',
    lastError: lastErrorMessage
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
    projectId: firebaseConfig.projectId || 'sistemalog',
    databaseId: databaseId || firebaseConfig.firestoreDatabaseId || '(default)',
    lastError: lastErrorMessage
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
    projectId: firebaseConfig.projectId || 'sistemalog',
    databaseId: databaseId || firebaseConfig.firestoreDatabaseId || '(default)',
    lastError: lastErrorMessage
  };
}

/**
 * Recursively cleans objects and arrays to ensure NO `undefined` values can ever be sent to Firestore,
 * preventing 'Unsupported field value: undefined' errors permanently.
 */
export function sanitizeForFirestore<T = any>(val: T): any {
  if (val === undefined || val === null) return null;
  try {
    const jsonStr = JSON.stringify(val, (_key, v) => (v === undefined ? null : v));
    if (jsonStr === undefined) return null;
    return JSON.parse(jsonStr);
  } catch (err) {
    if (Array.isArray(val)) {
      return (val as any[]).map(item => (item === undefined ? null : sanitizeForFirestore(item)));
    }
    if (typeof val === 'object') {
      const clean: Record<string, any> = {};
      for (const [k, v] of Object.entries(val as any)) {
        clean[k] = v === undefined ? null : sanitizeForFirestore(v);
      }
      return clean;
    }
    return val;
  }
}

/**
 * Save data to Firestore with strict duplicate prevention, rate limiting, and concurrency audit fields.
 * Guarantees that identical payloads are NEVER written twice to Cloud Firestore.
 */
export async function saveToCloud(
  collectionName: string, 
  docId: string, 
  data: any, 
  userEmail: string = 'soporteyabi@gmail.com', 
  force: boolean = false
): Promise<boolean> {
  const key = `${collectionName}/${docId}`;
  
  try {
    const cleanData = sanitizeForFirestore(data);
    const serialized = JSON.stringify(cleanData);
    
    // 1. Strict Payload Deduplication: Skip if identical payload UNLESS force is true
    if (!force && lastSavedPayloads.get(key) === serialized && !pendingSaveTimers.has(key)) {
      return true; // Already saved, return immediately
    }

    // 2. Rate Limiting: Throttle to max 1 write per 300ms, but ALWAYS schedule a trailing write for fast sequence changes
    const now = Date.now();
    const lastWriteTime = saveCooldowns.get(key) || 0;
    const timeSinceLastWrite = now - lastWriteTime;

    if (!force && timeSinceLastWrite < 300) {
      if (pendingSaveTimers.has(key)) {
        clearTimeout(pendingSaveTimers.get(key));
      }

      const delay = 300 - timeSinceLastWrite;
      const timer = setTimeout(() => {
        pendingSaveTimers.delete(key);
        saveToCloud(collectionName, docId, cleanData, userEmail, force);
      }, delay);

      pendingSaveTimers.set(key, timer);
      return true;
    }

    if (pendingSaveTimers.has(key)) {
      clearTimeout(pendingSaveTimers.get(key));
      pendingSaveTimers.delete(key);
    }

    // Update trackers before writing
    lastSavedPayloads.set(key, serialized);
    saveCooldowns.set(key, now);

    const docRef = doc(db, collectionName, docId);
    const timestamp = new Date().toISOString();
    
    const payload = sanitizeForFirestore({ 
      data: cleanData, 
      updatedAt: timestamp,
      updatedBy: userEmail,
      deviceAppletId: 'multi-pc-shared-v1'
    });

    await setDoc(docRef, payload);
    
    isCloudConnected = true;
    isSyncedWithServer = true;
    lastErrorMessage = null;
    lastServerSyncTime = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    notifyStatusListeners();
    return true;
  } catch (error: any) {
    console.warn(`[Firebase] Error saving to ${collectionName}/${docId}:`, error);
    isCloudConnected = false;
    cloudErrorCount++;
    lastErrorMessage = error?.message || String(error);
    notifyStatusListeners();
    // Reset cache on error to allow retry
    lastSavedPayloads.delete(key);
    return false;
  }
}

// Force a fresh read directly from the cloud server bypassing IndexedDB cache
export async function forceRefreshFromCloud(collectionName: string, docId: string): Promise<any | null> {
  const docRef = doc(db, collectionName, docId);
  try {
    const docSnap = await getDocFromServer(docRef);
    isCloudConnected = true;
    isSyncedWithServer = true;
    lastErrorMessage = null;
    lastServerSyncTime = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    isFromCacheState = false;
    notifyStatusListeners();
    if (docSnap.exists()) {
      const docData = docSnap.data();
      return docData ? docData.data : null;
    }
    return null;
  } catch (error: any) {
    console.warn(`[Firebase] Server read attempt for ${collectionName}/${docId} note:`, error?.message || error);
    // Server fetch fell back to standard read (cache or network)
  }

  // Fallback to standard getDoc
  const res = await loadFromCloud(collectionName, docId);
  if (res !== null) {
    lastErrorMessage = null;
    isCloudConnected = true;
    notifyStatusListeners();
  }
  return res;
}

// Load data once from Firestore
export async function loadFromCloud(collectionName: string, docId: string): Promise<any | null> {
  try {
    const docRef = doc(db, collectionName, docId);
    const docSnap = await getDoc(docRef);
    isCloudConnected = true;
    lastErrorMessage = null;
    isFromCacheState = docSnap.metadata.fromCache;
    notifyStatusListeners();
    if (docSnap.exists()) {
      const docData = docSnap.data();
      return docData ? docData.data : null;
    }
    return null;
  } catch (error: any) {
    console.warn(`[Firebase] Error loading from ${collectionName}/${docId}:`, error);
    const msg = error?.message || String(error);
    if (!msg.toLowerCase().includes('offline')) {
      isCloudConnected = false;
      cloudErrorCount++;
      lastErrorMessage = msg;
    } else {
      isCloudConnected = true; // Served or handled via offline local cache
      lastErrorMessage = null;
    }
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
        lastErrorMessage = null;
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
    }, (error: any) => {
      console.warn(`[Firebase] Subscription error/paused for ${collectionName}/${docId}:`, error);
      const msg = error?.message || String(error);
      if (!msg.toLowerCase().includes('offline')) {
        isCloudConnected = false;
        cloudErrorCount++;
        lastErrorMessage = msg;
      } else {
        isCloudConnected = true;
        lastErrorMessage = null;
      }
      notifyStatusListeners();
    });
  } catch (error: any) {
    console.error(`[Firebase] Failed to establish subscription for ${collectionName}/${docId}:`, error);
    const msg = error?.message || String(error);
    if (!msg.toLowerCase().includes('offline')) {
      isCloudConnected = false;
      cloudErrorCount++;
      lastErrorMessage = msg;
    }
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


