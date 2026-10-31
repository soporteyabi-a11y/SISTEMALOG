/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Order, Carrier } from '../types';
import { matchOrderSearch } from '../utils/searchHelper';
import * as XLSX from 'xlsx';
import { saveToCloud, subscribeToCloud } from '../firebaseService';
import { 
  FileCheck, ShieldAlert, Award, FileSpreadsheet, CheckSquare, 
  MapPin, Printer, Clipboard, DollarSign, Calendar, ChevronLeft, ChevronRight, Pencil,
  Save, FolderArchive, Trash2, Eye, BookmarkCheck, Search, RefreshCw, X, AlertTriangle
} from 'lucide-react';

export interface SavedProvisionRecord {
  id: string;
  soporteNum: string;
  fechaGuardado: string;
  transportadora: string;
  mesGestion: string;
  quincenaLabel: string;
  cantidadOrdenes: number;
  subtotalFletes: number;
  otrosGastosMonto: number;
  otrosGastosConcepto: string;
  totalPagar: number;
  elaboradoPor: string;
  autorizadoPor: string;
  isSummaryView?: boolean;
  orders: Array<{
    id: string;
    fechaSalida?: string;
    pv?: string;
    factura?: string;
    cliente?: string;
    transportadora?: string;
    flete: number;
    facturaProvision?: string;
    destino?: string;
    oc?: string;
    ciudad?: string;
    cajas?: number;
  }>;
  notas?: string;
}

interface ProvisionesModuleProps {
  orders: Order[];
  carriers?: Carrier[];
  onUpdateOrder: (order: Order) => void;
  onBack?: () => void;
}

// Utility function to convert numbers to Spanish words for authentic DIAN style billing documentation
function numeroALetras(num: number): string {
  const unidades = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
  const decenas = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  const especiales = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
  const decenasCompletas = ["", "DIEZ", "VEINTI", "TREINTA Y ", "CUARENTA Y ", "CINCUENTA Y ", "SESENTA Y ", "SETENTA Y ", "OCHENTA Y ", "NOVENTA Y "];
  
  function getUnidades(n: number) {
    return unidades[n];
  }
  
  function getDecenas(n: number) {
    if (n < 10) return getUnidades(n);
    if (n >= 10 && n < 20) return especiales[n - 10];
    const u = n % 10;
    const d = Math.floor(n / 10);
    if (d === 2 && u > 0) return "VEINTI" + getUnidades(u);
    return decenasCompletas[d] + (u > 0 ? getUnidades(u) : "");
  }
  
  function getCentenas(n: number) {
    if (n === 100) return "CIEN";
    const d = n % 100;
    const c = Math.floor(n / 100);
    const centenasStr = ["", "CIENTO ", "DOSCIENTOS ", "TRESCIENTOS ", "CUATROCIENTOS ", "QUINIENTOS ", "SEISCIENTOS ", "SETECIENTOS ", "OCHOCIENTOS ", "NOVECIENTOS "];
    return centenasStr[c] + getDecenas(d);
  }
  
  let entero = Math.floor(num);
  if (entero === 0) return "CERO PESOS M/CTE";
  
  let millones = Math.floor(entero / 1000000);
  let restoMillones = entero % 1000000;
  let miles = Math.floor(restoMillones / 1000);
  let restoMiles = restoMillones % 1000;
  
  let letras = "";
  if (millones > 0) {
    if (millones === 1) letras = "UN MILLÓN";
    else letras = getCentenas(millones) + " MILLONES";
  }
  
  if (miles > 0) {
    if (letras !== "") letras += " ";
    if (miles === 1) letras += "MIL";
    else letras += getCentenas(miles) + " MIL";
  }
  
  if (restoMiles > 0) {
    if (letras !== "") letras += " ";
    letras += getCentenas(restoMiles);
  }
  
  return (letras + " PESOS M/CTE").replace(/\s+/g, " ").trim();
}

export default function ProvisionesModule({ orders, carriers = [], onUpdateOrder, onBack }: ProvisionesModuleProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Custom filter dropdowns
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('');
  const [selectedFortnightFilter, setSelectedFortnightFilter] = useState<'TODOS' | '1' | '2'>('TODOS');
  const [selectedCarrierFilter, setSelectedCarrierFilter] = useState<string>('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'TODOS' | 'SIN_FP' | 'CON_FP'>('TODOS');
  const [dateCriteriaFilter, setDateCriteriaFilter] = useState<'DESPACHO' | 'FACTURA' | 'INGRESO'>('DESPACHO');
  
  // Individual Edit Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // Bulk input Factura Provisión (FP)
  const [provisionInvoiceInput, setProvisionInvoiceInput] = useState('');
  
  // Pagination
  const [provisionPage, setProvisionPage] = useState(1);
  const itemsPerPage = 12;

  // Voucher preview states
  const [isVoucherOpen, setIsVoucherOpen] = useState(false);
  const [isSummaryView, setIsSummaryView] = useState(false);
  const [elaboradoPor, setElaboradoPor] = useState('LOGÍSTICA Y DESPACHOS');
  const [autorizadoPor, setAutorizadoPor] = useState('MESA CONTABLE SAS');

  // Main navigation tab: 'auditoria' (main list) or 'historial' (saved records list)
  const [mainTab, setMainTab] = useState<'auditoria' | 'historial'>('auditoria');

  // Saved Provision Records state with Firestore + LocalStorage sync
  const [savedProvisionRecords, setSavedProvisionRecords] = useState<SavedProvisionRecord[]>(() => {
    try {
      const local = localStorage.getItem('prov_saved_vouchers');
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  });

  const [activeSavedRecordForVoucher, setActiveSavedRecordForVoucher] = useState<SavedProvisionRecord | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [saveSuccessToast, setSaveSuccessToast] = useState<string | null>(null);
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [historyCarrierFilter, setHistoryCarrierFilter] = useState('');

  // Filtered history records calculation
  const filteredHistoryRecords = useMemo(() => {
    return savedProvisionRecords.filter(record => {
      const matchesSearch = !historySearchTerm || 
        record.soporteNum.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
        record.transportadora.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
        record.mesGestion.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
        (record.otrosGastosConcepto && record.otrosGastosConcepto.toLowerCase().includes(historySearchTerm.toLowerCase()));

      const matchesCarrier = !historyCarrierFilter || record.transportadora === historyCarrierFilter;

      return matchesSearch && matchesCarrier;
    });
  }, [savedProvisionRecords, historySearchTerm, historyCarrierFilter]);

  // Real-time synchronization with Cloud Firestore
  useEffect(() => {
    const unsub = subscribeToCloud('provisiones_state', 'saved_vouchers', (data) => {
      if (Array.isArray(data) && data.length > 0) {
        setSavedProvisionRecords(prev => {
          const map = new Map<string, SavedProvisionRecord>();
          prev.forEach(r => { if (r && r.id) map.set(r.id, r); });
          data.forEach((r: SavedProvisionRecord) => { if (r && r.id) map.set(r.id, r); });
          const merged = Array.from(map.values()).sort((a, b) => new Date(b.fechaGuardado || 0).getTime() - new Date(a.fechaGuardado || 0).getTime());
          try {
            localStorage.setItem('prov_saved_vouchers', JSON.stringify(merged));
          } catch (e) {
            console.error("Error writing prov_saved_vouchers to local storage", e);
          }
          return merged;
        });
      }
    });
    return () => unsub();
  }, []);

  // Otros Gastos Manuales persistence per filter combination (Carrier + Month + Fortnight)
  const [otrosGastosMap, setOtrosGastosMap] = useState<Record<string, { monto: number; concepto: string }>>(() => {
    try {
      const saved = localStorage.getItem('prov_otros_gastos');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const activeOtrosGastosKey = useMemo(() => {
    const m = selectedMonthFilter || 'TODOS_MESES';
    const c = selectedCarrierFilter || 'TODAS_TRANSP';
    const f = selectedFortnightFilter || 'TODOS_CORTES';
    return `${c}__${m}__${f}`;
  }, [selectedMonthFilter, selectedCarrierFilter, selectedFortnightFilter]);

  const currentOtrosGastosData = useMemo(() => {
    return otrosGastosMap[activeOtrosGastosKey] || { monto: 0, concepto: '' };
  }, [otrosGastosMap, activeOtrosGastosKey]);

  const otrosGastosMonto = currentOtrosGastosData.monto || 0;
  const otrosGastosConcepto = currentOtrosGastosData.concepto || '';

  const handleUpdateOtrosGastos = (monto: number, concepto?: string) => {
    const newMonto = Math.max(0, isNaN(monto) ? 0 : monto);
    setOtrosGastosMap(prev => {
      const updated = {
        ...prev,
        [activeOtrosGastosKey]: {
          monto: newMonto,
          concepto: concepto !== undefined ? concepto : (prev[activeOtrosGastosKey]?.concepto || '')
        }
      };
      try {
        localStorage.setItem('prov_otros_gastos', JSON.stringify(updated));
      } catch (e) {
        console.error("Error saving prov_otros_gastos", e);
      }
      return updated;
    });
  };

  const handleUpdateOtrosGastosConcepto = (concepto: string) => {
    setOtrosGastosMap(prev => {
      const updated = {
        ...prev,
        [activeOtrosGastosKey]: {
          monto: prev[activeOtrosGastosKey]?.monto || 0,
          concepto
        }
      };
      try {
        localStorage.setItem('prov_otros_gastos', JSON.stringify(updated));
      } catch (e) {
        console.error("Error saving prov_otros_gastos", e);
      }
      return updated;
    });
  };

  const getFortnightLabel = (type: '1' | '2' | 'TODOS') => {
    if (type === 'TODOS') return '📅 TODO EL MES';
    
    const monthNames = [
      "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
      "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
    ];
    
    if (selectedMonthFilter) {
      const targetMonthIdx = parseInt(selectedMonthFilter, 10) - 1;
      const currentMonthName = monthNames[targetMonthIdx];
      
      let prevMonthIdx = targetMonthIdx - 1;
      if (prevMonthIdx === -1) prevMonthIdx = 11;
      const prevMonthName = monthNames[prevMonthIdx];
      
      if (type === '1') {
        return `📅 1er Corte (Pago 16 - Serv. 1 al 15 de ${currentMonthName})`;
      } else {
        return `📅 2do Corte (Pago 1 - Serv. 16 al Fin de ${prevMonthName})`;
      }
    }
    
    if (type === '1') {
      return '📅 1er Corte (Pago 16 - Serv. del 1 al 15)';
    } else {
      return '📅 2do Corte (Pago 1 - Serv. del 16 al Fin de mes ant.)';
    }
  };

  // Helper to parse dates in any format reliably (ISO, YYYY-MM-DD, DD/MM/YYYY, timestamp, etc.)
  const parseDateParts = (dateStr: string) => {
    if (!dateStr) return null;
    const rawStr = dateStr.toString().trim();
    if (!rawStr) return null;

    // 0. Timestamp (e.g. 1722297600000)
    if (/^\d{10,13}$/.test(rawStr)) {
      const dObj = new Date(parseInt(rawStr, 10));
      if (!isNaN(dObj.getTime())) {
        return { year: dObj.getFullYear(), month: dObj.getMonth() + 1, day: dObj.getDate() };
      }
    }

    // 1. Try ISO or YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = rawStr.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (ymdMatch) {
      const y = parseInt(ymdMatch[1], 10);
      const m = parseInt(ymdMatch[2], 10);
      const d = parseInt(ymdMatch[3], 10);
      if (y >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return { year: y, month: m, day: d };
      }
    }

    // 2. Try DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY
    const dmyMatch = rawStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (dmyMatch) {
      const p1 = parseInt(dmyMatch[1], 10);
      const p2 = parseInt(dmyMatch[2], 10);
      let y = parseInt(dmyMatch[3], 10);
      if (y < 100) y += 2000;
      
      // If p2 is valid month (DD/MM/YYYY format)
      if (p2 >= 1 && p2 <= 12 && p1 >= 1 && p1 <= 31) {
        return { year: y, month: p2, day: p1 };
      }
      // If p1 is valid month (MM/DD/YYYY format)
      if (p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 31) {
        return { year: y, month: p1, day: p2 };
      }
    }

    // 3. Spanish text with month names (e.g., "29 de Julio de 2026", "julio", "jul")
    const lower = rawStr.toLowerCase();
    const monthNamesEs = [
      { name: 'enero', num: 1 }, { name: 'ene', num: 1 },
      { name: 'febrero', num: 2 }, { name: 'feb', num: 2 },
      { name: 'marzo', num: 3 }, { name: 'mar', num: 3 },
      { name: 'abril', num: 4 }, { name: 'abr', num: 4 },
      { name: 'mayo', num: 5 }, { name: 'may', num: 5 },
      { name: 'junio', num: 6 }, { name: 'jun', num: 6 },
      { name: 'julio', num: 7 }, { name: 'jul', num: 7 },
      { name: 'agosto', num: 8 }, { name: 'ago', num: 8 },
      { name: 'septiembre', num: 9 }, { name: 'sep', num: 9 },
      { name: 'octubre', num: 10 }, { name: 'oct', num: 10 },
      { name: 'noviembre', num: 11 }, { name: 'nov', num: 11 },
      { name: 'diciembre', num: 12 }, { name: 'dic', num: 12 },
    ];

    for (const mObj of monthNamesEs) {
      if (lower.includes(mObj.name)) {
        const dayMatch = rawStr.match(/(\b\d{1,2}\b)/);
        const yearMatch = rawStr.match(/(\b20\d{2}\b)/);
        const day = dayMatch ? parseInt(dayMatch[1], 10) : 15;
        const year = yearMatch ? parseInt(yearMatch[1], 10) : 2026;
        return { year, month: mObj.num, day };
      }
    }

    // 4. JS Date fallback using UTC components to avoid local timezone offset shifts
    const dObj = new Date(rawStr);
    if (!isNaN(dObj.getTime())) {
      return { year: dObj.getUTCFullYear(), month: dObj.getUTCMonth() + 1, day: dObj.getUTCDate() };
    }

    return null;
  };

  // Filtered orders for Provision checking (ONLY 'Despachado' or 'Entregado' as requested)
  const filteredOrders = useMemo(() => {
    // Only include orders marked as 'Despachado' or 'Entregado' (orders that already left the company to the client)
    let result = orders.filter(o => o.estado === 'Despachado' || o.estado === 'Entregado');
    
    // 1. Status Filter (TODOS, SIN_FP, CON_FP)
    if (selectedStatusFilter === 'SIN_FP') {
      result = result.filter(o => !o.provision);
    } else if (selectedStatusFilter === 'CON_FP') {
      result = result.filter(o => !!o.provision);
    }

    // 2. Month and Fortnight Filter
    if (selectedMonthFilter) {
      result = result.filter(o => {
        let dateStr = '';
        if (dateCriteriaFilter === 'DESPACHO') {
          dateStr = o.fechaSalida || o.fechaFactura || o.fechaIngreso;
        } else if (dateCriteriaFilter === 'FACTURA') {
          dateStr = o.fechaFactura || o.fechaSalida || o.fechaIngreso;
        } else {
          dateStr = o.fechaIngreso || o.fechaSalida || o.fechaFactura;
        }
        if (!dateStr) return false;
        
        const parsed = parseDateParts(dateStr);
        if (!parsed) return false;
        
        const targetMonth = parseInt(selectedMonthFilter, 10);
        
        if (selectedFortnightFilter === '1') {
          // 1er Corte (Pago el 16 de este mes): Servicios del 1 al 15 de este mes
          return parsed.month === targetMonth && parsed.day >= 1 && parsed.day <= 15;
        } else if (selectedFortnightFilter === '2') {
          // 2do Corte: Servicios del 16 en adelante de este mes O de fin de mes anterior
          let prevMonth = targetMonth - 1;
          if (prevMonth === 0) prevMonth = 12;
          return (parsed.month === targetMonth && parsed.day >= 16) || (parsed.month === prevMonth && parsed.day >= 16);
        }
        
        // No fortnight filter: show full selected month
        return parsed.month === targetMonth;
      });
    } else if (selectedFortnightFilter !== 'TODOS') {
      result = result.filter(o => {
        let dateStr = '';
        if (dateCriteriaFilter === 'DESPACHO') {
          dateStr = o.fechaSalida || o.fechaFactura || o.fechaIngreso;
        } else if (dateCriteriaFilter === 'FACTURA') {
          dateStr = o.fechaFactura || o.fechaSalida || o.fechaIngreso;
        } else {
          dateStr = o.fechaIngreso || o.fechaSalida || o.fechaFactura;
        }
        if (!dateStr) return false;
        const parsed = parseDateParts(dateStr);
        if (!parsed) return false;

        if (selectedFortnightFilter === '1') {
          return parsed.day >= 1 && parsed.day <= 15;
        } else if (selectedFortnightFilter === '2') {
          return parsed.day >= 16 && parsed.day <= 31;
        }
        return true;
      });
    }

    // 3. Carrier Filter
    if (selectedCarrierFilter) {
      const filterNorm = selectedCarrierFilter.trim().toLowerCase();
      result = result.filter(o => {
        if (!o.transportadora) return false;
        const carrierNorm = o.transportadora.trim().toLowerCase();
        return carrierNorm === filterNorm || carrierNorm.includes(filterNorm) || filterNorm.includes(carrierNorm);
      });
    }

    // 4. Search Keyword Filter
    if (searchTerm.trim()) {
      result = result.filter(o => matchOrderSearch(o, searchTerm));
    }

    return result;
  }, [orders, selectedStatusFilter, selectedMonthFilter, selectedCarrierFilter, searchTerm, dateCriteriaFilter, selectedFortnightFilter]);

  // Unique list of carriers for dropdown filter (combining system carriers list and order carriers)
  const uniqueCarriers = useMemo(() => {
    const map = new Map<string, string>(); // lowercase -> display name
    if (carriers && Array.isArray(carriers)) {
      carriers.forEach(c => {
        if (c && c.nombre && c.nombre.trim()) {
          const trimmed = c.nombre.trim();
          map.set(trimmed.toLowerCase(), trimmed);
        }
      });
    }
    if (orders && Array.isArray(orders)) {
      orders.forEach(o => {
        if ((o.estado === 'Despachado' || o.estado === 'Entregado') && o.transportadora && o.transportadora.trim()) {
          const trimmed = o.transportadora.trim();
          if (!map.has(trimmed.toLowerCase())) {
            map.set(trimmed.toLowerCase(), trimmed);
          }
        }
      });
    }
    return Array.from(map.values()).sort();
  }, [orders, carriers]);

  const totalProvisionPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  }, [filteredOrders, itemsPerPage]);

  const paginatedOrdersForTable = useMemo(() => {
    const startIndex = (provisionPage - 1) * itemsPerPage;
    return filteredOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOrders, provisionPage, itemsPerPage]);

  const exportProvisionesToCSV = () => {
    const headers = ["Flete ID", "Fecha Despacho", "PV", "Factura Venta", "Cliente", "Socio Transportador", "Destino", "Costo Flete", "Factura Provisión (FP)", "Estado"];
    const rows: (string | number)[][] = filteredOrders.map(o => [
      o.id,
      o.fechaSalida || '---',
      o.pv || '',
      o.factura || '',
      o.cliente,
      o.transportadora,
      o.ciudad,
      o.flete,
      o.provision || '',
      o.estado
    ]);

    if (otrosGastosMonto > 0) {
      rows.push([
        "EXTRA-GASTOS",
        "---",
        "N/A",
        "N/A",
        `OTROS GASTOS MANUALES${otrosGastosConcepto ? ` (${otrosGastosConcepto})` : ''}`,
        selectedCarrierFilter || "OPERADOR",
        "VARIOS",
        otrosGastosMonto,
        "FP-MANUAL",
        "Entregado"
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoría Provisiones");
    XLSX.writeFile(wb, `auditoria_provisiones_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredOrders.map(o => o.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Assign Bulk Factura Provisión
  const handleAssignBulkProvision = () => {
    if (!provisionInvoiceInput.trim() || selectedIds.length === 0) return;

    selectedIds.forEach(id => {
      const existing = orders.find(o => o.id === id);
      if (existing) {
        onUpdateOrder({
          ...existing,
          provision: provisionInvoiceInput.trim()
        });
      }
    });

    setSelectedIds([]);
    setProvisionInvoiceInput('');
  };

  // Calculations for active selection for the voucher
  const voucherData = useMemo(() => {
    const selectedOrders = orders.filter(o => selectedIds.includes(o.id));
    const totalFlete = selectedOrders.reduce((sum, o) => sum + o.flete, 0);
    // Find common carrier or default
    const carrier = selectedOrders.length > 0 ? selectedOrders[0].transportadora : (selectedCarrierFilter || "TRANSGLOBAL DE CARGA S.A.S");
    return {
      orders: selectedOrders,
      totalFlete,
      carrier,
      date: new Date().toLocaleDateString('es-CO')
    };
  }, [orders, selectedIds, selectedCarrierFilter]);

  const totalNetoPagar = useMemo(() => {
    return voucherData.totalFlete + otrosGastosMonto;
  }, [voucherData.totalFlete, otrosGastosMonto]);

  // Compute "MES DE GESTIÓN" dynamically based on selected orders
  const mesGestion = useMemo(() => {
    const monthNames = [
      "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
      "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
    ];
    let year = "2026";

    if (selectedMonthFilter) {
      const targetMonthIdx = parseInt(selectedMonthFilter, 10) - 1;
      const monthName = monthNames[targetMonthIdx] || "JULIO";
      let suffix = '';
      if (selectedFortnightFilter === '1') suffix = ' (1er CORTE - PAGO DÍA 16)';
      else if (selectedFortnightFilter === '2') suffix = ' (2do CORTE - PAGO DÍA 1)';
      return `${monthName} DE ${year}${suffix}`;
    }

    if (voucherData.orders.length === 0) return "JUNIO DE 2026";
    const monthsFound = new Set<string>();
    voucherData.orders.forEach(o => {
      let dateStr = '';
      if (dateCriteriaFilter === 'DESPACHO') {
        dateStr = o.fechaSalida || o.fechaFactura || o.fechaIngreso;
      } else if (dateCriteriaFilter === 'FACTURA') {
        dateStr = o.fechaFactura || o.fechaSalida || o.fechaIngreso;
      } else {
        dateStr = o.fechaIngreso || o.fechaSalida || o.fechaFactura;
      }
      if (dateStr) {
        const parsed = parseDateParts(dateStr);
        if (parsed) {
          const mIndex = parsed.month - 1;
          if (mIndex >= 0 && mIndex < 12) {
            monthsFound.add(monthNames[mIndex]);
          }
          if (parsed.year) year = parsed.year.toString();
        }
      }
    });
    if (monthsFound.size === 1) {
      let suffix = '';
      if (selectedFortnightFilter === '1') suffix = ' (1er CORTE - PAGO DÍA 16)';
      else if (selectedFortnightFilter === '2') suffix = ' (2do CORTE - PAGO DÍA 1)';
      return `${Array.from(monthsFound)[0]} DE ${year}${suffix}`;
    } else if (monthsFound.size > 1) {
      let suffix = '';
      if (selectedFortnightFilter === '1') suffix = ' (1er CORTE - PAGO DÍA 16)';
      else if (selectedFortnightFilter === '2') suffix = ' (2do CORTE - PAGO DÍA 1)';
      return `${Array.from(monthsFound).join(' - ')} DE ${year}${suffix}`;
    }
    return `JUNIO DE ${year}`;
  }, [voucherData.orders, dateCriteriaFilter, selectedFortnightFilter, selectedMonthFilter]);

  // Active display variables for voucher rendering (either active selection or historical saved record)
  const displayVoucherData = useMemo(() => {
    if (activeSavedRecordForVoucher) {
      return {
        orders: activeSavedRecordForVoucher.orders,
        totalFlete: activeSavedRecordForVoucher.subtotalFletes,
        carrier: activeSavedRecordForVoucher.transportadora,
        date: activeSavedRecordForVoucher.fechaGuardado
      };
    }
    return voucherData;
  }, [activeSavedRecordForVoucher, voucherData]);

  const displayOtrosGastosMonto = activeSavedRecordForVoucher 
    ? activeSavedRecordForVoucher.otrosGastosMonto 
    : otrosGastosMonto;

  const displayOtrosGastosConcepto = activeSavedRecordForVoucher 
    ? activeSavedRecordForVoucher.otrosGastosConcepto 
    : otrosGastosConcepto;

  const displayTotalNetoPagar = activeSavedRecordForVoucher 
    ? activeSavedRecordForVoucher.totalPagar 
    : totalNetoPagar;

  const displaySoporteNum = activeSavedRecordForVoucher
    ? activeSavedRecordForVoucher.soporteNum
    : `SOP-PROV-${String(totalNetoPagar % 10000).padStart(4, '0')}-${voucherData.orders.length}`;

  const displayMesGestion = activeSavedRecordForVoucher
    ? activeSavedRecordForVoucher.mesGestion
    : mesGestion;

  // Save current provision record to history
  const handleSaveCurrentProvision = (notes?: string) => {
    const currentSoporte = displaySoporteNum;
    const currentCarrier = displayVoucherData.carrier;
    const currentOrders = displayVoucherData.orders;
    const currentSubtotal = displayVoucherData.totalFlete;
    const currentOtrosMonto = displayOtrosGastosMonto;
    const currentOtrosConcepto = displayOtrosGastosConcepto;
    const currentTotal = displayTotalNetoPagar;
    const currentMes = displayMesGestion;

    const newRecord: SavedProvisionRecord = {
      id: `PROV-${Date.now()}`,
      soporteNum: currentSoporte,
      fechaGuardado: new Date().toLocaleString('es-CO', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: true
      }),
      transportadora: currentCarrier,
      mesGestion: currentMes,
      quincenaLabel: getFortnightLabel(selectedFortnightFilter),
      cantidadOrdenes: currentOrders.length,
      subtotalFletes: currentSubtotal,
      otrosGastosMonto: currentOtrosMonto,
      otrosGastosConcepto: currentOtrosConcepto,
      totalPagar: currentTotal,
      elaboradoPor: elaboradoPor || 'LOGÍSTICA Y DESPACHOS',
      autorizadoPor: autorizadoPor || 'MESA CONTABLE SAS',
      isSummaryView: !!isSummaryView,
      orders: currentOrders.map(o => ({
        id: o.id || '',
        fechaSalida: o.fechaSalida || '',
        pv: o.pv || '',
        factura: o.factura || '',
        cliente: o.cliente || '',
        transportadora: o.transportadora || currentCarrier || '',
        flete: Number(o.flete) || 0,
        facturaProvision: o.facturaProvision || '',
        destino: o.destino || '',
        oc: o.oc || '',
        ciudad: o.ciudad || '',
        cajas: Number(o.cajas) || 0
      })),
      notas: notes || ''
    };

    const updated = [newRecord, ...savedProvisionRecords];
    setSavedProvisionRecords(updated);
    saveToCloud('provisiones_state', 'saved_vouchers', updated);
    try {
      localStorage.setItem('prov_saved_vouchers', JSON.stringify(updated));
    } catch (e) {
      console.error("Error saving local prov_saved_vouchers", e);
    }

    setSaveSuccessToast(`✅ Provisión ${currentSoporte} guardada en el historial`);
    setTimeout(() => setSaveSuccessToast(null), 3500);
  };

  // Delete saved provision record from history
  const handleDeleteSavedRecord = (id: string) => {
    const updated = savedProvisionRecords.filter(r => r.id !== id);
    setSavedProvisionRecords(updated);
    saveToCloud('provisiones_state', 'saved_vouchers', updated);
    try {
      localStorage.setItem('prov_saved_vouchers', JSON.stringify(updated));
    } catch (e) {
      console.error("Error updating local prov_saved_vouchers", e);
    }
    setDeletingRecordId(null);
    setSaveSuccessToast('🗑️ Registro de provisión eliminado correctamente');
    setTimeout(() => setSaveSuccessToast(null), 3000);
  };

  // Open historical saved record in voucher preview
  const handleOpenSavedRecordVoucher = (record: SavedProvisionRecord) => {
    setActiveSavedRecordForVoucher(record);
    setIsSummaryView(!!record.isSummaryView);
    setElaboradoPor(record.elaboradoPor || 'LOGÍSTICA Y DESPACHOS');
    setAutorizadoPor(record.autorizadoPor || 'MESA CONTABLE SAS');
    setIsVoucherOpen(true);
  };

  // Export Excel for a saved provision record
  const handleExportSavedRecordExcel = (record: SavedProvisionRecord) => {
    const headers = ["Flete ID", "Fecha Despacho", "PV", "Factura Venta", "Cliente", "Socio Transportador", "Destino", "Costo Flete", "Factura Provisión (FP)", "Estado"];
    const rows: (string | number)[][] = record.orders.map(o => [
      o.id,
      o.fechaSalida || '---',
      o.pv || '',
      o.factura || '',
      o.cliente || '',
      o.transportadora || record.transportadora,
      o.destino || '---',
      o.flete,
      o.facturaProvision || '',
      'Entregado'
    ]);

    if (record.otrosGastosMonto > 0) {
      rows.push([
        "EXTRA-GASTOS",
        "---",
        "N/A",
        "N/A",
        `OTROS GASTOS MANUALES${record.otrosGastosConcepto ? ` (${record.otrosGastosConcepto})` : ''}`,
        record.transportadora,
        "VARIOS",
        record.otrosGastosMonto,
        "FP-MANUAL",
        "Entregado"
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Provisión Guardada");
    XLSX.writeFile(wb, `${record.soporteNum}_${record.transportadora.replace(/\s+/g, '_')}.xlsx`);
  };

  // Compute summary grouped by client (e.g. grouping any name containing "MERCAMIO" into "MERCAMIO")
  const summaryData = useMemo(() => {
    if (!isSummaryView) return [];
    
    const groups: { 
      [key: string]: { 
        clientName: string; 
        totalFlete: number; 
        totalCajas: number; 
        orderCount: number; 
        pvs: string[]; 
        ocs: string[]; 
        facs: string[]; 
      } 
    } = {};
    
    displayVoucherData.orders.forEach(o => {
      let clientKey = o.cliente || 'OTROS';
      const upper = clientKey.toUpperCase();
      if (upper.includes('MERCAMIO')) {
        clientKey = 'MERCAMIO';
      }
      
      if (!groups[clientKey]) {
        groups[clientKey] = {
          clientName: clientKey,
          totalFlete: 0,
          totalCajas: 0,
          orderCount: 0,
          pvs: [],
          ocs: [],
          facs: []
        };
      }
      
      groups[clientKey].totalFlete += o.flete || 0;
      groups[clientKey].totalCajas += ((o as any).cajas || (o as any).cajasFact || 0);
      groups[clientKey].orderCount += 1;
      
      const pvVal = o.pv || o.id;
      if (pvVal && !groups[clientKey].pvs.includes(pvVal)) {
        groups[clientKey].pvs.push(pvVal);
      }
      if (o.oc && !groups[clientKey].ocs.includes(o.oc)) {
        groups[clientKey].ocs.push(o.oc);
      }
      if (o.factura && !groups[clientKey].facs.includes(o.factura)) {
        groups[clientKey].facs.push(o.factura);
      }
    });
    
    return Object.values(groups);
  }, [displayVoucherData.orders, isSummaryView]);

  const renderVoucherContent = (isPrint: boolean) => {
    return (
      <div 
        id={isPrint ? "printProvision" : undefined}
        className={`space-y-4 font-sans ${isPrint ? 'bg-white text-black p-0' : 'bg-white text-black p-6 rounded-lg border border-slate-300 shadow-md'}`}
      >
        {/* Header Box Grid */}
        <div className="grid grid-cols-12 border border-black divide-x divide-black text-xs bg-white text-black">
          {/* Left Column: Corporate Info */}
          <div className="col-span-7 p-3 flex flex-col justify-center space-y-1 bg-white text-black">
            <h2 className="text-sm font-bold text-black tracking-wider font-display uppercase">
              SISTEMALOG S.A.S.
            </h2>
            <p className="text-[10px] text-gray-700 font-bold font-mono">NIT: 800225074-3</p>
            <p className="text-[9px] text-gray-600 uppercase leading-tight font-sans">
              RESPONSABLE DE IVA • TEL: 3844090 • DIR: CARRERA 39 14-62 ACOPI - YUMBO
            </p>
            <p className="text-[9px] text-gray-500 italic font-medium">
              "Productos confiables para el aseo"
            </p>
          </div>

          {/* Right Column: Billing Title, QR code and Control Serial */}
          <div className="col-span-5 flex flex-col justify-between bg-white text-black">
            <div className="bg-gray-100 p-1.5 text-center border-b border-black">
              <h3 className="text-[10px] font-bold text-black uppercase tracking-wider font-sans">
                SOPORTE DE PAGO DE PROVISIÓN
              </h3>
            </div>
            <div className="p-2 flex items-center justify-center gap-3 flex-grow bg-white text-black">
              {/* QR Code SVG */}
              <div className="shrink-0">
                <svg className="w-10 h-10 text-black" viewBox="0 0 29 29" fill="currentColor">
                  <path d="M0 0h9v9H0zm1 1v7h7V1zm8 0h1v1H9zm1 1h1v1h-1zm-1 1h2v1H9zm1 2h1v1h-1zm-1 1h1v1H9zm1 1h1v1h-1zm1-7h9v9h-9zm1 1v7h7V1zm-12 8h1v1H1zm1 1h1v1H2zm-1 1h1v1H1zm2-1h1v1H3zm1 1h1v1H4zm-3 1h1v1H1zm2 1h1v1H3zm3-4h1v1H6zm1 1h1v1H7zm-1 1h1v1H6zm1 1h2v1H7zm11-1h1v1h-1zm1 1h1v1h-1zm-1 1h2v1h-2zm-1 1h1v1h-1zm1 1h1v1h-1zm1-5h1v1h-1zm1 1h1v1h-1zm-1 1h1v1h-1zm1 2h1v1h-1zm1-8h1v1h-1zm1 1h1v1h-1zm-1 1h1v1h-1zm1 1h1v1h-1zm2 9h1v1h-1zm1 1h1v1h-1zm-1 1h2v1h-2zm-1 1h1v1h-1zm1 1h1v1h-1z" />
                </svg>
              </div>
              <div className="text-left">
                <span className="text-[9px] text-gray-500 font-mono block font-semibold">NÚMERO DE SOPORTE:</span>
                <span className="text-xs font-black text-black font-mono tracking-wide">
                  {displaySoporteNum}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Client & Operator Metadata Box */}
        <div className="grid grid-cols-2 border border-black divide-x divide-black bg-white text-[10px] font-sans text-black">
          {/* Column A */}
          <div className="p-2 space-y-1">
            <div className="flex justify-between items-center gap-2">
              <span className="text-gray-500 font-bold uppercase shrink-0 text-[9px]">BENEFICIARIO:</span>
              <strong className="text-black uppercase text-right truncate font-bold">
                {displayVoucherData.carrier}
              </strong>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-gray-500 font-bold uppercase shrink-0 text-[9px]">C.C / NIT:</span>
              <span className="text-black font-mono font-medium">
                {displayVoucherData.carrier.toUpperCase().includes('CUELLAR') ? '901.455.678-2' : '800.123.456-1'}
              </span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-gray-500 font-bold uppercase shrink-0 text-[9px]">CIUDAD ORÍGEN:</span>
              <span className="text-black uppercase">YUMBO / ACOPI (VALLE)</span>
            </div>
          </div>

          {/* Column B */}
          <div className="p-2 space-y-1">
            <div className="flex justify-between items-center gap-2">
              <span className="text-gray-500 font-bold uppercase shrink-0 text-[9px]">MES DE GESTIÓN:</span>
              <strong className="text-black font-bold uppercase">{displayMesGestion}</strong>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-gray-500 font-bold uppercase shrink-0 text-[9px]">FECHA GENERADO:</span>
              <span className="text-black font-mono font-medium">{displayVoucherData.date}</span>
            </div>
            <div className="flex justify-between items-center gap-2">
              <span className="text-gray-500 font-bold uppercase shrink-0 text-[9px]">MEDIO DE PAGO:</span>
              <span className="text-black uppercase font-medium">TRANSFERENCIA BANCARIA / CRÉDITO</span>
            </div>
          </div>
        </div>

        {/* Compact Main Details Table */}
        <div className="border border-black overflow-hidden rounded-none bg-white text-black">
          <table className="w-full text-left text-[9.5px] font-mono border-collapse bg-white text-black">
            <thead className="bg-gray-100 text-black font-bold border-b border-black">
              <tr className="divide-x divide-black">
                <th className="p-1 text-center w-7">#</th>
                <th className="p-1 w-20">PV / CÓDIGO</th>
                <th className="p-1">OC / FACTURA ASOCIADA</th>
                <th className="p-1">CLIENTE / DESTINO</th>
                {isSummaryView && <th className="p-1 text-center w-14">CANT</th>}
                <th className="p-1 text-right w-28">VALOR FLETE (COP)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black text-black">
              {isSummaryView ? (
                summaryData.map((group, idx) => (
                  <tr key={group.clientName} className="divide-x divide-black hover:bg-gray-55">
                    <td className="p-1 text-center font-bold text-gray-500">{idx + 1}</td>
                    <td className="p-1 font-bold text-black font-mono">
                      {group.pvs.length <= 2 ? group.pvs.join(', ') : `CONSO (${group.orderCount})`}
                    </td>
                    <td className="p-1 leading-tight">
                      <span className="font-bold text-black block text-[9px]">
                        CAJAS TOTAL: {group.totalCajas}
                      </span>
                      {group.ocs.length > 0 && (
                        <span className="text-[8.5px] text-gray-600 block">
                          OC: {group.ocs.slice(0, 3).join(', ')}{group.ocs.length > 3 && '...'}
                        </span>
                      )}
                    </td>
                    <td className="p-1 font-bold uppercase font-sans text-[9px] truncate max-w-xs">
                      {group.clientName}
                    </td>
                    <td className="p-1 text-center font-bold">{group.orderCount}</td>
                    <td className="p-1 text-right text-black font-bold">
                      $ {group.totalFlete.toLocaleString('es-CO')}
                    </td>
                  </tr>
                ))
              ) : (
                displayVoucherData.orders.map((o, idx) => (
                  <tr key={o.id} className="divide-x divide-black hover:bg-gray-55">
                    <td className="p-1 text-center font-bold text-gray-500">{idx + 1}</td>
                    <td className="p-1 font-bold text-black font-mono">
                      {o.pv || o.id}
                    </td>
                    <td className="p-1 leading-none text-[8.5px] space-y-0.5">
                      <div>OC: {o.oc || 'S/N'}</div>
                      <div className="text-gray-600 font-mono">FAC: {o.factura || 'S/N'}</div>
                    </td>
                    <td className="p-1 font-bold uppercase font-sans text-[9px]">
                      <div className="truncate max-w-[280px]">{o.cliente}</div>
                      {o.ciudad && <span className="text-[8px] text-gray-600 block font-normal font-mono">{o.ciudad.toUpperCase()}</span>}
                    </td>
                    <td className="p-1 text-right text-black font-bold font-mono">
                      $ {o.flete.toLocaleString('es-CO')}
                    </td>
                  </tr>
                ))
              )}

              {/* OTROS GASTOS MANUALES EXTRA ROW */}
              {displayOtrosGastosMonto > 0 && (
                <tr className="divide-x divide-black bg-amber-50/80 font-bold">
                  <td className="p-1 text-center font-bold text-black">+</td>
                  <td colSpan={isSummaryView ? 3 : 2} className="p-1 font-bold text-black uppercase font-mono text-[9px]">
                    OTROS GASTOS / COBROS EXTRAS MANUALES
                    {displayOtrosGastosConcepto ? ` — ${displayOtrosGastosConcepto.toUpperCase()}` : ''}
                  </td>
                  <td className="p-1 font-bold uppercase font-sans text-[9px]">
                    {displayVoucherData.carrier}
                  </td>
                  {isSummaryView && <td className="p-1 text-center font-bold">1</td>}
                  <td className="p-1 text-right text-black font-black font-mono">
                    $ {displayOtrosGastosMonto.toLocaleString('es-CO')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Total Settlement Summary Box */}
        <div className="grid grid-cols-12 border border-black divide-x divide-black text-[10px] font-mono bg-white text-black">
          {/* Left Side: Literal Cash Amount In Words */}
          <div className="col-span-7 p-2 flex flex-col justify-between space-y-2 bg-white text-black">
            <div>
              <span className="text-gray-500 block font-bold font-sans text-[8.5px]">VALOR EN LETRAS:</span>
              <span className="text-black font-black uppercase text-[9px] block leading-relaxed mt-0.5 font-sans">
                {numeroALetras(displayTotalNetoPagar)}
              </span>
            </div>
            <div className="text-[8px] text-gray-500 font-sans italic">
              *Documento soporte contable para liquidación interna de fletes. Exento de gravamen por intermediación.
            </div>
          </div>

          {/* Right Side: Totals Matrix */}
          <div className="col-span-5 divide-y divide-black font-sans text-[9.5px] bg-white text-black">
            <div className="flex justify-between p-1">
              <span className="text-gray-500 font-medium">SUBTOTAL FLETES:</span>
              <span className="font-bold font-mono">$ {displayVoucherData.totalFlete.toLocaleString('es-CO')}</span>
            </div>
            {displayOtrosGastosMonto > 0 ? (
              <div className="flex justify-between p-1 bg-amber-100/70 font-bold">
                <span className="text-black font-bold uppercase text-[8.5px]">OTROS GASTOS / EXTRAS:</span>
                <span className="font-bold font-mono text-black">$ {displayOtrosGastosMonto.toLocaleString('es-CO')}</span>
              </div>
            ) : (
              <div className="flex justify-between p-1">
                <span className="text-gray-500 font-medium">OTROS GASTOS:</span>
                <span className="font-bold text-gray-500 font-mono">$-</span>
              </div>
            )}
            <div className="flex justify-between p-1">
              <span className="text-gray-500 font-medium">DESCUENTOS / RETENCIONES:</span>
              <span className="font-bold text-gray-500 font-mono">$-</span>
            </div>
            <div className="flex justify-between items-center p-1.5 bg-gray-100 font-black text-[11px] border-t border-black text-black">
              <span className="uppercase text-[9px]">VALOR NETO A PAGAR:</span>
              <span className="font-mono text-xs">$ {displayTotalNetoPagar.toLocaleString('es-CO')} COP</span>
            </div>
          </div>
        </div>

        {/* Signatures Footer */}
        <div className="pt-6 grid grid-cols-2 gap-10 font-sans text-[9px] text-center text-gray-700 bg-white">
          <div className="border-t border-black pt-2 space-y-0.5">
            <strong className="text-black block text-[10px] uppercase font-bold tracking-wider">{elaboradoPor || '___________________'}</strong>
            <p className="text-[8px] text-gray-500 font-semibold uppercase">ÁREA DE LOGÍSTICA - ELABORÓ</p>
          </div>
          <div className="border-t border-black pt-2 space-y-0.5">
            <strong className="text-black block text-[10px] uppercase font-bold tracking-wider">{autorizadoPor || '___________________'}</strong>
            <p className="text-[8px] text-gray-500 font-semibold uppercase">REVISIÓN Y AUTORIZACIÓN DE PAGO</p>
          </div>
        </div>
      </div>
    );
  };

  const triggerPrintVoucher = () => {
    const original = document.title;
    document.title = `SOPORTE_PROVISION_PAGO_${displayVoucherData.carrier.replace(/\s+/g, '_')}`;
    document.body.classList.add('print-provision-mode');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('print-provision-mode');
      document.title = original;
    }, 100);
  };

  return (
    <div className="space-y-6 animate-fade-in print:bg-white print:text-black relative">
      {/* Toast notification popup */}
      {saveSuccessToast && (
        <div className="fixed bottom-6 right-6 z-[15000] bg-slate-900 border-2 border-emerald-500 text-emerald-300 font-mono text-xs px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-slide-up">
          <BookmarkCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-bold">{saveSuccessToast}</span>
        </div>
      )}

      {/* Redesigned filter header strictly mirroring the first screenshot */}
      <div className="sticky -top-6 bg-[#040814] pt-6 pb-4 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-slate-900 print:hidden shadow-lg">
        {/* Left: Volver, Title & Main Tabs */}
        <div className="flex items-center gap-3">
          {onBack && (
            <button 
              onClick={onBack}
              className="bg-slate-900/60 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 px-3 py-1.5 rounded transition-all flex items-center gap-1 cursor-pointer"
            >
              <span>← Volver</span>
            </button>
          )}

          {/* Main Tab Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
            <button
              onClick={() => setMainTab('auditoria')}
              className={`px-3 py-1.5 rounded text-xs font-mono font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${
                mainTab === 'auditoria'
                  ? 'bg-hud-green text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCheck className="w-3.5 h-3.5" /> AUDITORÍA ACTUAL
            </button>

            <button
              onClick={() => setMainTab('historial')}
              className={`px-3 py-1.5 rounded text-xs font-mono font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer relative ${
                mainTab === 'historial'
                  ? 'bg-hud-green text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FolderArchive className="w-3.5 h-3.5" /> HISTORIAL GUARDADO
              {savedProvisionRecords.length > 0 && (
                <span className={`px-1.5 py-0.2 text-[10px] font-mono font-black rounded-full ${
                  mainTab === 'historial' ? 'bg-slate-950 text-hud-green' : 'bg-hud-green text-slate-950'
                }`}>
                  {savedProvisionRecords.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Right: Search, Filters, Pagination, Excel, Imprimir (Only visible in Auditoría mode) */}
        {mainTab === 'auditoria' && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Buscar input */}
          <div className="relative">
            <input 
              type="text" 
              placeholder="BUSCAR..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setProvisionPage(1); }}
              className="bg-slate-950 border border-slate-800 text-[11px] font-mono font-bold text-white pl-8 pr-3 py-1.5 rounded outline-none w-36 uppercase placeholder:text-slate-550"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
          </div>

          {/* Meses dropdown */}
          <div className="relative">
            <select
              value={selectedMonthFilter}
              onChange={e => { setSelectedMonthFilter(e.target.value); setProvisionPage(1); }}
              className="bg-slate-950 border border-slate-800 text-[11px] font-mono font-bold text-white px-2.5 py-1.5 rounded outline-none uppercase cursor-pointer"
            >
              <option value="">MESES</option>
              <option value="01">ENERO</option>
              <option value="02">FEBRERO</option>
              <option value="03">MARZO</option>
              <option value="04">ABRIL</option>
              <option value="05">MAYO</option>
              <option value="06">JUNIO</option>
              <option value="07">JULIO</option>
              <option value="08">AGOSTO</option>
              <option value="09">SEPTIEMBRE</option>
              <option value="10">OCTUBRE</option>
              <option value="11">NOVIEMBRE</option>
              <option value="12">DICIEMBRE</option>
            </select>
          </div>

          {/* Corte Quincenal dropdown */}
          <div className="relative">
            <select
              value={selectedFortnightFilter}
              onChange={e => { setSelectedFortnightFilter(e.target.value as any); setProvisionPage(1); }}
              className="bg-slate-950 border border-emerald-500/30 hover:border-emerald-500/60 text-[11px] font-mono font-black text-emerald-400 px-2.5 py-1.5 rounded outline-none uppercase cursor-pointer transition-all"
              title="Corte Quincenal de Provisión"
            >
              <option value="TODOS">{getFortnightLabel('TODOS')}</option>
              <option value="1">{getFortnightLabel('1')}</option>
              <option value="2">{getFortnightLabel('2')}</option>
            </select>
          </div>

          {/* Criterio de Fecha dropdown */}
          <div className="relative">
            <select
              value={dateCriteriaFilter}
              onChange={e => { setDateCriteriaFilter(e.target.value as any); setProvisionPage(1); }}
              className="bg-slate-950 border border-[#00ffa3]/30 text-[11px] font-mono font-black text-[#00ffa3] px-2.5 py-1.5 rounded outline-none uppercase cursor-pointer hover:border-[#00ffa3]/60 transition-all"
              title="Criterio de Fecha para la Provisión"
            >
              <option value="DESPACHO">📅 FECHA DESPACHO</option>
              <option value="FACTURA">📅 FECHA FACTURA</option>
              <option value="INGRESO">📅 FECHA INGRESO</option>
            </select>
          </div>

          {/* Transportadora dropdown */}
          <div className="relative">
            <select
              value={selectedCarrierFilter}
              onChange={e => { setSelectedCarrierFilter(e.target.value); setProvisionPage(1); }}
              className="bg-slate-950 border border-slate-800 text-[11px] font-mono font-bold text-white px-2.5 py-1.5 rounded outline-none uppercase cursor-pointer max-w-[150px] truncate"
            >
              <option value="">TODOS LOS OPERADORES</option>
              {uniqueCarriers.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Status dropdown */}
          <div className="relative">
            <select
              value={selectedStatusFilter}
              onChange={e => { setSelectedStatusFilter(e.target.value as any); setProvisionPage(1); }}
              className="bg-slate-950 border border-slate-800 text-[11px] font-mono font-bold text-white px-2.5 py-1.5 rounded outline-none uppercase cursor-pointer"
            >
              <option value="TODOS">TODOS</option>
              <option value="SIN_FP">SIN FP</option>
              <option value="CON_FP">CON FP</option>
            </select>
          </div>

          {/* Inline pagination selector strictly mirroring < 1 / 61 > */}
          <div className="flex items-center gap-1.5 bg-slate-950/40 border border-slate-800 rounded px-2 py-1.5 text-[11px] font-mono font-bold text-slate-400 select-none">
            <button
              onClick={() => setProvisionPage(p => Math.max(1, p - 1))}
              disabled={provisionPage === 1}
              className="hover:text-white disabled:opacity-25 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              &lt;
            </button>
            <span className="text-hud-accent text-[11px]">
              {provisionPage} / {totalProvisionPages}
            </span>
            <button
              onClick={() => setProvisionPage(p => Math.min(totalProvisionPages, p + 1))}
              disabled={provisionPage === totalProvisionPages}
              className="hover:text-white disabled:opacity-25 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              &gt;
            </button>
          </div>

          {/* Excel Export Button */}
          <button
            onClick={exportProvisionesToCSV}
            className="bg-[#107c41]/10 hover:bg-[#107c41]/20 border border-[#107c41]/30 text-[#107c41] text-[11px] font-mono font-bold tracking-wider px-2.5 py-1.5 rounded flex items-center gap-1 cursor-pointer transition-all uppercase"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> EXCEL
          </button>

          {/* Imprimir Payment Support Button */}
          <button
            onClick={() => {
              if (selectedIds.length > 0) {
                setIsVoucherOpen(true);
              } else {
                alert("Por favor, seleccione al menos un flete para generar el soporte de pago.");
              }
            }}
            className={`text-[11px] font-mono font-bold tracking-wider px-3 py-1.5 rounded flex items-center gap-1 transition-all uppercase ${
              selectedIds.length > 0 
                ? 'bg-hud-green text-slate-950 hover:bg-hud-green/80 cursor-pointer shadow-md' 
                : 'bg-slate-900 border border-slate-800 text-slate-500 cursor-not-allowed opacity-60'
            }`}
          >
            <Printer className="w-3.5 h-3.5" /> IMPRIMIR
          </button>
        </div>
        )}
      </div>

      {/* AUDITORÍA ACTUAL VIEW */}
      {mainTab === 'auditoria' && (
        <>
          {/* Prominent OTROS GASTOS MANUALES Banner */}
      <div className="bg-hud-card border border-amber-500/30 p-3.5 rounded-lg flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl animate-fade-in print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-black text-amber-400 tracking-wider uppercase">
                CAMPO OTROS GASTOS (COBROS EXTRAS MANUALES)
              </span>
              <span className="text-[9px] font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 font-bold uppercase">
                {selectedCarrierFilter || 'TODOS LOS OPERADORES'} • {selectedMonthFilter ? `MES ${selectedMonthFilter}` : 'TODOS LOS MESES'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              Si hay fletes o servicios adicionales no incluidos automáticamente, ingréselos aquí para que sumen en la liquidación e impresión.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex flex-col flex-grow md:flex-grow-0">
            <label className="text-[9px] text-slate-400 font-mono font-bold uppercase mb-0.5">Concepto / Detalle:</label>
            <input 
              type="text" 
              placeholder="Ej: Reexpedición, Estadía, Maniobras..." 
              value={otrosGastosConcepto}
              onChange={e => handleUpdateOtrosGastosConcepto(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono px-2.5 py-1.5 rounded outline-none focus:border-amber-500/60 w-full md:w-56"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-[9px] text-amber-400 font-mono font-bold uppercase mb-0.5">Otros Gastos ($ COP):</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-400 text-xs font-mono font-bold">$</span>
              <input 
                type="number" 
                placeholder="0" 
                value={otrosGastosMonto || ''}
                onChange={e => handleUpdateOtrosGastos(parseFloat(e.target.value) || 0)}
                className="bg-slate-950 border border-amber-500/50 text-xs text-amber-300 font-black font-mono pl-6 pr-2.5 py-1.5 rounded outline-none focus:border-amber-400 w-36"
              />
            </div>
          </div>

          {otrosGastosMonto > 0 && (
            <button 
              onClick={() => handleUpdateOtrosGastos(0, '')}
              className="self-end bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[10px] font-mono px-2 py-1.5 rounded cursor-pointer transition-colors mt-auto font-bold uppercase"
              title="Limpiar otros gastos"
            >
              LIMPIAR
            </button>
          )}
        </div>
      </div>

      {/* Mass Invoice Code Assign Bar (retained for ease of mass actions) */}
      {selectedIds.length > 0 && (
        <div className="bg-hud-card border border-hud-border/40 p-4 rounded-lg flex flex-col md:flex-row items-center justify-between gap-3 print:hidden">
          <div className="text-slate-300 text-xs font-mono">
            Has seleccionado <strong className="text-hud-green">{selectedIds.length}</strong> fletes para asignar factura en lote.
          </div>
          <div className="flex items-center gap-2 bg-slate-950/80 p-1 border border-slate-800 rounded-lg w-full md:w-auto">
            <input 
              type="text" 
              placeholder="Factura Provisión (FP)" 
              value={provisionInvoiceInput}
              onChange={e => setProvisionInvoiceInput(e.target.value)}
              className="bg-black text-xs text-[#00ffa3] font-bold font-mono px-3 py-1 rounded border border-hud-green/30 outline-none w-full md:w-48"
            />
            <button 
              onClick={handleAssignBulkProvision}
              className="bg-[#00ffa3] hover:bg-hud-green/85 text-slate-950 px-4 py-1 text-xs font-mono font-black tracking-widest rounded"
            >
              ASIGNAR
            </button>
          </div>
        </div>
      )}

      {/* Redesigned table strictly matching the first screenshot columns and colors */}
      <div className="bg-hud-card border border-hud-border/50 rounded-lg overflow-hidden shadow-xl print:hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#030610] text-[#476a8a] border-b border-hud-border/40 text-[10px] tracking-widest uppercase">
              <tr>
                <th className="p-4" style={{ width: '40px' }}>
                  <input 
                    type="checkbox"
                    onChange={e => toggleSelectAll(e.target.checked)}
                    checked={filteredOrders.length > 0 && paginatedOrdersForTable.every(o => selectedIds.includes(o.id))}
                    className="accent-hud-green"
                  />
                </th>
                <th className="p-4">CÓDIGO</th>
                <th className="p-4">FECHA DESPACHO</th>
                <th className="p-4">CLIENTE / DESTINO</th>
                <th className="p-4">COSTO FLETE</th>
                <th className="p-4">FACTURA PROVISIÓN</th>
                <th className="p-4">ESTADO</th>
                <th className="p-4 text-center">ACCIONES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 text-slate-350">
              {paginatedOrdersForTable.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-mono text-xs">
                    -- No se disponen de registros conciliables con estos parámetros --
                  </td>
                </tr>
              ) : (
                paginatedOrdersForTable.map(order => {
                  const isChecked = selectedIds.includes(order.id);
                  const isZeroFlete = order.flete === 0;
                  
                  return (
                    <tr key={order.id} className={`hover:bg-slate-900/10 ${isChecked ? 'bg-hud-accent/5' : ''}`}>
                      {/* Checkbox */}
                      <td className="p-4">
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectOrder(order.id)}
                          className="accent-hud-green"
                        />
                      </td>

                      {/* Código with FAC subtext */}
                      <td className="p-4">
                        <span className="font-bold text-hud-accent text-sm block">{order.id}</span>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          FAC: {order.factura || 'S/N'}
                        </span>
                      </td>

                      {/* Fecha Despacho */}
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 font-bold font-mono text-xs text-[#00ffa3]">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span>{order.fechaSalida || '---'}</span>
                        </div>
                      </td>

                      {/* Cliente / Destino */}
                      <td className="p-4 font-sans font-medium text-white max-w-xs truncate">
                        <span className="font-bold block uppercase text-white">{order.cliente}</span>
                        <span className="text-[10px] text-slate-400 block font-mono uppercase">
                          {order.ciudad || 'SIN SUCURSAL'}
                        </span>
                      </td>

                      {/* Costo flete */}
                      <td className="p-4 font-bold text-white text-sm">
                        $ {order.flete.toLocaleString('es-CO')}
                      </td>

                      {/* Factura provisión */}
                      <td className="p-4">
                        {order.provision ? (
                          <span className="text-hud-green font-bold font-mono uppercase">{order.provision}</span>
                        ) : isZeroFlete ? (
                          <span className="text-slate-500 font-bold font-mono">N/A</span>
                        ) : (
                          <span className="text-rose-500 font-bold font-mono uppercase">PENDIENTE</span>
                        )}
                      </td>

                      {/* Estado */}
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-sans uppercase border ${
                          order.estado === 'Entregado'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : order.estado === 'Despachado'
                            ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                            : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                        }`}>
                          {order.estado}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td className="p-4 text-center">
                        <button
                          onClick={() => {
                            setEditingOrder(order);
                            setIsEditModalOpen(true);
                          }}
                          className="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-500 p-1.5 rounded transition-all cursor-pointer border border-yellow-500/20"
                          title="Editar Provisión"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Bottom indicator */}
        <div className="p-3 bg-slate-950/40 border-t border-hud-border/30 text-xs font-mono text-slate-400 flex justify-between items-center">
          <div>
            Mostrando <strong>{filteredOrders.length === 0 ? 0 : (provisionPage - 1) * itemsPerPage + 1}</strong> a <strong>{Math.min(provisionPage * itemsPerPage, filteredOrders.length)}</strong> de <strong>{filteredOrders.length}</strong> provisiones
          </div>
          {selectedIds.length > 0 && (
            <div className="text-hud-green font-bold">
              {selectedIds.length} seleccionados para soporte
            </div>
          )}
        </div>
      </div>
    </>
  )}

      {/* Redesigned Payment Voucher modal mirroring the second screenshot perfectly */}
      {isVoucherOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[12000] flex items-center justify-center p-4 print:hidden">
          <div className="bg-[#030610] border border-slate-800 rounded-xl max-w-4xl w-full p-6 space-y-6 shadow-2xl max-h-[95vh] overflow-y-auto">
            
            {/* Header controls inside overlay (hidden during print) */}
            <div className="flex flex-col gap-4 border-b border-slate-900 pb-4">
              <div className="flex items-center justify-between">
                <span className="font-display font-black text-hud-green tracking-widest text-base uppercase">
                  VISTA PREVIA: SOPORTE DE PAGO
                </span>

                <div className="flex items-center gap-4">
                  {/* Summary view toggle */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-slate-400">VISTA RESUMIDA</span>
                    <button 
                      type="button"
                      onClick={() => setIsSummaryView(!isSummaryView)}
                      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors duration-200 focus:outline-none ${isSummaryView ? 'bg-hud-green' : 'bg-slate-800'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-slate-950 transition-transform duration-200 ${isSummaryView ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <button 
                    onClick={() => setIsVoucherOpen(false)} 
                    className="text-slate-400 hover:text-white transition-colors cursor-pointer text-sm font-bold font-mono"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Editable Signatures & Otros Gastos block */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-950/40 p-3 rounded-lg border border-slate-800 text-xs font-mono">
                <div>
                  <label className="text-[9px] text-slate-400 font-bold block mb-1 uppercase tracking-wider">
                    Persona que elabora (Firma Izquierda):
                  </label>
                  <input 
                    type="text" 
                    value={elaboradoPor} 
                    onChange={e => setElaboradoPor(e.target.value.toUpperCase())}
                    className="bg-slate-950 border border-slate-800 text-hud-green px-2.5 py-1.5 rounded w-full outline-none focus:border-hud-green text-[11px] font-bold uppercase"
                    placeholder="Escriba el nombre de quien elabora..."
                  />
                </div>
                <div>
                  <label className="text-[9px] text-slate-400 font-bold block mb-1 uppercase tracking-wider">
                    Departamento / Autoriza (Firma Derecha):
                  </label>
                  <input 
                    type="text" 
                    value={autorizadoPor} 
                    onChange={e => setAutorizadoPor(e.target.value.toUpperCase())}
                    className="bg-slate-950 border border-slate-800 text-hud-green px-2.5 py-1.5 rounded w-full outline-none focus:border-hud-green text-[11px] font-bold uppercase"
                    placeholder="Escriba quien autoriza..."
                  />
                </div>
                <div>
                  <label className="text-[9px] text-amber-400 font-bold block mb-1 uppercase tracking-wider">
                    💰 Otros Gastos / Cargos Extras:
                  </label>
                  <div className="flex gap-1.5">
                    <input 
                      type="number" 
                      value={otrosGastosMonto || ''} 
                      onChange={e => handleUpdateOtrosGastos(parseFloat(e.target.value) || 0)}
                      className="bg-slate-950 border border-amber-500/50 text-amber-300 font-bold px-2 py-1.5 rounded w-28 outline-none focus:border-amber-400 text-[11px] font-mono"
                      placeholder="$ 0"
                    />
                    <input 
                      type="text" 
                      value={otrosGastosConcepto} 
                      onChange={e => handleUpdateOtrosGastosConcepto(e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-slate-300 px-2 py-1.5 rounded flex-grow outline-none text-[10px] font-mono"
                      placeholder="Concepto extra..."
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* On-screen preview container (scrollable and always styled as light theme white sheet) */}
            <div className="overflow-y-auto max-h-[55vh] p-1 bg-slate-950/50 rounded-lg">
              {renderVoucherContent(false)}
            </div>

            {/* Render print Portal copy at the root body so it does not suffer from root-container overflow clipping */}
            {createPortal(renderVoucherContent(true), document.body)}

            {/* Bottom Actions strictly styled */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-900">
              <button 
                onClick={() => setIsVoucherOpen(false)}
                className="bg-slate-950/80 hover:bg-slate-900 border border-slate-800 text-slate-300 text-xs px-5 py-2.5 rounded-lg font-bold font-mono tracking-wider transition-all uppercase cursor-pointer"
              >
                CANCELAR
              </button>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleSaveCurrentProvision()}
                  className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-mono font-bold tracking-wider px-4 py-2.5 text-xs rounded-lg cursor-pointer flex items-center gap-2 transition-all shadow-md hover:border-emerald-400"
                  title="Guardar este soporte en el registro histórico de provisión"
                >
                  <Save className="w-4 h-4 text-emerald-400" /> GUARDAR EN HISTORIAL
                </button>

                <button 
                  onClick={triggerPrintVoucher}
                  className="bg-[#00ffa3] hover:bg-[#00ffa3]/85 text-slate-950 font-black font-mono tracking-wider px-5 py-2.5 text-xs rounded-lg cursor-pointer flex items-center gap-2 shadow-lg transition-all"
                >
                  <Printer className="w-4 h-4" /> IMPRIMIR SOPORTE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HISTORIAL DE PROVISIONES GUARDADAS VIEW */}
      {mainTab === 'historial' && (
        <div className="space-y-4 animate-fade-in">
          {/* History Search & Filters bar */}
          <div className="bg-[#030610] p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="BUSCAR EN HISTORIAL..."
                  value={historySearchTerm}
                  onChange={e => setHistorySearchTerm(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-[11px] font-mono font-bold text-white pl-8 pr-3 py-1.5 rounded outline-none w-56 uppercase placeholder:text-slate-500 focus:border-hud-green"
                />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              </div>

              {/* Carrier Filter */}
              <select
                value={historyCarrierFilter}
                onChange={e => setHistoryCarrierFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-[11px] font-mono font-bold text-white px-3 py-1.5 rounded outline-none uppercase cursor-pointer"
              >
                <option value="">TODAS LAS TRANSPORTADORAS</option>
                {Array.from(new Set(savedProvisionRecords.map(r => r.transportadora))).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="text-xs font-mono text-slate-400">
              Registros Guardados: <strong className="text-hud-green">{filteredHistoryRecords.length}</strong>
            </div>
          </div>

          {/* Table of Saved Provisions */}
          <div className="bg-[#030610] border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                    <th className="p-4"># Soporte / ID</th>
                    <th className="p-4">Fecha Registro</th>
                    <th className="p-4">Transportadora</th>
                    <th className="p-4">Mes & Corte</th>
                    <th className="p-4 text-center">Fletes</th>
                    <th className="p-4 text-right">Subtotal</th>
                    <th className="p-4 text-right">Otros Gastos</th>
                    <th className="p-4 text-right">Total Neto</th>
                    <th className="p-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/80 text-slate-300">
                  {filteredHistoryRecords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-slate-500 font-mono text-xs">
                        <div className="flex flex-col items-center gap-2">
                          <FolderArchive className="w-8 h-8 text-slate-700" />
                          <span>No hay registros de provisiones guardadas en el historial.</span>
                          <button
                            onClick={() => setMainTab('auditoria')}
                            className="mt-2 text-hud-green hover:underline font-bold cursor-pointer"
                          >
                            Ir a Auditoría para generar y guardar una provisión →
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredHistoryRecords.map(record => (
                      <tr key={record.id} className="hover:bg-slate-900/50 transition-colors">
                        <td className="p-4">
                          <span className="font-bold text-hud-green block font-mono text-xs">{record.soporteNum}</span>
                          <span className="text-[10px] text-slate-500 block">ID: {record.id}</span>
                        </td>
                        <td className="p-4 text-slate-400 text-xs">
                          {record.fechaGuardado}
                        </td>
                        <td className="p-4 font-bold text-white uppercase text-xs">
                          {record.transportadora}
                        </td>
                        <td className="p-4 text-xs">
                          <span className="font-bold text-slate-200 block uppercase">{record.mesGestion}</span>
                          <span className="text-[10px] text-emerald-400 font-mono block">{record.quincenaLabel}</span>
                        </td>
                        <td className="p-4 text-center font-bold text-slate-300">
                          <span className="bg-slate-900 px-2 py-1 rounded border border-slate-800">
                            {record.cantidadOrdenes}
                          </span>
                        </td>
                        <td className="p-4 text-right font-bold text-slate-300">
                          $ {record.subtotalFletes.toLocaleString('es-CO')}
                        </td>
                        <td className="p-4 text-right font-mono">
                          {record.otrosGastosMonto > 0 ? (
                            <div>
                              <span className="font-bold text-amber-400">$ {record.otrosGastosMonto.toLocaleString('es-CO')}</span>
                              {record.otrosGastosConcepto && (
                                <span className="text-[9px] text-amber-500/80 block uppercase truncate max-w-[120px]" title={record.otrosGastosConcepto}>
                                  {record.otrosGastosConcepto}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600">$-</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <span className="font-black text-hud-green text-sm">
                            $ {record.totalPagar.toLocaleString('es-CO')}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Ver / Imprimir */}
                            <button
                              onClick={() => handleOpenSavedRecordVoucher(record)}
                              className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 p-1.5 rounded transition-all cursor-pointer border border-emerald-500/30"
                              title="Ver / Re-Imprimir Soporte"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {/* Excel */}
                            <button
                              onClick={() => handleExportSavedRecordExcel(record)}
                              className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 p-1.5 rounded transition-all cursor-pointer border border-sky-500/30"
                              title="Descargar Excel de esta provisión"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5" />
                            </button>

                            {/* Eliminar */}
                            <button
                              onClick={() => setDeletingRecordId(record.id)}
                              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 p-1.5 rounded transition-all cursor-pointer border border-rose-500/30"
                              title="Eliminar del historial"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {deletingRecordId && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[14000] flex items-center justify-center p-4">
          <div className="bg-[#030610] border border-rose-500/40 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400 border-b border-rose-500/20 pb-3">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-display font-extrabold uppercase tracking-wider">
                Confirmar Eliminación
              </h3>
            </div>
            <p className="text-xs font-mono text-slate-300 leading-relaxed">
              ¿Está seguro que desea eliminar este registro de provisión guardada del historial? Esta acción no se puede deshacer.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingRecordId(null)}
                className="bg-slate-900 border border-slate-800 text-slate-300 text-xs px-4 py-2 rounded font-bold uppercase cursor-pointer hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteSavedRecord(deletingRecordId)}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs px-4 py-2 rounded font-bold uppercase cursor-pointer flex items-center gap-1.5 shadow-lg transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" /> Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline individual edit modal */}
      {isEditModalOpen && editingOrder && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[13000] flex items-center justify-center p-4">
          <div className="bg-[#030610] border border-yellow-500/30 rounded-xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-yellow-500/20 pb-2">
              <h3 className="text-sm font-display font-extrabold text-yellow-500 tracking-wider uppercase flex items-center gap-2">
                <Pencil className="w-4 h-4 animate-pulse" /> Editar Provisión {editingOrder.id}
              </h3>
              <button 
                onClick={() => { setEditingOrder(null); setIsEditModalOpen(false); }} 
                className="text-slate-400 hover:text-white font-bold font-mono"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 font-sans">
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Cliente</label>
                <input 
                  type="text" 
                  value={editingOrder.cliente} 
                  disabled 
                  className="bg-slate-950/60 border border-slate-900 text-xs text-slate-500 rounded p-2.5 w-full cursor-not-allowed uppercase"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Socio Transportador</label>
                <input 
                  type="text" 
                  value={editingOrder.transportadora} 
                  disabled 
                  className="bg-slate-950/60 border border-slate-900 text-xs text-slate-500 rounded p-2.5 w-full cursor-not-allowed uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Costo Flete ($)</label>
                  <input 
                    type="number" 
                    value={editingOrder.flete} 
                    onChange={e => setEditingOrder({ ...editingOrder, flete: Number(e.target.value) })}
                    className="bg-slate-950 border border-slate-800 text-xs text-white rounded p-2.5 w-full outline-none focus:border-yellow-500/60 font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Factura Provisión (FP)</label>
                  <input 
                    type="text" 
                    placeholder="Ej: FP-1234"
                    value={editingOrder.provision || ''} 
                    onChange={e => setEditingOrder({ ...editingOrder, provision: e.target.value })}
                    className="bg-slate-950 border border-slate-800 text-xs text-hud-green rounded p-2.5 w-full outline-none focus:border-yellow-500/60 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[#00ffa3] font-bold uppercase block mb-1">Fecha Despacho (Salida)</label>
                  <input 
                    type="date" 
                    value={editingOrder.fechaSalida || ''} 
                    onChange={e => setEditingOrder({ ...editingOrder, fechaSalida: e.target.value })}
                    className="bg-slate-950 border border-slate-800 text-xs text-[#00ffa3] rounded p-2.5 w-full outline-none focus:border-yellow-500/60 font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Estado Despacho</label>
                  <select
                    value={editingOrder.estado}
                    onChange={e => setEditingOrder({ ...editingOrder, estado: e.target.value as any })}
                    className="bg-slate-950 border border-slate-800 text-xs text-white rounded p-2.5 w-full outline-none font-bold"
                  >
                    <option value="Despachado">DESPACHADO</option>
                    <option value="Entregado">ENTREGADO</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-900/60">
              <button 
                onClick={() => { setEditingOrder(null); setIsEditModalOpen(false); }}
                className="bg-slate-950 border border-slate-800 text-slate-300 text-xs px-4 py-2 rounded-lg font-bold hover:bg-slate-900"
              >
                CANCELAR
              </button>
              <button 
                onClick={() => {
                  onUpdateOrder(editingOrder);
                  setIsEditModalOpen(false);
                  setEditingOrder(null);
                }}
                className="bg-yellow-500 hover:bg-yellow-600 text-slate-950 text-xs px-5 py-2 rounded-lg font-mono font-black uppercase"
              >
                GUARDAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
