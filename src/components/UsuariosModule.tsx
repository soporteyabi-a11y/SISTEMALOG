/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, ShieldCheck, Key, Lock, CheckCircle2, XCircle, 
  Clock, Activity, AlertCircle, Database, Server, RefreshCw,
  Search, Filter, UserCheck, ShieldAlert, ArrowRight, UserPlus,
  Edit3, Save, Plus, Trash2, Settings, Check, CheckSquare, Square,
  Layers, ChevronRight, X, AlertTriangle, Sparkles
} from 'lucide-react';
import { AppUser, Order, UserRole } from '../types';
import { 
  USERS_ROSTER, 
  loadUsersRoster, 
  saveUsersRoster, 
  SYSTEM_MODULES_LIST, 
  SystemModuleInfo 
} from '../data/usersRoster';

interface UsuariosModuleProps {
  currentUser: AppUser | null;
  orders: Order[];
  onSwitchUser?: (user: AppUser) => void;
  onOpenSupabaseModal?: () => void;
  onUpdateUsersRoster?: (users: AppUser[]) => void;
}

export default function UsuariosModule({
  currentUser,
  orders,
  onSwitchUser,
  onOpenSupabaseModal,
  onUpdateUsersRoster
}: UsuariosModuleProps) {
  // State for all team users (loaded from persistent storage or initial roster)
  const [usersList, setUsersList] = useState<AppUser[]>(() => loadUsersRoster());
  const [selectedUserEmail, setSelectedUserEmail] = useState<string>(() => {
    return currentUser?.email || 'soporteyabi@gmail.com';
  });

  const [filterAuditoria, setFilterAuditoria] = useState<'todos' | 'creados' | 'modificados'>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Modal State for Editing User & Permissions
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  // Modal State for Creating New User
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState<{
    nombre: string;
    email: string;
    cargo: string;
    departamento: string;
    rol: UserRole;
    color: string;
  }>({
    nombre: '',
    email: '',
    cargo: '',
    departamento: 'Operaciones & Logística',
    rol: 'AUXILIAR_LOGISTICO',
    color: '#38bdf8'
  });

  const triggerToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Selected user resolution
  const selectedUser = useMemo(() => {
    return usersList.find(u => u.email.toLowerCase() === selectedUserEmail.toLowerCase()) || usersList[0];
  }, [usersList, selectedUserEmail]);

  // Persist whenever usersList changes
  const updateUsers = (newUsers: AppUser[], toastNotice?: string) => {
    setUsersList(newUsers);
    saveUsersRoster(newUsers);
    if (onUpdateUsersRoster) {
      onUpdateUsersRoster(newUsers);
    }
    if (toastNotice) {
      triggerToast(toastNotice, 'success');
    }
  };

  // Quick Inline Toggle for Operational Privileges
  const handleTogglePrivilege = (userId: string, privilegeKey: keyof AppUser['permisos'], e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // Prevent removing super admin permissions from Washington
    if (userId === 'user_washington' && privilegeKey === 'puedeGestionarUsuarios') {
      triggerToast('El Propietario principal debe conservar la administración de usuarios', 'error');
      return;
    }

    const updated = usersList.map(u => {
      if (u.id === userId) {
        const currentVal = u.permisos[privilegeKey];
        return {
          ...u,
          permisos: {
            ...u.permisos,
            [privilegeKey]: !currentVal
          }
        };
      }
      return u;
    });

    const targetUser = usersList.find(u => u.id === userId);
    const newStatus = !targetUser?.permisos[privilegeKey];
    updateUsers(updated, `Permiso actualizado para ${targetUser?.nombre}: ${newStatus ? 'Habilitado' : 'Deshabilitado'}`);
  };

  // Open Edit Modal for a specific user
  const handleOpenEditUser = (user: AppUser, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingUser(JSON.parse(JSON.stringify(user)));
    setIsEditModalOpen(true);
  };

  // Toggle Module in the editing modal
  const handleToggleModuleInEdit = (moduleAlias: string) => {
    if (!editingUser) return;
    const current = editingUser.modulosPermitidos || [];
    const exists = current.some(m => m.toLowerCase() === moduleAlias.toLowerCase());
    
    let nextList: string[];
    if (exists) {
      nextList = current.filter(m => m.toLowerCase() !== moduleAlias.toLowerCase());
    } else {
      nextList = [...current, moduleAlias];
    }

    setEditingUser({
      ...editingUser,
      modulosPermitidos: nextList
    });
  };

  // Select all or deselect all modules in the edit modal
  const handleSetAllModules = (enableAll: boolean) => {
    if (!editingUser) return;
    if (enableAll) {
      const allAliases = Array.from(new Set(SYSTEM_MODULES_LIST.flatMap(m => m.aliases)));
      setEditingUser({
        ...editingUser,
        modulosPermitidos: allAliases
      });
    } else {
      setEditingUser({
        ...editingUser,
        modulosPermitidos: ['inicio', 'tablero'] // Always keep home
      });
    }
  };

  // Save changes from Edit Modal
  const handleSaveEditedUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    if (!editingUser.nombre.trim() || !editingUser.email.trim()) {
      triggerToast('El nombre y el correo no pueden estar vacíos', 'error');
      return;
    }

    const updated = usersList.map(u => u.id === editingUser.id ? editingUser : u);
    updateUsers(updated, `Asignaciones de ${editingUser.nombre} guardadas con éxito`);
    setIsEditModalOpen(false);
  };

  // Create new user handler
  const handleCreateNewUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.nombre.trim() || !newUserForm.email.trim()) {
      triggerToast('Ingrese nombre y correo válidos', 'error');
      return;
    }

    const cleanEmail = newUserForm.email.trim().toLowerCase();
    if (usersList.some(u => u.email.toLowerCase() === cleanEmail)) {
      triggerToast('Ya existe un usuario con este correo electrónico', 'error');
      return;
    }

    const initials = newUserForm.nombre
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('') || 'US';

    const defaultModules = newUserForm.rol === 'SUPER_ADMIN' 
      ? Array.from(new Set(SYSTEM_MODULES_LIST.flatMap(m => m.aliases)))
      : ['inicio', 'tablero', 'orders', 'facturacion', 'despachados', 'despachado', 'pendientes', 'pendiente'];

    const newUser: AppUser = {
      id: `user_${Date.now().toString(36)}`,
      email: cleanEmail,
      nombre: newUserForm.nombre.trim(),
      rol: newUserForm.rol,
      cargo: newUserForm.cargo.trim() || 'Colaborador Logístico',
      departamento: newUserForm.departamento.trim() || 'Operaciones',
      avatar: initials,
      color: newUserForm.color,
      modulosPermitidos: defaultModules,
      permisos: {
        puedeCrearOrdenes: true,
        puedeEditarFletes: newUserForm.rol === 'SUPER_ADMIN' || newUserForm.rol === 'LOGISTICA',
        puedeVerFinanzas: newUserForm.rol === 'SUPER_ADMIN',
        puedeGestionarNomina: newUserForm.rol === 'SUPER_ADMIN' || newUserForm.rol === 'SST_TALENTO',
        puedeGestionarUsuarios: newUserForm.rol === 'SUPER_ADMIN',
        puedeExportarDatos: true,
      }
    };

    const updated = [...usersList, newUser];
    updateUsers(updated, `Nuevo usuario ${newUser.nombre} registrado exitosamente`);
    setSelectedUserEmail(newUser.email);
    setIsNewUserModalOpen(false);
    setNewUserForm({
      nombre: '',
      email: '',
      cargo: '',
      departamento: 'Operaciones & Logística',
      rol: 'AUXILIAR_LOGISTICO',
      color: '#38bdf8'
    });
  };

  // Delete user handler
  const handleDeleteUser = (userId: string, userName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (userId === 'user_washington') {
      triggerToast('No se puede eliminar la cuenta del Propietario y Administrador Principal', 'error');
      return;
    }

    if (window.confirm(`¿Está seguro de eliminar la cuenta de ${userName}? Perderá el acceso al sistema.`)) {
      const updated = usersList.filter(u => u.id !== userId);
      updateUsers(updated, `Usuario ${userName} eliminado del equipo`);
      setSelectedUserEmail(updated[0]?.email || 'soporteyabi@gmail.com');
    }
  };

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

  // Group modules by category for the permissions modal
  const modulesByCategory = useMemo(() => {
    const groups: Record<string, SystemModuleInfo[]> = {};
    SYSTEM_MODULES_LIST.forEach(m => {
      if (!groups[m.categoria]) groups[m.categoria] = [];
      groups[m.categoria].push(m);
    });
    return groups;
  }, []);

  return (
    <div className="space-y-6 pb-12 font-sans relative">

      {/* Floating Toast Message */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-[99999] px-5 py-3 rounded-xl text-xs font-mono font-bold shadow-2xl border flex items-center gap-2.5 animate-bounce ${
          toastMessage.type === 'error'
            ? 'bg-rose-950 text-rose-200 border-rose-500'
            : toastMessage.type === 'info'
            ? 'bg-slate-900 text-cyan-300 border-cyan-500'
            : 'bg-[#04242a] text-[#00f0b5] border-[#00f0b5] shadow-[0_0_20px_rgba(0,240,181,0.3)]'
        }`}>
          <span>{toastMessage.type === 'error' ? '❌' : '✅'}</span>
          <span>{toastMessage.text}</span>
        </div>
      )}
      
      {/* Top Banner Header */}
      <div className="bg-hud-card border border-[#00f0b5]/30 rounded-2xl p-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-[#00f0b5]/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-[#00f0b5]/20 to-[#04242a] border border-[#00f0b5]/40 text-[#00f0b5] shadow-[0_0_20px_rgba(0,240,181,0.2)]">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono uppercase tracking-widest text-[#00f0b5] bg-[#00f0b5]/10 px-2 py-0.5 rounded-full border border-[#00f0b5]/30 font-bold">
                  Control de Accesos & Roles RBAC
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  Edición Dinámica de Asignaciones
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black text-white tracking-wide">
                Gestión de Usuarios & Asignaciones de Privilegios
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Modifica en tiempo real los permisos operativos y módulos autorizados para cada colaborador de Sistemalog.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsNewUserModalOpen(true)}
              className="bg-[#00f0b5] hover:bg-[#25ffcb] text-slate-950 px-4 py-2.5 rounded-xl font-mono text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-[0_0_15px_rgba(0,240,181,0.35)] cursor-pointer transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Nuevo Colaborador</span>
            </button>

            <div className="bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-2 flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-[#00f0b5] animate-pulse" />
              <div className="text-left font-mono">
                <div className="text-[8.5px] uppercase tracking-wider text-slate-400">Usuario Activo</div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{currentUser?.nombre || 'Washington Quiñones'}</span>
                  <span className="text-[8.5px] bg-[#00f0b5]/20 text-[#00f0b5] px-1.5 py-0.2 rounded border border-[#00f0b5]/30">
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
        {usersList.map(user => {
          const isCurrent = currentUser?.email.toLowerCase() === user.email.toLowerCase();
          const isSelected = selectedUser.email.toLowerCase() === user.email.toLowerCase();

          return (
            <div 
              key={user.id}
              onClick={() => setSelectedUserEmail(user.email)}
              className={`rounded-2xl p-5 border transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between group ${
                isSelected 
                  ? 'bg-gradient-to-b from-[#04242a] to-[#02161a] border-[#00f0b5] shadow-lg shadow-[#00f0b5]/15' 
                  : 'bg-hud-card/90 border-slate-800/80 hover:border-[#00f0b5]/40 hover:bg-[#031d22]/50'
              }`}
            >
              <div>
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
                      <span className="text-[8px] font-mono font-bold text-[#00f0b5] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00f0b5]"></span> EN SESIÓN
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1 mb-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-white group-hover:text-[#00f0b5] transition-colors">
                      {user.nombre}
                    </h3>
                  </div>
                  <p className="text-[11px] text-teal-300/80 font-medium">
                    {user.cargo}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono truncate" title={user.email}>
                    {user.email}
                  </p>
                </div>

                {/* Quick privileges tags on card */}
                <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-850/80 mb-3 space-y-1 text-[10px] font-mono">
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Órdenes / Solicitudes:</span>
                    <span className={user.permisos.puedeCrearOrdenes ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
                      {user.permisos.puedeCrearOrdenes ? 'Habilitado' : 'Sin acceso'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Fletes & Tarifas:</span>
                    <span className={user.permisos.puedeEditarFletes ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
                      {user.permisos.puedeEditarFletes ? 'Habilitado' : 'Sin acceso'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Nómina & H. Extras:</span>
                    <span className={user.permisos.puedeGestionarNomina ? 'text-emerald-400 font-bold' : 'text-slate-600'}>
                      {user.permisos.puedeGestionarNomina ? 'Habilitado' : 'Sin acceso'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>Módulos con acceso:</span>
                  <span className="text-[#00f0b5] font-bold">
                    {user.rol === 'SUPER_ADMIN' ? 'Todos (100%)' : `${user.modulosPermitidos.length} módulos`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={(e) => handleOpenEditUser(user, e)}
                    className="py-1.5 px-2 bg-[#04242a] hover:bg-[#06333c] border border-[#00f0b5]/30 hover:border-[#00f0b5] text-[#00f0b5] rounded-lg text-[10px] font-mono font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                    title="Editar asignaciones, privilegios y módulos de este usuario"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Editar</span>
                  </button>

                  {onSwitchUser ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSwitchUser(user);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold transition-all flex items-center justify-center gap-1 cursor-pointer border ${
                        isCurrent
                          ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                      }`}
                      title="Probar vista de permisos de este usuario"
                    >
                      <UserCheck className="w-3 h-3" />
                      <span>{isCurrent ? 'Actual' : 'Probar'}</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Section: Selected User Privileges and Module Permissions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* User Card & Interactive Capabilities (User requested this to be directly editable!) */}
        <div className="bg-hud-card border border-[#00f0b5]/30 rounded-2xl p-6 space-y-5 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center font-black font-mono text-base border shadow-md"
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
                <p className="text-xs text-[#00f0b5] font-medium">{selectedUser.cargo}</p>
                <p className="text-[10px] text-slate-400 font-mono">{selectedUser.departamento}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleOpenEditUser(selectedUser)}
              className="px-3 py-1.5 bg-[#00f0b5]/15 hover:bg-[#00f0b5]/25 border border-[#00f0b5]/40 text-[#00f0b5] rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
              title="Abrir editor completo de privilegios y módulos"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Editar Asignaciones</span>
            </button>
          </div>

          {/* Interactive Privileges Switch List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#00f0b5] font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#00f0b5]" />
                Privilegios Operativos (Haz clic para alternar)
              </span>
              <span className="text-[9px] text-slate-400 font-mono">Edición rápida</span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              {/* 1. Crear & Radicar Órdenes */}
              <div 
                onClick={() => handleTogglePrivilege(selectedUser.id, 'puedeCrearOrdenes')}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedUser.permisos.puedeCrearOrdenes
                    ? 'bg-[#04242a]/90 border-[#00f0b5]/40 text-white shadow-sm hover:border-[#00f0b5]'
                    : 'bg-slate-950/70 border-slate-800/80 text-slate-400 hover:border-slate-700'
                }`}
                title="Haga clic para activar o desactivar este permiso"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${selectedUser.permisos.puedeCrearOrdenes ? 'bg-[#00f0b5] shadow-[0_0_8px_#00f0b5]' : 'bg-slate-600'}`} />
                  <span className="font-bold">Crear & Radicar Órdenes</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase ${selectedUser.permisos.puedeCrearOrdenes ? 'text-[#00f0b5]' : 'text-rose-400'}`}>
                    {selectedUser.permisos.puedeCrearOrdenes ? 'Permitido' : 'Bloqueado'}
                  </span>
                  {selectedUser.permisos.puedeCrearOrdenes ? (
                    <CheckCircle2 className="w-4 h-4 text-[#00f0b5]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                </div>
              </div>

              {/* 2. Editar Fletes & Tarifas */}
              <div 
                onClick={() => handleTogglePrivilege(selectedUser.id, 'puedeEditarFletes')}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedUser.permisos.puedeEditarFletes
                    ? 'bg-[#04242a]/90 border-[#00f0b5]/40 text-white shadow-sm hover:border-[#00f0b5]'
                    : 'bg-slate-950/70 border-slate-800/80 text-slate-400 hover:border-slate-700'
                }`}
                title="Haga clic para activar o desactivar este permiso"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${selectedUser.permisos.puedeEditarFletes ? 'bg-[#00f0b5] shadow-[0_0_8px_#00f0b5]' : 'bg-slate-600'}`} />
                  <span className="font-bold">Editar Fletes & Tarifas</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase ${selectedUser.permisos.puedeEditarFletes ? 'text-[#00f0b5]' : 'text-rose-400'}`}>
                    {selectedUser.permisos.puedeEditarFletes ? 'Permitido' : 'Bloqueado'}
                  </span>
                  {selectedUser.permisos.puedeEditarFletes ? (
                    <CheckCircle2 className="w-4 h-4 text-[#00f0b5]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                </div>
              </div>

              {/* 3. Ver Finanzas & Rentabilidad */}
              <div 
                onClick={() => handleTogglePrivilege(selectedUser.id, 'puedeVerFinanzas')}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedUser.permisos.puedeVerFinanzas
                    ? 'bg-[#04242a]/90 border-[#00f0b5]/40 text-white shadow-sm hover:border-[#00f0b5]'
                    : 'bg-slate-950/70 border-slate-800/80 text-slate-400 hover:border-slate-700'
                }`}
                title="Haga clic para activar o desactivar este permiso"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${selectedUser.permisos.puedeVerFinanzas ? 'bg-[#00f0b5] shadow-[0_0_8px_#00f0b5]' : 'bg-slate-600'}`} />
                  <span className="font-bold">Ver Finanzas & Rentabilidad</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase ${selectedUser.permisos.puedeVerFinanzas ? 'text-[#00f0b5]' : 'text-rose-400'}`}>
                    {selectedUser.permisos.puedeVerFinanzas ? 'Permitido' : 'Bloqueado'}
                  </span>
                  {selectedUser.permisos.puedeVerFinanzas ? (
                    <CheckCircle2 className="w-4 h-4 text-[#00f0b5]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                </div>
              </div>

              {/* 4. Gestionar Nómina & Horas Extras */}
              <div 
                onClick={() => handleTogglePrivilege(selectedUser.id, 'puedeGestionarNomina')}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedUser.permisos.puedeGestionarNomina
                    ? 'bg-[#04242a]/90 border-[#00f0b5]/40 text-white shadow-sm hover:border-[#00f0b5]'
                    : 'bg-slate-950/70 border-slate-800/80 text-slate-400 hover:border-slate-700'
                }`}
                title="Haga clic para activar o desactivar este permiso"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${selectedUser.permisos.puedeGestionarNomina ? 'bg-[#00f0b5] shadow-[0_0_8px_#00f0b5]' : 'bg-slate-600'}`} />
                  <span className="font-bold">Gestionar Nómina & Horas Extras</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase ${selectedUser.permisos.puedeGestionarNomina ? 'text-[#00f0b5]' : 'text-rose-400'}`}>
                    {selectedUser.permisos.puedeGestionarNomina ? 'Permitido' : 'Bloqueado'}
                  </span>
                  {selectedUser.permisos.puedeGestionarNomina ? (
                    <CheckCircle2 className="w-4 h-4 text-[#00f0b5]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                </div>
              </div>

              {/* 5. Administración de Usuarios */}
              <div 
                onClick={() => handleTogglePrivilege(selectedUser.id, 'puedeGestionarUsuarios')}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                  selectedUser.permisos.puedeGestionarUsuarios
                    ? 'bg-[#04242a]/90 border-[#00f0b5]/40 text-white shadow-sm hover:border-[#00f0b5]'
                    : 'bg-slate-950/70 border-slate-800/80 text-slate-400 hover:border-slate-700'
                }`}
                title="Haga clic para activar o desactivar este permiso"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${selectedUser.permisos.puedeGestionarUsuarios ? 'bg-[#00f0b5] shadow-[0_0_8px_#00f0b5]' : 'bg-slate-600'}`} />
                  <span className="font-bold">Administración de Usuarios</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase ${selectedUser.permisos.puedeGestionarUsuarios ? 'text-[#00f0b5]' : 'text-rose-400'}`}>
                    {selectedUser.permisos.puedeGestionarUsuarios ? 'Permitido' : 'Bloqueado'}
                  </span>
                  {selectedUser.permisos.puedeGestionarUsuarios ? (
                    <CheckCircle2 className="w-4 h-4 text-[#00f0b5]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sello de Auditoría Activo */}
          <div className="p-4 rounded-xl bg-slate-950/90 border border-[#00f0b5]/20 text-[11px] font-mono text-slate-300 space-y-1.5">
            <div className="text-[#00f0b5] font-bold uppercase tracking-wider text-[10px] flex items-center justify-between">
              <span>Sello de Auditoría Activo</span>
              <span className="text-[9px] text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-500/30">EN LÍNEA</span>
            </div>
            <p className="text-slate-400 text-[10px]">
              Toda creación o cambio ejecutado por <strong className="text-white">{selectedUser.nombre}</strong> queda registrado con:
            </p>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-teal-300 font-mono select-all">
              creadoPor: "{selectedUser.nombre} ({selectedUser.email})"
            </div>
            {(selectedUser.id === 'user_juan' || selectedUser.id === 'user_antonio' || selectedUser.nombre.toLowerCase().includes('antonio') || selectedUser.nombre.toLowerCase().includes('juan')) && (
              <div className="p-2.5 rounded-lg bg-[#04242a] border border-[#00f0b5]/40 text-[9.5px] text-[#00f0b5] font-mono leading-tight">
                ℹ️ <strong>Terminal Compartida de Registro:</strong> Juan Carlos y Antonio no necesitan correo propio; pueden registrar directamente sus turnos en el módulo de Horas Extras seleccionando su nombre con un clic en la estación compartida de Julian.
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => handleOpenEditUser(selectedUser)}
              className="w-full bg-[#04242a] hover:bg-[#00f0b5] text-[#00f0b5] hover:text-slate-950 border border-[#00f0b5]/50 py-3 rounded-xl font-mono text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Settings className="w-4 h-4" />
              <span>Configurar Módulos y Accesos Completos</span>
            </button>
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
                <div className="text-xs font-bold text-white">Infraestructura Supabase + Render</div>
                <div className="text-[10px] text-slate-400">
                  Firebase se utiliza exclusivamente para extracción de datos maestros. La autenticación y roles quedan preparados para el motor PostgreSQL.
                </div>
              </div>
            </div>
            {onOpenSupabaseModal && (
              <button
                type="button"
                onClick={onOpenSupabaseModal}
                className="px-3 py-1.5 bg-[#00f0b5] text-slate-950 hover:bg-[#25ffcb] rounded-lg text-xs font-mono font-black transition-all cursor-pointer whitespace-nowrap shadow"
              >
                Ver Estado Supabase
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ✏️ MODAL: EDITAR ASIGNACIONES, PRIVILEGIOS Y MÓDULOS DEL USUARIO           */}
      {/* ========================================================================= */}
      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 z-[11000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#02161a] border-2 border-[#00f0b5]/50 rounded-2xl max-w-3xl w-full p-6 text-slate-200 shadow-2xl relative my-auto animate-fade-in font-sans space-y-5 max-h-[90vh] overflow-y-auto">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-black font-mono text-sm border shadow"
                  style={{
                    backgroundColor: `${editingUser.color}20`,
                    borderColor: `${editingUser.color}60`,
                    color: editingUser.color
                  }}
                >
                  {editingUser.avatar}
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>Editar Asignaciones:</span>
                    <span className="text-[#00f0b5]">{editingUser.nombre}</span>
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    {editingUser.email} • {editingUser.cargo}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedUser} className="space-y-6">
              
              {/* Profile Details Inputs */}
              <div className="bg-[#04242a] p-4 rounded-xl border border-[#00f0b5]/20 space-y-3">
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#00f0b5] font-bold">
                  1. Datos del Colaborador
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs font-mono">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Nombre Completo</label>
                    <input
                      type="text"
                      value={editingUser.nombre}
                      onChange={e => setEditingUser({ ...editingUser, nombre: e.target.value })}
                      className="w-full bg-[#02161a] border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-[#00f0b5]"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      value={editingUser.email}
                      onChange={e => setEditingUser({ ...editingUser, email: e.target.value })}
                      className="w-full bg-[#02161a] border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-[#00f0b5]"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Cargo / Posición</label>
                    <input
                      type="text"
                      value={editingUser.cargo}
                      onChange={e => setEditingUser({ ...editingUser, cargo: e.target.value })}
                      className="w-full bg-[#02161a] border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-[#00f0b5]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Departamento</label>
                    <input
                      type="text"
                      value={editingUser.departamento}
                      onChange={e => setEditingUser({ ...editingUser, departamento: e.target.value })}
                      className="w-full bg-[#02161a] border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-[#00f0b5]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Rol en Sistema</label>
                    <select
                      value={editingUser.rol}
                      onChange={e => setEditingUser({ ...editingUser, rol: e.target.value as UserRole })}
                      className="w-full bg-[#02161a] border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-[#00f0b5] cursor-pointer"
                    >
                      <option value="SUPER_ADMIN">SUPER_ADMIN (Propietario / Acceso Total)</option>
                      <option value="AUXILIAR_LOGISTICO">AUXILIAR_LOGISTICO (Operaciones & Despacho)</option>
                      <option value="LOGISTICA">LOGISTICA (Coordinación de Transporte)</option>
                      <option value="SST_TALENTO">SST_TALENTO (SST & Talento Humano)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Color Distintivo</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editingUser.color}
                        onChange={e => setEditingUser({ ...editingUser, color: e.target.value })}
                        className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                      />
                      <span className="text-[11px] text-slate-300">{editingUser.color}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Privilegios Operativos Toggles */}
              <div className="bg-[#04242a] p-4 rounded-xl border border-[#00f0b5]/20 space-y-3">
                <div className="text-[11px] font-mono uppercase tracking-wider text-[#00f0b5] font-bold">
                  2. Privilegios Operativos Directos
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs font-mono">
                  {/* Crear órdenes */}
                  <label className="flex items-center justify-between p-3 rounded-lg bg-[#02161a] border border-slate-800 hover:border-slate-700 cursor-pointer select-none">
                    <span className="text-slate-200">Crear & Radicar Órdenes</span>
                    <input
                      type="checkbox"
                      checked={editingUser.permisos.puedeCrearOrdenes}
                      onChange={e => setEditingUser({
                        ...editingUser,
                        permisos: { ...editingUser.permisos, puedeCrearOrdenes: e.target.checked }
                      })}
                      className="w-4 h-4 accent-[#00f0b5] cursor-pointer"
                    />
                  </label>

                  {/* Editar fletes */}
                  <label className="flex items-center justify-between p-3 rounded-lg bg-[#02161a] border border-slate-800 hover:border-slate-700 cursor-pointer select-none">
                    <span className="text-slate-200">Editar Fletes & Tarifas</span>
                    <input
                      type="checkbox"
                      checked={editingUser.permisos.puedeEditarFletes}
                      onChange={e => setEditingUser({
                        ...editingUser,
                        permisos: { ...editingUser.permisos, puedeEditarFletes: e.target.checked }
                      })}
                      className="w-4 h-4 accent-[#00f0b5] cursor-pointer"
                    />
                  </label>

                  {/* Ver finanzas */}
                  <label className="flex items-center justify-between p-3 rounded-lg bg-[#02161a] border border-slate-800 hover:border-slate-700 cursor-pointer select-none">
                    <span className="text-slate-200">Ver Finanzas & Rentabilidad</span>
                    <input
                      type="checkbox"
                      checked={editingUser.permisos.puedeVerFinanzas}
                      onChange={e => setEditingUser({
                        ...editingUser,
                        permisos: { ...editingUser.permisos, puedeVerFinanzas: e.target.checked }
                      })}
                      className="w-4 h-4 accent-[#00f0b5] cursor-pointer"
                    />
                  </label>

                  {/* Gestionar nómina */}
                  <label className="flex items-center justify-between p-3 rounded-lg bg-[#02161a] border border-slate-800 hover:border-slate-700 cursor-pointer select-none">
                    <span className="text-slate-200">Gestionar Nómina & H. Extras</span>
                    <input
                      type="checkbox"
                      checked={editingUser.permisos.puedeGestionarNomina}
                      onChange={e => setEditingUser({
                        ...editingUser,
                        permisos: { ...editingUser.permisos, puedeGestionarNomina: e.target.checked }
                      })}
                      className="w-4 h-4 accent-[#00f0b5] cursor-pointer"
                    />
                  </label>

                  {/* Administrar usuarios */}
                  <label className="flex items-center justify-between p-3 rounded-lg bg-[#02161a] border border-slate-800 hover:border-slate-700 cursor-pointer select-none">
                    <span className="text-slate-200">Administración de Usuarios</span>
                    <input
                      type="checkbox"
                      checked={editingUser.permisos.puedeGestionarUsuarios}
                      onChange={e => setEditingUser({
                        ...editingUser,
                        permisos: { ...editingUser.permisos, puedeGestionarUsuarios: e.target.checked }
                      })}
                      className="w-4 h-4 accent-[#00f0b5] cursor-pointer"
                    />
                  </label>

                  {/* Exportar datos */}
                  <label className="flex items-center justify-between p-3 rounded-lg bg-[#02161a] border border-slate-800 hover:border-slate-700 cursor-pointer select-none">
                    <span className="text-slate-200">Exportar Datos (Excel/CSV)</span>
                    <input
                      type="checkbox"
                      checked={editingUser.permisos.puedeExportarDatos}
                      onChange={e => setEditingUser({
                        ...editingUser,
                        permisos: { ...editingUser.permisos, puedeExportarDatos: e.target.checked }
                      })}
                      className="w-4 h-4 accent-[#00f0b5] cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Módulos con Acceso Asignado Checkboxes */}
              <div className="bg-[#04242a] p-4 rounded-xl border border-[#00f0b5]/20 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-mono uppercase tracking-wider text-[#00f0b5] font-bold block">
                      3. Asignación de Módulos del Sistema
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Selecciona qué pantallas y herramientas podrá ver y abrir este usuario en su menú
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSetAllModules(true)}
                      className="px-2.5 py-1 bg-[#00f0b5]/20 hover:bg-[#00f0b5]/30 border border-[#00f0b5]/40 text-[#00f0b5] rounded text-[10px] font-mono font-bold cursor-pointer"
                    >
                      Marcar Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetAllModules(false)}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 rounded text-[10px] font-mono font-bold cursor-pointer"
                    >
                      Desmarcar Todos
                    </button>
                  </div>
                </div>

                {/* Categorized module checkboxes */}
                <div className="space-y-4 pt-1">
                  {Object.entries(modulesByCategory).map(([category, modules]) => (
                    <div key={category} className="space-y-2">
                      <div className="text-[10px] font-mono font-black uppercase text-teal-300 tracking-wider flex items-center gap-1.5 border-b border-slate-800/80 pb-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00f0b5]" />
                        <span>{category}</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {modules.map(mod => {
                          const isAssigned = mod.aliases.some(alias => 
                            editingUser.modulosPermitidos.some(userAlias => userAlias.toLowerCase() === alias.toLowerCase())
                          );

                          return (
                            <label
                              key={mod.id}
                              className={`flex items-start gap-2.5 p-2 rounded-lg border transition-all cursor-pointer select-none ${
                                isAssigned 
                                  ? 'bg-[#02161a] border-[#00f0b5]/40 text-white' 
                                  : 'bg-slate-950/40 border-slate-850 text-slate-500 hover:border-slate-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isAssigned}
                                onChange={() => handleToggleModuleInEdit(mod.id)}
                                className="w-4 h-4 accent-[#00f0b5] rounded mt-0.5 cursor-pointer shrink-0"
                              />
                              <div className="text-left">
                                <div className={`text-xs font-bold leading-tight ${isAssigned ? 'text-white' : 'text-slate-400'}`}>
                                  {mod.nombre}
                                </div>
                                <div className="text-[9.5px] text-slate-400 font-sans leading-tight mt-0.5 line-clamp-1">
                                  {mod.descripcion}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons in Modal */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <div>
                  {editingUser.id !== 'user_washington' && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditModalOpen(false);
                        handleDeleteUser(editingUser.id, editingUser.nombre);
                      }}
                      className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar Usuario</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-xl text-xs font-mono font-bold uppercase cursor-pointer transition-all"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-[#00f0b5] hover:bg-[#25ffcb] text-slate-950 rounded-xl text-xs font-mono font-black uppercase tracking-wider flex items-center gap-2 shadow-[0_0_15px_rgba(0,240,181,0.35)] cursor-pointer transition-all"
                  >
                    <Save className="w-4 h-4" />
                    <span>Guardar Asignaciones</span>
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ➕ MODAL: REGISTRAR NUEVO COLABORADOR EN SISTEMALOG                        */}
      {/* ========================================================================= */}
      {isNewUserModalOpen && (
        <div className="fixed inset-0 z-[11000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#02161a] border-2 border-[#00f0b5]/50 rounded-2xl max-w-xl w-full p-6 text-slate-200 shadow-2xl relative my-auto animate-fade-in font-sans space-y-5">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3 text-[#00f0b5]">
                <UserPlus className="w-6 h-6" />
                <h3 className="text-base font-black text-white">Registrar Nuevo Colaborador</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewUserModalOpen(false)}
                className="p-1 rounded-lg bg-slate-900 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewUser} className="space-y-4 text-xs font-mono">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  placeholder="Ej. Carlos Mendoza"
                  value={newUserForm.nombre}
                  onChange={e => setNewUserForm({ ...newUserForm, nombre: e.target.value })}
                  className="w-full bg-[#04242a] border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-[#00f0b5]"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Correo Electrónico (Login) *</label>
                <input
                  type="email"
                  placeholder="usuario@latinproducts.com.co"
                  value={newUserForm.email}
                  onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                  className="w-full bg-[#04242a] border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-[#00f0b5]"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Cargo</label>
                  <input
                    type="text"
                    placeholder="Ej. Despachador de Muelle"
                    value={newUserForm.cargo}
                    onChange={e => setNewUserForm({ ...newUserForm, cargo: e.target.value })}
                    className="w-full bg-[#04242a] border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-[#00f0b5]"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Rol Inicial</label>
                  <select
                    value={newUserForm.rol}
                    onChange={e => setNewUserForm({ ...newUserForm, rol: e.target.value as UserRole })}
                    className="w-full bg-[#04242a] border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-[#00f0b5] cursor-pointer"
                  >
                    <option value="AUXILIAR_LOGISTICO">Auxiliar Logístico</option>
                    <option value="LOGISTICA">Coordinador Logístico</option>
                    <option value="SST_TALENTO">SST & Talento Humano</option>
                    <option value="SUPER_ADMIN">Super Administrador</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Departamento</label>
                  <input
                    type="text"
                    value={newUserForm.departamento}
                    onChange={e => setNewUserForm({ ...newUserForm, departamento: e.target.value })}
                    className="w-full bg-[#04242a] border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-[#00f0b5]"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Color de Avatar</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newUserForm.color}
                      onChange={e => setNewUserForm({ ...newUserForm, color: e.target.value })}
                      className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-300">{newUserForm.color}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsNewUserModalOpen(false)}
                  className="px-4 py-2 bg-slate-900 text-slate-400 hover:text-white rounded-xl text-xs font-mono font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#00f0b5] hover:bg-[#25ffcb] text-slate-950 font-black rounded-xl text-xs font-mono uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(0,240,181,0.3)]"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Crear Colaborador</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
