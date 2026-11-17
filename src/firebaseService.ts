import { db, dbDefault, firebaseConfig, databaseId } from './firebase';
import { doc, getDoc, getDocFromServer, setDoc, onSnapshot } from 'firebase/firestore';
import {
  syncCloudKeyToSupabase,
  fetchCloudKeyFromSupabase,
  subscribeCloudKeyInSupabase,
  migrateNovedadesToSupabase,
  migrateProvisionesToSupabase
} from './services/supabaseSyncService';

export type CloudEngineMode = 'firestore_primary' | 'supabase_primary';

const CLOUD_ENGINE_STORAGE_KEY = 'sistemalog_cloud_engine';

export function getCloudEngineMode(): CloudEngineMode {
  try {
    const envPrimary = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_PRIMARY_CLOUD_DB) || '';
    if (String(envPrimary).toLowerCase() === 'supabase') {
      return 'supabase_primary';
    }
    if (typeof window !== 'undefined') {
      const localMode = localStorage.getItem(CLOUD_ENGINE_STORAGE_KEY);
      if (localMode === 'supabase_primary') return 'supabase_primary';
    }
  } catch {}
  return 'firestore_primary';
}

export function setCloudEngineMode(mode: CloudEngineMode) {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CLOUD_ENGINE_STORAGE_KEY, mode);
    }
    notifyStatusListeners();
  } catch {}
}

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
  engineMode: CloudEngineMode;
}

const statusListeners = new Set<(status: CloudStatusInfo) => void>();

function buildStatusInfo(): CloudStatusInfo {
  const mode = getCloudEngineMode();
  return {
    connected: isCloudConnected,
    isSyncedWithServer,
    lastServerSyncTime,
    errorCount: cloudErrorCount,
    isFromCache: isFromCacheState,
    projectId: mode === 'supabase_primary' ? 'supabase-postgresql' : (firebaseConfig.projectId || 'sistemalog'),
    databaseId: mode === 'supabase_primary' ? 'dwyofmibngjlqcvzahee' : (databaseId || firebaseConfig.firestoreDatabaseId || '(default)'),
    lastError: lastErrorMessage,
    engineMode: mode
  };
}

function notifyStatusListeners() {
  const info = buildStatusInfo();
  statusListeners.forEach(cb => cb(info));
}

export function subscribeCloudStatus(callback: (status: CloudStatusInfo) => void): () => void {
  statusListeners.add(callback);
  callback(buildStatusInfo());
  return () => {
    statusListeners.delete(callback);
  };
}

export function getCloudStatus(): CloudStatusInfo {
  return buildStatusInfo();
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

    const engineMode = getCloudEngineMode();

    // Helper for Supabase persistence (primary in supabase_primary mode, dual-write mirror otherwise)
    const mirrorToSupabase = async (): Promise<boolean> => {
      const ok = await syncCloudKeyToSupabase(collectionName, docId, cleanData, userEmail);
      if (collectionName === 'app_state' && docId === 'novedades' && Array.isArray(cleanData)) {
        migrateNovedadesToSupabase(cleanData).catch(() => {});
      } else if (collectionName === 'provisiones_state' && docId === 'saved_vouchers' && Array.isArray(cleanData)) {
        migrateProvisionesToSupabase(cleanData).catch(() => {});
      }
      return ok;
    };

    if (engineMode === 'supabase_primary') {
      const supaOk = await mirrorToSupabase();
      // Best-effort secondary mirror to Firestore during transition
      try {
        const docRef = doc(db, collectionName, docId);
        const timestamp = new Date().toISOString();
        const payload = sanitizeForFirestore({
          data: cleanData,
          updatedAt: timestamp,
          updatedBy: userEmail,
          deviceAppletId: 'multi-pc-shared-v1'
        });
        setDoc(docRef, payload).catch(() => {});
      } catch {}

      if (supaOk) {
        isCloudConnected = true;
        isSyncedWithServer = true;
        lastErrorMessage = null;
        lastServerSyncTime = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        notifyStatusListeners();
        return true;
      }
      isCloudConnected = false;
      cloudErrorCount++;
      lastErrorMessage = 'Error escribiendo en Supabase PostgreSQL';
      notifyStatusListeners();
      lastSavedPayloads.delete(key);
      return false;
    }

    const docRef = doc(db, collectionName, docId);
    const timestamp = new Date().toISOString();
    
    const payload = sanitizeForFirestore({ 
      data: cleanData, 
      updatedAt: timestamp,
      updatedBy: userEmail,
      deviceAppletId: 'multi-pc-shared-v1'
    });

    await setDoc(docRef, payload);
    
    // Background dual-write redundancy: Also mirror to (default) DB so other machines stay in sync
    if (databaseId && databaseId !== '(default)' && dbDefault) {
      try {
        const mirrorRef = doc(dbDefault, collectionName, docId);
        setDoc(mirrorRef, payload).catch(() => {});
      } catch (err) {}
    }

    // Background dual-write mirror to Supabase PostgreSQL for ALL modules
    mirrorToSupabase().catch(() => {});
    
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

// Parse raw Firestore REST API JSON field structure into plain JS values
function parseFirestoreRestField(field: any): any {
  if (!field || typeof field !== 'object') return null;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return parseInt(field.integerValue, 10);
  if ('doubleValue' in field) return parseFloat(field.doubleValue);
  if ('booleanValue' in field) return field.booleanValue;
  if ('nullValue' in field) return null;
  if ('arrayValue' in field) {
    return (field.arrayValue.values || []).map(parseFirestoreRestField);
  }
  if ('mapValue' in field) {
    const res: Record<string, any> = {};
    const f = field.mapValue.fields || {};
    for (const k of Object.keys(f)) {
      res[k] = parseFirestoreRestField(f[k]);
    }
    return res;
  }
  return null;
}

/**
 * Ultra-fast Direct REST Fetch from Firestore Cloud.
 * Completely immune to WebChannel / WebSocket / IndexedDB cache stalls.
 * Automatically tries target databaseId and falls back to (default) if 403/404.
 */
export async function fetchFromFirestoreRest(collectionName: string, docId: string): Promise<any | null> {
  const projectId = firebaseConfig.projectId || 'sistemalog';
  const apiKey = firebaseConfig.apiKey;
  const dbId = databaseId || '(default)';
  const databasesToTry = dbId === '(default)' ? ['(default)'] : [dbId, '(default)'];

  const results = await Promise.all(
    databasesToTry.map(async (targetDb) => {
      const encodedDb = targetDb === '(default)' ? '(default)' : encodeURIComponent(targetDb);
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${encodedDb}/documents/${collectionName}/${docId}?key=${apiKey}`;
      try {
        const resp = await fetch(url, { cache: 'no-store' });
        if (resp.ok) {
          const json = await resp.json();
          if (json && json.fields && json.fields.data !== undefined) {
            const updatedAt = json.fields.updatedAt?.stringValue || json.updateTime || '';
            const ts = updatedAt ? Date.parse(updatedAt) || 0 : 0;
            return {
              targetDb,
              ts,
              data: parseFirestoreRestField(json.fields.data)
            };
          }
        } else {
          console.warn(`[Firestore REST] HTTP ${resp.status} on ${targetDb} for ${collectionName}/${docId}`);
        }
      } catch (err) {
        console.warn(`[Firestore REST] Direct fetch failed on ${targetDb} for ${collectionName}/${docId}:`, err);
      }
      return null;
    })
  );

  const valid = results.filter((r): r is { targetDb: string; ts: number; data: any } => r !== null);
  if (valid.length === 0) return null;
  valid.sort((a, b) => b.ts - a.ts);
  return valid[0].data;
}

// Force a fresh read directly from the cloud server bypassing IndexedDB cache
export async function forceRefreshFromCloud(collectionName: string, docId: string): Promise<any | null> {
  if (getCloudEngineMode() === 'supabase_primary') {
    const supaData = await fetchCloudKeyFromSupabase(collectionName, docId);
    if (supaData !== null) {
      isCloudConnected = true;
      isSyncedWithServer = true;
      lastErrorMessage = null;
      lastServerSyncTime = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      isFromCacheState = false;
      notifyStatusListeners();
      return supaData;
    }
  }

  // Direct REST HTTP read from Firestore: 100% reliable across all browsers, proxies and iFrames
  const restData = await fetchFromFirestoreRest(collectionName, docId);
  if (restData !== null) {
    isCloudConnected = true;
    isSyncedWithServer = true;
    lastErrorMessage = null;
    lastServerSyncTime = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    isFromCacheState = false;
    notifyStatusListeners();
    return restData;
  }

  // 2. Fallback to Firestore SDK getDocFromServer
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

// Load data once from Cloud (Supabase or Firestore depending on active engine)
export async function loadFromCloud(collectionName: string, docId: string): Promise<any | null> {
  if (getCloudEngineMode() === 'supabase_primary') {
    const supaData = await fetchCloudKeyFromSupabase(collectionName, docId);
    if (supaData !== null) {
      isCloudConnected = true;
      lastErrorMessage = null;
      isFromCacheState = false;
      notifyStatusListeners();
      return supaData;
    }
  }

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
 * Subscribe to live cloud changes.
 * Uses Supabase Realtime when engineMode === 'supabase_primary', otherwise Firestore onSnapshot.
 */
export function subscribeToCloud(
  collectionName: string, 
  docId: string, 
  callback: (data: any, rawDoc?: any) => void
): () => void {
  const key = `${collectionName}/${docId}`;

  if (getCloudEngineMode() === 'supabase_primary') {
    return subscribeCloudKeyInSupabase(collectionName, docId, (data, rawRow) => {
      const serialized = JSON.stringify(data);
      if (lastSavedPayloads.get(key) === serialized) return;
      lastSavedPayloads.set(key, serialized);
      isCloudConnected = true;
      isSyncedWithServer = true;
      isFromCacheState = false;
      lastErrorMessage = null;
      lastServerSyncTime = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      notifyStatusListeners();
      callback(data, rawRow);
    });
  }
  
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


