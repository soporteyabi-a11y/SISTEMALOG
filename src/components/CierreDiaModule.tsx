/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Printer,
  Copy,
  Check,
  FileSpreadsheet,
  Truck,
  Package,
  DollarSign,
  AlertTriangle,
  Clock,
  ShoppingBag,
  MessageSquare,
  CheckCircle2,
  ClipboardList,
  Info,
  Bell,
  XCircle,
  ExternalLink
} from 'lucide-react';
import { Order, Carrier, Novedad, Reminder, AppUser } from '../types';
import { subscribeToCloud, loadFromCloud } from '../firebaseService';

interface OvertimeRow {
  id: number | string;
  nom: string;
  car?: string;
  are?: string;
  fec: string;
  tipo?: string;
  _ent?: string;
  _sal?: string;
  hT?: number;
  extraTotal?: number;
  recNoct?: number;
  domFest?: number;
  netas?: number;
  pagado?: boolean;
  mot?: string;
}

interface EmployeeOrderRow {
  id: string;
  date: string;
  cedula?: string;
  employee: string;
  items?: Array<{ id?: number | string; name: string; qty: number; price?: number }>;
  subtotal?: number;
  iva?: number;
  total: number;
}

interface CierreDiaModuleProps {
  orders: Order[];
  carriers: Carrier[];
  novedades: Novedad[];
  reminders: Reminder[];
  currentUser: AppUser | null;
  onOpenOrder?: (order: Order) => void;
  onNavigateTab?: (tab: string) => void;
}

type SectionFilter = 'todo' | 'operacion' | 'arrastre' | 'equipo';

const getLocalTodayYMD = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const shiftYMD = (ymd: string, deltaDays: number): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return getLocalTodayYMD();
  const dt = new Date(y, m - 1, d + deltaDays);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  const nd = String(dt.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
};

const normalizeYMD = (raw?: string | null): string => {
  if (!raw) return '';
  const str = String(raw).trim();
  if (!str) return '';

  // ISO YYYY-MM-DD or YYYY-MM-DDTHH:mm...
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // DD/MM/YYYY or D/M/YYYY (with optional time)
  const dmySlash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmySlash) {
    const day = dmySlash[1].padStart(2, '0');
    const month = dmySlash[2].padStart(2, '0');
    const year = dmySlash[3];
    return `${year}-${month}-${day}`;
  }

  // Fallback parseable JS date
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
};

const formatLongSpanishDate = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m - 1, d);
  const formatted = dt.toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
};

const formatCOP = (value: number): string => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Math.round(value || 0));
};

const formatNumber = (value: number, decimals = 0): string => {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value || 0);
};

const formatHoursCompact = (dec: number): string => {
  if (!dec || dec <= 0) return '0h 00m';
  const h = Math.floor(dec);
  const m = Math.round((dec - h) * 60);
  if (m === 60) return `${h + 1}h 00m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

const normalizeCarrierLabel = (raw?: string): string => {
  const clean = String(raw || '').trim();
  if (!clean) return 'Sin transportadora asignada';
  const upper = clean.toUpperCase();
  if (upper.includes('FREDY') && upper.includes('HERNANDEZ') && upper.includes('IND')) {
    return 'FREDY HERNANDEZ';
  }
  return clean;
};

export default function CierreDiaModule({
  orders,
  carriers,
  novedades,
  reminders,
  currentUser,
  onOpenOrder,
  onNavigateTab
}: CierreDiaModuleProps) {
  const todayYMD = useMemo(() => getLocalTodayYMD(), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayYMD);
  const [activeSection, setActiveSection] = useState<SectionFilter>('todo');
  const [showAllPendingCarryover, setShowAllPendingCarryover] = useState<boolean>(false);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Read-only cloud + local hydration for Overtime (Horas Extras)
  const [overtimeRecords, setOvertimeRecords] = useState<OvertimeRow[]>(() => {
    try {
      const raw = window.localStorage?.getItem('latin_overtime_state');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.records)) return parsed.records;
      }
    } catch {
      // ignore storage failure
    }
    return [];
  });

  // Read-only cloud + local hydration for Pedidos Empleados
  const [employeeOrders, setEmployeeOrders] = useState<EmployeeOrderRow[]>(() => {
    try {
      const raw = window.localStorage?.getItem('latin_pedidos_local_state');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.orders)) return parsed.orders;
      }
    } catch {
      // ignore storage failure
    }
    return [];
  });

  useEffect(() => {
    let active = true;

    loadFromCloud('horas_extras_state', 'records')
      .then((data) => {
        if (active && Array.isArray(data)) setOvertimeRecords(data);
      })
      .catch(() => {});

    loadFromCloud('pedidos_empleados_state', 'orders')
      .then((data) => {
        if (active && Array.isArray(data)) setEmployeeOrders(data);
      })
      .catch(() => {});

    const unsubHoras = subscribeToCloud('horas_extras_state', 'records', (data) => {
      if (active && Array.isArray(data)) {
        setOvertimeRecords(data);
      }
    });

    const unsubPedidos = subscribeToCloud('pedidos_empleados_state', 'orders', (data) => {
      if (active && Array.isArray(data)) {
        setEmployeeOrders(data);
      }
    });

    return () => {
      active = false;
      unsubHoras();
      unsubPedidos();
    };
  }, []);

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  // =========================================================================
  // PURE READ-ONLY DAILY AGGREGATIONS
  // =========================================================================
  const report = useMemo(() => {
    const activeOrders = orders.filter((o) => o.estado !== 'Anulado');

    // 1. Solicitudes ingresadas en la fecha seleccionada
    const ingresosDelDia = activeOrders.filter(
      (o) => normalizeYMD(o.fechaIngreso) === selectedDate
    );

    // 2. Despachos realizados en la fecha seleccionada (por fechaSalida, o fechaFactura si falta salida en estado despachado/entregado)
    const despachosDelDia = activeOrders.filter((o) => {
      const fSal = normalizeYMD(o.fechaSalida);
      if (fSal === selectedDate) return true;
      if (!fSal && (o.estado === 'Despachado' || o.estado === 'Entregado' || o.estado === 'En Sitio / Bodega')) {
        return normalizeYMD(o.fechaFactura) === selectedDate;
      }
      return false;
    });

    // 3. Entregas confirmadas en la fecha
    const entregasDelDia = activeOrders.filter(
      (o) => normalizeYMD(o.fechaEntrega) === selectedDate
    );

    // 4. Anulaciones registradas en la fecha
    const anuladasDelDia = orders.filter((o) => {
      if (o.estado !== 'Anulado') return false;
      return (
        normalizeYMD(o.fechaSalida) === selectedDate ||
        normalizeYMD(o.fechaIngreso) === selectedDate ||
        normalizeYMD(o.modificadoEn) === selectedDate
      );
    });

    // Métricas financieras y volumétricas de los despachos del día
    const totalFacturadoDia = despachosDelDia.reduce((sum, o) => sum + (Number(o.facturado) || 0), 0);
    const totalVentaEstimadaDesp = despachosDelDia.reduce((sum, o) => sum + (Number(o.venta) || 0), 0);
    const totalFleteDia = despachosDelDia.reduce((sum, o) => sum + (Number(o.flete) || 0), 0);
    const pctFleteFacturado = totalFacturadoDia > 0 ? (totalFleteDia / totalFacturadoDia) * 100 : 0;

    const totalCajasDesp = despachosDelDia.reduce(
      (sum, o) => sum + (Number(o.cajasFact) > 0 ? Number(o.cajasFact) : Number(o.cajas) || 0),
      0
    );
    const totalPesoDesp = despachosDelDia.reduce(
      (sum, o) => sum + (Number(o.pesoFact) > 0 ? Number(o.pesoFact) : Number(o.peso) || 0),
      0
    );

    // Métricas de ingresos del día
    const totalVentaIngresos = ingresosDelDia.reduce((sum, o) => sum + (Number(o.venta) || 0), 0);
    const totalCajasIngresos = ingresosDelDia.reduce((sum, o) => sum + (Number(o.cajas) || 0), 0);
    const totalPesoIngresos = ingresosDelDia.reduce((sum, o) => sum + (Number(o.peso) || 0), 0);

    // Desglose por transportadora del día
    const carrierMap = new Map<
      string,
      {
        nombre: string;
        despachos: number;
        placas: Set<string>;
        ciudades: Set<string>;
        cajas: number;
        peso: number;
        facturado: number;
        flete: number;
      }
    >();

    for (const o of despachosDelDia) {
      const key = normalizeCarrierLabel(o.transportadora);
      if (!carrierMap.has(key)) {
        carrierMap.set(key, {
          nombre: key,
          despachos: 0,
          placas: new Set<string>(),
          ciudades: new Set<string>(),
          cajas: 0,
          peso: 0,
          facturado: 0,
          flete: 0
        });
      }
      const entry = carrierMap.get(key)!;
      entry.despachos += 1;
      if (o.placa && o.placa.trim()) entry.placas.add(o.placa.trim().toUpperCase());
      if (o.ciudad && o.ciudad.trim()) entry.ciudades.add(o.ciudad.trim());
      entry.cajas += Number(o.cajasFact) > 0 ? Number(o.cajasFact) : Number(o.cajas) || 0;
      entry.peso += Number(o.pesoFact) > 0 ? Number(o.pesoFact) : Number(o.peso) || 0;
      entry.facturado += Number(o.facturado) || 0;
      entry.flete += Number(o.flete) || 0;
    }

    const transportadorasDia = Array.from(carrierMap.values())
      .map((item) => ({
        nombre: item.nombre,
        despachos: item.despachos,
        placas: Array.from(item.placas),
        ciudades: Array.from(item.ciudades),
        cajas: item.cajas,
        peso: item.peso,
        facturado: item.facturado,
        flete: item.flete,
        pctFlete: item.facturado > 0 ? (item.flete / item.facturado) * 100 : 0
      }))
      .sort((a, b) => b.facturado - a.facturado || b.flete - a.flete || b.despachos - a.despachos);

    // Control de arrastre (Estado global actual por cerrar)
    const pendientesArrastre = activeOrders
      .filter((o) => o.estado === 'Pendiente' || o.estado === 'En Cargue')
      .sort((a, b) => (a.fechaIngreso || '').localeCompare(b.fechaIngreso || ''));

    const pendientesArrastreVenta = pendientesArrastre.reduce((s, o) => s + (Number(o.venta) || 0), 0);
    const pendientesArrastreCajas = pendientesArrastre.reduce((s, o) => s + (Number(o.cajas) || 0), 0);

    // Despachos del día con datos por completar (sin factura o flete $0)
    const despachosIncompletos = despachosDelDia.filter((o) => {
      const sinFactura = !o.factura || o.factura.trim() === '' || o.factura.trim().toUpperCase() === 'PENDIENTE';
      const sinValorFactura = (Number(o.facturado) || 0) <= 0;
      const sinFlete = (Number(o.flete) || 0) <= 0;
      return sinFactura || sinValorFactura || sinFlete;
    });

    // Novedades del día
    const novedadesDia = novedades.filter((n) => normalizeYMD(n.fecha) === selectedDate);
    const novedadesAbiertasTotal = novedades.filter((n) => n.estado !== 'Cerrada').length;

    // Recordatorios vencidos o de la fecha sin completar
    const recordatoriosPendientes = reminders.filter(
      (r) => !r.completado && normalizeYMD(r.fecha) && normalizeYMD(r.fecha) <= selectedDate
    );

    // Turnos / Horas Extras del día
    const turnosDia = overtimeRecords.filter((r) => normalizeYMD(r.fec) === selectedDate);
    const totalHorasExtrasDia = turnosDia.reduce((s, r) => s + (Number(r.netas) || 0), 0);
    const totalRecNoctDia = turnosDia.reduce((s, r) => s + (Number(r.recNoct) || 0), 0);

    // Pedidos de empleados del día
    const pedidosEmpDia = employeeOrders.filter((p) => normalizeYMD(p.date) === selectedDate);
    const totalPedidosEmpDia = pedidosEmpDia.reduce((s, p) => s + (Number(p.total) || 0), 0);

    // Vehículos únicos salidos
    const placasUnicasDia = new Set(
      despachosDelDia.map((o) => (o.placa || '').trim().toUpperCase()).filter(Boolean)
    );

    return {
      ingresosDelDia,
      despachosDelDia,
      entregasDelDia,
      anuladasDelDia,
      totalFacturadoDia,
      totalVentaEstimadaDesp,
      totalFleteDia,
      pctFleteFacturado,
      totalCajasDesp,
      totalPesoDesp,
      totalVentaIngresos,
      totalCajasIngresos,
      totalPesoIngresos,
      transportadorasDia,
      pendientesArrastre,
      pendientesArrastreVenta,
      pendientesArrastreCajas,
      despachosIncompletos,
      novedadesDia,
      novedadesAbiertasTotal,
      recordatoriosPendientes,
      turnosDia,
      totalHorasExtrasDia,
      totalRecNoctDia,
      pedidosEmpDia,
      totalPedidosEmpDia,
      vehiculosUnicosCount: placasUnicasDia.size,
      totalCarriersActivos: carriers.length
    };
  }, [orders, carriers.length, novedades, reminders, overtimeRecords, employeeOrders, selectedDate]);

  // =========================================================================
  // EXECUTIVE TEXT FOR WHATSAPP / MANAGEMENT COPY
  // =========================================================================
  const buildWhatsAppSummary = (): string => {
    const fechaTxt = formatLongSpanishDate(selectedDate);
    const lines: string[] = [
      `*LATIN PRODUCTS S.A.S. — CIERRE OPERATIVO DEL DÍA*`,
      `Fecha de corte: ${fechaTxt} (${selectedDate})`,
      `Elaborado por: ${currentUser?.nombre || 'Coordinación Logística'}`,
      ``,
      `*1. RESUMEN EJECUTIVO*`,
      `• Solicitudes ingresadas: ${report.ingresosDelDia.length} (${formatNumber(report.totalCajasIngresos)} cj · ${formatCOP(report.totalVentaIngresos)})`,
      `• Despachos realizados: ${report.despachosDelDia.length} (${report.vehiculosUnicosCount} vehículos · ${formatNumber(report.totalCajasDesp)} cj · ${formatNumber(report.totalPesoDesp, 1)} kg)`,
      `• Valor facturado despachado: ${formatCOP(report.totalFacturadoDia)}`,
      `• Fletes causados: ${formatCOP(report.totalFleteDia)} (${report.pctFleteFacturado.toFixed(2)}% sobre facturado)`,
      `• Entregas confirmadas: ${report.entregasDelDia.length} · Anulaciones del día: ${report.anuladasDelDia.length}`
    ];

    if (report.transportadorasDia.length > 0) {
      lines.push(``, `*2. DESGLOSE POR TRANSPORTADORA*`);
      report.transportadorasDia.forEach((tr) => {
        lines.push(
          `• ${tr.nombre}: ${tr.despachos} desp. · ${formatNumber(tr.cajas)} cj · Fact: ${formatCOP(tr.facturado)} · Flete: ${formatCOP(tr.flete)} (${tr.pctFlete.toFixed(1)}%)`
        );
      });
    }

    lines.push(
      ``,
      `*3. CONTROL DE ARRASTRE Y NOVEDADES*`,
      `• Cola abierta por despachar (Pendiente / En Cargue): ${report.pendientesArrastre.length} órdenes (${formatNumber(report.pendientesArrastreCajas)} cj · ${formatCOP(report.pendientesArrastreVenta)})`,
      `• Despachos del día con datos por completar (factura/flete): ${report.despachosIncompletos.length}`,
      `• Novedades registradas hoy: ${report.novedadesDia.length} (Abiertas acumuladas: ${report.novedadesAbiertasTotal})`,
      `• Turnos / Horas Extras del día: ${report.turnosDia.length} turnos (${formatHoursCompact(report.totalHorasExtrasDia)} netas · Rec. Noct: ${formatHoursCompact(report.totalRecNoctDia)})`,
      `• Pedidos de empleados del día: ${report.pedidosEmpDia.length} pedidos (${formatCOP(report.totalPedidosEmpDia)})`,
      ``,
      `_Informe solo informativo — SISTEMALOG / LATIN PRODUCTS S.A.S._`
    );
    return lines.join('\n');
  };

  const handleCopySummary = async () => {
    const text = buildWhatsAppSummary();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedSuccess(true);
      notify('Resumen ejecutivo copiado al portapapeles para WhatsApp o correo.');
      setTimeout(() => setCopiedSuccess(false), 2500);
    } catch {
      notify('No se pudo copiar automáticamente al portapapeles.');
    }
  };

  // =========================================================================
  // EXPORT MULTI-SHEET EXCEL WORKBOOK
  // =========================================================================
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    const resumenRows = [
      { CONCEPTO: 'Empresa', VALOR: 'LATIN PRODUCTS S.A.S. (NIT: 800.225.074-3)' },
      { CONCEPTO: 'Fecha de Cierre', VALOR: `${selectedDate} (${formatLongSpanishDate(selectedDate)})` },
      { CONCEPTO: 'Generado por', VALOR: currentUser?.nombre || 'Coordinación Logística' },
      { CONCEPTO: 'Solicitudes Ingresadas Hoy', VALOR: report.ingresosDelDia.length },
      { CONCEPTO: 'Cajas Solicitadas Hoy', VALOR: report.totalCajasIngresos },
      { CONCEPTO: 'Valor Solicitado Hoy (COP)', VALOR: report.totalVentaIngresos },
      { CONCEPTO: 'Despachos Realizados Hoy', VALOR: report.despachosDelDia.length },
      { CONCEPTO: 'Vehículos Únicos Despachados', VALOR: report.vehiculosUnicosCount },
      { CONCEPTO: 'Cajas Despachadas Hoy', VALOR: report.totalCajasDesp },
      { CONCEPTO: 'Peso Despachado Hoy (kg)', VALOR: report.totalPesoDesp },
      { CONCEPTO: 'Valor Facturado Despachado (COP)', VALOR: report.totalFacturadoDia },
      { CONCEPTO: 'Fletes Causados Hoy (COP)', VALOR: report.totalFleteDia },
      { CONCEPTO: '% Flete / Facturado', VALOR: Number(report.pctFleteFacturado.toFixed(2)) },
      { CONCEPTO: 'Entregas Confirmadas Hoy', VALOR: report.entregasDelDia.length },
      { CONCEPTO: 'Órdenes Anuladas Hoy', VALOR: report.anuladasDelDia.length },
      { CONCEPTO: 'Cola Abierta (Pendiente / En Cargue)', VALOR: report.pendientesArrastre.length },
      { CONCEPTO: 'Despachos del Día con Datos Incompletos', VALOR: report.despachosIncompletos.length },
      { CONCEPTO: 'Novedades del Día', VALOR: report.novedadesDia.length },
      { CONCEPTO: 'Turnos Horas Extras del Día', VALOR: report.turnosDia.length },
      { CONCEPTO: 'Pedidos Empleados del Día', VALOR: report.pedidosEmpDia.length }
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumenRows), 'Resumen_Ejecutivo');

    const despachosRows = report.despachosDelDia.map((o) => ({
      ID: o.id,
      PV: o.pv,
      OC: o.oc,
      Cliente: o.cliente,
      Ciudad: o.ciudad,
      Estado: o.estado,
      Transportadora: normalizeCarrierLabel(o.transportadora),
      Placa: o.placa || '',
      Conductor: o.conductor || '',
      Factura: o.factura || '',
      Cajas: Number(o.cajasFact) > 0 ? o.cajasFact : o.cajas,
      Peso_Kg: Number(o.pesoFact) > 0 ? o.pesoFact : o.peso,
      Facturado_COP: o.facturado || 0,
      Flete_COP: o.flete || 0,
      Provision: o.provision || ''
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(despachosRows.length ? despachosRows : [{ Mensaje: 'Sin despachos en esta fecha' }]),
      'Despachos_Dia'
    );

    const carriersRows = report.transportadorasDia.map((t) => ({
      Transportadora: t.nombre,
      Despachos: t.despachos,
      Placas: t.placas.join(', '),
      Destinos: t.ciudades.join(', '),
      Cajas: t.cajas,
      Peso_Kg: t.peso,
      Facturado_COP: t.facturado,
      Flete_COP: t.flete,
      Porcentaje_Flete: Number(t.pctFlete.toFixed(2))
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(carriersRows.length ? carriersRows : [{ Mensaje: 'Sin movimientos por transportadora' }]),
      'Transportadoras'
    );

    const arrastreRows = report.pendientesArrastre.map((o) => ({
      ID: o.id,
      PV: o.pv,
      OC: o.oc,
      Fecha_Ingreso: o.fechaIngreso,
      Estado: o.estado,
      Cliente: o.cliente,
      Ciudad: o.ciudad,
      Cajas: o.cajas,
      Peso_Kg: o.peso,
      Valor_Solicitado_COP: o.venta || 0
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(arrastreRows.length ? arrastreRows : [{ Mensaje: 'Cola de pendientes vacía' }]),
      'Pendientes_Arrastre'
    );

    const equipoRows = [
      ...report.novedadesDia.map((n) => ({
        Categoria: 'Novedad',
        Referencia: n.pv || n.id,
        Persona_Entidad: n.cliente || n.responsable,
        Detalle: `${n.titulo} — ${n.descripcion}`,
        Estado: n.estado,
        Valor_o_Horas: ''
      })),
      ...report.turnosDia.map((t) => ({
        Categoria: 'Turno / Horas Extras',
        Referencia: t.fec,
        Persona_Entidad: t.nom,
        Detalle: `${t._ent || '--'} a ${t._sal || '--'} (${t.mot || 'Operación logística'})`,
        Estado: t.pagado ? 'Pagado' : 'Pendiente',
        Valor_o_Horas: `${Number(t.netas || 0).toFixed(2)}h netas / RecNoct ${Number(t.recNoct || 0).toFixed(2)}h`
      })),
      ...report.pedidosEmpDia.map((p) => ({
        Categoria: 'Pedido Empleado',
        Referencia: p.id,
        Persona_Entidad: p.employee,
        Detalle: `${(p.items || []).length} productos`,
        Estado: 'Registrado',
        Valor_o_Horas: p.total || 0
      }))
    ];
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(equipoRows.length ? equipoRows : [{ Mensaje: 'Sin novedades, turnos ni pedidos en la fecha' }]),
      'Novedades_Equipo'
    );

    XLSX.writeFile(wb, `Cierre_Dia_Latin_Products_${selectedDate}.xlsx`);
    notify(`Archivo Excel generado: Cierre_Dia_Latin_Products_${selectedDate}.xlsx`);
  };

  // =========================================================================
  // PRINT PORTAL (A4 / LETTER)
  // =========================================================================
  const handlePrintCierre = () => {
    document.body.classList.add('print-cierre-mode');
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove('print-cierre-mode');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      window.print();
      setTimeout(cleanup, 1200);
    }, 80);
  };

  const visiblePendingCarryover = showAllPendingCarryover
    ? report.pendientesArrastre
    : report.pendientesArrastre.slice(0, 8);

  const showOperacion = activeSection === 'todo' || activeSection === 'operacion';
  const showArrastre = activeSection === 'todo' || activeSection === 'arrastre';
  const showEquipo = activeSection === 'todo' || activeSection === 'equipo';

  const hasAnyDailyMovement =
    report.ingresosDelDia.length > 0 ||
    report.despachosDelDia.length > 0 ||
    report.entregasDelDia.length > 0 ||
    report.anuladasDelDia.length > 0 ||
    report.novedadesDia.length > 0 ||
    report.turnosDia.length > 0 ||
    report.pedidosEmpDia.length > 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-14 font-sans text-slate-100">
      {/* Toast Feedback */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-[12000] bg-slate-900 border border-teal-400/50 text-slate-100 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-sm print:hidden">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* =================================================================== */}
      {/* 1. ENCABEZADO EJECUTIVO Y CONTROLES DE FECHA / SALIDA                */}
      {/* =================================================================== */}
      <section className="bg-[#041b24] border border-slate-700/70 rounded-2xl p-5 sm:p-6 shadow-lg print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-teal-300 font-medium">
              <span>LATIN PRODUCTS S.A.S.</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-300 flex items-center gap-1">
                <Info className="w-3.5 h-3.5 text-teal-400" />
                Reporte solo informativo (sin bloqueo ni modificación de datos)
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-white tracking-tight">
              Cierre Operativo del Día
            </h1>
            <p className="text-sm text-slate-300">
              Corte correspondiente al <span className="font-semibold text-white">{formatLongSpanishDate(selectedDate)}</span>
              {selectedDate === todayYMD ? ' (Jornada actual)' : ''}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Selector de Fecha */}
            <div className="flex items-center bg-slate-950/90 border border-slate-700 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => setSelectedDate((prev) => shiftYMD(prev, -1))}
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Día anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="relative flex items-center">
                <Calendar className="w-4 h-4 text-teal-400 ml-2 pointer-events-none" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) setSelectedDate(e.target.value);
                  }}
                  className="bg-transparent text-slate-100 text-sm font-mono font-semibold px-2.5 py-1.5 outline-none cursor-pointer [color-scheme:dark]"
                />
              </div>
              <button
                type="button"
                onClick={() => setSelectedDate((prev) => shiftYMD(prev, 1))}
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Día siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {selectedDate !== todayYMD && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayYMD)}
                  className="px-2.5 py-1.5 mr-0.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Hoy
                </button>
              )}
            </div>

            {/* Salidas Ejecutivas */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopySummary}
                className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                {copiedSuccess ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-teal-300" />}
                <span>{copiedSuccess ? 'Copiado' : 'Copiar WhatsApp'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-100 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Excel</span>
              </button>

              <button
                type="button"
                onClick={handlePrintCierre}
                className="px-4 py-2.5 rounded-xl bg-teal-400 hover:bg-teal-300 text-slate-950 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Cierre A4</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filtro de Vista por Bloque */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'todo', label: 'Informe Completo' },
                { id: 'operacion', label: `Despachos y Flota (${report.despachosDelDia.length})` },
                { id: 'arrastre', label: `Control y Pendientes (${report.pendientesArrastre.length})` },
                {
                  id: 'equipo',
                  label: `Novedades, Turnos y Pedidos (${
                    report.novedadesDia.length + report.turnosDia.length + report.pedidosEmpDia.length
                  })`
                }
              ] as const
            ).map((tab) => {
              const active = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSection(tab.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-teal-400/15 text-teal-200 border border-teal-400/40'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/70 border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="text-xs text-slate-400 font-mono tabular-nums">
            {report.vehiculosUnicosCount} vehículos despachados · {report.totalCarriersActivos} transportadoras registradas
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 2. RESUMEN EJECUTIVO DEL DÍA (5 MÉTRICAS PRINCIPALES)               */}
      {/* =================================================================== */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 print:hidden">
        {/* Métrica 1: Solicitudes Ingresadas */}
        <div className="bg-[#041b24] border border-slate-700/70 rounded-xl p-4 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Solicitudes Ingresadas</span>
            <ClipboardList className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-display font-bold text-white font-mono tabular-nums">
            {report.ingresosDelDia.length}
          </div>
          <div className="text-xs text-slate-300 font-mono tabular-nums">
            {formatNumber(report.totalCajasIngresos)} cj · {formatCOP(report.totalVentaIngresos)}
          </div>
        </div>

        {/* Métrica 2: Despachos Realizados */}
        <div className="bg-[#041b24] border border-slate-700/70 rounded-xl p-4 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Despachos del Día</span>
            <Truck className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-display font-bold text-white font-mono tabular-nums">
            {report.despachosDelDia.length}
          </div>
          <div className="text-xs text-slate-300 font-mono tabular-nums">
            {formatNumber(report.totalCajasDesp)} cj · {formatNumber(report.totalPesoDesp, 1)} kg
          </div>
        </div>

        {/* Métrica 3: Valor Facturado */}
        <div className="bg-[#041b24] border border-slate-700/70 rounded-xl p-4 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Valor Facturado</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-display font-bold text-emerald-300 font-mono tabular-nums">
            {formatCOP(report.totalFacturadoDia)}
          </div>
          <div className="text-xs text-slate-300 font-mono tabular-nums">
            Venta base: {formatCOP(report.totalVentaEstimadaDesp)}
          </div>
        </div>

        {/* Métrica 4: Fletes Causados */}
        <div className="bg-[#041b24] border border-slate-700/70 rounded-xl p-4 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Fletes Causados</span>
            <Package className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-display font-bold text-amber-300 font-mono tabular-nums">
            {formatCOP(report.totalFleteDia)}
          </div>
          <div className="text-xs text-slate-300 font-mono tabular-nums">
            Incidencia: {report.pctFleteFacturado.toFixed(2)}% sobre facturado
          </div>
        </div>

        {/* Métrica 5: Entregas & Anulaciones */}
        <div className="bg-[#041b24] border border-slate-700/70 rounded-xl p-4 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Entregas Confirmadas</span>
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-display font-bold text-white font-mono tabular-nums">
            {report.entregasDelDia.length}
          </div>
          <div className="text-xs text-slate-300 font-mono tabular-nums">
            {report.anuladasDelDia.length} anulaciones · {report.pendientesArrastre.length} en cola
          </div>
        </div>
      </section>

      {/* Banner sutil cuando no hay movimientos en la fecha consultada */}
      {!hasAnyDailyMovement && (
        <div className="bg-[#041b24] border border-slate-700/70 rounded-xl p-6 text-center space-y-1.5 print:hidden">
          <p className="text-base font-semibold text-slate-200">
            No se registraron movimientos operativos para el {formatLongSpanishDate(selectedDate)}
          </p>
          <p className="text-sm text-slate-400">
            Puedes usar las flechas de fecha arriba para revisar otra jornada o consultar la cola activa de arrastre abajo.
          </p>
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. BLOQUE OPERACIÓN Y FLOTA (TRANSPORTADORAS, DESPACHOS, INGRESOS)  */}
      {/* =================================================================== */}
      {showOperacion && (
        <div className="space-y-6 print:hidden">
          {/* 3A. Desglose por Transportadora */}
          <section className="bg-[#041b24] border border-slate-700/70 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-display font-bold text-white">
                  Desglose por Transportadora del Día
                </h2>
                <p className="text-xs text-slate-400">
                  Consolidado de carga despachada, vehículos utilizados y relación costo de flete vs facturado
                </p>
              </div>
              <span className="text-xs text-slate-300 font-mono tabular-nums">
                {report.transportadorasDia.length} empresas con salida hoy
              </span>
            </div>

            {report.transportadorasDia.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                Sin despachos asignados a transportadoras en esta fecha.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/60 border-b border-slate-800 text-xs text-slate-400 font-semibold">
                      <th className="py-3 px-4">Transportadora</th>
                      <th className="py-3 px-4">Placas</th>
                      <th className="py-3 px-4">Destinos</th>
                      <th className="py-3 px-4 text-right">Despachos</th>
                      <th className="py-3 px-4 text-right">Cajas</th>
                      <th className="py-3 px-4 text-right">Peso (kg)</th>
                      <th className="py-3 px-4 text-right">Facturado</th>
                      <th className="py-3 px-4 text-right">Flete</th>
                      <th className="py-3 px-4 text-right">% Flete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-sm">
                    {report.transportadorasDia.map((tr) => (
                      <tr key={tr.nombre} className="hover:bg-slate-900/50 transition-colors">
                        <td className="py-2.5 px-4 font-semibold text-white">{tr.nombre}</td>
                        <td className="py-2.5 px-4 font-mono text-xs text-slate-300">
                          {tr.placas.length > 0 ? tr.placas.join(', ') : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300 text-xs max-w-[220px] truncate" title={tr.ciudades.join(', ')}>
                          {tr.ciudades.length > 0 ? tr.ciudades.join(', ') : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">{tr.despachos}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">{formatNumber(tr.cajas)}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300">{formatNumber(tr.peso, 1)}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-300 font-semibold">
                          {formatCOP(tr.facturado)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-300 font-semibold">
                          {formatCOP(tr.flete)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                          {tr.facturado > 0 ? `${tr.pctFlete.toFixed(2)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-950/70 border-t border-slate-700 text-sm font-bold text-white">
                      <td className="py-3 px-4" colSpan={3}>Total Despachado del Día</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">{report.despachosDelDia.length}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">{formatNumber(report.totalCajasDesp)}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">{formatNumber(report.totalPesoDesp, 1)}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-300">
                        {formatCOP(report.totalFacturadoDia)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-300">
                        {formatCOP(report.totalFleteDia)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {report.totalFacturadoDia > 0 ? `${report.pctFleteFacturado.toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* 3B. Detalle de Despachos Salidos Hoy */}
          <section className="bg-[#041b24] border border-slate-700/70 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-display font-bold text-white">
                  Detalle de Despachos Realizados ({report.despachosDelDia.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Órdenes con fecha de salida o facturación registrada en la jornada
                </p>
              </div>
            </div>

            {report.despachosDelDia.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                No hay despachos registrados para esta fecha.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/60 border-b border-slate-800 text-xs text-slate-400 font-semibold">
                      <th className="py-3 px-4">Solicitud / PV</th>
                      <th className="py-3 px-4">Cliente &amp; Destino</th>
                      <th className="py-3 px-4">Transportadora / Placa</th>
                      <th className="py-3 px-4">Factura</th>
                      <th className="py-3 px-4 text-right">Cajas</th>
                      <th className="py-3 px-4 text-right">Facturado</th>
                      <th className="py-3 px-4 text-right">Flete</th>
                      <th className="py-3 px-4">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-sm">
                    {report.despachosDelDia.map((o) => {
                      const sinFactura = !o.factura || o.factura.trim().toUpperCase() === 'PENDIENTE';
                      const cajas = Number(o.cajasFact) > 0 ? o.cajasFact : o.cajas;
                      return (
                        <tr
                          key={o.id}
                          onClick={() => onOpenOrder && onOpenOrder(o)}
                          className={`hover:bg-slate-900/50 transition-colors ${onOpenOrder ? 'cursor-pointer' : ''}`}
                        >
                          <td className="py-2.5 px-4 font-mono text-xs">
                            <div className="font-bold text-teal-300">{o.id}</div>
                            <div className="text-slate-400">PV {o.pv || '—'}</div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-white">{o.cliente}</div>
                            <div className="text-xs text-slate-400">{o.ciudad || '—'}</div>
                          </td>
                          <td className="py-2.5 px-4 text-xs">
                            <div className="text-slate-200 font-medium">{normalizeCarrierLabel(o.transportadora)}</div>
                            <div className="font-mono text-slate-400">{o.placa || 'Sin placa'}</div>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-xs">
                            {sinFactura ? (
                              <span className="text-amber-300 font-semibold">Sin factura</span>
                            ) : (
                              <span className="text-slate-200">{o.factura}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                            {formatNumber(cajas)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-300 font-semibold">
                            {formatCOP(o.facturado || 0)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-300">
                            {formatCOP(o.flete || 0)}
                          </td>
                          <td className="py-2.5 px-4 text-xs font-medium text-slate-300">
                            {o.estado}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 3C. Solicitudes Ingresadas Hoy + Entregas + Anulaciones */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Ingresos del día */}
            <section className="bg-[#041b24] border border-slate-700/70 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-display font-bold text-white">
                    Solicitudes Ingresadas ({report.ingresosDelDia.length})
                  </h2>
                  <p className="text-xs text-slate-400">Pedidos registrados con fecha de ingreso en la jornada</p>
                </div>
                <span className="text-xs font-mono tabular-nums text-sky-300 font-semibold">
                  {formatCOP(report.totalVentaIngresos)}
                </span>
              </div>

              {report.ingresosDelDia.length === 0 ? (
                <div className="px-5 py-7 text-center text-sm text-slate-400">
                  Sin solicitudes ingresadas en esta fecha.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80 max-h-80 overflow-y-auto">
                  {report.ingresosDelDia.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => onOpenOrder && onOpenOrder(o)}
                      className={`px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-900/50 transition-colors ${
                        onOpenOrder ? 'cursor-pointer' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{o.cliente}</div>
                        <div className="text-xs text-slate-400 font-mono">
                          {o.id} · PV {o.pv || '—'} · {o.ciudad} · {o.estado}
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-mono tabular-nums">
                        <div className="text-sm font-semibold text-slate-100">{formatCOP(o.venta || 0)}</div>
                        <div className="text-xs text-slate-400">{formatNumber(o.cajas)} cj</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Entregas Confirmadas + Anulaciones */}
            <section className="bg-[#041b24] border border-slate-700/70 rounded-2xl overflow-hidden flex flex-col">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-display font-bold text-white">
                    Entregas Confirmadas ({report.entregasDelDia.length}) y Anulaciones ({report.anuladasDelDia.length})
                  </h2>
                  <p className="text-xs text-slate-400">Cumplidos cerrados y órdenes anuladas en la fecha</p>
                </div>
              </div>

              {report.entregasDelDia.length === 0 && report.anuladasDelDia.length === 0 ? (
                <div className="px-5 py-7 text-center text-sm text-slate-400">
                  Sin entregas confirmadas ni anulaciones registradas hoy.
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80 max-h-80 overflow-y-auto">
                  {report.entregasDelDia.map((o) => (
                    <div
                      key={`ent-${o.id}`}
                      onClick={() => onOpenOrder && onOpenOrder(o)}
                      className={`px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-900/50 ${
                        onOpenOrder ? 'cursor-pointer' : ''
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{o.cliente}</div>
                        <div className="text-xs text-slate-400 font-mono">
                          Entregado · {o.id} · PV {o.pv || '—'} · Fact {o.factura || '—'}
                        </div>
                      </div>
                      <span className="text-xs font-semibold text-emerald-300 font-mono tabular-nums shrink-0">
                        {formatCOP(o.facturado || o.venta || 0)}
                      </span>
                    </div>
                  ))}
                  {report.anuladasDelDia.map((o) => (
                    <div
                      key={`anu-${o.id}`}
                      className="px-5 py-3 flex items-center justify-between gap-3 bg-rose-950/15"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-rose-200 truncate flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>Anulada: {o.cliente}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          {o.id} · PV {o.pv || '—'} · Motivo: {o.anuladoMotivo || 'No especificado'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 4. CONTROL DE ARRASTRE Y VERIFICACIONES INFORMATIVAS                */}
      {/* =================================================================== */}
      {showArrastre && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 print:hidden">
          {/* Cola Abierta de Pendientes */}
          <section className="lg:col-span-7 bg-[#041b24] border border-slate-700/70 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-display font-bold text-white">
                  Pendientes de Arrastre para Próxima Jornada ({report.pendientesArrastre.length})
                </h2>
                <p className="text-xs text-slate-400">
                  Solicitudes activas actualmente en Pendiente o En Cargue ({formatNumber(report.pendientesArrastreCajas)} cj · {formatCOP(report.pendientesArrastreVenta)})
                </p>
              </div>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('pendientes')}
                  className="text-xs font-semibold text-teal-300 hover:text-teal-200 flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <span>Ir a Pendientes</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {report.pendientesArrastre.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-emerald-300">
                Cola al día: no hay órdenes pendientes ni en cargue por arrastrar.
              </div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-950/60 border-b border-slate-800 text-xs text-slate-400 font-semibold">
                        <th className="py-2.5 px-4">Solicitud / Ingreso</th>
                        <th className="py-2.5 px-4">Cliente &amp; Destino</th>
                        <th className="py-2.5 px-4">Estado</th>
                        <th className="py-2.5 px-4 text-right">Cajas</th>
                        <th className="py-2.5 px-4 text-right">Venta Est.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-sm">
                      {visiblePendingCarryover.map((o) => (
                        <tr
                          key={o.id}
                          onClick={() => onOpenOrder && onOpenOrder(o)}
                          className={`hover:bg-slate-900/50 ${onOpenOrder ? 'cursor-pointer' : ''}`}
                        >
                          <td className="py-2.5 px-4 font-mono text-xs">
                            <div className="font-bold text-slate-100">{o.id} · PV {o.pv || '—'}</div>
                            <div className="text-slate-400">{o.fechaIngreso || 'Sin fecha'}</div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-white">{o.cliente}</div>
                            <div className="text-xs text-slate-400">{o.ciudad}</div>
                          </td>
                          <td className="py-2.5 px-4 text-xs font-semibold text-amber-300">{o.estado}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                            {formatNumber(o.cajas)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                            {formatCOP(o.venta || 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {report.pendientesArrastre.length > 8 && (
                  <div className="px-5 py-3 border-t border-slate-800 text-center">
                    <button
                      type="button"
                      onClick={() => setShowAllPendingCarryover((prev) => !prev)}
                      className="text-xs font-semibold text-teal-300 hover:text-teal-200 cursor-pointer"
                    >
                      {showAllPendingCarryover
                        ? 'Mostrar resumen (primeras 8)'
                        : `Ver las ${report.pendientesArrastre.length} solicitudes pendientes`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Checklist Informativo: Despachos con Datos Incompletos & Recordatorios */}
          <section className="lg:col-span-5 bg-[#041b24] border border-slate-700/70 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-800">
              <h2 className="text-base font-display font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Verificación Informativa de Cierre</span>
              </h2>
              <p className="text-xs text-slate-400">
                Datos por completar en despachos de hoy y recordatorios pendientes
              </p>
            </div>

            <div className="p-5 space-y-5 flex-1">
              {/* Sub-bloque 1: Despachos del día sin factura o flete $0 */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span>Despachos del día sin factura o sin flete ($0)</span>
                  <span className="font-mono tabular-nums text-amber-300">
                    {report.despachosIncompletos.length}
                  </span>
                </div>

                {report.despachosIncompletos.length === 0 ? (
                  <div className="text-xs text-emerald-300 py-2">
                    Todos los despachos de esta fecha tienen factura, valor facturado y flete diligenciados.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                    {report.despachosIncompletos.map((o) => {
                      const faltaFactura = !o.factura || o.factura.trim().toUpperCase() === 'PENDIENTE';
                      const faltaValor = (Number(o.facturado) || 0) <= 0;
                      const faltaFlete = (Number(o.flete) || 0) <= 0;
                      const motivos = [
                        faltaFactura ? 'Sin No. Factura' : null,
                        faltaValor ? 'Facturado $0' : null,
                        faltaFlete ? 'Flete $0' : null
                      ]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <div
                          key={o.id}
                          onClick={() => onOpenOrder && onOpenOrder(o)}
                          className={`px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-900/50 ${
                            onOpenOrder ? 'cursor-pointer' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-white truncate">{o.cliente}</div>
                            <div className="font-mono text-slate-400">
                              {o.id} · PV {o.pv || '—'}
                            </div>
                          </div>
                          <span className="text-amber-300 font-medium shrink-0 text-right">{motivos}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sub-bloque 2: Recordatorios vencidos o programados hasta la fecha */}
              <div className="pt-4 border-t border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-teal-400" />
                    Recordatorios activos hasta el corte
                  </span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {report.recordatoriosPendientes.length}
                  </span>
                </div>

                {report.recordatoriosPendientes.length === 0 ? (
                  <div className="text-xs text-slate-400 py-1">
                    Sin recordatorios pendientes hasta el {selectedDate}.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                    {report.recordatoriosPendientes.map((r) => (
                      <div key={r.id} className="px-3.5 py-2.5 text-xs space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{r.titulo}</span>
                          <span className="font-mono text-slate-400 shrink-0">{r.fecha}</span>
                        </div>
                        {r.desc && <p className="text-slate-400 line-clamp-1">{r.desc}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* 5. NOVEDADES, TURNOS / HORAS EXTRAS Y PEDIDOS DE EMPLEADOS DEL DÍA  */}
      {/* =================================================================== */}
      {showEquipo && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5 print:hidden">
          {/* Novedades del día */}
          <div className="bg-[#041b24] border border-slate-700/70 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-rose-400" />
                <h2 className="text-base font-display font-bold text-white">
                  Novedades del Día ({report.novedadesDia.length})
                </h2>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {report.novedadesAbiertasTotal} abiertas
              </span>
            </div>

            {report.novedadesDia.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400 flex-1 flex items-center justify-center">
                Sin novedades registradas en esta fecha.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80 max-h-80 overflow-y-auto">
                {report.novedadesDia.map((n) => (
                  <div key={n.id} className="px-5 py-3.5 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{n.titulo}</span>
                      <span className="text-xs font-medium text-amber-300 shrink-0">{n.estado}</span>
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-2">{n.descripcion}</p>
                    <div className="text-xs text-slate-400 font-mono">
                      PV {n.pv || 'N/A'} · {n.cliente || 'General'} · Resp: {n.responsable || 'Equipo'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Turnos y Horas Extras del día */}
          <div className="bg-[#041b24] border border-slate-700/70 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                <h2 className="text-base font-display font-bold text-white">
                  Turnos &amp; Horas Extras ({report.turnosDia.length})
                </h2>
              </div>
              <span className="text-xs font-mono tabular-nums text-amber-300 font-semibold">
                {formatHoursCompact(report.totalHorasExtrasDia)} netas
              </span>
            </div>

            {report.turnosDia.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400 flex-1 flex items-center justify-center">
                Sin turnos de horas extras registrados en esta fecha.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80 max-h-80 overflow-y-auto">
                {report.turnosDia.map((t) => (
                  <div key={t.id} className="px-5 py-3.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">{t.nom}</span>
                      <span className="text-xs font-mono tabular-nums font-semibold text-teal-300">
                        {formatHoursCompact(Number(t.netas) || 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-300 font-mono">
                      <span>
                        {t._ent || '--:--'} → {t._sal || '--:--'} ({formatHoursCompact(Number(t.hT) || 0)} trab.)
                      </span>
                      <span className={t.pagado ? 'text-emerald-300' : 'text-amber-300'}>
                        {t.pagado ? 'Pagado' : 'Pendiente'}
                      </span>
                    </div>
                    {(Number(t.recNoct) > 0 || t.mot) && (
                      <div className="text-xs text-slate-400">
                        {Number(t.recNoct) > 0 ? `Rec. Noct: ${formatHoursCompact(Number(t.recNoct))} · ` : ''}
                        {t.mot || ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pedidos de Empleados del día */}
          <div className="bg-[#041b24] border border-slate-700/70 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-cyan-400" />
                <h2 className="text-base font-display font-bold text-white">
                  Pedidos Empleados ({report.pedidosEmpDia.length})
                </h2>
              </div>
              <span className="text-xs font-mono tabular-nums text-cyan-300 font-semibold">
                {formatCOP(report.totalPedidosEmpDia)}
              </span>
            </div>

            {report.pedidosEmpDia.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-400 flex-1 flex items-center justify-center">
                Sin pedidos internos de empleados en esta fecha.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80 max-h-80 overflow-y-auto">
                {report.pedidosEmpDia.map((p) => (
                  <div key={p.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{p.employee}</div>
                      <div className="text-xs text-slate-400 font-mono">
                        {p.id} · {(p.items || []).length} productos
                      </div>
                    </div>
                    <div className="text-sm font-mono tabular-nums font-semibold text-cyan-300 shrink-0">
                      {formatCOP(p.total || 0)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* 6. FORMATO IMPRESO OFICIAL A4 / CARTA (PORTAL A DOCUMENT.BODY)       */}
      {/* =================================================================== */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div id="printCierreDia">
            <div style={{ fontFamily: 'Inter, Arial, sans-serif', color: '#0f172a', fontSize: '10.5px', lineHeight: 1.4 }}>
              {/* Encabezado Oficial LATIN PRODUCTS S.A.S. */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  borderBottom: '2px solid #0f172a',
                  paddingBottom: '8px',
                  marginBottom: '12px'
                }}
              >
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.02em' }}>
                    LATIN PRODUCTS S.A.S.
                  </div>
                  <div style={{ fontSize: '9.5px', color: '#334155', marginTop: '2px' }}>
                    NIT: 800.225.074-3 · Carrera 39 # 14-62 Acopi - Yumbo · Tel: 384 40 90
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' }}>
                    CIERRE OPERATIVO DEL DÍA (INFORMATIVO)
                  </div>
                  <div style={{ fontSize: '10px', marginTop: '2px' }}>
                    <strong>Fecha de corte:</strong> {formatLongSpanishDate(selectedDate)} ({selectedDate})
                  </div>
                  <div style={{ fontSize: '9px', color: '#475569' }}>
                    Generado por: {currentUser?.nombre || 'Coordinación Logística'} · {new Date().toLocaleString('es-CO')}
                  </div>
                </div>
              </div>

              {/* Bloque 1: Resumen Ejecutivo */}
              <div style={{ fontWeight: 700, fontSize: '10.5px', textTransform: 'uppercase', marginBottom: '5px' }}>
                1. Resumen Ejecutivo de la Jornada
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Solicitudes Ingresadas</th>
                    <th>Despachos Salidos</th>
                    <th>Volumen Despachado</th>
                    <th>Valor Facturado</th>
                    <th>Fletes Causados</th>
                    <th>% Flete / Fact.</th>
                    <th>Entregas / Anuladas</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>{report.ingresosDelDia.length}</strong> órd. ({formatCOP(report.totalVentaIngresos)})
                    </td>
                    <td>
                      <strong>{report.despachosDelDia.length}</strong> desp. ({report.vehiculosUnicosCount} veh.)
                    </td>
                    <td>
                      {formatNumber(report.totalCajasDesp)} cj · {formatNumber(report.totalPesoDesp, 1)} kg
                    </td>
                    <td className="text-right">
                      <strong>{formatCOP(report.totalFacturadoDia)}</strong>
                    </td>
                    <td className="text-right">
                      <strong>{formatCOP(report.totalFleteDia)}</strong>
                    </td>
                    <td className="text-right">{report.pctFleteFacturado.toFixed(2)}%</td>
                    <td>
                      {report.entregasDelDia.length} ent. / {report.anuladasDelDia.length} anul.
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Bloque 2: Desglose por Transportadora */}
              <div style={{ fontWeight: 700, fontSize: '10.5px', textTransform: 'uppercase', margin: '10px 0 5px' }}>
                2. Desglose por Transportadora ({report.transportadorasDia.length})
              </div>
              {report.transportadorasDia.length === 0 ? (
                <div style={{ padding: '6px 0', color: '#475569' }}>Sin despachos registrados en la fecha.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Transportadora</th>
                      <th>Placas</th>
                      <th>Destinos</th>
                      <th className="text-right">Desp.</th>
                      <th className="text-right">Cajas</th>
                      <th className="text-right">Peso (kg)</th>
                      <th className="text-right">Facturado</th>
                      <th className="text-right">Flete</th>
                      <th className="text-right">% Flete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.transportadorasDia.map((tr) => (
                      <tr key={tr.nombre}>
                        <td><strong>{tr.nombre}</strong></td>
                        <td>{tr.placas.join(', ') || '—'}</td>
                        <td>{tr.ciudades.join(', ') || '—'}</td>
                        <td className="text-right">{tr.despachos}</td>
                        <td className="text-right">{formatNumber(tr.cajas)}</td>
                        <td className="text-right">{formatNumber(tr.peso, 1)}</td>
                        <td className="text-right">{formatCOP(tr.facturado)}</td>
                        <td className="text-right">{formatCOP(tr.flete)}</td>
                        <td className="text-right">{tr.facturado > 0 ? `${tr.pctFlete.toFixed(2)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Bloque 3: Detalle de Despachos */}
              {report.despachosDelDia.length > 0 && (
                <>
                  <div style={{ fontWeight: 700, fontSize: '10.5px', textTransform: 'uppercase', margin: '10px 0 5px' }}>
                    3. Detalle de Despachos del Día ({report.despachosDelDia.length})
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>ID / PV</th>
                        <th>Cliente</th>
                        <th>Ciudad</th>
                        <th>Transportadora / Placa</th>
                        <th>Factura</th>
                        <th className="text-right">Cajas</th>
                        <th className="text-right">Facturado</th>
                        <th className="text-right">Flete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.despachosDelDia.map((o) => (
                        <tr key={o.id}>
                          <td>{o.id} · PV {o.pv || '—'}</td>
                          <td>{o.cliente}</td>
                          <td>{o.ciudad}</td>
                          <td>{normalizeCarrierLabel(o.transportadora)} ({o.placa || '—'})</td>
                          <td>{o.factura || 'Sin factura'}</td>
                          <td className="text-right">{formatNumber(Number(o.cajasFact) > 0 ? o.cajasFact : o.cajas)}</td>
                          <td className="text-right">{formatCOP(o.facturado || 0)}</td>
                          <td className="text-right">{formatCOP(o.flete || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* Bloque 4: Control de Arrastre, Novedades y Equipo */}
              <div style={{ fontWeight: 700, fontSize: '10.5px', textTransform: 'uppercase', margin: '10px 0 5px' }}>
                4. Pendientes de Arrastre, Novedades y Gestión de Equipo
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Concepto de Control</th>
                    <th className="text-right">Cantidad</th>
                    <th>Detalle / Observación</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Cola Abierta por Despachar (Pendiente / En Cargue)</td>
                    <td className="text-right"><strong>{report.pendientesArrastre.length}</strong></td>
                    <td>{formatNumber(report.pendientesArrastreCajas)} cj · {formatCOP(report.pendientesArrastreVenta)} estimado</td>
                  </tr>
                  <tr>
                    <td>Despachos del Día con Datos Incompletos (Factura / Flete $0)</td>
                    <td className="text-right"><strong>{report.despachosIncompletos.length}</strong></td>
                    <td>
                      {report.despachosIncompletos.length > 0
                        ? report.despachosIncompletos.map((o) => `PV ${o.pv || o.id}`).join(', ')
                        : 'Todos los despachos del día completos'}
                    </td>
                  </tr>
                  <tr>
                    <td>Novedades Registradas en la Fecha</td>
                    <td className="text-right"><strong>{report.novedadesDia.length}</strong></td>
                    <td>
                      {report.novedadesDia.length > 0
                        ? report.novedadesDia.map((n) => `${n.titulo} (${n.estado})`).join(' | ')
                        : `Sin novedades hoy (${report.novedadesAbiertasTotal} abiertas acumuladas)`}
                    </td>
                  </tr>
                  <tr>
                    <td>Turnos / Horas Extras del Día</td>
                    <td className="text-right"><strong>{report.turnosDia.length}</strong></td>
                    <td>
                      {report.turnosDia.length > 0
                        ? report.turnosDia
                            .map((t) => `${t.nom}: ${t._ent || '--'}-${t._sal || '--'} (${formatHoursCompact(Number(t.netas) || 0)})`)
                            .join(' | ')
                        : 'Sin turnos de horas extras en la fecha'}
                    </td>
                  </tr>
                  <tr>
                    <td>Pedidos Internos de Empleados</td>
                    <td className="text-right"><strong>{report.pedidosEmpDia.length}</strong></td>
                    <td>Total consolidado del día: {formatCOP(report.totalPedidosEmpDia)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Firmas de Cierre */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '32px',
                  marginTop: '28px',
                  paddingTop: '8px'
                }}
              >
                <div style={{ flex: 1, borderTop: '1px solid #0f172a', paddingTop: '4px', textAlign: 'center' }}>
                  <div style={{ fontWeight: 700 }}>{currentUser?.nombre || 'Coordinación Logística'}</div>
                  <div style={{ fontSize: '9px', color: '#475569' }}>Elaboró · Cierre Informativo Diario</div>
                </div>
                <div style={{ flex: 1, borderTop: '1px solid #0f172a', paddingTop: '4px', textAlign: 'center' }}>
                  <div style={{ fontWeight: 700 }}>Gerencia / Dirección Administrativa</div>
                  <div style={{ fontSize: '9px', color: '#475569' }}>LATIN PRODUCTS S.A.S. · Vo.Bo.</div>
                </div>
              </div>

              <div
                style={{
                  marginTop: '14px',
                  paddingTop: '6px',
                  borderTop: '1px solid #cbd5e1',
                  textAlign: 'center',
                  fontSize: '7.5px',
                  color: '#64748b'
                }}
              >
                Documento generado por SISTEMALOG • Cierre Operativo Diario — LATIN PRODUCTS S.A.S.
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
