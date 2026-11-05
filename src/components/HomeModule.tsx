/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Order, AppUser } from '../types';
import { canUserAccessTab } from '../data/usersRoster';
import { matchOrderSearch } from '../utils/searchHelper';
import { 
  FileText, Users, Truck, CheckCircle2, Search,
  Terminal as TerminalIcon, Calendar, Clock, MapPin, Package, ArrowRight,
  Eye, EyeOff, Sparkles, ChevronDown, ChevronUp, Layers, DollarSign,
  Activity, Map, ShieldCheck, Database, FileSpreadsheet, Briefcase, 
  Receipt, BarChart3, Navigation, AlertTriangle, Shield, Check, ArrowLeft,
  Grid, List, Bell, Lock, User
} from 'lucide-react';

interface HomeModuleProps {
  orders: Order[];
  onOpenOrder: (order: Order) => void;
  customersCount: number;
  onNavigateTab?: (tab: string) => void;
  onOpenBackupModal?: () => void;
  onOpenSupabaseModal?: () => void;
  currentUser?: AppUser | null;
}

interface ModuleDefinition {
  id: string;
  name: string;
  category: 'operativos' | 'entidades' | 'contabilidad' | 'inteligencia' | 'configuracion';
  description: string;
  tabTarget: string;
  icon: any;
  actionType?: 'tab' | 'backup' | 'supabase' | 'tablero';
}

const MODULES_DIRECTORY: ModuleDefinition[] = [
  // 1. Operativos (6)
  {
    id: 'mod_inicio',
    name: 'Inicio & Tablero',
    category: 'operativos',
    description: 'Panel central de control y KPIs operativos',
    tabTarget: 'tablero',
    actionType: 'tablero',
    icon: Clock
  },
  {
    id: 'mod_solicitudes',
    name: 'Solicitudes',
    category: 'operativos',
    description: 'Registro, importación y escaneo OCR de órdenes...',
    tabTarget: 'orders',
    icon: FileText
  },
  {
    id: 'mod_despachados',
    name: 'Despachados',
    category: 'operativos',
    description: 'Historial de fletes despachados con factura',
    tabTarget: 'despachados',
    icon: CheckCircle2
  },
  {
    id: 'mod_pendientes',
    name: 'Pendientes',
    category: 'operativos',
    description: 'Cola de solicitudes en cargue y por despachar',
    tabTarget: 'pendientes',
    icon: Clock
  },
  {
    id: 'mod_vehiculos',
    name: 'Vehículos & Flota',
    category: 'operativos',
    description: 'Directorio de camiones, placas y conductores',
    tabTarget: 'vehiculos',
    icon: Truck
  },
  {
    id: 'mod_citas',
    name: 'Agenda / Citas',
    category: 'operativos',
    description: 'Programación de entregas y citas en destino',
    tabTarget: 'citas',
    icon: Calendar
  },

  // 2. Entidades (2)
  {
    id: 'mod_clientes',
    name: 'Clientes',
    category: 'entidades',
    description: 'Directorio comercial, ciudades de destino y condiciones de entrega',
    tabTarget: 'customers',
    icon: Users
  },
  {
    id: 'mod_transportadoras',
    name: 'Transportadoras',
    category: 'entidades',
    description: 'Empresas de carga aliadas, tarifas base y liquidación de costos',
    tabTarget: 'carriers',
    icon: Briefcase
  },

  // 3. Contabilidad & Nómina (7)
  {
    id: 'mod_provisiones',
    name: 'Provisiones de Fletes',
    category: 'contabilidad',
    description: 'Emisión, cálculo y gestión de soportes de fletes a pagar',
    tabTarget: 'provisiones',
    icon: DollarSign
  },
  {
    id: 'mod_comprobantes',
    name: 'Comprobantes Contables',
    category: 'contabilidad',
    description: 'Generación, consulta e impresión de vouchers y soportes contables',
    tabTarget: 'comprobantes',
    icon: FileText
  },
  {
    id: 'mod_diferencias',
    name: 'Diferencias & Conciliación',
    category: 'contabilidad',
    description: 'Auditoría automática entre fletes estimados vs facturas radicadas',
    tabTarget: 'diferencias',
    icon: FileSpreadsheet
  },
  {
    id: 'mod_liquidador',
    name: 'Liquidador de Despachos',
    category: 'contabilidad',
    description: 'Matriz de rentabilidad y desglose porcentual flete vs venta',
    tabTarget: 'liquidador',
    icon: Receipt
  },
  {
    id: 'mod_horas',
    name: 'Horas Extras & Nómina',
    category: 'contabilidad',
    description: 'Cálculo de recargos nocturnos, dominicales y turnos de conductores',
    tabTarget: 'horas',
    icon: Clock
  },
  {
    id: 'mod_pedidos_emp',
    name: 'Pedidos Empleados',
    category: 'contabilidad',
    description: 'Módulo de solicitudes internas de compras para personal',
    tabTarget: 'pedidos',
    icon: Package
  },
  {
    id: 'mod_recordatorios',
    name: 'Recordatorios & Alertas',
    category: 'contabilidad',
    description: 'Gestión de tareas, llamadas y alertas operativas programadas',
    tabTarget: 'recordatorios',
    icon: Bell
  },

  // 4. Inteligencia & Auditoría (4)
  {
    id: 'mod_analisis',
    name: 'Análisis de Rentabilidad',
    category: 'inteligencia',
    description: 'Métricas analíticas avanzadas, comparativas y márgenes netos',
    tabTarget: 'analytics',
    icon: BarChart3
  },
  {
    id: 'mod_mapas',
    name: 'Control GPS & Rutas',
    category: 'inteligencia',
    description: 'Visualización geoespacial de entregas y corredores logísticos',
    tabTarget: 'mapas',
    icon: Map
  },
  {
    id: 'mod_seguimiento',
    name: 'Monitoreo Satelital',
    category: 'inteligencia',
    description: 'Seguimiento satelital de fletes y operadores activos en ruta',
    tabTarget: 'seguimiento',
    icon: Activity
  },
  {
    id: 'mod_novedades',
    name: 'Monitor de Novedades',
    category: 'inteligencia',
    description: 'Registro de incidencias en ruta, retrasos y reprogramaciones',
    tabTarget: 'novedades',
    icon: AlertTriangle
  },

  // 5. Configuración & Seguridad (2)
  {
    id: 'mod_usuarios',
    name: 'Usuarios & Auditoría',
    category: 'configuracion',
    description: 'Gestión de credenciales, roles, accesos y trazabilidad de ingresos',
    tabTarget: 'usuarios',
    icon: ShieldCheck
  },
  {
    id: 'mod_ajustes',
    name: 'Respaldos & Nube',
    category: 'configuracion',
    description: 'Sincronización multi-PC, copia de seguridad y migración a Supabase',
    tabTarget: 'home',
    actionType: 'supabase',
    icon: Database
  }
];

export default function HomeModule({ 
  orders, 
  onOpenOrder, 
  customersCount,
  onNavigateTab,
  onOpenBackupModal,
  onOpenSupabaseModal,
  currentUser
}: HomeModuleProps) {
  // Navigation inside Home: 'hub' (Menú Central estilo Synapsis) or 'tablero' (Inicio y Tablero operativo)
  const [viewMode, setViewMode] = useState<'hub' | 'tablero'>('hub');

  // Search & Pagination in Tablero
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;

  // Visual categorization and private mode state
  const [activeCategory, setActiveCategory] = useState<string>('operativos');
  const [isPrivateMode, setIsPrivateMode] = useState<boolean>(true);
  const [cardSize, setCardSize] = useState<'mini' | 'mediana'>('mini');
  const [isFolded, setIsFolded] = useState<boolean>(false);

  // KPIs
  const totalOrders = orders.length;
  
  const dispatchedCount = useMemo(() => {
    return orders.filter(o => o.estado === 'Despachado' || o.estado === 'Entregado').length;
  }, [orders]);

  const successDeliveries = useMemo(() => {
    return orders.filter(o => o.estado === 'Entregado').length;
  }, [orders]);

  // Terminal log status messages matching screenshot
  const logs = useMemo(() => [
    `> Protocolos de transmisión listos... OK`,
    `> Conectando a Base de Datos Central en la nube... OK (Firebase Firestore)`,
    `> Canal seguro de encriptación TLS 1.3... Conectado`,
    `> Sincronizando registros de fletes de Yumbo... Sincronizado (${totalOrders} registros cargados)`,
    `> Motor Ley 2466 / Cortes 12 y 27... Operativo`
  ], [totalOrders]);

  // Pending activity filter for Tablero view
  const pendingOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.estado === 'Anulado') return false;
      return o.estado === 'Pendiente' || o.estado === 'En Cargue';
    });
  }, [orders]);

  const filteredPending = useMemo(() => {
    if (!searchTerm.trim()) return pendingOrders;
    const activeOrders = orders.filter(o => o.estado !== 'Anulado');
    return activeOrders.filter(o => matchOrderSearch(o, searchTerm));
  }, [pendingOrders, orders, searchTerm]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

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

  const handleModuleClick = (mod: ModuleDefinition) => {
    if (mod.actionType === 'tablero') {
      setViewMode('tablero');
      return;
    }

    if (currentUser && !canUserAccessTab(currentUser, mod.tabTarget)) {
      alert(`🔒 Módulo Restringido\nEl perfil actual (${currentUser.nombre} - ${currentUser.cargo}) no tiene permiso de acceso a "${mod.name}".\n\nContacte al Administrador Principal (Washington Quiñones).`);
      return;
    }

    if (mod.actionType === 'supabase') {
      if (onOpenSupabaseModal) onOpenSupabaseModal();
      else if (onOpenBackupModal) onOpenBackupModal();
    } else if (mod.actionType === 'backup') {
      if (onOpenBackupModal) onOpenBackupModal();
    } else if (onNavigateTab) {
      onNavigateTab(mod.tabTarget);
    }
  };

  // Categories config
  const categoriesList = [
    { id: 'todas', label: 'Todas', count: MODULES_DIRECTORY.length },
    { id: 'operativos', label: 'Operativos', count: MODULES_DIRECTORY.filter(m => m.category === 'operativos').length },
    { id: 'entidades', label: 'Entidades', count: MODULES_DIRECTORY.filter(m => m.category === 'entidades').length },
    { id: 'contabilidad', label: 'Contabilidad & Nómina', count: MODULES_DIRECTORY.filter(m => m.category === 'contabilidad').length },
    { id: 'inteligencia', label: 'Inteligencia', count: MODULES_DIRECTORY.filter(m => m.category === 'inteligencia').length },
    { id: 'configuracion', label: 'Configuración', count: MODULES_DIRECTORY.filter(m => m.category === 'configuracion').length }
  ];

  const categoryHeaders: Record<string, { title: string; count: number }> = {
    operativos: { title: 'OPERATIVOS & DESPACHOS', count: MODULES_DIRECTORY.filter(m => m.category === 'operativos').length },
    entidades: { title: 'ENTIDADES & DIRECTORIO', count: MODULES_DIRECTORY.filter(m => m.category === 'entidades').length },
    contabilidad: { title: 'CONTABILIDAD, FACTURACIÓN & NÓMINA', count: MODULES_DIRECTORY.filter(m => m.category === 'contabilidad').length },
    inteligencia: { title: 'INTELIGENCIA & AUDITORÍA LOGÍSTICA', count: MODULES_DIRECTORY.filter(m => m.category === 'inteligencia').length },
    configuracion: { title: 'CONFIGURACIÓN, SEGURIDAD & NUBE', count: MODULES_DIRECTORY.filter(m => m.category === 'configuracion').length }
  };

  const displayedCategories = useMemo(() => {
    if (activeCategory === 'todas') {
      return ['operativos', 'entidades', 'contabilidad', 'inteligencia', 'configuracion'];
    }
    return [activeCategory];
  }, [activeCategory]);

  // =========================================================================
  // VISTA 1: TABLERO OPERATIVO (Activado cuando se hace clic en Inicio & Tablero)
  // =========================================================================
  if (viewMode === 'tablero') {
    return (
      <div className="space-y-6 animate-fade-in font-sans pb-12">
        {/* Navigation bar to return to Hub */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-teal-500/20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewMode('hub')}
              className="bg-[#052d34] hover:bg-[#083e47] border border-teal-500/30 text-teal-300 px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold font-mono transition-all cursor-pointer shadow-md"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al Menú Central</span>
            </button>
            <div className="space-y-0.5">
              <h2 className="text-lg font-display font-extrabold text-white tracking-widest uppercase flex items-center gap-2 text-relief-title">
                <Clock className="w-5 h-5 text-teal-300" /> Tablero de Control Operativo
              </h2>
              <p className="text-[11px] text-teal-200/70 font-mono">
                SISTEMALOG SAS | Monitoreo en Tiempo Real
              </p>
            </div>
          </div>
        </div>

        {/* 4 KPIs Top with 3D Relief and Azul Verdoso Styling */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1 */}
          <div className="card-3d-teal rounded-2xl p-4.5 border-t-4 border-t-teal-400 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-teal-200/70 font-mono tracking-wider uppercase flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-teal-300" /> Total Solicitudes
              </span>
              <div className="text-3xl font-display font-extrabold text-white text-relief-title">
                {totalOrders}
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#083a42] border border-teal-500/30 flex items-center justify-center text-teal-300 shadow-inner">
              <FileText className="w-6 h-6" />
            </div>
          </div>

          {/* KPI 2 */}
          <div className="card-3d-teal rounded-2xl p-4.5 border-t-4 border-t-emerald-400 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-teal-200/70 font-mono tracking-wider uppercase flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-emerald-300" /> Clientes Activos
              </span>
              <div className="text-3xl font-display font-extrabold text-white text-relief-title">
                {customersCount}
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#083a42] border border-emerald-500/30 flex items-center justify-center text-emerald-300 shadow-inner">
              <Users className="w-6 h-6" />
            </div>
          </div>

          {/* KPI 3 */}
          <div className="card-3d-teal rounded-2xl p-4.5 border-t-4 border-t-amber-400 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-teal-200/70 font-mono tracking-wider uppercase flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-amber-300" /> Despachados
              </span>
              <div className="text-3xl font-display font-extrabold text-white text-relief-title">
                {dispatchedCount}
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#083a42] border border-amber-500/30 flex items-center justify-center text-amber-300 shadow-inner">
              <Truck className="w-6 h-6" />
            </div>
          </div>

          {/* KPI 4 */}
          <div className="card-3d-teal rounded-2xl p-4.5 border-t-4 border-t-cyan-400 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] text-teal-200/70 font-mono tracking-wider uppercase flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-300" /> Entregas Exitosas
              </span>
              <div className="text-3xl font-display font-extrabold text-white text-relief-title">
                {successDeliveries}
              </div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-[#083a42] border border-cyan-500/30 flex items-center justify-center text-cyan-300 shadow-inner">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Recent Activity List matching exact screenshot image_614fdb8e.png */}
        <div className="card-3d-teal rounded-2xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-display font-bold text-white tracking-widest uppercase border-l-2 border-teal-400 pl-2 text-relief-card">
                {searchTerm.trim() ? 'Resultados de Búsqueda (En Toda la Base de Datos)' : 'Actividad Reciente en cola (Pendientes & Cargue)'}
              </h3>
              <p className="text-[11px] text-teal-300/80 font-mono">
                {searchTerm.trim() ? `${filteredPending.length} solicitudes encontradas` : `${filteredPending.length} solicitudes esperando despacho`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-teal-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="BUSCAR PV, CÓDIGO, CLIENTE..."
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="bg-[#021620] border border-teal-500/30 focus:border-teal-400 text-xs text-white rounded-lg px-8 py-1.5 outline-none w-64 transition-all font-mono"
                />
              </div>

              {/* Pagination Controls */}
              <div className="flex items-center gap-0.5 bg-[#021620] border border-teal-500/30 p-0.5 rounded-lg font-mono">
                <button
                  onClick={() => handlePageChange(-1)}
                  disabled={currentPage === 1}
                  className="text-xs text-teal-300 disabled:text-slate-600 hover:bg-[#052d34] font-bold px-2 py-1 rounded transition-colors"
                >
                  ◀
                </button>
                <span className="text-[11px] text-teal-300 font-bold tracking-wider px-2">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === totalPages}
                  className="text-xs text-teal-300 disabled:text-slate-600 hover:bg-[#052d34] font-bold px-2 py-1 rounded transition-colors"
                >
                  ▶
                </button>
              </div>
            </div>
          </div>

          {/* Dynamic Activity Cards Feed matching image_614fdb8e.png */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {paginatedPending.length === 0 ? (
              <div className="col-span-2 text-center py-8 text-xs text-teal-300/60 font-mono">
                -- No hay solicitudes pendientes registradas en este periodo --
              </div>
            ) : (
              paginatedPending.map(order => (
                <div 
                  key={order.id}
                  onClick={() => onOpenOrder(order)}
                  className="bg-gradient-to-b from-[#052d34] to-[#021620] hover:border-teal-400/60 border border-teal-500/30 rounded-xl p-4 cursor-pointer transition-all duration-200 group relative flex flex-col justify-between shadow-md hover:-translate-y-0.5"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-teal-300 font-mono font-bold tracking-wide">
                        {order.id} <span className="text-slate-400">| PV: <span className="text-yellow-400 font-extrabold">{order.pv || 'N/A'}</span></span>
                      </span>
                      <span className="text-[9px] font-bold font-mono px-2 py-0.5 rounded border border-teal-400/50 bg-teal-500/10 text-teal-300 uppercase">
                        {order.estado}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-white group-hover:text-teal-200 transition-colors truncate text-relief-card">
                        {order.cliente}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-teal-200/70">
                        <MapPin className="w-3 h-3 text-teal-400" />
                        <span>{order.ciudad}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3.5 pt-2.5 border-t border-teal-500/20 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-3 font-mono text-teal-200/80">
                      <span className="flex items-center gap-0.5">
                        <Package className="w-3 h-3 text-teal-400" />
                        <strong className="text-white">{order.cajas}</strong> cj
                      </span>
                      <span>
                        ⚖️ <strong className="text-white">{order.peso.toLocaleString('es-CO')}</strong> kg
                      </span>
                      <span className="text-emerald-300 font-bold">
                        ${(order.venta).toLocaleString('es-CO')}
                      </span>
                    </div>

                    <span className="text-teal-300 group-hover:translate-x-1 transition-transform flex items-center gap-0.5 font-bold uppercase text-[9px] tracking-wider font-mono">
                      Editar <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Terminal Network Monitor */}
        <div className="card-3d-teal rounded-2xl p-4 shadow-inner">
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-teal-500/20">
            <TerminalIcon className="w-4 h-4 text-emerald-400 pulse-led" />
            <span className="text-xs font-mono font-bold text-teal-200 uppercase tracking-widest">
              Monitor de red y sincronización (Firebase Real-time)
            </span>
          </div>
          <div className="font-mono text-xs text-emerald-400/90 leading-relaxed bg-[#011114]/90 p-3 rounded-xl border border-teal-900/50 max-h-36 overflow-y-auto">
            {logs.map((log, idx) => (
              <div key={idx}>{log}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VISTA 2: MENÚ CENTRAL (HUB) con diseño 3D Azul Verdoso tipo Synapsis ERP
  // =========================================================================
  return (
    <div className="space-y-6 animate-fade-in font-sans pb-12">
      
      {/* 1. Hero Banner matching Synapsis ERP in image_52a4c99e.png */}
      <div className="bg-gradient-to-r from-[#042429] via-[#021620] to-[#042429] border border-teal-500/35 rounded-2xl p-6 sm:p-7 shadow-[0_12px_36px_-6px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.12)] relative overflow-hidden flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="space-y-2.5 max-w-2xl">
          <div className="flex items-center gap-2 text-[11px] font-mono font-extrabold text-teal-400 uppercase tracking-widest text-relief-card">
            <Sparkles className="w-3.5 h-3.5 text-teal-300" />
            <span>Bienvenido a</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-display font-extrabold text-white tracking-widest uppercase text-relief-title">
            SISTEMALOG
          </h1>
          <p className="text-xs sm:text-sm text-teal-100/80 leading-relaxed font-sans">
            Control total de tu negocio, en un solo lugar. Módulos de gestión organizados por categorías.
          </p>
        </div>

        {/* Live Widget Badge matching Synapsis Live in image_52a4c99e.png */}
        <div className="bg-[#02141c]/95 border border-teal-500/30 rounded-2xl p-4 flex flex-col justify-between w-full lg:w-72 h-36 shrink-0 shadow-inner font-mono">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            </div>
            <span className="text-[10px] text-teal-200/80 uppercase font-bold tracking-wider">
              SISTEMALOG LIVE
            </span>
          </div>

          {/* Animated visual bars with Azul Verdoso glow */}
          <div className="flex items-end gap-2.5 h-12 px-2">
            <div className="w-1/5 bg-[#052d34] rounded-t-md h-5"></div>
            <div className="w-1/5 bg-teal-400/80 rounded-t-md h-8"></div>
            <div className="w-1/5 bg-cyan-500 rounded-t-md h-12 shadow-[0_0_10px_rgba(0, 197, 216,0.5)]"></div>
            <div className="w-1/5 bg-indigo-500/80 rounded-t-md h-9"></div>
            <div className="w-1/5 bg-emerald-400 rounded-t-md h-12 animate-pulse shadow-[0_0_12px_rgba(0,223,192,0.6)]"></div>
          </div>

          <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-teal-900/40">
            <span className="text-teal-200/70 uppercase font-bold">Operación 2026</span>
            <span className="text-emerald-300 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-led"></span> Sistema Activo
            </span>
          </div>
        </div>
      </div>

      {/* 2. Privacy Mode Toggle Banner */}
      <div className="bg-[#031d22]/80 border border-teal-500/30 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-[#052d34] border border-teal-500/30 text-teal-300">
            {isPrivateMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 font-bold text-white">
              <span className="text-relief-card">Tarjetas Financieras Protegidas</span>
              <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-extrabold uppercase ${
                isPrivateMode ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              }`}>
                {isPrivateMode ? 'MODO PRIVADO' : 'MODO VISIBLE'}
              </span>
            </div>
            <p className="text-[11px] text-teal-200/70">
              {isPrivateMode ? '— Cifras confidenciales ocultas a terceros' : 'Métricas y valores monetarios visibles'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsPrivateMode(prev => !prev)}
          className="bg-[#00a8cc]/15 hover:bg-[#00a8cc]/25 text-[#00c5d8] border border-[#00a8cc]/40 px-4 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold font-mono transition-all cursor-pointer shrink-0 shadow-sm"
        >
          {isPrivateMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>{isPrivateMode ? 'Revelar tarjetas de métricas' : 'Ocultar tarjetas de métricas'}</span>
        </button>
      </div>

      {/* 3. The 4 Metric Cards (ONLY VISIBLE WHEN REVEALED 'ARRIBA', HIDDEN IN MODO PRIVADO) */}
      {!isPrivateMode && (
        <div className="animate-fade-in space-y-2 pt-1 pb-1">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <h3 className="text-xs font-mono font-extrabold text-teal-200 tracking-wider uppercase text-relief-card">
              Métricas de Despacho & Flota
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1 */}
            <div className="card-3d-teal rounded-2xl p-4.5 border-t-4 border-t-teal-400 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-teal-200/70 font-mono tracking-wider uppercase flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-teal-300" /> Total Solicitudes
                </span>
                <div className="text-2xl font-display font-extrabold text-white text-relief-title">
                  {totalOrders}
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-[#083a42] border border-teal-500/30 flex items-center justify-center text-teal-300">
                <FileText className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 2 */}
            <div className="card-3d-teal rounded-2xl p-4.5 border-t-4 border-t-emerald-400 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-teal-200/70 font-mono tracking-wider uppercase flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-emerald-300" /> Clientes Activos
                </span>
                <div className="text-2xl font-display font-extrabold text-white text-relief-title">{customersCount}</div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-[#083a42] border border-emerald-500/30 flex items-center justify-center text-emerald-300">
                <Users className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 3 */}
            <div className="card-3d-teal rounded-2xl p-4.5 border-t-4 border-t-amber-400 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-teal-200/70 font-mono tracking-wider uppercase flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-amber-300" /> Despachados
                </span>
                <div className="text-2xl font-display font-extrabold text-white text-relief-title">{dispatchedCount}</div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-[#083a42] border border-amber-500/30 flex items-center justify-center text-amber-300">
                <Truck className="w-5 h-5" />
              </div>
            </div>

            {/* KPI 4 */}
            <div className="card-3d-teal rounded-2xl p-4.5 border-t-4 border-t-cyan-400 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-teal-200/70 font-mono tracking-wider uppercase flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-300" /> Entregas Exitosas
                </span>
                <div className="text-2xl font-display font-extrabold text-white text-relief-title">{successDeliveries}</div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-[#083a42] border border-cyan-500/30 flex items-center justify-center text-cyan-300">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Category Filter Tabs Header matching image_52a4c99e.png */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-teal-500/20 pb-3">
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {categoriesList.map(cat => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-[#00a8cc] text-slate-950 shadow-[0_0_15px_rgba(0,201,167,0.45)] border border-[#00c5d8]'
                    : 'bg-[#042429]/80 hover:bg-[#06333a] text-teal-100 border border-teal-500/30'
                }`}
              >
                <span>{cat.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  isActive ? 'bg-slate-950/20 text-slate-950 font-extrabold' : 'bg-slate-900/60 text-teal-300'
                }`}>
                  ({cat.count})
                </span>
              </button>
            );
          })}
        </div>

        {/* View Controls: Plegar & Tamaño */}
        <div className="flex items-center gap-3 shrink-0 text-xs font-mono">
          <button
            onClick={() => setIsFolded(prev => !prev)}
            className="text-teal-300 hover:text-white flex items-center gap-1 text-[11px] font-bold cursor-pointer"
          >
            {isFolded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            <span>{isFolded ? 'Desplegar Todos' : 'Plegar Todos'}</span>
          </button>

          <div className="flex items-center gap-1 bg-[#021620] p-1 rounded-xl border border-teal-500/30 text-[10px] font-bold">
            <span className="text-teal-400/60 px-1 uppercase">Tamaño:</span>
            <button
              onClick={() => setCardSize('mini')}
              className={`px-2.5 py-0.5 rounded-lg transition-all cursor-pointer ${
                cardSize === 'mini' ? 'bg-[#00a8cc] text-slate-950 font-extrabold' : 'text-teal-200 hover:text-white'
              }`}
            >
              Mini
            </button>
            <button
              onClick={() => setCardSize('mediana')}
              className={`px-2.5 py-0.5 rounded-lg transition-all cursor-pointer ${
                cardSize === 'mediana' ? 'bg-[#00a8cc] text-slate-950 font-extrabold' : 'text-teal-200 hover:text-white'
              }`}
            >
              Mediana
            </button>
          </div>
        </div>
      </div>

      {/* 5. Categorized Module Cards Feed matching exact 4-columns layout in image_52a4c99e.png */}
      {!isFolded && (
        <div className="space-y-6">
          {displayedCategories.map(catKey => {
            const header = categoryHeaders[catKey];
            const catModules = MODULES_DIRECTORY.filter(m => m.category === catKey);
            if (catModules.length === 0) return null;

            return (
              <div key={catKey} className="space-y-3">
                {/* Section Title with Badge exactly like image_52a4c99e.png */}
                <div className="flex items-center justify-between border-b border-teal-500/20 pb-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#00c5d8] shadow-[0_0_8px_rgba(0, 197, 216,0.8)]"></span>
                    <h3 className="text-xs font-mono font-extrabold text-white tracking-wider uppercase text-relief-card">
                      {header.title}
                    </h3>
                    <span className="text-[9px] font-mono font-extrabold bg-[#052d34] text-teal-300 border border-teal-500/30 px-2 py-0.5 rounded-full">
                      Categoría seleccionada
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-teal-300 bg-[#021620] px-2.5 py-0.5 rounded-lg border border-teal-500/30">
                    {catModules.length} módulos ▾
                  </span>
                </div>

                {/* 4-Columns Grid with 3D Relief Cards exactly as in image_52a4c99e.png */}
                <div className={`grid gap-4 ${
                  cardSize === 'mini'
                    ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                }`}>
                  {catModules.map(mod => {
                    const IconComp = mod.icon;
                    const isPermitted = !currentUser || mod.actionType === 'tablero' || canUserAccessTab(currentUser, mod.tabTarget);
                    return (
                      <div
                        key={mod.id}
                        onClick={() => handleModuleClick(mod)}
                        className={`card-3d-teal rounded-2xl p-4 cursor-pointer transition-all duration-200 group flex items-start gap-3.5 relative ${
                          cardSize === 'mini' ? 'min-h-[82px]' : 'min-h-[104px]'
                        } ${!isPermitted ? 'opacity-65 hover:opacity-90 border-amber-500/25' : ''}`}
                        title={!isPermitted ? `Restringido para ${currentUser?.nombre || 'usuario'}` : undefined}
                      >
                        {/* Square Teal Icon Box matching image_52a4c99e.png */}
                        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 shadow-inner transition-all ${
                          isPermitted 
                            ? 'bg-[#083a42] border-teal-500/35 text-teal-300 group-hover:bg-[#0b4d57] group-hover:text-teal-200 group-hover:border-teal-400/60'
                            : 'bg-[#152328] border-amber-500/30 text-amber-300/80'
                        }`}>
                          <IconComp className="w-5 h-5" />
                        </div>
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <h4 className="text-[13px] font-bold text-white group-hover:text-teal-200 transition-colors truncate text-relief-card">
                              {mod.name}
                            </h4>
                            {!isPermitted && (
                              <span className="text-[8px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded shrink-0 flex items-center gap-0.5">
                                <Lock className="w-2.5 h-2.5" /> Bloqueado
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-teal-100/70 line-clamp-2 leading-snug font-sans">
                            {mod.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. Three Operational Status Badges matching image_9178baed.png */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2">
        {/* Badge 1: Ley 2466 */}
        <div 
          onClick={() => onNavigateTab && onNavigateTab('horas')}
          className="card-3d-teal rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center justify-center group-hover:bg-emerald-500/20">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors text-relief-card">
                Cumple con la Ley 2466
              </h4>
              <p className="text-[10px] text-teal-200/70 font-sans">
                Franja 19:00 y Cortes 12/27 configurados
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold text-teal-300 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
            NÓMINA →
          </span>
        </div>

        {/* Badge 2: Operación en Crecimiento */}
        <div 
          onClick={() => onNavigateTab && onNavigateTab('orders')}
          className="card-3d-teal rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/25 flex items-center justify-center group-hover:bg-sky-500/20">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors text-relief-card">
                Operación en Crecimiento
              </h4>
              <p className="text-[10px] text-teal-200/70 font-sans">
                {totalOrders} solicitudes centralizadas
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold text-teal-300 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
            FLETES →
          </span>
        </div>

        {/* Badge 3: Respaldo en la Nube */}
        <div 
          onClick={() => {
            if (onOpenSupabaseModal) onOpenSupabaseModal();
            else if (onOpenBackupModal) onOpenBackupModal();
          }}
          className="card-3d-teal rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 flex items-center justify-center group-hover:bg-cyan-500/20">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors text-relief-card">
                Respaldo en la Nube
              </h4>
              <p className="text-[10px] text-teal-200/70 font-sans">
                Sincronización segura continua
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-led"></span> En Línea
            </span>
            <span className="text-[10px] font-mono font-bold text-teal-200 bg-[#021620] border border-teal-500/30 px-2.5 py-0.5 rounded-lg">
              Respaldos
            </span>
          </div>
        </div>
      </div>

      {/* 7. Terminal Network Monitor matching image_9178baed.png */}
      <div className="card-3d-teal rounded-2xl p-4 shadow-inner">
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-teal-500/20">
          <TerminalIcon className="w-4 h-4 text-emerald-400 pulse-led" />
          <span className="text-xs font-mono font-bold text-teal-200 uppercase tracking-widest">
            Monitor de red y sincronización (Firebase Real-time)
          </span>
        </div>
        <div className="font-mono text-xs text-emerald-400/90 leading-relaxed bg-[#011114]/90 p-3 rounded-xl border border-teal-900/50 max-h-36 overflow-y-auto">
          {logs.map((log, idx) => (
            <div key={idx}>{log}</div>
          ))}
        </div>
      </div>

    </div>
  );
}
