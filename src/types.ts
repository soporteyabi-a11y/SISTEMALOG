/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Order {
  id: string;
  pv: string;
  oc: string;
  fechaIngreso: string;
  fechaSalida: string;
  fechaEntrega: string;
  fechaFactura: string;
  horaCita: string;
  cliente: string;
  ciudad: string;
  origen: string;
  peso: number; // in kg
  cajas: number;
  venta: number; // Sale price
  factura: string; // Sale Invoice number
  facturado: number; // Actual value in Invoice
  cajasFact: number; // Actual boxes in Invoice
  pesoFact: number; // Actual weight in Invoice
  flete: number; // Transport cost
  provision: string; // Provision invoice reference
  transportadora: string; // Carrier name
  placa: string;
  conductor: string;
  celular: string;
  estado: 'Pendiente' | 'En Cargue' | 'Despachado' | 'En Sitio / Bodega' | 'Entregado' | 'Anulado';
  obs: string;
  anuladoMotivo?: string;
  isSplit?: boolean;
  direccion?: string;
}

export interface Carrier {
  id: string;
  nombre: string;
  nit: string;
  ciudad: string;
  dir: string;
  contacto: string;
  tel: string;
  correo: string;
  costoSugerido: number;
  tipoCalculo?: 'fijo' | 'formula';
  porcentajeValor?: number;
  costoCaja?: number;
}

export interface Customer {
  id: string;
  nombre: string;
  ciudad: string;
  nit: string;
  dir: string;
  contacto: string;
  celular: string;
  fijo: string;
  email: string;
  malla: string;
  cita: 'SI' | 'NO';
  zona: string;
  obs: string;
}

export interface Novedad {
  id: string;
  titulo: string;
  descripcion: string;
  imageLink: string;
  tipo: string;
  pv: string;
  cliente: string;
  responsable: string;
  estado: 'Abierta' | 'En Proceso' | 'Cerrada';
  fecha: string;
}

export interface Reminder {
  id: string;
  titulo: string;
  desc: string;
  fecha: string;
  prioridad: 'Alta' | 'Media' | 'Baja';
  completado: boolean;
}
