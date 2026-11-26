/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Novedad, NovedadItem } from '../types';
import {
  Plus, Search, Image as ImageIcon, MessageSquare,
  Edit2, Trash2, Bell, Printer
} from 'lucide-react';
import {
  sendPushNotification,
  requestNotificationPermission,
  getNotificationPermission,
  checkAndNotifyDueEvents
} from '../notificationService';

interface NovedadesModuleProps {
  novedades: Novedad[];
  onAddNovedad: (novedad: Novedad) => void;
  onUpdateNovedad: (novedad: Novedad) => void;
  onDeleteNovedad: (id: string) => void;
}

const MOTIVOS_CATALOGO = [
  '01 - MCIA. FACT. NO ORDENADA',
  '02 - MCIA. FACT. NO PEDIDA',
  '03 - MCIA. AVERIADA',
  '04 - MCIA. BAJA ROTACIÓN',
  '05 - MCIA. NO CODIFICADA',
  '06 - MCIA. DEGUSTACIÓN',
  '07 - MCIA. AMARRES',
  '08 - RETRASO / NOVEDAD TRANSPORTE',
  '09 - FALTANTE / DIFERENCIA CONTEO',
];

const EMPTY_ITEM = (): NovedadItem => ({
  codigoBarras: '',
  descripcion: '',
  unidades: '',
  valorUnitario: '',
  valorTotal: '',
});

function parseNumericAmount(raw?: string): number {
  if (!raw) return 0;
  const cleaned = String(raw)
    .replace(/\$/g, '')
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(/,/g, '.');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function formatCOP(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return '$ 0';
  return `$ ${new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))}`;
}

function getTodayFormatted(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${d}-${m}-${y}`;
}

function computeRowTotal(item: NovedadItem): number {
  const manualTotal = parseNumericAmount(item.valorTotal);
  const qty = parseNumericAmount(item.unidades);
  const unit = parseNumericAmount(item.valorUnitario);
  if (qty > 0 && unit > 0) {
    return qty * unit;
  }
  return manualTotal;
}

function computeTotalsSummary(items: NovedadItem[], descuentoStr?: string, ivaStr?: string) {
  const subtotal = items.reduce((sum, item) => sum + computeRowTotal(item), 0);
  const descuento = parseNumericAmount(descuentoStr);
  const iva = parseNumericAmount(ivaStr);
  const total = Math.max(0, subtotal - descuento + iva);
  return { subtotal, descuento, iva, total };
}

export default function NovedadesModule({
  novedades,
  onAddNovedad,
  onUpdateNovedad,
  onDeleteNovedad
}: NovedadesModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;

  const [isOpenForm, setIsOpenForm] = useState(false);
  const [editingNovedadId, setEditingNovedadId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activePrintNovedad, setActivePrintNovedad] = useState<Novedad | null>(null);
  const [imgPreviewFailed, setImgPreviewFailed] = useState(false);
  const [failedCardImages, setFailedCardImages] = useState<Record<string, boolean>>({});

  // Form states (aligned with both legacy Novedad fields and corporate Nota format)
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [imgUrl, setImgUrl] = useState('');
  const [tipo, setTipo] = useState('🚨 Incidencia Crítica');
  const [pv, setPv] = useState('');
  const [cliente, setCliente] = useState('');
  const [responsable, setResponsable] = useState('');
  const [estado, setEstado] = useState<'Abierta' | 'En Proceso' | 'Cerrada'>('Abierta');

  // Corporate Nota structured fields
  const [fechaDocumento, setFechaDocumento] = useState(getTodayFormatted());
  const [factura, setFactura] = useState('');
  const [nit, setNit] = useState('');
  const [codigoDoc, setCodigoDoc] = useState('');
  const [motivosSeleccionados, setMotivosSeleccionados] = useState<string[]>([]);
  const [items, setItems] = useState<NovedadItem[]>([EMPTY_ITEM()]);
  const [descuento, setDescuento] = useState('');
  const [iva, setIva] = useState('');
  const [elaboradoPorCedula, setElaboradoPorCedula] = useState('');

  const [permission, setPermission] = useState(getNotificationPermission());

  useEffect(() => {
    checkAndNotifyDueEvents([], [], novedades);
    const interval = setInterval(() => {
      checkAndNotifyDueEvents([], [], novedades);
    }, 15000);
    return () => clearInterval(interval);
  }, [novedades]);

  useEffect(() => {
    const cleanup = () => {
      document.body.classList.remove('print-novedad-mode');
      setActivePrintNovedad(null);
    };
    window.addEventListener('afterprint', cleanup);
    return () => {
      window.removeEventListener('afterprint', cleanup);
      document.body.classList.remove('print-novedad-mode');
    };
  }, []);

  const nextConsecutiveId = useMemo(() => {
    const maxNum = novedades.reduce((max, n) => {
      const m = n.id.match(/\d+/);
      const val = m ? parseInt(m[0], 10) : 0;
      return val > max ? val : max;
    }, 100);
    return `NOV-${maxNum + 1}`;
  }, [novedades]);

  const formTotals = useMemo(() => computeTotalsSummary(items, descuento, iva), [items, descuento, iva]);

  const handleRequestPermission = async () => {
    const res = await requestNotificationPermission();
    setPermission(res);
    sendPushNotification('Avisos Activos', 'Estás conectado al canal de alertas de incidencias de muelle.', 'system');
  };

  const filteredNovedades = useMemo(() => {
    let result = [...novedades];
    const term = searchTerm.toLowerCase();

    if (term) {
      result = result.filter(n =>
        n.id.toLowerCase().includes(term) ||
        n.titulo.toLowerCase().includes(term) ||
        n.descripcion.toLowerCase().includes(term) ||
        (n.pv || '').toLowerCase().includes(term) ||
        (n.factura || '').toLowerCase().includes(term) ||
        (n.nit || '').toLowerCase().includes(term) ||
        (n.cliente || '').toLowerCase().includes(term) ||
        (n.responsable || '').toLowerCase().includes(term)
      );
    }

    if (typeFilter) {
      result = result.filter(n => n.tipo === typeFilter);
    }

    if (stateFilter) {
      result = result.filter(n => n.estado === stateFilter);
    }

    return result.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [novedades, searchTerm, typeFilter, stateFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredNovedades.length / itemsPerPage));
  const paginated = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredNovedades.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredNovedades, currentPage]);

  const resetFormFields = () => {
    setTitle('');
    setDesc('');
    setImgUrl('');
    setImgPreviewFailed(false);
    setTipo('🚨 Incidencia Crítica');
    setPv('');
    setCliente('');
    setResponsable('');
    setEstado('Abierta');
    setFechaDocumento(getTodayFormatted());
    setFactura('');
    setNit('');
    setCodigoDoc('');
    setMotivosSeleccionados([]);
    setItems([EMPTY_ITEM()]);
    setDescuento('');
    setIva('');
    setElaboradoPorCedula('');
  };

  const handleOpenNewForm = () => {
    resetFormFields();
    setEditingNovedadId(null);
    setIsOpenForm(true);
  };

  const handleStartEdit = (nov: Novedad) => {
    setTitle(nov.titulo);
    setDesc(nov.observaciones ?? nov.descripcion ?? '');
    setImgUrl(nov.imageLink || '');
    setImgPreviewFailed(false);
    setTipo(nov.tipo);
    setPv(nov.pv || '');
    setCliente(nov.cliente || '');
    setResponsable(nov.responsable || '');
    setEstado(nov.estado);
    setFechaDocumento(nov.fecha ? nov.fecha.split(',')[0].trim() : getTodayFormatted());
    setFactura(nov.factura || '');
    setNit(nov.nit || '');
    setCodigoDoc(nov.codigo || '');
    setMotivosSeleccionados(Array.isArray(nov.motivosSeleccionados) ? nov.motivosSeleccionados : []);
    setItems(
      Array.isArray(nov.items) && nov.items.length > 0
        ? nov.items.map(it => ({ ...it }))
        : [EMPTY_ITEM()]
    );
    setDescuento(nov.descuento || '');
    setIva(nov.iva || '');
    setElaboradoPorCedula(nov.elaboradoPorCedula || '');
    setEditingNovedadId(nov.id);
    setIsOpenForm(true);

    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const handleCloseForm = () => {
    resetFormFields();
    setEditingNovedadId(null);
    setIsOpenForm(false);
  };

  const toggleMotivo = (motivo: string) => {
    setMotivosSeleccionados(prev =>
      prev.includes(motivo) ? prev.filter(m => m !== motivo) : [...prev, motivo]
    );
  };

  const handleItemChange = (index: number, field: keyof NovedadItem, value: string) => {
    setItems(prev => {
      const next = [...prev];
      const current = { ...next[index], [field]: value };
      if (field === 'unidades' || field === 'valorUnitario') {
        const qty = parseNumericAmount(field === 'unidades' ? value : current.unidades);
        const unit = parseNumericAmount(field === 'valorUnitario' ? value : current.valorUnitario);
        if (qty > 0 && unit > 0) {
          current.valorTotal = String(Math.round(qty * unit));
        } else if (!value && field === 'valorUnitario') {
          current.valorTotal = '';
        }
      }
      next[index] = current;
      return next;
    });
  };

  const handleAddItemRow = () => {
    setItems(prev => [...prev, EMPTY_ITEM()]);
  };

  const handleRemoveItemRow = (index: number) => {
    setItems(prev => (prev.length <= 1 ? [EMPTY_ITEM()] : prev.filter((_, idx) => idx !== index)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanedItems = items.filter(
      it =>
        it.descripcion.trim() ||
        (it.codigoBarras || '').trim() ||
        (it.unidades || '').trim() ||
        (it.valorUnitario || '').trim() ||
        (it.valorTotal || '').trim()
    );

    const derivedTitle =
      title.trim() ||
      (cleanedItems[0]?.descripcion ? cleanedItems[0].descripcion.trim() : '') ||
      (motivosSeleccionados[0] ? motivosSeleccionados[0] : '');

    if (!derivedTitle) return;

    const cleanObservaciones = desc.trim();
    const motivosLine =
      motivosSeleccionados.length > 0 ? `MOTIVO(S): ${motivosSeleccionados.join(' / ')}` : '';
    const itemsSummaryLine =
      cleanedItems.length > 0
        ? `DETALLE (${cleanedItems.length} ítem${cleanedItems.length > 1 ? 's' : ''}): ` +
          cleanedItems
            .map(it => `${it.unidades || '1'}x ${it.descripcion || it.codigoBarras || 'ÍTEM'}`)
            .join('; ')
        : '';

    const composedDescripcion =
      cleanObservaciones ||
      [motivosLine, itemsSummaryLine].filter(Boolean).join('\n') ||
      derivedTitle;

    const pvOrFactura = pv.trim() || factura.trim();

    if (editingNovedadId) {
      const existing = novedades.find(n => n.id === editingNovedadId);
      const updatedRecord: Novedad = {
        ...existing,
        id: editingNovedadId,
        titulo: derivedTitle,
        descripcion: composedDescripcion,
        observaciones: cleanObservaciones,
        imageLink: imgUrl.trim(),
        tipo,
        pv: pvOrFactura,
        factura: factura.trim(),
        nit: nit.trim(),
        codigo: codigoDoc.trim(),
        motivoCodigo: motivosSeleccionados[0] || '',
        motivosSeleccionados,
        items: cleanedItems,
        descuento: descuento.trim(),
        iva: iva.trim(),
        elaboradoPorCedula: elaboradoPorCedula.trim(),
        cliente: cliente.trim(),
        responsable: responsable.trim() || 'Auxiliar Logística',
        estado,
        fecha: fechaDocumento.trim() || (existing ? existing.fecha : getTodayFormatted()),
      };
      onUpdateNovedad(updatedRecord);
      sendPushNotification(
        'Novedad Actualizada',
        `[${tipo}] ${cliente || 'Sin Cliente'}: "${derivedTitle}" editado. Estado: ${estado}`,
        'novedad'
      );
    } else {
      const newRecord: Novedad = {
        id: nextConsecutiveId,
        titulo: derivedTitle,
        descripcion: composedDescripcion,
        observaciones: cleanObservaciones,
        imageLink: imgUrl.trim(),
        tipo,
        pv: pvOrFactura,
        factura: factura.trim(),
        nit: nit.trim(),
        codigo: codigoDoc.trim(),
        motivoCodigo: motivosSeleccionados[0] || '',
        motivosSeleccionados,
        items: cleanedItems,
        descuento: descuento.trim(),
        iva: iva.trim(),
        elaboradoPorCedula: elaboradoPorCedula.trim(),
        cliente: cliente.trim(),
        responsable: responsable.trim() || 'Auxiliar Logística',
        estado,
        fecha: fechaDocumento.trim() || getTodayFormatted(),
      };
      onAddNovedad(newRecord);
      sendPushNotification(
        '🚨 Nueva Novedad Reportada',
        `[${tipo}] ${cliente || 'Sin Cliente'}: "${derivedTitle}" registrado por ${responsable || 'auxiliar'}.`,
        'novedad'
      );
    }

    handleCloseForm();
  };

  const toggleStatus = (nov: Novedad) => {
    const nextStates: Record<'Abierta' | 'En Proceso' | 'Cerrada', 'Abierta' | 'En Proceso' | 'Cerrada'> = {
      'Abierta': 'En Proceso',
      'En Proceso': 'Cerrada',
      'Cerrada': 'Abierta',
    };
    const nextStatus = nextStates[nov.estado];
    onUpdateNovedad({
      ...nov,
      estado: nextStatus,
    });
    sendPushNotification(
      'Estado de Novedad Cambiado',
      `"${nov.titulo}" cambió su estado de [${nov.estado}] a [${nextStatus}]`,
      'novedad'
    );
  };

  const handlePageChange = (direction: number) => {
    setCurrentPage(prev => {
      const next = prev + direction;
      if (next < 1 || next > totalPages) return prev;
      return next;
    });
  };

  const handlePrintSingleNovedad = (nov: Novedad) => {
    const originalTitle = document.title;
    document.title = `NOTA_NOVEDAD_${nov.id}_LATIN_PRODUCTS`;
    flushSync(() => {
      setActivePrintNovedad(nov);
    });
    document.body.classList.add('print-novedad-mode');
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('print-novedad-mode');
        document.title = originalTitle;
      }, 1000);
    }, 150);
  };

  const handlePrintDraftFromForm = () => {
    const cleanedItems = items.filter(
      it =>
        it.descripcion.trim() ||
        (it.codigoBarras || '').trim() ||
        (it.unidades || '').trim() ||
        (it.valorUnitario || '').trim() ||
        (it.valorTotal || '').trim()
    );
    const draft: Novedad = {
      id: editingNovedadId || nextConsecutiveId,
      titulo: title.trim() || 'REGISTRO DE NOVEDAD',
      descripcion: desc.trim(),
      observaciones: desc.trim(),
      imageLink: imgUrl.trim(),
      tipo,
      pv: pv.trim(),
      factura: factura.trim(),
      nit: nit.trim(),
      codigo: codigoDoc.trim(),
      motivoCodigo: motivosSeleccionados[0] || '',
      motivosSeleccionados,
      items: cleanedItems,
      descuento: descuento.trim(),
      iva: iva.trim(),
      elaboradoPorCedula: elaboradoPorCedula.trim(),
      cliente: cliente.trim(),
      responsable: responsable.trim() || 'Auxiliar Logística',
      estado,
      fecha: fechaDocumento.trim() || getTodayFormatted(),
    };
    handlePrintSingleNovedad(draft);
  };

  return (
    <div className="space-y-6 animate-fade-in print:bg-white print:text-black">
      {/* Dynamic Push Notifications Permission Widget */}
      {permission !== 'granted' ? (
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-teal-955/30 border-2 border-hud-accent/25 p-4 rounded-xl text-xs text-slate-300 justify-between shadow-lg print:hidden">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-hud-accent" />
            <div className="space-y-0.5">
              <p className="font-bold text-white uppercase tracking-wider text-[11px]">
                ¿Recibir Alertas de Incidencias en Tiempo Real?
              </p>
              <p className="text-[10px] text-slate-400">
                Activa el canal de notificaciones push para enterarte de inmediato al surgir averías, quejas u omisiones críticas.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestPermission}
            className="px-4 py-2 bg-hud-accent text-slate-950 font-black rounded-lg transition-all hover:scale-105 active:scale-95 text-[10px] uppercase tracking-wider cursor-pointer whitespace-nowrap"
          >
            Habilitar Alertas
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-slate-950/45 border border-slate-900 px-4 py-2 rounded-lg text-[10px] text-slate-400 print:hidden">
          <span>Canal de Notificaciones de Novedades Activo</span>
          <button
            type="button"
            onClick={() =>
              sendPushNotification(
                'Canal Novedades Activo',
                'Recibirás una notificación por cada novedad registrada o cambiada.',
                'novedad'
              )
            }
            className="text-[10px] hover:text-[#00ffa3] underline font-bold uppercase transition cursor-pointer"
          >
            Enviar Prueba
          </button>
        </div>
      )}

      {/* Top Module Bar */}
      <div className="sticky -top-6 bg-[#040814] pt-6 pb-4 z-20 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-900 print:hidden shadow-lg">
        <div className="space-y-1">
          <h2 className="text-xl font-display font-extrabold text-hud-accent tracking-widest flex items-center gap-2 uppercase">
            <MessageSquare className="w-5 h-5" /> Registro y Diálogo de Novedades
          </h2>
          <p className="text-xs text-slate-400">
            Canal formal de incidencias, devoluciones, averías y control logístico de muelle
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isOpenForm && (
            <button
              type="button"
              onClick={handlePrintDraftFromForm}
              className="bg-slate-900 border border-slate-700 hover:border-hud-accent text-slate-200 text-xs font-mono font-bold tracking-wider px-4 py-2.5 rounded-lg cursor-pointer transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Imprimir Nota
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenNewForm}
            className="bg-hud-accent hover:bg-hud-accent/80 text-slate-950 font-black font-mono tracking-widest px-5 py-2.5 text-xs rounded-lg transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" /> Registrar Novedad
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* FORMULARIO CORPORATIVO ESTILO NOTA DE CONTROL / DEVOLUCIÓN & NOVEDAD  */}
      {/* ===================================================================== */}
      {isOpenForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white text-slate-900 rounded-xl border border-slate-300 shadow-2xl max-w-5xl mx-auto overflow-hidden print:hidden animate-fade-in"
        >
          {/* Barra superior de acciones rápidas del formulario */}
          <div className="bg-slate-900 text-white px-6 py-2.5 flex items-center justify-between text-xs">
            <span className="font-mono font-bold tracking-wider uppercase text-cyan-300">
              {editingNovedadId ? `Edición de Documento · ${editingNovedadId}` : `Nuevo Documento · ${nextConsecutiveId}`}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePrintDraftFromForm}
                className="text-xs text-slate-200 hover:text-white flex items-center gap-1.5 px-2.5 py-1 rounded border border-slate-700 hover:border-slate-500 transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir Nota
              </button>
              <button
                type="button"
                onClick={handleCloseForm}
                className="text-slate-300 hover:text-white font-bold px-2 py-0.5 rounded hover:bg-slate-800 transition cursor-pointer"
                aria-label="Cerrar formulario"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Cuerpo del Documento Corporativo (Inspirado en Nota Débito) */}
          <div className="p-6 md:p-8 space-y-6 bg-white">
            {/* 1. Cabecera Empresa + Título Documento y Consecutivo Rojo */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b-2 border-slate-800">
              <div className="space-y-0.5 text-slate-800">
                <h3 className="text-lg md:text-xl font-extrabold tracking-tight text-slate-950 uppercase">
                  LATIN PRODUCTS S.A.S.
                </h3>
                <p className="text-xs font-semibold text-slate-700">Nit. 800.225.074-3</p>
                <p className="text-xs text-slate-600">Carrera 39 No. 14-62, Acopi - Yumbo · Valle del Cauca</p>
                <p className="text-xs text-slate-600">PBX: (602) 384 40 90 · Control de Operaciones Logísticas</p>
              </div>

              <div className="md:text-right flex flex-col md:items-end justify-center">
                <span className="text-xl md:text-2xl font-black tracking-tight text-slate-950 uppercase">
                  REGISTRO DE NOVEDAD
                </span>
                <span className="text-lg md:text-xl font-black text-[#b91c1c] tabular-nums tracking-wide mt-0.5">
                  N° {editingNovedadId || nextConsecutiveId}
                </span>
              </div>
            </div>

            {/* 2. Cuadrícula de Metadatos (2x3 Bordeada) */}
            <div className="border border-slate-500 rounded-sm overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-12 text-xs">
                {/* Fila 1: FECHA | FACTURA / PV */}
                <div className="md:col-span-2 bg-slate-100 border-b md:border-r border-slate-400 px-3 py-2 font-bold uppercase text-slate-800 flex items-center">
                  FECHA
                </div>
                <div className="md:col-span-4 border-b md:border-r border-slate-400 px-2 py-1.5 bg-white">
                  <input
                    type="text"
                    value={fechaDocumento}
                    onChange={e => setFechaDocumento(e.target.value)}
                    placeholder="DD-MM-YYYY"
                    className="w-full px-2 py-1 text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded focus:border-slate-700 outline-none normal-case"
                  />
                </div>
                <div className="md:col-span-2 bg-slate-100 border-b md:border-r border-slate-400 px-3 py-2 font-bold uppercase text-slate-800 flex items-center">
                  FACTURA / PV
                </div>
                <div className="md:col-span-4 border-b border-slate-400 px-2 py-1.5 bg-white grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    value={factura}
                    onChange={e => setFactura(e.target.value)}
                    placeholder="Factura (Ej. 2779)"
                    className="w-full px-2 py-1 text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded focus:border-slate-700 outline-none normal-case"
                  />
                  <input
                    type="text"
                    value={pv}
                    onChange={e => setPv(e.target.value)}
                    placeholder="PV / Guía"
                    className="w-full px-2 py-1 text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded focus:border-slate-700 outline-none normal-case"
                  />
                </div>

                {/* Fila 2: CLIENTE / PROVEEDOR | NIT / C.C. */}
                <div className="md:col-span-2 bg-slate-100 border-b md:border-r border-slate-400 px-3 py-2 font-bold uppercase text-slate-800 flex items-center">
                  CLIENTE / PROV.
                </div>
                <div className="md:col-span-4 border-b md:border-r border-slate-400 px-2 py-1.5 bg-white">
                  <input
                    type="text"
                    value={cliente}
                    onChange={e => setCliente(e.target.value)}
                    placeholder="Ej. Inversiones Vaquita Express S.A.S."
                    className="w-full px-2 py-1 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded focus:border-slate-700 outline-none normal-case"
                  />
                </div>
                <div className="md:col-span-2 bg-slate-100 border-b md:border-r border-slate-400 px-3 py-2 font-bold uppercase text-slate-800 flex items-center">
                  NIT / C.C.
                </div>
                <div className="md:col-span-4 border-b border-slate-400 px-2 py-1.5 bg-white">
                  <input
                    type="text"
                    value={nit}
                    onChange={e => setNit(e.target.value)}
                    placeholder="Ej. 800.225.074-3"
                    className="w-full px-2 py-1 text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded focus:border-slate-700 outline-none normal-case"
                  />
                </div>

                {/* Fila 3: CÓDIGO / CATEGORÍA | ASUNTO / TÍTULO */}
                <div className="md:col-span-2 bg-slate-100 border-b md:border-b-0 md:border-r border-slate-400 px-3 py-2 font-bold uppercase text-slate-800 flex items-center">
                  CÓDIGO / TIPO
                </div>
                <div className="md:col-span-4 border-b md:border-b-0 md:border-r border-slate-400 px-2 py-1.5 bg-white grid grid-cols-12 gap-1.5">
                  <input
                    type="text"
                    value={codigoDoc}
                    onChange={e => setCodigoDoc(e.target.value)}
                    placeholder="Cód."
                    className="col-span-4 px-2 py-1 text-xs font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded focus:border-slate-700 outline-none normal-case"
                  />
                  <select
                    value={tipo}
                    onChange={e => setTipo(e.target.value)}
                    className="col-span-8 px-2 py-1 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded focus:border-slate-700 outline-none cursor-pointer"
                  >
                    <option>🚨 Incidencia Crítica</option>
                    <option>⚠️ Alerta Operativa</option>
                    <option>📦 Problema de Mercancía</option>
                    <option>🚚 Problema de Transporte</option>
                    <option>💰 Problema de Facturación</option>
                    <option>✅ Seguimiento / Acción</option>
                    <option>🛠️ Reporte de Avería</option>
                    <option>📋 Depuración Inventario</option>
                  </select>
                </div>
                <div className="md:col-span-2 bg-slate-100 border-b md:border-b-0 md:border-r border-slate-400 px-3 py-2 font-bold uppercase text-slate-800 flex items-center">
                  ASUNTO / MOTIVO *
                </div>
                <div className="md:col-span-4 px-2 py-1.5 bg-white">
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Resumen principal de la novedad o devolución"
                    className="w-full px-2 py-1 text-xs font-semibold text-slate-950 bg-slate-50 border border-slate-300 rounded focus:border-slate-800 outline-none normal-case"
                  />
                </div>
              </div>
            </div>

            {/* 3. Tabla de Ítems / Productos Afectados + Totales */}
            <div className="space-y-3">
              <div className="overflow-x-auto border border-slate-500 rounded-sm">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-900 border-b border-slate-500">
                      <th className="py-2 px-2.5 text-center font-bold uppercase border-r border-slate-400 w-36">
                        CÓD. BARRAS
                      </th>
                      <th className="py-2 px-2.5 text-center font-bold uppercase border-r border-slate-400">
                        DESCRIPCIÓN
                      </th>
                      <th className="py-2 px-2.5 text-center font-bold uppercase border-r border-slate-400 w-24">
                        UNIDADES
                      </th>
                      <th className="py-2 px-2.5 text-center font-bold uppercase border-r border-slate-400 w-36">
                        VALOR UNITARIO
                      </th>
                      <th className="py-2 px-2.5 text-center font-bold uppercase border-r border-slate-400 w-36">
                        VALOR TOTAL
                      </th>
                      <th className="py-2 px-2 text-center font-bold uppercase w-12">
                        QUITAR
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {items.map((item, idx) => {
                      const computed = computeRowTotal(item);
                      return (
                        <tr key={idx} className="bg-white hover:bg-slate-50/70">
                          <td className="p-1.5 border-r border-slate-300">
                            <input
                              type="text"
                              value={item.codigoBarras || ''}
                              onChange={e => handleItemChange(idx, 'codigoBarras', e.target.value)}
                              placeholder="EAN / Ref."
                              className="w-full px-2 py-1 text-xs font-mono text-slate-900 bg-slate-50/60 border border-slate-200 rounded outline-none focus:border-slate-600 normal-case"
                            />
                          </td>
                          <td className="p-1.5 border-r border-slate-300">
                            <input
                              type="text"
                              value={item.descripcion}
                              onChange={e => handleItemChange(idx, 'descripcion', e.target.value)}
                              placeholder="Ej. Limpia Piso Citrone 1L / Detalle del ítem"
                              className="w-full px-2 py-1 text-xs text-slate-900 bg-slate-50/60 border border-slate-200 rounded outline-none focus:border-slate-600 normal-case"
                            />
                          </td>
                          <td className="p-1.5 border-r border-slate-300">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.unidades}
                              onChange={e => handleItemChange(idx, 'unidades', e.target.value)}
                              placeholder="0"
                              className="w-full px-2 py-1 text-xs font-mono tabular-nums text-center text-slate-900 bg-slate-50/60 border border-slate-200 rounded outline-none focus:border-slate-600"
                            />
                          </td>
                          <td className="p-1.5 border-r border-slate-300">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={item.valorUnitario || ''}
                              onChange={e => handleItemChange(idx, 'valorUnitario', e.target.value)}
                              placeholder="$ 0"
                              className="w-full px-2 py-1 text-xs font-mono tabular-nums text-right text-slate-900 bg-slate-50/60 border border-slate-200 rounded outline-none focus:border-slate-600"
                            />
                          </td>
                          <td className="p-1.5 border-r border-slate-300">
                            <input
                              type="text"
                              value={
                                computed > 0 && parseNumericAmount(item.unidades) > 0 && parseNumericAmount(item.valorUnitario) > 0
                                  ? formatCOP(computed)
                                  : item.valorTotal || ''
                              }
                              onChange={e => handleItemChange(idx, 'valorTotal', e.target.value)}
                              placeholder="$ 0"
                              className="w-full px-2 py-1 text-xs font-mono font-bold tabular-nums text-right text-slate-900 bg-slate-50/60 border border-slate-200 rounded outline-none focus:border-slate-600 normal-case"
                            />
                          </td>
                          <td className="p-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded transition cursor-pointer"
                              title="Eliminar fila"
                            >
                              <Trash2 className="w-3.5 h-3.5 mx-auto" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Botón Agregar Fila + Tabla de Totales Alineada a la Derecha */}
              <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-400 rounded transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Agregar Fila de Producto / Ítem
                  </button>
                  <p className="text-[11px] text-slate-500 italic">
                    * Subtotal y total se calculan automáticamente a partir de unidades y valor unitario (opcionales si no aplica costo).
                  </p>
                </div>

                <div className="w-full md:w-80 border border-slate-500 rounded-sm overflow-hidden text-xs">
                  <div className="grid grid-cols-12 border-b border-slate-400">
                    <div className="col-span-6 bg-slate-100 px-3 py-1.5 font-bold uppercase text-slate-900 border-r border-slate-400">
                      SUBTOTAL
                    </div>
                    <div className="col-span-6 px-3 py-1.5 text-right font-mono font-semibold tabular-nums text-slate-900">
                      {formatCOP(formTotals.subtotal)}
                    </div>
                  </div>
                  <div className="grid grid-cols-12 border-b border-slate-400">
                    <div className="col-span-6 bg-slate-100 px-3 py-1.5 font-bold uppercase text-slate-900 border-r border-slate-400 flex items-center">
                      DESCUENTO
                    </div>
                    <div className="col-span-6 px-2 py-1 bg-white">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={descuento}
                        onChange={e => setDescuento(e.target.value)}
                        placeholder="$ 0"
                        className="w-full text-right font-mono tabular-nums text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-12 border-b border-slate-400">
                    <div className="col-span-6 bg-slate-100 px-3 py-1.5 font-bold uppercase text-slate-900 border-r border-slate-400 flex items-center">
                      IVA
                    </div>
                    <div className="col-span-6 px-2 py-1 bg-white">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={iva}
                        onChange={e => setIva(e.target.value)}
                        placeholder="$ 0"
                        className="w-full text-right font-mono tabular-nums text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-12 bg-slate-50">
                    <div className="col-span-6 bg-slate-100 px-3 py-2 font-black uppercase text-slate-950 border-r border-slate-400">
                      TOTAL
                    </div>
                    <div className="col-span-6 px-3 py-2 text-right font-mono font-black tabular-nums text-slate-950">
                      {formatCOP(formTotals.total)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Cuadrícula Inferior 2 Columnas: Motivos (Izq) y Observaciones + Evidencia (Der) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch pt-1">
              {/* Motivo de Devolución / Novedad */}
              <div className="md:col-span-5 border border-slate-500 rounded-sm overflow-hidden flex flex-col">
                <div className="bg-slate-100 border-b border-slate-500 px-3 py-1.5 font-bold text-xs uppercase text-slate-900">
                  MOTIVO DE DEVOLUCIÓN / NOVEDAD
                </div>
                <div className="p-3 space-y-1.5 bg-white flex-1">
                  {MOTIVOS_CATALOGO.map(motivo => {
                    const checked = motivosSeleccionados.includes(motivo);
                    return (
                      <button
                        key={motivo}
                        type="button"
                        onClick={() => toggleMotivo(motivo)}
                        className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded text-xs transition cursor-pointer ${
                          checked
                            ? 'bg-red-50 text-[#b91c1c] font-bold'
                            : 'text-slate-800 hover:bg-slate-100'
                        }`}
                      >
                        <span className="font-mono text-[11px] shrink-0">
                          {checked ? '( X )' : '(   )'}
                        </span>
                        <span className="truncate">{motivo}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Observaciones + Evidencia */}
              <div className="md:col-span-7 flex flex-col gap-3">
                <div className="border border-slate-500 rounded-sm overflow-hidden flex-1 flex flex-col">
                  <div className="bg-slate-100 border-b border-slate-500 px-3 py-1.5 font-bold text-xs uppercase text-slate-900">
                    OBSERVACIONES
                  </div>
                  <textarea
                    rows={5}
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    placeholder="Ej. Recibido CEDI — detalles de entrega, avería, tiempos o acciones correctivas tomadas..."
                    className="w-full flex-1 p-3 text-xs text-slate-900 bg-white outline-none resize-y normal-case leading-relaxed"
                  />
                </div>

                {/* Enlace de Foto / Evidencia opcional */}
                <div className="border border-slate-300 rounded-sm p-2.5 bg-slate-50 space-y-2">
                  <label className="text-[11px] font-bold uppercase text-slate-700 block">
                    Vínculo de Foto / Soporte Visual (Opcional)
                  </label>
                  <input
                    type="url"
                    value={imgUrl}
                    onChange={e => {
                      setImgUrl(e.target.value);
                      setImgPreviewFailed(false);
                    }}
                    placeholder="https://.../evidencia_novedad.png"
                    className="w-full px-2.5 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded outline-none focus:border-slate-700"
                  />
                  {imgUrl.trim() && (
                    <div className="bg-white border border-slate-200 rounded p-2 flex items-center justify-center">
                      {!imgPreviewFailed ? (
                        <img
                          src={imgUrl}
                          alt="Previsualización de evidencia"
                          referrerPolicy="no-referrer"
                          className="max-h-32 object-contain rounded"
                          onError={() => setImgPreviewFailed(true)}
                        />
                      ) : (
                        <div className="text-xs text-slate-500 py-3 flex items-center gap-2">
                          <ImageIcon className="w-4 h-4" /> No fue posible cargar la vista previa de la URL
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 5. Sección de Firmas al Pie */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-6 px-2 md:px-6">
              <div className="border-t border-slate-800 pt-2.5 text-center space-y-1.5">
                <span className="text-xs font-bold uppercase text-slate-900 block">ELABORADO POR</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-sm mx-auto">
                  <input
                    type="text"
                    value={responsable}
                    onChange={e => setResponsable(e.target.value)}
                    placeholder="Nombre del responsable"
                    className="px-2 py-1 text-xs text-center text-slate-900 bg-slate-50 border border-slate-300 rounded outline-none normal-case"
                  />
                  <input
                    type="text"
                    value={elaboradoPorCedula}
                    onChange={e => setElaboradoPorCedula(e.target.value)}
                    placeholder="C.C. (Ej. 71878606)"
                    className="px-2 py-1 text-xs text-center font-mono text-slate-900 bg-slate-50 border border-slate-300 rounded outline-none normal-case"
                  />
                </div>
              </div>

              <div className="border-t border-slate-800 pt-2.5 text-center space-y-1.5">
                <span className="text-xs font-bold uppercase text-slate-900 block">
                  CLIENTE / PROVEEDOR / RECIBIDO
                </span>
                <p className="text-xs text-slate-600 pt-1">
                  {cliente.trim() || 'Firma y sello de verificación'}
                </p>
              </div>
            </div>
          </div>

          {/* Barra inferior del formulario: Estado + Guardar / Cancelar */}
          <div className="bg-slate-100 border-t border-slate-300 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700 uppercase mr-1">Estado:</span>
              {(['Abierta', 'En Proceso', 'Cerrada'] as const).map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setEstado(st)}
                  className={`px-3 py-1 rounded text-xs font-bold border transition cursor-pointer ${
                    estado === st
                      ? st === 'Abierta'
                        ? 'bg-rose-600 text-white border-rose-700'
                        : st === 'En Proceso'
                        ? 'bg-amber-500 text-slate-950 border-amber-600'
                        : 'bg-emerald-600 text-white border-emerald-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handlePrintDraftFromForm}
                className="bg-white hover:bg-slate-200 border border-slate-400 text-xs font-bold text-slate-800 px-4 py-2 rounded-lg cursor-pointer transition inline-flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" /> Imprimir Nota
              </button>
              <button
                type="button"
                onClick={handleCloseForm}
                className="bg-white hover:bg-slate-200 border border-slate-400 text-xs font-semibold text-slate-800 px-4 py-2 rounded-lg cursor-pointer transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold tracking-wider text-xs px-5 py-2.5 rounded-lg cursor-pointer transition shadow-sm uppercase"
              >
                {editingNovedadId ? 'Guardar Registro' : 'Registrar Documento'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Advanced Filters */}
      <div className="bg-hud-card border border-hud-border/40 p-4 rounded-lg flex flex-col md:flex-row items-center justify-between gap-3 print:hidden">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por N°, factura, PV, cliente, responsable..."
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-950/80 border border-slate-800 text-xs text-white rounded pl-8 pr-3 py-1.5 w-full outline-none normal-case"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={typeFilter}
            onChange={e => {
              setTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-950/80 border border-slate-800 text-xs text-white px-2.5 py-1.5 rounded outline-none w-full md:w-44"
          >
            <option value="">Todas las Categorías</option>
            <option>🚨 Incidencia Crítica</option>
            <option>⚠️ Alerta Operativa</option>
            <option>📦 Problema de Mercancía</option>
            <option>🚚 Problema de Transporte</option>
            <option>💰 Problema de Facturación</option>
            <option>✅ Seguimiento / Acción</option>
            <option>🛠️ Reporte de Avería</option>
            <option>📋 Depuración Inventario</option>
          </select>

          <select
            value={stateFilter}
            onChange={e => {
              setStateFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-950/80 border border-slate-800 text-xs text-white px-2.5 py-1.5 rounded outline-none w-full md:w-36"
          >
            <option value="">Todos los Estados</option>
            <option value="Abierta">🔴 Abierta</option>
            <option value="En Proceso">🟡 En Proceso</option>
            <option value="Cerrada">🟢 Cerrada</option>
          </select>
        </div>
      </div>

      {/* Cards List feed */}
      <div className="space-y-6 print:space-y-6">
        {paginated.length === 0 ? (
          <div className="bg-hud-card p-12 text-center text-xs text-slate-500 font-mono border border-slate-900 rounded-lg">
            -- No se disponen de registros para las directivas solicitadas --
          </div>
        ) : (
          paginated.map(nov => {
            const typeClean = nov.tipo
              .replace(
                /[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g,
                ''
              )
              .trim()
              .toUpperCase();
            const hasStructuredItems = Array.isArray(nov.items) && nov.items.length > 0;
            const hasMotivos = Array.isArray(nov.motivosSeleccionados) && nov.motivosSeleccionados.length > 0;
            const cardTotals = hasStructuredItems
              ? computeTotalsSummary(nov.items!, nov.descuento, nov.iva)
              : null;

            return (
              <div
                key={nov.id}
                className="bg-[#050b18] border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative"
              >
                <div
                  className={`absolute top-0 left-0 w-full h-[3px] ${
                    nov.estado === 'Abierta'
                      ? 'bg-rose-500'
                      : nov.estado === 'En Proceso'
                      ? 'bg-[#ff9100]'
                      : 'bg-[#00ffa3]'
                  }`}
                ></div>

                {/* Header of the Ficha Técnica */}
                <div className="bg-slate-950 px-5 py-3 border-b border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="bg-hud-accent/10 text-hud-accent font-mono text-xs font-black tracking-widest px-2.5 py-1 rounded border border-hud-accent/30 uppercase">
                      {nov.id}
                    </span>
                    <h4 className="text-xs font-mono font-bold text-slate-400 tracking-wider uppercase">
                      REGISTRO DE NOVEDAD · CONTROL LOGÍSTICO
                    </h4>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-mono text-slate-400">
                      FECHA: {nov.fecha}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleStatus(nov)}
                      className={`text-[10px] font-mono font-extrabold px-3 py-1 rounded border transition-all duration-200 uppercase tracking-widest cursor-pointer print:hidden ${
                        nov.estado === 'Abierta'
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-500 hover:bg-rose-500/20'
                          : nov.estado === 'En Proceso'
                          ? 'bg-[#ff9100]/10 border-[#ff9100]/30 text-[#ff9100] hover:bg-[#ff9100]/20'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20'
                      }`}
                      title="Haga clic para cambiar estado"
                    >
                      {nov.estado === 'Abierta'
                        ? '🔴 ABIERTA'
                        : nov.estado === 'En Proceso'
                        ? '🟡 EN PROCESO'
                        : '🟢 CERRADA'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12">
                  {/* Left Column */}
                  <div className="lg:col-span-7 p-5 space-y-4 border-r border-slate-800/50 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                          <span>CATEGORÍA:</span>
                          <span className="font-bold text-cyan-400 uppercase">{typeClean || 'REGISTRO GENERAL'}</span>
                        </div>

                        <h3 className="text-base md:text-lg font-black text-white font-sans tracking-wide uppercase leading-snug print:text-black">
                          {nov.titulo}
                        </h3>
                      </div>

                      {/* Grid Table of Attributes */}
                      <div className="grid grid-cols-2 gap-px bg-slate-800/50 border border-slate-800/80 rounded-lg overflow-hidden text-[11px] font-mono">
                        <div className="bg-slate-950/80 p-2.5">
                          <span className="block text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                            Elaborado Por / Responsable
                          </span>
                          <span className="text-slate-200 font-bold block truncate mt-0.5 uppercase">
                            {nov.responsable}
                            {nov.elaboradoPorCedula ? ` · C.C. ${nov.elaboradoPorCedula}` : ''}
                          </span>
                        </div>
                        <div className="bg-slate-950/80 p-2.5">
                          <span className="block text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                            Factura / PV / Guía
                          </span>
                          <span className="text-slate-200 font-bold block truncate mt-0.5 uppercase">
                            {[nov.factura ? `FACT ${nov.factura}` : '', nov.pv ? `PV ${nov.pv}` : '']
                              .filter(Boolean)
                              .join(' · ') || 'SIN ESPECIFICAR'}
                          </span>
                        </div>
                        <div className="bg-slate-950/80 p-2.5 col-span-2 border-t border-slate-800/40 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="block text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                              Cliente / Proveedor
                            </span>
                            <span className="text-slate-200 font-bold block mt-0.5 uppercase">
                              {nov.cliente || 'SIN CLIENTE ASOCIADO'}
                            </span>
                          </div>
                          {nov.nit && (
                            <div className="text-right">
                              <span className="block text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                                NIT / C.C.
                              </span>
                              <span className="text-slate-200 font-bold block mt-0.5">{nov.nit}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Structured Items Table Preview if present */}
                      {hasStructuredItems && (
                        <div className="border border-slate-800 rounded-lg overflow-hidden">
                          <table className="w-full text-[11px] font-mono">
                            <thead>
                              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[10px]">
                                <th className="p-2 text-left">DESCRIPCIÓN</th>
                                <th className="p-2 text-center">UND</th>
                                <th className="p-2 text-right">V. UNIT</th>
                                <th className="p-2 text-right">TOTAL</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/70">
                              {nov.items!.map((it, i) => (
                                <tr key={i} className="bg-slate-950/40 text-slate-200">
                                  <td className="p-2">{it.descripcion || it.codigoBarras || '—'}</td>
                                  <td className="p-2 text-center tabular-nums">{it.unidades || '—'}</td>
                                  <td className="p-2 text-right tabular-nums">
                                    {parseNumericAmount(it.valorUnitario) > 0
                                      ? formatCOP(parseNumericAmount(it.valorUnitario))
                                      : '—'}
                                  </td>
                                  <td className="p-2 text-right font-bold tabular-nums">
                                    {computeRowTotal(it) > 0 ? formatCOP(computeRowTotal(it)) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            {cardTotals && cardTotals.total > 0 && (
                              <tfoot>
                                <tr className="bg-slate-950 border-t border-slate-700 text-cyan-300 font-black">
                                  <td colSpan={3} className="p-2 text-right uppercase">
                                    TOTAL DOCUMENTO:
                                  </td>
                                  <td className="p-2 text-right tabular-nums">{formatCOP(cardTotals.total)}</td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      )}

                      {/* Selected Motives summary */}
                      {hasMotivos && (
                        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 text-[11px] font-mono text-slate-300 space-y-1">
                          <span className="text-[9px] text-slate-500 font-bold uppercase block">
                            MOTIVOS SELECCIONADOS:
                          </span>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            {nov.motivosSeleccionados!.map(m => (
                              <span key={m} className="text-amber-300 font-semibold">
                                ✓ {m}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Observaciones / Descripción Box */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] text-slate-500 font-mono font-bold tracking-widest block uppercase">
                          OBSERVACIONES Y DETALLE DE CONTROL:
                        </label>
                        <div className="bg-slate-950/90 border border-slate-800/80 rounded-lg p-3 min-h-[75px] font-sans text-xs text-slate-300 leading-relaxed whitespace-pre-wrap print:text-black print:bg-white print:border-gray-400">
                          {nov.observaciones || nov.descripcion}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons footer */}
                    <div className="pt-4 border-t border-slate-800/40 flex flex-wrap items-center justify-between gap-2 print:hidden">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handlePrintSingleNovedad(nov)}
                          className="border border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10 bg-slate-950/50 rounded-lg px-3.5 py-1.5 font-mono font-bold tracking-wider text-[10px] uppercase flex items-center gap-1.5 transition-all duration-150 cursor-pointer"
                          title="Imprimir formato Nota formal"
                        >
                          <Printer className="w-3 h-3" />
                          Imprimir Nota
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStartEdit(nov)}
                          className="border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 bg-slate-950/40 rounded-lg px-3.5 py-1.5 font-mono font-bold tracking-wider text-[10px] uppercase flex items-center gap-1.5 transition-all duration-150 cursor-pointer"
                          title="Editar esta novedad"
                        >
                          <Edit2 className="w-3 h-3" />
                          Editar Ficha
                        </button>

                        {confirmDeleteId === nov.id ? (
                          <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-rose-600 animate-fade-in text-[10px]">
                            <span className="text-[9px] text-rose-500 font-bold px-1 uppercase font-mono">
                              ¿Confirmar?
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteNovedad(nov.id);
                                setConfirmDeleteId(null);
                              }}
                              className="bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-mono font-black py-0.5 px-2 rounded cursor-pointer transition-colors"
                            >
                              Sí
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[9px] font-mono py-0.5 px-2 rounded cursor-pointer transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(nov.id)}
                            className="border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 bg-slate-950/40 rounded-lg px-3.5 py-1.5 font-mono font-bold tracking-wider text-[10px] uppercase flex items-center gap-1.5 transition-all duration-150 cursor-pointer"
                            title="Eliminar esta novedad"
                          >
                            <Trash2 className="w-3 h-3" />
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Photo Evidence */}
                  <div className="lg:col-span-5 bg-slate-950/20 p-5 flex flex-col justify-center items-center min-h-[220px]">
                    <div className="w-full max-w-sm flex flex-col space-y-2">
                      <div className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest text-center">
                        REGISTRO FOTOGRÁFICO DE SOPORTE
                      </div>

                      <div className="relative p-2 rounded-xl bg-slate-950/85 border border-slate-800/80 overflow-hidden shadow-inner flex flex-col justify-between items-center group min-h-[180px]">
                        {nov.imageLink && !failedCardImages[nov.id] ? (
                          <>
                            <div className="relative w-full h-full flex items-center justify-center rounded-lg bg-slate-900/40 overflow-hidden p-1 border border-slate-800/60">
                              <img
                                src={nov.imageLink}
                                alt={nov.titulo}
                                referrerPolicy="no-referrer"
                                className="max-h-[170px] object-contain rounded cursor-zoom-in group-hover:scale-[1.02] transition duration-300"
                                onError={() =>
                                  setFailedCardImages(prev => ({ ...prev, [nov.id]: true }))
                                }
                              />
                            </div>
                            <div className="text-[9px] font-mono font-bold text-slate-400 flex items-center justify-between w-full px-1 pt-1.5">
                              <span>EVIDENCIA VISUAL</span>
                              <a
                                href={nov.imageLink}
                                target="_blank"
                                rel="noreferrer"
                                className="underline hover:text-white transition duration-150 flex items-center gap-1 print:hidden"
                              >
                                <ImageIcon className="w-3 h-3" /> Abrir Enlace
                              </a>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                            <div className="bg-slate-900/80 p-2.5 rounded-full border border-slate-800 text-slate-500">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                            <div className="space-y-1 px-4">
                              <span className="text-[10px] font-black font-mono text-slate-400 uppercase tracking-widest block">
                                SIN REGISTRO FOTOGRÁFICO
                              </span>
                              <p className="text-[9px] text-slate-500 leading-normal max-w-[200px] mx-auto font-sans">
                                SE PUEDE ADJUNTAR UN ENLACE MEDIANTE LA OPCIÓN{' '}
                                <strong className="text-amber-400">EDITAR FICHA</strong>.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-1.5 bg-slate-950 p-1 hover:border-slate-800 border border-slate-900 rounded-lg max-w-xs mx-auto print:hidden font-mono text-xs text-hud-accent">
          <button
            type="button"
            onClick={() => handlePageChange(-1)}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-slate-900 disabled:opacity-30 rounded cursor-pointer"
          >
            ◀
          </button>
          <span className="px-2 font-bold font-mono">
            PAGINA {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => handlePageChange(1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-slate-900 disabled:opacity-30 rounded cursor-pointer"
          >
            ▶
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 🖨️ PORTAL DE IMPRESIÓN INDIVIDUAL ESTILO NOTA DÉBITO / CONTROL FORMAL */}
      {/* ===================================================================== */}
      {typeof document !== 'undefined' &&
        activePrintNovedad &&
        createPortal(
          <div id="printNovedadNota" className="bg-white text-slate-900">
            {(() => {
              const doc = activePrintNovedad;
              const docItems: NovedadItem[] =
                Array.isArray(doc.items) && doc.items.length > 0
                  ? doc.items
                  : [
                      {
                        codigoBarras: doc.codigo || '',
                        descripcion: doc.titulo,
                        unidades: '1',
                        valorUnitario: '',
                        valorTotal: '',
                      },
                    ];
              const totals = computeTotalsSummary(docItems, doc.descuento, doc.iva);
              const selectedMotives = Array.isArray(doc.motivosSeleccionados)
                ? doc.motivosSeleccionados
                : doc.motivoCodigo
                ? [doc.motivoCodigo]
                : [];
              const facturaPvLabel = [doc.factura, doc.pv ? `PV ${doc.pv}` : '']
                .filter(Boolean)
                .join(' / ');

              return (
                <div className="space-y-4">
                  {/* Cabecera Corporativa */}
                  <div className="flex items-start justify-between gap-4 pb-3 border-b-2 border-slate-900">
                    <div className="space-y-0.5 text-[10px] leading-snug text-slate-800">
                      <strong className="text-[15px] font-black tracking-tight text-slate-950 block">
                        LATIN PRODUCTS S.A.S.
                      </strong>
                      <div>Nit. 800.225.074-3</div>
                      <div>Carrera 39 No. 14-62, Acopi - Yumbo · Valle del Cauca</div>
                      <div>PBX: (602) 384 40 90 · Gestión Logística</div>
                    </div>

                    <div className="text-right">
                      <div className="text-[16px] font-black tracking-tight text-slate-950 uppercase">
                        REGISTRO DE NOVEDAD
                      </div>
                      <div className="text-[14px] font-black text-[#b91c1c] tabular-nums">
                        N° {doc.id}
                      </div>
                      <div className="text-[8.5px] font-bold uppercase text-slate-600 mt-0.5">
                        ESTADO: {doc.estado}
                      </div>
                    </div>
                  </div>

                  {/* Cuadrícula 2x3 de Metadatos */}
                  <table className="nota-table">
                    <tbody>
                      <tr>
                        <th style={{ width: '16%' }} className="text-left">FECHA</th>
                        <td style={{ width: '34%' }}>{doc.fecha}</td>
                        <th style={{ width: '16%' }} className="text-left">FACTURA / PV</th>
                        <td style={{ width: '34%' }}>{facturaPvLabel || '—'}</td>
                      </tr>
                      <tr>
                        <th className="text-left">CLIENTE / PROV.</th>
                        <td>{doc.cliente || '—'}</td>
                        <th className="text-left">NIT / C.C.</th>
                        <td>{doc.nit || '—'}</td>
                      </tr>
                      <tr>
                        <th className="text-left">CÓDIGO / TIPO</th>
                        <td>{[doc.codigo, doc.tipo.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '').trim()].filter(Boolean).join(' · ')}</td>
                        <th className="text-left">ASUNTO</th>
                        <td className="font-bold">{doc.titulo}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Tabla de Ítems */}
                  <table className="nota-table">
                    <thead>
                      <tr>
                        <th style={{ width: '16%' }} className="text-center">CÓD. BARRAS</th>
                        <th className="text-center">DESCRIPCIÓN</th>
                        <th style={{ width: '11%' }} className="text-center">UNIDADES</th>
                        <th style={{ width: '17%' }} className="text-center">VALOR UNITARIO</th>
                        <th style={{ width: '17%' }} className="text-center">VALOR TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docItems.map((it, idx) => {
                        const rowVal = computeRowTotal(it);
                        const unitVal = parseNumericAmount(it.valorUnitario);
                        return (
                          <tr key={idx}>
                            <td className="text-center font-mono">{it.codigoBarras || ''}</td>
                            <td>{it.descripcion}</td>
                            <td className="text-center tabular-nums">{it.unidades || ''}</td>
                            <td className="text-right tabular-nums">
                              {unitVal > 0 ? formatCOP(unitVal) : ''}
                            </td>
                            <td className="text-right tabular-nums font-semibold">
                              {rowVal > 0 ? formatCOP(rowVal) : ''}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Cuadro Resumen de Totales a la Derecha */}
                  <div className="flex justify-end novedad-avoid-break">
                    <table className="nota-table" style={{ width: '44%' }}>
                      <tbody>
                        <tr>
                          <th className="text-left" style={{ width: '50%' }}>SUBTOTAL</th>
                          <td className="text-right tabular-nums">
                            {totals.subtotal > 0 ? formatCOP(totals.subtotal) : ''}
                          </td>
                        </tr>
                        <tr>
                          <th className="text-left">DESCUENTO</th>
                          <td className="text-right tabular-nums">
                            {totals.descuento > 0 ? formatCOP(totals.descuento) : ''}
                          </td>
                        </tr>
                        <tr>
                          <th className="text-left">IVA</th>
                          <td className="text-right tabular-nums">
                            {totals.iva > 0 ? formatCOP(totals.iva) : ''}
                          </td>
                        </tr>
                        <tr>
                          <th className="text-left font-black">TOTAL</th>
                          <td className="text-right font-black tabular-nums">
                            {totals.total > 0 ? formatCOP(totals.total) : ''}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Cuadrícula 2 Columnas: Motivos + Observaciones */}
                  <div className="grid grid-cols-12 gap-4 items-start pt-1 novedad-avoid-break">
                    <div className="col-span-5 border border-slate-600">
                      <div className="bg-slate-100 border-b border-slate-600 px-2.5 py-1 text-[8.5px] font-bold uppercase text-slate-900">
                        MOTIVO DE DEVOLUCIÓN / NOVEDAD
                      </div>
                      <div className="p-2.5 space-y-1 text-[8.5px] text-slate-900">
                        {MOTIVOS_CATALOGO.slice(0, 7).map(motivo => {
                          const isChecked = selectedMotives.includes(motivo);
                          return (
                            <div key={motivo} className={isChecked ? 'font-bold text-[#b91c1c]' : ''}>
                              {isChecked ? '( X ) ' : '(   ) '}
                              {motivo}
                            </div>
                          );
                        })}
                        {selectedMotives
                          .filter(m => !MOTIVOS_CATALOGO.slice(0, 7).includes(m))
                          .map(extra => (
                            <div key={extra} className="font-bold text-[#b91c1c]">
                              ( X ) {extra}
                            </div>
                          ))}
                      </div>
                    </div>

                    <div className="col-span-7 border border-slate-600">
                      <div className="bg-slate-100 border-b border-slate-600 px-2.5 py-1 text-[8.5px] font-bold uppercase text-slate-900">
                        OBSERVACIONES
                      </div>
                      <div className="p-2.5 text-[9px] leading-relaxed text-slate-900 min-h-[105px] whitespace-pre-wrap">
                        {doc.observaciones || doc.descripcion || 'Sin observaciones adicionales.'}
                      </div>
                    </div>
                  </div>

                  {/* Soporte Fotográfico opcional si existe enlace válido */}
                  {doc.imageLink && (
                    <div className="border border-slate-500 p-2 text-center novedad-avoid-break">
                      <div className="text-[8px] font-bold uppercase text-slate-700 mb-1.5">
                        EVIDENCIA FOTOGRÁFICA ADJUNTA
                      </div>
                      <img
                        src={doc.imageLink}
                        alt={doc.titulo}
                        referrerPolicy="no-referrer"
                        className="max-h-36 mx-auto object-contain"
                        onError={e => {
                          (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}

                  {/* Firmas */}
                  <div className="grid grid-cols-2 gap-14 pt-12 px-4 novedad-avoid-break">
                    <div className="border-t border-slate-900 pt-1.5 text-center text-[9px]">
                      <div className="font-bold uppercase">ELABORADO POR</div>
                      <div>{doc.responsable}</div>
                      {doc.elaboradoPorCedula && <div>C.C. {doc.elaboradoPorCedula}</div>}
                    </div>
                    <div className="border-t border-slate-900 pt-1.5 text-center text-[9px]">
                      <div className="font-bold uppercase">CLIENTE / PROVEEDOR</div>
                      <div>{doc.cliente || ''}</div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-300 text-center text-[7.5px] text-slate-500">
                    Documento generado por SISTEMALOG • Plataforma Logística para LATIN PRODUCTS S.A.S.
                  </div>
                </div>
              );
            })()}
          </div>,
          document.body
        )}
    </div>
  );
}
