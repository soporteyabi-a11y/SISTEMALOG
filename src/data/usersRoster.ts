/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppUser, UserRole } from '../types';

export interface SystemModuleInfo {
  id: string;
  aliases: string[];
  nombre: string;
  categoria: 'Operativos' | 'Entidades' | 'Contabilidad & Nómina' | 'Inteligencia & GPS' | 'Configuración';
  descripcion: string;
  badge?: string;
}

export const SYSTEM_MODULES_LIST: SystemModuleInfo[] = [
  // Operativos
  { id: 'tablero', aliases: ['inicio', 'tablero'], nombre: 'Inicio & Tablero', categoria: 'Operativos', descripcion: 'Panel central de control y KPIs operativos' },
  { id: 'orders', aliases: ['orders', 'facturacion'], nombre: 'Solicitudes', categoria: 'Operativos', descripcion: 'Registro, importación y escaneo OCR de órdenes' },
  { id: 'despachados', aliases: ['despachados', 'despachado'], nombre: 'Despachados', categoria: 'Operativos', descripcion: 'Historial de fletes despachados con factura' },
  { id: 'pendientes', aliases: ['pendientes', 'pendiente'], nombre: 'Pendientes', categoria: 'Operativos', descripcion: 'Cola de solicitudes en cargue y por despachar' },
  { id: 'vehiculos', aliases: ['vehiculos'], nombre: 'Vehículos & Flota', categoria: 'Operativos', descripcion: 'Directorio de camiones, placas y conductores' },
  { id: 'citas', aliases: ['citas', 'agenda'], nombre: 'Agenda / Citas', categoria: 'Operativos', descripcion: 'Programación de entregas y citas en destino' },

  // Entidades
  { id: 'customers', aliases: ['customers', 'clientes'], nombre: 'Clientes', categoria: 'Entidades', descripcion: 'Directorio comercial, ciudades de destino y condiciones' },
  { id: 'carriers', aliases: ['carriers', 'transportadoras'], nombre: 'Transportadoras', categoria: 'Entidades', descripcion: 'Empresas de carga aliadas, tarifas base y liquidación' },

  // Contabilidad & Nómina
  { id: 'provisiones', aliases: ['provisiones', 'provision'], nombre: 'Provisiones & Fletes', categoria: 'Contabilidad & Nómina', descripcion: 'Cálculo de provisiones, fletes y manifiestos de carga' },
  { id: 'comprobantes', aliases: ['comprobantes'], nombre: 'Comprobantes Contables', categoria: 'Contabilidad & Nómina', descripcion: 'Generación, registro y auditoría de comprobantes' },
  { id: 'horas', aliases: ['horas', 'horasExtras'], nombre: 'Horas Extras & Nómina', categoria: 'Contabilidad & Nómina', descripcion: 'Control de turnos, recargos Ley 2466 y cortes 12/27' },
  { id: 'liquidador', aliases: ['liquidador'], nombre: 'Liquidación de Fletes', categoria: 'Contabilidad & Nómina', descripcion: 'Herramienta para liquidar costos reales vs cobro' },
  { id: 'diferencias', aliases: ['diferencias'], nombre: 'Auditoría Fletes', categoria: 'Contabilidad & Nómina', descripcion: 'Detección de diferencias entre flete cotizado y facturado' },
  { id: 'pedidos', aliases: ['pedidos', 'pedidoEmpleados'], nombre: 'Pedido Empleados', categoria: 'Contabilidad & Nómina', descripcion: 'Gestión y despacho de pedidos para el equipo interno' },

  // Inteligencia & GPS
  { id: 'analytics', aliases: ['analytics', 'dashboard'], nombre: 'Análisis Rentabilidad', categoria: 'Inteligencia & GPS', descripcion: 'Métricas financieras, márgenes y utilidad por cliente' },
  { id: 'seguimiento', aliases: ['seguimiento'], nombre: 'Monitoreo Satelital', categoria: 'Inteligencia & GPS', descripcion: 'Control en tiempo real de fletes en ruta nacional' },
  { id: 'mapas', aliases: ['mapas'], nombre: 'Mapas Pro GPS', categoria: 'Inteligencia & GPS', descripcion: 'Georreferenciación interactiva de rutas y básculas' },
  { id: 'novedades', aliases: ['novedades', 'dialogo'], nombre: 'Monitor de Novedades', categoria: 'Inteligencia & GPS', descripcion: 'Registro de novedades en muelle y transporte' },
  { id: 'recordatorios', aliases: ['recordatorios'], nombre: 'Recordatorios', categoria: 'Inteligencia & GPS', descripcion: 'Alertas y tareas pendientes de la operación' },

  // Configuración
  { id: 'usuarios', aliases: ['usuarios'], nombre: 'Usuarios & Permisos', categoria: 'Configuración', descripcion: 'Gestión de credenciales, roles y asignación de accesos' }
];

export const USERS_ROSTER: AppUser[] = [
  {
    id: 'user_washington',
    email: 'soporteyabi@gmail.com',
    nombre: 'Washington Quiñones',
    rol: 'SUPER_ADMIN',
    cargo: 'Dueño de la App & Administrador Principal',
    avatar: 'WQ',
    color: '#00f0b5',
    departamento: 'Dirección General & Operaciones',
    modulosPermitidos: [
      'inicio', 'tablero', 'orders', 'facturacion', 'despachados', 'despachado',
      'pendientes', 'pendiente', 'vehiculos', 'citas', 'agenda', 'customers',
      'carriers', 'provisiones', 'comprobantes', 'diferencias', 'liquidador',
      'horas', 'pedidos', 'pedidoEmpleados', 'recordatorios', 'analytics',
      'mapas', 'seguimiento', 'novedades', 'usuarios', 'configuracion', 'backup', 'supabase'
    ],
    permisos: {
      puedeCrearOrdenes: true,
      puedeEditarFletes: true,
      puedeVerFinanzas: true,
      puedeGestionarNomina: true,
      puedeGestionarUsuarios: true,
      puedeExportarDatos: true,
    }
  },
  {
    id: 'user_deyci',
    email: 'auxlogistico@latinproducts.com.co',
    nombre: 'Deyci Anacona',
    rol: 'AUXILIAR_LOGISTICO',
    cargo: 'Auxiliar Logístico',
    avatar: 'DA',
    color: '#38bdf8',
    departamento: 'Operaciones & Despacho',
    modulosPermitidos: [
      'inicio', 'tablero', 'orders', 'facturacion', 'despachados', 'despachado',
      'pendientes', 'pendiente', 'vehiculos', 'citas', 'agenda', 'customers',
      'carriers', 'horas', 'horasExtras', 'pedidos', 'pedidoEmpleados', 'novedades', 'recordatorios'
    ],
    permisos: {
      puedeCrearOrdenes: true,
      puedeEditarFletes: false,
      puedeVerFinanzas: false,
      puedeGestionarNomina: false,
      puedeGestionarUsuarios: false,
      puedeExportarDatos: true,
    }
  },
  {
    id: 'user_julian',
    email: 'logistica@latinproducts.com.co',
    nombre: 'Julian Barrios',
    rol: 'LOGISTICA',
    cargo: 'Coordinador de Logística & Transporte',
    avatar: 'JB',
    color: '#00c9a7',
    departamento: 'Logística Nacional & Despacho',
    modulosPermitidos: [
      'inicio', 'tablero', 'orders', 'facturacion', 'despachados', 'despachado',
      'pendientes', 'pendiente', 'vehiculos', 'citas', 'agenda', 'customers',
      'carriers', 'provisiones', 'liquidador', 'horas', 'horasExtras', 'mapas', 'seguimiento',
      'novedades', 'pedidos', 'pedidoEmpleados', 'recordatorios'
    ],
    permisos: {
      puedeCrearOrdenes: true,
      puedeEditarFletes: true,
      puedeVerFinanzas: false,
      puedeGestionarNomina: false,
      puedeGestionarUsuarios: false,
      puedeExportarDatos: true,
    }
  },
  {
    id: 'user_juan',
    email: 'juancarlos@latinproducts.com.co',
    nombre: 'Juan Carlos Soler',
    rol: 'AUXILIAR_LOGISTICO',
    cargo: 'Auxiliar de Producción & Despacho',
    avatar: 'JS',
    color: '#a855f7',
    departamento: 'Despacho & Producción',
    modulosPermitidos: [
      'inicio', 'tablero', 'horas', 'horasExtras', 'pedidos', 'pedidoEmpleados', 'recordatorios'
    ],
    permisos: {
      puedeCrearOrdenes: true,
      puedeEditarFletes: false,
      puedeVerFinanzas: false,
      puedeGestionarNomina: false,
      puedeGestionarUsuarios: false,
      puedeExportarDatos: true,
    }
  },
  {
    id: 'user_antonio',
    email: 'antonio@latinproducts.com.co',
    nombre: 'Antonio Calderon',
    rol: 'AUXILIAR_LOGISTICO',
    cargo: 'Jefe de Despacho & Muelle',
    avatar: 'AC',
    color: '#10b981',
    departamento: 'Despacho',
    modulosPermitidos: [
      'inicio', 'tablero', 'horas', 'horasExtras', 'pedidos', 'pedidoEmpleados', 'recordatorios'
    ],
    permisos: {
      puedeCrearOrdenes: true,
      puedeEditarFletes: false,
      puedeVerFinanzas: false,
      puedeGestionarNomina: false,
      puedeGestionarUsuarios: false,
      puedeExportarDatos: true,
    }
  },
  {
    id: 'user_diana',
    email: 'sst@latinproducts.com.co',
    nombre: 'Diana Agudelo',
    rol: 'SST_TALENTO',
    cargo: 'SST & Talento Humano',
    avatar: 'DA',
    color: '#f59e0b',
    departamento: 'Seguridad y Salud en el Trabajo & Nómina',
    modulosPermitidos: [
      'inicio', 'tablero', 'horas', 'horasExtras', 'vehiculos', 'citas', 'agenda',
      'novedades', 'pedidos', 'pedidoEmpleados', 'recordatorios'
    ],
    permisos: {
      puedeCrearOrdenes: false,
      puedeEditarFletes: false,
      puedeVerFinanzas: false,
      puedeGestionarNomina: true,
      puedeGestionarUsuarios: false,
      puedeExportarDatos: true,
    }
  }
];

export const loadUsersRoster = (): AppUser[] => {
  if (typeof window === 'undefined') return USERS_ROSTER;
  try {
    const raw = localStorage.getItem('erp_users_roster');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Guarantee every user has horas module access so workers can register
        const enriched = parsed.map((u: AppUser) => {
          const currentMods = u.modulosPermitidos || [];
          if (!currentMods.includes('horas')) {
            return {
              ...u,
              modulosPermitidos: [...currentMods, 'horas', 'horasExtras']
            };
          }
          return u;
        });

        // Ensure Juan Carlos and Antonio Calderon exist in roster
        USERS_ROSTER.forEach(defaultU => {
          if (!enriched.some(existing => existing.email.toLowerCase() === defaultU.email.toLowerCase())) {
            enriched.push(defaultU);
          }
        });

        return enriched;
      }
    }
  } catch (e) {
    console.error('Error loading users roster', e);
  }
  return USERS_ROSTER;
};

export const saveUsersRoster = (users: AppUser[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('erp_users_roster', JSON.stringify(users));
  } catch (e) {
    console.error('Error saving users roster', e);
  }
};

export const findUserByEmail = (email: string, users?: AppUser[]): AppUser | undefined => {
  const list = users && users.length > 0 ? users : loadUsersRoster();
  const clean = email.trim().toLowerCase();
  return list.find(u => u.email.toLowerCase() === clean);
};

export const canUserAccessTab = (user: AppUser | null, tab: string): boolean => {
  if (!user) return false;
  if (user.rol === 'SUPER_ADMIN') return true;
  const cleanTab = tab.toLowerCase();
  const moduleDef = SYSTEM_MODULES_LIST.find(m => m.aliases.some(a => a.toLowerCase() === cleanTab));
  if (moduleDef) {
    return user.modulosPermitidos.some(m => moduleDef.aliases.some(a => a.toLowerCase() === m.toLowerCase()));
  }
  return user.modulosPermitidos.some(m => m.toLowerCase() === cleanTab);
};

export const getAuthorStamp = (user: AppUser | null): { creador: string; rol: string; cargo: string } => {
  if (!user) {
    return {
      creador: 'Washington Quiñones (soporteyabi@gmail.com)',
      rol: 'SUPER_ADMIN',
      cargo: 'Dueño de la App & Administrador Principal'
    };
  }
  return {
    creador: `${user.nombre} (${user.email})`,
    rol: user.rol,
    cargo: user.cargo
  };
};
