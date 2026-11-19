import {
  syncCloudKeyToSupabase,
  fetchCloudKeyFromSupabase,
  subscribeCloudKeyInSupabase,
  migrateNovedadesToSupabase,
  migrateProvisionesToSupabase
} from './services/supabaseSyncService';

export type CloudEngineMode = 'supabase_primary';

export function getCloudEngineMode(): CloudEngineMode {
  return 'supabase_primary';
}

export function setCloudEngineMode(_mode?: string) {
  notifyStatusListeners();
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
  return {
    connected: isCloudConnected,
    isSyncedWithServer,
    lastServerSyncTime,
    errorCount: cloudErrorCount,
    isFromCache: isFromCacheState,
    projectId: 'supabase-postgresql',
    databaseId: 'dwyofmibngjlqcvzahee',
    lastError: lastErrorMessage,
    engineMode: 'supabase_primary'
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
 * Recursively normalizes objects and arrays so no `undefined` values remain before JSON/Supabase serialization.
 */
export function sanitizeForFirestore<T = any>(val: T): any {
  if (val === undefined || val === null) return null;
  try {
    const jsonStr = JSON.stringify(val, (_key, v) => (v === undefined ? null : v));
    if (jsonStr === undefined) return null;
    return JSON.parse(jsonStr);
  } catch {
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
 * Save data exclusively to Supabase PostgreSQL with duplicate prevention and trailing rate limiting.
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
      return true;
    }

    // 2. Rate Limiting: Throttle to max 1 write per 300ms, scheduling a trailing write for rapid changes
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

    lastSavedPayloads.set(key, serialized);
    saveCooldowns.set(key, now);

    const supaOk = await syncCloudKeyToSupabase(collectionName, docId, cleanData, userEmail);
    if (collectionName === 'app_state' && docId === 'novedades' && Array.isArray(cleanData)) {
      migrateNovedadesToSupabase(cleanData).catch(() => {});
    } else if (collectionName === 'provisiones_state' && docId === 'saved_vouchers' && Array.isArray(cleanData)) {
      migrateProvisionesToSupabase(cleanData).catch(() => {});
    }

    if (supaOk) {
      isCloudConnected = true;
      isSyncedWithServer = true;
      isFromCacheState = false;
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
  } catch (error: any) {
    console.warn(`[SupabaseCloud] Error saving to ${collectionName}/${docId}:`, error);
    isCloudConnected = false;
    cloudErrorCount++;
    lastErrorMessage = error?.message || String(error);
    notifyStatusListeners();
    lastSavedPayloads.delete(key);
    return false;
  }
}

/**
 * Force a fresh read directly from Supabase PostgreSQL bypassing local caches.
 */
export async function forceRefreshFromCloud(collectionName: string, docId: string): Promise<any | null> {
  try {
    const supaData = await fetchCloudKeyFromSupabase(collectionName, docId);
    isCloudConnected = true;
    isSyncedWithServer = true;
    lastErrorMessage = null;
    lastServerSyncTime = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    isFromCacheState = false;
    notifyStatusListeners();
    return supaData;
  } catch (error: any) {
    console.warn(`[SupabaseCloud] Error refreshing ${collectionName}/${docId}:`, error);
    isCloudConnected = false;
    cloudErrorCount++;
    lastErrorMessage = error?.message || String(error);
    notifyStatusListeners();
    return null;
  }
}

/**
 * Load data once from Supabase PostgreSQL.
 */
export async function loadFromCloud(collectionName: string, docId: string): Promise<any | null> {
  try {
    const supaData = await fetchCloudKeyFromSupabase(collectionName, docId);
    isCloudConnected = true;
    lastErrorMessage = null;
    isFromCacheState = false;
    notifyStatusListeners();
    return supaData;
  } catch (error: any) {
    console.warn(`[SupabaseCloud] Error loading ${collectionName}/${docId}:`, error);
    isCloudConnected = false;
    cloudErrorCount++;
    lastErrorMessage = error?.message || String(error);
    notifyStatusListeners();
    return null;
  }
}

/**
 * Subscribe to live cloud changes exclusively via Supabase Realtime.
 */
export function subscribeToCloud(
  collectionName: string,
  docId: string,
  callback: (data: any, rawDoc?: any) => void
): () => void {
  const key = `${collectionName}/${docId}`;
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
    'provisiones_saved_vouchers',
    'erp_users_roster'
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
 * Universal Backup Importer: Restores all application data into localStorage and triggers sync to Supabase Cloud.
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
      provisiones_saved_vouchers: { col: 'provisiones_state', doc: 'saved_vouchers' },
      erp_users_roster: { col: 'app_state', doc: 'users_roster' }
    };

    // Write restored keys to Supabase PostgreSQL
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
