import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Database, 
  FileText, 
  Activity, 
  Trash2, 
  Play, 
  Zap, 
  Download, 
  X,
  Search,
  Layers,
  ArrowRight
} from 'lucide-react';
import { 
  getSyncQueueStats, 
  getSyncQueueItems, 
  getSyncAuditLogs, 
  processSyncQueue, 
  forceRetryFailedEvents, 
  clearProcessedQueueEvents, 
  runConsistencyReconciliation, 
  SyncQueueItem, 
  SyncAuditLog, 
  ReconciliationReport 
} from '../services/syncQueueService';

interface SyncQueueMonitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: any[];
  savedVouchers: any[];
}

export default function SyncQueueMonitorModal({
  isOpen,
  onClose,
  orders,
  savedVouchers
}: SyncQueueMonitorModalProps) {
  const [activeTab, setActiveTab] = useState<'queue' | 'logs' | 'reconciliation'>('queue');
  const [stats, setStats] = useState(getSyncQueueStats());
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>(getSyncQueueItems());
  const [auditLogs, setAuditLogs] = useState<SyncAuditLog[]>(getSyncAuditLogs());
  const [isProcessing, setIsProcessing] = useState(false);
  const [filterTerm, setFilterTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [reconciliationReport, setReconciliationReport] = useState<ReconciliationReport | null>(null);

  const refreshData = () => {
    setStats(getSyncQueueStats());
    setQueueItems(getSyncQueueItems());
    setAuditLogs(getSyncAuditLogs());
  };

  useEffect(() => {
    if (!isOpen) return;
    refreshData();
    const interval = setInterval(refreshData, 2000);

    const handleUpdate = () => refreshData();
    window.addEventListener('SYNC_QUEUE_UPDATED', handleUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('SYNC_QUEUE_UPDATED', handleUpdate);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRunQueue = async () => {
    setIsProcessing(true);
    await processSyncQueue();
    refreshData();
    setIsProcessing(false);
  };

  const handleForceRetry = async () => {
    setIsProcessing(true);
    await forceRetryFailedEvents();
    refreshData();
    setIsProcessing(false);
  };

  const handleClearProcessed = () => {
    clearProcessedQueueEvents();
    refreshData();
  };

  const handleRunReconciliation = () => {
    setIsProcessing(true);
    const report = runConsistencyReconciliation(orders, savedVouchers);
    setReconciliationReport(report);
    refreshData();
    setIsProcessing(false);
  };

  const handleExportAuditJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
      exportDate: new Date().toISOString(),
      stats: getSyncQueueStats(),
      queue: getSyncQueueItems(),
      auditLogs: getSyncAuditLogs(),
      lastReconciliation: reconciliationReport
    }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `sync_audit_report_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const filteredQueue = queueItems.filter(item => {
    const matchesStatus = statusFilter === 'ALL' || item.status.toUpperCase() === statusFilter;
    const matchesTerm = !filterTerm || 
      item.recordId.toLowerCase().includes(filterTerm.toLowerCase()) ||
      item.eventType.toLowerCase().includes(filterTerm.toLowerCase()) ||
      item.sourceModule.toLowerCase().includes(filterTerm.toLowerCase()) ||
      item.idempotencyKey.toLowerCase().includes(filterTerm.toLowerCase());
    return matchesStatus && matchesTerm;
  });

  const filteredLogs = auditLogs.filter(log => {
    return !filterTerm || 
      log.recordId.toLowerCase().includes(filterTerm.toLowerCase()) ||
      log.message.toLowerCase().includes(filterTerm.toLowerCase()) ||
      log.eventType.toLowerCase().includes(filterTerm.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 md:p-6 overflow-hidden">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-slate-950/80 border-b border-slate-800/80 px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 shadow-inner">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Motor de Sincronización Transaccional & Cola de Eventos
                <span className="text-[10px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  Resiliencia Activa
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Garantiza que ningún dato se pierda entre Despacho, Provisiones y Análisis de Datos con reintentos e idempotencia.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Grid Bar */}
        <div className="bg-slate-950/40 border-b border-slate-800/60 px-6 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-slate-800 text-slate-300 rounded-lg">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-slate-400">Total Cola</div>
              <div className="text-lg font-black text-slate-200 font-mono">{stats.total}</div>
            </div>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-amber-400">Pendientes</div>
              <div className="text-lg font-black text-amber-300 font-mono">{stats.pending}</div>
            </div>
          </div>

          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-emerald-400">Procesados</div>
              <div className="text-lg font-black text-emerald-300 font-mono">{stats.processed}</div>
            </div>
          </div>

          <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-rose-400">Fallidos</div>
              <div className="text-lg font-black text-rose-300 font-mono">{stats.failed}</div>
            </div>
          </div>
        </div>

        {/* Tab Selection & Control Bar */}
        <div className="bg-slate-950/60 border-b border-slate-800/80 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('queue')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'queue'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Activity className="w-3.5 h-3.5" /> Cola de Eventos ({queueItems.length})
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'logs'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Logs de Auditoría ({auditLogs.length})
            </button>
            <button
              onClick={() => setActiveTab('reconciliation')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'reconciliation'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> Reconciliación (Consistencia)
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleRunQueue}
              disabled={isProcessing || stats.pending === 0}
              className="px-3 py-1.5 bg-indigo-500/20 border border-indigo-500/40 hover:bg-indigo-500/30 text-indigo-300 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              title="Procesa manualmente eventos pendientes"
            >
              <Play className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} /> Procesar Cola
            </button>

            {stats.failed > 0 && (
              <button
                onClick={handleForceRetry}
                disabled={isProcessing}
                className="px-3 py-1.5 bg-rose-500/20 border border-rose-500/40 hover:bg-rose-500/30 text-rose-300 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                title="Reintenta todos los eventos en estado fallido"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reintentar Fallidos ({stats.failed})
              </button>
            )}

            <button
              onClick={handleClearProcessed}
              disabled={stats.processed === 0}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-40"
              title="Limpia registros procesados para liberar espacio"
            >
              <Trash2 className="w-3.5 h-3.5 text-slate-400" /> Limpiar Procesados
            </button>

            <button
              onClick={handleExportAuditJson}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all"
              title="Descarga reporte de auditoría completo"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" /> Exportar JSON
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        {(activeTab === 'queue' || activeTab === 'logs') && (
          <div className="bg-slate-950/30 border-b border-slate-800/60 px-6 py-2.5 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por ID de orden, evento, clave de idempotencia o módulo..."
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/60"
              />
            </div>

            {activeTab === 'queue' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">Todos los Estados</option>
                <option value="PENDING">Pendientes</option>
                <option value="PROCESSED">Procesados</option>
                <option value="FAILED">Fallidos</option>
              </select>
            )}
          </div>
        )}

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          
          {/* TAB 1: QUEUE ITEMS */}
          {activeTab === 'queue' && (
            <div>
              {filteredQueue.length === 0 ? (
                <div className="text-center py-16 text-slate-500 space-y-3">
                  <ShieldCheck className="w-12 h-12 text-slate-700 mx-auto" />
                  <p className="text-sm font-medium">No se encontraron eventos en la cola de sincronización.</p>
                  <p className="text-xs text-slate-600">Todos los datos están procesados y sincronizados o no coinciden con los filtros aplicados.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredQueue.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-700 transition-all"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                            item.status === 'processed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                            item.status === 'failed' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' :
                            item.status === 'processing' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 animate-pulse' :
                            'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}>
                            {item.status}
                          </span>

                          <span className="text-xs font-mono font-bold text-slate-200">
                            {item.eventType}
                          </span>

                          <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                            {item.sourceModule} <ArrowRight className="w-3 h-3 text-slate-600" /> {item.targetModule}
                          </span>
                        </div>

                        <div className="text-xs text-slate-400 flex items-center gap-3 flex-wrap">
                          <span><strong>Registro:</strong> <code className="text-indigo-300 font-mono">{item.recordId}</code></span>
                          <span><strong>Idempotency Key:</strong> <code className="text-slate-500 font-mono">{item.idempotencyKey}</code></span>
                          <span><strong>Intentos:</strong> {item.attempts}/{item.maxAttempts}</span>
                        </div>

                        {item.lastError && (
                          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-2 text-xs text-rose-300 font-mono mt-1">
                            <strong>Error:</strong> {item.lastError}
                          </div>
                        )}
                      </div>

                      <div className="text-right text-[11px] text-slate-500 font-mono space-y-1">
                        <div>Creado: {new Date(item.createdAt).toLocaleTimeString()}</div>
                        <div>Actualizado: {new Date(item.updatedAt).toLocaleTimeString()}</div>
                        {item.status === 'pending' && item.nextRetryAt > Date.now() && (
                          <div className="text-amber-400 text-[10px] font-bold">
                            Próximo reintento en: {Math.ceil((item.nextRetryAt - Date.now()) / 1000)}s
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: AUDIT LOGS */}
          {activeTab === 'logs' && (
            <div>
              {filteredLogs.length === 0 ? (
                <div className="text-center py-16 text-slate-500 space-y-3">
                  <FileText className="w-12 h-12 text-slate-700 mx-auto" />
                  <p className="text-sm font-medium">No hay registros de auditoría almacenados.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 flex items-start gap-3 text-xs"
                    >
                      <div className={`p-1.5 rounded-lg mt-0.5 ${
                        log.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400' :
                        log.status === 'FAILED' ? 'bg-rose-500/10 text-rose-400' :
                        log.status === 'RECONCILED' ? 'bg-sky-500/10 text-sky-400' :
                        'bg-amber-500/10 text-amber-400'
                      }`}>
                        {log.status === 'SUCCESS' && <CheckCircle2 className="w-4 h-4" />}
                        {log.status === 'FAILED' && <XCircle className="w-4 h-4" />}
                        {log.status === 'RECONCILED' && <ShieldCheck className="w-4 h-4" />}
                        {log.status === 'RETRY' && <Clock className="w-4 h-4" />}
                      </div>

                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-200">{log.message}</span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 flex items-center gap-3">
                          <span><strong>Origen:</strong> {log.sourceModule}</span>
                          <span><strong>Destino:</strong> {log.targetModule}</span>
                          <span><strong>ID Evento:</strong> {log.eventId}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RECONCILIATION */}
          {activeTab === 'reconciliation' && (
            <div className="space-y-6">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      Auditoría Automática de Consistencia entre Módulos
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Compara todas las órdenes en estado "Despachado", "Entregado" o "Finalizado" contra el módulo de Provisiones y Análisis. Detecta discrepancias y genera eventos de auto-recuperación.
                    </p>
                  </div>

                  <button
                    onClick={handleRunReconciliation}
                    disabled={isProcessing}
                    className="px-4 py-2 bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 font-bold rounded-lg text-xs flex items-center gap-2 cursor-pointer transition-all shadow-md shadow-emerald-500/10"
                  >
                    <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                    Ejecutar Reconciliación
                  </button>
                </div>

                {reconciliationReport && (
                  <div className="border-t border-slate-800 pt-4 space-y-4 animate-in fade-in">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-mono">Órdenes Revisadas</div>
                        <div className="text-lg font-black text-slate-200">{reconciliationReport.totalOrdersChecked}</div>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-mono">Completadas (Despachadas)</div>
                        <div className="text-lg font-black text-emerald-400">{reconciliationReport.completedOrdersCount}</div>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-mono">Emparejadas OK</div>
                        <div className="text-lg font-black text-sky-400">{reconciliationReport.matchedProvisionsCount}</div>
                      </div>
                      <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-mono">Reprocesadas Automáticamente</div>
                        <div className="text-lg font-black text-amber-400">{reconciliationReport.autoReprocessedCount}</div>
                      </div>
                    </div>

                    {reconciliationReport.details.length > 0 ? (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Discrepancias Encontradas y Auto-Reparadas</h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {reconciliationReport.details.map((item, idx) => (
                            <div key={idx} className="bg-slate-900/90 border border-amber-500/20 p-3 rounded-lg text-xs space-y-1">
                              <div className="flex items-center justify-between text-slate-200 font-bold">
                                <span>Orden: {item.orderId} (PV: {item.pv})</span>
                                <span className="text-amber-400">{item.status}</span>
                              </div>
                              <div className="text-slate-400 text-[11px]">{item.issue}</div>
                              <div className="text-emerald-400 font-mono text-[10px]">{item.actionTaken}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-xs text-emerald-300 font-medium flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        100% Consistente: No se encontraron diferencias ni registros faltantes entre Despacho, Provisiones y Análisis.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-950/80 border-t border-slate-800/80 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-indigo-400" />
            <span>Persistencia Híbrida: LocalStorage + Cloud Firestore (Escrituras Atómicas)</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg cursor-pointer transition-colors"
          >
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}
