import { db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

// Cache for tracking last saved payloads per document to eliminate duplicate cloud writes
const lastSavedPayloads = new Map<string, string>();
const saveCooldowns = new Map<string, number>();

// Cloud connection status tracker
let isCloudConnected = true;
let cloudErrorCount = 0;
const statusListeners = new Set<(status: { connected: boolean; errorCount: number }) => void>();

function setCloudStatus(connected: boolean) {
  isCloudConnected = connected;
  if (!connected) cloudErrorCount++;
  statusListeners.forEach(cb => cb({ connected: isCloudConnected, errorCount: cloudErrorCount }));
}

export function subscribeCloudStatus(callback: (status: { connected: boolean; errorCount: number }) => void): () => void {
  statusListeners.add(callback);
  callback({ connected: isCloudConnected, errorCount: cloudErrorCount });
  return () => {
    statusListeners.delete(callback);
  };
}

export function getCloudStatus() {
  return { connected: isCloudConnected, errorCount: cloudErrorCount };
}

/**
 * Save data to Firestore with strict duplicate prevention and rate limiting.
 * Guarantees that identical payloads are NEVER written twice to Cloud Firestore.
 */
export async function saveToCloud(collectionName: string, docId: string, data: any): Promise<boolean> {
  const key = `${collectionName}/${docId}`;
  
  try {
    const serialized = JSON.stringify(data);
    
    // 1. Strict Payload Deduplication: Skip if the data is identical to what was last saved
    if (lastSavedPayloads.get(key) === serialized) {
      return true; // Already saved, return immediately without performing a write
    }

    // 2. Rate Limiting: Prevent more than 1 write per 500ms for the exact same document path
    const now = Date.now();
    const lastWriteTime = saveCooldowns.get(key) || 0;
    if (now - lastWriteTime < 500) {
      // Cooldown active - update cache to latest, but skip redundant rapid write
      lastSavedPayloads.set(key, serialized);
      return true;
    }

    // Update trackers before writing
    lastSavedPayloads.set(key, serialized);
    saveCooldowns.set(key, now);

    const docRef = doc(db, collectionName, docId);
    await setDoc(docRef, { 
      data, 
      updatedAt: new Date().toISOString() 
    });
    setCloudStatus(true);
    return true;
  } catch (error) {
    console.warn(`[Firebase] Error saving to ${collectionName}/${docId}:`, error);
    setCloudStatus(false);
    // Reset cache on error to allow retry
    lastSavedPayloads.delete(key);
    return false;
  }
}

// Load data once from Firestore
export async function loadFromCloud(collectionName: string, docId: string): Promise<any | null> {
  try {
    const docRef = doc(db, collectionName, docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const docData = docSnap.data();
      setCloudStatus(true);
      return docData ? docData.data : null;
    }
  } catch (error) {
    console.warn(`[Firebase] Error loading from ${collectionName}/${docId}:`, error);
    setCloudStatus(false);
  }
  return null;
}

/**
 * Subscribe to live cloud changes.
 * Filters out local write echoes (hasPendingWrites) to prevent feedback loops.
 * Protects local state from being wiped on network or quota errors.
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
        setCloudStatus(true);
        // Ignore local uncommitted writes to prevent ping-pong state updates
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
      setCloudStatus(false);
      // DO NOT call callback(null) on subscription error!
      // Keeping local state intact guarantees that the app keeps functioning 100% offline or when quota is exceeded.
    });
  } catch (error) {
    console.error(`[Firebase] Failed to establish subscription for ${collectionName}/${docId}:`, error);
    setCloudStatus(false);
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


