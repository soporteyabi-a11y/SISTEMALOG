/**
 * Supabase Migration, Real-Time & Unified Cloud Engine for SISTEMALOG
 * Supports 100% of modules: Fletes/Despacho, Clientes, Transportadoras, Novedades,
 * Provisiones, Horas Extras (y cortes), Pedidos de Empleados, Citas, Liquidador y Colas/Logs.
 */

import { supabase } from '../supabaseConfig';
import { firebaseConfig, databaseId } from '../firebase';
import { Order, Customer, Carrier, Novedad } from '../types';

export const SUPABASE_TABLES = [
  'fletes_solicitudes',
  'clientes',
  'transportadoras',
  'novedades',
  'provisiones_vouchers',
  'app_sync_state',
  'horas_extras_records',
  'horas_extras_workers',
  'horas_extras_cortes',
  'pedidos_empleados_orders',
  'pedidos_empleados_products',
  'citas_appointments',
  'citas_clients',
  'liq_catalog',
  'liq_clientes',
  'liq_historial',
  'sync_queue_events',
  'sync_audit_logs'
] as const;

export const SUPABASE_RLS_UNLOCK_SQL = `ALTER TABLE IF EXISTS public.fletes_solicitudes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transportadoras DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.novedades DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.provisiones_vouchers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_sync_state DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.horas_extras_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.horas_extras_workers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.horas_extras_cortes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pedidos_empleados_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pedidos_empleados_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.citas_appointments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.citas_clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.liq_catalog DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.liq_clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.liq_historial DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_queue_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sync_audit_logs DISABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
NOTIFY pgrst, 'reload schema';`;

export const SUPABASE_SCHEMA_SQL = `/* SCRIPT SQL COMPLETO v2.0 - MIGRACION TOTAL SISTEMALOG A SUPABASE */

/* 1. FLETES Y DESPACHOS */
CREATE TABLE IF NOT EXISTS public.fletes_solicitudes (
  id VARCHAR(64) PRIMARY KEY,
  pv VARCHAR(64) NOT NULL,
  cliente VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS oc VARCHAR(64);
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS factura VARCHAR(64);
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS ciudad VARCHAR(128);
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS origen VARCHAR(128) DEFAULT 'ACOPI-YUMBO';
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS peso NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS cajas INTEGER DEFAULT 0;
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS venta NUMERIC(14, 2) DEFAULT 0;
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS flete NUMERIC(14, 2) DEFAULT 0;
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS facturado NUMERIC(14, 2) DEFAULT 0;
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS cajas_fact INTEGER DEFAULT 0;
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS peso_fact NUMERIC(12, 2) DEFAULT 0;
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS provision VARCHAR(64);
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS transportadora VARCHAR(255);
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS placa VARCHAR(32);
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS conductor VARCHAR(255);
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS celular VARCHAR(64);
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS estado VARCHAR(32) DEFAULT 'Pendiente';
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS fecha_ingreso VARCHAR(32);
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS fecha_salida VARCHAR(32);
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS fecha_entrega VARCHAR(32);
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS fecha_factura VARCHAR(32);
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS hora_cita VARCHAR(32);
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS obs TEXT;
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS observaciones TEXT;
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS anulado_motivo TEXT;
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS sync_version INTEGER DEFAULT 1;
ALTER TABLE public.fletes_solicitudes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

/* 2. CLIENTES MAESTROS */
CREATE TABLE IF NOT EXISTS public.clientes (
  id VARCHAR(64) PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  ciudad VARCHAR(128),
  nit VARCHAR(64),
  contacto VARCHAR(255),
  telefono VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

/* 3. TRANSPORTADORAS */
CREATE TABLE IF NOT EXISTS public.transportadoras (
  id VARCHAR(64) PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  contacto VARCHAR(255),
  telefono VARCHAR(64),
  tarifa_base NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

/* 4. NOVEDADES OPERATIVAS */
CREATE TABLE IF NOT EXISTS public.novedades (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64),
  pv VARCHAR(64),
  tipo VARCHAR(64),
  descripcion TEXT,
  fecha TIMESTAMPTZ DEFAULT NOW(),
  estado VARCHAR(32) DEFAULT 'Abierta',
  solucion TEXT,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.novedades ADD COLUMN IF NOT EXISTS data JSONB;

/* 5. PROVISIONES Y COMPROBANTES */
CREATE TABLE IF NOT EXISTS public.provisiones_vouchers (
  id VARCHAR(128) PRIMARY KEY,
  order_id VARCHAR(64),
  pv VARCHAR(64),
  soporte_num VARCHAR(64),
  transportadora VARCHAR(255),
  mes_gestion VARCHAR(32),
  quincena VARCHAR(32),
  flete_total NUMERIC(14, 2) DEFAULT 0,
  otros_gastos NUMERIC(14, 2) DEFAULT 0,
  otros_gastos_concepto TEXT,
  estado VARCHAR(32) DEFAULT 'Procesado',
  fecha_guardado TIMESTAMPTZ,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.provisiones_vouchers ADD COLUMN IF NOT EXISTS data JSONB;

/* 6. ESTADO SINCRONIZADO EN TIEMPO REAL */
CREATE TABLE IF NOT EXISTS public.app_sync_state (
  key VARCHAR(128) PRIMARY KEY,
  data JSONB NOT NULL,
  updated_by VARCHAR(255),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.app_sync_state ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255);

/* 7. HORAS EXTRAS */
CREATE TABLE IF NOT EXISTS public.horas_extras_records (
  id BIGINT PRIMARY KEY,
  nom VARCHAR(255),
  car VARCHAR(128),
  are VARCHAR(128),
  fec VARCHAR(32),
  hora_entrada VARCHAR(16),
  hora_salida VARCHAR(16),
  horas_totales NUMERIC(8, 3) DEFAULT 0,
  base NUMERIC(8, 3) DEFAULT 0,
  extra_ord NUMERIC(8, 3) DEFAULT 0,
  extra_total NUMERIC(8, 3) DEFAULT 0,
  netas NUMERIC(8, 3) DEFAULT 0,
  ext_diurna NUMERIC(8, 3) DEFAULT 0,
  ext_nocturna NUMERIC(8, 3) DEFAULT 0,
  rec_noct NUMERIC(8, 3) DEFAULT 0,
  dom_fest NUMERIC(8, 3) DEFAULT 0,
  comp NUMERIC(8, 3) DEFAULT 0,
  tipo VARCHAR(32),
  jorn VARCHAR(32),
  mot TEXT,
  pagado BOOLEAN DEFAULT FALSE,
  fecha_pago VARCHAR(32),
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.horas_extras_workers (
  id BIGINT PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  car VARCHAR(128),
  are VARCHAR(128),
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.horas_extras_cortes (
  id VARCHAR(128) PRIMARY KEY,
  periodo_id VARCHAR(64),
  generado_en TIMESTAMPTZ,
  generado_por VARCHAR(255),
  snapshot JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

/* 8. PORTAL PEDIDOS DE EMPLEADOS */
CREATE TABLE IF NOT EXISTS public.pedidos_empleados_orders (
  id VARCHAR(128) PRIMARY KEY,
  employee VARCHAR(255),
  cedula VARCHAR(64),
  date_str VARCHAR(64),
  subtotal NUMERIC(14, 2) DEFAULT 0,
  iva NUMERIC(14, 2) DEFAULT 0,
  total NUMERIC(14, 2) DEFAULT 0,
  items JSONB,
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pedidos_empleados_products (
  id VARCHAR(128) PRIMARY KEY,
  code VARCHAR(64),
  name VARCHAR(255),
  price NUMERIC(14, 2) DEFAULT 0,
  category VARCHAR(128),
  image TEXT,
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

/* 9. CITAS Y AGENDAMIENTO */
CREATE TABLE IF NOT EXISTS public.citas_appointments (
  id VARCHAR(128) PRIMARY KEY,
  cliente VARCHAR(255),
  fecha VARCHAR(32),
  hora VARCHAR(32),
  estado VARCHAR(64),
  is_archived BOOLEAN DEFAULT FALSE,
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.citas_clients (
  id VARCHAR(128) PRIMARY KEY,
  nombre VARCHAR(255),
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

/* 10. LIQUIDADOR */
CREATE TABLE IF NOT EXISTS public.liq_catalog (
  id VARCHAR(128) PRIMARY KEY,
  codigo VARCHAR(64),
  descripcion TEXT,
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.liq_clientes (
  id VARCHAR(128) PRIMARY KEY,
  nombre VARCHAR(255),
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.liq_historial (
  id VARCHAR(128) PRIMARY KEY,
  data JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

/* 11. COLAS Y LOGS DE AUDITORIA */
CREATE TABLE IF NOT EXISTS public.sync_queue_events (
  id VARCHAR(128) PRIMARY KEY,
  idempotency_key VARCHAR(255),
  event_type VARCHAR(64),
  source_module VARCHAR(64),
  target_module VARCHAR(64),
  record_id VARCHAR(128),
  status VARCHAR(32),
  attempts INTEGER DEFAULT 0,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sync_audit_logs (
  id VARCHAR(128) PRIMARY KEY,
  event_id VARCHAR(128),
  record_id VARCHAR(128),
  event_type VARCHAR(64),
  source_module VARCHAR(64),
  target_module VARCHAR(64),
  status VARCHAR(32),
  message TEXT,
  details JSONB,
  timestamp_iso TIMESTAMPTZ DEFAULT NOW()
);

/* 12. DESACTIVAR RLS EN TODAS LAS TABLAS */
ALTER TABLE public.fletes_solicitudes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transportadoras DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.novedades DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.provisiones_vouchers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_sync_state DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.horas_extras_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.horas_extras_workers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.horas_extras_cortes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_empleados_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_empleados_products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas_appointments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas_clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.liq_catalog DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.liq_clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.liq_historial DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_queue_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_audit_logs DISABLE ROW LEVEL SECURITY;

/* 13. ACTIVAR REALTIME MULTI-PC */
ALTER TABLE public.app_sync_state REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.app_sync_state;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.fletes_solicitudes;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

/* 14. PERMISOS COMPLETOS API Y RECARGA */
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
`;

// Map application Order to Supabase fletes_solicitudes schema
export function mapOrderToSupabase(o: Order) {
  return {
    id: o.id,
    pv: o.pv || '',
    oc: o.oc || null,
    factura: o.factura || null,
    cliente: o.cliente || 'CLIENTE NO DEFINIDO',
    ciudad: o.ciudad || null,
    origen: o.origen || 'ACOPI-YUMBO',
    peso: Number(o.peso) || 0,
    cajas: Math.round(Number(o.cajas) || 0),
    venta: Number(o.venta) || 0,
    flete: Number(o.flete) || 0,
    facturado: Number(o.facturado) || 0,
    cajas_fact: Math.round(Number(o.cajasFact) || 0),
    peso_fact: Number(o.pesoFact) || 0,
    provision: o.provision || null,
    transportadora: o.transportadora || null,
    placa: o.placa || null,
    conductor: o.conductor || null,
    celular: o.celular || null,
    estado: o.estado || 'Pendiente',
    fecha_ingreso: o.fechaIngreso || null,
    fecha_salida: o.fechaSalida || null,
    fecha_entrega: o.fechaEntrega || null,
    fecha_factura: o.fechaFactura || null,
    hora_cita: o.horaCita || null,
    obs: o.obs || null,
    anulado_motivo: o.anuladoMotivo || null,
    updated_at: new Date().toISOString()
  };
}

/**
 * Checks if all Supabase tables (core + extended) are created and operational
 */
export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  tablesReady: boolean;
  coreReady: boolean;
  fullSchemaReady: boolean;
  existingTables: string[];
  missingTables: string[];
  appSyncKeysCount: number;
  error?: string;
}> {
  const coreTables = ['fletes_solicitudes', 'clientes', 'transportadoras', 'provisiones_vouchers', 'app_sync_state'];
  const existingTables: string[] = [];
  const missingTables: string[] = [];
  let appSyncKeysCount = 0;

  try {
    const checks = await Promise.all(
      SUPABASE_TABLES.map(async (tbl) => {
        const { error, count } = await supabase.from(tbl).select('count', { count: 'exact', head: true });
        return { tbl, error, count };
      })
    );

    for (const { tbl, error, count } of checks) {
      if (error && (error.code === 'PGRST205' || error.message?.includes('does not exist'))) {
        missingTables.push(tbl);
      } else if (!error || error.code === 'PGRST116') {
        existingTables.push(tbl);
        if (tbl === 'app_sync_state' && typeof count === 'number') {
          appSyncKeysCount = count;
        }
      } else {
        missingTables.push(tbl);
      }
    }

    const coreReady = coreTables.every(t => existingTables.includes(t));
    const fullSchemaReady = missingTables.length === 0;

    return {
      connected: true,
      tablesReady: coreReady,
      coreReady,
      fullSchemaReady,
      existingTables,
      missingTables,
      appSyncKeysCount
    };
  } catch (err: any) {
    return {
      connected: false,
      tablesReady: false,
      coreReady: false,
      fullSchemaReady: false,
      existingTables,
      missingTables: [...SUPABASE_TABLES],
      appSyncKeysCount: 0,
      error: err?.message || String(err)
    };
  }
}

/**
 * Unified Cloud Key Writer: Persists any module state (collectionName/docId) into Supabase app_sync_state.
 */
export async function syncCloudKeyToSupabase(
  collectionName: string,
  docId: string,
  data: any,
  userEmail: string = 'soporteyabi@gmail.com'
): Promise<boolean> {
  const key = `${collectionName}/${docId}`;
  try {
    const { error } = await supabase
      .from('app_sync_state')
      .upsert({
        key,
        data,
        updated_by: userEmail,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    if (error) {
      // Fallback if updated_by column isn't added yet (v1 schema compatibility)
      if (error.message?.includes('updated_by')) {
        const retry = await supabase
          .from('app_sync_state')
          .upsert({ key, data, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        return !retry.error;
      }
      if (error.code !== 'PGRST205') {
        console.warn(`[Supabase Sync] Error syncing ${key}:`, error.message);
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Unified Cloud Key Reader: Reads any module state from Supabase app_sync_state.
 */
export async function fetchCloudKeyFromSupabase(collectionName: string, docId: string): Promise<any | null> {
  const key = `${collectionName}/${docId}`;
  try {
    const { data, error } = await supabase
      .from('app_sync_state')
      .select('data')
      .eq('key', key)
      .maybeSingle();

    if (error || !data) return null;
    return data.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Unified Realtime Subscriber: Listens for live postgres_changes on app_sync_state for a specific key.
 */
export function subscribeCloudKeyInSupabase(
  collectionName: string,
  docId: string,
  callback: (data: any, rawRow?: any) => void
): () => void {
  const key = `${collectionName}/${docId}`;
  const safeChannelName = `realtime_${collectionName}_${docId}`.replace(/[^a-zA-Z0-9_]/g, '_');

  // Initial immediate fetch to hydrate UI
  fetchCloudKeyFromSupabase(collectionName, docId).then((initialData) => {
    if (initialData !== null && initialData !== undefined) {
      callback(initialData);
    }
  }).catch(() => {});

  const channel = supabase
    .channel(safeChannelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'app_sync_state',
        filter: `key=eq.${key}`
      },
      (payload: any) => {
        const row = payload?.new;
        if (row && row.data !== undefined) {
          callback(row.data, row);
        }
      }
    )
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {}
  };
}

/**
 * Dual-Write Hook: Syncs a single Order to Supabase in background
 */
export async function syncOrderToSupabase(order: Order): Promise<boolean> {
  try {
    const payload = mapOrderToSupabase(order);
    const { error } = await supabase
      .from('fletes_solicitudes')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      if (error.code !== 'PGRST205') {
        console.warn('[Supabase Dual-Write] Error syncing order:', error.message);
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Dual-Write Hook: Syncs full state collection snapshot to app_sync_state table
 */
export async function syncStateToSupabase(key: string, data: any): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('app_sync_state')
      .upsert({
        key,
        data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    if (error) {
      if (error.code !== 'PGRST205') {
        console.warn(`[Supabase Dual-Write] Error syncing state ${key}:`, error.message);
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Batch Migrator: Migrates entire historical orders dataset to Supabase in batches of 50
 */
export async function migrateAllOrdersToSupabase(
  orders: Order[],
  onProgress?: (migratedCount: number, total: number) => void
): Promise<{ success: boolean; migrated: number; total: number; error?: string }> {
  if (!orders || orders.length === 0) {
    return { success: true, migrated: 0, total: 0 };
  }

  const BATCH_SIZE = 50;
  let totalMigrated = 0;

  try {
    for (let i = 0; i < orders.length; i += BATCH_SIZE) {
      const batch = orders.slice(i, i + BATCH_SIZE);
      const mapped = batch.map(mapOrderToSupabase);

      const { error } = await supabase
        .from('fletes_solicitudes')
        .upsert(mapped, { onConflict: 'id' });

      if (error) {
        throw new Error(`Fallo en lote ${i / BATCH_SIZE + 1}: ${error.message}`);
      }

      totalMigrated += batch.length;
      if (onProgress) {
        onProgress(totalMigrated, orders.length);
      }
    }

    await syncCloudKeyToSupabase('app_state', 'orders', orders);
    await syncStateToSupabase('orders_master_backup', orders);

    return {
      success: true,
      migrated: totalMigrated,
      total: orders.length
    };
  } catch (err: any) {
    return {
      success: false,
      migrated: totalMigrated,
      total: orders.length,
      error: err?.message || String(err)
    };
  }
}

/**
 * Batch Migrates Customers to Supabase
 */
export async function migrateCustomersToSupabase(customers: Customer[]): Promise<boolean> {
  try {
    if (!customers || customers.length === 0) return true;
    const uniqueMap = new Map<string, any>();
    for (const c of customers) {
      const normName = String(c.nombre || '').trim().toUpperCase();
      if (!uniqueMap.has(normName)) {
        uniqueMap.set(normName, {
          id: c.id,
          nombre: c.nombre,
          ciudad: c.ciudad || null,
          nit: c.nit || null,
          contacto: c.contacto || null,
          telefono: (c as any).celular || (c as any).telefono || null
        });
      }
    }
    const mapped = Array.from(uniqueMap.values());

    const { error } = await supabase.from('clientes').upsert(mapped, { onConflict: 'id' });
    if (error && error.code !== 'PGRST205') {
      console.warn('[Supabase] Error migrating customers:', error.message);
    }
    await syncCloudKeyToSupabase('app_state', 'customers', customers);
    await syncStateToSupabase('customers_master_backup', customers);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Batch Migrates Carriers to Supabase
 */
export async function migrateCarriersToSupabase(carriers: Carrier[]): Promise<boolean> {
  try {
    if (!carriers || carriers.length === 0) return true;
    const mapped = carriers.map(c => ({
      id: c.id,
      nombre: c.nombre,
      contacto: c.contacto || null,
      telefono: (c as any).tel || (c as any).telefono || null,
      tarifa_base: Number((c as any).costoSugerido || (c as any).tarifaBase || 0)
    }));

    const { error } = await supabase.from('transportadoras').upsert(mapped, { onConflict: 'id' });
    await syncCloudKeyToSupabase('app_state', 'carriers', carriers);
    await syncStateToSupabase('carriers_master_backup', carriers);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Batch Migrates Novedades to Supabase
 */
export async function migrateNovedadesToSupabase(novedades: Novedad[]): Promise<boolean> {
  try {
    await syncCloudKeyToSupabase('app_state', 'novedades', novedades || []);
    if (!novedades || novedades.length === 0) return true;
    const mapped = novedades.map((n: any) => ({
      id: String(n.id || `NOV-${Date.now()}`),
      order_id: n.orderId || n.solicitudId || null,
      pv: n.pv || null,
      tipo: n.tipo || n.categoria || 'General',
      descripcion: n.descripcion || '',
      estado: n.estado || 'Abierta',
      solucion: n.solucion || null,
      data: n
    }));
    const { error } = await supabase.from('novedades').upsert(mapped, { onConflict: 'id' });
    if (error) throw new Error(error.message);
    return true;
  } catch {
    return false;
  }
}

/**
 * Batch Migrates Provisiones Vouchers + Sync States to Supabase
 */
export async function migrateProvisionesToSupabase(
  vouchers: any[],
  provSyncDocs?: Record<string, any>
): Promise<{ count: number; ok: boolean; error?: string }> {
  try {
    const syncOk = await syncCloudKeyToSupabase('provisiones_state', 'saved_vouchers', vouchers || []);
    if (!syncOk) throw new Error('No se pudo escribir en app_sync_state (revisa SQL v2.0 / RLS)');
    if (Array.isArray(vouchers) && vouchers.length > 0) {
      const mapped = vouchers.map((v: any) => {
        const ordersArr = Array.isArray(v.orders) ? v.orders : [];
        const sumFlete = ordersArr.reduce((acc: number, o: any) => acc + (Number(o.flete) || 0), 0);
        return {
          id: String(v.id || `PROV-${Date.now()}`),
          order_id: ordersArr[0]?.id || null,
          pv: ordersArr[0]?.pv || null,
          soporte_num: v.soporteNum || v.numeroSoporte || null,
          transportadora: v.transportadora || null,
          mes_gestion: v.mesGestion || null,
          quincena: v.quincena ? String(v.quincena) : null,
          flete_total: Number(v.fleteTotal || sumFlete) || 0,
          otros_gastos: Number(v.otrosGastos) || 0,
          otros_gastos_concepto: v.otrosGastosConcepto || null,
          estado: v.estado || 'Procesado',
          fecha_guardado: v.fechaGuardado || v.createdAt || new Date().toISOString(),
          data: v
        };
      });
      for (let i = 0; i < mapped.length; i += 50) {
        const { error } = await supabase.from('provisiones_vouchers').upsert(mapped.slice(i, i + 50), { onConflict: 'id' });
        if (error) throw new Error(error.message);
      }
    }
    if (provSyncDocs && Object.keys(provSyncDocs).length > 0) {
      await syncCloudKeyToSupabase('provisiones_state', 'sync_docs_archive', provSyncDocs);
    }
    return { count: Array.isArray(vouchers) ? vouchers.length : 0, ok: true };
  } catch (err: any) {
    return { count: 0, ok: false, error: err?.message || String(err) };
  }
}

/**
 * Batch Migrates Horas Extras (records, workers, config, cortes_*) to Supabase
 */
export async function migrateHorasExtrasToSupabase(payload: {
  records: any[];
  workers: any[];
  config?: any;
  cortes?: Record<string, any>;
}): Promise<{ recordsCount: number; workersCount: number; cortesCount: number; ok: boolean; error?: string }> {
  try {
    const { records = [], workers = [], config, cortes = {} } = payload;

    const r1 = await syncCloudKeyToSupabase('horas_extras_state', 'records', records);
    const r2 = await syncCloudKeyToSupabase('horas_extras_state', 'workers', workers);
    if (!r1 || !r2) throw new Error('Error sincronizando app_sync_state de Horas Extras');
    if (config) {
      await syncCloudKeyToSupabase('horas_extras_state', 'config', config);
    }

    if (records.length > 0) {
      const mappedRecs = records.map((r: any, idx: number) => ({
        id: Number(r.id) || (idx + 1),
        nom: r.nom || '',
        car: r.car || '',
        are: r.are || '',
        fec: r.fec || '',
        hora_entrada: r._ent || '',
        hora_salida: r._sal || '',
        horas_totales: Number(r.hT) || 0,
        base: Number(r.base) || 0,
        extra_ord: Number(r.extraOrd) || 0,
        extra_total: Number(r.extraTotal) || 0,
        netas: Number(r.netas) || 0,
        ext_diurna: Number(r.extDiurna) || 0,
        ext_nocturna: Number(r.extNocturna) || 0,
        rec_noct: Number(r.recNoct) || 0,
        dom_fest: Number(r.domFest) || 0,
        comp: Number(r.comp) || 0,
        tipo: r.tipo || '',
        jorn: r.jorn || '',
        mot: r.mot || '',
        pagado: Boolean(r.pagado),
        fecha_pago: r.fechaPago || null,
        data: r,
        updated_at: new Date().toISOString()
      }));
      for (let i = 0; i < mappedRecs.length; i += 50) {
        const { error } = await supabase.from('horas_extras_records').upsert(mappedRecs.slice(i, i + 50), { onConflict: 'id' });
        if (error) throw new Error(error.message);
      }
    }

    if (workers.length > 0) {
      const mappedWorkers = workers.map((w: any, idx: number) => ({
        id: Number(w.id) || (idx + 1),
        nom: w.nom || '',
        car: w.car || '',
        are: w.are || '',
        data: w,
        updated_at: new Date().toISOString()
      }));
      const { error } = await supabase.from('horas_extras_workers').upsert(mappedWorkers, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }

    const corteKeys = Object.keys(cortes);
    if (corteKeys.length > 0) {
      const mappedCortes: any[] = [];
      for (const cKey of corteKeys) {
        const cData = cortes[cKey];
        await syncCloudKeyToSupabase('horas_extras_state', cKey, cData);
        mappedCortes.push({
          id: cKey,
          periodo_id: cData?.periodoId || cKey.replace('cortes_', ''),
          generado_en: cData?.generadoEn || null,
          generado_por: cData?.generadoPor || null,
          snapshot: cData?.snapshot || cData || {},
          updated_at: new Date().toISOString()
        });
      }
      const { error } = await supabase.from('horas_extras_cortes').upsert(mappedCortes, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }

    return {
      recordsCount: records.length,
      workersCount: workers.length,
      cortesCount: corteKeys.length,
      ok: true
    };
  } catch (err: any) {
    return { recordsCount: 0, workersCount: 0, cortesCount: 0, ok: false, error: err?.message || String(err) };
  }
}

/**
 * Batch Migrates Pedidos de Empleados (orders, products, config) to Supabase
 */
export async function migratePedidosEmpleadosToSupabase(payload: {
  orders: any[];
  products: any[];
  config?: any;
}): Promise<{ ordersCount: number; productsCount: number; ok: boolean; error?: string }> {
  try {
    const { orders = [], products = [], config } = payload;

    const p1 = await syncCloudKeyToSupabase('pedidos_empleados_state', 'orders', orders);
    const p2 = await syncCloudKeyToSupabase('pedidos_empleados_state', 'products', products);
    if (!p1 || !p2) throw new Error('Error sincronizando app_sync_state de Pedidos');
    if (config) {
      await syncCloudKeyToSupabase('pedidos_empleados_state', 'config', config);
    }

    if (orders.length > 0) {
      const mappedOrders = orders.map((o: any, idx: number) => ({
        id: String(o.id || `EMP-${idx + 1}`),
        employee: o.employee || o.nombreEmpleado || '',
        cedula: o.cedula || '',
        date_str: o.date || o.fecha || '',
        subtotal: Number(o.subtotal) || 0,
        iva: Number(o.iva) || 0,
        total: Number(o.total) || 0,
        items: Array.isArray(o.items) ? o.items : [],
        data: o,
        updated_at: new Date().toISOString()
      }));
      for (let i = 0; i < mappedOrders.length; i += 20) {
        const { error } = await supabase.from('pedidos_empleados_orders').upsert(mappedOrders.slice(i, i + 20), { onConflict: 'id' });
        if (error) throw new Error(error.message);
      }
    }

    if (products.length > 0) {
      const mappedProds = products.map((p: any, idx: number) => ({
        id: String(p.id || `PROD-${idx + 1}`),
        code: p.code || '',
        name: p.name || '',
        price: Number(p.price) || 0,
        category: p.category || '',
        image: p.image || '',
        data: p,
        updated_at: new Date().toISOString()
      }));
      for (let i = 0; i < mappedProds.length; i += 25) {
        const { error } = await supabase.from('pedidos_empleados_products').upsert(mappedProds.slice(i, i + 25), { onConflict: 'id' });
        if (error) throw new Error(error.message);
      }
    }

    return { ordersCount: orders.length, productsCount: products.length, ok: true };
  } catch (err: any) {
    return { ordersCount: 0, productsCount: 0, ok: false, error: err?.message || String(err) };
  }
}

/**
 * Batch Migrates Citas y Agendamiento (appointments, archived, clients) to Supabase
 */
export async function migrateCitasToSupabase(payload: {
  appointments: any[];
  archived: any[];
  clients: any[];
}): Promise<{ appointmentsCount: number; archivedCount: number; clientsCount: number; ok: boolean; error?: string }> {
  try {
    const { appointments = [], archived = [], clients = [] } = payload;

    const c1 = await syncCloudKeyToSupabase('citas_state', 'appointments', appointments);
    const c2 = await syncCloudKeyToSupabase('citas_state', 'archived', archived);
    const c3 = await syncCloudKeyToSupabase('citas_state', 'clients', clients);
    if (!c1 || !c2 || !c3) throw new Error('Error sincronizando app_sync_state de Citas');

    const combined = [
      ...appointments.map((a: any, idx: number) => ({
        id: String(a.id || `APT-${idx + 1}`),
        cliente: a.cliente || a.clientName || '',
        fecha: a.fecha || a.date || '',
        hora: a.hora || a.time || '',
        estado: a.estado || a.status || 'Programada',
        is_archived: false,
        data: a,
        updated_at: new Date().toISOString()
      })),
      ...archived.map((a: any, idx: number) => ({
        id: String(a.id || `ARCH-${idx + 1}`),
        cliente: a.cliente || a.clientName || '',
        fecha: a.fecha || a.date || '',
        hora: a.hora || a.time || '',
        estado: a.estado || a.status || 'Archivada',
        is_archived: true,
        data: a,
        updated_at: new Date().toISOString()
      }))
    ];

    if (combined.length > 0) {
      const { error } = await supabase.from('citas_appointments').upsert(combined, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }

    if (clients.length > 0) {
      const mappedClients = clients.map((c: any, idx: number) => ({
        id: String(c.id || c.name || `CCLI-${idx + 1}`),
        nombre: c.nombre || c.name || '',
        data: c,
        updated_at: new Date().toISOString()
      }));
      const { error } = await supabase.from('citas_clients').upsert(mappedClients, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }

    return {
      appointmentsCount: appointments.length,
      archivedCount: archived.length,
      clientsCount: clients.length,
      ok: true
    };
  } catch (err: any) {
    return { appointmentsCount: 0, archivedCount: 0, clientsCount: 0, ok: false, error: err?.message || String(err) };
  }
}

/**
 * Batch Migrates Liquidador (catalog, clientes, historial) to Supabase
 */
export async function migrateLiquidadorToSupabase(payload: {
  catalog: any[];
  clientes: any;
  historial: any[];
}): Promise<{ catalogCount: number; clientesCount: number; historialCount: number; ok: boolean; error?: string }> {
  try {
    const { catalog = [], clientes = {}, historial = [] } = payload;

    const l1 = await syncCloudKeyToSupabase('liq_state', 'catalog', catalog);
    const l2 = await syncCloudKeyToSupabase('liq_state', 'clientes', clientes);
    const l3 = await syncCloudKeyToSupabase('liq_state', 'historial', historial);
    if (!l1 || !l2 || !l3) throw new Error('Error sincronizando app_sync_state de Liquidador');

    if (Array.isArray(catalog) && catalog.length > 0) {
      const mappedCat = catalog.map((item: any, idx: number) => ({
        id: String(item.id || item.codigo || item.code || `CAT-${idx + 1}`),
        codigo: String(item.codigo || item.code || ''),
        descripcion: String(item.descripcion || item.nombre || item.name || ''),
        data: item,
        updated_at: new Date().toISOString()
      }));
      for (let i = 0; i < mappedCat.length; i += 100) {
        const { error } = await supabase.from('liq_catalog').upsert(mappedCat.slice(i, i + 100), { onConflict: 'id' });
        if (error) throw new Error(error.message);
      }
    }

    const clienteEntries = Array.isArray(clientes)
      ? clientes.map((c: any, idx: number) => ({ id: String(c.id || c.nombre || idx), nombre: String(c.nombre || c.name || idx), data: c }))
      : Object.entries(clientes || {}).map(([k, v]: [string, any]) => ({ id: k, nombre: k, data: v }));

    if (clienteEntries.length > 0) {
      const { error } = await supabase.from('liq_clientes').upsert(clienteEntries, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }

    if (Array.isArray(historial) && historial.length > 0) {
      const mappedHist = historial.map((h: any, idx: number) => ({
        id: String(h.id || `HIST-${idx + 1}`),
        data: h,
        updated_at: new Date().toISOString()
      }));
      for (let i = 0; i < mappedHist.length; i += 50) {
        const { error } = await supabase.from('liq_historial').upsert(mappedHist.slice(i, i + 50), { onConflict: 'id' });
        if (error) throw new Error(error.message);
      }
    }

    return {
      catalogCount: Array.isArray(catalog) ? catalog.length : 0,
      clientesCount: clienteEntries.length,
      historialCount: Array.isArray(historial) ? historial.length : 0,
      ok: true
    };
  } catch (err: any) {
    return { catalogCount: 0, clientesCount: 0, historialCount: 0, ok: false, error: err?.message || String(err) };
  }
}

/**
 * Batch Migrates Auxiliaries (deleted_orders, reminders, cierres) & Sync Queue / Audit Logs to Supabase
 */
export async function migrateAuxiliaresAndLogsToSupabase(payload: {
  deletedOrders?: any;
  reminders?: any[];
  cierres?: any[];
  syncQueue?: any[];
  syncLogs?: any[];
  analisisSyncLogs?: any[];
}): Promise<{ auxOk: boolean; queueCount: number; logsCount: number; error?: string }> {
  try {
    const {
      deletedOrders = {},
      reminders = [],
      cierres = [],
      syncQueue = [],
      syncLogs = [],
      analisisSyncLogs = []
    } = payload;

    const a1 = await syncCloudKeyToSupabase('app_state', 'deleted_orders', deletedOrders);
    const a2 = await syncCloudKeyToSupabase('app_state', 'reminders', reminders);
    const a3 = await syncCloudKeyToSupabase('app_state', 'cierres', cierres);
    if (!a1 || !a2 || !a3) throw new Error('Error sincronizando app_sync_state de Auxiliares');

    if (analisisSyncLogs.length > 0) {
      await syncCloudKeyToSupabase('analisis_sync_logs', 'archive', analisisSyncLogs);
    }

    if (syncQueue.length > 0) {
      const mappedQ = syncQueue.map((q: any, idx: number) => ({
        id: String(q.id || `evt_${idx}`),
        idempotency_key: q.idempotencyKey || null,
        event_type: q.eventType || null,
        source_module: q.sourceModule || null,
        target_module: q.targetModule || null,
        record_id: q.recordId || null,
        status: q.status || 'processed',
        attempts: Number(q.attempts) || 0,
        payload: q.payload || q,
        created_at: q.createdAt || new Date().toISOString(),
        updated_at: q.updatedAt || new Date().toISOString()
      }));
      for (let i = 0; i < mappedQ.length; i += 100) {
        const { error } = await supabase.from('sync_queue_events').upsert(mappedQ.slice(i, i + 100), { onConflict: 'id' });
        if (error) throw new Error(error.message);
      }
    }

    if (syncLogs.length > 0) {
      const mappedL = syncLogs.map((l: any, idx: number) => ({
        id: String(l.id || `log_${idx}`),
        event_id: l.eventId || null,
        record_id: l.recordId || null,
        event_type: l.eventType || null,
        source_module: l.sourceModule || null,
        target_module: l.targetModule || null,
        status: l.status || 'SUCCESS',
        message: l.message || '',
        details: l.details || l,
        timestamp_iso: l.timestamp || new Date().toISOString()
      }));
      for (let i = 0; i < mappedL.length; i += 100) {
        const { error } = await supabase.from('sync_audit_logs').upsert(mappedL.slice(i, i + 100), { onConflict: 'id' });
        if (error) throw new Error(error.message);
      }
    }

    return {
      auxOk: true,
      queueCount: syncQueue.length,
      logsCount: syncLogs.length
    };
  } catch (err: any) {
    return { auxOk: false, queueCount: 0, logsCount: 0, error: err?.message || String(err) };
  }
}

/**
 * Single-event hook for syncQueueService.ts to mirror queue & audit logs to Supabase
 */
export async function syncQueueEventToSupabase(item: any): Promise<void> {
  try {
    await supabase.from('sync_queue_events').upsert({
      id: item.id,
      idempotency_key: item.idempotencyKey || null,
      event_type: item.eventType || null,
      source_module: item.sourceModule || null,
      target_module: item.targetModule || null,
      record_id: item.recordId || null,
      status: item.status || 'pending',
      attempts: Number(item.attempts) || 0,
      payload: item.payload || item,
      created_at: item.createdAt || new Date().toISOString(),
      updated_at: item.updatedAt || new Date().toISOString()
    }, { onConflict: 'id' });
  } catch {}
}

export async function syncAuditLogToSupabase(log: any): Promise<void> {
  try {
    await supabase.from('sync_audit_logs').upsert({
      id: log.id,
      event_id: log.eventId || null,
      record_id: log.recordId || null,
      event_type: log.eventType || null,
      source_module: log.sourceModule || null,
      target_module: log.targetModule || null,
      status: log.status || 'SUCCESS',
      message: log.message || '',
      details: log.details || null,
      timestamp_iso: log.timestamp || new Date().toISOString()
    }, { onConflict: 'id' });
  } catch {}
}

// =========================================================================
// FIRESTORE COLLECTION SNAPSHOT LOADER (Para Migración Total 1-Clic)
// =========================================================================

function parseRestValue(field: any): any {
  if (!field || typeof field !== 'object') return null;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return parseInt(field.integerValue, 10);
  if ('doubleValue' in field) return parseFloat(field.doubleValue);
  if ('booleanValue' in field) return field.booleanValue;
  if ('timestampValue' in field) return field.timestampValue;
  if ('nullValue' in field) return null;
  if ('arrayValue' in field) return (field.arrayValue.values || []).map(parseRestValue);
  if ('mapValue' in field) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(field.mapValue.fields || {})) {
      res[k] = parseRestValue(v);
    }
    return res;
  }
  return null;
}

export async function fetchFirestoreDocRaw(collectionName: string, docId: string): Promise<any | null> {
  const projectId = firebaseConfig.projectId || 'sistemalog';
  const apiKey = firebaseConfig.apiKey;
  const dbId = databaseId || '(default)';
  const dbs = dbId === '(default)' ? ['(default)'] : [dbId, '(default)'];

  for (const targetDb of dbs) {
    const enc = targetDb === '(default)' ? '(default)' : encodeURIComponent(targetDb);
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${enc}/documents/${collectionName}/${encodeURIComponent(docId)}?key=${apiKey}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json?.fields?.data !== undefined) {
          return parseRestValue(json.fields.data);
        }
        const rawObj: Record<string, any> = {};
        for (const [k, v] of Object.entries(json?.fields || {})) {
          rawObj[k] = parseRestValue(v);
        }
        return rawObj;
      }
    } catch {}
  }
  return null;
}

export async function listFirestoreCollectionDocs(collectionName: string, maxDocs = 500): Promise<Record<string, any>> {
  const projectId = firebaseConfig.projectId || 'sistemalog';
  const apiKey = firebaseConfig.apiKey;
  const result: Record<string, any> = {};
  const dbs = ['(default)', ...(databaseId && databaseId !== '(default)' ? [databaseId] : [])];

  for (const targetDb of dbs) {
    const enc = targetDb === '(default)' ? '(default)' : encodeURIComponent(targetDb);
    let pageToken = '';
    let collected = 0;
    try {
      do {
        const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${enc}/documents/${collectionName}?key=${apiKey}&pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) break;
        const json = await res.json();
        for (const d of (json.documents || [])) {
          const id = d.name.split('/').pop();
          if (id) {
            if (d.fields?.data !== undefined) {
              result[id] = parseRestValue(d.fields.data);
            } else {
              const obj: Record<string, any> = {};
              for (const [k, v] of Object.entries(d.fields || {})) obj[k] = parseRestValue(v);
              result[id] = obj;
            }
            collected++;
            if (collected >= maxDocs) break;
          }
        }
        pageToken = collected >= maxDocs ? '' : (json.nextPageToken || '');
      } while (pageToken);
      if (Object.keys(result).length > 0) break;
    } catch {}
  }
  return result;
}
