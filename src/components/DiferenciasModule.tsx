/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Order } from '../types';
import * as XLSX from 'xlsx';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  ShieldAlert, TrendingDown, Scale, Box, ArrowDownRight, Tag, Search,
  ChevronLeft, ChevronRight, FileSpreadsheet
} from 'lucide-react';

interface DiferenciasModuleProps {
  orders: Order[];
}

export default function DiferenciasModule({ orders }: DiferenciasModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [diferenciasPage, setDiferenciasPage] = useState(1);
  const itemsPerPage = 12;

  // Find all orders that suffered deviations during billing or differences in values/boxes/weight
  const differenceItems = useMemo(() => {
    return orders.filter(o => {
      if (o.estado === 'Anulado') return false;
      const hasFacturado = o.facturado !== undefined && o.facturado !== null && o.facturado > 0;
      const valDiff = hasFacturado ? (o.venta - o.facturado) : 0;
      const cjDiff = (o.cajasFact && o.cajasFact > 0) ? (o.cajas - o.cajasFact) : 0;
      const kgDiff = (o.pesoFact && o.pesoFact > 0) ? (o.peso - o.pesoFact) : 0;

      if (valDiff > 0 || cjDiff > 0 || kgDiff > 0) return true;

      if (o.estado === 'Entregado' && o.venta > 0) {
        if (o.facturado > 0 && o.venta > o.facturado) return true;
        if (o.cajasFact > 0 && o.cajas > o.cajasFact) return true;
      }
      return false;
    });
  }, [orders]);

  // Aggregate total shortages stats
  const stats = useMemo(() => {
    let shortageValue = 0;
    let totalCajasFalt = 0;
    let totalPesoFalt = 0;
    let totalVendido = 0;

    orders.forEach(o => {
      if (o.estado === 'Entregado' || o.estado === 'Despachado' || o.facturado > 0) {
        const effFacturado = o.facturado > 0 ? o.facturado : o.venta;
        const effCajasFact = o.cajasFact > 0 ? o.cajasFact : o.cajas;
        const effPesoFact = o.pesoFact > 0 ? o.pesoFact : o.peso;

        const diff = o.venta - effFacturado;
        if (diff > 0 || (o.cajas - effCajasFact) > 0) {
          shortageValue += Math.max(0, diff);
          totalCajasFalt += Math.max(0, o.cajas - effCajasFact);
          totalPesoFalt += Math.max(0, o.peso - effPesoFact);
        }
        totalVendido += o.venta;
      }
    });

    const impactPct = totalVendido > 0 ? (shortageValue / totalVendido) * 100 : 0;

    return {
      shortageValue,
      totalCajasFalt,
      totalPesoFalt,
      totalVendido,
      impactPct
    };
  }, [orders]);

  // Recharts aggregation by customer
  const clientLossData = useMemo(() => {
    const clients = Array.from(new Set(differenceItems.map(o => o.cliente))) as string[];
    const mapped = clients.map(name => {
      const matches = differenceItems.filter(o => o.cliente === name);
      const loss = matches.reduce((sum, o) => {
        const effFacturado = o.facturado > 0 ? o.facturado : o.venta;
        return sum + Math.max(0, o.venta - effFacturado);
      }, 0);
      return {
        name: name.replace(' S.A.', '').replace(' S.A.S.', '').substring(0, 15),
        Pérdida: loss / 1000 // In thousands
      };
    });
    return mapped.sort((a,b) => b.Pérdida - a.Pérdida);
  }, [differenceItems]);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return differenceItems;
    const term = searchTerm.toLowerCase().trim();
    return differenceItems.filter(o => 
      (o.id && o.id.toString().toLowerCase().includes(term)) ||
      (o.pv && o.pv.toString().toLowerCase().includes(term)) ||
      (o.oc && o.oc.toString().toLowerCase().includes(term)) ||
      (o.cliente && o.cliente.toString().toLowerCase().includes(term)) ||
      (o.ciudad && o.ciudad.toString().toLowerCase().includes(term)) ||
      (o.transportadora && o.transportadora.toString().toLowerCase().includes(term)) ||
      (o.factura && o.factura.toString().toLowerCase().includes(term)) ||
      (o.placa && o.placa.toString().toLowerCase().includes(term)) ||
      (o.conductor && o.conductor.toString().toLowerCase().includes(term))
    );
  }, [differenceItems, searchTerm]);

  React.useEffect(() => {
    setDiferenciasPage(1);
  }, [searchTerm]);

  const totalDiferenciasPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));
  }, [filteredItems, itemsPerPage]);

  const paginatedDiferencias = useMemo(() => {
    const startIndex = (diferenciasPage - 1) * itemsPerPage;
    return filteredItems.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredItems, diferenciasPage, itemsPerPage]);

  const exportDiferenciasToCSV = () => {
    const headers = ["Flete ID", "Cliente", "Unidades Vendidas", "Unidades Facturadas", "Cajas Rechazadas", "Peso Rechazado", "Pérdida Comercial"];
    const rows = filteredItems.map(o => {
      const devVal = o.venta - (o.facturado > 0 ? o.facturado : o.venta);
      const devCj = o.cajas - (o.cajasFact > 0 ? o.cajasFact : o.cajas);
      const devKg = o.peso - (o.pesoFact > 0 ? o.pesoFact : o.peso);
      return [
        o.id,
        o.cliente,
        o.cajas,
        o.cajasFact || o.cajas,
        devCj,
        devKg,
        devVal
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoría Averías");
    XLSX.writeFile(wb, `auditoria_averias_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="sticky -top-6 bg-[#040814] pt-6 pb-4 z-20 flex flex-col gap-1 border-b border-slate-900 shadow-lg">
        <h2 className="text-xl font-display font-extrabold text-[#ef4444] tracking-widest flex items-center gap-2 uppercase">
          <ShieldAlert className="w-5 h-5 text-hud-red pulse-led" /> Logística de Averías y Diferencias Facturadas
        </h2>
        <p className="text-xs text-slate-400">Auditoría de reclamaciones por entregas incompletas o rechazos en andén</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Stats Grid */}
        <div className="bg-hud-card border border-hud-border/50 rounded-lg p-5 border-t-4 border-t-hud-red shadow-xl space-y-4">
          <div className="text-[10px] text-hud-accent font-mono font-bold tracking-widest uppercase pb-1 border-b border-slate-900">
            Cómputo Total de Impacto Negativo
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-black/40 border border-slate-900 p-3 rounded space-y-1">
              <span className="text-[9px] text-slate-400 font-mono block uppercase">Impacto Venta</span>
              <strong className="text-sm font-display text-rose-500 font-bold block">{stats.impactPct.toFixed(2)}%</strong>
              <span className="text-[8px] text-slate-500 font-mono block">DE LOS DESPACHOS</span>
            </div>

            <div className="bg-black/40 border border-slate-900 p-3 rounded space-y-1">
              <span className="text-[9px] text-slate-400 font-mono block uppercase">Cajas Averías</span>
              <strong className="text-sm font-display text-[#ff9100] font-bold block">{stats.totalCajasFalt} cj</strong>
              <span className="text-[8px] text-slate-500 font-mono block">UNIDADES TOTALES</span>
            </div>

            <div className="bg-black/40 border border-slate-900 p-3 rounded space-y-1">
              <span className="text-[9px] text-slate-400 font-mono block uppercase">Peso Perdido</span>
              <strong className="text-sm font-display text-hud-green font-bold block">{stats.totalPesoFalt} kg</strong>
              <span className="text-[8px] text-slate-500 font-mono block">MASA NO ENTREGADA</span>
            </div>
          </div>

          <div className="bg-hud-red/10 border border-hud-red/20 p-4 rounded-lg flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[9px] text-rose-400 font-mono font-bold block uppercase tracking-wider">Total de Fondos Objetados</span>
              <strong className="text-lg text-rose-500 font-display font-black block">${stats.shortageValue.toLocaleString('es-CO')}</strong>
            </div>
            <ShieldAlert className="w-8 h-8 text-rose-500 opacity-60" />
          </div>
        </div>

        {/* Right chart distribution */}
        <div className="bg-hud-card border border-hud-border/50 rounded-lg p-5">
          <h3 className="text-xs font-display font-medium text-white uppercase tracking-widest mb-3">
            Distribución de Pérdidas de Facturación por Clientes (Mil COP)
          </h3>
          <div className="h-44 bg-slate-950/45 p-1 rounded">
            {clientLossData.length === 0 ? (
              <div className="flex h-full items-center justify-center font-mono text-[10px] text-slate-500">
                -- No se registran penalizaciones en la base actual --
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clientLossData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#101a35" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                  <YAxis stroke="#64748b" fontSize={9} />
                  <Tooltip formatter={(v: any) => [`$${v.toLocaleString('es-CO')} k`, 'Pérdida']} contentStyle={{ backgroundColor: '#091124', borderColor: '#ef4444', fontSize: '9px' }} />
                  <Bar dataKey="Pérdida" fill="#ef4444" maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Listing details */}
      <div className="bg-hud-card border border-hud-border/75 rounded-lg p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h3 className="text-xs font-display font-bold text-white uppercase tracking-widest">
            Historico Auditado de Desviaciones Logísticas
          </h3>

          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Buscar por lote o cliente afectado..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setDiferenciasPage(1); }}
              className="bg-slate-950/80 border border-slate-800 text-xs text-white rounded pl-8 pr-3 py-1.5 w-full outline-none"
            />
          </div>
        </div>

        {/* Top-Left pagination & export block */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-950/40 border border-hud-border/30 rounded text-xs font-mono">
          <div className="flex flex-wrap items-center gap-4">
            {/* Pagination Controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDiferenciasPage(1)}
                disabled={diferenciasPage === 1}
                className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer text-xs"
                title="Primera página"
              >
                &laquo;
              </button>
              <button
                type="button"
                onClick={() => setDiferenciasPage(p => Math.max(1, p - 1))}
                disabled={diferenciasPage === 1}
                className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-hud-accent disabled:opacity-20 cursor-pointer text-xs flex items-center"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              
              <span className="text-hud-accent font-bold px-2">
                PÁG. {diferenciasPage} / {totalDiferenciasPages}
              </span>

              <button
                type="button"
                onClick={() => setDiferenciasPage(p => Math.min(totalDiferenciasPages, p + 1))}
                disabled={diferenciasPage === totalDiferenciasPages}
                className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-hud-accent disabled:opacity-20 cursor-pointer text-xs flex items-center"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDiferenciasPage(totalDiferenciasPages)}
                disabled={diferenciasPage === totalDiferenciasPages}
                className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer text-xs"
                title="Última página"
              >
                &raquo;
              </button>
            </div>

            {/* Export block */}
            <button
              onClick={exportDiferenciasToCSV}
              className="bg-hud-accent/10 border border-hud-accent/30 text-hud-accent hover:bg-hud-accent/20 px-3 py-1 rounded text-[10px] font-mono tracking-wider flex items-center gap-1.5 cursor-pointer uppercase font-bold transition-all"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-hud-accent" /> Exportar a Excel
            </button>
          </div>

          <div className="text-slate-400 text-xs">
            Mostrando <strong className="text-white">{filteredItems.length === 0 ? 0 : (diferenciasPage - 1) * itemsPerPage + 1}</strong> a <strong className="text-white">{Math.min(diferenciasPage * itemsPerPage, filteredItems.length)}</strong> de <strong className="text-hud-accent">{filteredItems.length}</strong> averías
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#030610] text-[#476a8a] border-b border-hud-border/40 text-[10px] tracking-widest uppercase">
              <tr>
                <th className="p-3">Código Origen</th>
                <th className="p-3">Cliente / Destino</th>
                <th className="p-3 text-center">Unidades Rechazadas</th>
                <th className="p-3 text-center">Kilogramos Desviados</th>
                <th className="p-3 text-right">Diferencia Comercial</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 text-slate-350">
              {paginatedDiferencias.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 font-mono text-xs">
                    -- No se detectan anomalías de andén registradas --
                  </td>
                </tr>
              ) : (
                paginatedDiferencias.map(order => {
                  const devVal = order.venta - (order.facturado > 0 ? order.facturado : order.venta);
                  const devCj = order.cajas - (order.cajasFact > 0 ? order.cajasFact : order.cajas);
                  const devKg = order.peso - (order.pesoFact > 0 ? order.pesoFact : order.peso);
                  return (
                    <tr key={order.id} className="hover:bg-rose-500/[0.03]">
                      <td className="p-3 font-bold text-rose-500">{order.id} <span className="text-[9px] block text-slate-550">PV: <span className="text-yellow-400 font-bold">{order.pv}</span></span></td>
                      <td className="p-3 font-sans font-medium text-white">
                        {order.cliente} <span className="text-[9.5px] block font-mono text-slate-400">Entrega: {order.ciudad}</span>
                      </td>
                      <td className="p-3 text-center text-[#ffaa00] font-bold">{devCj} cajas</td>
                      <td className="p-3 text-center text-hud-green">{devKg} kg</td>
                      <td className="p-3 text-right text-rose-500 font-bold">${devVal.toLocaleString('es-CO')}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
