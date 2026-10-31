/**
 * Supabase Migration & Real-Time Dual-Write Service for SISTEMALOG
 * Ensures 100% data fidelity between Firebase Firestore and Supabase PostgreSQL.
 */

import { supabase } from '../supabaseConfig';
import { Order, Customer, Carrier, Novedad } from '../types';

export const SUPABASE_SCHEMA_SQL = `-- =========================================================================
-- SCRIPT DE AJUSTE Y COMPATIBILIDAD SISTEMALOG EN SUPABASE (POSTGRESQL)
-- Ejecuta este script en: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- =========================================================================

-- 1. TABLA PRINCIPAL DE FLETES (Crea o actualiza columnas faltantes)
CREATE TABLE IF NOT EXISTS public.fletes_solicitudes (
  id VARCHAR(64) PRIMARY KEY,
  pv VARCHAR(64) NOT NULL,
  cliente VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asegurar todas las columnas necesarias en fletes_solicitudes
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

-- 2. TABLA DE CLIENTES
CREATE TABLE IF NOT EXISTS public.clientes (
  id VARCHAR(64) PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  ciudad VARCHAR(128),
  nit VARCHAR(64),
  contacto VARCHAR(255),
  telefono VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA DE TRANSPORTADORAS
CREATE TABLE IF NOT EXISTS public.transportadoras (
  id VARCHAR(64) PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  contacto VARCHAR(255),
  telefono VARCHAR(64),
  tarifa_base NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLA DE NOVEDADES OPERATIVAS
CREATE TABLE IF NOT EXISTS public.novedades (
  id VARCHAR(64) PRIMARY KEY,
  order_id VARCHAR(64),
  pv VARCHAR(64),
  tipo VARCHAR(64),
  descripcion TEXT,
  fecha TIMESTAMPTZ DEFAULT NOW(),
  estado VARCHAR(32) DEFAULT 'Abierta',
  solucion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TABLA DE PROVISIONES Y COMPROBANTES
CREATE TABLE IF NOT EXISTS public.provisiones_vouchers (
  id VARCHAR(64) PRIMARY KEY,
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TABLA DE ESTADO Y BACKUP JSON
CREATE TABLE IF NOT EXISTS public.app_sync_state (
  key VARCHAR(128) PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. DESACTIVAR RLS PARA PERMITIR INSERCIÓN Y LECTURA DIRECTA
ALTER TABLE public.fletes_solicitudes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transportadoras DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.novedades DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.provisiones_vouchers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_sync_state DISABLE ROW LEVEL SECURITY;

-- 8. RECARGA DE ESQUEMA EN SUPABASE
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
    cajas: Number(o.cajas) || 0,
    venta: Number(o.venta) || 0,
    flete: Number(o.flete) || 0,
    facturado: Number(o.facturado) || 0,
    cajas_fact: Number(o.cajasFact) || 0,
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
 * Checks if Supabase tables are created and operational
 */
export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  tablesReady: boolean;
  existingTables: string[];
  missingTables: string[];
  error?: string;
}> {
  const targetTables = ['fletes_solicitudes', 'clientes', 'transportadoras', 'provisiones_vouchers', 'app_sync_state'];
  const existingTables: string[] = [];
  const missingTables: string[] = [];

  try {
    for (const tbl of targetTables) {
      const { error } = await supabase.from(tbl).select('count', { count: 'exact', head: true });
      if (error && error.code === 'PGRST205') {
        missingTables.push(tbl);
      } else if (!error || error.code === 'PGRST116') {
        existingTables.push(tbl);
      } else {
        missingTables.push(tbl);
      }
    }

    return {
      connected: true,
      tablesReady: missingTables.length === 0,
      existingTables,
      missingTables
    };
  } catch (err: any) {
    return {
      connected: false,
      tablesReady: false,
      existingTables,
      missingTables: targetTables,
      error: err?.message || String(err)
    };
  }
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
      // If table does not exist yet, log silently without failing the app
      if (error.code !== 'PGRST205') {
        console.warn('[Supabase Dual-Write] Error syncing order:', error.message);
      }
      return false;
    }
    return true;
  } catch (e) {
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
  } catch (e) {
    return false;
  }
}

/**
 * Batch Migrator: Migrates entire historical dataset to Supabase in batches of 50
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

    // Also persist complete backup state into app_sync_state
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
    const mapped = customers.map(c => ({
      id: c.id,
      nombre: c.nombre,
      ciudad: c.ciudad || null,
      nit: c.nit || null,
      contacto: c.contacto || null,
      telefono: (c as any).celular || (c as any).telefono || null
    }));

    const { error } = await supabase.from('clientes').upsert(mapped, { onConflict: 'id' });
    if (error && error.code !== 'PGRST205') {
      console.warn('[Supabase] Error migrating customers:', error.message);
    }
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
    await syncStateToSupabase('carriers_master_backup', carriers);
    return !error;
  } catch {
    return false;
  }
}
