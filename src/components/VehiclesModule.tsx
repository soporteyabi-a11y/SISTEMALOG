/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Order } from '../types';
import * as XLSX from 'xlsx';
import { 
  Truck, ArrowUpRight, Scale, ShieldAlert, CheckCircle2, User, Clock, MapPin, 
  ChevronLeft, ChevronRight, FileSpreadsheet
} from 'lucide-react';

interface VehiclesModuleProps {
  orders: Order[];
  onOpenOrder: (order: Order) => void;
}

export default function VehiclesModule({ orders, onOpenOrder }: VehiclesModuleProps) {
  const [vehiclePage, setVehiclePage] = useState(1);
  const itemsPerPage = 8; // keeping it compact or 12 as requested
  
  // Categorize loads by tonnage ranges
  const categorizedVehicles = useMemo(() => {
    let turbo = 0;      // 0 - 5.0t (0 - 5000 kg)
    let liviano = 0;    // 5.0t - 6.5t (5000 - 6500 kg)
    let sencillo = 0;   // 6.5 - 10t (6500 - 10000 kg)
    let mula = 0;       // 10t - 18t (10000 - 18000 kg)
    let patineta = 0;   // 18t+ (18000 kg and above)

    orders.forEach(o => {
      if (o.estado !== 'Anulado') {
        const value = o.peso; // in kg
        if (value <= 5000) {
          turbo++;
        } else if (value > 5000 && value <= 6500) {
          liviano++;
        } else if (value > 6500 && value <= 10000) {
          sencillo++;
        } else if (value > 10000 && value <= 18000) {
          mula++;
        } else if (value > 18000) {
          patineta++;
        }
      }
    });

    return { turbo, liviano, sencillo, mula, patineta };
  }, [orders]);

  // Main columns
  const activeAssignments = useMemo(() => {
    return orders.filter(o => o.estado !== 'Anulado' && o.placa);
  }, [orders]);

  const totalVehiclePages = useMemo(() => {
    return Math.max(1, Math.ceil(activeAssignments.length / itemsPerPage));
  }, [activeAssignments, itemsPerPage]);

  const paginatedAssignments = useMemo(() => {
    const startIndex = (vehiclePage - 1) * itemsPerPage;
    return activeAssignments.slice(startIndex, startIndex + itemsPerPage);
  }, [activeAssignments, vehiclePage, itemsPerPage]);

  const exportVehiclesToCSV = () => {
    const headers = ["Identidad Orden", "Placa", "Conductor", "Celular", "Transportadora", "Destino", "Masa (kg)", "Categoría"];
    const rows = activeAssignments.map(o => {
      const size = o.peso <= 5000 ? "Turbo" :
                    o.peso > 5000 && o.peso <= 6500 ? "Liviano" :
                    o.peso > 6500 && o.peso <= 10000 ? "Sencillo" :
                    o.peso > 10000 && o.peso <= 18000 ? "Mula" : "Patineta";
      return [
        o.id,
        o.placa || '',
        o.conductor || '',
        o.celular || '',
        o.transportadora || '',
        o.ciudad || '',
        o.peso,
        size
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Censo de Flota");
    XLSX.writeFile(wb, `censo_de_flota_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fade-in font-mono text-xs">
      <div className="sticky -top-6 bg-[#040814] pt-6 pb-4 z-20 flex flex-col gap-1 border-b border-slate-900 shadow-lg">
        <h2 className="text-xl font-display font-extrabold text-hud-accent tracking-widest flex items-center gap-2 uppercase">
          <Truck className="w-5 h-5 text-hud-accent" /> Asignación de Capacidad Vehicular Comparativa
        </h2>
        <p className="text-xs text-slate-400">Auditoría de volúmenes de carga despachados versus topología de flota</p>
      </div>

      {/* Row breakdown boxes */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Turbo */}
        <div className="bg-hud-card border border-hud-border/70 p-3.5 rounded-lg text-center space-y-1">
          <span className="text-[10px] text-hud-accent font-bold block">TURBO<br/><small className="text-slate-500 font-normal">(4.5t - 5.0t)</small></span>
          <div className="text-2xl font-display font-extrabold text-white">{categorizedVehicles.turbo}</div>
        </div>

        {/* Liviano */}
        <div className="bg-hud-card border border-hud-border/70 p-3.5 rounded-lg text-center space-y-1">
          <span className="text-[10px] text-hud-green font-bold block">LIVIANO<br/><small className="text-slate-500 font-normal">(5.0t - 6.5t)</small></span>
          <div className="text-2xl font-display font-extrabold text-white">{categorizedVehicles.liviano}</div>
        </div>

        {/* Sencillo */}
        <div className="bg-hud-card border border-hud-border/70 p-3.5 rounded-lg text-center space-y-1">
          <span className="text-[10px] text-hud-orange font-bold block font-bold">SENCILLO<br/><small className="text-slate-500 font-normal">(6.5t - 10t)</small></span>
          <div className="text-2xl font-display font-extrabold text-white">{categorizedVehicles.sencillo}</div>
        </div>

        {/* Mula */}
        <div className="bg-hud-card border border-hud-border/70 p-3.5 rounded-lg text-center space-y-1">
          <span className="text-[10px] text-rose-400 font-bold block">MULA<br/><small className="text-slate-500 font-normal">(10t - 18t)</small></span>
          <div className="text-2xl font-display font-extrabold text-white">{categorizedVehicles.mula}</div>
        </div>

        {/* Patineta */}
        <div className="bg-hud-card border border-hud-border/70 p-3.5 rounded-lg text-center col-span-2 md:col-span-1 space-y-1 mx-auto w-full">
          <span className="text-[10px] text-indigo-400 font-bold block">PATINETA<br/><small className="text-slate-500 font-normal">(18t - 30t)</small></span>
          <div className="text-2xl font-display font-extrabold text-white">{categorizedVehicles.patineta}</div>
        </div>
      </div>

      {/* Grid of actual vehicles on route */}
      <div className="bg-hud-card border border-hud-border/60 rounded-lg p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h3 className="text-xs font-display font-bold text-white uppercase tracking-widest pl-2 border-l-2 border-hud-accent">
            Censo de Flota Asignada a Solicitudes Activas
          </h3>

          {/* Top-Left controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-905">
              <button
                type="button"
                onClick={() => setVehiclePage(1)}
                disabled={vehiclePage === 1}
                className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 disabled:opacity-20 hover:text-white"
                title="Primera página"
              >
                &laquo;
              </button>
              <button
                type="button"
                onClick={() => setVehiclePage(p => Math.max(1, p - 1))}
                disabled={vehiclePage === 1}
                className="p-0.5 rounded text-slate-400 disabled:opacity-20 hover:text-hud-accent"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <span className="text-[10px] font-bold text-hud-accent px-1">
                {vehiclePage} / {totalVehiclePages}
              </span>

              <button
                type="button"
                onClick={() => setVehiclePage(p => Math.min(totalVehiclePages, p + 1))}
                disabled={vehiclePage === totalVehiclePages}
                className="p-0.5 rounded text-slate-400 disabled:opacity-20 hover:text-hud-accent"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setVehiclePage(totalVehiclePages)}
                disabled={vehiclePage === totalVehiclePages}
                className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 disabled:opacity-20 hover:text-white"
                title="Última página"
              >
                &raquo;
              </button>
            </div>

            <button
              onClick={exportVehiclesToCSV}
              className="bg-hud-accent/10 border border-hud-accent/30 text-hud-accent hover:bg-hud-accent/20 px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider flex items-center gap-1 cursor-pointer font-bold transition-all"
            >
              <FileSpreadsheet className="w-3 h-3 text-hud-accent" /> Excel
            </button>
          </div>
        </div>

        <div className="text-[10px] text-slate-400 font-mono flex justify-between items-center bg-slate-950/40 p-2 rounded border border-slate-900/60">
          <span>Mostrando fletes {activeAssignments.length === 0 ? 0 : (vehiclePage - 1) * itemsPerPage + 1}-{Math.min(activeAssignments.length, vehiclePage * itemsPerPage)}</span>
          <span>Total conductores asignados: <strong className="text-hud-accent">{activeAssignments.length}</strong></span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeAssignments.length === 0 ? (
            <div className="col-span-2 text-center py-6 text-slate-500">
              -- No se registra placa o conductor en fletes actuales --
            </div>
          ) : (
            paginatedAssignments.map(o => {
              // Determine size based on weight
              const size = o.peso <= 5000 ? "Turbo" :
                            o.peso > 5000 && o.peso <= 6500 ? "Liviano" :
                            o.peso > 6500 && o.peso <= 10000 ? "Sencillo" :
                            o.peso > 10000 && o.peso <= 18000 ? "Mula" : "Patineta";
              return (
                <div 
                  key={o.id}
                  onClick={() => onOpenOrder(o)}
                  className="bg-slate-950/60 hover:bg-slate-950 border border-slate-900 rounded p-4 flex gap-4 cursor-pointer hover:border-hud-accent/30 transition-all text-xs"
                >
                  <div className="bg-hud-accent/10 p-3 rounded self-center">
                    <Truck className="w-6 h-6 text-hud-accent" />
                    <div className="text-[9px] font-bold text-center mt-1 text-white">{o.placa}</div>
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <strong className="text-white text-xs">{o.conductor}</strong>
                      <span className="text-[8px] bg-sky-950 text-hud-accent font-bold px-1.5 py-0.5 rounded tracking-wide uppercase">{size}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-slate-400">
                      <div>📞 Cel: <strong className="text-white">{o.celular || "Sin cel."}</strong></div>
                      <div>🚛 Op: <strong className="text-white max-w-28 truncate block">{o.transportadora}</strong></div>
                      <div className="col-span-2 flex items-center gap-1">📍 Dest: <strong className="text-hud-accent">{o.ciudad}</strong></div>
                    </div>

                    <div className="pt-1.5 border-t border-slate-900/60 flex items-center justify-between text-[9px] text-slate-500 font-mono">
                      <span>Masa: <strong>{o.peso.toLocaleString('es-CO')} kg</strong></span>
                      <span>Lote: <strong className="text-hud-green">{o.id}</strong></span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
