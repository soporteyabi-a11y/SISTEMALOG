/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Order } from '../types';
import { matchOrderSearch } from '../utils/searchHelper';
import { 
  FileText, Users, Truck, CheckCircle2, Search, 
  Terminal as TerminalIcon, Calendar, Clock, MapPin, Package, ArrowRight
} from 'lucide-react';

interface HomeModuleProps {
  orders: Order[];
  onOpenOrder: (order: Order) => void;
  customersCount: number;
}

export default function HomeModule({ orders, onOpenOrder, customersCount }: HomeModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;

  // KPIs
  const totalOrders = orders.length;
  
  const dispatchedCount = useMemo(() => {
    return orders.filter(o => o.estado === 'Despachado' || o.estado === 'Entregado').length;
  }, [orders]);

  const successDeliveries = useMemo(() => {
    return orders.filter(o => o.estado === 'Entregado').length;
  }, [orders]);

  // Terminal log status messages
  const logs = useMemo(() => [
    `> Protocolos de transmisión listos... OK`,
    `> Conectando a Base de Datos Central en la nube... OK`,
    `> Canal seguro de encriptación TLS 1.3... Conectado`,
    `> Sincronizando registros de fletes de Yumbo... Sincronizado (${orders.length} registros cargados)`
  ], [orders.length]);

  // Pending activity filter
  const pendingOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.estado === 'Anulado') return false;
      return o.estado === 'Pendiente' || o.estado === 'En Cargue';
    });
  }, [orders]);

  const filteredPending = useMemo(() => {
    if (!searchTerm.trim()) return pendingOrders;
    // When searching, query across ALL active non-anulado orders so user can find any record by PV, ID, Invoice, Client, etc.
    const activeOrders = orders.filter(o => o.estado !== 'Anulado');
    return activeOrders.filter(o => matchOrderSearch(o, searchTerm));
  }, [pendingOrders, orders, searchTerm]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Paginated list
  const totalPages = Math.max(1, Math.ceil(filteredPending.length / itemsPerPage));
  const paginatedPending = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredPending.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredPending, currentPage]);

  const handlePageChange = (direction: number) => {
    setCurrentPage(prev => {
      const next = prev + direction;
      if (next < 1 || next > totalPages) return prev;
      return next;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-display font-extrabold text-hud-accent tracking-widest flex items-center gap-2 uppercase">
          <Clock className="w-5 h-5" /> Tablero de Control Operativo
        </h2>
        <p className="text-xs text-slate-400">SISTEMALOG SAS | Monitoreo en Tiempo Real</p>
      </div>

      {/* 4 KPIs Top */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-hud-card border border-hud-border rounded-lg p-4 border-t-4 border-t-hud-accent shadow-lg flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1">
              <FileText className="w-3 h-3 text-hud-accent" /> Total Solicitudes
            </span>
            <div className="text-2xl font-display font-extrabold text-white">{totalOrders}</div>
          </div>
          <div className="bg-hud-accent/10 p-3 rounded-full">
            <FileText className="w-6 h-6 text-hud-accent" />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-hud-card border border-hud-border rounded-lg p-4 border-t-4 border-t-hud-green shadow-lg flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1">
              <Users className="w-3 h-3 text-hud-green" /> Clientes Activos
            </span>
            <div className="text-2xl font-display font-extrabold text-white">{customersCount}</div>
          </div>
          <div className="bg-hud-green/10 p-3 rounded-full">
            <Users className="w-6 h-6 text-hud-green" />
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-hud-card border border-hud-border rounded-lg p-4 border-t-4 border-t-hud-orange shadow-lg flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1">
              <Truck className="w-3 h-3 text-hud-orange" /> Despachados
            </span>
            <div className="text-2xl font-display font-extrabold text-white">{dispatchedCount}</div>
          </div>
          <div className="bg-hud-orange/10 p-3 rounded-full">
            <Truck className="w-6 h-6 text-hud-orange" />
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-hud-card border border-hud-border rounded-lg p-4 border-t-4 border-t-hud-green shadow-lg flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-hud-green" /> Entregas Exitosas
            </span>
            <div className="text-2xl font-display font-extrabold text-white">{successDeliveries}</div>
          </div>
          <div className="bg-hud-green/10 p-3 rounded-full">
            <CheckCircle2 className="w-6 h-6 text-hud-green" />
          </div>
        </div>
      </div>

      {/* Network Command Monitor */}
      <div className="bg-hud-card border border-slate-800 rounded-lg p-4 shadow-inner">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800/80">
          <TerminalIcon className="w-4 h-4 text-hud-green pulse-led" />
          <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-widest">
            Monitor de red y sincronización (Firebase Real-time)
          </span>
        </div>
        <div className="font-mono text-xs text-hud-green/90 leading-relaxed bg-[#02050c]/85 p-3 rounded border border-slate-900/60 max-h-36 overflow-y-auto">
          {logs.map((log, idx) => (
            <div key={idx}>{log}</div>
          ))}
        </div>
      </div>

      {/* Recent Activity List */}
      <div className="bg-hud-card border border-hud-border/80 rounded-lg p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-sm font-display font-bold text-white tracking-widest uppercase border-l-2 border-hud-green pl-2">
              {searchTerm.trim() ? 'Resultados de Búsqueda (En Toda la Base de Datos)' : 'Actividad Reciente en cola (Pendientes & Cargue)'}
            </h3>
            <p className="text-[10px] text-slate-400">
              {searchTerm.trim() ? `${filteredPending.length} solicitudes encontradas` : `${filteredPending.length} solicitudes esperando despacho`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar PV, Código, Cliente, Factura..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="bg-slate-950/70 border border-slate-800 focus:border-hud-accent/60 text-xs text-white rounded px-8 py-1.5 outline-none w-56 transition-all"
              />
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-0.5 bg-slate-950/70 border border-slate-800 p-0.5 rounded">
              <button
                onClick={() => handlePageChange(-1)}
                disabled={currentPage === 1}
                className="text-xs text-hud-accent disabled:text-slate-600 hover:bg-slate-900 font-bold px-2 py-1 rounded transition-colors"
              >
                ◀
              </button>
              <span className="text-[10px] text-hud-accent font-mono font-bold tracking-wider px-2">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(1)}
                disabled={currentPage === totalPages}
                className="text-xs text-hud-accent disabled:text-slate-600 hover:bg-slate-900 font-bold px-2 py-1 rounded transition-colors"
              >
                ▶
              </button>
            </div>
          </div>
        </div>

        {/* Dynamic Activity Cards Feed */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {paginatedPending.length === 0 ? (
            <div className="col-span-2 text-center py-8 text-xs text-slate-500 font-mono">
              -- No hay solicitudes pendientes registradas en este periodo --
            </div>
          ) : (
            paginatedPending.map(order => (
              <div 
                key={order.id}
                onClick={() => onOpenOrder(order)}
                className="bg-slate-950/60 hover:bg-slate-900/40 border border-slate-850 hover:border-hud-accent/40 rounded p-4 cursor-pointer transition-all duration-200 group relative flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-hud-accent font-mono font-bold tracking-wide">
                      {order.id} <span className="text-slate-500">| PV: <span className="text-yellow-400 font-bold">{order.pv || 'N/A'}</span></span>
                    </span>
                    <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded uppercase ${
                      order.estado === 'En Cargue' 
                        ? 'bg-hud-orange/10 border border-hud-orange text-hud-orange' 
                        : 'bg-hud-accent/10 border border-hud-accent text-hud-accent'
                    }`}>
                      {order.estado}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-bold text-white group-hover:text-hud-accent transition-colors">
                      {order.cliente}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <MapPin className="w-3 h-3 text-slate-500" />
                      <span>{order.ciudad}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-2.5 border-t border-slate-900/60 flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-3 font-mono text-slate-400">
                    <span className="flex items-center gap-0.5">
                      <Package className="w-3 h-3 text-slate-500" />
                      <strong>{order.cajas}</strong> cj
                    </span>
                    <span>
                      ⚖️ <strong>{order.peso.toLocaleString('es-CO')}</strong> kg
                    </span>
                    <span className="text-hud-green font-bold">
                      ${(order.venta).toLocaleString('es-CO')}
                    </span>
                  </div>

                  <span className="text-hud-accent group-hover:translate-x-1 transition-transform flex items-center gap-0.5 font-bold uppercase text-[9px] tracking-wider">
                    Editar <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
