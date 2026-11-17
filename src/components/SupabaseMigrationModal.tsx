import React, { useState, useEffect, useRef } from 'react';
import {
  Database, CheckCircle2, AlertTriangle, Copy, Check,
  RefreshCw, ShieldCheck, Play, ExternalLink, X, Power, Layers, Server, Download
} from 'lucide-react';
import { Order, Customer, Carrier, Novedad, Reminder } from '../types';
import {
  SUPABASE_TABLES,
  SUPABASE_SCHEMA_SQL,
  SUPABASE_RLS_UNLOCK_SQL,
  testSupabaseConnection,
  migrateAllOrdersToSupabase,
  migrateCustomersToSupabase,
  migrateCarriersToSupabase,
  migrateNovedadesToSupabase,
  migrateProvisionesToSupabase,
  migrateHorasExtrasToSupabase,
  migratePedidosEmpleadosToSupabase,
  migrateCitasToSupabase,
  migrateLiquidadorToSupabase,
  migrateAuxiliaresAndLogsToSupabase,
  fetchFirestoreDocRaw,
  listFirestoreCollectionDocs
} from '../services/supabaseSyncService';
import { getCloudEngineMode, setCloudEngineMode, CloudEngineMode } from '../firebaseService';
import { SUPABASE_URL } from '../supabaseConfig';

interface SupabaseMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  customers: Customer[];
  carriers: Carrier[];
  novedades?: Novedad[];
  deletedOrders?: Record<string, any>;
  reminders?: Reminder[];
}

interface ModuleStepStatus {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
}

const safeParseJson = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const pickLongerArray = (a: any, b: any): any[] => {
  const arrA = Array.isArray(a) ? a : [];
  const arrB = Array.isArray(b) ? b : [];
  return arrA.length >= arrB.length ? arrA : arrB;
};

export default function SupabaseMigrationModal({
  isOpen,
  onClose,
  orders,
  customers,
  carriers,
  novedades,
  deletedOrders,
  reminders
}: SupabaseMigrationModalProps) {
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedRls, setCopiedRls] = useState(false);
  const sqlTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [engineMode, setEngineModeState] = useState<CloudEngineMode>(getCloudEngineMode());
  const [status, setStatus] = useState<{
    connected: boolean;
    tablesReady: boolean;
    coreReady: boolean;
    fullSchemaReady: boolean;
    existingTables: string[];
    missingTables: string[];
    appSyncKeysCount: number;
    error?: string;
  } | null>(null);

  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState({ current: 0, total: 7, phase: '' });
  const [moduleSteps, setModuleSteps] = useState<ModuleStepStatus[]>([
    { id: 'fletes', label: 'Fletes, Clientes, Transportadoras y Novedades', status: 'pending' },
    { id: 'horas', label: 'Horas Extras (Registros, Trabajadores, Config y Cortes)', status: 'pending' },
    { id: 'pedidos', label: 'Pedidos de Empleados (Órdenes, Catálogo, Config)', status: 'pending' },
    { id: 'provisiones', label: 'Provisiones (Comprobantes y Conciliación)', status: 'pending' },
    { id: 'citas', label: 'Citas y Agendamiento (Activas, Archivadas, Clientes)', status: 'pending' },
    { id: 'liquidador', label: 'Liquidador (Catálogo, Clientes, Historial)', status: 'pending' },
    { id: 'auxiliares', label: 'Auxiliares (Anulaciones, Recordatorios, Cierres, Colas/Logs)', status: 'pending' }
  ]);
  const [migrationResult, setMigrationResult] = useState<{ success: boolean; message: string } | null>(null);

  const updateStep = (id: string, patch: Partial<ModuleStepStatus>) => {
    setModuleSteps(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)));
  };

  const checkStatus = async () => {
    setIsChecking(true);
    const res = await testSupabaseConnection();
    setStatus(res);
    setEngineModeState(getCloudEngineMode());
    setIsChecking(false);
  };

  useEffect(() => {
    if (isOpen) {
      checkStatus();
      setMigrationResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const copyTextReliable = async (text: string, refEl?: HTMLTextAreaElement | null): Promise<boolean> => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    try {
      const target = refEl || document.createElement('textarea');
      if (!refEl) {
        target.value = text;
        target.style.position = 'fixed';
        target.style.opacity = '0';
        document.body.appendChild(target);
      }
      target.focus();
      target.select();
      target.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      if (!refEl) document.body.removeChild(target);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopySql = async () => {
    const ok = await copyTextReliable(SUPABASE_SCHEMA_SQL, sqlTextareaRef.current);
    if (ok) {
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 3000);
    } else if (sqlTextareaRef.current) {
      sqlTextareaRef.current.focus();
      sqlTextareaRef.current.select();
    }
  };

  const handleCopyRlsUnlock = async () => {
    const ok = await copyTextReliable(SUPABASE_RLS_UNLOCK_SQL);
    if (ok) {
      setCopiedRls(true);
      setTimeout(() => setCopiedRls(false), 3000);
    }
  };

  const handleDownloadSql = () => {
    try {
      const blob = new Blob([SUPABASE_SCHEMA_SQL], { type: 'text/sql;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sistemalog_supabase_v2.sql';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
  };

  const handleToggleEngine = (targetMode: CloudEngineMode) => {
    setCloudEngineMode(targetMode);
    setEngineModeState(targetMode);
  };

  const handleStartFullMigration = async () => {
    setIsMigrating(true);
    setMigrationResult(null);
    setModuleSteps(prev => prev.map(s => ({ ...s, status: 'pending', detail: undefined })));

    try {
      // 1. FLETES, CLIENTES, TRANSPORTADORAS Y NOVEDADES
      setMigrationProgress({ current: 1, total: 7, phase: 'Migrando Fletes, Clientes, Transportadoras y Novedades...' });
      updateStep('fletes', { status: 'running' });

      const localNovedades = Array.isArray(novedades)
        ? novedades
        : safeParseJson<any[]>(localStorage.getItem('lp_novedades'), []);
      const fsNovedades = await fetchFirestoreDocRaw('app_state', 'novedades');
      const mergedNovedades = pickLongerArray(localNovedades, fsNovedades);

      await migrateCustomersToSupabase(customers);
      await migrateCarriersToSupabase(carriers);
      await migrateNovedadesToSupabase(mergedNovedades);
      const ordersRes = await migrateAllOrdersToSupabase(orders);
      if (!ordersRes.success) {
        throw new Error(ordersRes.error || 'Error migrando fletes');
      }
      updateStep('fletes', {
        status: 'done',
        detail: `${ordersRes.migrated} fletes, ${customers.length} clientes, ${carriers.length} trans., ${mergedNovedades.length} nov.`
      });

      // 2. HORAS EXTRAS + CORTES_*
      setMigrationProgress({ current: 2, total: 7, phase: 'Migrando Horas Extras y Cortes Quincenales...' });
      updateStep('horas', { status: 'running' });

      const localHoras = safeParseJson<any>(localStorage.getItem('latin_overtime_state'), {});
      const fsHorasAll = await listFirestoreCollectionDocs('horas_extras_state', 300);
      const horasRecords = pickLongerArray(fsHorasAll.records, localHoras.records);
      const horasWorkers = pickLongerArray(fsHorasAll.workers, localHoras.workers);
      const horasConfig = fsHorasAll.config || localHoras.config || null;
      const horasCortes: Record<string, any> = {};
      for (const [k, v] of Object.entries(fsHorasAll)) {
        if (k.startsWith('cortes_') && v) {
          horasCortes[k] = v;
        }
      }

      const horasRes = await migrateHorasExtrasToSupabase({
        records: horasRecords,
        workers: horasWorkers,
        config: horasConfig,
        cortes: horasCortes
      });
      updateStep('horas', {
        status: horasRes.ok ? 'done' : 'error',
        detail: `${horasRes.recordsCount} reg., ${horasRes.workersCount} colab., ${horasRes.cortesCount} cortes`
      });

      // 3. PEDIDOS DE EMPLEADOS
      setMigrationProgress({ current: 3, total: 7, phase: 'Migrando Pedidos de Empleados y Catálogo...' });
      updateStep('pedidos', { status: 'running' });

      const localPedidos = safeParseJson<any>(localStorage.getItem('latin_pedidos_local_state'), {});
      const [fsPedOrders, fsPedProducts, fsPedConfig] = await Promise.all([
        fetchFirestoreDocRaw('pedidos_empleados_state', 'orders'),
        fetchFirestoreDocRaw('pedidos_empleados_state', 'products'),
        fetchFirestoreDocRaw('pedidos_empleados_state', 'config')
      ]);

      const pedRes = await migratePedidosEmpleadosToSupabase({
        orders: pickLongerArray(fsPedOrders, localPedidos.orders),
        products: pickLongerArray(fsPedProducts, localPedidos.products),
        config: fsPedConfig || localPedidos.config || null
      });
      updateStep('pedidos', {
        status: pedRes.ok ? 'done' : 'error',
        detail: `${pedRes.ordersCount} pedidos, ${pedRes.productsCount} productos`
      });

      // 4. PROVISIONES + ESTADOS DE CONCILIACIÓN
      setMigrationProgress({ current: 4, total: 7, phase: 'Migrando Provisiones y Estados de Conciliación...' });
      updateStep('provisiones', { status: 'running' });

      const localVouchersRaw =
        localStorage.getItem('prov_saved_vouchers') ||
        localStorage.getItem('provisiones_saved_vouchers');
      const localVouchers = safeParseJson<any[]>(localVouchersRaw, []);
      const [fsSavedVouchers, fsProvAll] = await Promise.all([
        fetchFirestoreDocRaw('provisiones_state', 'saved_vouchers'),
        listFirestoreCollectionDocs('provisiones_state', 500)
      ]);
      const vouchers = pickLongerArray(
        pickLongerArray(fsSavedVouchers, fsProvAll.saved_vouchers),
        localVouchers
      );
      const provSyncDocs: Record<string, any> = {};
      for (const [k, v] of Object.entries(fsProvAll)) {
        if (k !== 'saved_vouchers' && v) {
          provSyncDocs[k] = v;
        }
      }

      const provRes = await migrateProvisionesToSupabase(vouchers, provSyncDocs);
      updateStep('provisiones', {
        status: provRes.ok ? 'done' : 'error',
        detail: provRes.ok
          ? `${provRes.count} comprobantes, ${Object.keys(provSyncDocs).length} docs conciliación`
          : `Error (${provRes.count} comp.): ${provRes.error || 'revisa esquema SQL v2.0'}`
      });

      // 5. CITAS Y AGENDAMIENTO
      setMigrationProgress({ current: 5, total: 7, phase: 'Migrando Citas, Archivadas y Clientes de Agenda...' });
      updateStep('citas', { status: 'running' });

      const localAppts = safeParseJson<any[]>(localStorage.getItem('logicoord_appointments'), []);
      const localArch = safeParseJson<any[]>(localStorage.getItem('logicoord_archived'), []);
      const localCitasCli = safeParseJson<any[]>(localStorage.getItem('logicoord_clients'), []);
      const [fsAppts, fsArch, fsCitasCli] = await Promise.all([
        fetchFirestoreDocRaw('citas_state', 'appointments'),
        fetchFirestoreDocRaw('citas_state', 'archived'),
        fetchFirestoreDocRaw('citas_state', 'clients')
      ]);

      const citasRes = await migrateCitasToSupabase({
        appointments: pickLongerArray(fsAppts, localAppts),
        archived: pickLongerArray(fsArch, localArch),
        clients: pickLongerArray(fsCitasCli, localCitasCli)
      });
      updateStep('citas', {
        status: citasRes.ok ? 'done' : 'error',
        detail: `${citasRes.appointmentsCount} citas, ${citasRes.archivedCount} arch., ${citasRes.clientsCount} clientes`
      });

      // 6. LIQUIDADOR
      setMigrationProgress({ current: 6, total: 7, phase: 'Migrando Liquidador (Catálogo, Clientes, Historial)...' });
      updateStep('liquidador', { status: 'running' });

      const localLiqCat = safeParseJson<any[]>(localStorage.getItem('liq_catalog'), []);
      const localLiqCli = safeParseJson<any>(localStorage.getItem('liq_clientes'), {});
      const localLiqHist = safeParseJson<any[]>(localStorage.getItem('liq_historial'), []);
      const [fsLiqCat, fsLiqCli, fsLiqHist] = await Promise.all([
        fetchFirestoreDocRaw('liq_state', 'catalog'),
        fetchFirestoreDocRaw('liq_state', 'clientes'),
        fetchFirestoreDocRaw('liq_state', 'historial')
      ]);

      const liqClientesMerged =
        fsLiqCli && Object.keys(fsLiqCli).length >= Object.keys(localLiqCli || {}).length
          ? fsLiqCli
          : localLiqCli;

      const liqRes = await migrateLiquidadorToSupabase({
        catalog: pickLongerArray(fsLiqCat, localLiqCat),
        clientes: liqClientesMerged,
        historial: pickLongerArray(fsLiqHist, localLiqHist)
      });
      updateStep('liquidador', {
        status: liqRes.ok ? 'done' : 'error',
        detail: `${liqRes.catalogCount} SKUs, ${liqRes.clientesCount} clientes, ${liqRes.historialCount} liq.`
      });

      // 7. AUXILIARES, CIERRES Y COLAS/LOGS
      setMigrationProgress({ current: 7, total: 7, phase: 'Migrando Auxiliares, Cierres, Colas y Logs...' });
      updateStep('auxiliares', { status: 'running' });

      const localDeleted = deletedOrders || safeParseJson<Record<string, any>>(localStorage.getItem('lp_deleted_orders'), {});
      const localReminders = reminders || safeParseJson<any[]>(localStorage.getItem('lp_reminders'), []);
      const localQueue = safeParseJson<any[]>(localStorage.getItem('sync_queue_offline_v2'), []);
      const localLogs = safeParseJson<any[]>(localStorage.getItem('sync_logs_offline_v2'), []);

      const [fsDeleted, fsReminders, fsCierres, fsQueueMap, fsLogsMap, fsAnalisisMap] = await Promise.all([
        fetchFirestoreDocRaw('app_state', 'deleted_orders'),
        fetchFirestoreDocRaw('app_state', 'reminders'),
        fetchFirestoreDocRaw('app_state', 'cierres'),
        listFirestoreCollectionDocs('sync_queue', 300),
        listFirestoreCollectionDocs('sync_logs', 300),
        listFirestoreCollectionDocs('analisis_sync_logs', 300)
      ]);

      const mergedDeleted = { ...(fsDeleted || {}), ...(localDeleted || {}) };
      const mergedReminders = pickLongerArray(localReminders, fsReminders);
      const cierresList = Array.isArray(fsCierres) ? fsCierres : fsCierres ? [fsCierres] : [];
      const queueList = pickLongerArray(Object.values(fsQueueMap || {}), localQueue);
      const logsList = pickLongerArray(Object.values(fsLogsMap || {}), localLogs);
      const analisisList = Object.values(fsAnalisisMap || {});

      const auxRes = await migrateAuxiliaresAndLogsToSupabase({
        deletedOrders: mergedDeleted,
        reminders: mergedReminders,
        cierres: cierresList,
        syncQueue: queueList,
        syncLogs: logsList,
        analisisSyncLogs: analisisList
      });
      updateStep('auxiliares', {
        status: auxRes.auxOk ? 'done' : 'error',
        detail: `${Object.keys(mergedDeleted).length} anul., ${mergedReminders.length} recordat., ${cierresList.length} cierres, ${auxRes.queueCount} cola, ${auxRes.logsCount} logs`
      });

      const failedModules: string[] = [];
      if (!horasRes.ok) failedModules.push(`Horas Extras (${horasRes.error || 'error'})`);
      if (!pedRes.ok) failedModules.push(`Pedidos (${pedRes.error || 'error'})`);
      if (!provRes.ok) failedModules.push(`Provisiones (${provRes.error || 'error'})`);
      if (!citasRes.ok) failedModules.push(`Citas (${citasRes.error || 'error'})`);
      if (!liqRes.ok) failedModules.push(`Liquidador (${liqRes.error || 'error'})`);
      if (!auxRes.auxOk) failedModules.push(`Auxiliares (${auxRes.error || 'error'})`);

      if (failedModules.length > 0) {
        setMigrationResult({
          success: false,
          message: `Se migraron casi todos los módulos, pero hubo fallo en: ${failedModules.join(' | ')}. Ejecuta el Script SQL v2.0 actualizado en Supabase (+ New query -> Run) y vuelve a presionar "Iniciar Migración Total".`
        });
      } else {
        setMigrationResult({
          success: true,
          message: '¡Migración total completada! Todos los módulos de SISTEMALOG (Fletes, Horas Extras, Pedidos de Empleados, Provisiones, Citas, Liquidador y Auxiliares/Logs) quedaron respaldados en Supabase PostgreSQL.'
        });
      }
    } catch (e: any) {
      setModuleSteps(prev => prev.map(s => (s.status === 'running' ? { ...s, status: 'error' } : s)));
      const rawMsg = e?.message || String(e);
      const isRls = rawMsg.toLowerCase().includes('row-level security');
      setMigrationResult({
        success: false,
        message: isRls
          ? `Falta desbloquear permisos (RLS) en Supabase: ${rawMsg}. Solución: copia el Script SQL v2.0 del Paso 1, pégalo en Supabase SQL Editor (+ New query), presiona Run hasta ver "Success. No rows returned", y vuelve a intentar.`
          : `Error durante la migración: ${rawMsg}`
      });
    } finally {
      setIsMigrating(false);
      checkStatus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-hud-card border border-hud-accent/40 rounded-xl max-w-3xl w-full p-4 sm:p-6 space-y-4 text-slate-200 shadow-2xl relative animate-fade-in font-mono max-h-[92vh] overflow-y-auto my-auto">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-hud-accent">
            <Database className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <div>
              <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white flex flex-wrap items-center gap-2">
                Migración Total a Supabase & Render (v2.0)
                <span className={`text-[10px] px-2 py-0.5 rounded border ${
                  engineMode === 'supabase_primary'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                }`}>
                  {engineMode === 'supabase_primary' ? 'Supabase Principal Activo' : 'Dual-Write Activo'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 font-sans">
                18 tablas relacionales + Sincronización Realtime unificada para los 7 módulos del ERP
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Project Target & 18-Table Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-950/70 p-3 rounded-lg border border-slate-800">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Proyecto Destino Supabase:</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <strong className="text-emerald-400 font-mono select-all truncate">{SUPABASE_URL}</strong>
              <a
                href="https://supabase.com/dashboard/project/dwyofmibngjlqcvzahee/sql"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:text-sky-300 text-[10px] flex items-center gap-0.5 underline shrink-0"
              >
                SQL Editor <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Esquema PostgreSQL (18 Tablas):</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`w-2.5 h-2.5 rounded-full ${
                status?.fullSchemaReady ? 'bg-emerald-400 pulse-led' : status?.coreReady ? 'bg-sky-400' : 'bg-amber-400'
              }`}></span>
              <span className="text-white font-bold">
                {isChecking
                  ? 'Verificando 18 tablas...'
                  : status?.fullSchemaReady
                    ? `18/18 Tablas Listas (${status.appSyncKeysCount} llaves sync)`
                    : status?.connected
                      ? `${status.existingTables.length}/${SUPABASE_TABLES.length} Tablas creadas`
                      : 'Sin conexión verificada'}
              </span>
              <button
                type="button"
                onClick={checkStatus}
                disabled={isChecking}
                className="ml-auto text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded border border-slate-700 text-slate-300"
              >
                <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Missing tables warning if v2 SQL hasn't been executed */}
        {status && status.missingTables.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-[11px] font-sans text-amber-200 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5 font-mono text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4" /> Faltan {status.missingTables.length} tablas del esquema v2.0 en Supabase:
            </div>
            <div className="flex flex-wrap gap-1">
              {status.missingTables.map(t => (
                <span key={t} className="bg-slate-900/90 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono text-[10px] text-amber-300">
                  {t}
                </span>
              ))}
            </div>
            <p className="text-[10.5px] text-amber-200/80">
              Ejecuta el <strong>Script SQL v2.0</strong> del Paso 1 en tu SQL Editor de Supabase (es 100% seguro y no borra datos existentes).
            </p>
          </div>
        )}

        {/* Dual-Write Architecture Explanation */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 text-[11px] font-sans space-y-1 text-slate-300">
          <div className="font-bold flex items-center gap-1.5 font-mono text-xs text-sky-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> Transición Cero Riesgo: Dual-Write Universal
          </div>
          <p>
            Todos los módulos (Fletes, Horas Extras, Pedidos de Empleados, Provisiones, Citas, Liquidador y Colas) ya replican cada cambio hacia <code className="text-emerald-300">app_sync_state</code> y sus tablas en Supabase. Al completar los Pasos 1 y 2 puedes cambiar el motor principal a <strong>Supabase</strong> en el Paso 3.
          </p>
        </div>

        {/* Step 1: SQL Schema Creation v2.0 */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-hud-accent/20 text-hud-accent flex items-center justify-center font-bold text-xs">
                1
              </span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                Ejecutar Script SQL v2.0 (18 Tablas + Realtime)
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadSql}
                className="px-2.5 py-1 rounded text-xs font-bold bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 flex items-center gap-1.5"
                title="Descargar archivo .sql por si el navegador bloquea el portapapeles"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Descargar .sql</span>
              </button>
              <button
                type="button"
                onClick={handleCopySql}
                className={`px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1.5 ${
                  copiedSql
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                }`}
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? '¡SQL v2.0 Copiado!' : 'Copiar Script SQL v2.0'}</span>
              </button>
            </div>
          </div>

          <textarea
            ref={sqlTextareaRef}
            readOnly
            value={SUPABASE_SCHEMA_SQL}
            onClick={(e) => e.currentTarget.select()}
            rows={5}
            className="w-full bg-slate-900 p-2.5 rounded border border-slate-800 text-[10px] font-mono text-slate-300 resize-y focus:outline-none focus:border-emerald-500/50"
          />
        </div>

        {/* Step 2: Migrate All 7 Modules */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                2
              </span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-400" /> Migrar Todos los Módulos a Supabase
              </h4>
            </div>

            <button
              type="button"
              onClick={handleStartFullMigration}
              disabled={isMigrating}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                isMigrating
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-wait'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950'
              }`}
            >
              {isMigrating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Migrando Fase {migrationProgress.current}/{migrationProgress.total}...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Iniciar Migración Total</span>
                </>
              )}
            </button>
          </div>

          {isMigrating && (
            <div className="space-y-1">
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${Math.round((migrationProgress.current / migrationProgress.total) * 100)}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{migrationProgress.phase}</span>
                <span className="text-emerald-400 font-bold">
                  {Math.round((migrationProgress.current / migrationProgress.total) * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* Checklist of the 7 module groups */}
          <div className="grid grid-cols-1 gap-1.5 text-[11px] font-sans">
            {moduleSteps.map(step => (
              <div
                key={step.id}
                className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded bg-slate-900/70 border border-slate-800/80"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {step.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  {step.status === 'running' && <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />}
                  {step.status === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                  {step.status === 'pending' && <span className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0" />}
                  <span className="text-slate-200 truncate">{step.label}</span>
                </div>
                {step.detail && (
                  <span className={`text-[10px] font-mono break-words max-w-full ${
                    step.status === 'error' ? 'text-rose-300' : 'text-emerald-300'
                  }`}>
                    {step.detail}
                  </span>
                )}
              </div>
            ))}
          </div>

          {migrationResult && (
            <div className={`p-3 rounded-lg text-xs font-sans border ${
              migrationResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              <div className="font-bold flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  {migrationResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                  {migrationResult.success ? 'Migración Integral Finalizada' : 'Error en la Migración'}
                </span>
                {!migrationResult.success && migrationResult.message.toLowerCase().includes('rls') && (
                  <button
                    type="button"
                    onClick={handleCopyRlsUnlock}
                    className="px-2.5 py-1 rounded bg-rose-600/30 hover:bg-rose-600/50 border border-rose-400/40 text-white text-[10px] font-mono flex items-center gap-1 shrink-0"
                  >
                    {copiedRls ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedRls ? '¡Copiado!' : 'Copiar SQL Desbloqueo RLS'}</span>
                  </button>
                )}
              </div>
              <p className="mt-1 leading-relaxed text-[11px]">{migrationResult.message}</p>
            </div>
          )}
        </div>

        {/* Step 3: Switch Primary Database Engine & Render Env */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs">
                3
              </span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-sky-400" /> Motor Principal & Despliegue Render
              </h4>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleToggleEngine('firestore_primary')}
                className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all ${
                  engineMode === 'firestore_primary'
                    ? 'bg-sky-600/30 border-sky-400 text-sky-200'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                Firestore Principal
              </button>
              <button
                type="button"
                onClick={() => handleToggleEngine('supabase_primary')}
                disabled={!status?.coreReady && engineMode !== 'supabase_primary'}
                className={`px-2.5 py-1 rounded text-[11px] font-bold border flex items-center gap-1 transition-all ${
                  engineMode === 'supabase_primary'
                    ? 'bg-emerald-600 border-emerald-400 text-white'
                    : status?.coreReady
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/30'
                      : 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Power className="w-3 h-3" />
                <span>Activar Supabase Principal</span>
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
            Cuando hayas ejecutado el Script SQL v2.0 (18/18 tablas) y completado el Paso 2, activa <strong>Supabase Principal</strong> para probar que todos los módulos lean y escuchen cambios Realtime exclusivamente desde Supabase. Para aplicarlo globalmente en los 4 PCs desde GitHub/Render, agrega en Render la variable:
            {' '}<code className="text-emerald-300 font-mono">VITE_PRIMARY_CLOUD_DB=supabase</code>.
          </p>

          {engineMode === 'supabase_primary' && (
            <div className="flex items-center justify-between gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded p-2.5 text-[11px] font-sans text-emerald-200">
              <span>Modo <strong>Supabase Principal</strong> activo en este navegador. Recarga para hidratar todos los módulos desde PostgreSQL.</span>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-[10px] shrink-0"
              >
                Recargar App
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
