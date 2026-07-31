/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Novedad } from '../types';
import { 
  Plus, Search, Eye, Filter, Calendar, User, Tag, 
  Settings, CheckCircle, AlertTriangle, HelpCircle, FileText, Image as ImageIcon, MessageSquare,
  Edit2, Trash2, Bell
} from 'lucide-react';
import { 
  sendPushNotification, 
  requestNotificationPermission, 
  getNotificationPermission, 
  isNotificationSupported,
  checkAndNotifyDueEvents
} from '../notificationService';

interface NovedadesModuleProps {
  novedades: Novedad[];
  onAddNovedad: (novedad: Novedad) => void;
  onUpdateNovedad: (novedad: Novedad) => void;
  onDeleteNovedad: (id: string) => void;
}

export default function NovedadesModule({ novedades, onAddNovedad, onUpdateNovedad, onDeleteNovedad }: NovedadesModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;

  const [isOpenForm, setIsOpenForm] = useState(false);
  const [editingNovedadId, setEditingNovedadId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [imgUrl, setImgUrl] = useState('');
  const [tipo, setTipo] = useState('🚨 Incidencia Crítica');
  const [pv, setPv] = useState('');
  const [cliente, setCliente] = useState('');
  const [responsable, setResponsable] = useState('');
  const [estado, setEstado] = useState<'Abierta' | 'En Proceso' | 'Cerrada'>('Abierta');
  
  const [permission, setPermission] = useState(getNotificationPermission());

  // Check for newly registered high-priority incidents
  useEffect(() => {
    checkAndNotifyDueEvents([], [], novedades);
    
    const interval = setInterval(() => {
      checkAndNotifyDueEvents([], [], novedades);
    }, 15000);

    return () => clearInterval(interval);
  }, [novedades]);

  const handleRequestPermission = async () => {
    const res = await requestNotificationPermission();
    setPermission(res);
    sendPushNotification("Avisos Activos", "Estás conectado al canal de alertas de incidencias de muelle.", "system");
  };

  const filteredNovedades = useMemo(() => {
    let result = [...novedades];
    const term = searchTerm.toLowerCase();

    if (term) {
      result = result.filter(n => 
        n.titulo.toLowerCase().includes(term) || 
        n.descripcion.toLowerCase().includes(term) ||
        n.pv.toLowerCase().includes(term) ||
        n.cliente.toLowerCase().includes(term) ||
        n.responsable.toLowerCase().includes(term)
      );
    }

    if (typeFilter) {
      result = result.filter(n => n.tipo === typeFilter);
    }

    if (stateFilter) {
      result = result.filter(n => n.estado === stateFilter);
    }

    return result.sort((a,b) => b.fecha.localeCompare(a.fecha));
  }, [novedades, searchTerm, typeFilter, stateFilter]);

  // Page split
  const totalPages = Math.max(1, Math.ceil(filteredNovedades.length / itemsPerPage));
  const paginated = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredNovedades.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredNovedades, currentPage]);

  const handleOpenNewForm = () => {
    setTitle('');
    setDesc('');
    setImgUrl('');
    setTipo('🚨 Incidencia Crítica');
    setPv('');
    setCliente('');
    setResponsable('');
    setEstado('Abierta');
    setEditingNovedadId(null);
    setIsOpenForm(true);
  };

  const handleStartEdit = (nov: Novedad) => {
    setTitle(nov.titulo);
    setDesc(nov.descripcion);
    setImgUrl(nov.imageLink || '');
    setTipo(nov.tipo);
    setPv(nov.pv || '');
    setCliente(nov.cliente || '');
    setResponsable(nov.responsable);
    setEstado(nov.estado);
    setEditingNovedadId(nov.id);
    setIsOpenForm(true);

    // Scroll to form smoothly
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const handleCloseForm = () => {
    setTitle('');
    setDesc('');
    setImgUrl('');
    setTipo('🚨 Incidencia Crítica');
    setPv('');
    setCliente('');
    setResponsable('');
    setEstado('Abierta');
    setEditingNovedadId(null);
    setIsOpenForm(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (editingNovedadId) {
      const existing = novedades.find(n => n.id === editingNovedadId);
      onUpdateNovedad({
        id: editingNovedadId,
        titulo: title,
        descripcion: desc,
        imageLink: imgUrl,
        tipo,
        pv,
        cliente,
        responsable: responsable || "Auxiliar Logística",
        estado,
        fecha: existing ? existing.fecha : new Date().toLocaleString('es-CO')
      });
      sendPushNotification(
        "Novedad Actualizada", 
        `[${tipo}] ${cliente || 'Sin Cliente'}: "${title}" editado. Estado: ${estado}`, 
        "novedad"
      );
    } else {
      const newId = `NOV-${100 + novedades.length + 1}`;
      onAddNovedad({
        id: newId,
        titulo: title,
        descripcion: desc,
        imageLink: imgUrl,
        tipo,
        pv,
        cliente,
        responsable: responsable || "Auxiliar Logística",
        estado,
        fecha: new Date().toLocaleString('es-CO')
      });
      sendPushNotification(
        "🚨 Nueva Novedad Reportada", 
        `[${tipo}] ${cliente || 'Sin Cliente'}: "${title}" registrado por ${responsable || "auxiliar"}.`, 
        "novedad"
      );
    }

    handleCloseForm();
  };

  const toggleStatus = (nov: Novedad) => {
    const nextStates: Record<'Abierta' | 'En Proceso' | 'Cerrada', 'Abierta' | 'En Proceso' | 'Cerrada'> = {
      'Abierta': 'En Proceso',
      'En Proceso': 'Cerrada',
      'Cerrada': 'Abierta'
    };
    const nextStatus = nextStates[nov.estado];
    onUpdateNovedad({
      ...nov,
      estado: nextStatus
    });
    sendPushNotification(
      "Estado de Novedad Cambiado", 
      `"${nov.titulo}" cambió su estado de [${nov.estado}] a [${nextStatus}]`, 
      "novedad"
    );
  };

  const handlePageChange = (direction: number) => {
    setCurrentPage(prev => {
      const next = prev + direction;
      if (next < 1 || next > totalPages) return prev;
      return next;
    });
  };

  // Printable summary window
  const printHistory = () => {
    const original = document.title;
    document.title = "HISTORIAL_DE_NOVEDADES_SISTEMALOG";
    window.print();
    document.title = original;
  };

  return (
    <div className="space-y-6 animate-fade-in print:bg-white print:text-black">
      
      {/* Dynamic Push Notifications Permission Widget */}
      {permission !== 'granted' ? (
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-teal-955/30 border-2 border-hud-accent/25 p-4 rounded-xl text-xs text-slate-300 justify-between shadow-lg print:hidden">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-hud-accent animate-bounce" />
            <div className="space-y-0.5">
              <p className="font-bold text-white uppercase tracking-wider text-[11px]">¿Recibir Alertas de Incidencias en Tiempo Real?</p>
              <p className="text-[10px] text-slate-400">Activa el canal de notificaciones push para enterarte de inmediato al surgir averías, quejas u omisiones críticas.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestPermission}
            className="px-4 py-2 bg-hud-accent text-slate-950 font-black rounded-lg transition-all hover:scale-105 active:scale-95 text-[10px] uppercase tracking-wider cursor-pointer font-bold whitespace-nowrap"
          >
            Habilitar Alertas
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-slate-950/45 border border-slate-900 px-4 py-2 rounded-lg text-[9.5px] text-slate-400 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Canal de Notificaciones Novedades Activo</span>
          </div>
          <button 
            type="button"
            onClick={() => sendPushNotification("Canal Novedades Activo", "Recibirás una notificación por cada novedad registrada o cambiada.", "novedad")} 
            className="text-[8.5px] hover:text-[#00ffa3] underline font-bold uppercase transition"
          >
            Enviar Prueba
          </button>
        </div>
      )}

      <div className="sticky -top-6 bg-[#040814] pt-6 pb-4 z-20 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-900 print:hidden shadow-lg">
        <div className="space-y-1">
          <h2 className="text-xl font-display font-extrabold text-hud-accent tracking-widest flex items-center gap-2 uppercase">
            <MessageSquare className="w-5 h-5" /> Registro y Diálogo de Novedades
          </h2>
          <p className="text-xs text-slate-400">Canal de incidencias, averías y depuración logística de muelle</p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={printHistory}
            className="bg-slate-900 border border-slate-800 hover:border-hud-accent text-slate-350 text-xs font-mono font-bold tracking-wider px-4 py-2 rounded-lg cursor-pointer transition-all"
          >
            🖨️ Imprimir Historial
          </button>
          
          <button 
            onClick={handleOpenNewForm}
            className="bg-hud-accent hover:bg-hud-accent/80 text-slate-950 font-black font-mono tracking-widest px-5 py-2.5 text-xs rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Registrar Novedad
          </button>
        </div>
      </div>

      {isOpenForm && (
        <form onSubmit={handleSubmit} className="bg-[#050b18] border-2 border-hud-accent/60 rounded-xl overflow-hidden max-w-2xl mx-auto shadow-2xl print:hidden animate-fade-in">
          {/* Form Header with technical title */}
          <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-hud-accent animate-pulse"></span>
              <h3 className="text-xs font-mono font-extrabold text-hud-accent tracking-widest uppercase">
                {editingNovedadId ? `MODIFICAR FICHA: ${editingNovedadId}` : 'FORMULAR NUEVA FICHA DE CONTROL'}
              </h3>
            </div>
            <button 
              type="button" 
              onClick={handleCloseForm} 
              className="text-slate-400 hover:text-white font-mono text-sm transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] text-hud-accent font-mono font-bold tracking-widest block uppercase">
                  Título de la incidencia / Hallazgo *
                </label>
                <input 
                  type="text" 
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="E.g., RETRASO BÁSCULA YUMBO / AVERÍA DE CAJA"
                  className="bg-slate-950/90 border border-slate-800 text-xs text-white rounded-lg p-2.5 w-full outline-none focus:border-hud-accent placeholder:text-slate-600 transition"
                />
              </div>

              <div className="space-y-1 col-span-2">
                <label className="text-[10px] text-slate-400 font-mono tracking-widest block uppercase">
                  Descripción formal detallada
                </label>
                <textarea 
                  rows={3}
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  placeholder="DESCRIBA TIEMPOS, OPERARIOS VINCULADOS Y MEDIDAS ADOPTADAS TRANSITORIAMENTE..."
                  className="bg-slate-950/90 border border-slate-800 text-xs text-white rounded-lg p-2.5 w-full outline-none focus:border-hud-accent resize-none font-sans placeholder:text-slate-600 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono tracking-widest block uppercase">
                  Categoría de Evento
                </label>
                <select 
                  value={tipo}
                  onChange={e => setTipo(e.target.value)}
                  className="bg-slate-950/90 border border-slate-800 text-xs text-white rounded-lg p-2.5 w-full outline-none focus:border-hud-accent cursor-pointer"
                >
                  <option>🚨 Incidencia Crítica</option>
                  <option>⚠️ Alerta Operativa</option>
                  <option>📦 Problema de Mercancía</option>
                  <option>🚚 Problema de Transporte</option>
                  <option>💰 Problema de Facturación</option>
                  <option>✅ Seguimiento / Acción</option>
                  <option>🛠️ Reporte de Avería</option>
                  <option>📋 Depuración Inventario</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono tracking-widest block uppercase">
                  Referencia PV / Guía
                </label>
                <input 
                  type="text" 
                  value={pv}
                  onChange={e => setPv(e.target.value)}
                  placeholder="E.g., 4500308925"
                  className="bg-slate-950/90 border border-slate-800 text-xs text-white rounded-lg p-2.5 w-full outline-none focus:border-hud-accent placeholder:text-slate-600 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono tracking-widest block uppercase">
                  Cliente Vinculado
                </label>
                <input 
                  type="text" 
                  value={cliente}
                  onChange={e => setCliente(e.target.value)}
                  placeholder="E.g., ALMACENES ÉXITO S.A."
                  className="bg-slate-950/90 border border-slate-800 text-xs text-white rounded-lg p-2.5 w-full outline-none focus:border-hud-accent placeholder:text-slate-600 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-mono tracking-widest block uppercase">
                  Responsable Operativo
                </label>
                <input 
                  type="text" 
                  value={responsable}
                  onChange={e => setResponsable(e.target.value)}
                  placeholder="E.g., EDUARDO LÓPEZ"
                  className="bg-slate-950/90 border border-slate-800 text-xs text-white rounded-lg p-2.5 w-full outline-none focus:border-hud-accent placeholder:text-slate-600 transition"
                />
              </div>

              <div className="space-y-1 col-span-2">
                <label className="text-[10px] text-slate-400 font-mono tracking-widest block uppercase">
                  Vínculo de Foto / Evidencia (Opcional)
                </label>
                <input 
                  type="url" 
                  value={imgUrl}
                  onChange={e => setImgUrl(e.target.value)}
                  placeholder="https://imgur.com/image_averia.png"
                  className="bg-slate-950/90 border border-slate-800 text-xs text-white rounded-lg p-2.5 w-full outline-none focus:border-hud-accent placeholder:text-slate-600 transition"
                />
              </div>

              {imgUrl && (
                <div className="col-span-2 space-y-2 animate-fade-in pt-1">
                  <span className="text-[10px] text-hud-accent font-mono tracking-widest block uppercase font-bold text-center">
                    Vista Previa del Registro Visual
                  </span>
                  <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3 max-w-sm mx-auto flex flex-col items-center">
                    <img 
                      src={imgUrl} 
                      alt="Previsualización" 
                      referrerPolicy="no-referrer"
                      className="max-h-[160px] object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1594818821922-80fedb3259f9?auto=format&fit=crop&q=80&w=400';
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions of the registry form */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800/60">
              <button 
                type="button" 
                onClick={handleCloseForm}
                className="bg-slate-950 hover:bg-slate-900 border border-slate-800 text-xs text-slate-400 px-4 py-2 rounded-lg cursor-pointer transition"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="bg-hud-accent hover:bg-hud-accent/80 text-slate-950 font-black font-mono tracking-wider text-xs px-5 py-2.5 rounded-lg cursor-pointer transition"
              >
                {editingNovedadId ? 'GUARDAR REGISTRO' : 'REGISTRAR FICHA'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Advanced Filters */}
      <div className="bg-hud-card border border-hud-border/40 p-4 rounded-lg flex flex-col md:flex-row items-center justify-between gap-3 print:hidden">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Buscar por titular, PV, responsable..."
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950/80 border border-slate-800 text-xs text-white rounded pl-8 pr-3 py-1.5 w-full outline-none"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select 
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950/80 border border-slate-800 text-xs text-white px-2.5 py-1.5 rounded outline-none w-full md:w-44"
          >
            <option value="">Todas las Categorías</option>
            <option>🚨 Incidencia Crítica</option>
            <option>⚠️ Alerta Operativa</option>
            <option>📦 Problema de Mercancía</option>
            <option>🚚 Problema de Transporte</option>
            <option>💰 Problema de Facturación</option>
            <option>✅ Seguimiento / Acción</option>
            <option>🛠️ Reporte de Avería</option>
            <option>📋 Depuración Inventario</option>
          </select>

          <select 
            value={stateFilter}
            onChange={e => { setStateFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950/80 border border-slate-800 text-xs text-white px-2.5 py-1.5 rounded outline-none w-full md:w-36"
          >
            <option value="">Todos los Estados</option>
            <option value="Abierta">🔴 Abierta</option>
            <option value="En Proceso">🟡 En Proceso</option>
            <option value="Cerrada">🟢 Cerrada</option>
          </select>
        </div>
      </div>

      {/* Cards List feed */}
      <div className="space-y-6 print:space-y-6">
        {paginated.length === 0 ? (
          <div className="bg-hud-card p-12 text-center text-xs text-slate-500 font-mono border border-slate-900 rounded-lg">
            -- No se disponen de registros para las directivas solicitadas --
          </div>
        ) : (
          paginated.map(nov => {
            const typeClean = nov.tipo.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '').trim().toUpperCase();
            return (
              <div 
                key={nov.id}
                className="bg-[#050b18] border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative"
              >
                {/* Subtle top indicator bar indicating status */}
                <div className={`absolute top-0 left-0 w-full h-[3px] ${
                  nov.estado === 'Abierta' ? 'bg-rose-500' :
                  nov.estado === 'En Proceso' ? 'bg-[#ff9100]' : 'bg-[#00ffa3]'
                }`}></div>

                {/* Header of the Ficha Técnica */}
                <div className="bg-slate-950 px-5 py-3 border-b border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="bg-hud-accent/10 text-hud-accent font-mono text-[10px] font-black tracking-widest px-2.5 py-1 rounded border border-hud-accent/30 uppercase">
                      {nov.id}
                    </span>
                    <h4 className="text-xs font-mono font-bold text-slate-400 tracking-wider uppercase">
                      FICHA TÉCNICA DE CONTROL LOGÍSTICO
                    </h4>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-slate-400">
                      REGISTRO: {nov.fecha}
                    </span>
                    <button 
                      type="button"
                      onClick={() => toggleStatus(nov)}
                      className={`text-[9px] font-mono font-extrabold px-3 py-1 rounded border transition-all duration-200 uppercase tracking-widest cursor-pointer print:hidden ${
                        nov.estado === 'Abierta' ? 'bg-rose-500/10 border-rose-500/30 text-rose-500 hover:bg-rose-500/20' :
                        nov.estado === 'En Proceso' ? 'bg-[#ff9100]/10 border-[#ff9100]/30 text-[#ff9100] hover:bg-[#ff9100]/20' :
                        'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20'
                      }`}
                      title="Haga clic para cambiar estado"
                    >
                      {nov.estado === 'Abierta' ? '🔴 ABIERTA' : nov.estado === 'En Proceso' ? '🟡 EN PROCESO' : '🟢 CERRADA'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12">
                  {/* Left Column: Form Fields (The "Ficha Técnica" table layout) */}
                  <div className="lg:col-span-7 p-5 space-y-4 border-r border-slate-800/50 flex flex-col justify-between">
                    
                    <div className="space-y-4">
                      {/* Category Badge & Title */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                            CATEGORÍA:
                          </span>
                          <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-wider bg-cyan-950/20 border border-cyan-800/30 px-2 py-0.5 rounded">
                            {typeClean || 'REGISTRO GENERAL'}
                          </span>
                        </div>

                        <h3 className="text-base md:text-lg font-black text-white font-sans tracking-wide uppercase leading-snug print:text-black">
                          {nov.titulo}
                        </h3>
                      </div>
                      
                      {/* Grid Table of Attributes (Form/Datasheet style) */}
                      <div className="grid grid-cols-2 gap-px bg-slate-800/50 border border-slate-800/80 rounded-lg overflow-hidden text-[11px] font-mono">
                        <div className="bg-slate-950/80 p-2.5">
                          <span className="block text-[9px] text-slate-500 uppercase tracking-wider font-bold">Responsable Operativo</span>
                          <span className="text-slate-200 font-bold block truncate mt-0.5 uppercase">{nov.responsable}</span>
                        </div>
                        <div className="bg-slate-950/80 p-2.5">
                          <span className="block text-[9px] text-slate-500 uppercase tracking-wider font-bold">Nro Documento PV / Guía</span>
                          <span className="text-slate-200 font-bold block truncate mt-0.5 uppercase">{nov.pv || 'SIN ESPECIFICAR'}</span>
                        </div>
                        <div className="bg-slate-950/80 p-2.5 col-span-2 border-t border-slate-800/40">
                          <span className="block text-[9px] text-slate-500 uppercase tracking-wider font-bold">Cliente Asociado</span>
                          <span className="text-slate-200 font-bold block truncate mt-0.5 uppercase">{nov.cliente || 'SIN CLIENTE ASOCIADO'}</span>
                        </div>
                      </div>

                      {/* Technical Description Box */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-slate-500 font-mono font-bold tracking-widest block uppercase">
                          DETALLE Y OBSERVACIONES DE CONTROL:
                        </label>
                        <div className="bg-slate-950/90 border border-slate-800/80 rounded-lg p-3 min-h-[90px] font-sans text-xs text-slate-300 leading-relaxed whitespace-pre-wrap uppercase print:text-black print:bg-white print:border-gray-400">
                          {nov.descripcion}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons footer */}
                    <div className="pt-4 border-t border-slate-800/40 flex flex-wrap items-center justify-between gap-3 print:hidden">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(nov)}
                          className="border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 bg-slate-950/40 rounded-lg px-3.5 py-1.5 font-mono font-bold tracking-widest text-[10px] uppercase flex items-center gap-1.5 transition-all duration-150 cursor-pointer"
                          title="Editar esta novedad"
                        >
                          <Edit2 className="w-3 h-3" />
                          Editar Ficha
                        </button>

                        {confirmDeleteId === nov.id ? (
                          <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-rose-600 animate-fade-in text-[10px]">
                            <span className="text-[9px] text-rose-500 font-bold px-1 uppercase font-mono">¿Confirmar?</span>
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteNovedad(nov.id);
                                setConfirmDeleteId(null);
                              }}
                              className="bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-mono font-black py-0.5 px-2 rounded cursor-pointer transition-colors"
                            >
                              Sí
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-mono py-0.5 px-2 rounded cursor-pointer transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(nov.id)}
                            className="border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 bg-slate-950/40 rounded-lg px-3.5 py-1.5 font-mono font-bold tracking-widest text-[10px] uppercase flex items-center gap-1.5 transition-all duration-150 cursor-pointer"
                            title="Eliminar esta novedad"
                          >
                            <Trash2 className="w-3 h-3" />
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Right Column: Photo Evidence (With matching modern style) */}
                  <div className="lg:col-span-5 bg-slate-950/20 p-5 flex flex-col justify-center items-center min-h-[220px]">
                    <div className="w-full max-w-sm flex flex-col space-y-2">
                      <div className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest text-center">
                        REGISTRO FOTOGRÁFICO DE SOPORTE
                      </div>

                      {/* Photo evidence frame */}
                      <div className="relative p-2 rounded-xl bg-slate-950/85 border border-slate-800/80 overflow-hidden shadow-inner flex flex-col justify-between items-center group min-h-[180px]">
                        {nov.imageLink ? (
                          <>
                            <div className="relative w-full h-full flex items-center justify-center rounded-lg bg-slate-900/40 overflow-hidden p-1 border border-slate-800/60">
                              <img 
                                src={nov.imageLink} 
                                alt={nov.titulo}
                                referrerPolicy="no-referrer"
                                className="max-h-[170px] object-contain rounded cursor-zoom-in group-hover:scale-[1.02] transition duration-300"
                                onClick={() => window.open(nov.imageLink, '_blank')}
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-[10px] font-bold text-white pointer-events-none uppercase tracking-widest font-mono">
                                🔍 Ver Imagen Completa
                              </div>
                            </div>
                            <div className="text-[9px] font-mono font-bold text-slate-400 flex items-center justify-between w-full px-1 pt-1.5">
                              <span>EVIDENCIA VISUAL</span>
                              <a 
                                href={nov.imageLink} 
                                target="_blank" 
                                rel="noreferrer"
                                className="underline hover:text-white transition duration-150 flex items-center gap-1 print:hidden"
                              >
                                <ImageIcon className="w-3 h-3" /> Ampliar
                              </a>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                            <div className="bg-slate-900/80 p-2.5 rounded-full border border-slate-800 text-slate-500">
                              <ImageIcon className="w-5 h-5 animate-pulse" />
                            </div>
                            <div className="space-y-1 px-4">
                              <span className="text-[10px] font-black font-mono text-slate-400 uppercase tracking-widest block">SIN REGISTRO FOTOGRÁFICO</span>
                              <p className="text-[9px] text-slate-500 leading-normal max-w-[200px] mx-auto font-sans">
                                SE PUEDE ADJUNTAR UN ENLACE O CAPTURA MEDIANTE LA OPCIÓN <strong className="text-amber-400">EDITAR FICHA</strong>.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination component block for Novedades */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-1.5 bg-slate-950 p-1 hover:border-slate-800 border border-slate-900 rounded-lg max-w-xs mx-auto print:hidden font-mono text-xs text-hud-accent">
          <button 
            onClick={() => handlePageChange(-1)} 
            disabled={currentPage === 1}
            className="px-3 py-1 bg-slate-900 disabled:opacity-30 rounded cursor-pointer"
          >
            ◀
          </button>
          <span className="px-2 font-bold font-mono">PAGINA {currentPage} / {totalPages}</span>
          <button 
            onClick={() => handlePageChange(1)} 
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-slate-900 disabled:opacity-30 rounded cursor-pointer"
          >
            ▶
          </button>
        </div>
      )}
    </div>
  );
}
