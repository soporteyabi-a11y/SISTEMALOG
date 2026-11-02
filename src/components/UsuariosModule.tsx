/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Users, ShieldCheck, Key, Lock, CheckCircle2, XCircle, 
  Clock, Activity, AlertCircle, Database, Server, RefreshCw,
  Search, Filter, UserCheck, ShieldAlert, ArrowRight, UserPlus
} from 'lucide-react';
import { AppUser, Order } from '../types';
import { USERS_ROSTER } from '../data/usersRoster';

interface UsuariosModuleProps {
  currentUser: AppUser | null;
  orders: Order[];
  onSwitchUser?: (user: AppUser) => void;
  onOpenSupabaseModal?: () => void;
}

export default function UsuariosModule({
  currentUser,
  orders,
  onSwitchUser,
  onOpenSupabaseModal
}: UsuariosModuleProps) {
  const [selectedUserEmail, setSelectedUserEmail] = useState<string>(currentUser?.email || 'soporteyabi@gmail.com');
  const [filterAuditoria, setFilterAuditoria] = useState<'todos' | 'creados' | 'modificados'>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  const selectedUser = useMemo(() => {
    return USERS_ROSTER.find(u => u.email === selectedUserEmail) || USERS_ROSTER[0];
  }, [selectedUserEmail]);

  // Extract audit entries from orders
  const auditEntries = useMemo(() => {
    const list: Array<{
      id: string;
      pv: string;
      cliente: string;
      accion: 'CREACIÓN' | 'MODIFICACIÓN' | 'ESTADO';
      autor: string;
      fecha: string;
      detalles: string;
    }> = [];

    orders.forEach(ord => {
      if (ord.creadoPor) {
        list.push({
          id: `${ord.id}-created`,
          pv: ord.pv || ord.id,
          cliente: ord.cliente || 'Sin cliente',
          accion: 'CREACIÓN',
          autor: ord.creadoPor,
          fecha: ord.creadoEn || ord.fechaIngreso || 'Sin fecha',
          detalles: `Registro inicial de solicitud con ${ord.cajas || 0} cjs / ${ord.peso || 0} kg`
        });
      }
      if (ord.modificadoPor) {
        list.push({
          id: `${ord.id}-mod`,
          pv: ord.pv || ord.id,
          cliente: ord.cliente || 'Sin cliente',
          accion: 'MODIFICACIÓN',
          autor: ord.modificadoPor,
          fecha: ord.modificadoEn || 'Reciente',
          detalles: `Actualización de estado operativo: ${ord.estado}`
        });
      }
    });

    return list.sort((a, b) => (b.fecha > a.fecha ? 1 : -1));
  }, [orders]);

  const filteredAudit = useMemo(() => {
    return auditEntries.filter(entry => {
      const matchSearch = entry.pv.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          entry.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          entry.autor.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchSearch) return false;
      if (filterAuditoria === 'creados') return entry.accion === 'CREACIÓN';
      if (filterAuditoria === 'modificados') return entry.accion === 'MODIFICACIÓN';
      return true;
    });
  }, [auditEntries, searchTerm, filterAuditoria]);

  return (
    <div className="space-y-6 pb-12 font-sans">
      
      {/* Top Banner Header */}
      <div className="bg-hud-card border border-hud-border/70 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#00f0b5]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#00f0b5]/20 to-[#04242a] border border-[#00f0b5]/40 text-[#00f0b5] shadow-lg">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#00f0b5] bg-[#00f0b5]/10 px-2 py-0.5 rounded-full border border-[#00f0b5]/20 font-bold">
                  Control de Accesos & Roles RBAC
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  Supabase + Render Ready
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black text-white tracking-wide">
                Gestión de Usuarios & Sellos de Autoría
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Administración de cuentas corporativas autorizadas, permisos por módulo y trazabilidad de ingresos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <div className="text-left font-mono">
                <div className="text-[9px] uppercase tracking-wider text-slate-400">Usuario en Sesión</div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{currentUser?.nombre || 'Washington Quiñones'}</span>
                  <span className="text-[9px] bg-[#00f0b5]/20 text-[#00f0b5] px-1.5 py-0.2 rounded border border-[#00f0b5]/30">
                    {currentUser?.rol || 'SUPER_ADMIN'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Users Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {USERS_ROSTER.map(user => {
          const isCurrent = currentUser?.email.toLowerCase() === user.email.toLowerCase();
          const isSelected = selectedUser.email.toLowerCase() === user.email.toLowerCase();

          return (
            <div 
              key={user.id}
              onClick={() => setSelectedUserEmail(user.email)}
              className={`rounded-2xl p-5 border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                isSelected 
                  ? 'bg-gradient-to-b from-[#04242a] to-[#02161a] border-[#00f0b5] shadow-lg shadow-[#00f0b5]/10' 
                  : 'bg-hud-card/80 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center font-black font-mono text-sm border shadow-inner"
                  style={{
                    backgroundColor: `${user.color}15`,
                    borderColor: `${user.color}50`,
                    color: user.color
                  }}
                >
                  {user.avatar}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {user.rol === 'SUPER_ADMIN' ? (
                    <span className="text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full bg-[#00f0b5]/20 border border-[#00f0b5]/50 text-[#00f0b5]">
                      Propietario & Admin
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
                      {user.rol}
                    </span>
                  )}
                  {isCurrent && (
                    <span className="text-[8px] font-mono font-bold text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> ACTIVO AHORA
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-1 mb-4">
                <h3 className="text-sm font-black text-white group-hover:text-[#00f0b5] transition-colors">
                  {user.nombre}
                </h3>
                <p className="text-[11px] text-teal-300/80 font-medium">
                  {user.cargo}
                </p>
                <p className="text-[10px] text-slate-400 font-mono truncate" title={user.email}>
                  {user.email}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>Módulos con acceso:</span>
                  <span className="text-[#00f0b5] font-bold">
                    {user.rol === 'SUPER_ADMIN' ? 'Todos (100%)' : `${user.modulosPermitidos.length} módulos`}
                  </span>
                </div>

                {onSwitchUser && !isCurrent && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSwitchUser(user);
                    }}
                    className="w-full mt-2 py-1.5 px-2 bg-slate-900 hover:bg-[#00f0b5]/20 border border-slate-800 hover:border-[#00f0b5]/50 text-slate-300 hover:text-[#00f0b5] rounded-lg text-[10px] font-mono font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Probar Vista de {user.nombre.split(' ')[0]}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Section: Selected User Privileges and Module Permissions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* User Card & Capabilities */}
        <div className="bg-hud-card border border-hud-border/70 rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center font-black font-mono text-base border"
              style={{
                backgroundColor: `${selectedUser.color}20`,
                borderColor: `${selectedUser.color}60`,
                color: selectedUser.color
              }}
            >
              {selectedUser.avatar}
            </div>
            <div>
              <h2 className="text-base font-black text-white">{selectedUser.nombre}</h2>
              <p className="text-xs text-slate-400">{selectedUser.cargo}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold">
              Privilegios Operativos
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-300">Crear & Radicar Órdenes</span>
                {selectedUser.permisos.puedeCrearOrdenes ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-300">Editar Fletes & Tarifas</span>
                {selectedUser.permisos.puedeEditarFletes ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-300">Ver Finanzas & Rentabilidad</span>
                {selectedUser.permisos.puedeVerFinanzas ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-300">Gestionar Nómina & Horas Extras</span>
                {selectedUser.permisos.puedeGestionarNomina ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-300">Administración de Usuarios</span>
                {selectedUser.permisos.puedeGestionarUsuarios ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/90 border border-[#00f0b5]/20 text-[11px] font-mono text-slate-300 space-y-1">
            <div className="text-[#00f0b5] font-bold uppercase tracking-wider text-[10px]">
              Sello de Auditoría Activo
            </div>
            <p className="text-slate-400">
              Cada acción realizada por {selectedUser.nombre} queda firmada con:
            </p>
            <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] text-teal-300 font-mono select-all">
              creadoPor: "{selectedUser.nombre} ({selectedUser.email})"
            </div>
          </div>
        </div>

        {/* Audit Log / Trazabilidad de ingresos */}
        <div className="lg:col-span-2 bg-hud-card border border-hud-border/70 rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h2 className="text-base font-black text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#00f0b5]" /> Trazabilidad & Auditoría de Ingresos
                </h2>
                <p className="text-xs text-slate-400">
                  Historial de registros y modificaciones generadas con firma de autor.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Buscar PV, cliente o autor..."
                    className="bg-slate-950 border border-slate-800 text-white rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono outline-none focus:border-[#00f0b5]"
                  />
                </div>

                <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => setFilterAuditoria('todos')}
                    className={`px-2 py-1 rounded cursor-pointer ${filterAuditoria === 'todos' ? 'bg-[#00f0b5] text-slate-950 font-bold' : 'text-slate-400'}`}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterAuditoria('creados')}
                    className={`px-2 py-1 rounded cursor-pointer ${filterAuditoria === 'creados' ? 'bg-[#00f0b5] text-slate-950 font-bold' : 'text-slate-400'}`}
                  >
                    Creaciones
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterAuditoria('modificados')}
                    className={`px-2 py-1 rounded cursor-pointer ${filterAuditoria === 'modificados' ? 'bg-[#00f0b5] text-slate-950 font-bold' : 'text-slate-400'}`}
                  >
                    Estados
                  </button>
                </div>
              </div>
            </div>

            {/* Audit List Table */}
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto space-y-2 pr-1">
              {filteredAudit.length === 0 ? (
                <div className="text-center py-12 text-slate-500 font-mono text-xs">
                  No hay registros de auditoría que coincidan con la búsqueda.
                  <p className="text-[10px] text-slate-600 mt-1">
                    Los nuevos fletes, órdenes y horas extras creados llevarán automáticamente el sello del usuario.
                  </p>
                </div>
              ) : (
                filteredAudit.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-all flex items-center justify-between gap-4 text-xs font-mono"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                        item.accion === 'CREACIÓN'
                          ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                          : 'bg-sky-500/10 border border-sky-500/30 text-sky-400'
                      }`}>
                        {item.accion}
                      </span>
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>PV: {item.pv}</span>
                          <span className="text-slate-400 font-normal">| {item.cliente}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">{item.detalles}</div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[#00f0b5] font-bold text-[11px]">{item.autor}</div>
                      <div className="text-[10px] text-slate-500">{item.fecha}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Database Migration to Supabase + Render notification */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-[#02161a] to-[#04242a] border border-[#00f0b5]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Server className="w-5 h-5 text-[#00f0b5]" />
              <div>
                <div className="text-xs font-bold text-white">Migración a Supabase + Render</div>
                <div className="text-[10px] text-slate-400">
                  Firebase se utiliza en modo extracción de datos históricos. Toda nueva autenticación y tablas están estructuradas para PostgreSQL / Render.
                </div>
              </div>
            </div>
            {onOpenSupabaseModal && (
              <button
                type="button"
                onClick={onOpenSupabaseModal}
                className="px-3 py-1.5 bg-[#00f0b5] text-slate-950 hover:bg-[#00f0b5]/90 rounded-lg text-xs font-mono font-black transition-all cursor-pointer whitespace-nowrap shadow"
              >
                Ver Estado Supabase
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
