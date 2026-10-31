import React, { useState, useEffect } from 'react';
import { 
  Database, CheckCircle2, AlertTriangle, ArrowRight, Copy, Check, 
  RefreshCw, Cloud, ShieldCheck, Play, Server, Layers, ExternalLink, X
} from 'lucide-react';
import { Order, Customer, Carrier } from '../types';
import { 
  SUPABASE_SCHEMA_SQL, 
  testSupabaseConnection, 
  migrateAllOrdersToSupabase,
  migrateCustomersToSupabase,
  migrateCarriersToSupabase
} from '../services/supabaseSyncService';
import { SUPABASE_URL } from '../supabaseConfig';

interface SupabaseMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  customers: Customer[];
  carriers: Carrier[];
}

export default function SupabaseMigrationModal({
  isOpen,
  onClose,
  orders,
  customers,
  carriers
}: SupabaseMigrationModalProps) {
  const [copiedSql, setCopiedSql] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [status, setStatus] = useState<{
    connected: boolean;
    tablesReady: boolean;
    existingTables: string[];
    missingTables: string[];
    error?: string;
  } | null>(null);

  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState({ current: 0, total: 0 });
  const [migrationResult, setMigrationResult] = useState<{ success: boolean; message: string } | null>(null);

  const checkStatus = async () => {
    setIsChecking(true);
    const res = await testSupabaseConnection();
    setStatus(res);
    setIsChecking(false);
  };

  useEffect(() => {
    if (isOpen) {
      checkStatus();
      setMigrationResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const handleStartMigration = async () => {
    setIsMigrating(true);
    setMigrationResult(null);
    setMigrationProgress({ current: 0, total: orders.length });

    try {
      // 1. Migrate Customers
      await migrateCustomersToSupabase(customers);

      // 2. Migrate Carriers
      await migrateCarriersToSupabase(carriers);

      // 3. Migrate Orders in batches
      const res = await migrateAllOrdersToSupabase(orders, (done, total) => {
        setMigrationProgress({ current: done, total });
      });

      if (res.success) {
        setMigrationResult({
          success: true,
          message: `¡Migración completada con éxito! Se migraron ${res.migrated} fletes, ${customers.length} clientes y ${carriers.length} transportadoras a Supabase.`
        });
      } else {
        setMigrationResult({
          success: false,
          message: `Error durante la migración: ${res.error}`
        });
      }
    } catch (e: any) {
      setMigrationResult({
        success: false,
        message: `Excepción durante la migración: ${e?.message || e}`
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
              <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
                Migración Segura a Supabase & Render
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
                  Dual-Write Activo
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 font-sans">
                Transición sin interrupción de servicio: Firestore ⇄ Supabase PostgreSQL
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

        {/* Project Target Info */}
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
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Estado del Puente:</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`w-2.5 h-2.5 rounded-full ${status?.connected ? 'bg-emerald-400 pulse-led' : 'bg-amber-400'}`}></span>
              <span className="text-white font-bold">
                {isChecking ? 'Verificando tablas...' : status?.tablesReady ? 'Tablas Listas en Supabase' : 'Tablas Pendientes por Crear'}
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

        {/* Dual-Write Architecture Explanation */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 text-[11px] font-sans space-y-1.5 text-slate-300">
          <div className="font-bold text-white flex items-center gap-1.5 font-mono text-xs text-sky-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> Cero Riesgo: Garantía de Doble Escritura (Dual-Write)
          </div>
          <p>
            Mientras dure la migración, la app escribe <strong>en Firebase Firestore Y en Supabase al mismo tiempo</strong>.
            Los usuarios pueden seguir creando, despachando y facturando fletes normalmente sin que se pierda ningún dato.
          </p>
        </div>

        {/* Step 1: SQL Schema Creation */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-hud-accent/20 text-hud-accent flex items-center justify-center font-bold text-xs">
                1
              </span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                Crear Tablas en Supabase (Solo una vez)
              </h4>
            </div>
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
              <span>{copiedSql ? '¡SQL Copiado!' : 'Copiar Script SQL'}</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
            Copia el script SQL y pégalo en el <strong>SQL Editor</strong> de tu proyecto Supabase (<code className="text-emerald-400">dwyofmibngjlqcvzahee</code>). Crea las tablas <code className="text-sky-300">fletes_solicitudes</code>, <code className="text-sky-300">clientes</code>, <code className="text-sky-300">transportadoras</code>, <code className="text-sky-300">novedades</code>, <code className="text-sky-300">provisiones_vouchers</code> y activa el motor en tiempo real.
          </p>

          <div className="bg-slate-900 p-2.5 rounded border border-slate-800 text-[10px] font-mono max-h-28 overflow-y-auto select-all text-slate-400">
            {SUPABASE_SCHEMA_SQL}
          </div>
        </div>

        {/* Step 2: Migrate Historical Data */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                2
              </span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                Migrar Historial Completo ({orders.length} Fletes, {customers.length} Clientes)
              </h4>
            </div>
            
            <button
              type="button"
              onClick={handleStartMigration}
              disabled={isMigrating || orders.length === 0}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                isMigrating
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-wait'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950'
              }`}
            >
              {isMigrating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Migrando ({migrationProgress.current}/{migrationProgress.total})...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Iniciar Migración a Supabase</span>
                </>
              )}
            </button>
          </div>

          {/* Progress bar */}
          {isMigrating && (
            <div className="space-y-1">
              <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${Math.round((migrationProgress.current / (migrationProgress.total || 1)) * 100)}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Transfiriendo registros en lotes atómicos...</span>
                <span className="text-emerald-400 font-bold">
                  {Math.round((migrationProgress.current / (migrationProgress.total || 1)) * 100)}%
                </span>
              </div>
            </div>
          )}

          {migrationResult && (
            <div className={`p-3 rounded-lg text-xs font-sans border ${
              migrationResult.success 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              <div className="font-bold flex items-center gap-1.5">
                {migrationResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
                {migrationResult.success ? 'Proceso Finalizado Exitosamente' : 'Error en la Migración'}
              </div>
              <p className="mt-1 leading-relaxed text-[11px]">{migrationResult.message}</p>
            </div>
          )}
        </div>

        {/* Step 3: Deployment to Render */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs">
              3
            </span>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Despliegue Final en Render (Web Service)
            </h4>
          </div>
          <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
            Una vez validada la información en Supabase, el backend Node/Express (`server.ts`) y el frontend React se conectan a Render con un Web Service estándar ejecutando <code className="text-emerald-300 font-mono">npm run build && npm start</code> con variables <code className="text-sky-300 font-mono">VITE_SUPABASE_URL</code> y <code className="text-sky-300 font-mono">VITE_SUPABASE_ANON_KEY</code>.
          </p>
        </div>

      </div>
    </div>
  );
}
