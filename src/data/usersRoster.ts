/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppUser } from '../types';

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
      'inicio',
      'tablero',
      'orders',
      'facturacion',
      'despachados',
      'despachado',
      'pendientes',
      'pendiente',
      'vehiculos',
      'citas',
      'agenda',
      'customers',
      'carriers',
      'provisiones',
      'comprobantes',
      'diferencias',
      'liquidador',
      'horas',
      'pedidos',
      'pedidoEmpleados',
      'recordatorios',
      'analytics',
      'mapas',
      'seguimiento',
      'novedades',
      'usuarios',
      'configuracion',
      'backup',
      'supabase'
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
      'inicio',
      'tablero',
      'orders',
      'facturacion',
      'despachados',
      'despachado',
      'pendientes',
      'pendiente',
      'vehiculos',
      'citas',
      'agenda',
      'customers',
      'carriers',
      'pedidos',
      'pedidoEmpleados',
      'novedades',
      'recordatorios'
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
      'inicio',
      'tablero',
      'orders',
      'facturacion',
      'despachados',
      'despachado',
      'pendientes',
      'pendiente',
      'vehiculos',
      'citas',
      'agenda',
      'customers',
      'carriers',
      'provisiones',
      'liquidador',
      'mapas',
      'seguimiento',
      'novedades',
      'pedidos',
      'pedidoEmpleados',
      'recordatorios'
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
    id: 'user_diana',
    email: 'sst@latinproducts.com.co',
    nombre: 'Diana Agudelo',
    rol: 'SST_TALENTO',
    cargo: 'SST & Talento Humano',
    avatar: 'DA',
    color: '#f59e0b',
    departamento: 'Seguridad y Salud en el Trabajo & Nómina',
    modulosPermitidos: [
      'inicio',
      'tablero',
      'horas',
      'vehiculos',
      'citas',
      'agenda',
      'novedades',
      'pedidos',
      'pedidoEmpleados',
      'recordatorios'
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

export const findUserByEmail = (email: string): AppUser | undefined => {
  const clean = email.trim().toLowerCase();
  return USERS_ROSTER.find(u => u.email.toLowerCase() === clean);
};

export const canUserAccessTab = (user: AppUser | null, tab: string): boolean => {
  if (!user) return false;
  if (user.rol === 'SUPER_ADMIN') return true;
  const cleanTab = tab.toLowerCase();
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
