/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Order } from '../types';
import { 
  FileText, Users, Truck, CheckCircle2, 
  Terminal as TerminalIcon, Calendar, Clock, MapPin, Package, ArrowRight,
  Eye, EyeOff, Sparkles, ChevronDown, ChevronUp, Layers, DollarSign,
  Activity, Map, ShieldCheck, Database, FileSpreadsheet, Briefcase, 
  Receipt, BarChart3, Navigation, AlertTriangle, Shield, Check
} from 'lucide-react';

interface HomeModuleProps {
  orders: Order[];
  onOpenOrder: (order: Order) => void;
  customersCount: number;
  onNavigateTab?: (tab: string) => void;
  onOpenBackupModal?: () => void;
  onOpenSupabaseModal?: () => void;
}

interface ModuleDefinition {
  id: string;
  name: string;
  category: 'operativos' | 'entidades' | 'contabilidad' | 'inteligencia' | 'configuracion';
  description: string;
  tabTarget: string;
  icon: any;
  actionType?: 'tab' | 'backup' | 'supabase';
}

const MODULES_DIRECTORY: ModuleDefinition[] = [
  // 1. Operativos (6)
  {
    id: 'mod_inicio',
    name: 'Inicio & Tablero',
    category: 'operativos',
    description: 'Panel central de control y KPIs operativos',
    tabTarget: 'home',
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

  // 3. Contabilidad & Nómina (6)
  {
    id: 'mod_provisiones',
    name: 'Provisiones de Fletes',
    category: 'contabilidad',
    description: 'Emisión, cálculo y gestión de soportes de fletes a pagar',
    tabTarget: 'provisiones',
    icon: DollarSign
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
    id: 'mod_comprobantes',
    name: 'Comprobantes Contables',
    category: 'contabilidad',
    description: 'Generación e impresión de vouchers y soportes contables formales',
    tabTarget: 'provisiones',
    icon: FileText
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
    id: 'mod_auditoria',
    name: 'Auditoría de Fletes',
    category: 'inteligencia',
    description: 'Consola de auditoría de datos, consistencia y alertas operativas',
    tabTarget: 'dashboard',
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

  // 5. Configuración (1)
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
  onOpenSupabaseModal
}: HomeModuleProps) {
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

  const handleModuleClick = (mod: ModuleDefinition) => {
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
    operativos: { title: 'OPERATIVOS & DESPACHOS', count: 6 },
    entidades: { title: 'ENTIDADES & DIRECTORIO', count: 2 },
    contabilidad: { title: 'CONTABILIDAD, FACTURACIÓN & NÓMINA', count: 6 },
    inteligencia: { title: 'INTELIGENCIA & AUDITORÍA LOGÍSTICA', count: 4 },
    configuracion: { title: 'CONFIGURACIÓN & BASE DE DATOS', count: 1 }
  };

  const displayedCategories = useMemo(() => {
    if (activeCategory === 'todas') {
      return ['operativos', 'entidades', 'contabilidad', 'inteligencia', 'configuracion'];
    }
    return [activeCategory];
  }, [activeCategory]);

  return (
    <div className="space-y-6 animate-fade-in font-sans pb-12">
      
      {/* 1. Hero Banner matching exact production screenshot */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-950 border border-sky-900/40 rounded-xl p-5 sm:p-6 shadow-2xl relative overflow-hidden flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2 text-[11px] font-mono font-bold text-sky-400 uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Bienvenido a</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-white tracking-widest uppercase">
            SISTEMALOG
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
            Control total de tu negocio, en un solo lugar. Módulos de gestión organizados por categorías.
          </p>
        </div>

        {/* Live Widget Badge */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between w-full lg:w-72 h-32 shrink-0 shadow-inner font-mono">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            </div>
            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
              SISTEMALOG LIVE
            </span>
          </div>

          {/* Animated visual bars */}
          <div className="flex items-end gap-2.5 h-10 px-2">
            <div className="w-1/5 bg-slate-800 rounded-t h-4"></div>
            <div className="w-1/5 bg-cyan-500/80 rounded-t h-7"></div>
            <div className="w-1/5 bg-blue-600 rounded-t h-10"></div>
            <div className="w-1/5 bg-purple-500/80 rounded-t h-8"></div>
            <div className="w-1/5 bg-emerald-400 rounded-t h-10 animate-pulse"></div>
          </div>

          <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/80">
            <span className="text-slate-400 uppercase font-bold">Operación 2026</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-led"></span> Sistema Activo
            </span>
          </div>
        </div>
      </div>

      {/* 2. Privacy Mode Toggle Banner */}
      <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded bg-sky-950/50 border border-sky-800/40 text-sky-400">
            {isPrivateMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 font-bold text-white">
              <span>Tarjetas Financieras Protegidas</span>
              <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-extrabold uppercase ${
                isPrivateMode ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              }`}>
                {isPrivateMode ? 'MODO PRIVADO' : 'MODO VISIBLE'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {isPrivateMode ? '— Cifras confidenciales ocultas a terceros' : 'Métricas y valores monetarios visibles'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsPrivateMode(prev => !prev)}
          className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold font-mono transition-all cursor-pointer shrink-0"
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
            <h3 className="text-xs font-mono font-extrabold text-slate-200 tracking-wider uppercase">
              Métricas de Despacho & Flota
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1 */}
            <div className="bg-hud-card border border-hud-border rounded-xl p-4 border-t-4 border-t-hud-accent shadow-lg flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1">
                  <FileText className="w-3 h-3 text-hud-accent" /> Total Solicitudes
                </span>
                <div className="text-2xl font-display font-extrabold text-white">
                  {totalOrders}
                </div>
              </div>
              <div className="bg-hud-accent/10 p-3 rounded-full">
                <FileText className="w-6 h-6 text-hud-accent" />
              </div>
            </div>

            {/* KPI 2 */}
            <div className="bg-hud-card border border-hud-border rounded-xl p-4 border-t-4 border-t-hud-green shadow-lg flex items-center justify-between">
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
            <div className="bg-hud-card border border-hud-border rounded-xl p-4 border-t-4 border-t-hud-orange shadow-lg flex items-center justify-between">
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
            <div className="bg-hud-card border border-hud-border rounded-xl p-4 border-t-4 border-t-hud-green shadow-lg flex items-center justify-between">
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
        </div>
      )}

      {/* 4. Category Filter Tabs Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {categoriesList.map(cat => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-lg shadow-sky-950 border border-sky-400'
                    : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                <span>{cat.label}</span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] ${
                  isActive ? 'bg-sky-900/60 text-white' : 'bg-slate-800 text-slate-400'
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
            className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] font-bold cursor-pointer"
          >
            {isFolded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            <span>{isFolded ? 'Desplegar Todos' : 'Plegar Todos'}</span>
          </button>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[10px] font-bold">
            <span className="text-slate-500 px-1 uppercase">Tamaño:</span>
            <button
              onClick={() => setCardSize('mini')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                cardSize === 'mini' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Mini
            </button>
            <button
              onClick={() => setCardSize('mediana')}
              className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                cardSize === 'mediana' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Mediana
            </button>
          </div>
        </div>
      </div>

      {/* 5. Categorized Module Cards Feed */}
      {!isFolded && (
        <div className="space-y-6">
          {displayedCategories.map(catKey => {
            const header = categoryHeaders[catKey];
            const catModules = MODULES_DIRECTORY.filter(m => m.category === catKey);
            if (catModules.length === 0) return null;

            return (
              <div key={catKey} className="space-y-3">
                {/* Section Title */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    <h3 className="text-xs font-mono font-extrabold text-slate-200 tracking-wider uppercase">
                      {header.title}
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    {catModules.length} módulos ▾
                  </span>
                </div>

                {/* Grid of Cards */}
                <div className={`grid gap-3.5 ${
                  cardSize === 'mini'
                    ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                }`}>
                  {catModules.map(mod => {
                    const IconComp = mod.icon;
                    return (
                      <div
                        key={mod.id}
                        onClick={() => handleModuleClick(mod)}
                        className={`bg-slate-950/70 hover:bg-slate-900 border border-slate-850 hover:border-sky-500/50 rounded-xl p-3.5 cursor-pointer transition-all duration-200 group flex items-start gap-3 relative shadow-md ${
                          cardSize === 'mini' ? 'min-h-[78px]' : 'min-h-[96px]'
                        }`}
                      >
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-sky-400 group-hover:bg-sky-500/10 group-hover:text-sky-300 group-hover:border-sky-500/30 transition-colors shrink-0">
                          <IconComp className="w-4 h-4" />
                        </div>
                        <div className="space-y-1 min-w-0 flex-1">
                          <h4 className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors truncate">
                            {mod.name}
                          </h4>
                          <p className="text-[10.5px] text-slate-400 line-clamp-2 leading-snug font-sans">
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
          className="bg-slate-950/70 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-xl p-3.5 flex items-center justify-between cursor-pointer transition-all shadow-md group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-500/20">
              <Check className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                Cumple con la Ley 2466
              </h4>
              <p className="text-[10px] text-slate-400 font-sans">
                Franja 19:00 y Cortes 12/27 configurados
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold text-sky-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
            NÓMINA →
          </span>
        </div>

        {/* Badge 2: Operación en Crecimiento */}
        <div 
          onClick={() => onNavigateTab && onNavigateTab('orders')}
          className="bg-slate-950/70 hover:bg-slate-900 border border-slate-800 hover:border-sky-500/40 rounded-xl p-3.5 flex items-center justify-between cursor-pointer transition-all shadow-md group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 group-hover:bg-sky-500/20">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors">
                Operación en Crecimiento
              </h4>
              <p className="text-[10px] text-slate-400 font-sans">
                {totalOrders} solicitudes centralizadas
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono font-bold text-sky-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
            FLETES →
          </span>
        </div>

        {/* Badge 3: Respaldo en la Nube */}
        <div 
          onClick={() => {
            if (onOpenSupabaseModal) onOpenSupabaseModal();
            else if (onOpenBackupModal) onOpenBackupModal();
          }}
          className="bg-slate-950/70 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/40 rounded-xl p-3.5 flex items-center justify-between cursor-pointer transition-all shadow-md group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:bg-cyan-500/20">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                Respaldo en la Nube
              </h4>
              <p className="text-[10px] text-slate-400 font-sans">
                Sincronización segura continua
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-led"></span> En Línea
            </span>
            <span className="text-[10px] font-mono font-bold text-slate-300 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
              Respaldos
            </span>
          </div>
        </div>
      </div>

      {/* 7. Terminal Network Monitor matching image_9178baed.png */}
      <div className="bg-hud-card border border-slate-800 rounded-xl p-4 shadow-inner">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800/80">
          <TerminalIcon className="w-4 h-4 text-hud-green pulse-led" />
          <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-widest">
            Monitor de red y sincronización (Firebase Real-time)
          </span>
        </div>
        <div className="font-mono text-xs text-hud-green/90 leading-relaxed bg-[#02050c]/85 p-3 rounded-lg border border-slate-900/60 max-h-36 overflow-y-auto">
          {logs.map((log, idx) => (
            <div key={idx}>{log}</div>
          ))}
        </div>
      </div>

    </div>
  );
}
