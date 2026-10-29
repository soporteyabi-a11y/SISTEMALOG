/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Menu, ShieldCheck, Home, ClipboardList, Clock, Truck, ShieldAlert, 
  Map, Users, DollarSign, Bell, Activity, Play, Plus, Search, 
  Download, FileSpreadsheet, Lock, RefreshCw, LogOut, Trash2, CheckCircle2, ChevronDown, ListPlus, Send,
  ChevronLeft, ChevronRight, Upload, AlertTriangle, Sliders, Calendar, ShoppingBag, Printer,
  LayoutGrid, List, Database
} from 'lucide-react';

import { Order, Carrier, Customer, Novedad, Reminder } from './types';
import { matchOrderSearch, normalizeText, sortOrdersBySearchRelevance, deduplicateOrders } from './utils/searchHelper';
import { SEED_CARRIERS, SEED_CUSTOMERS, SEED_ORDERS, SEED_NOVEDADES, SEED_REMINDERS } from './data/seed';
import * as XLSX from 'xlsx';
import { printSingleOrder } from './utils/printRequest';
import { generateAppStructurePdf } from './utils/generateAppStructurePdf';

import HomeModule from './components/HomeModule';
import OrdersModule from './components/OrdersModule';
import AnalyticsModule from './components/AnalyticsModule';
import NovedadesModule from './components/NovedadesModule';
import ProvisionesModule from './components/ProvisionesModule';
import DiferenciasModule from './components/DiferenciasModule';
import RemindersModule from './components/RemindersModule';
import VehiclesModule from './components/VehiclesModule';
import LiquidadorModule from './components/LiquidadorModule';
import CitasModule from './components/CitasModule';
import HorasModule from './components/HorasModule';
import PedidosModule from './components/PedidosModule';
import SyncQueueMonitorModal from './components/SyncQueueMonitorModal';
import { 
  enqueueSyncEvent, 
  processSyncQueue, 
  getSyncQueueStats 
} from './services/syncQueueService';
import { firebaseConfig } from './firebase';
import { 
  saveToCloud, 
  subscribeToCloud, 
  subscribeCloudStatus, 
  forceRefreshFromCloud,
  CloudStatusInfo,
  generateFullBackupObject, 
  restoreFullBackupObject 
} from './firebaseService';

// Safe LocalStorage wrapper to prevent SecurityErrors in sandboxed iframes or private modes
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn(`[Storage] localStorage is disabled or barred (key: ${key}):`, e);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[Storage] localStorage write failed (key: ${key}):`, e);
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[Storage] localStorage remove failed (key: ${key}):`, e);
    }
  }
};

// Default PIN for deletion or cancellation
const DELETION_PIN = "1234";

// Compression and decompression for Firestore limits prevention (1MB per document limit)
const compressOrderForCloud = (o: Order) => {
  const compressed: any = {};
  if (o.id) compressed.id = o.id;
  if (o.pv) compressed.pv = o.pv;
  if (o.oc) compressed.oc = o.oc;
  if (o.fechaIngreso) compressed.fi = o.fechaIngreso;
  if (o.fechaSalida) compressed.fs = o.fechaSalida;
  if (o.fechaEntrega) compressed.fe = o.fechaEntrega;
  if (o.fechaFactura) compressed.ff = o.fechaFactura;
  if (o.horaCita) compressed.hc = o.horaCita;
  if (o.cliente) compressed.cl = o.cliente;
  if (o.ciudad) compressed.ci = o.ciudad;
  if (o.origen && o.origen !== "ACOPI-YUMBO") compressed.or = o.origen;
  if (o.peso) compressed.pe = o.peso;
  if (o.cajas) compressed.ca = o.cajas;
  if (o.venta) compressed.ve = o.venta;
  if (o.factura) compressed.fa = o.factura;
  if (o.facturado) compressed.fct = o.facturado;
  if (o.cajasFact) compressed.cf = o.cajasFact;
  if (o.pesoFact) compressed.pf = o.pesoFact;
  if (o.flete) compressed.fl = o.flete;
  if (o.provision) compressed.pr = o.provision;
  if (o.transportadora) compressed.tr = o.transportadora;
  if (o.placa) compressed.pl = o.placa;
  if (o.conductor) compressed.co = o.conductor;
  if (o.celular) compressed.ce = o.celular;
  if (o.estado && o.estado !== "Pendiente") compressed.es = o.estado;
  if (o.obs) compressed.ob = o.obs;
  if (o.anuladoMotivo) compressed.am = o.anuladoMotivo;
  return compressed;
};

const normalizeEstado = (es: string, factura?: string, fechaSalida?: string): 'Pendiente' | 'En Cargue' | 'Despachado' | 'En Sitio / Bodega' | 'Entregado' | 'Anulado' => {
  const normalized = String(es || '').trim().toUpperCase();
  if (normalized === 'ANULADO' || normalized.includes('ANULADO')) return 'Anulado';
  if (normalized === 'EN CARGUE' || normalized.includes('CARGUE')) return 'En Cargue';
  if (normalized === 'PENDIENTE' || normalized.includes('PENDIENTE')) return 'Pendiente';
  if (normalized === 'DESPACHADO' || normalized.includes('DESPACHADO')) return 'Despachado';
  if (normalized === 'EN SITIO / BODEGA' || normalized.includes('BODEGA') || normalized.includes('SITIO')) return 'En Sitio / Bodega';
  if (normalized === 'ENTREGADO' || normalized.includes('ENTREGADO') || normalized.includes('FINALIZADO')) return 'Entregado';

  // If status is empty, but order has invoice or shipping date, promote to Despachado
  const hasFactura = factura && String(factura).trim() !== '' && String(factura).trim().toUpperCase() !== 'PENDIENTE';
  const hasSalida = fechaSalida && String(fechaSalida).trim() !== '';
  if (hasFactura || hasSalida) {
    return 'Despachado';
  }

  return 'Pendiente';
};

const normalizeCarrierName = (name: string): string => {
  const trUpper = String(name || '').trim().toUpperCase();
  if (trUpper === "FREDY HERNANDEZ (IND)" || (trUpper.includes("FREDY") && trUpper.includes("HERNANDEZ") && trUpper.includes("IND"))) {
    return "FREDY HERNANDEZ";
  }
  return String(name || '').trim();
};

const decompressOrderFromCloud = (c: any): Order => {
  const isFullObj = c.cliente !== undefined || c.fechaIngreso !== undefined;
  const rawEstado = isFullObj ? (c.estado || "Pendiente") : (c.es || "Pendiente");
  const factVal = isFullObj ? (c.factura || "") : (c.fa || "");
  const fechaSalVal = isFullObj ? (c.fechaSalida || "") : (c.fs || "");

  const finalEstado = normalizeEstado(rawEstado, factVal, fechaSalVal);

  if (isFullObj) {
    return {
      id: c.id || "",
      pv: c.pv || "",
      oc: c.oc || "",
      fechaIngreso: c.fechaIngreso || "",
      fechaSalida: c.fechaSalida || "",
      fechaEntrega: c.fechaEntrega || "",
      fechaFactura: c.fechaFactura || "",
      horaCita: c.horaCita || "",
      cliente: c.cliente || "",
      ciudad: c.ciudad || "",
      origen: c.origen || "ACOPI-YUMBO",
      peso: Number(c.peso) || 0,
      cajas: Number(c.cajas) || 0,
      venta: Number(c.venta) || 0,
      factura: c.factura || "",
      facturado: Number(c.facturado) || 0,
      cajasFact: Number(c.cajasFact) || 0,
      pesoFact: Number(c.pesoFact) || 0,
      flete: Number(c.flete) || 0,
      provision: c.provision || "",
      transportadora: normalizeCarrierName(c.transportadora || ""),
      placa: c.placa || "",
      conductor: c.conductor || "",
      celular: c.celular || "",
      estado: finalEstado,
      obs: c.obs || "",
      anuladoMotivo: c.anuladoMotivo || ""
    };
  }
  return {
    id: c.id || "",
    pv: c.pv || "",
    oc: c.oc || "",
    fechaIngreso: c.fi || "",
    fechaSalida: c.fs || "",
    fechaEntrega: c.fe || "",
    fechaFactura: c.ff || "",
    horaCita: c.hc || "",
    cliente: c.cl || "",
    ciudad: c.ci || "",
    origen: c.or || "ACOPI-YUMBO",
    peso: Number(c.pe) || 0,
    cajas: Number(c.ca) || 0,
    venta: Number(c.ve) || 0,
    factura: c.fa || "",
    facturado: Number(c.fct) || 0,
    cajasFact: Number(c.cf) || 0,
    pesoFact: Number(c.pf) || 0,
    flete: Number(c.fl) || 0,
    provision: c.pr || "",
    transportadora: normalizeCarrierName(c.tr || ""),
    placa: c.pl || "",
    conductor: c.co || "",
    celular: c.ce || "",
    estado: finalEstado,
    obs: c.ob || "",
    anuladoMotivo: c.am || ""
  };
};

const ensureUniqueCarrierIds = (list: Carrier[]): Carrier[] => {
  const seen = new Set<string>();
  return list.map((item, index) => {
    let id = item.id;
    if (!id || seen.has(id)) {
      id = `CARR-${index + 1}-${Date.now().toString(36)}`;
    }
    seen.add(id);
    return { ...item, id };
  });
};

const getNextCarrierId = (existingCarriers: Carrier[]): string => {
  let maxNum = 0;
  for (const c of existingCarriers) {
    if (c.id) {
      const m = c.id.match(/^CARR-(\d+)$/i);
      if (m) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }
  const nextNum = maxNum + 1;
  const formattedNum = nextNum < 10 ? `0${nextNum}` : `${nextNum}`;
  let candidate = `CARR-${formattedNum}`;
  let extraCounter = 1;
  while (existingCarriers.some(c => c.id === candidate)) {
    candidate = `CARR-${formattedNum}-${extraCounter}`;
    extraCounter++;
  }
  return candidate;
};

const ensureUniqueCustomerIds = (list: Customer[]): Customer[] => {
  const seen = new Set<string>();
  return list.map((item, index) => {
    let id = item.id;
    if (!id || seen.has(id)) {
      id = `CUST-${10 + index + 1}-${Date.now().toString(36)}`;
    }
    seen.add(id);
    return { ...item, id };
  });
};

const getNextCustomerId = (existingCustomers: Customer[]): string => {
  let maxNum = 0;
  for (const c of existingCustomers) {
    if (c.id) {
      const m = c.id.match(/^CUST-(\d+)$/i);
      if (m) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  }
  const nextNum = Math.max(10, maxNum) + 1;
  let candidate = `CUST-${nextNum}`;
  let extraCounter = 1;
  while (existingCustomers.some(c => c.id === candidate)) {
    candidate = `CUST-${nextNum}-${extraCounter}`;
    extraCounter++;
  }
  return candidate;
};

export default function App() {
  const isEmployeeMode = typeof window !== 'undefined' && (
    window.location.search.includes('tab=pedidoEmpleados') ||
    window.location.search.includes('modulo=pedidos') ||
    window.location.search.includes('modulo=empleados') ||
    window.location.search.includes('seccion=pedidos') ||
    window.location.search.includes('seccion=empleados')
  );

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return safeLocalStorage.getItem('erp_authenticated') === 'true';
  });
  const [loginEmail, setLoginEmail] = useState('soporteyabi@gmail.com');
  const [loginPass, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Primary Collections
  const [orders, setOrders] = useState<Order[]>([]);
  const [deletedOrderIds, setDeletedOrderIds] = useState<Record<string, { physical: boolean; motivo?: string }>>(() => {
    const raw = safeLocalStorage.getItem('lp_deleted_orders');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        return {};
      }
    }
    return {};
  });
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  // Navigation state
  const [activeTab, setActiveTab] = useState<string>(() => {
    const isEmployee = typeof window !== 'undefined' && (
      window.location.search.includes('tab=pedidoEmpleados') ||
      window.location.search.includes('modulo=pedidos') ||
      window.location.search.includes('modulo=empleados') ||
      window.location.search.includes('seccion=pedidos') ||
      window.location.search.includes('seccion=empleados')
    );
    return isEmployee ? 'pedidoEmpleados' : 'inicio';
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Sidebar Category Expansion state
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>(() => {
    return {
      operativos: false,
      entidades: false,
      control: false,
      inteligencia: false,
    };
  });

  // Global PDF parsing states for "Cargar PDF" universal uploader
  const [isPdfParsing, setIsPdfParsing] = useState<boolean>(false);
  const [useAi, setUseAi] = useState<boolean>(false);
  const [pdfParsingError, setPdfParsingError] = useState<string | null>(null);
  const [parsedPdfData, setParsedPdfData] = useState<any | null>(null);
  const [pdfSelectedMatchOrderId, setPdfSelectedMatchOrderId] = useState<string>('');
  const [pSuccessToast, setPSuccessToast] = useState<{ title: string; message: string } | null>(null);
  const pdfFileInputRef = useRef<HTMLInputElement>(null);

  // Backup & Hybrid Data System states
  const [cloudStatus, setCloudStatusState] = useState<CloudStatusInfo>({ 
    connected: true, 
    isSyncedWithServer: false,
    lastServerSyncTime: null,
    errorCount: 0,
    isFromCache: false,
    projectId: firebaseConfig.projectId || 'gen-lang-client-0902545089',
    databaseId: firebaseConfig.firestoreDatabaseId || 'ai-studio-7257e416-c916-4773-80bd-ca9334204e28',
    lastError: null
  });

  const handleSwitchDatabase = (targetDbId: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('override_firestore_db_id', targetDbId);
      window.location.reload();
    }
  };
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isSyncMonitorOpen, setIsSyncMonitorOpen] = useState(false);
  const [syncStats, setSyncStats] = useState(getSyncQueueStats());
  const [backupRestoreMessage, setBackupRestoreMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  const handleForceCloudSync = async () => {
    try {
      setBackupRestoreMessage({ type: 'success', text: 'Conectando directamente al servidor de Firestore...' });
      const freshOrders = await forceRefreshFromCloud('app_state', 'orders');
      if (Array.isArray(freshOrders)) {
        const decompressed = freshOrders.map(decompressOrderFromCloud);
        const { cleanedList } = deduplicateOrders(decompressed);
        setOrders(cleanedList);
        safeLocalStorage.setItem('lp_orders', JSON.stringify(cleanedList));
      }
      await forceRefreshFromCloud('app_state', 'carriers');
      await forceRefreshFromCloud('app_state', 'customers');
      await forceRefreshFromCloud('app_state', 'novedades');
      await forceRefreshFromCloud('app_state', 'deleted_orders');
      setBackupRestoreMessage({ 
        type: 'success', 
        text: '¡Sincronización completa con el servidor finalizada con éxito! Todos los fletes y datos actualizados.' 
      });
    } catch (err: any) {
      setBackupRestoreMessage({ 
        type: 'error', 
        text: `Error al forzar la sincronización: ${err?.message || err}` 
      });
    }
  };

  const handlePushLocalToCloud = async () => {
    try {
      setBackupRestoreMessage({ type: 'success', text: 'Subiendo todos los fletes y catálogos locales a Firestore...' });
      const compressed = orders.map(compressOrderForCloud);
      await saveToCloud('app_state', 'orders', compressed, 'soporteyabi@gmail.com', true);
      await saveToCloud('app_state', 'carriers', carriers, 'soporteyabi@gmail.com', true);
      await saveToCloud('app_state', 'customers', customers, 'soporteyabi@gmail.com', true);
      await saveToCloud('app_state', 'novedades', novedades, 'soporteyabi@gmail.com', true);
      await saveToCloud('app_state', 'reminders', reminders, 'soporteyabi@gmail.com', true);
      setBackupRestoreMessage({
        type: 'success',
        text: '¡Publicación exitosa! Todos los datos de este PC han sido subidos a la Nube Firestore. Los demás PCs se actualizarán de inmediato.'
      });
    } catch (err: any) {
      setBackupRestoreMessage({
        type: 'error',
        text: `Error al publicar a la nube: ${err?.message || err}`
      });
    }
  };

  useEffect(() => {
    const unsubStatus = subscribeCloudStatus(status => {
      setCloudStatusState(status);
    });

    // Background sync queue processor running every 15 seconds
    const interval = setInterval(() => {
      processSyncQueue();
      setSyncStats(getSyncQueueStats());
    }, 15000);

    const handleSyncUpdate = () => {
      setSyncStats(getSyncQueueStats());
    };
    window.addEventListener('SYNC_QUEUE_UPDATED', handleSyncUpdate);

    return () => {
      unsubStatus();
      clearInterval(interval);
      window.removeEventListener('SYNC_QUEUE_UPDATED', handleSyncUpdate);
    };
  }, []);

  // Search & Filtering inside custom sub-tabs in App
  const [despachadoSearch, setDespachadoSearch] = useState('');
  const [despachadoFilterCliente, setDespachadoFilterCliente] = useState('');
  const [despachadoFilterCarrier, setDespachadoFilterCarrier] = useState('');
  const [despachadoFilterFactura, setDespachadoFilterFactura] = useState('');
  const [despachadoFilterPv, setDespachadoFilterPv] = useState('');
  const [despachadoFilterMes, setDespachadoFilterMes] = useState('');
  const [despachadoPage, setDespachadoPage] = useState(1);
  const [despachadoItemsPerPage, setDespachadoItemsPerPage] = useState(15);
  const [pendienteSearch, setPendienteSearch] = useState('');
  const [pendientePage, setPendientePage] = useState(1);
  const [customerSearch, setCustomerSearch] = useState('');
  const [orderFormClientSearch, setOrderFormClientSearch] = useState('');
  const [carrierPage, setCarrierPage] = useState(1);
  const [customerPage, setCustomerPage] = useState(1);
  const [customerViewMode, setCustomerViewMode] = useState<'grid' | 'table'>('grid');

  // Reset page when search term or itemsPerPage changes
  useEffect(() => {
    setDespachadoPage(1);
  }, [
    despachadoSearch,
    despachadoFilterCliente,
    despachadoFilterCarrier,
    despachadoFilterFactura,
    despachadoFilterPv,
    despachadoFilterMes,
    despachadoItemsPerPage
  ]);

  useEffect(() => {
    setPendientePage(1);
  }, [pendienteSearch]);

  useEffect(() => {
    setCustomerPage(1);
  }, [customerSearch]);

  // Modals management
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isOrderFormOpen, setIsOrderFormOpen] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [editingCarrierId, setEditingCarrierId] = useState<string | null>(null);

  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Custom entity Creation states
  const [isCarrierFormOpen, setIsCarrierFormOpen] = useState(false);
  const [isCustomerFormOpen, setIsCustomerFormOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);
  const [carrierToDelete, setCarrierToDelete] = useState<string | null>(null);

  // Cancellation Audit PIN Modal
  const [auditTargetId, setAuditTargetId] = useState<string | null>(null);
  const [auditPinInput, setAuditPinInput] = useState('');
  const [auditMotivo, setAuditMotivo] = useState('');
  const [auditError, setAuditError] = useState('');
  const [auditPhysical, setAuditPhysical] = useState(false);

  // Pre-populate data securely on first mount from Firebase (with localStorage or seed fallback)
  useEffect(() => {
    // 1. Fast offline local initialization
    const rawDeleted = safeLocalStorage.getItem('lp_deleted_orders');
    let initialDeleted: Record<string, { physical: boolean; motivo?: string }> = {};
    if (rawDeleted) {
      try {
        initialDeleted = JSON.parse(rawDeleted);
      } catch (e) {
        console.warn(e);
      }
    }

    const rawOrders = safeLocalStorage.getItem('lp_orders');
    const rawCarriers = safeLocalStorage.getItem('lp_carriers');
    const rawCustomers = safeLocalStorage.getItem('lp_customers');
    const rawNovedades = safeLocalStorage.getItem('lp_novedades');
    const rawReminders = safeLocalStorage.getItem('lp_reminders');

    let initialOrders = SEED_ORDERS;
    if (rawOrders) {
      try {
        const parsed = JSON.parse(rawOrders);
        if (Array.isArray(parsed)) {
          initialOrders = parsed.map((o: any) => ({
            ...o,
            estado: normalizeEstado(o.estado || "Pendiente")
          }));
        }
      } catch (e) {
        console.warn('Failing parsing orders:', e);
      }
    }

    // Filter/apply tombstones immediately to initialOrders
    if (Object.keys(initialDeleted).length > 0) {
      initialOrders = initialOrders.map((o: any) => {
        const delObj = initialDeleted[o.id];
        if (delObj) {
          if (delObj.physical) return null;
          return { ...o, estado: 'Anulado' as const, anuladoMotivo: delObj.motivo || '' };
        }
        return o;
      }).filter(Boolean) as Order[];
    }

    const migratedInitialOrders = initialOrders.map((o: any) => {
      const updated = o.cliente === 'DISTRIBUIDORA EL VALLE EXPRESS' ? { ...o, cliente: 'INVERSIONES LA VAQUITA EXPRESS' } : o;
      return {
        ...updated,
        estado: normalizeEstado(updated.estado || "Pendiente")
      };
    });
    setOrders(migratedInitialOrders);

    const parseJSONSafely = (str: string | null, fallback: any) => {
      if (!str) return fallback;
      try {
        return JSON.parse(str);
      } catch (e) {
        return fallback;
      }
    };

    const initialCarriers = ensureUniqueCarrierIds(parseJSONSafely(rawCarriers, SEED_CARRIERS));
    setCarriers(initialCarriers);

    const initialCustomers = parseJSONSafely(rawCustomers, SEED_CUSTOMERS);
    const migratedInitialCustomers = ensureUniqueCustomerIds(initialCustomers.map((c: any) => c.nombre === 'DISTRIBUIDORA EL VALLE EXPRESS' ? { ...c, nombre: 'INVERSIONES LA VAQUITA EXPRESS' } : c));
    setCustomers(migratedInitialCustomers);

    const initialNovedades = parseJSONSafely(rawNovedades, SEED_NOVEDADES);
    setNovedades(initialNovedades);

    const initialReminders = parseJSONSafely(rawReminders, SEED_REMINDERS);
    setReminders(initialReminders);

    // 2. Subscribe to real-time updates from Firebase Firestore for multi-user collaboration
    const unsubDeleted = subscribeToCloud('app_state', 'deleted_orders', (data) => {
      if (data && typeof data === 'object') {
        setDeletedOrderIds(data);
        safeLocalStorage.setItem('lp_deleted_orders', JSON.stringify(data));
        // Filter orders in real-time
        setOrders(prevOrders => {
          return prevOrders.map(o => {
            const delObj = data[o.id];
            if (delObj) {
              if (delObj.physical) return null;
              return { ...o, estado: 'Anulado' as const, anuladoMotivo: delObj.motivo || '' };
            }
            return o;
          }).filter(Boolean) as Order[];
        });
      }
    });

    const unsubOrders = subscribeToCloud('app_state', 'orders', (data) => {
      if (Array.isArray(data)) {
        // Decompress the orders list retrieved from the cloud
        const decompressed = data.map(decompressOrderFromCloud);

        // Load latest deleted map
        const rawDel = safeLocalStorage.getItem('lp_deleted_orders');
        let delMap: Record<string, { physical: boolean; motivo?: string }> = {};
        if (rawDel) {
          try { delMap = JSON.parse(rawDel); } catch (e) {}
        }

        let cleaned = decompressed.map((o: any) => o.cliente === 'DISTRIBUIDORA EL VALLE EXPRESS' ? { ...o, cliente: 'INVERSIONES LA VAQUITA EXPRESS' } : o);
        if (Object.keys(delMap).length > 0) {
          cleaned = cleaned.map(o => {
            const delObj = delMap[o.id];
            if (delObj) {
              if (delObj.physical) return null;
              return { ...o, estado: 'Anulado' as const, anuladoMotivo: delObj.motivo || '' };
            }
            return o;
          }).filter(Boolean) as Order[];
        }

        // If cloud returned empty, check local storage or seed orders as fallback
        let targetList = cleaned;
        if (targetList.length === 0) {
          const rawLocal = safeLocalStorage.getItem('lp_orders');
          if (rawLocal) {
            try {
              const parsed = JSON.parse(rawLocal);
              if (Array.isArray(parsed) && parsed.length > 0) {
                targetList = parsed;
                // Sync initial local orders to cloud if cloud was empty
                const compressed = targetList.map(compressOrderForCloud);
                saveToCloud('app_state', 'orders', compressed);
              }
            } catch (e) {}
          }
          if (targetList.length === 0) {
            targetList = SEED_ORDERS;
          }
        }

        const { cleanedList } = deduplicateOrders(targetList);

        setOrders(cleanedList);
        safeLocalStorage.setItem('lp_orders', JSON.stringify(cleanedList));
      }
    });

    const unsubCarriers = subscribeToCloud('app_state', 'carriers', (data) => {
      if (Array.isArray(data)) {
        const sanitized = ensureUniqueCarrierIds(data);
        setCarriers(sanitized);
        safeLocalStorage.setItem('lp_carriers', JSON.stringify(sanitized));
      }
    });

    const unsubCustomers = subscribeToCloud('app_state', 'customers', (data) => {
      if (Array.isArray(data)) {
        const migrated = data.map((c: any) => c.nombre === 'DISTRIBUIDORA EL VALLE EXPRESS' ? { ...c, nombre: 'INVERSIONES LA VAQUITA EXPRESS' } : c);
        const sanitized = ensureUniqueCustomerIds(migrated);
        setCustomers(sanitized);
        safeLocalStorage.setItem('lp_customers', JSON.stringify(sanitized));
      }
    });

    const unsubNovedades = subscribeToCloud('app_state', 'novedades', (data) => {
      if (Array.isArray(data)) {
        setNovedades(data);
        safeLocalStorage.setItem('lp_novedades', JSON.stringify(data));
      }
    });

    const unsubReminders = subscribeToCloud('app_state', 'reminders', (data) => {
      if (Array.isArray(data)) {
        setReminders(data);
        safeLocalStorage.setItem('lp_reminders', JSON.stringify(data));
      }
    });

    return () => {
      unsubDeleted();
      unsubOrders();
      unsubCarriers();
      unsubCustomers();
      unsubNovedades();
      unsubReminders();
    };
  }, []);

  // Save changes wrapper
  const saveDeletedOrders = (updated: Record<string, { physical: boolean; motivo?: string }>) => {
    setDeletedOrderIds(updated);
    safeLocalStorage.setItem('lp_deleted_orders', JSON.stringify(updated));
    saveToCloud('app_state', 'deleted_orders', updated);
  };

  const saveOrders = (updated: Order[]) => {
    setOrders(updated);
    safeLocalStorage.setItem('lp_orders', JSON.stringify(updated));
    const compressed = updated.map(compressOrderForCloud);
    saveToCloud('app_state', 'orders', compressed);
  };
  const saveCarriers = (updated: Carrier[]) => {
    const sanitized = ensureUniqueCarrierIds(updated);
    setCarriers(sanitized);
    safeLocalStorage.setItem('lp_carriers', JSON.stringify(sanitized));
    saveToCloud('app_state', 'carriers', sanitized);
  };
  const saveCustomers = (updated: Customer[]) => {
    const sanitized = ensureUniqueCustomerIds(updated);
    setCustomers(sanitized);
    safeLocalStorage.setItem('lp_customers', JSON.stringify(sanitized));
    saveToCloud('app_state', 'customers', sanitized);
  };
  const saveNovedades = (updated: Novedad[]) => {
    setNovedades(updated);
    safeLocalStorage.setItem('lp_novedades', JSON.stringify(updated));
    saveToCloud('app_state', 'novedades', updated);
  };
  const saveReminders = (updated: Reminder[]) => {
    setReminders(updated);
    safeLocalStorage.setItem('lp_reminders', JSON.stringify(updated));
    saveToCloud('app_state', 'reminders', updated);
  };

  // Auth Submit Action
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = loginEmail.trim().toLowerCase();
    const authorized = [
      'soporteyabi@gmail.com',
      'auxiliarlogistico@sistemalog.com.co',
      'logistica@sistemalog.com.co',
      'auxiliarlogistico@latinproducts.com.co',
      'logistica@latinproducts.com.co'
    ];
    
    if (authorized.includes(cleanEmail) || cleanEmail.endsWith('@sistemalog.com.co') || cleanEmail.endsWith('@latinproducts.com.co') || (cleanEmail.includes('@') && cleanEmail.includes('.'))) {
      setIsAuthenticated(true);
      safeLocalStorage.setItem('erp_authenticated', 'true');
      setAuthError('');
    } else {
      setAuthError('🔑 Identificación de usuario no autorizada para el portal ejecutivo.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    safeLocalStorage.removeItem('erp_authenticated');
  };

  // Helper to calculate flete based on carrier configuration or legacy rules
  const calculateCarrierFlete = (
    carrierName: string | undefined | null,
    orderVal: number,
    orderBoxes: number,
    carriersList: Carrier[],
    clientName?: string | undefined | null
  ): number => {
    if (!carrierName) return 0;
    
    const upperCarrier = carrierName.toUpperCase();
    const isFredy = upperCarrier.includes("FREDY") && (upperCarrier.includes("HERNANDEZ") || upperCarrier.includes("HERNÁNDEZ"));
    const isMercapava = clientName && clientName.toUpperCase().includes("MERCAPAVA");

    if (isFredy) {
      if (isMercapava) {
        // Mercapava has a negotiated rate of $550 pesos per box, keeping 3.5% percentage formula
        return Math.round((orderVal * 0.035) + (orderBoxes * 550));
      }
      // Check if Fredy has a registered custom setting in the list
      const matched = carriersList.find(c => c.nombre.trim().toUpperCase() === carrierName.trim().toUpperCase());
      if (matched) {
        if (matched.tipoCalculo === 'formula') {
          const pct = matched.porcentajeValor || 0;
          const flatCaja = matched.costoCaja || 0;
          return Math.round((orderVal * (pct / 100)) + (orderBoxes * flatCaja));
        } else {
          return matched.costoSugerido || 0;
        }
      }
      // Default fallback for Fredy: 3.5% + $400/box
      return Math.round((orderVal * 0.035) + (orderBoxes * 400));
    }

    // Find matching carrier in settings
    const matched = carriersList.find(c => c.nombre.trim().toUpperCase() === carrierName.trim().toUpperCase());
    
    if (matched) {
      if (matched.tipoCalculo === 'formula') {
        const pct = matched.porcentajeValor || 0;
        const flatCaja = matched.costoCaja || 0;
        return Math.round((orderVal * (pct / 100)) + (orderBoxes * flatCaja));
      } else {
        return matched.costoSugerido || 0;
      }
    }
    
    return 0;
  };

  // Order CRUD
  const fillBillingDefaults = (o: Order): Order => {
    const oUpper: Order = { ...o };
    Object.keys(oUpper).forEach((k) => {
      const key = k as keyof Order;
      if (typeof oUpper[key] === 'string' && key !== 'id' && key !== 'estado') {
        (oUpper as any)[key] = (oUpper[key] as string).toUpperCase();
      }
    });

    const requiresBilling = ['Despachado', 'En Sitio / Bodega', 'Entregado', 'Finalizado'].includes(oUpper.estado);
    if (requiresBilling) {
      let finalFacturado = oUpper.facturado;
      const numFactura = Number(String(oUpper.factura).replace(/[^0-9]/g, ''));
      if (
        !finalFacturado ||
        finalFacturado === numFactura ||
        (finalFacturado > 0 && finalFacturado < 100000 && oUpper.venta > 100000)
      ) {
        finalFacturado = oUpper.venta;
      }
      return {
        ...oUpper,
        cajasFact: oUpper.cajasFact && oUpper.cajasFact > 0 ? oUpper.cajasFact : oUpper.cajas,
        pesoFact: oUpper.pesoFact && oUpper.pesoFact > 0 ? oUpper.pesoFact : oUpper.peso,
        facturado: finalFacturado,
      };
    }
    return oUpper;
  };

  const handleAddOrder = (newOrder: Order): Order => {
    const filled = fillBillingDefaults(newOrder);
    const cleanPv = filled.pv ? filled.pv.trim().toLowerCase() : '';
    const cleanFact = filled.factura ? filled.factura.trim().toLowerCase() : '';

    // Search existing order by ID, PV or Factura (ignoring Anulados)
    const idx = orders.findIndex(o => 
      (o.id && filled.id && o.id === filled.id) ||
      (cleanPv && o.pv && o.pv.trim().toLowerCase() === cleanPv && o.estado !== 'Anulado') ||
      (cleanFact && o.factura && o.factura.trim().toLowerCase() === cleanFact && o.estado !== 'Anulado')
    );

    if (idx !== -1) {
      const updated = [...orders];
      const merged = {
        ...updated[idx],
        ...filled,
        id: updated[idx].id // Preserve ID
      };
      updated[idx] = merged;
      saveOrders(updated);

      // Enqueue Sync Event for updated order
      enqueueSyncEvent({
        idempotencyKey: `ORDER_SYNC_${merged.id}_${merged.estado}`,
        eventType: 'ORDER_STATUS_CHANGED',
        sourceModule: 'Despacho',
        targetModule: 'Todos',
        recordId: merged.id,
        payload: merged
      });

      setPSuccessToast({
        title: "ORDEN ACTUALIZADA SIN DUPLICAR",
        message: `La orden ${updated[idx].id} (PV: ${filled.pv || updated[idx].pv}) ya existía y fue actualizada con los nuevos datos.`
      });
      setTimeout(() => setPSuccessToast(null), 5000);
      if (editingOrder && (editingOrder.id === merged.id || editingOrder.pv === merged.pv)) {
        setEditingOrder(null);
        setIsOrderFormOpen(false);
      }
      return merged;
    }
    const updated = [filled, ...orders];
    saveOrders(updated);

    // Enqueue Sync Event for new order
    enqueueSyncEvent({
      idempotencyKey: `ORDER_SYNC_${filled.id}_${filled.estado}`,
      eventType: 'ORDER_STATUS_CHANGED',
      sourceModule: 'Despacho',
      targetModule: 'Todos',
      recordId: filled.id,
      payload: filled
    });

    setPSuccessToast({
      title: "ORDEN CREADA CON ÉXITO",
      message: `La nueva orden ${filled.id} (PV: ${filled.pv || 'S/N'}) para ${filled.cliente} ha sido guardada en el sistema.`
    });
    setTimeout(() => setPSuccessToast(null), 5000);
    if (editingOrder && (editingOrder.id === filled.id || editingOrder.pv === filled.pv)) {
      setEditingOrder(null);
      setIsOrderFormOpen(false);
    }
    return filled;
  };

  const handleAddOrders = (newOrders: Order[]) => {
    const filled = newOrders.map(fillBillingDefaults);
    
    // Lookups for existing orders by ID, clean PV, and clean Factura
    const existingById: Record<string, Order> = {};
    const existingByPv: Record<string, Order> = {};
    const existingByFactura: Record<string, Order> = {};

    orders.forEach(o => {
      if (o.id) existingById[o.id] = o;
      if (o.pv && o.pv.trim() && o.estado !== 'Anulado') {
        existingByPv[o.pv.trim().toLowerCase()] = o;
      }
      if (o.factura && o.factura.trim() && o.estado !== 'Anulado') {
        existingByFactura[o.factura.trim().toLowerCase()] = o;
      }
    });

    const currentOrders = [...orders];
    let addedCount = 0;
    let updatedCount = 0;

    filled.forEach(newO => {
      const cleanPv = newO.pv ? newO.pv.trim().toLowerCase() : '';
      const cleanFactura = newO.factura ? newO.factura.trim().toLowerCase() : '';

      // Match in order: ID -> PV -> Factura
      const matchedOrder = (newO.id && existingById[newO.id]) ||
                           (cleanPv && existingByPv[cleanPv]) ||
                           (cleanFactura && existingByFactura[cleanFactura]);

      if (matchedOrder) {
        // Update existing order safely without creating a duplicate row
        const targetIdx = currentOrders.findIndex(o => o.id === matchedOrder.id);
        if (targetIdx !== -1) {
          const merged: Order = {
            ...currentOrders[targetIdx],
            pv: newO.pv || currentOrders[targetIdx].pv,
            oc: newO.oc || currentOrders[targetIdx].oc,
            cliente: newO.cliente || currentOrders[targetIdx].cliente,
            ciudad: newO.ciudad || currentOrders[targetIdx].ciudad,
            cajas: newO.cajas || currentOrders[targetIdx].cajas,
            peso: newO.peso || currentOrders[targetIdx].peso,
            venta: newO.venta || currentOrders[targetIdx].venta,
            factura: newO.factura || currentOrders[targetIdx].factura,
            flete: newO.flete || currentOrders[targetIdx].flete,
            transportadora: newO.transportadora || currentOrders[targetIdx].transportadora,
            fechaIngreso: newO.fechaIngreso || currentOrders[targetIdx].fechaIngreso,
            fechaFactura: newO.fechaFactura || currentOrders[targetIdx].fechaFactura,
            fechaSalida: newO.fechaSalida || currentOrders[targetIdx].fechaSalida,
            estado: newO.fechaFactura ? "Despachado" : currentOrders[targetIdx].estado,
          };
          currentOrders[targetIdx] = merged;
          updatedCount++;
        }
      } else {
        // Create new record
        currentOrders.unshift(newO);
        addedCount++;
        // Update lookup maps for intra-batch duplicate prevention
        if (newO.id) existingById[newO.id] = newO;
        if (cleanPv) existingByPv[cleanPv] = newO;
        if (cleanFactura) existingByFactura[cleanFactura] = newO;
      }
    });

    const { cleanedList, removedCount } = deduplicateOrders(currentOrders);

    saveOrders(cleanedList);
    setOrders(cleanedList);

    // Enqueue sync events for batch items
    filled.forEach(item => {
      enqueueSyncEvent({
        idempotencyKey: `ORDER_SYNC_${item.id}_${item.estado}`,
        eventType: 'BATCH_IMPORT_SYNC',
        sourceModule: 'Despacho',
        targetModule: 'Todos',
        recordId: item.id,
        payload: item
      });
    });

    setPSuccessToast({
      title: "PROCESADO Y DEPURADO SIN DUPLICADOS",
      message: `Se agregaron ${addedCount} órdenes nuevas, se actualizaron ${updatedCount} existentes y se unificaron ${removedCount} duplicados.`
    });
    setTimeout(() => setPSuccessToast(null), 5000);
  };

  const handleUpdateOrder = (updatedOrder: Order) => {
    const filled = fillBillingDefaults(updatedOrder);
    const matchFn = (o: Order) => o.id === filled.id;

    const exists = orders.some(matchFn);
    let updated: Order[];
    if (exists) {
      updated = orders.map(o => matchFn(o) ? { ...o, ...filled, id: o.id } : o);
    } else {
      updated = [filled, ...orders];
    }
    saveOrders(updated);

    // Enqueue sync event
    enqueueSyncEvent({
      idempotencyKey: `ORDER_SYNC_${filled.id}_${filled.estado}`,
      eventType: 'ORDER_STATUS_CHANGED',
      sourceModule: 'Despacho',
      targetModule: 'Todos',
      recordId: filled.id,
      payload: filled
    });

    setPSuccessToast({
      title: "CAMBIOS GUARDADOS",
      message: `La orden ${filled.id} (PV: ${filled.pv || 'S/N'}) se actualizó correctamente.`
    });
    setTimeout(() => setPSuccessToast(null), 5000);
    if (editingOrder && (editingOrder.id === filled.id || editingOrder.pv === filled.pv)) {
      setEditingOrder(null);
      setIsOrderFormOpen(false);
    }
  };

  const handleUpdateOrders = (updatedOrdersList: Order[]) => {
    const filled = updatedOrdersList.map(fillBillingDefaults);
    const updated = orders.map(o => {
      const match = filled.find(f => 
        f.id === o.id || 
        (!f.isSplit && !o.isSplit && f.pv && o.pv && f.pv.toString().trim().toLowerCase() === o.pv.toString().trim().toLowerCase())
      );
      return match ? { ...o, ...match, id: o.id } : o;
    });
    saveOrders(updated);
    setPSuccessToast({
      title: "CAMBIOS GUARDADOS",
      message: `Se actualizaron correctamente ${filled.length} órdenes del lote.`
    });
    setTimeout(() => setPSuccessToast(null), 5000);
  };

  const triggerAuditCancellation = (id: string) => {
    setAuditTargetId(id);
    setAuditPinInput('');
    setAuditMotivo('');
    setAuditError('');
    setAuditPhysical(false);
  };

  const handleConfirmCancellation = () => {
    if (auditPinInput !== DELETION_PIN) {
      setAuditError('❌ PIN de autorización inválido. Remítase al administrador.');
      return;
    }
    if (!auditPhysical && !auditMotivo.trim()) {
      setAuditError('❌ El motivo de anulación es de carácter contractual y obligatorio.');
      return;
    }

    if (auditTargetId) {
      const success = onDeleteOrder(auditTargetId, auditPinInput, auditMotivo.trim(), auditPhysical);
      if (success) {
        setAuditTargetId(null);
      } else {
        setAuditError('❌ PIN de autorización inválido.');
      }
    }
  };

  const onDeleteOrder = (id: string, pin: string, motivo: string, physical?: boolean): boolean => {
    if (pin !== DELETION_PIN) {
      return false;
    }

    const updatedDeleted = {
      ...deletedOrderIds,
      [id]: { physical: !!physical, motivo }
    };
    saveDeletedOrders(updatedDeleted);

    let updated;
    if (physical) {
      updated = orders.filter(o => o.id !== id);
    } else {
      updated = orders.map(o => o.id === id ? { ...o, estado: 'Anulado' as const, anuladoMotivo: motivo } : o);
    }
    saveOrders(updated);
    return true;
  };

  const handleDeleteImportedOrders = () => {
    const updated = orders.filter(o => {
      const obsLower = o.obs?.toLowerCase() || '';
      const isImported = obsLower.includes("importado") || 
                         o.id.startsWith("SOL-2") || 
                         o.id.startsWith("SOL-3") || 
                         o.id.startsWith("SOL-4");
      return !isImported;
    });
    saveOrders(updated);
  };

  const handleManualDeduplicate = () => {
    const { cleanedList, removedCount } = deduplicateOrders(orders);
    saveOrders(cleanedList);
    setOrders(cleanedList);
    if (removedCount > 0) {
      setPSuccessToast({
        title: "DEPURACIÓN COMPLETADA",
        message: `Se unificaron y limpiaron con éxito ${removedCount} registros duplicados.`
      });
    } else {
      setPSuccessToast({
        title: "SIN DUPLICADOS",
        message: "No se encontraron registros duplicados en la base de datos."
      });
    }
    setTimeout(() => setPSuccessToast(null), 5000);
  };

  const handleResetDatabase = () => {
    saveDeletedOrders({});
    saveOrders(SEED_ORDERS);
    saveCarriers(SEED_CARRIERS);
    saveCustomers(SEED_CUSTOMERS);
    saveNovedades(SEED_NOVEDADES);
    saveReminders(SEED_REMINDERS);
  };

  const pdfMatchingOrder = useMemo(() => {
    if (!parsedPdfData || parsedPdfData.tipoDocumento !== 'FACTURA_PROVISION') return null;
    return orders.find(o => 
      o.estado !== 'Anulado' && 
      ((parsedPdfData.oc && o.oc === parsedPdfData.oc) || 
       (parsedPdfData.pv && o.pv === parsedPdfData.pv))
    ) || null;
  }, [parsedPdfData, orders]);

  // Client-side dynamic loading of pdf.js
  const loadPdfJs = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any).pdfjsLib) {
        resolve((window as any).pdfjsLib);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
      script.onload = () => {
        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        resolve(pdfjsLib);
      };
      script.onerror = (err) => {
        reject(new Error('Error al cargar la librería pdf.js: ' + err));
      };
      document.head.appendChild(script);
    });
  };

  const extractTextFromPdfArrayBuffer = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    const pdfjsLib = await loadPdfJs();
    const typedarray = new Uint8Array(arrayBuffer);
    const loadingTask = pdfjsLib.getDocument({ data: typedarray });
    const pdfDoc = await loadingTask.promise;
    
    let fullText = '';
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const content = await page.getTextContent();
      
      const items = [...content.items];
      const rows: { y: number; items: any[] }[] = [];
      
      for (const item of items) {
        const y = item.transform ? item.transform[5] : 0;
        let foundRow = rows.find(r => Math.abs(r.y - y) < 5);
        if (foundRow) {
          foundRow.items.push(item);
        } else {
          rows.push({ y, items: [item] });
        }
      }
      
      rows.sort((a, b) => b.y - a.y);
      
      for (const row of rows) {
        row.items.sort((a, b) => {
          const aX = a.transform ? a.transform[4] : 0;
          const bX = b.transform ? b.transform[4] : 0;
          return aX - bX;
        });
      }
      
      const sortedStrings = rows.flatMap(row => row.items.map(item => item.str));
      const strings = sortedStrings.join(' ');
      fullText += ' ' + strings;
    }
    return fullText.replace(/\s+/g, ' ');
  };

  const parsePdfTextDeterministically = (text: string, fileName: string = "") => {
    const textUpper = text.toUpperCase();
    const fnUpper = fileName ? fileName.toUpperCase() : "";

    let tipoDocumento = "PEDIDO_CLIENTE";
    if (
      textUpper.includes("PROVISION") || 
      textUpper.includes("PLANILLA") || 
      textUpper.includes("FLETE") ||
      textUpper.includes("RELACION DE DESPACHO") ||
      textUpper.includes("MANIFIESTO") ||
      fnUpper.includes("PLANILLA") ||
      fnUpper.includes("PROVISION") ||
      fnUpper.includes("FLETE") ||
      fnUpper.includes("MANIFIESTO")
    ) {
      const hasClientHeader = textUpper.includes("CLIENTE:") || textUpper.includes("ADQUIRIENTE:");
      const hasOrderHeader = textUpper.includes("PEDIDO DE VENTA") || textUpper.includes("PV ");
      if (hasOrderHeader && hasClientHeader && !textUpper.includes("FACTURA PROVISION")) {
        tipoDocumento = "PEDIDO_CLIENTE";
      } else {
        tipoDocumento = "FACTURA_PROVISION";
      }
    }

    // Helper function to extract document date (Dia, Mes, Año or Fecha)
    const extractDateFromPdfText = (strText: string): string => {
      if (!strText) return "";
      const formatIso = (dStr: string, mStr: string, yStr: string): string => {
        let day = parseInt(dStr, 10);
        let month = parseInt(mStr, 10);
        let year = parseInt(yStr, 10);
        if (isNaN(day) || isNaN(month) || isNaN(year)) return "";
        if (year < 100) year += 2000;
        if (month > 12 && day <= 12) {
          const tmp = day; day = month; month = tmp;
        }
        if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2099) return "";
        const mm = month < 10 ? `0${month}` : `${month}`;
        const dd = day < 10 ? `0${day}` : `${day}`;
        return `${year}-${mm}-${dd}`;
      };

      // 1. "Dia 17 Mes 7 Año 2026" or "Dia: 17 Mes: 7 Año: 2026"
      const diaMesAnoRx1 = /(?:Dia|Día)\s*[:\-–]?\s*(\d{1,2})\s*(?:Mes)\s*[:\-–]?\s*(\d{1,2})\s*(?:Año|Anio|Añ|Ano)\s*[:\-–]?\s*(\d{2,4})/i;
      let m = strText.match(diaMesAnoRx1);
      if (m) { const res = formatIso(m[1], m[2], m[3]); if (res) return res; }

      // 2. "Dia Mes Año 17 7 2026"
      const diaMesAnoRx2 = /(?:Dia|Día)\s+(?:Mes)\s+(?:Año|Anio|Añ|Ano)\s*[:\-–]?\s*(\d{1,2})\s*[\/\-\s]\s*(\d{1,2})\s*[\/\-\s]\s*(\d{2,4})/i;
      m = strText.match(diaMesAnoRx2);
      if (m) { const res = formatIso(m[1], m[2], m[3]); if (res) return res; }

      // 3. "FECHA: 17/07/2026" or "FECHA 17-07-2026"
      const fechaRx1 = /(?:Fecha|FECHA|Fec)\s*[:\-–]?\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\d{2}|\d{2})/i;
      m = strText.match(fechaRx1);
      if (m) { const res = formatIso(m[1], m[2], m[3]); if (res) return res; }

      // 4. "FECHA: 2026-07-17"
      const fechaRx2 = /(?:Fecha|FECHA|Fec)\s*[:\-–]?\s*(20\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/i;
      m = strText.match(fechaRx2);
      if (m) { const res = formatIso(m[3], m[2], m[1]); if (res) return res; }

      // 5. Month names "17 de Julio de 2026"
      const monthMap: Record<string, string> = {
        enero: "1", ene: "1", febrero: "2", feb: "2", marzo: "3", mar: "3",
        abril: "4", abr: "4", mayo: "5", may: "5", junio: "6", jun: "6",
        julio: "7", jul: "7", agosto: "8", ago: "8", septiembre: "9", sep: "9", sept: "9",
        octubre: "10", oct: "10", noviembre: "11", nov: "11", diciembre: "12", dic: "12"
      };
      const monthRx = /(\d{1,2})\s*(?:de|\-|\/)\s*([a-zA-aáéíóúÁÉÍÓÚ]{3,10})\s*(?:de|\-|\/)?\s*(20\d{2}|\d{2})/i;
      m = strText.match(monthRx);
      if (m) {
        const monthClean = m[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const monthNum = monthMap[monthClean];
        if (monthNum) {
          const res = formatIso(m[1], monthNum, m[3]);
          if (res) return res;
        }
      }

      // 6. Generic date 17/07/2026
      const genDateRx = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/;
      m = strText.match(genDateRx);
      if (m) {
        const res = formatIso(m[1], m[2], m[3]);
        if (res) return res;
      }

      return "";
    };

    // Initialize properties
    let oc = "";
    let pv = "";
    let fecha = extractDateFromPdfText(text);
    let cliente = "";
    let ciudad = "";
    let cajas = "";
    let peso = "";
    let venta = "";
    let factura = "";
    let provision = "";
    let flete = "";
    let transportadora = "";

    // 1. EXTRACT PV
    const pvMatches = [
      /PV\s*[-–]?\s*(\d+)/i,
      /PEDIDO\s*DE\s*VENTA\s*[-–]?\s*([A-Z0-9]+)/i,
      /PV\s*[:\-–]?\s*(\d+)/i,
      /Pedido\s*No\.?\s*(\d+)/i,
      /Pedido\s*[:\-–]?\s*(\d+)/i,
      /Pedido\s*de\s*Venta\s*No\.?\s*(\d+)/i,
      /Venta\s*No\.?\s*(\d+)/i,
      /PV\s*([A-Z0-9\-]+)/i,
      /PV\s+([A-Z0-9\-]+)/i,
      /N[o°]\.?\s*Pedido\s*[:\-–]?\s*(\d+)/i,
      /Pedido\s+venta\s+(\d+)/i,
      /Pedido\s+(\d+)/i
    ];
    for (const regex of pvMatches) {
      const match = text.match(regex);
      if (match && match[1]) {
        pv = match[1].trim();
        break;
      }
    }

    if (!pv && fileName) {
      const fnMatches = [
        /PV\s*[-–_]?\s*(\d+)/i,
        /Pedido\s*[-–_]?\s*(\d+)/i,
        /(?:^|[^a-z0-9])PV\s*(\d+)/i,
        /(?:^|[^a-z0-9])(\d{4,5})(?:\.pdf)/i
      ];
      for (const regex of fnMatches) {
        const m = fileName.match(regex);
        if (m && m[1]) {
          pv = m[1].trim();
          break;
        }
      }
    }

    if (pv && !pv.toUpperCase().startsWith("PV") && /^\d+$/.test(pv)) {
      pv = "PV " + pv;
    }

    // 2. EXTRACT OC
    const ocMatches = [
      /OC\s*[:\-–]?\s*(EMPLEADOS\s*\d+)/i,
      /OBSERVACIONES:\s*(EMPLEADOS\s*\d+)/i,
      /(EMPLEADOS\s*\d+)/i,
      /OC\s*[:\-–]?\s*(OC-[A-Z0-9\-]+)/i,
      /OC\s*[:\-–]?\s*([A-Z0-9\-_]+)/i,
      /ORDEN\s*DE\s*COMPRA\s*[:\-–]?\s*([A-Z0-9\-_]+)/i,
      /ORDEN\s+COMPRA\s*[:\-–]?\s*([A-Z0-9\-_]+)/i,
      /OBSERVACIONES:\s*(OC-[A-Z0-9\-_]+)/i,
      /OBSERVACIONES[^\n]+(OC-[A-Z0-9\-_]+)/i,
      /Orden\s*Compra\s*No\.?\s*([A-Z0-9\-]+)/i,
      /Pedido\s*Cliente\s*No\.?\s*([A-Z0-9\-]+)/i,
      /OC\s*No\.?\s*([A-Z0-9\-]+)/i,
      /O\.C\s*No\.?\s*([A-Z0-9\-]+)/i,
      /O\.C\.\s*[:\-–]?\s*([A-Z0-9\-]+)/i,
      /Orden\s+de\s+Compra\s+([A-Z0-9\-]+)/i,
      /Nro\.\s*Ped\.\s*Cli\.\s*([A-Z0-9\-]+)/i,
      /Ref\s*Cliente\s*([A-Z0-9\-]+)/i,
      /OC\s+(\d+)/i
    ];
    for (const regex of ocMatches) {
      const match = text.match(regex);
      if (match && match[1]) {
        const val = match[1].trim();
        if (val.length > 3) {
          oc = val;
          break;
        }
      }
    }

    if (!oc) {
      const generalOcMatch = text.match(/(OC-[A-Z0-9\-]+)/i);
      if (generalOcMatch && generalOcMatch[1]) {
        oc = generalOcMatch[1].trim();
      }
    }

    // Guard: If OC got parsed as "Zona" (due to text boxes flow alignment in pdf.js text stream), override with EMPLEADOS reference
    if (oc && (oc.toUpperCase() === 'ZONA' || oc.toUpperCase().startsWith('ZONA') || oc.toUpperCase() === 'VENDEDOR')) {
      const secondaryOc = text.match(/(EMPLEADOS\s*\d+)/i);
      if (secondaryOc) {
        oc = secondaryOc[1].trim();
      } else {
        const fallbackMatch = text.match(/PV\s*(\d+)/i);
        if (fallbackMatch) {
          oc = "EMPLEADOS " + fallbackMatch[1];
        } else {
          oc = "";
        }
      }
    }

    if (!oc && fileName) {
      const fnOcMatches = [
        /OC\s*[-–_]?\s*([A-Z0-9\-]+)/i,
        /OrdenCompra\s*[-–_]?\s*([A-Z0-9\-]+)/i
      ];
      for (const regex of fnOcMatches) {
        const m = fileName.match(regex);
        if (m && m[1]) {
          oc = m[1].trim();
          break;
        }
      }
    }

    // 3. EXTRACT CLIENTE
    let rawClienteLabelMatch = "";
    
    // Attempt to extract the client name via standard labels first (highest accuracy)
    const clienteMatches = [
      /Cliente\s*[:\-–]\s*(.*?)(?=\s*(?:NIT|Dirección|Direccion|Teléfono|Telefono|Ciudad|Sucursal|Vendedor|Bodega|OC|Código|Codigo|Sede|Lugar|Fecha|Cant|Vr\.|Descripción|Descripcion|Subtotal|\s{2,}|$))/i,
      /Adquiriente\s*[:\-–]\s*(.*?)(?=\s*(?:NIT|Dirección|Direccion|Teléfono|Telefono|Ciudad|Sucursal|Vendedor|Bodega|OC|Código|Codigo|Sede|Lugar|Fecha|Cant|Vr\.|Descripción|Descripcion|Subtotal|\s{2,}|$))/i,
      /Señor\(es\)\s*[:\-–]\s*(.*?)(?=\s*(?:NIT|Dirección|Direccion|Teléfono|Telefono|Ciudad|Sucursal|Vendedor|Bodega|OC|Código|Codigo|Sede|Lugar|Fecha|Cant|Vr\.|Descripción|Descripcion|Subtotal|\s{2,}|$))/i,
      /Comprador\s*[:\-–]\s*(.*?)(?=\s*(?:NIT|Dirección|Direccion|Teléfono|Telefono|Ciudad|Sucursal|Vendedor|Bodega|OC|Código|Codigo|Sede|Lugar|Fecha|Cant|Vr\.|Descripción|Descripcion|Subtotal|\s{2,}|$))/i,
      /Cliente\s*[:\-–]\s*([^\n]+)/i,
      /Adquiriente\s*[:\-–]\s*([^\n]+)/i,
      /Señor\(es\)\s*[:\-–]\s*([^\n]+)/i,
      /Comprador\s*[:\-–]\s*([^\n]+)/i
    ];

    for (const regex of clienteMatches) {
      const match = text.match(regex);
      if (match && match[1]) {
        rawClienteLabelMatch = match[1].trim();
        break;
      }
    }

    if (rawClienteLabelMatch) {
      // Clean parentheses or brackets from the raw matched name (as requested)
      let cleanedLabelName = rawClienteLabelMatch.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
      
      // Resolve against our customer list (strictly checking matching of the extracted client label only)
      if (customers && customers.length > 0) {
        const normalizeForMatching = (s: string) => {
          return s.toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[.\-,()_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        };
        const normLabel = normalizeForMatching(cleanedLabelName);
        const sortedCusts = [...customers].sort((a, b) => b.nombre.length - a.nombre.length);
        let matchedCustomer = "";
        
        // A. Direct standard clean match on database names
        for (const c of sortedCusts) {
          const cCleaned = c.nombre.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
          if (normalizeForMatching(cCleaned) === normLabel) {
            matchedCustomer = cCleaned;
            break;
          }
        }
        
        // B. Direct match with full customer names (cleaned)
        if (!matchedCustomer) {
          for (const c of sortedCusts) {
            const cCleaned = c.nombre.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
            const cNorm = normalizeForMatching(cCleaned);
            if (cNorm.length > 4 && (normLabel.includes(cNorm) || cNorm.includes(normLabel))) {
              matchedCustomer = cCleaned;
              break;
            }
          }
        }
        
        // C. Segment-based match
        if (!matchedCustomer) {
          for (const c of sortedCusts) {
            const segments = c.nombre.split(/[()\[\]]/).map(s => s.trim()).filter(s => s.length > 5);
            let foundSegment = false;
            for (const segment of segments) {
              const segNorm = normalizeForMatching(segment);
              const segNormNoSuffix = segNorm.replace(/\b(S\s*A\s*S\b|S\s*A\b|L\s*T\s*D\s*A\b|C\s*O\b|S\s*E\s*N\s*C\b|LIMITADA)\b/g, ' ').replace(/\s+/g, ' ').trim();
              if (segNormNoSuffix.length > 5 && (normLabel.includes(segNormNoSuffix) || segNormNoSuffix.includes(normLabel))) {
                matchedCustomer = c.nombre.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
                foundSegment = true;
                break;
              }
            }
            if (foundSegment) break;
          }
        }
        
        if (matchedCustomer) {
          cliente = matchedCustomer;
        } else {
          cliente = cleanedLabelName;
        }
      } else {
        cliente = cleanedLabelName;
      }
    }

    if (!cliente) {
      // Fallback: Scan full text only if label match was not found
      if (textUpper.includes("ABASTECEMOS")) {
        cliente = "ABASTECEMOS DE OCCIDENTE SAS";
      } else if (textUpper.includes("MERCAPAVA")) {
        cliente = "MERCAPAVA SA";
      } else if (textUpper.includes("ALKOSTO") || textUpper.includes("CORBETA") || textUpper.includes("COLOMBIANA DE COMERCIO")) {
        cliente = "ALKOSTO SUR S.A.";
      } else if (textUpper.includes("EXITO") || textUpper.includes("ÉXITO") || textUpper.includes("GRUPO EXITO") || textUpper.includes("CARULLA")) {
        cliente = "ALMACENES ÉXITO S.A.";
      } else if (textUpper.includes("JUMBO") || textUpper.includes("CENCOSUD") || textUpper.includes("METRO")) {
        cliente = "TIENDAS JUMBO S.A.S.";
      } else if (textUpper.includes("OLIMPICA") || textUpper.includes("OLÍMPICA")) {
        cliente = "SÚPER TIENDAS OLÍMPICA S.A.";
      } else if (textUpper.includes("VAQUITA")) {
        cliente = "INVERSIONES LA VAQUITA EXPRESS";
      } else if (textUpper.includes("CAÑAVERAL") || textUpper.includes("CAÑA VERAL")) {
        cliente = "SUPERMERCADOS CAÑAVERAL";
      } else if (textUpper.includes("PACIFICO INDUSTRIAL") || textUpper.includes("PACÍFICO INDUSTRIAL")) {
        cliente = "QUÍMICA PACÍFICO INDUSTRIAL";
      } else if (textUpper.includes("MERCACENTRO")) {
        cliente = "MERCACENTRO HUILA";
      } else {
        if (fileName) {
          if (fnUpper.includes("MERCAPAVA")) {
            cliente = "MERCAPAVA SA";
          } else if (fnUpper.includes("ALKOSTO")) {
            cliente = "ALKOSTO SUR S.A.";
          } else if (fnUpper.includes("EXITO") || fnUpper.includes("ÉXITO")) {
            cliente = "ALMACENES ÉXITO S.A.";
          } else if (fnUpper.includes("JUMBO") || fnUpper.includes("CENCOSUD")) {
            cliente = "TIENDAS JUMBO S.A.S.";
          } else if (fnUpper.includes("OLIMPICA") || fnUpper.includes("OLÍMPICA")) {
            cliente = "SÚPER TIENDAS OLÍMPICA S.A.";
          } else if (fnUpper.includes("VAQUITA")) {
            cliente = "INVERSIONES LA VAQUITA EXPRESS";
          } else if (fnUpper.includes("CAÑAVERAL")) {
            cliente = "SUPERMERCADOS CAÑAVERAL";
          }
        }
      }
    }

    // 4. EXTRACT CIUDAD
    let extractedCiudad = "";
    const ciudadMatches = [
      /Ciudad\s*[:\-–]\s*([A-Za-zÀ-ÿ\s]+)/i,
      /Ciudad\s+Destino\s*[:\-–]?\s*([A-Za-zÀ-ÿ\s]+)/i,
      /Sede\s+Destino\s*[:\-–]?\s*([A-Za-zÀ-ÿ\s]+)/i,
      /Lugar\s+de\s+entrega\s*[:\-–]?\s*([A-Za-zÀ-ÿ\s,]+)/i
    ];
    for (const regex of ciudadMatches) {
      const match = text.match(regex);
      if (match && match[1]) {
        const rawCity = match[1].trim().toUpperCase();
        if (rawCity.includes("CALI")) {
          extractedCiudad = "Cali";
        } else if (rawCity.includes("YUMBO")) {
          extractedCiudad = "Yumbo";
        } else if (rawCity.includes("CERRITO")) {
          extractedCiudad = "Cerrito";
        } else if (rawCity.includes("MEDELLIN") || rawCity.includes("MEDELLÍN")) {
          extractedCiudad = "Medellín";
        } else if (rawCity.includes("BELLO")) {
          extractedCiudad = "Bello";
        } else if (rawCity.includes("BOGOTA") || rawCity.includes("BOGOTÁ")) {
          extractedCiudad = "Bogotá";
        } else if (rawCity.includes("NEIVA")) {
          extractedCiudad = "Neiva";
        } else if (rawCity.includes("PEREIRA")) {
          extractedCiudad = "Pereira";
        } else if (rawCity.includes("BARRANQUILLA")) {
          extractedCiudad = "Barranquilla";
        } else if (rawCity.includes("IBAGUE") || rawCity.includes("IBAGUÉ")) {
          extractedCiudad = "Ibagué";
        } else {
          extractedCiudad = rawCity.split(/[\s,]+/)[0];
          extractedCiudad = extractedCiudad.charAt(0).toUpperCase() + extractedCiudad.slice(1).toLowerCase();
        }
        break;
      }
    }

    if (extractedCiudad) {
      ciudad = extractedCiudad;
    } else {
      if (fileName) {
        if (fnUpper.includes("CERRITO")) ciudad = "Cerrito";
        else if (fnUpper.includes("YUMBO")) ciudad = "Yumbo";
        else if (fnUpper.includes("CALI")) ciudad = "Cali";
        else if (fnUpper.includes("MEDELLIN") || fnUpper.includes("MEDELLÍN")) ciudad = "Medellín";
        else if (fnUpper.includes("BELLO")) ciudad = "Bello";
        else if (fnUpper.includes("BOGOTA") || fnUpper.includes("BOGOTÁ")) ciudad = "Bogotá";
        else if (fnUpper.includes("NEIVA")) ciudad = "Neiva";
        else if (fnUpper.includes("PEREIRA")) ciudad = "Pereira";
        else if (fnUpper.includes("BARRANQUILLA")) ciudad = "Barranquilla";
      }

      if (!ciudad) {
        if (textUpper.includes("CERRITO")) {
          ciudad = "Cerrito";
        } else if (textUpper.includes("CALI")) {
          ciudad = "Cali";
        } else if (textUpper.includes("MEDELLIN") || textUpper.includes("MEDELLÍN")) {
          ciudad = "Medellín";
        } else if (textUpper.includes("BELLO")) {
          ciudad = "Bello";
        } else if (textUpper.includes("BOGOTA") || textUpper.includes("BOGOTÁ")) {
          ciudad = "Bogotá";
        } else if (textUpper.includes("NEIVA")) {
          ciudad = "Neiva";
        } else if (textUpper.includes("PEREIRA")) {
          ciudad = "Pereira";
        } else if (textUpper.includes("BARRANQUILLA")) {
          ciudad = "Barranquilla";
        } else if (textUpper.includes("IBAGUE") || textUpper.includes("IBAGUÉ")) {
          ciudad = "Ibagué";
        } else if (textUpper.includes("YUMBO")) {
          ciudad = "Yumbo";
        }
      }
    }

    if (!ciudad) {
      ciudad = "Medellín";
    }

    // 5. EXTRACT CAJAS & PESO JOINTLY (High priority pattern: "Cajas X Peso Y")
    let hasJointCajasPeso = false;
    const jointMatch = text.match(/(?:Cajas|Cjs|Cja|Cjs\.|Bultos)\s*([\d\.,]+)\s*(?:Peso|Kilos|Kg|Kgs|Kgs\.|Kilogramos)\s*([\d\.,]+)/i);
    const jointMatchReverse = text.match(/(?:Peso|Kilos|Kg|Kgs|Kgs\.|Kilogramos)\s*([\d\.,]+)\s*(?:Cajas|Cjs|Cja|Cjs\.|Bultos)\s*([\d\.,]+)/i);

    if (jointMatch) {
      cajas = Math.round(parseFloat(jointMatch[1].replace(/,/g, ""))).toString();
      const rawPesoVal = parseFloat(jointMatch[2].replace(/,/g, ""));
      peso = rawPesoVal % 1 === 0 ? rawPesoVal.toString() : rawPesoVal.toFixed(2);
      hasJointCajasPeso = true;
    } else if (jointMatchReverse) {
      const rawPesoVal = parseFloat(jointMatchReverse[1].replace(/,/g, ""));
      peso = rawPesoVal % 1 === 0 ? rawPesoVal.toString() : rawPesoVal.toFixed(2);
      cajas = Math.round(parseFloat(jointMatchReverse[2].replace(/,/g, ""))).toString();
      hasJointCajasPeso = true;
    }

    if (!hasJointCajasPeso) {
      // 5. EXTRACT CAJAS INDIVIDUALLY (Fallback)
      const cajasKeywords = ["Cajas", "Cant. Cajas", "Total Cajas", "Bultos", "Cant. Bultos", "Total Bultos", "Empaques", "Unidades", "Cjs", "Cja", "Caja"];
      let extractedCajas = "";
      let lastCajasIndex = -1;

      for (const kw of cajasKeywords) {
        const escapedKw = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        // Matches the keyword, then optional spaces/punctuation, then optional words/symbols/spaces, then a number
        const regex = new RegExp(escapedKw + '(?:\\s*[:\\-–]?\\s*)(?:[a-zÀ-ÿ\\.\\s\\/º°\\$#]*?)\\s*([\\d\\.,]+)', 'gi');
        
        let match;
        while ((match = regex.exec(text)) !== null) {
          if (match.index > lastCajasIndex) {
            const numStr = match[1];
            const cleanStr = numStr.replace(/,/g, "");
            const parsedVal = parseFloat(cleanStr);
            if (!isNaN(parsedVal) && parsedVal > 0) {
              lastCajasIndex = match.index;
              extractedCajas = Math.round(parsedVal).toString();
            }
          }
        }
      }

      if (extractedCajas) {
        cajas = extractedCajas;
      } else {
        const cajasMatches = [
          /Cajas\s+([\d\.,]+)/i,
          /Cajas\s*[:\-–]?\s*([\d\.,]+)/i,
          /Cant\.?\s+Cajas\s*[:\-–]?\s*([\d\.,]+)/i,
          /Total\s+Cajas\s*[:\-–]?\s*([\d\.,]+)/i,
          /Bultos\s*[:\-–]?\s*([\d\.,]+)/i,
          /Cant\.\s*Bultos\s*[:\-–]?\s*([\d\.,]+)/i,
          /Total\s*Bultos\s*[:\-–]?\s*([\d\.,]+)/i,
          /Empaques\s*[:\-–]?\s*([\d\.,]+)/i,
          /Unidades\s*[:\-–]?\s*([\d\.,]+)/i
        ];
        for (const regex of cajasMatches) {
          const match = text.match(regex);
          if (match && match[1]) {
            const numStr = match[1].replace(/,/g, "");
            const num = parseFloat(numStr);
            if (!isNaN(num)) {
              cajas = Math.round(num).toString();
              break;
            }
          }
        }
      }
    }

    if (!cajas) {
      cajas = "100";
    }

    if (!hasJointCajasPeso) {
      // 6. EXTRACT PESO INDIVIDUALLY (Fallback)
      const pesoKeywords = ["Peso Total", "Peso Bruto", "Peso", "Kilos", "Kgs", "Kg", "Kilogramos"];
      let extractedPeso = "";
      let lastPesoIndex = -1;

      for (const kw of pesoKeywords) {
        const escapedKw = kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(escapedKw + '(?:\\s*[:\\-–]?\\s*)(?:[a-zÀ-ÿ\\.\\s\\/º°\\$#]*?)\\s*([\\d\\.,]+)', 'gi');
        
        let match;
        while ((match = regex.exec(text)) !== null) {
          if (match.index > lastPesoIndex) {
            const numStr = match[1];
            const cleanStr = numStr.replace(/,/g, "");
            const parsedVal = parseFloat(cleanStr);
            if (!isNaN(parsedVal) && parsedVal > 0) {
              lastPesoIndex = match.index;
              extractedPeso = parsedVal % 1 === 0 ? parsedVal.toString() : parsedVal.toFixed(2);
            }
          }
        }
      }

      if (extractedPeso) {
        peso = extractedPeso;
      } else {
        const pesoMatches = [
          /Peso\s+([\d\.,]+)/i,
          /Peso\s*[:\-–]?\s*([\d\.,]+)/i,
          /Peso\s+Total\s*[:\-–]?\s*([\d\.,]+)/i,
          /Kilos\s*[:\-–]?\s*([\d\.,]+)/i,
          /Kgs\s*[:\-–]?\s*([\d\.,]+)/i,
          /Peso\s+Bruto\s*[:\-–]?\s*([\d\.,]+)/i,
          /Kilogramos\s*[:\-–]?\s*([\d\.,]+)/i
        ];
        for (const regex of pesoMatches) {
          const match = text.match(regex);
          if (match && match[1]) {
            const numStr = match[1].replace(/,/g, "");
            const num = parseFloat(numStr);
            if (!isNaN(num)) {
              peso = num % 1 === 0 ? num.toString() : num.toFixed(2);
              break;
            }
          }
        }
      }
    }

    if (!peso) {
      peso = "1000";
    }

    // 7. EXTRACT VENTA
    const subtotalMatches = [
      /Subtotal\s*[:\-–]?\s*\$?\s*([\d\.,]+)/i,
      /Vr\.\s*Bruto\s*[:\-–]?\s*\$?\s*([\d\.,]+)/i,
      /Valor\s+Neto\s*[:\-–]?\s*\$?\s*([\d\.,]+)/i,
      /Total\s+Venta\s*[:\-–]?\s*\$?\s*([\d\.,]+)/i,
      /Total\s+Factura\s*[:\-–]?\s*\$?\s*([\d\.,]+)/i,
      /Total\s+A\s+Pagar\s*[:\-–]?\s*\$?\s*([\d\.,]+)/i,
      /Total\s*[:\-–]?\s*\$?\s*([\d\.,]+)/i,
      /VALOR\s+TOTAL\s*[:\-–]?\s*\$?\s*([\d\.,]+)/i
    ];
    for (const regex of subtotalMatches) {
      const match = text.match(regex);
      if (match && match[1]) {
        let cleanVal = match[1].split(".")[0];
        cleanVal = cleanVal.replace(/[^\d]/g, "");
        if (cleanVal) {
          venta = cleanVal;
          break;
        }
      }
    }

    if (!venta) {
      venta = "5000000";
    }

    // 8. EXTRACT FACTURA
    const facturaMatches = [
      /Factura\s*(?:de\s*venta)?\s*[:\-–]?\s*([A-Z0-9\-]+)/i,
      /FE\s*[-–]?\s*(\d+)/i,
      /N[o°]\.?\s*Factura\s*[:\-–]?\s*([A-Z0-9\-]+)/i,
      /N[o°]\.?\s*Factura\s*FE\s*[-–]?\s*(\d+)/i,
      /Factura\s+No\.?\s*([A-Z0-9\-]+)/i
    ];
    for (const regex of facturaMatches) {
      const match = text.match(regex);
      if (match && match[1]) {
        factura = match[1].trim();
        break;
      }
    }

    // 9. For FACTURA_PROVISION fields
    if (tipoDocumento === "FACTURA_PROVISION") {
      const provMatches = [
        /Planilla\s*[:\-–]?\s*([A-Z0-9\-]+)/i,
        /No\.\s*Planilla\s*[:\-–]?\s*([A-Z0-9\-]+)/i,
        /Provision\s*[:\-–]?\s*([A-Z0-9\-]+)/i,
        /Factura\s*Flete\s*[:\-–]?\s*([A-Z0-9\-]+)/i,
        /FP\s*[-–]?\s*(\d+)/i,
        /Manifiesto\s*[:\-–]?\s*([A-Z0-9\-]+)/i,
        /Remisión\s*[:\-–]?\s*([A-Z0-9\-]+)/i,
        /Planilla\s+No\.?\s*([A-Z0-9\-]+)/i
      ];
      for (const regex of provMatches) {
        const match = text.match(regex);
        if (match && match[1]) {
          provision = match[1].trim();
          break;
        }
      }

      if (!provision && fileName) {
        const fnProvMatches = [
          /Planilla\s*[-–_]?\s*([A-Z0-9\-]+)/i,
          /FP\s*[-–_]?\s*([A-Z0-9\-]+)/i,
          /Provision\s*[-–_]?\s*([A-Z0-9\-]+)/i
        ];
        for (const regex of fnProvMatches) {
          const m = fileName.match(regex);
          if (m && m[1]) {
            provision = m[1].trim();
            break;
          }
        }
      }

      const fleteMatches = [
        /Flete\s*[:\-–]?\s*\$?\s*([\d\.,]+)/i,
        /Valor\s+Flete\s*[:\-–]?\s*\$?\s*([\d\.,]+)/i,
        /Costo\s+Flete\s*[:\-–]?\s*\$?\s*([\d\.,]+)/i,
        /Valor\s+Liquidado\s*[:\-–]?\s*\$?\s*([\d\.,]+)/i,
        /Flete\s+Pactado\s*[:\-–]?\s*\$?\s*([\d\.,]+)/i,
        /Valor\s+Total\s+Liquidado\s*[:\-–]?\s*\$?\s*([\d\.,]+)/i
      ];
      for (const regex of fleteMatches) {
        const match = text.match(regex);
        if (match && match[1]) {
          let cleanVal = match[1].split(".")[0];
          cleanVal = cleanVal.replace(/[^\d]/g, "");
          if (cleanVal) {
            flete = cleanVal;
            break;
          }
        }
      }

      if (!flete) {
        flete = "450000";
      }

      if (textUpper.includes("SISA")) {
        transportadora = "SISA CARGO";
      } else if (textUpper.includes("VIACARGO") || textUpper.includes("VIA CARGO")) {
        transportadora = "VIACARGO S.A.S.";
      } else if (textUpper.includes("THR")) {
        transportadora = "THR LOGÍSTICA";
      } else if (textUpper.includes("A5")) {
        transportadora = "A5 LOGISTICA";
      } else if (textUpper.includes("FREDY") || textUpper.includes("HERNANDEZ")) {
        transportadora = "FREDY HERNANDEZ";
      } else {
        if (fileName) {
          if (fnUpper.includes("SISA")) transportadora = "SISA CARGO";
          else if (fnUpper.includes("VIACARGO") || fnUpper.includes("VIA CARGO")) transportadora = "VIACARGO S.A.S.";
          else if (fnUpper.includes("THR")) transportadora = "THR LOGÍSTICA";
          else if (fnUpper.includes("A5")) transportadora = "A5 LOGISTICA";
          else if (fnUpper.includes("FREDY")) transportadora = "FREDY HERNANDEZ";
        }

        if (!transportadora) {
          const transMatches = [
            /Transportadora\s*[:\-–]\s*([^\n]+)/i,
            /Empresa\s+de\s+transporte\s*[:\-–]\s*([^\n]+)/i,
            /Transportista\s*[:\-–]\s*([^\n]+)/i
          ];
          for (const regex of transMatches) {
            const match = text.match(regex);
            if (match && match[1]) {
              transportadora = match[1].trim();
              break;
            }
          }
        }
      }

      if (!transportadora) {
        transportadora = "SISA CARGO";
      }
    }

    return {
      tipoDocumento,
      oc: oc || "",
      pv: pv || "",
      fecha: fecha || "",
      cliente: cliente || "ALMACENES ÉXITO S.A.",
      ciudad: ciudad || "Medellín",
      cajas: cajas || "100",
      peso: peso || "1000",
      venta: venta || "0",
      factura: factura || "",
      provision: provision || "",
      flete: flete || "0",
      transportadora: tipoDocumento === 'PEDIDO_CLIENTE' ? (transportadora || "") : (transportadora || "SISA CARGO"),
      _metodo: "Extracción local en el navegador (Rápida, Privada y Estable)"
    };
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const processPdfFile = (file: File) => {
    setIsPdfParsing(true);
    setPdfParsingError(null);
    setParsedPdfData(null);
    setPdfSelectedMatchOrderId('');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        
        // 1. Try local browser-side extraction first
        let localExtractedText = "";
        let localResult: any = null;
        try {
          localExtractedText = await extractTextFromPdfArrayBuffer(arrayBuffer);
          if (localExtractedText && localExtractedText.trim().length > 0) {
            localResult = parsePdfTextDeterministically(localExtractedText, file.name);
            console.log("[Local PDF Parser] Successfully extracted text locally:", localResult);
          }
        } catch (localErr) {
          console.warn("[Local PDF Parser] Browser-side pdf.js extraction failed or not ready:", localErr);
        }

        // 2. If 'useAi' is false, return the local result directly (avoiding any server calls!)
        if (!useAi) {
          if (localResult) {
            setParsedPdfData(localResult);
            return;
          } else {
            throw new Error(
              "El sistema no pudo extraer texto de este PDF localmente de forma rápida. Por favor, asegúrate de que sea un PDF digital legible o intenta activando la casilla 'Usar IA (Lento)' para digitalizarlo de forma inteligente con Inteligencia Artificial."
            );
          }
        }

        // 3. If 'useAi' is true, let's see if we can use complete local results to bypass API,
        // or otherwise call the server-side intelligent AI parsing
        if (useAi && localResult && localResult.pv && localResult.oc) {
          console.log("[Local PDF Parser] Local result is complete, skipping AI processing to save time & resources");
          setParsedPdfData(localResult);
          return;
        }

        // Call the server API for intelligent parsing
        console.log("[Local PDF Parser] Falling back to Server AI OCR parsing...");
        const base64Data = arrayBufferToBase64(arrayBuffer);
        const response = await fetch('/api/gemini/parse-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileData: base64Data,
            fileType: file.type || 'application/pdf',
            fileName: file.name,
            useAi: useAi,
          }),
        });

        const responseText = await response.text();
        let parsedData: any = null;
        try {
          parsedData = JSON.parse(responseText);
        } catch (jsonErr) {
          // If the server returns HTML instead of JSON, but we have a partial local result, USE IT!
          if (localResult) {
            console.warn("[Local PDF Parser] Server returned non-JSON, but using local fallback:", localResult);
            setParsedPdfData(localResult);
            return;
          }

          let errMsg = `Error del Servidor (${response.status})`;
          const titleMatch = responseText.match(/<title>(.*?)<\/title>/i);
          const bodyMatch = responseText.match(/<pre>(.*?)<\/pre>/i);
          const h1Match = responseText.match(/<h1>(.*?)<\/h1>/i);
          if (titleMatch) {
            errMsg += `: ${titleMatch[1]}`;
            if (bodyMatch) errMsg += ` - ${bodyMatch[1]}`;
            else if (h1Match) errMsg += ` - ${h1Match[1]}`;
          } else if (h1Match) {
            errMsg += `: ${h1Match[1]}`;
          } else {
            errMsg += `: ${responseText.slice(0, 200)}`;
          }
          throw new Error(errMsg);
        }

        if (!response.ok) {
          // Fallback to local result if server returns an error but we got local data
          if (localResult) {
            console.warn("[Local PDF Parser] Server returned error, but using local fallback:", localResult);
            setParsedPdfData(localResult);
            return;
          }
          throw new Error(parsedData?.error || `Error del Servidor (${response.status})`);
        }

        if (!parsedData) {
          if (localResult) {
            setParsedPdfData(localResult);
            return;
          }
          throw new Error("No se pudo extraer información legible de este archivo PDF de forma rápida. Intenta activando la opción 'Usar IA (Lento)' para procesar el documento con Inteligencia Artificial.");
        }

        setParsedPdfData(parsedData);
      } catch (err: any) {
        console.error('Error parsing PDF:', err);
        setPdfParsingError(err.message || 'Error al conectar con el servidor de análisis inteligente.');
      } finally {
        setIsPdfParsing(false);
      }
    };

    reader.onerror = () => {
      setPdfParsingError('Error físico al leer el archivo seleccionado.');
      setIsPdfParsing(false);
    };

    reader.readAsArrayBuffer(file);
  };

  const resolveCustomerFromPdf = (rawName: string) => {
    if (!rawName) return "";
    const cleanRaw = rawName.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
    const validCustomers = customers.map(c => c.nombre);
    if (validCustomers.length === 0) return cleanRaw;

    const cleanString = (s: string) => {
      return s.toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[.\-,()_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    const norm = cleanString(cleanRaw);

    const stripParentheses = (s: string) => {
      return s.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
    };

    // 1. First try standard exact matching of the cleaned name (with or without parentheses)
    for (const c of validCustomers) {
      if (norm === cleanString(stripParentheses(c)) || norm === cleanString(c)) {
        return stripParentheses(c);
      }
    }

    // 2. Direct substring containment (for long customer names)
    for (const c of validCustomers) {
      const cCleaned = cleanString(stripParentheses(c));
      if (cCleaned.length > 5 && (norm.includes(cCleaned) || cCleaned.includes(norm))) {
        return stripParentheses(c);
      }
    }

    // 3. Try standard major brand mappings (highest priority)
    if (norm.includes("ABASTECEMOS")) {
      const match = validCustomers.find(c => c.toUpperCase().includes("ABASTECEMOS"));
      if (match) return stripParentheses(match);
    }
    if (norm.includes("EXITO")) {
      const match = validCustomers.find(c => c.toUpperCase().includes("EXITO"));
      if (match) return stripParentheses(match);
    }
    if (norm.includes("JUMBO") || norm.includes("CENCOSUD")) {
      const match = validCustomers.find(c => c.toUpperCase().includes("JUMBO") || c.toUpperCase().includes("CENCOSUD"));
      if (match) return stripParentheses(match);
    }
    if (norm.includes("ALKOSTO") || norm.includes("CORBETA") || norm.includes("COLOMBIANA DE COMERCIO")) {
      const match = validCustomers.find(c => c.toUpperCase().includes("ALKOSTO") || c.toUpperCase().includes("CORBETA"));
      if (match) return stripParentheses(match);
    }
    if (norm.includes("OLIMPICA")) {
      const match = validCustomers.find(c => c.toUpperCase().includes("OLIMPICA"));
      if (match) return stripParentheses(match);
    }
    if (norm.includes("VAQUITA")) {
      const match = validCustomers.find(c => c.toUpperCase().includes("VAQUITA"));
      if (match) return stripParentheses(match);
    }
    if (norm.includes("CANAVERAL") || norm.includes("CAÑAVERAL")) {
      const match = validCustomers.find(c => c.toUpperCase().includes("CANAVERAL") || c.toUpperCase().includes("CAÑAVERAL"));
      if (match) return stripParentheses(match);
    }
    if (norm.includes("PACIFICO") || norm.includes("PACÍFICO")) {
      const match = validCustomers.find(c => c.toUpperCase().includes("PACIFICO") || c.toUpperCase().includes("PACÍFICO"));
      if (match) return stripParentheses(match);
    }
    if (norm.includes("HUILA")) {
      const match = validCustomers.find(c => c.toUpperCase().includes("HUILA"));
      if (match) return stripParentheses(match);
    }
    if (norm.includes("MERCACENTRO")) {
      const match = validCustomers.find(c => c.toUpperCase().includes("MERCACENTRO"));
      if (match) return stripParentheses(match);
    }

    if (norm.includes("MERCAPAVA")) {
      for (const c of validCustomers) {
        const cNorm = cleanString(c);
        if (cNorm.includes("MERCAPAVA")) {
          const rawWords = norm.split(/\s+/);
          const branchCode = rawWords.find(w => /^\d+$/.test(w) || w.startsWith("0"));
          if (branchCode && cNorm.includes(branchCode)) {
            return stripParentheses(c);
          }
        }
      }
      const mercapava = validCustomers.find(c => c.toUpperCase().includes("MERCAPAVA"));
      if (mercapava) return stripParentheses(mercapava);
    }

    // 3. Segment-based Substring Matching (Surgical matching for alternative names/parentheses)
    // Sort customers by name length descending to match the most specific customer first
    const sortedCustomers = [...customers].sort((a, b) => b.nombre.length - a.nombre.length);
    for (const cust of sortedCustomers) {
      const originalName = cust.nombre;
      const segments = originalName.split(/[()\[\]]/).map(s => s.trim()).filter(s => s.length > 5);
      for (const segment of segments) {
        const segClean = cleanString(segment);
        const segCleanNoSuffix = segClean.replace(/\b(S\s*A\s*S\b|S\s*A\b|L\s*T\s*D\s*A\b|C\s*O\b|S\s*E\s*N\s*C\b|LIMITADA)\b/g, ' ').replace(/\s+/g, ' ').trim();
        if (segCleanNoSuffix.length > 5 && norm.includes(segCleanNoSuffix)) {
          return stripParentheses(originalName);
        }
      }
    }

    // 4. Exact word-intersection check (strictly require at least 2 distinct words of length >= 4)
    // Avoids false single-word collisions
    for (const cust of sortedCustomers) {
      const cWords = cleanString(cust.nombre).split(/\s+/).filter(w => w.length >= 4 && w !== "SAS" && w !== "CO" && w !== "LIMITADA");
      const normWords = norm.split(/\s+/).filter(w => w.length >= 4);
      const intersection = cWords.filter(w => normWords.includes(w));
      if (intersection.length >= 2) {
        return stripParentheses(cust.nombre);
      }
    }

    return cleanRaw;
  };

  const handleCreateOrderFromPdf = () => {
    if (!parsedPdfData) return;
    
    // Dynamically calculate the next distinct SOLAR ID checking both active and deleted orders to prevent collision
    const activeMax = orders.reduce((max, o) => {
      const num = parseInt(o.id.replace('SOL-', ''));
      return isNaN(num) ? max : Math.max(max, num);
    }, 1000);
    const deletedMax = Object.keys(deletedOrderIds || {}).reduce((max, id) => {
      const num = parseInt(id.replace('SOL-', ''));
      return isNaN(num) ? max : Math.max(max, num);
    }, 1000);
    const maxNumericId = Math.max(activeMax, deletedMax);
    const newId = `SOL-${maxNumericId + 1}`;

    const resolvedClient = resolveCustomerFromPdf(parsedPdfData.cliente);
    const pdfCity = parsedPdfData.ciudad || "Medellín";

    // Find matched customer from database to pre-populate exact address if available
    const cleanCityName = (s: string) => (s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
    const pdfCityClean = cleanCityName(pdfCity);
    
    let matchedCustomerObj = customers.find(c => {
      const matchesName = c.nombre.trim().toUpperCase() === resolvedClient.trim().toUpperCase();
      if (!matchesName) return false;
      const cCityClean = cleanCityName(c.ciudad);
      return cCityClean === pdfCityClean || pdfCityClean.includes(cCityClean) || cCityClean.includes(pdfCityClean);
    });

    if (!matchedCustomerObj) {
      matchedCustomerObj = customers.find(c => c.nombre.trim().toUpperCase() === resolvedClient.trim().toUpperCase());
    }

    const newOrder: Order = {
      id: newId,
      pv: parsedPdfData.pv || "",
      oc: parsedPdfData.oc || "",
      fechaIngreso: parsedPdfData.fecha || parsedPdfData.fechaIngreso || new Date().toISOString().split('T')[0],
      fechaSalida: "",
      fechaEntrega: "",
      fechaFactura: "",
      horaCita: "",
      cliente: resolvedClient,
      ciudad: pdfCity,
      origen: "ACOPI-YUMBO",
      peso: parseFloat(parsedPdfData.peso) || 0,
      cajas: parseFloat(parsedPdfData.cajas) || 0,
      venta: parseFloat(parsedPdfData.venta) || 0,
      factura: parsedPdfData.factura || "",
      facturado: parseFloat(parsedPdfData.venta) || 0,
      cajasFact: parseFloat(parsedPdfData.cajas) || 0,
      pesoFact: parseFloat(parsedPdfData.peso) || 0,
      flete: parseFloat(parsedPdfData.flete) || 0,
      provision: parsedPdfData.provision || "",
      transportadora: parsedPdfData.transportadora || "",
      placa: "",
      conductor: "",
      celular: "",
      estado: "Pendiente",
      obs: "Creado automáticamente desde escaneo inteligente de Pedido Cliente.",
      direccion: matchedCustomerObj ? matchedCustomerObj.dir : ""
    };

    // Save the order to system immediately so it's guaranteed to be saved
    const savedOrder = handleAddOrder(newOrder);

    // Open detailed control modal so they can review and add details if needed
    setEditingOrder({
      ...savedOrder,
      facturado: savedOrder.facturado || 0,
      cajasFact: savedOrder.cajasFact || 0,
      pesoFact: savedOrder.pesoFact || 0,
    });
    setIsOrderFormOpen(true);
    setParsedPdfData(null);
  };

  const handleUpdateOrderFromProvisionPdf = () => {
    if (!parsedPdfData) return;
    const targetOrderId = pdfSelectedMatchOrderId || (pdfMatchingOrder ? pdfMatchingOrder.id : '');
    if (!targetOrderId) return;

    const existing = orders.find(o => o.id === targetOrderId);
    if (existing) {
      const fleteVal = parseFloat(parsedPdfData.flete) || 0;
      handleUpdateOrder({
        ...existing,
        provision: parsedPdfData.provision || existing.provision,
        flete: fleteVal || existing.flete,
        transportadora: parsedPdfData.transportadora || existing.transportadora,
        obs: `${existing.obs || ''} | Prov. Flete IA: ${parsedPdfData.provision || 'S/N'} por $${(fleteVal || 0).toLocaleString('es-CO')}`.slice(0, 300)
      });
      
      setPSuccessToast({
        title: "PROVISIÓN ASOCIADA CON ÉXITO",
        message: `Se vinculó la provisión flete ${parsedPdfData.provision || 'S/N'} ($${fleteVal.toLocaleString('es-CO')}) a la orden ${existing.id}.`
      });
      setTimeout(() => setPSuccessToast(null), 6000);
    }
    setParsedPdfData(null);
    setPdfSelectedMatchOrderId('');
  };

  const handleOpenOrderForm = (order?: Order, isSplitAction?: boolean) => {
    setOrderFormClientSearch('');
    if (order) {
      if (isSplitAction) {
        // Setup blank pre-filled order but copy details from existing order for split shipment
        const activeMax = orders.reduce((max, o) => {
          const num = parseInt(o.id.replace('SOL-', ''));
          return isNaN(num) ? max : Math.max(max, num);
        }, 1000);
        const deletedMax = Object.keys(deletedOrderIds || {}).reduce((max, id) => {
          const num = parseInt(id.replace('SOL-', ''));
          return isNaN(num) ? max : Math.max(max, num);
        }, 1000);
        const maxNumericId = Math.max(activeMax, deletedMax);
        const newId = `SOL-${maxNumericId + 1}`;

        setEditingOrder({
          id: newId,
          pv: order.pv,
          oc: order.oc,
          fechaIngreso: new Date().toISOString().split('T')[0],
          fechaSalida: "",
          fechaEntrega: "",
          fechaFactura: "",
          horaCita: "",
          cliente: order.cliente,
          ciudad: order.ciudad,
          origen: order.origen,
          peso: order.peso,
          cajas: order.cajas,
          venta: order.venta,
          factura: "",
          facturado: 0,
          cajasFact: 0,
          pesoFact: 0,
          flete: 0,
          provision: "",
          transportadora: "",
          placa: "",
          conductor: "",
          celular: "",
          estado: "Pendiente",
          obs: `Despacho/Factura adicional para PV ${order.pv}`,
          isSplit: true
        });
      } else {
        let initFacturado = order.facturado;
        const numFactura = Number(String(order.factura).replace(/[^0-9]/g, ''));
        if (
          !initFacturado ||
          initFacturado === numFactura ||
          (initFacturado > 0 && initFacturado < 100000 && order.venta > 100000)
        ) {
          initFacturado = order.venta;
        }
        const matchedCarrier = carriers.find(c => c.nombre.trim().toUpperCase() === (order.transportadora || '').trim().toUpperCase());
        setEditingOrder({
          ...order,
          transportadora: matchedCarrier ? matchedCarrier.nombre : (order.transportadora || ''),
          facturado: initFacturado,
          cajasFact: order.cajasFact || 0,
          pesoFact: order.pesoFact || 0,
        });
      }
    } else {
      // Setup blank pre-filled order with safe ID generation checking both active and deleted orders
      const activeMax = orders.reduce((max, o) => {
        const num = parseInt(o.id.replace('SOL-', ''));
        return isNaN(num) ? max : Math.max(max, num);
      }, 1000);
      const deletedMax = Object.keys(deletedOrderIds || {}).reduce((max, id) => {
        const num = parseInt(id.replace('SOL-', ''));
        return isNaN(num) ? max : Math.max(max, num);
      }, 1000);
      const maxNumericId = Math.max(activeMax, deletedMax);
      const newId = `SOL-${maxNumericId + 1}`;

      setEditingOrder({
        id: newId,
        pv: "",
        oc: "",
        fechaIngreso: new Date().toISOString().split('T')[0],
        fechaSalida: "",
        fechaEntrega: "",
        fechaFactura: "",
        horaCita: "",
        cliente: customers[0]?.nombre || "",
        ciudad: customers[0]?.ciudad || "",
        origen: "ACOPI-YUMBO",
        peso: 0,
        cajas: 0,
        venta: 0,
        factura: "",
        facturado: 0,
        cajasFact: 0,
        pesoFact: 0,
        flete: 0,
        provision: "",
        transportadora: "",
        placa: "",
        conductor: "",
        celular: "",
        estado: "Pendiente",
        obs: ""
      });
    }
    setIsOrderFormOpen(true);
  };

  // Carrier form state helper
  const [carrierName, setCarrierName] = useState('');
  const [carrierNit, setCarrierNit] = useState('');
  const [carrierSede, setCarrierSede] = useState('');
  const [carrierDir, setCarrierDir] = useState('');
  const [carrierCont, setCarrierCont] = useState('');
  const [carrierTel, setCarrierTel] = useState('');
  const [carrierMail, setCarrierMail] = useState('');
  const [carrierCost, setCarrierCost] = useState(0);
  const [carrierTipoCalculo, setCarrierTipoCalculo] = useState<'fijo' | 'formula'>('fijo');
  const [carrierPorcentajeValor, setCarrierPorcentajeValor] = useState<number>(0);
  const [carrierCostoCaja, setCarrierCostoCaja] = useState<number>(0);

  const handleOpenCarrierForm = (id?: string) => {
    if (id) {
      const match = carriers.find(c => c.id === id);
      if (match) {
        setEditingCarrierId(id);
        setCarrierName(match.nombre);
        setCarrierNit(match.nit);
        setCarrierSede(match.ciudad);
        setCarrierDir(match.dir);
        setCarrierCont(match.contacto);
        setCarrierTel(match.tel);
        setCarrierMail(match.correo);
        setCarrierCost(match.costoSugerido);
        setCarrierTipoCalculo(match.tipoCalculo || 'fijo');
        setCarrierPorcentajeValor(match.porcentajeValor || 0);
        setCarrierCostoCaja(match.costoCaja || 0);
      }
    } else {
      setEditingCarrierId(null);
      setCarrierName('');
      setCarrierNit('');
      setCarrierSede('');
      setCarrierDir('');
      setCarrierCont('');
      setCarrierTel('');
      setCarrierMail('');
      setCarrierCost(0);
      setCarrierTipoCalculo('fijo');
      setCarrierPorcentajeValor(0);
      setCarrierCostoCaja(0);
    }
    setIsCarrierFormOpen(true);
  };

  const handleSaveCarrier = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = carrierName.toUpperCase().trim();
    const cleanNit = carrierNit.toUpperCase().trim();
    const cleanSede = carrierSede.toUpperCase().trim();
    const cleanDir = carrierDir.toUpperCase().trim();
    const cleanCont = carrierCont.toUpperCase().trim();
    const cleanTel = carrierTel.toUpperCase().trim();
    const cleanMail = carrierMail.toUpperCase().trim();

    if (editingCarrierId) {
      const updated = carriers.map(c => c.id === editingCarrierId ? {
        ...c,
        nombre: cleanName,
        nit: cleanNit,
        ciudad: cleanSede,
        dir: cleanDir,
        contacto: cleanCont,
        tel: cleanTel,
        correo: cleanMail,
        costoSugerido: carrierCost,
        tipoCalculo: carrierTipoCalculo,
        porcentajeValor: carrierPorcentajeValor,
        costoCaja: carrierCostoCaja
      } : c);
      saveCarriers(updated);
    } else {
      const nextId = getNextCarrierId(carriers);
      const updated = [...carriers, {
        id: nextId,
        nombre: cleanName,
        nit: cleanNit,
        ciudad: cleanSede,
        dir: cleanDir,
        contacto: cleanCont,
        tel: cleanTel,
        correo: cleanMail,
        costoSugerido: carrierCost,
        tipoCalculo: carrierTipoCalculo,
        porcentajeValor: carrierPorcentajeValor,
        costoCaja: carrierCostoCaja
      }];
      saveCarriers(updated);
    }
    setIsCarrierFormOpen(false);
  };

  const handleDeleteCarrier = (id: string) => {
    setCarrierToDelete(id);
  };

  const confirmDeleteCarrier = () => {
    if (!carrierToDelete) return;
    const updated = carriers.filter(c => c.id !== carrierToDelete);
    saveCarriers(updated);
    setCarrierToDelete(null);
    setIsCarrierFormOpen(false);
  };

  // Customer Form state helper
  const [custName, setCustName] = useState('');
  const [custCiudad, setCustCiudad] = useState('');
  const [custNit, setCustNit] = useState('');
  const [custDir, setCustDir] = useState('');
  const [custCont, setCustCont] = useState('');
  const [custCel, setCustCel] = useState('');
  const [custFijo, setCustFijo] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custMalla, setCustMalla] = useState('');
  const [custCita, setCustCita] = useState<'SI' | 'NO'>('NO');
  const [custZona, setCustZona] = useState('');
  const [custObs, setCustObs] = useState('');

  const handleOpenCustomerForm = (id?: string) => {
    if (id) {
      const match = customers.find(c => c.id === id);
      if (match) {
        setEditingCustomerId(id);
        setCustName(match.nombre);
        setCustCiudad(match.ciudad);
        setCustNit(match.nit);
        setCustDir(match.dir);
        setCustCont(match.contacto);
        setCustCel(match.celular);
        setCustFijo(match.fijo);
        setCustEmail(match.email);
        setCustMalla(match.malla);
        setCustCita(match.cita);
        setCustZona(match.zona);
        setCustObs(match.obs);
      }
    } else {
      setEditingCustomerId(null);
      setCustName('');
      setCustCiudad('');
      setCustNit('');
      setCustDir('');
      setCustCont('');
      setCustCel('');
      setCustFijo('');
      setCustEmail('');
      setCustMalla('');
      setCustCita('NO');
      setCustZona('');
      setCustObs('');
    }
    setIsCustomerFormOpen(true);
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = custName.toUpperCase().trim();
    const cleanCiudad = custCiudad.toUpperCase().trim();
    const cleanNit = custNit.toUpperCase().trim();
    const cleanDir = custDir.toUpperCase().trim();
    const cleanCont = custCont.toUpperCase().trim();
    const cleanCel = custCel.toUpperCase().trim();
    const cleanFijo = custFijo.toUpperCase().trim();
    const cleanEmail = custEmail.toUpperCase().trim();
    const cleanMalla = custMalla.toUpperCase().trim();
    const cleanCita = (custCita.toUpperCase().trim() === 'SI' ? 'SI' : 'NO') as 'SI' | 'NO';
    const cleanZona = custZona.toUpperCase().trim();
    const cleanObs = custObs.toUpperCase().trim();

    if (editingCustomerId) {
      const updated = customers.map(c => c.id === editingCustomerId ? {
        ...c,
        nombre: cleanName,
        ciudad: cleanCiudad,
        nit: cleanNit,
        dir: cleanDir,
        contacto: cleanCont,
        celular: cleanCel,
        fijo: cleanFijo,
        email: cleanEmail,
        malla: cleanMalla,
        cita: cleanCita,
        zona: cleanZona,
        obs: cleanObs
      } : c);
      saveCustomers(updated);
    } else {
      const nextId = getNextCustomerId(customers);
      const updated = [...customers, {
        id: nextId,
        nombre: cleanName,
        ciudad: cleanCiudad,
        nit: cleanNit,
        dir: cleanDir,
        contacto: cleanCont,
        celular: cleanCel,
        fijo: cleanFijo,
        email: cleanEmail,
        malla: cleanMalla,
        cita: cleanCita,
        zona: cleanZona,
        obs: cleanObs
      }];
      saveCustomers(updated);
    }
    setIsCustomerFormOpen(false);
  };
  
  const handleDeleteCustomer = (id: string) => {
    setCustomerToDelete(id);
  };

  const confirmDeleteCustomer = () => {
    if (!customerToDelete) return;
    const updated = customers.filter(c => c.id !== customerToDelete);
    saveCustomers(updated);
    setCustomerToDelete(null);
    setIsCustomerFormOpen(false);
  };

  // Custom calculated statistics for App.tsx pages representation
  const despachadosList = useMemo(() => {
    return orders.filter(o => {
      if (o.estado === 'Anulado') return false;
      return o.estado === 'Despachado' || o.estado === 'En Sitio / Bodega' || o.estado === 'Entregado';
    });
  }, [orders]);

  const filteredDespachados = useMemo(() => {
    let list = despachadosList;

    // General keyword search
    if (despachadoSearch.trim()) {
      list = list.filter(o => matchOrderSearch(o, despachadoSearch));
      list = sortOrdersBySearchRelevance(list, despachadoSearch);
    }

    // Specific filters
    if (despachadoFilterCliente.trim()) {
      const term = despachadoFilterCliente.toLowerCase().trim();
      list = list.filter(o => o.cliente && o.cliente.toLowerCase().includes(term));
    }

    if (despachadoFilterCarrier.trim()) {
      const term = despachadoFilterCarrier.toLowerCase().trim();
      list = list.filter(o => o.transportadora && o.transportadora.toLowerCase().includes(term));
    }

    if (despachadoFilterFactura.trim()) {
      const term = despachadoFilterFactura.toLowerCase().trim();
      const cleanTerm = term.replace(/[\s\-_/.]/g, '');
      list = list.filter(o => 
        (o.factura && o.factura.toLowerCase().includes(term)) ||
        (o.pv && o.pv.toLowerCase().includes(term)) ||
        (o.id && o.id.toLowerCase().includes(term)) ||
        (o.oc && o.oc.toLowerCase().includes(term)) ||
        (o.provision && o.provision.toLowerCase().includes(term)) ||
        (cleanTerm.length > 0 && o.factura && o.factura.replace(/[\s\-_/.]/g, '').toLowerCase().includes(cleanTerm)) ||
        (cleanTerm.length > 0 && o.pv && o.pv.replace(/[\s\-_/.]/g, '').toLowerCase().includes(cleanTerm)) ||
        matchOrderSearch(o, despachadoFilterFactura)
      );
    }

    if (despachadoFilterPv.trim()) {
      const term = despachadoFilterPv.toLowerCase().trim();
      const cleanTerm = term.replace(/[\s\-_/.]/g, '');
      list = list.filter(o => 
        (o.pv && o.pv.toLowerCase().includes(term)) ||
        (o.id && o.id.toLowerCase().includes(term)) ||
        (o.factura && o.factura.toLowerCase().includes(term)) ||
        (o.oc && o.oc.toLowerCase().includes(term)) ||
        (o.provision && o.provision.toLowerCase().includes(term)) ||
        (cleanTerm.length > 0 && o.factura && o.factura.replace(/[\s\-_/.]/g, '').toLowerCase().includes(cleanTerm)) ||
        (cleanTerm.length > 0 && o.pv && o.pv.replace(/[\s\-_/.]/g, '').toLowerCase().includes(cleanTerm)) ||
        matchOrderSearch(o, despachadoFilterPv)
      );
    }

    if (despachadoFilterMes) {
      const targetM = parseInt(despachadoFilterMes, 10);
      list = list.filter(o => {
        const dateToUse = o.fechaSalida || o.fechaFactura || o.fechaIngreso || '';
        if (!dateToUse) return false;
        const cleaned = dateToUse.toString().trim().split('T')[0].split(' ')[0].replace(/[.\/]/g, '-');
        const parts = cleaned.split('-');
        let m = 0;
        if (parts.length >= 3) {
          if (parts[0].length === 4) {
            m = parseInt(parts[1], 10);
          } else if (parts[2].length === 4) {
            m = parseInt(parts[1], 10);
          }
        }
        if (!m) {
          const dObj = new Date(dateToUse);
          if (!isNaN(dObj.getTime())) m = dObj.getMonth() + 1;
        }
        return m === targetM;
      });
    }

    return list;
  }, [
    despachadosList,
    despachadoSearch,
    despachadoFilterCliente,
    despachadoFilterCarrier,
    despachadoFilterFactura,
    despachadoFilterPv,
    despachadoFilterMes
  ]);

  const totalDespachadosPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredDespachados.length / despachadoItemsPerPage));
  }, [filteredDespachados, despachadoItemsPerPage]);

  useEffect(() => {
    if (despachadoPage > totalDespachadosPages) {
      setDespachadoPage(Math.max(1, totalDespachadosPages));
    }
  }, [totalDespachadosPages, despachadoPage]);

  const paginatedDespachados = useMemo(() => {
    const startIndex = (despachadoPage - 1) * despachadoItemsPerPage;
    return filteredDespachados.slice(startIndex, startIndex + despachadoItemsPerPage);
  }, [filteredDespachados, despachadoPage, despachadoItemsPerPage]);

  const pendientesList = useMemo(() => {
    return orders.filter(o => {
      if (o.estado === 'Anulado') return false;
      return o.estado === 'Pendiente' || o.estado === 'En Cargue';
    });
  }, [orders]);

  const filteredPendientes = useMemo(() => {
    if (!pendienteSearch.trim()) return pendientesList;
    let filtered = pendientesList.filter(o => matchOrderSearch(o, pendienteSearch));
    return sortOrdersBySearchRelevance(filtered, pendienteSearch);
  }, [pendientesList, pendienteSearch]);

  const paginatedPendientes = useMemo(() => {
    const startIndex = (pendientePage - 1) * 12;
    return filteredPendientes.slice(startIndex, startIndex + 12);
  }, [filteredPendientes, pendientePage]);

  const totalPendientesPages = useMemo(() => {
    return Math.ceil(filteredPendientes.length / 12) || 1;
  }, [filteredPendientes]);

  const paginatedCarriers = useMemo(() => {
    const startIndex = (carrierPage - 1) * 12;
    return carriers.slice(startIndex, startIndex + 12);
  }, [carriers, carrierPage]);

  const totalCarriersPages = useMemo(() => {
    return Math.ceil(carriers.length / 12) || 1;
  }, [carriers]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const term = normalizeText(customerSearch);
    return customers.filter(c => {
      const full = normalizeText(`${c.nombre} ${c.nit || ''} ${c.ciudad || ''} ${c.contacto || ''} ${c.malla || ''}`);
      return full.includes(term);
    });
  }, [customers, customerSearch]);

  const paginatedCustomers = useMemo(() => {
    const startIndex = (customerPage - 1) * 8;
    return filteredCustomers.slice(startIndex, startIndex + 8);
  }, [filteredCustomers, customerPage]);

  const totalCustomersPages = useMemo(() => {
    return Math.ceil(filteredCustomers.length / 8) || 1;
  }, [filteredCustomers]);

  // Excel Excel generic export helper using SheetJS (XLSX)
  const handleExportToExcel = (headers: string[], rows: any[][], fileName: string) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Datos");
    XLSX.writeFile(wb, fileName);
  };

  const exportDespachadosToExcel = (exportAll = false) => {
    const listToExport = exportAll ? despachadosList : filteredDespachados;
    const headers = [
      "ID Flete", 
      "Pedido de Venta (PV)", 
      "Orden de Compra (OC)", 
      "Fecha Ingreso", 
      "Fecha Salida", 
      "Fecha Entrega", 
      "Fecha Factura", 
      "Hora Cita", 
      "Cliente", 
      "Ciudad / Destino", 
      "Origen", 
      "Socio Operador (Transportadora)", 
      "Placa Vehículo", 
      "Conductor", 
      "Celular Conductor", 
      "Estado", 
      "Nro Factura Venta", 
      "Valor Inicial Venta", 
      "Valor Facturado Final", 
      "Cajas Solicitadas", 
      "Cajas Facturadas", 
      "Peso Solicitado (kg)", 
      "Peso Facturado (kg)", 
      "Costo Flete ($)", 
      "Porcentaje Flete s/ Factura (%)", 
      "Factura Provisión", 
      "Observaciones"
    ];
    
    const rows = listToExport.map(o => {
      const actualVal = o.facturado && o.facturado > 0 ? o.facturado : o.venta;
      const pct = actualVal > 0 ? Number(((o.flete / actualVal) * 100).toFixed(2)) : 0;
      return [
        o.id,
        o.pv || '',
        o.oc || '',
        o.fechaIngreso || '',
        o.fechaSalida || '',
        o.fechaEntrega || '',
        o.fechaFactura || '',
        o.horaCita || '',
        o.cliente || '',
        o.ciudad || '',
        o.origen || '',
        o.transportadora || '',
        o.placa || '',
        o.conductor || '',
        o.celular || '',
        o.estado || '',
        o.factura || '',
        o.venta || 0,
        o.facturado || o.venta,
        o.cajas || 0,
        o.cajasFact || o.cajas,
        o.peso || 0,
        o.pesoFact || o.peso,
        o.flete || 0,
        pct,
        o.provision || '',
        o.obs || ''
      ];
    });

    const prefix = exportAll ? "todos_despachos_completos" : "despachos_filtrados_completos";
    handleExportToExcel(
      headers,
      rows,
      `${prefix}_sistemalog_${new Date().toISOString().split('T')[0]}.xlsx`
    );
  };

  const exportPendientesToExcel = () => {
    const headers = ["Flete ID", "Cliente Solicitante", "Localidad", "Cajas", "Peso (kg)", "Valor Comercial", "Estado"];
    const rows = filteredPendientes.map(o => [
      o.id,
      o.cliente,
      o.ciudad,
      o.cajas,
      o.peso,
      o.venta,
      o.estado
    ]);
    handleExportToExcel(
      headers,
      rows,
      `pendientes_sistemalog_${new Date().toISOString().split('T')[0]}.xlsx`
    );
  };

  const exportCarriersToExcel = () => {
    const headers = ["NIT", "Socio Operador", "Sede Central", "Dirección", "Canal Contacto", "Celular/Tel", "Correo", "Tarifa Sugerida"];
    const rows = carriers.map(c => [
      c.nit || '',
      c.nombre,
      c.ciudad,
      c.dir || '',
      c.contacto || '',
      c.tel || '',
      c.correo || '',
      c.costoSugerido
    ]);
    handleExportToExcel(
      headers,
      rows,
      `socios_operadores_${new Date().toISOString().split('T')[0]}.xlsx`
    );
  };

  const exportCustomersToExcel = () => {
    const headers = ["Razón Social", "NIT", "Dirección Exacta", "Ciudad", "Contacto", "Celular", "Malla Entrega", "Requiere Cita"];
    const rows = customers.map(c => [
      c.nombre,
      c.nit || '',
      c.dir || '',
      c.ciudad || '',
      c.contacto || '',
      c.celular || '',
      c.malla || '',
      c.cita || 'NO'
    ]);
    handleExportToExcel(
      headers,
      rows,
      `clientes_sistemalog_${new Date().toISOString().split('T')[0]}.xlsx`
    );
  };

  const handleUniversalExcelExport = () => {
    const today = new Date().toISOString().split('T')[0];

    if (activeTab === 'inicio') {
      // Export all collections to a multi-sheet Excel file
      const wb = XLSX.utils.book_new();

      // Sheet 1: Solicitudes
      const ordersHeaders = [
        "Código", "PV", "OC", "Ingreso", "Cliente", "Ciudad", "Estado", "Flete", 
        "Transportadora", "VentaOriginal", "CajasOriginal", "PesoOriginal", 
        "VentaFacturado", "CajasFacturado", "PesoFacturado", "FacturaSocio", "Provisión"
      ];
      const ordersRows = orders.map(o => [
        o.id, o.pv, o.oc, o.fechaIngreso, o.cliente, o.ciudad, o.estado, o.flete,
        o.transportadora, o.venta, o.cajas, o.peso, o.facturado || o.venta,
        o.cajasFact || o.cajas, o.pesoFact || o.peso, o.factura || '', o.provision || ''
      ]);
      const wsOrders = XLSX.utils.aoa_to_sheet([ordersHeaders, ...ordersRows]);
      XLSX.utils.book_append_sheet(wb, wsOrders, "Solicitudes Fletes");

      // Sheet 2: Socios Operadores
      const carrierHeaders = ["NIT", "Socio Operador", "Sede Central", "Dirección", "Canal Contacto", "Celular/Tel", "Correo", "Tarifa Sugerida"];
      const carrierRows = carriers.map(c => [
        c.nit || '', c.nombre, c.ciudad, c.dir || '', c.contacto || '', c.tel || '', c.correo || '', c.costoSugerido
      ]);
      const wsCarriers = XLSX.utils.aoa_to_sheet([carrierHeaders, ...carrierRows]);
      XLSX.utils.book_append_sheet(wb, wsCarriers, "Socios Operadores");

      // Sheet 3: Clientes
      const customerHeaders = ["Razón Social", "NIT", "Dirección Exacta", "Ciudad", "Contacto", "Celular", "Malla Entrega", "Requiere Cita"];
      const customerRows = customers.map(c => [
        c.nombre, c.nit || '', c.dir || '', c.ciudad || '', c.contacto || '', c.celular || '', c.malla || '', c.cita || 'NO'
      ]);
      const wsCustomers = XLSX.utils.aoa_to_sheet([customerHeaders, ...customerRows]);
      XLSX.utils.book_append_sheet(wb, wsCustomers, "Clientes");

      XLSX.writeFile(wb, `master_sistemalog_${today}.xlsx`);
    } else if (activeTab === 'facturacion') {
      const headers = [
        "Código", "PV", "OC", "Ingreso", "Cliente", "Ciudad", "Estado", "Flete", 
        "Transportadora", "VentaOriginal", "CajasOriginal", "PesoOriginal", 
        "VentaFacturado", "CajasFacturado", "PesoFacturado", "FacturaSocio", "Provisión"
      ];
      const rows = orders.map(o => [
        o.id, o.pv, o.oc, o.fechaIngreso, o.cliente, o.ciudad, o.estado, o.flete,
        o.transportadora, o.venta, o.cajas, o.peso, o.facturado || o.venta,
        o.cajasFact || o.cajas, o.pesoFact || o.peso, o.factura || '', o.provision || ''
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Solicitudes");
      XLSX.writeFile(wb, `solicitudes_sistemalog_${today}.xlsx`);
    } else if (activeTab === 'despachado') {
      exportDespachadosToExcel();
    } else if (activeTab === 'pendiente') {
      exportPendientesToExcel();
    } else if (activeTab === 'vehiculos') {
      const activeAssignments = orders.filter(o => o.estado !== 'Anulado' && o.placa);
      const headers = ["Identidad Orden", "Placa", "Conductor", "Celular", "Transportadora", "Destino", "Masa (kg)", "Categoría"];
      const rows = activeAssignments.map(o => {
        const size = o.peso <= 5000 ? "Turbo" :
                      o.peso > 5000 && o.peso <= 6500 ? "Liviano" :
                      o.peso > 6500 && o.peso <= 10000 ? "Sencillo" :
                      o.peso > 10000 && o.peso <= 18000 ? "Mula" : "Patineta";
        return [o.id, o.placa || '', o.conductor || '', o.celular || '', o.transportadora || '', o.ciudad || '', o.peso, size];
      });
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Censo de Flota");
      XLSX.writeFile(wb, `censo_de_flota_${today}.xlsx`);
    } else if (activeTab === 'transportadoras') {
      exportCarriersToExcel();
    } else if (activeTab === 'clientes') {
      exportCustomersToExcel();
    } else if (activeTab === 'provision') {
      const filteredForProvision = orders.filter(o => o.estado === 'Despachado' || o.estado === 'Entregado');
      const headers = ["Flete ID", "Fecha Despacho", "Cliente", "Socio Transportador", "Destino", "Costo Flete", "Factura Provisión (FP)"];
      const rows = filteredForProvision.map(o => [
        o.id, o.fechaSalida || '---', o.cliente, o.transportadora, o.ciudad, o.flete, o.provision || ''
      ]);
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Auditoría Provisiones");
      XLSX.writeFile(wb, `auditoria_provisiones_${today}.xlsx`);
    } else if (activeTab === 'diferencias') {
      const differenceItems = orders.filter(o => 
        (o.estado === 'Entregado' || o.estado === 'Despachado') && 
        ((o.facturado >= 0 && o.facturado < o.venta) || (o.cajasFact >= 0 && o.cajasFact < o.cajas) || (o.pesoFact >= 0 && o.pesoFact < o.peso))
      );
      const headers = ["Flete ID", "Cliente", "Unidades Vendidas", "Unidades Facturadas", "Cajas Rechazadas", "Peso Rechazado", "Pérdida Comercial"];
      const rows = differenceItems.map(o => {
        const devVal = o.venta - (o.facturado > 0 ? o.facturado : o.venta);
        const devCj = o.cajas - (o.cajasFact > 0 ? o.cajasFact : o.cajas);
        const devKg = o.peso - (o.pesoFact > 0 ? o.pesoFact : o.peso);
        return [o.id, o.cliente, o.cajas, o.cajasFact || o.cajas, devCj, devKg, devVal];
      });
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Auditoría Averías");
      XLSX.writeFile(wb, `auditoria_averias_${today}.xlsx`);
    } else {
      // Default fallback
      const wb = XLSX.utils.book_new();
      const ordersHeaders = ["Código", "PV", "OC", "Cliente", "Ciudad", "Estado", "Flete"];
      const ordersRows = orders.map(o => [o.id, o.pv, o.oc, o.cliente, o.ciudad, o.estado, o.flete]);
      const wsOrders = XLSX.utils.aoa_to_sheet([ordersHeaders, ...ordersRows]);
      XLSX.utils.book_append_sheet(wb, wsOrders, "Resumen Fletes");
      XLSX.writeFile(wb, `export_general_${today}.xlsx`);
    }
  };

  const activeTracking = useMemo(() => {
    return orders.filter(o => o.estado === 'Despachado' || o.estado === 'En Cargue');
  }, [orders]);

  // Helpers for customer Malla checkboxes
  const isMallaDaySelected = (dayName: string): boolean => {
    return custMalla.split(',').map((s: string) => s.trim().toLowerCase()).includes(dayName.toLowerCase());
  };

  const toggleMallaDay = (dayName: string): void => {
    const list = custMalla.split(',').map((s: string) => s.trim()).filter(Boolean);
    const index = list.findIndex((s: string) => s.toLowerCase() === dayName.toLowerCase());
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(dayName);
    }
    setCustMalla(list.join(', '));
  };

  const handleUpdateEditingOrderField = (field: keyof Order, value: any) => {
    if (!editingOrder) return;
    const nextOrder = { ...editingOrder, [field]: value };

    const isDispatched = ['Despachado', 'En Sitio / Bodega', 'Entregado', 'Finalizado'].includes(editingOrder.estado);

    if (!isDispatched) {
      const vFact = Number(nextOrder.facturado) > 0 ? Number(nextOrder.facturado) : Number(nextOrder.venta || 0);
      const cFact = Number(nextOrder.cajasFact) > 0 ? Number(nextOrder.cajasFact) : Number(nextOrder.cajas || 0);

      // When the carrier (transportadora) is modified, set flete:
      if (field === 'transportadora') {
        nextOrder.flete = calculateCarrierFlete(value, vFact, cFact, carriers, nextOrder.cliente);
      } else {
        // If relevant fields change, automatically recalculate flete if carrier has a formula:
        if (['facturado', 'cajasFact', 'venta', 'cajas'].includes(field as string)) {
          const matched = carriers.find(c => c.nombre.trim().toUpperCase() === (nextOrder.transportadora || '').trim().toUpperCase());
          const hasFormula = (matched && matched.tipoCalculo === 'formula') || 
                            (!matched && nextOrder.transportadora && 
                             nextOrder.transportadora.toUpperCase().includes("FREDY") && 
                             (nextOrder.transportadora.toUpperCase().includes("HERNANDEZ") || nextOrder.transportadora.toUpperCase().includes("HERNÁNDEZ")));
          if (hasFormula) {
            nextOrder.flete = calculateCarrierFlete(nextOrder.transportadora, vFact, cFact, carriers, nextOrder.cliente);
          }
        }
      }
    }
    setEditingOrder(nextOrder);
  };

  return (
    <div className="min-h-screen bg-hud-bg text-slate-100 flex overflow-hidden">
      
      {/* ⚠️ Auth Gateway Portal Overlay */}
      {!isAuthenticated && !isEmployeeMode ? (
        <div className="fixed inset-0 bg-hud-bg/95 flex items-center justify-center p-4 z-[99999]">
          <div className="bg-hud-card border-2 border-hud-accent rounded-2xl w-full max-w-md p-8 shadow-2xl relative overflow-hidden">
            
            {/* Hologram aesthetic lines */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-hud-accent/5 rounded-full blur-3xl pointer-events-none"></div>

            <div className="text-center space-y-4 mb-8">
              <div className="inline-block bg-hud-accent/10 p-3 rounded-full border border-hud-accent/35">
                <Lock className="w-8 h-8 text-hud-accent pulse-led" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-display font-extrabold text-white tracking-widest uppercase">CONTROL DE ACCESO SEGURO</h2>
                <p className="text-[10px] text-hud-accent font-mono tracking-widest uppercase">SISTEMALOG S.A.S. | DIVISIÓN LOGÍSTICA</p>
              </div>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-5 text-xs font-mono">
              <div className="space-y-2">
                <label className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Identificador de Usuario</label>
                <input 
                  type="email" 
                  required
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  className="bg-slate-950 border border-hud-accent/25 focus:border-hud-accent/80 text-white rounded-lg p-3 w-full outline-none uppercase font-bold text-[11px] tracking-wide"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider font-mono">Clave de Acceso Encriptada</label>
                <input 
                  type="password" 
                  required
                  value={loginPass}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-950 border border-hud-accent/25 focus:border-hud-accent/80 text-white rounded-lg p-3 w-full outline-none"
                />
              </div>

              {authError && (
                <p className="text-rose-500 font-bold text-[10px] bg-rose-500/10 p-2.5 rounded border border-rose-500/25">
                  {authError}
                </p>
              )}

              <button 
                type="submit"
                className="bg-hud-accent text-slate-950 w-full py-3.5 rounded-xl font-display font-black tracking-widest text-xs uppercase cursor-pointer hover:bg-hud-accent/80 transition-all flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" /> Autenticar Sesión Segura
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {/* Main Structural Drawer Sidebar */}
      {!isEmployeeMode && (
      <aside className={`bg-hud-card border-r border-hud-border/50 ${sidebarOpen ? 'w-64' : 'w-0 -translate-x-full md:w-16 md:translate-x-0'} shrink-0 z-40 transition-all duration-300 flex flex-col justify-between print:hidden`}>
        <div className="overflow-y-auto flex-1 py-6 px-4 space-y-6">
          
          {/* Logo brand */}
          <div className="flex items-center gap-3 pb-4 border-b border-sky-950/60">
            <div className="bg-hud-accent/10 p-2 rounded-lg border border-hud-accent/25">
              <Truck className="w-6 h-6 text-hud-accent pulse-led" />
            </div>
            {sidebarOpen && (
              <div className="space-y-0.5">
                <div className="font-display font-black text-xs text-white tracking-widest uppercase">SISTEMALOG</div>
                <div className="text-[9px] text-[#476a8a] font-mono tracking-wider font-extrabold uppercase">Sistema Logístico</div>
              </div>
            )}
          </div>

          {/* Tab Navigation Categories */}
          <div className="space-y-4">
            
            {/* Category: Módulos Operativos */}
            <div className="space-y-1.5">
              {sidebarOpen ? (
                <button
                  type="button"
                  onClick={() => setExpandedCategories(prev => ({ ...prev, operativos: !prev.operativos }))}
                  className="w-full flex items-center justify-between text-[11px] font-mono font-black text-slate-100 hover:text-white tracking-widest uppercase px-3 py-2 text-left cursor-pointer select-none transition-colors border-b border-slate-800/80 mb-1"
                >
                  <span>Módulos Operativos</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-300 transition-transform ${expandedCategories.operativos ? 'rotate-0' : '-rotate-90'}`} />
                </button>
              ) : null}
              {(!sidebarOpen || expandedCategories.operativos) && (
                <div className="space-y-0.5 font-mono text-[11px] font-medium">
                  <button 
                    onClick={() => setActiveTab('inicio')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'inicio' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <Home className="w-4 h-4" />
                    {sidebarOpen && <span>Inicio</span>}
                  </button>

                  <button 
                    onClick={() => setActiveTab('facturacion')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'facturacion' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <ClipboardList className="w-4 h-4" />
                    {sidebarOpen && <span>Solicitudes</span>}
                  </button>

                  <button 
                    onClick={() => setActiveTab('despachado')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'despachado' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {sidebarOpen && <span>Despachados</span>}
                  </button>

                  <button 
                    onClick={() => setActiveTab('pendiente')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'pendiente' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <Clock className="w-4 h-4" />
                    {sidebarOpen && <span translate="no" className="notranslate">Pendientes</span>}
                  </button>

                  <button 
                    onClick={() => setActiveTab('vehiculos')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'vehiculos' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <Truck className="w-4 h-4" />
                    {sidebarOpen && <span>Vehículos</span>}
                  </button>

                  <button 
                    onClick={() => setActiveTab('agenda')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'agenda' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <Calendar className="w-4 h-4 text-hud-accent" />
                    {sidebarOpen && <span>Agenda / Citas</span>}
                  </button>
                </div>
              )}
            </div>

            {/* Category: Entidades */}
            <div className="space-y-1.5">
              {sidebarOpen ? (
                <button
                  type="button"
                  onClick={() => setExpandedCategories(prev => ({ ...prev, entidades: !prev.entidades }))}
                  className="w-full flex items-center justify-between text-[11px] font-mono font-black text-slate-100 hover:text-white tracking-widest uppercase px-3 py-2 text-left cursor-pointer select-none transition-colors border-b border-slate-800/80 mb-1"
                >
                  <span>Entidades</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-300 transition-transform ${expandedCategories.entidades ? 'rotate-0' : '-rotate-90'}`} />
                </button>
              ) : null}
              {(!sidebarOpen || expandedCategories.entidades) && (
                <div className="space-y-0.5 font-mono text-[11px] font-medium">
                  <button 
                    onClick={() => setActiveTab('transportadoras')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'transportadoras' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <Truck className="w-4 h-4" />
                    {sidebarOpen && <span>Operadores</span>}
                  </button>

                  <button 
                    onClick={() => setActiveTab('clientes')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'clientes' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <Users className="w-4 h-4" />
                    {sidebarOpen && <span>Clientes</span>}
                  </button>
                </div>
              )}
            </div>

            {/* Category: Control y Finanzas */}
            <div className="space-y-1.5">
              {sidebarOpen ? (
                <button
                  type="button"
                  onClick={() => setExpandedCategories(prev => ({ ...prev, control: !prev.control }))}
                  className="w-full flex items-center justify-between text-[11px] font-mono font-black text-slate-100 hover:text-white tracking-widest uppercase px-3 py-2 text-left cursor-pointer select-none transition-colors border-b border-slate-800/80 mb-1"
                >
                  <span>Control y Finanzas</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-300 transition-transform ${expandedCategories.control ? 'rotate-0' : '-rotate-90'}`} />
                </button>
              ) : null}
              {(!sidebarOpen || expandedCategories.control) && (
                <div className="space-y-0.5 font-mono text-[11px] font-medium">
                  <button 
                    onClick={() => setActiveTab('provision')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'provision' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <DollarSign className="w-4 h-4" />
                    {sidebarOpen && <span translate="no" className="notranslate">Provisiones</span>}
                  </button>

                  <button 
                    onClick={() => setActiveTab('diferencias')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'diferencias' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <ShieldAlert className="w-4 h-4" />
                    {sidebarOpen && <span>Diferencias</span>}
                  </button>

                  <button 
                    onClick={() => setActiveTab('recordatorios')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'recordatorios' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <Bell className="w-4 h-4" />
                    {sidebarOpen && <span>Recordatorios</span>}
                  </button>

                  <button 
                    onClick={() => setActiveTab('liquidador')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'liquidador' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <Sliders className="w-4 h-4 text-hud-accent" />
                    {sidebarOpen && <span>Liquidador Carga</span>}
                  </button>

                  <button 
                    onClick={() => setActiveTab('horasExtras')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'horasExtras' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold text-slate-100' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <Clock className="w-4 h-4 text-amber-400 font-bold" />
                    {sidebarOpen && <span>Horas Extras</span>}
                  </button>

                  <button 
                    onClick={() => setActiveTab('pedidoEmpleados')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'pedidoEmpleados' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <ShoppingBag className="w-4 h-4 text-orange-450 font-bold" />
                    {sidebarOpen && <span>Pedido Empleados</span>}
                  </button>
                </div>
              )}
            </div>

            {/* Category: Inteligencia */}
            <div className="space-y-1.5">
              {sidebarOpen ? (
                <button
                  type="button"
                  onClick={() => setExpandedCategories(prev => ({ ...prev, inteligencia: !prev.inteligencia }))}
                  className="w-full flex items-center justify-between text-[11px] font-mono font-black text-slate-100 hover:text-white tracking-widest uppercase px-3 py-2 text-left cursor-pointer select-none transition-colors border-b border-slate-800/80 mb-1"
                >
                  <span>Inteligencia y GPS</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-300 transition-transform ${expandedCategories.inteligencia ? 'rotate-0' : '-rotate-90'}`} />
                </button>
              ) : null}
              {(!sidebarOpen || expandedCategories.inteligencia) && (
                <div className="space-y-0.5 font-mono text-[11px] font-medium">
                  <button 
                    onClick={() => setActiveTab('seguimiento')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'seguimiento' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <Activity className="w-4 h-4" />
                    {sidebarOpen && <span>Seguimiento</span>}
                  </button>

                  <button 
                    onClick={() => setActiveTab('mapas')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'mapas' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <Map className="w-4 h-4" />
                    {sidebarOpen && <span>Mapas Pro</span>}
                  </button>

                  <button 
                    onClick={() => setActiveTab('dashboard')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'dashboard' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <ChevronDown className="w-4 h-4 -rotate-90" />
                    {sidebarOpen && <span>Análisis de Datos</span>}
                  </button>

                  <button 
                    onClick={() => setActiveTab('dialogo')}
                    className={`w-full text-left rounded-lg p-3 flex items-center gap-3 transition-colors ${activeTab === 'dialogo' ? 'bg-hud-accent/10 border-l-2 border-hud-accent text-hud-accent font-bold' : 'text-slate-200 hover:text-white hover:bg-slate-900/50 font-semibold'}`}
                  >
                    <ClipboardList className="w-4 h-4" />
                    {sidebarOpen && <span>Novedades Diálogo</span>}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Sidebar Footer block */}
        <div className="p-4 border-t border-sky-950/40 space-y-2">
          {sidebarOpen && (
            <div className="bg-slate-950/80 border border-hud-accent/30 rounded-lg p-2.5 text-[10px] font-mono space-y-0.5">
              <div className="text-hud-accent font-bold uppercase tracking-wider">Propietario Principal</div>
              <div className="text-white font-bold truncate" title="soporteyabi@gmail.com">soporteyabi@gmail.com</div>
              <div className="text-emerald-400 text-[9px]">● Cuenta Firebase</div>
            </div>
          )}
          <button 
            onClick={handleLogout}
            className="w-full text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 p-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors text-xs font-mono"
          >
            <LogOut className="w-4 h-4" />
            {sidebarOpen && <span className="font-bold">Cerrar Sesión</span>}
          </button>
        </div>
      </aside>
      )}

      {/* Main Container Core Feed */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Core Header */}
        {!isEmployeeMode && (
        <header className="bg-hud-card border-b border-hud-border/50 h-16 shrink-0 flex items-center justify-between px-6 z-30 print:hidden">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSidebarOpen(prev => !prev)}
              className="text-slate-400 hover:text-hud-accent p-1 cursor-pointer transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="hidden md:flex flex-col">
              <h1 className="text-sm font-display font-extrabold text-white tracking-widest uppercase">SISTEMALOG S.A.S.</h1>
              <span className="text-[10px] text-slate-400 font-mono tracking-wider font-semibold">Central de Control de Operaciones Logísticas</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono font-bold">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-950/80 border border-hud-accent/30 text-[10px] font-mono">
              <span className="text-slate-400 font-bold uppercase">Propietario:</span>
              <span className="text-hud-accent font-bold">soporteyabi@gmail.com</span>
            </div>
            {isPdfParsing ? (
              <button 
                disabled
                className="bg-slate-900/40 border border-slate-800 text-slate-500 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 text-[10px] font-bold font-mono tracking-wider"
              >
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-hud-green" /> DIGITALIZANDO...
              </button>
            ) : (
              <button 
                onClick={() => pdfFileInputRef.current?.click()}
                className="bg-hud-green/10 border border-hud-green/30 text-hud-green hover:bg-hud-green/20 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer uppercase text-[10px] font-bold tracking-wider transition-all"
                title="Cargar y digitalizar PDF inteligente (Pedido o Provisión)"
              >
                <Upload className="w-3.5 h-3.5 text-hud-green" /> Cargar PDF
              </button>
            )}
            <input 
              type="file" 
              ref={pdfFileInputRef} 
              onChange={e => {
                if (e.target.files && e.target.files.length > 0) {
                  processPdfFile(e.target.files[0]);
                }
                e.target.value = ''; // Permite volver a seleccionar el mismo archivo
              }}
              accept=".pdf"
              className="hidden" 
            />

            <label className="flex items-center gap-1.5 cursor-pointer select-none text-slate-400 hover:text-white transition-colors" title="Activa esto solo si el PDF es una imagen escaneada y requiere OCR con IA (más lento)">
              <input 
                type="checkbox" 
                checked={useAi} 
                onChange={e => setUseAi(e.target.checked)}
                className="w-3.5 h-3.5 accent-hud-green rounded border-slate-800 bg-slate-950 text-hud-green cursor-pointer"
              />
              <span className="text-[10px] uppercase font-mono tracking-wider font-bold">Usar IA (Lento)</span>
            </label>

            <button 
              onClick={() => {
                setBackupRestoreMessage(null);
                setIsBackupModalOpen(true);
              }}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer transition-all border font-mono text-[10px] uppercase font-bold ${
                cloudStatus.connected && cloudStatus.isSyncedWithServer
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' 
                  : cloudStatus.connected
                  ? 'bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
              }`}
              title={`Sincronización multi-dispositivo activa en base de datos ${cloudStatus.databaseId}. Último sync servidor: ${cloudStatus.lastServerSyncTime || 'Conectando...'}`}
            >
              <span className={`w-2 h-2 rounded-full ${cloudStatus.connected ? (cloudStatus.isSyncedWithServer ? 'bg-emerald-400 pulse-led' : 'bg-sky-400') : 'bg-amber-400'}`}></span>
              <span>{cloudStatus.connected ? (cloudStatus.isSyncedWithServer ? '4-PC NUBE OK' : 'SYNC NUBE...') : 'MODO LOCAL'}</span>
              <span className="bg-slate-900 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-[9px] ml-0.5 flex items-center gap-1">
                <Database className="w-3 h-3 text-hud-accent" /> BACKUP
              </span>
            </button>

            {/* Sync Queue Monitor Button */}
            <button 
              onClick={() => setIsSyncMonitorOpen(true)}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-2 cursor-pointer transition-all border font-mono text-[10px] uppercase font-bold ${
                syncStats.failed > 0
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20 animate-pulse'
                  : syncStats.pending > 0
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                  : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20'
              }`}
              title="Monitor de Sincronización Atómica y Cola de Eventos (Despacho -> Provisiones -> Análisis)"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>COLA SYNC</span>
              {syncStats.pending > 0 && (
                <span className="bg-amber-500 text-slate-950 font-extrabold px-1.5 py-0.5 rounded-full text-[9px]">
                  {syncStats.pending}
                </span>
              )}
              {syncStats.failed > 0 && (
                <span className="bg-rose-500 text-white font-extrabold px-1.5 py-0.5 rounded-full text-[9px]">
                  {syncStats.failed} ERR
                </span>
              )}
            </button>

            {/* Manual PDF Button */}
            <button
              onClick={() => generateAppStructurePdf()}
              className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-all border font-mono text-[10px] uppercase font-bold bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20"
              title="Genera e imprime el Manual Completo en PDF con la Estructura y Funcionamiento de la App"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />
              <span>MANUAL PDF</span>
            </button>

            <button 
              onClick={() => handleOpenOrderForm()}
              className="bg-hud-accent/10 border border-hud-accent/30 text-hud-accent hover:bg-hud-accent/20 px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer uppercase text-[10px]"
            >
              <ListPlus className="w-4 h-4" /> Crear Flete
            </button>
          </div>
        </header>
        )}

        {/* Tab Module router */}
        <main className={`flex-1 overflow-y-auto scroll-smooth bg-hud-bg relative ${isEmployeeMode ? 'p-2 sm:p-4' : 'p-6'}`}>
          
          {/* Active Tab Router */}
          {activeTab === 'inicio' ? (
            <HomeModule 
              orders={orders} 
              onOpenOrder={handleOpenOrderForm}
              customersCount={customers.length}
            />
          ) : null}

          {activeTab === 'facturacion' ? (
            <OrdersModule 
              orders={orders}
              customers={customers}
              carriers={carriers}
              onAddOrder={handleAddOrder}
              onAddOrders={handleAddOrders}
              onUpdateOrder={handleUpdateOrder}
              onUpdateOrders={handleUpdateOrders}
              onDeleteOrder={onDeleteOrder}
              onOpenOrderForm={handleOpenOrderForm}
              onDeleteImportedOrders={handleDeleteImportedOrders}
              onResetDatabase={handleResetDatabase}
              onDeduplicateOrders={handleManualDeduplicate}
            />
          ) : null}

          {activeTab === 'despachado' ? (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-900">
                <div className="space-y-1">
                  <h2 className="text-xl font-display font-extrabold text-[#00ffa3] tracking-widest flex items-center gap-2 uppercase">
                    <CheckCircle2 className="w-5 h-5 text-hud-green" /> Historial de Pedidos Despachados
                  </h2>
                  <p className="text-xs text-slate-400">Archivos consolidados de fletes despachados con factura (Finalizado, Entregado y Despachado)</p>
                </div>
              </div>

              {/* Advanced multi-criteria search and filters panel */}
              <div className="bg-hud-card border border-slate-900 rounded-xl p-4 space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-900/60 pb-2">
                  <span className="text-xs font-bold text-hud-accent tracking-wider uppercase font-mono flex items-center gap-1.5">
                    ⚙️ PANEL DE BÚSQUEDA Y FILTROS AVANZADOS
                  </span>
                  <button 
                    onClick={() => {
                      setDespachadoSearch('');
                      setDespachadoFilterCliente('');
                      setDespachadoFilterCarrier('');
                      setDespachadoFilterFactura('');
                      setDespachadoFilterPv('');
                      setDespachadoFilterMes('');
                    }}
                    className="text-[10px] bg-slate-950 border border-slate-800 text-slate-400 hover:text-white px-2 py-0.5 rounded cursor-pointer transition-colors uppercase font-mono font-bold"
                  >
                    Limpiar Filtros
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {/* PV */}
                  <div>
                    <label className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider mb-1 font-mono">Pedido de Venta (PV)</label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-600 absolute left-2.5 top-2.5" />
                      <input 
                        type="text" 
                        placeholder="Buscar por PV..."
                        value={despachadoFilterPv}
                        onChange={e => setDespachadoFilterPv(e.target.value)}
                        className="bg-slate-950 border border-slate-800 text-xs text-white rounded pl-8 pr-2.5 py-2 w-full outline-none focus:border-hud-accent transition-all font-mono"
                      />
                    </div>
                  </div>

                  {/* Factura */}
                  <div>
                    <label className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider mb-1 font-mono">Factura de Venta</label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-600 absolute left-2.5 top-2.5" />
                      <input 
                        type="text" 
                        placeholder="Buscar por Factura..."
                        value={despachadoFilterFactura}
                        onChange={e => setDespachadoFilterFactura(e.target.value)}
                        className="bg-slate-950 border border-slate-800 text-xs text-white rounded pl-8 pr-2.5 py-2 w-full outline-none focus:border-hud-accent transition-all font-mono"
                      />
                    </div>
                  </div>

                  {/* Cliente */}
                  <div>
                    <label className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider mb-1 font-mono">Cliente</label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-600 absolute left-2.5 top-2.5" />
                      <input 
                        type="text" 
                        placeholder="Buscar por Cliente..."
                        value={despachadoFilterCliente}
                        onChange={e => setDespachadoFilterCliente(e.target.value)}
                        className="bg-slate-950 border border-slate-800 text-xs text-white rounded pl-8 pr-2.5 py-2 w-full outline-none focus:border-hud-accent transition-all font-mono"
                      />
                    </div>
                  </div>

                  {/* Transportadora */}
                  <div>
                    <label className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider mb-1 font-mono">Transportadora</label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-600 absolute left-2.5 top-2.5" />
                      <input 
                        type="text" 
                        placeholder="Buscar por Operador..."
                        value={despachadoFilterCarrier}
                        onChange={e => setDespachadoFilterCarrier(e.target.value)}
                        className="bg-slate-950 border border-slate-800 text-xs text-white rounded pl-8 pr-2.5 py-2 w-full outline-none focus:border-hud-accent transition-all font-mono"
                      />
                    </div>
                  </div>

                  {/* Mes */}
                  <div>
                    <label className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider mb-1 font-mono">Mes de Registro</label>
                    <select
                      value={despachadoFilterMes}
                      onChange={e => setDespachadoFilterMes(e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-xs text-white rounded px-2.5 py-2 w-full outline-none focus:border-hud-accent transition-all font-mono cursor-pointer font-bold"
                    >
                      <option value="">📆 TODOS LOS MESES</option>
                      <option value="01">Enero</option>
                      <option value="02">Febrero</option>
                      <option value="03">Marzo</option>
                      <option value="04">Abril</option>
                      <option value="05">Mayo</option>
                      <option value="06">Junio</option>
                      <option value="07">Julio</option>
                      <option value="08">Agosto</option>
                      <option value="09">Septiembre</option>
                      <option value="10">Octubre</option>
                      <option value="11">Noviembre</option>
                      <option value="12">Diciembre</option>
                    </select>
                  </div>
                </div>

                {/* Combined quick general filter fallback */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-900/40 text-[10px] text-slate-500 font-mono">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00ffa3] animate-pulse"></span>
                    <span>Búsqueda general rápida:</span>
                    <input 
                      type="text" 
                      placeholder="Buscar por ID, placa, ciudad..."
                      value={despachadoSearch}
                      onChange={e => setDespachadoSearch(e.target.value)}
                      className="bg-slate-950/60 border border-slate-850 text-slate-300 rounded px-2 py-1 w-52 outline-none focus:border-hud-accent text-[9px]"
                    />
                  </div>
                  <div>
                    <span>Registros coincidentes: <strong className="text-[#00ffa3]">{filteredDespachados.length}</strong></span>
                  </div>
                </div>
              </div>

              {/* Top-Left Pagination & Export Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-hud-card border border-hud-border/30 rounded-lg text-xs font-mono">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Pagination widget */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setDespachadoPage(1)}
                      disabled={despachadoPage === 1}
                      className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer text-xs"
                      title="Primera página"
                    >
                      &laquo;
                    </button>
                    <button
                      onClick={() => setDespachadoPage(p => Math.max(1, p - 1))}
                      disabled={despachadoPage === 1}
                      className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-[#00ffa3] disabled:opacity-20 cursor-pointer text-xs flex items-center"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    
                    <div className="flex items-center gap-1 text-[#00ffa3] font-bold px-1 text-xs">
                      <span>PÁG.</span>
                      <input
                        type="number"
                        min={1}
                        max={totalDespachadosPages}
                        value={despachadoPage}
                        onChange={e => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            setDespachadoPage(Math.max(1, Math.min(totalDespachadosPages, val)));
                          }
                        }}
                        className="w-12 bg-slate-900 border border-slate-700 text-[#00ffa3] font-bold text-center rounded py-0.5 text-xs outline-none focus:border-[#00ffa3]"
                      />
                      <span>/ {totalDespachadosPages}</span>
                    </div>

                    <button
                      onClick={() => setDespachadoPage(p => Math.min(totalDespachadosPages, p + 1))}
                      disabled={despachadoPage >= totalDespachadosPages}
                      className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-[#00ffa3] disabled:opacity-20 cursor-pointer text-xs flex items-center"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDespachadoPage(totalDespachadosPages)}
                      disabled={despachadoPage >= totalDespachadosPages}
                      className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer text-xs"
                      title="Última página"
                    >
                      &raquo;
                    </button>
                  </div>

                  {/* Items per page selector */}
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <span>Filas:</span>
                    <select
                      value={despachadoItemsPerPage}
                      onChange={e => {
                        setDespachadoItemsPerPage(Number(e.target.value));
                        setDespachadoPage(1);
                      }}
                      className="bg-slate-900 border border-slate-700 text-[#00ffa3] font-bold text-xs rounded px-2 py-0.5 outline-none focus:border-[#00ffa3] cursor-pointer"
                    >
                      <option value={15}>15 filas</option>
                      <option value={25}>25 filas</option>
                      <option value={50}>50 filas</option>
                      <option value={100}>100 filas</option>
                      <option value={250}>250 filas</option>
                      <option value={9999}>Todas</option>
                    </select>
                  </div>

                  {/* Export Options (Complete Information) */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => exportDespachadosToExcel(false)}
                      className="bg-hud-green/10 border border-hud-green/30 text-[#00ffa3] hover:bg-hud-green/20 px-3 py-1.5 rounded text-[10px] font-mono tracking-wider flex items-center gap-1.5 cursor-pointer uppercase font-black transition-all"
                      title="Exportar registros filtrados con todos los campos"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-hud-green" /> Exportar Filtrados (Completo)
                    </button>

                    <button
                      onClick={() => exportDespachadosToExcel(true)}
                      className="bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 px-3 py-1.5 rounded text-[10px] font-mono tracking-wider flex items-center gap-1.5 cursor-pointer uppercase font-black transition-all"
                      title="Exportar todos los registros despachados, entregados y finalizados del sistema con todos los campos"
                    >
                      <Download className="w-3.5 h-3.5 text-sky-450 text-sky-400" /> Exportar Todos los Despachos (Completo)
                    </button>
                  </div>
                </div>

                <div className="text-slate-400 text-xs">
                  Mostrando <strong className="text-white">{filteredDespachados.length === 0 ? 0 : (despachadoPage - 1) * despachadoItemsPerPage + 1}-{Math.min(filteredDespachados.length, despachadoPage * despachadoItemsPerPage)}</strong> de <strong className="text-[#00ffa3]">{filteredDespachados.length}</strong> despachos fletados
                </div>
              </div>

              {/* Table rendering of dispatched orders */}
              <div className="bg-hud-card border border-hud-border/50 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#030610] text-[#476a8a] border-b border-hud-border/40 text-[10px] tracking-widest uppercase">
                      <tr>
                        <th className="p-4">ID / PV</th>
                        <th className="p-4">Cliente</th>
                        <th className="p-4 flex-1">Destino & Transportador</th>
                        <th className="p-4">Placa</th>
                        <th className="p-4">Factura N°</th>
                        <th className="p-4 text-center">Cajas (Fact/Solic)</th>
                        <th className="p-4 text-center">Peso (Fact/Solic)</th>
                        <th className="p-4 text-center">Valor Facturado ($)</th>
                        <th className="p-4 text-center">% Flete s/ Fact</th>
                        <th className="p-4 text-center">Flete Valor</th>
                        <th className="p-4 text-center">Estado</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-950/65 text-slate-300">
                      {paginatedDespachados.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="p-8 text-center text-slate-500">No hay registros despachados en muelle.</td>
                        </tr>
                      ) : (
                        paginatedDespachados.map(o => {
                          const actualVal = o.facturado && o.facturado > 0 ? o.facturado : o.venta;
                          const pct = actualVal > 0 ? (o.flete / actualVal) * 100 : 0;
                          
                          let colorClass = "text-[#00ffa3] font-extrabold";
                          if (pct > 15) colorClass = "text-rose-400 font-extrabold";
                          else if (pct > 10) colorClass = "text-hud-orange font-extrabold";

                          return (
                            <tr key={o.id} className="hover:bg-slate-900/10">
                              <td className="p-4 font-bold text-white">{o.id} <span className="text-[9px] block text-slate-500">PV: <span className="text-yellow-400 font-bold">{o.pv}</span></span></td>
                              <td className="p-4 font-sans font-medium text-white">{o.cliente}</td>
                              <td className="p-4 font-sans text-slate-400">
                                <div>{o.ciudad}</div>
                                <div className="text-[10px] text-slate-500 font-mono font-medium">{o.transportadora}</div>
                              </td>
                              <td className="p-4 font-bold text-white">{o.placa || "N/A"}</td>
                              <td className="p-4 text-[#00ffa3] font-bold">{o.factura || "FALTANTE"}</td>
                              <td className="p-4 text-center">
                                <span className="text-white font-bold">{o.cajasFact || o.cajas}</span>
                                <span className="text-[10px] text-slate-500 font-normal"> / {o.cajas}</span>
                              </td>
                              <td className="p-4 text-center text-slate-300">
                                <span className="text-slate-200 font-bold">{(o.pesoFact || o.peso).toLocaleString()}</span>
                                <span className="text-[10px] text-slate-500 font-normal"> / {o.peso.toLocaleString()} kg</span>
                              </td>
                              <td className="p-4 text-center text-hud-green font-bold">
                                ${(o.facturado || o.venta).toLocaleString('es-CO')}
                                <span className="text-[9px] text-slate-500 block font-normal">Solicitado: ${o.venta.toLocaleString('es-CO')}</span>
                              </td>
                              <td className="p-4 text-center">
                                <span className={`${colorClass} font-mono`}>{pct.toFixed(2)}%</span>
                              </td>
                              <td className="p-4 text-center text-hud-green font-bold">${o.flete.toLocaleString('es-CO')}</td>
                              <td className="p-4 text-center">
                                <span className="text-[9px] bg-hud-green/10 border border-hud-green text-hud-green px-2 py-0.5 rounded font-mono uppercase font-bold">
                                  {o.estado}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'pendiente' ? (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-900">
                <div className="space-y-1">
                  <h2 className="text-xl font-display font-extrabold text-[#ffab00] tracking-widest flex items-center gap-2 uppercase">
                    <Clock className="w-5 h-5 text-hud-orange" /> Pedidos Pendientes de Despacho
                  </h2>
                  <p className="text-xs text-slate-400">Órdenes digitales verificadas esperando asignación flete masivo</p>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="Filtrar pendientes..."
                    value={pendienteSearch}
                    onChange={e => setPendienteSearch(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-xs text-white rounded px-8 py-1.5 w-60 outline-none"
                  />
                </div>
              </div>

              {/* Top-Left Pagination & Export Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-hud-card border border-hud-border/30 rounded-lg text-xs font-mono">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Pagination widget */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPendientePage(1)}
                      disabled={pendientePage === 1}
                      className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer text-xs"
                      title="Primera página"
                    >
                      &laquo;
                    </button>
                    <button
                      onClick={() => setPendientePage(p => Math.max(1, p - 1))}
                      disabled={pendientePage === 1}
                      className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-[#ffab00] disabled:opacity-20 cursor-pointer text-xs flex items-center"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    
                    <span className="text-[#ffab00] font-bold px-2">
                      PÁG. {pendientePage} / {totalPendientesPages}
                    </span>

                    <button
                      onClick={() => setPendientePage(p => Math.min(totalPendientesPages, p + 1))}
                      disabled={pendientePage === totalPendientesPages}
                      className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-[#ffab00] disabled:opacity-20 cursor-pointer text-xs flex items-center"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setPendientePage(totalPendientesPages)}
                      disabled={pendientePage === totalPendientesPages}
                      className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer text-xs"
                      title="Última página"
                    >
                      &raquo;
                    </button>
                  </div>

                  {/* Export button */}
                  <button
                    onClick={exportPendientesToExcel}
                    className="bg-hud-orange/10 border border-hud-orange/30 text-[#ffab00] hover:bg-hud-orange/20 px-3 py-1 rounded text-[10px] font-mono tracking-wider flex items-center gap-1.5 cursor-pointer uppercase font-bold transition-all"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-hud-orange" /> Exportar a Excel
                  </button>
                </div>

                <div className="text-slate-400 text-xs">
                  Mostrando <strong className="text-white">{filteredPendientes.length === 0 ? 0 : (pendientePage - 1) * 12 + 1}-{Math.min(filteredPendientes.length, pendientePage * 12)}</strong> de <strong className="text-[#ffab00]">{filteredPendientes.length}</strong> pendientes
                </div>
              </div>

              {/* Pendientes table list */}
              <div className="bg-hud-card border border-hud-border/70 rounded-lg overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#030610] text-[#476a8a] border-b border-hud-border/40 text-[10px] tracking-widest uppercase">
                    <tr>
                      <th className="p-3">Flete ID</th>
                      <th className="p-3">Pedido PV</th>
                      <th className="p-3">Orden OC</th>
                      <th className="p-3">Cliente Solicitante</th>
                      <th className="p-3">Localidad</th>
                      <th className="p-3 text-center">Cajas (cj)</th>
                      <th className="p-3 text-center">Peso</th>
                      <th className="p-3 text-center">Valor Comercial</th>
                      <th className="p-3 text-center">Fecha Ingreso</th>
                      <th className="p-3 text-center">Estado</th>
                      <th className="p-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 text-slate-300">
                    {paginatedPendientes.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-slate-500">Muelle libre. No hay solicitudes pendientes de flete.</td>
                      </tr>
                    ) : (
                      paginatedPendientes.map(o => (
                        <tr key={o.id} className="hover:bg-slate-900/10">
                          <td className="p-3 font-bold text-white">{o.id}</td>
                          <td className="p-3 font-mono text-yellow-400 font-bold">{o.pv || '-'}</td>
                          <td className="p-3 font-mono text-slate-300">{o.oc || '-'}</td>
                          <td className="p-3 font-sans font-medium text-white">{o.cliente}</td>
                          <td className="p-3 font-sans text-slate-400">{o.ciudad}</td>
                          <td className="p-3 text-center font-bold text-white">{o.cajas} cj</td>
                          <td className="p-3 text-center text-hud-green">{o.peso} kg</td>
                          <td className="p-3 text-center text-hud-green font-bold">${o.venta.toLocaleString('es-CO')}</td>
                          <td className="p-3 text-center text-slate-400">{o.fechaIngreso || '-'}</td>
                          <td className="p-3 text-center">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${
                              o.estado === 'En Cargue'
                                ? 'bg-hud-orange/10 border border-hud-orange text-hud-orange'
                                : 'bg-hud-accent/10 border border-hud-accent text-hud-accent'
                            }`}>
                              {o.estado}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenOrderForm(o)} 
                                className="text-[10px] font-mono border border-hud-accent/30 text-hud-accent px-2.5 py-1 rounded cursor-pointer hover:bg-hud-accent/15 transition-all uppercase font-bold"
                              >
                                Editar / Asignar
                              </button>
                              <button
                                onClick={() => triggerAuditCancellation(o.id)}
                                className="text-[10px] font-mono border border-rose-500/30 text-rose-400 px-2 py-1 rounded cursor-pointer hover:bg-rose-500/15 transition-all uppercase font-bold flex items-center gap-1"
                                title="Eliminar o Anular Solicitud"
                              >
                                <Trash2 className="w-3 h-3 text-rose-400" /> Eliminar
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
          ) : null}

          {activeTab === 'vehiculos' ? (
            <VehiclesModule 
              orders={orders} 
              onOpenOrder={handleOpenOrderForm}
            />
          ) : null}

          {/* Tab: Operadores / Transportadoras CRUD */}
          {activeTab === 'transportadoras' ? (
            <div className="space-y-6 animate-fade-in font-mono text-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-900">
                <div className="space-y-1">
                  <h2 className="text-xl font-display font-extrabold text-hud-accent tracking-widest flex items-center gap-2 uppercase">
                    <Truck className="w-5 h-5 text-hud-accent" /> Socios Operadores de Transporte
                  </h2>
                  <p className="text-xs text-slate-400">Lista contractual de transportadoras habilitadas nacionalmente</p>
                </div>

                <button 
                  onClick={() => handleOpenCarrierForm()}
                  className="bg-hud-accent text-slate-950 font-black tracking-widest px-4 py-2.5 rounded-lg flex items-center gap-1.5 uppercase hover:scale-[1.01]"
                >
                  <Plus className="w-4 h-4" /> Nuevo Operador
                </button>
              </div>

              {/* Top-Left Pagination & Export Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-hud-card border border-hud-border/30 rounded-lg text-xs font-mono">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Pagination widget */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCarrierPage(1)}
                      disabled={carrierPage === 1}
                      className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer text-xs"
                      title="Primera página"
                    >
                      &laquo;
                    </button>
                    <button
                      onClick={() => setCarrierPage(p => Math.max(1, p - 1))}
                      disabled={carrierPage === 1}
                      className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-[#00ffa3] disabled:opacity-20 cursor-pointer text-xs flex items-center"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    
                    <span className="text-[#00ffa3] font-bold px-2">
                      PÁG. {carrierPage} / {totalCarriersPages}
                    </span>

                    <button
                      onClick={() => setCarrierPage(p => Math.min(totalCarriersPages, p + 1))}
                      disabled={carrierPage === totalCarriersPages}
                      className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-[#00ffa3] disabled:opacity-20 cursor-pointer text-xs flex items-center"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setCarrierPage(totalCarriersPages)}
                      disabled={carrierPage === totalCarriersPages}
                      className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer text-xs"
                      title="Última página"
                    >
                      &raquo;
                    </button>
                  </div>

                  {/* Export button */}
                  <button
                    onClick={exportCarriersToExcel}
                    className="bg-hud-accent/10 border border-hud-accent/30 text-hud-accent hover:bg-hud-accent/20 px-3 py-1 rounded text-[10px] font-mono tracking-wider flex items-center gap-1.5 cursor-pointer uppercase font-bold transition-all"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-hud-accent" /> Exportar a Excel
                  </button>
                </div>

                <div className="text-slate-400 text-xs">
                  Mostrando <strong className="text-white">{carriers.length === 0 ? 0 : (carrierPage - 1) * 12 + 1}-{Math.min(carriers.length, carrierPage * 12)}</strong> de <strong className="text-hud-accent">{carriers.length}</strong> transportadoras
                </div>
              </div>

              {/* Table List of Carriers */}
              <div className="bg-hud-card border border-hud-border/70 rounded-lg overflow-hidden shadow-xl">
                <table className="w-full text-left">
                  <thead className="bg-[#030610] text-[#476a8a] border-b border-hud-border/40 text-[10px] tracking-widest uppercase">
                    <tr>
                      <th className="p-4">Identidad</th>
                      <th className="p-4">NIT</th>
                      <th className="p-4">Sede Central</th>
                      <th className="p-4">Canal Contacto</th>
                      <th className="p-4 text-right">Tarifa Sugerida</th>
                      <th className="p-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 text-slate-300 font-mono">
                    {paginatedCarriers.map(c => (
                      <tr key={c.id} className="hover:bg-slate-900/10">
                        <td className="p-4 font-bold text-white">{c.nombre}</td>
                        <td className="p-4 text-slate-400">{c.nit}</td>
                        <td className="p-4">
                          <div className="font-bold text-white">{c.ciudad}</div>
                          {c.dir && <div className="text-[10px] text-slate-500 font-sans">{c.dir}</div>}
                        </td>
                        <td className="p-4 text-xs font-sans space-y-0.5">
                          <div className="font-semibold text-slate-200">💬 {c.contacto}</div>
                          <div className="text-[10px] text-slate-400 font-mono">📞 {c.tel}</div>
                          {c.correo && <div className="text-[10px] text-hud-accent font-mono truncate max-w-[200px]" title={c.correo}>✉️ {c.correo}</div>}
                        </td>
                        <td className="p-4 text-right text-hud-green font-bold">${c.costoSugerido.toLocaleString('es-CO')}</td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-3">
                            <button 
                              onClick={() => handleOpenCarrierForm(c.id)}
                              className="text-hud-accent hover:underline font-bold text-[10.5px] uppercase"
                            >
                              EDITAR
                            </button>
                            <span className="text-slate-800">|</span>
                            <button 
                              onClick={() => handleDeleteCarrier(c.id)}
                              className="text-red-400 hover:text-red-500 hover:underline font-bold text-[10.5px] uppercase"
                            >
                              ELIMINAR
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {/* Tab: Clientes CRUD */}
          {activeTab === 'clientes' ? (
            <div className="space-y-6 animate-fade-in font-mono text-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-900">
                <div className="space-y-1">
                  <h2 className="text-xl font-display font-extrabold text-[#00ffa3] tracking-widest flex items-center gap-2 uppercase">
                    <Users className="w-5 h-5 text-hud-green" /> Malla y Registro de Clientes
                  </h2>
                  <p className="text-xs text-slate-400">Planillas de requerimientos logísticos de entrega por andén</p>
                </div>

                <button 
                  onClick={() => handleOpenCustomerForm()}
                  className="bg-[#00ffa3] text-slate-950 font-black tracking-widest px-4 py-2.5 rounded-lg flex items-center gap-1.5 uppercase hover:scale-[1.01]"
                >
                  <Plus className="w-4 h-4" /> Registrar Cliente
                </button>
              </div>

              {/* Top-Left Pagination & Export Controls */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-hud-card border border-hud-border/30 rounded-xl text-xs font-mono">
                <div className="flex flex-wrap items-center gap-4">
                  {/* Pagination widget */}
                  <div className="flex items-center gap-1 bg-black/25 border border-slate-900 rounded-lg p-1">
                    <button
                      onClick={() => setCustomerPage(1)}
                      disabled={customerPage === 1}
                      className="px-2 py-1 rounded bg-slate-950 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer text-xs"
                      title="Primera página"
                    >
                      &laquo;
                    </button>
                    <button
                      onClick={() => setCustomerPage(p => Math.max(1, p - 1))}
                      disabled={customerPage === 1}
                      className="px-2 py-1 rounded bg-slate-950 text-slate-400 hover:text-[#00ffa3] disabled:opacity-20 cursor-pointer text-xs flex items-center"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    
                    <span className="text-[#00ffa3] font-bold px-3 text-[10.5px]">
                      PÁG. {customerPage} / {totalCustomersPages}
                    </span>

                    <button
                      onClick={() => setCustomerPage(p => Math.min(totalCustomersPages, p + 1))}
                      disabled={customerPage === totalCustomersPages}
                      className="px-2 py-1 rounded bg-slate-950 text-slate-400 hover:text-[#00ffa3] disabled:opacity-20 cursor-pointer text-xs flex items-center"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setCustomerPage(totalCustomersPages)}
                      disabled={customerPage === totalCustomersPages}
                      className="px-2 py-1 rounded bg-slate-950 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer text-xs"
                      title="Última página"
                    >
                      &raquo;
                    </button>
                  </div>

                  {/* Layout toggle */}
                  <div className="flex items-center bg-black/25 rounded-lg p-1 border border-slate-900 gap-1">
                    <button
                      type="button"
                      onClick={() => setCustomerViewMode('grid')}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 uppercase transition-all duration-300 ${
                        customerViewMode === 'grid'
                          ? 'bg-[#00ffa3] text-slate-950 font-black shadow-[0_0_10px_rgba(0,255,163,0.35)]'
                          : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" /> Tarjetas
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerViewMode('table')}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 uppercase transition-all duration-300 ${
                        customerViewMode === 'table'
                          ? 'bg-[#00ffa3] text-slate-950 font-black shadow-[0_0_10px_rgba(0,255,163,0.35)]'
                          : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" /> Tabla
                    </button>
                  </div>

                  {/* Export button */}
                  <button
                    onClick={exportCustomersToExcel}
                    className="bg-hud-green/10 border border-hud-green/30 text-[#00ffa3] hover:bg-hud-green/20 px-3.5 py-1.5 rounded-lg text-[10px] font-mono tracking-wider flex items-center gap-1.5 cursor-pointer uppercase font-bold transition-all"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-hud-green" /> Exportar
                  </button>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-550 absolute left-2.5 top-1/2 -translate-y-1/2 font-bold" />
                    <input 
                      type="text" 
                      placeholder="Buscar por Nombre, NIT, Ciudad, Malla..."
                      value={customerSearch}
                      onChange={e => setCustomerSearch(e.target.value)}
                      className="bg-slate-950 border border-slate-850 text-[11px] text-white rounded-lg pl-8 pr-3 py-1.5 w-64 outline-none focus:border-[#00ffa3]"
                    />
                    {customerSearch && (
                      <button 
                        onClick={() => setCustomerSearch('')}
                        className="text-[10px] text-hud-red hover:underline absolute right-2.5 top-1/2 -translate-y-1/2 font-mono uppercase"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-slate-400 text-xs mt-1 lg:mt-0">
                  Mostrando <strong className="text-white">{filteredCustomers.length === 0 ? 0 : (customerPage - 1) * 8 + 1}-{Math.min(filteredCustomers.length, customerPage * 8)}</strong> de <strong className="text-hud-green">{filteredCustomers.length}</strong> clientes
                </div>
              </div>

              {/* Dynamic View rendering depending on chosen mode */}
              {customerViewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {paginatedCustomers.map(c => (
                    <div 
                      key={c.id} 
                      className="group bg-slate-950/40 hover:bg-[#071324]/55 border border-slate-900 hover:border-[#00ffa3]/50 rounded-xl p-5 shadow-lg transition-all duration-300 hover:shadow-[0_0_20px_rgba(0,255,163,0.12)] flex flex-col justify-between relative overflow-hidden text-left"
                    >
                      {/* Interactive neon accent bar */}
                      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-[#00ffa3]/25 to-transparent group-hover:via-[#00ffa3]/80 transition-all duration-300"></div>
                      
                      <div className="space-y-4">
                        {/* Title, ID & City */}
                        <div className="flex items-start justify-between gap-3 border-b border-sky-950/40 pb-3">
                          <div className="space-y-1 min-w-0">
                            <span className="text-[9px] text-slate-500 tracking-widest font-mono uppercase block">ID: {c.id}</span>
                            <h3 
                              className="text-xs font-display font-extrabold text-white group-hover:text-[#00ffa3] uppercase tracking-wide transition-colors duration-300 line-clamp-2 leading-relaxed" 
                              title={c.nombre}
                            >
                              {c.nombre}
                            </h3>
                          </div>
                          <span className="bg-[#00ffa3]/10 text-[#00ffa3] border border-[#00ffa3]/30 text-[9px] font-black px-2 py-0.5 rounded tracking-widest uppercase font-mono shadow-[0_0_8px_rgba(0,255,163,0.1)] shrink-0 self-start">
                            {c.ciudad || "S/C"}
                          </span>
                        </div>

                        {/* Metadata Box */}
                        <div className="grid grid-cols-1 gap-2.5 text-[11px]">
                          {/* NIT info */}
                          <div className="flex items-center justify-between py-1 border-b border-slate-900/50">
                            <span className="text-slate-550 uppercase font-bold text-[9px] tracking-wider">MATRÍCULA NIT</span>
                            <span className="text-slate-300 font-mono font-bold">{c.nit || 'S/N'}</span>
                          </div>

                          {/* Address info */}
                          <div className="space-y-1 py-1">
                            <span className="text-slate-550 uppercase font-bold text-[9px] tracking-wider block">DIRECCIÓN DE DESCARGA</span>
                            <p className="text-slate-400 font-sans leading-normal text-[10.5px] line-clamp-2" title={c.dir}>
                              📍 {c.dir || 'No registrada'}
                            </p>
                          </div>

                          {/* Contact Details Panel */}
                          <div className="space-y-1 py-2 bg-black/25 rounded-lg px-2.5 border border-slate-900/45">
                            <span className="text-slate-550 uppercase font-bold text-[9px] tracking-wider block">CONTACTO ENCARGADO</span>
                            <div className="flex items-center justify-between text-slate-300">
                              <span className="truncate max-w-[120px] font-medium text-slate-200">👤 {c.contacto || 'No asignado'}</span>
                              {c.celular && <span className="text-[#00ffa3] font-bold font-mono">📱 {c.celular}</span>}
                            </div>
                            {c.email && (
                              <div className="text-[10px] text-slate-500 font-sans truncate block pt-0.5" title={c.email}>
                                ✉️ {c.email}
                              </div>
                            )}
                          </div>

                          {/* Malla of entrega */}
                          <div className="flex items-center justify-between py-1 border-b border-slate-900/50">
                            <span className="text-slate-550 uppercase font-bold text-[9px] tracking-wider">Malla Entrega</span>
                            <span className="text-hud-green font-bold text-[10px] tracking-wide bg-hud-green/10 px-2.5 py-0.5 rounded border border-hud-green/20">
                              {c.malla || "Mercancía Lista"}
                            </span>
                          </div>

                          {/* Cita requested */}
                          <div className="flex items-center justify-between py-1">
                            <span className="text-slate-550 uppercase font-bold text-[9px] tracking-wider">REQUIERE CITA</span>
                            <span className={`text-[9.5px] font-black px-2 py-0.5 rounded tracking-widest ${
                              c.cita === 'SI' 
                                ? 'bg-[#ff9100]/10 text-hud-orange border border-hud-orange/30 shadow-[0_0_8px_rgba(245,158,11,0.15)]' 
                                : 'bg-hud-green/10 text-hud-green border border-hud-green/30'
                            }`}>
                              {c.cita || 'NO'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Footer & Action Controls */}
                      <div className="mt-5 pt-3 border-t border-sky-950/40 flex items-center justify-between gap-2">
                        {c.zona ? (
                          <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                            Zona: {c.zona}
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-650 uppercase tracking-wider font-semibold">
                            Activo
                          </span>
                        )}
                        <div className="flex items-center gap-1.5">
                          <button 
                            onClick={() => handleDeleteCustomer(c.id)}
                            className="bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all duration-300 p-2 rounded-lg cursor-pointer"
                            title="Eliminar Cliente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleOpenCustomerForm(c.id)}
                            className="bg-[#00ffa3]/10 border border-[#00ffa3]/20 text-[#00ffa3] hover:bg-[#00ffa3] hover:text-slate-950 hover:border-[#00ffa3] transition-all duration-300 px-3 py-1.5 rounded-lg font-black text-[9px] tracking-widest uppercase flex items-center gap-1 cursor-pointer"
                          >
                            EDITAR
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {paginatedCustomers.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500 border border-dashed border-slate-900 rounded-xl bg-slate-950/25">
                      No se encontraron registros de clientes coincidentes.
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-hud-card border border-hud-border/70 rounded-xl overflow-hidden shadow-xl">
                  <table className="w-full text-left">
                    <thead className="bg-[#030610] text-[#476a8a] border-b border-hud-border/40 text-[10px] tracking-widest uppercase">
                      <tr>
                        <th className="p-4">Razón Social</th>
                        <th className="p-4">Nit</th>
                        <th className="p-4">Dirección Exacta</th>
                        <th className="p-4">Contacto</th>
                        <th className="p-4 text-center">Malla Entrega</th>
                        <th className="p-4 text-center">Cita</th>
                        <th className="p-4 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/60 text-slate-350 font-mono">
                      {paginatedCustomers.map(c => (
                        <tr key={c.id} className="hover:bg-slate-900/10">
                          <td className="p-4 font-bold text-white max-w-xs truncate">{c.nombre}</td>
                          <td className="p-4 text-[11px] text-slate-400">{c.nit}</td>
                          <td className="p-4 font-sans text-slate-400 max-w-xs truncate">{c.dir} ({c.ciudad})</td>
                          <td className="p-4">
                            <div>👤 {c.contacto}</div>
                            <div className="text-[10px] text-slate-500 font-mono">📱 {c.celular}</div>
                          </td>
                          <td className="p-4 text-center text-[10.5px] text-hud-green">{c.malla || "Mercancía Lista"}</td>
                          <td className="p-4 text-center">
                            <span className={`text-[9.5px] px-1.5 py-0.5 rounded ${
                              c.cita === 'SI' ? 'bg-[#ff9100]/10 text-hud-orange border border-hud-orange/30' : 'bg-hud-green/10 text-hud-green border border-hud-green/30'
                            }`}>
                              {c.cita}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-3">
                              <button 
                                onClick={() => handleOpenCustomerForm(c.id)}
                                className="text-[#00ffa3] hover:underline font-bold uppercase text-[10.5px]"
                              >
                                EDITAR
                              </button>
                              <span className="text-slate-800">|</span>
                              <button 
                                onClick={() => handleDeleteCustomer(c.id)}
                                className="text-red-400 hover:text-red-500 hover:underline font-bold uppercase text-[10.5px]"
                              >
                                ELIMINAR
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'provision' ? (
            <ProvisionesModule 
              orders={orders}
              carriers={carriers}
              onUpdateOrder={handleUpdateOrder}
              onBack={() => setActiveTab('inicio')}
            />
          ) : null}

          {activeTab === 'diferencias' ? (
            <DiferenciasModule orders={orders} />
          ) : null}

          {activeTab === 'recordatorios' ? (
            <RemindersModule 
              reminders={reminders}
              onAddReminder={row => saveReminders([...reminders, row])}
              onToggleReminder={id => saveReminders(reminders.map(r => r.id === id ? { ...r, completado: !r.completado } : r))}
              onDeleteReminder={id => saveReminders(reminders.filter(r => r.id !== id))}
            />
          ) : null}

          {activeTab === 'agenda' ? (
            <CitasModule customers={customers} />
          ) : null}

          {activeTab === 'seguimiento' ? (
            <div className="space-y-6 animate-fade-in font-mono text-xs">
              <div className="flex flex-col gap-1 pb-3 border-b border-slate-900">
                <h2 className="text-xl font-display font-extrabold text-[#00ffa3] tracking-widest flex items-center gap-2 uppercase">
                  <Activity className="w-5 h-5 text-hud-green pulse-led" /> Monitoreo y Seguimiento Satelital
                </h2>
                <p className="text-xs text-slate-400">Metodos de control de fletes despachados activos en ruta nacional</p>
              </div>

              {/* Timeline blocks */}
              <div className="space-y-4">
                {activeTracking.length === 0 ? (
                  <div className="bg-hud-card p-12 text-center text-slate-500 font-mono border border-slate-900 rounded-lg">
                    -- No se disponen de transportadores en tránsito actualmente --
                  </div>
                ) : (
                  activeTracking.map(track => (
                    <div key={track.id} className="bg-hud-card border border-hud-border/70 rounded-lg p-5 flex flex-col md:flex-row items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="bg-[#ffaa00]/10 border border-[#ffaa00] text-hud-orange text-[9px] font-bold px-2 py-0.5 rounded uppercase">
                            EN TRÁNSITO
                          </span>
                          <strong className="text-white font-sans text-sm">{track.cliente}</strong>
                        </div>
                        <p className="text-slate-405 font-sans leading-relaxed">
                          Flete <strong className="text-hud-accent">{track.id}</strong> transportado por <strong className="text-white">{track.transportadora}</strong> bajo mando de <strong className="text-[#00ffa3]">{track.conductor}</strong>.
                        </p>
                        <div className="flex items-center gap-4 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1 font-mono">
                            Placa: <strong className="text-white">{track.placa}</strong>
                          </span>
                          <span className="flex items-center gap-1 font-mono">
                            CBoxes: <strong className="text-white">{track.cajas}</strong>
                          </span>
                          <span className="flex items-center gap-1 font-mono">
                            Destino: <strong className="text-hud-accent">{track.ciudad}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {/* Rapid Status advance button */}
                        <button 
                          onClick={() => handleUpdateOrder({ ...track, estado: 'Entregado', fechaEntrega: new Date().toISOString().split('T')[0] })}
                          className="bg-hud-green hover:bg-hud-green/80 text-slate-950 font-black px-4 py-2 rounded text-[10px]"
                        >
                          ENTREGAR ✔️
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {/* Tab: Mapas Pro visual depiction representing Colombia */}
          {activeTab === 'mapas' ? (
            <div className="space-y-6 animate-fade-in font-mono text-xs">
              <div className="flex flex-col gap-1 pb-3 border-b border-slate-900">
                <h2 className="text-xl font-display font-extrabold text-[#f43f5e] tracking-widest flex items-center gap-2 uppercase">
                  <Map className="w-5 h-5 text-hud-red" /> Mapas Pro: Terminal Satelital Nacional
                </h2>
                <p className="text-xs text-slate-400">Visualización geográfica de muelle principal Acopi hacia nodos colombianos</p>
              </div>

              {/* Map depiction */}
              <div className="bg-hud-card border-2 border-hud-red/40 rounded-xl p-6 shadow-2xl relative overflow-hidden h-[500px] flex flex-col justify-between">
                
                {/* Simulation map grid background */}
                <div className="absolute inset-0 bg-slate-950 opacity-90 flex flex-col justify-between pointer-events-none p-4">
                  <div className="grid grid-cols-12 gap-1 h-full w-full opacity-10">
                    {Array.from({ length: 48 }).map((_, i) => (
                      <div key={i} className="border border-hud-red h-full w-full"></div>
                    ))}
                  </div>
                </div>

                <div className="z-10 bg-slate-900/90 border border-slate-800 p-4 rounded-lg max-w-sm space-y-2">
                  <h3 className="text-sm font-display font-extrabold text-[#f43f5e] uppercase">Centro logístico Acopi-Yumbo</h3>
                  <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
                    Geolocalización satelital activa. Trazando fletes despachados hacia las principales básculas nacionales de descarga:
                  </p>
                  <div className="space-y-1 text-[9px] pt-1">
                    <div className="flex items-center justify-between text-hud-green">
                      <span>🟢 Bogotá D.C.</span> <strong>En ruta: {orders.filter(o => o.ciudad === 'Bogotá' && o.estado === 'Despachado').length} fletes</strong>
                    </div>
                    <div className="flex items-center justify-between text-hud-accent">
                      <span>🔵 Medellín (Antioquia)</span> <strong>En ruta: {orders.filter(o => o.ciudad === 'Medellín' && o.estado === 'Despachado').length} fletes</strong>
                    </div>
                    <div className="flex items-center justify-between text-hud-orange">
                      <span>🟡 Cali (Valle)</span> <strong>En ruta: {orders.filter(o => o.ciudad === 'Cali' && o.estado === 'Despachado').length} fletes</strong>
                    </div>
                  </div>
                </div>

                {/* Cyberpunk Map Graphic Visual with labels */}
                <div className="z-10 relative flex justify-center items-center h-48 w-full select-none">
                  {/* Yumbo Acopi Core */}
                  <div className="absolute top-1/2 left-1/4 -translate-y-1/2 flex flex-col items-center">
                    <div className="w-5 h-5 rounded-full bg-hud-red border-2 border-white pulse-led flex items-center justify-center">
                      <span className="w-2 h-2 bg-white rounded-full"></span>
                    </div>
                    <strong className="text-white text-[10px] mt-1 shadow bg-[#091124] px-1.5 py-0.5 rounded">ACOPI YUMBO</strong>
                  </div>

                  {/* Route line simulation links */}
                  {/* Route 1: Bogotá */}
                  <div className="absolute top-1/4 left-1/2 flex flex-col items-center">
                    <div className="w-3.5 h-3.5 rounded-full bg-hud-green border border-white flex items-center justify-center">
                      <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                    </div>
                    <strong className="text-slate-300 text-[9px] mt-1 bg-[#091124] px-1 py-0.2 rounded">BOGOTÁ (CENTRO)</strong>
                  </div>

                  {/* Route 2: Medellín */}
                  <div className="absolute top-1/5 left-1/3 flex flex-col items-center">
                    <div className="w-3.5 h-3.5 rounded-full bg-hud-accent border border-white flex items-center justify-center">
                      <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                    </div>
                    <strong className="text-slate-300 text-[9px] mt-1 bg-[#091124] px-1 py-0.2 rounded">MEDELLÍN (OSTE)</strong>
                  </div>

                  {/* Connecting virtual vector dotted lines */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30" xmlns="http://www.w3.org/2000/svg">
                    {/* Path to Medellin */}
                    <path d="M 230 110 Q 280 80 340 50" fill="none" stroke="#00d2ff" strokeWidth="2" strokeDasharray="5,5" />
                    {/* Path to Bogota */}
                    <path d="M 230 110 Q 320 100 450 60" fill="none" stroke="#00ffa3" strokeWidth="2" strokeDasharray="5,5" />
                  </svg>
                </div>

                <div className="z-10 bg-slate-900 p-2 rounded text-center text-slate-500 text-[9px] font-mono border border-slate-800">
                  🛰️ CONECTADO A CONSTELACIÓN GPS DE ENTRADAS - NODO ACOPI-YUMBO SECURE LINK
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === 'dashboard' ? (
            <AnalyticsModule 
              orders={orders}
              carriers={carriers}
            />
          ) : null}

          {activeTab === 'dialogo' ? (
            <NovedadesModule 
              novedades={novedades}
              onAddNovedad={row => saveNovedades([row, ...novedades])}
              onUpdateNovedad={row => saveNovedades(novedades.map(n => n.id === row.id ? row : n))}
              onDeleteNovedad={id => saveNovedades(novedades.filter(n => n.id !== id))}
            />
          ) : null}

          {activeTab === 'liquidador' ? (
            <LiquidadorModule />
          ) : null}

          {activeTab === 'horasExtras' ? (
            <HorasModule />
          ) : null}

          {activeTab === 'pedidoEmpleados' ? (
            <PedidosModule />
          ) : null}

        </main>
      </div>

      {/* ========================================================================= */}
      {/* 🛠️ MODAL FOR ADDTING / EDITING ORDERS (DETAILED DRAW PANEL)             */}
      {/* ========================================================================= */}
      {isOrderFormOpen && editingOrder && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[10500] flex items-center justify-center p-4">
          <div className="bg-[#0a1224] border-2 border-hud-accent/60 rounded-xl max-w-4xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto font-mono text-xs text-slate-350">
            
            <div className="flex items-center justify-between pb-2.5 border-b border-sky-950">
              <div>
                <h3 className="text-base font-display font-black text-hud-accent tracking-widest uppercase">
                  FICHA DE CONTROL DETALLADO LOGÍSTICO
                </h3>
                <p className="text-[9px] text-[#476a8a] font-bold uppercase tracking-wider">SISTEMALOG SAS | PANEL DE CARGA</p>
              </div>
              <button onClick={() => setIsOrderFormOpen(false)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* ALERTA / REGISTRO MULTIPLES FACTURAS PARA EL MISMO PV */}
              {editingOrder.pv && orders.some(o => 
                o.pv && 
                o.pv.toString().trim().toLowerCase() === editingOrder.pv.toString().trim().toLowerCase() && 
                o.id !== editingOrder.id && 
                o.estado !== 'Anulado'
              ) && (
                <div className="col-span-1 md:col-span-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="text-yellow-400 font-bold flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                      <span className="w-2 h-2 rounded-full bg-yellow-500 animate-ping inline-block"></span>
                      ⚠️ Alerta: Ya existe un registro activo con el PV {editingOrder.pv}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal font-sans">
                      Este PV ya cuenta con despachos en el sistema. Para ingresar una <strong>factura o transportadora adicional</strong> en fecha diferente, active la opción de la derecha para crearlo como un despacho independiente.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 bg-yellow-500/5 hover:bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 rounded cursor-pointer select-none whitespace-nowrap transition-all self-start sm:self-center">
                    <input 
                      type="checkbox"
                      checked={!!editingOrder.isSplit}
                      onChange={e => setEditingOrder({ ...editingOrder, isSplit: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-yellow-500 accent-yellow-500 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-yellow-400 font-black text-[9px] tracking-widest uppercase">REGISTRAR FACTURA/DESPACHO ADICIONAL</span>
                  </label>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] text-hud-accent font-bold uppercase block">Flete ID</label>
                <input 
                  type="text" 
                  readOnly
                  value={editingOrder.id}
                  className="bg-black border border-hud-accent/20 p-2.5 rounded text-hud-accent font-bold w-full text-center"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase block">Pedido de Venta (PV)</label>
                <input 
                  type="text" 
                  value={editingOrder.pv}
                  onChange={e => setEditingOrder({ ...editingOrder, pv: e.target.value })}
                  placeholder="E.g., 4500308925"
                  className="bg-slate-950 border border-slate-800 text-white rounded p-2.5 w-full outline-none font-bold focus:border-hud-accent"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase block">Orden Compra (OC)</label>
                <input 
                  type="text" 
                  value={editingOrder.oc}
                  onChange={e => setEditingOrder({ ...editingOrder, oc: e.target.value })}
                  className="bg-slate-950 border border-slate-800 text-white rounded p-2.5 w-full outline-none"
                />
              </div>

              {/* Selection row elements */}
              <div className="space-y-1 col-span-2 relative" ref={customerDropdownRef}>
                <label className="text-[10px] text-slate-400 uppercase block">Cliente Destinatario</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Escribe para buscar o ingresar cliente..."
                    value={
                      isCustomerDropdownOpen 
                        ? orderFormClientSearch 
                        : (editingOrder.cliente ? `${editingOrder.cliente} (${editingOrder.ciudad})` : '')
                    }
                    onFocus={() => {
                      setIsCustomerDropdownOpen(true);
                      setOrderFormClientSearch(editingOrder.cliente || '');
                    }}
                    onChange={e => {
                      const val = e.target.value;
                      setOrderFormClientSearch(val);
                      // Update cliente directly so custom entries still work
                      setEditingOrder({
                        ...editingOrder,
                        cliente: val
                      });
                    }}
                    className="bg-slate-950 border border-slate-800 text-xs text-white rounded p-2.5 w-full outline-none focus:border-hud-accent font-bold pr-10"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>

                {isCustomerDropdownOpen && (
                  <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-[#0a1224] border-2 border-hud-accent/40 rounded-lg shadow-2xl divide-y divide-slate-900 scrollbar-thin">
                    {(() => {
                      const q = orderFormClientSearch.toLowerCase().trim();
                      const filtered = customers.filter(c => {
                        if (!q) return true;
                        return c.nombre.toLowerCase().includes(q) ||
                               (c.nit && c.nit.toLowerCase().includes(q)) ||
                               (c.dir && c.dir.toLowerCase().includes(q)) ||
                               (c.ciudad && c.ciudad.toLowerCase().includes(q));
                      });

                      if (filtered.length === 0) {
                        return (
                          <div className="p-3 text-xs text-slate-500 italic">
                            No se encontraron coincidencias. Puedes seguir escribiendo para un cliente nuevo.
                          </div>
                        );
                      }

                      return filtered.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setEditingOrder({
                              ...editingOrder,
                              cliente: c.nombre,
                              ciudad: c.ciudad,
                              direccion: c.dir
                            });
                            setOrderFormClientSearch('');
                            setIsCustomerDropdownOpen(false);
                          }}
                          className="w-full text-left p-3 hover:bg-slate-900/80 transition-colors flex flex-col gap-1 cursor-pointer"
                        >
                          <div className="flex justify-between items-center gap-2">
                            <span className="font-bold text-white text-xs truncate">{c.nombre}</span>
                            <span className="text-[10px] bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded text-hud-accent font-mono shrink-0">{c.ciudad}</span>
                          </div>
                          {c.dir && (
                            <span className="text-[10px] text-slate-400 font-mono block truncate">
                              📍 {c.dir}
                            </span>
                          )}
                        </button>
                      ));
                    })()}
                  </div>
                )}

                {/* Mostrar detalles completos de la sede del cliente seleccionado para validación rápida de sucursal */}
                {(() => {
                  let selectedCust = null;
                  if (editingOrder.direccion) {
                    selectedCust = customers.find(c => 
                      c.nombre.trim().toUpperCase() === editingOrder.cliente.trim().toUpperCase() && 
                      c.ciudad.trim().toUpperCase() === editingOrder.ciudad.trim().toUpperCase() &&
                      c.dir.trim().toUpperCase() === editingOrder.direccion.trim().toUpperCase()
                    );
                  }
                  if (!selectedCust) {
                    selectedCust = customers.find(c => 
                      c.nombre.trim().toUpperCase() === editingOrder.cliente.trim().toUpperCase() && 
                      c.ciudad.trim().toUpperCase() === editingOrder.ciudad.trim().toUpperCase()
                    );
                  }
                  if (selectedCust) {
                    return (
                      <div className="mt-2 bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg text-[11px] font-mono space-y-1">
                        <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          📍 SEDE REGISTRADA COINCIDENTE (SUCURSAL SELECCIONADA):
                        </div>
                        <div className="grid grid-cols-1 gap-y-1 mt-1.5 text-slate-350">
                          <div><span className="text-slate-500">Razón Social:</span> <strong className="text-white">{selectedCust.nombre}</strong></div>
                          <div><span className="text-slate-550">Dirección de Despacho:</span> <strong className="text-[#00ffa3]">{selectedCust.dir || "Sin Dirección Registrada"}</strong></div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase block">Ciudad Sede Destino</label>
                <input 
                  type="text" 
                  value={editingOrder.ciudad}
                  onChange={e => setEditingOrder({ ...editingOrder, ciudad: e.target.value })}
                  className="bg-slate-950 border border-slate-800 text-white rounded p-2.5 w-full outline-none font-bold"
                />
              </div>

              {/* cargo metrics */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase block">Peso Neto (Kg)</label>
                <input 
                  type="number" 
                  value={editingOrder.peso}
                  onChange={e => handleUpdateEditingOrderField('peso', Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 text-hud-green font-bold rounded p-2.5 w-full outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase block">Total Cajas (Cj)</label>
                <input 
                  type="number" 
                  value={editingOrder.cajas}
                  onChange={e => handleUpdateEditingOrderField('cajas', Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 text-hud-green font-bold rounded p-2.5 w-full outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase block">Valor Venta comercial</label>
                <input 
                  type="number" 
                  value={editingOrder.venta}
                  onChange={e => handleUpdateEditingOrderField('venta', Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 text-hud-green font-bold rounded p-2.5 w-full outline-none"
                />
              </div>

              {/* Transit Operators */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase block">Operador seleccionado</label>
                <select 
                  value={editingOrder.transportadora}
                  onChange={e => handleUpdateEditingOrderField('transportadora', e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs text-white rounded p-2.5 w-full outline-none font-bold"
                >
                  <option value="">SIN ASIGNAR (PENDIENTE DE PROGRAMACIÓN)</option>
                  {editingOrder.transportadora && !carriers.some(c => c.nombre.trim().toUpperCase() === editingOrder.transportadora.trim().toUpperCase()) && (
                    <option value={editingOrder.transportadora}>{editingOrder.transportadora}</option>
                  )}
                  {carriers.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                </select>
              </div>

              <div className="space-y-1 text-slate-400">
                <label className="text-[10px] uppercase block">Placa</label>
                <input 
                  type="text" 
                  value={editingOrder.placa}
                  onChange={e => setEditingOrder({ ...editingOrder, placa: e.target.value })}
                  placeholder="E.g., SWD-913"
                  className="bg-slate-950 border border-slate-800 text-white rounded p-2.5 w-full outline-none"
                />
              </div>

              <div className="space-y-1 text-slate-400">
                <label className="text-[10px] uppercase block">Conductor</label>
                <input 
                  type="text" 
                  value={editingOrder.conductor}
                  onChange={e => setEditingOrder({ ...editingOrder, conductor: e.target.value })}
                  className="bg-slate-950 border border-slate-800 text-white rounded p-2.5 w-full outline-none"
                />
              </div>

              {/* billing realities */}
              <div className="col-span-3 bg-hud-green/5 border border-hud-green/10 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-hud-green font-bold uppercase block">Factura venta de despacho</label>
                  <input 
                    type="text" 
                    value={editingOrder.factura}
                    onChange={e => handleUpdateEditingOrderField('factura', e.target.value)}
                    className="bg-slate-950 border border-hud-green/20 text-[#00ffa3] font-bold rounded p-2 w-full outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase block">Valor Final Facturado ($)</label>
                  <input 
                    type="number" 
                    value={editingOrder.facturado || ''}
                    onChange={e => handleUpdateEditingOrderField('facturado', e.target.value === '' ? 0 : Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 text-white rounded p-2 w-full outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase block">Cajas Facturadas (cj)</label>
                  <input 
                    type="number" 
                    value={editingOrder.cajasFact || ''}
                    onChange={e => handleUpdateEditingOrderField('cajasFact', e.target.value === '' ? 0 : Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 text-white rounded p-2 w-full outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase block font-bold tracking-wider text-hud-green">Peso Facturado (kg)</label>
                  <input 
                    type="number" 
                    value={editingOrder.pesoFact || ''}
                    onChange={e => handleUpdateEditingOrderField('pesoFact', e.target.value === '' ? 0 : Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 text-white rounded p-2 w-full outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-rose-450 font-bold uppercase block">Factura Provisión (Tr.)</label>
                  <input 
                    type="text" 
                    value={editingOrder.provision || ''}
                    onChange={e => handleUpdateEditingOrderField('provision', e.target.value)}
                    placeholder="E.g., PRV-901"
                    className="bg-slate-950 border border-rose-500/20 text-rose-300 font-bold rounded p-2 w-full outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase block">Costo Transporte Flete ($)</label>
                  <input 
                    type="number" 
                    value={editingOrder.flete || 0}
                    onChange={e => handleUpdateEditingOrderField('flete', Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 text-[#ffab00] font-bold rounded p-2 w-full outline-none"
                  />
                </div>
              </div>

              {/* 📅 PROGRAMACIÓN Y FECHAS */}
              <div className="col-span-3 border-t border-slate-800/60 pt-4 mt-2">
                <h4 className="text-[11px] font-bold text-[#ffaa00] uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  📅 PROGRAMACIÓN Y FECHAS
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-hud-accent font-bold uppercase block">Fecha de Ingreso</label>
                    <input 
                      type="date" 
                      value={editingOrder.fechaIngreso || ''}
                      onChange={e => setEditingOrder({ ...editingOrder, fechaIngreso: e.target.value })}
                      className="bg-slate-950 border border-hud-accent/20 text-hud-accent font-bold rounded p-2.5 w-full outline-none focus:border-hud-accent text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 uppercase block">Salida</label>
                    <input 
                      type="date" 
                      value={editingOrder.fechaSalida || ''}
                      onChange={e => setEditingOrder({ ...editingOrder, fechaSalida: e.target.value })}
                      className="bg-slate-950 border border-slate-800 text-white rounded p-2.5 w-full outline-none focus:border-hud-accent text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 uppercase block">Entrega Estimada</label>
                    <input 
                      type="date" 
                      value={editingOrder.fechaEntrega || ''}
                      onChange={e => setEditingOrder({ ...editingOrder, fechaEntrega: e.target.value })}
                      className="bg-slate-950 border border-slate-800 text-white rounded p-2.5 w-full outline-none focus:border-hud-accent text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 uppercase block">Hora Cita</label>
                    <input 
                      type="text" 
                      placeholder="E.g., 08:00 o 14:30"
                      value={editingOrder.horaCita || ''}
                      onChange={e => setEditingOrder({ ...editingOrder, horaCita: e.target.value })}
                      className="bg-slate-950 border border-slate-800 text-white rounded p-2.5 w-full outline-none focus:border-hud-accent text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-hud-green font-bold uppercase block">Fecha Facturación</label>
                    <input 
                      type="date" 
                      value={editingOrder.fechaFactura || ''}
                      onChange={e => setEditingOrder({ ...editingOrder, fechaFactura: e.target.value })}
                      className="bg-slate-950 border border-hud-green/20 text-[#00ffa3] font-bold rounded p-2.5 w-full outline-none focus:border-hud-green text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* State control */}
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase block">Estado de Lote</label>
                <select 
                  value={editingOrder.estado}
                  onChange={e => {
                    const newEstado = e.target.value as any;
                    let nextOrder = { ...editingOrder, estado: newEstado };
                    if (newEstado !== 'Pendiente' && !nextOrder.transportadora) {
                      nextOrder.transportadora = carriers[0]?.nombre || '';
                      // Recalculate flete for the new carrier
                      const vFact = Number(nextOrder.facturado) > 0 ? Number(nextOrder.facturado) : Number(nextOrder.venta || 0);
                      const cFact = Number(nextOrder.cajasFact) > 0 ? Number(nextOrder.cajasFact) : Number(nextOrder.cajas || 0);
                      nextOrder.flete = calculateCarrierFlete(nextOrder.transportadora, vFact, cFact, carriers, nextOrder.cliente);
                    }
                    setEditingOrder(nextOrder);
                  }}
                  className="bg-slate-950 border border-slate-800 text-xs text-white rounded p-2.5 w-full outline-none font-bold"
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="En Cargue">En Cargue</option>
                  <option value="Despachado">Despachado</option>
                  <option value="En Sitio / Bodega">En Sitio / Bodega</option>
                  <option value="Entregado">Entregado</option>
                </select>
              </div>

              <div className="space-y-1 col-span-2">
                <label className="text-[10px] text-slate-400 uppercase block">Observaciones Generales</label>
                <input 
                  type="text" 
                  value={editingOrder.obs}
                  onChange={e => setEditingOrder({ ...editingOrder, obs: e.target.value })}
                  className="bg-slate-950 border border-slate-800 text-white rounded p-2.5 w-full outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-sky-950">
              <button 
                type="button" 
                onClick={() => triggerAuditCancellation(editingOrder.id)}
                className="bg-rose-500/10 border border-rose-500/40 hover:bg-rose-500/20 text-rose-500 px-4 py-2.5 rounded-lg flex items-center gap-1 cursor-pointer font-bold"
              >
                <Trash2 className="w-4 h-4" /> ANULAR PEDIDO
              </button>

              <div className="flex items-center gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsOrderFormOpen(false)}
                  className="bg-slate-900 hover:bg-slate-850 text-slate-350 px-5 py-2.5 rounded-lg"
                >
                  Cerrar
                </button>
                <button 
                  type="button" 
                  onClick={() => printSingleOrder(editingOrder, carriers, customers)}
                  className="bg-[#00ffa3]/10 border border-[#00ffa3]/40 hover:bg-[#00ffa3]/20 text-[#00ffa3] font-bold px-5 py-2.5 rounded-lg flex items-center gap-1.5 uppercase transition-all"
                >
                  <Printer className="w-4 h-4" /> IMPRIMIR SOLICITUD
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    const isNew = !orders.some(o => o.id === editingOrder.id);
                    if (isNew) handleAddOrder(editingOrder);
                    else handleUpdateOrder(editingOrder);
                    setIsOrderFormOpen(false);
                  }}
                  className="bg-hud-accent text-slate-950 font-black tracking-widest px-6 py-2.5 rounded-lg hover:bg-hud-accent/80 transition-all font-display uppercase"
                >
                  GUARDAR PEDIDO ✔️
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🔐 MODAL: AUDITORÍA DE ANULACIÓN CON PIN DE ACCESO                       */}
      {/* ========================================================================= */}
      {auditTargetId && (
        <div className="fixed inset-0 bg-slate-950 bg-opacity-90 backdrop-blur-md z-[13000] flex items-center justify-center p-4">
          <div className="bg-[#080d19] border-2 border-rose-500/50 rounded-xl max-w-sm w-full p-6 shadow-2xl relative space-y-4 text-xs font-mono">
            <div className="flex items-center gap-2 pb-2.5 border-b border-rose-500/20 text-rose-500">
              <ShieldAlert className="w-5 h-5 animate-pulse" />
              <h3 className="text-xs font-display font-extrabold uppercase tracking-widest">Auditoría de Anulación</h3>
            </div>

            <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
              La anulación de la solicitud <strong className="text-white">{auditTargetId}</strong> requiere la introducción del PIN operativo de control del supervisor de planta.
            </p>

            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[9px] text-[#00ffa3] font-bold block uppercase tracking-widest">Introducir PIN (4 dígitos) *</label>
                <input 
                  type="password" 
                  maxLength={4}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={auditPinInput}
                  onChange={e => setAuditPinInput(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && handleConfirmCancellation()}
                  placeholder="••••"
                  className="bg-black border-2 border-rose-500/30 text-xl font-extrabold text-[#00ffa3] rounded-lg p-2.5 tracking-[8px] text-center outline-none w-full"
                />

                {/* On-screen virtual numeric keypad */}
                <div className="grid grid-cols-3 gap-1 pt-1.5 max-w-[180px] mx-auto">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setAuditPinInput(prev => (prev + num).slice(0, 4))}
                      className="bg-slate-950 hover:bg-slate-900 border border-slate-850 text-white text-xs py-1.5 rounded font-mono font-bold active:scale-95 transition-all cursor-pointer"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAuditPinInput(prev => prev.slice(0, -1))}
                    className="bg-slate-950 hover:bg-rose-950/40 border border-slate-850 text-rose-500 text-xs py-1.5 rounded font-mono font-bold active:scale-95 transition-all text-center flex items-center justify-center cursor-pointer"
                  >
                    ⌫
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditPinInput(prev => (prev + '0').slice(0, 4))}
                    className="bg-slate-950 hover:bg-slate-900 border border-slate-850 text-white text-xs py-1.5 rounded font-mono font-bold active:scale-95 transition-all cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditPinInput('')}
                    className="bg-slate-950 hover:bg-slate-900 border border-slate-850 text-slate-400 text-[10px] py-1.5 rounded font-mono font-bold active:scale-95 transition-all cursor-pointer"
                  >
                    C
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] text-slate-400 uppercase block tracking-wider">Motivo de Anulación Obligatorio *</label>
                <textarea 
                  rows={2}
                  required
                  value={auditMotivo}
                  onChange={e => setAuditMotivo(e.target.value)}
                  placeholder="E.g., Incoherencia de fletes o solicitud del cliente..."
                  className="bg-slate-950 border border-rose-500/20 text-white rounded p-2 w-full outline-none resize-none font-sans"
                />
              </div>

              {auditError && (
                <p className="text-rose-500 text-[10px] font-bold bg-rose-500/10 p-2 rounded">
                  {auditError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-500/10">
              <button 
                type="button" 
                onClick={() => setAuditTargetId(null)}
                className="bg-slate-900 border border-slate-800 text-slate-350 text-[10px] px-3.5 py-2 rounded"
              >
                CANCELAR
              </button>
              <button 
                type="button" 
                onClick={handleConfirmCancellation}
                className="bg-rose-500 hover:bg-rose-600 text-white font-extrabold text-[10px] tracking-wider px-4 py-2 rounded"
              >
                COMPROMETER ANULACIÓN
              </button>
            </div>
            
            <p className="text-[8px] text-slate-500 text-center">Master PIN por defecto para revisión: <strong>1234</strong></p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🚚 MODAL: CARRIER OPERATIONS FORM                                         */}
      {/* ========================================================================= */}
      {isCarrierFormOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[12000] flex justify-center items-start p-4 overflow-y-auto pt-16 md:pt-24 pb-12">
          <form onSubmit={handleSaveCarrier} className="bg-hud-card border-2 border-hud-accent/60 p-6 rounded-xl max-w-2xl w-full space-y-4 font-mono text-xs my-4">
            <h3 className="text-sm font-display font-black text-hud-accent tracking-widest uppercase border-b border-sky-950 pb-2.5 flex items-center gap-2">
              🚚 {editingCarrierId ? 'EDITAR TRANSPORTADORA' : 'AÑADIR TRANSPORTADORA'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
              <div className="col-span-1 md:col-span-2">
                <label className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider mb-1">Razón Social *</label>
                <input 
                  type="text" required value={carrierName} onChange={e => setCarrierName(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white p-2.5 rounded w-full outline-none focus:border-hud-accent transition-all text-xs"
                  placeholder="Nombre de la empresa"
                />
              </div>

              <div>
                <label className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider mb-1">NIT *</label>
                <input 
                  type="text" required value={carrierNit} onChange={e => setCarrierNit(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white p-2.5 rounded w-full outline-none focus:border-hud-accent transition-all text-xs"
                  placeholder="Número de Identificación Tributaria"
                />
              </div>

              <div>
                <label className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider mb-1">Ciudad (Sede Central) *</label>
                <input 
                  type="text" required value={carrierSede} onChange={e => setCarrierSede(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white p-2.5 rounded w-full outline-none focus:border-hud-accent transition-all text-xs"
                  placeholder="E.g., Cali, Yumbo, Bogotá"
                />
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider mb-1">Dirección de Sede</label>
                <input 
                  type="text" value={carrierDir} onChange={e => setCarrierDir(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white p-2.5 rounded w-full outline-none focus:border-hud-accent transition-all text-xs"
                  placeholder="E.g., Calle 15 #2A-44"
                />
              </div>

              <div>
                <label className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider mb-1">Contacto Encargado *</label>
                <input 
                  type="text" required value={carrierCont} onChange={e => setCarrierCont(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white p-2.5 rounded w-full outline-none focus:border-hud-accent transition-all text-xs"
                  placeholder="Nombre del contacto principal"
                />
              </div>

              <div>
                <label className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider mb-1">Teléfono Celular *</label>
                <input 
                  type="text" required value={carrierTel} onChange={e => setCarrierTel(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white p-2.5 rounded w-full outline-none focus:border-hud-accent transition-all text-xs"
                  placeholder="Celular de contacto"
                />
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider mb-1">Correo Electrónico (Email) *</label>
                <input 
                  type="email" required value={carrierMail} onChange={e => setCarrierMail(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white p-2.5 rounded w-full outline-none focus:border-hud-accent transition-all text-xs"
                  placeholder="E.g., operaciones@transportadora.com"
                />
              </div>

              <div className="col-span-1 md:col-span-2 border-t border-slate-900 pt-3 mt-1">
                <label className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider mb-1">Método de Cobro (Flete)</label>
                <select
                  value={carrierTipoCalculo}
                  onChange={e => setCarrierTipoCalculo(e.target.value as 'fijo' | 'formula')}
                  className="bg-slate-950 border border-slate-800 text-white p-2.5 rounded w-full outline-none text-xs font-bold font-mono focus:border-hud-accent transition-all cursor-pointer"
                >
                  <option value="fijo">💵 COSTO FIJO SUGERIDO</option>
                  <option value="formula">🧮 FÓRMULA VARIABLE (% + $ COBRO/CJ)</option>
                </select>
              </div>

              <div className="col-span-1 md:col-span-2">
                {carrierTipoCalculo === 'fijo' ? (
                  <div>
                    <label className="text-[9px] text-[#00ffa3] block uppercase font-bold tracking-wider mb-1">Tarifa costo predeterminado ($)</label>
                    <input 
                      type="number" required value={carrierCost} onChange={e => setCarrierCost(Number(e.target.value))}
                      className="bg-slate-950 border border-slate-800 text-hud-green font-bold p-2.5 rounded w-full outline-none font-mono focus:border-[#00ffa3] transition-all text-xs"
                      placeholder="E.g., 450000"
                    />
                  </div>
                ) : (
                  <div className="space-y-3 bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] text-hud-accent block uppercase font-bold tracking-wider mb-1">% del Valor Comercial</label>
                        <div className="relative">
                          <input 
                            type="number" step="0.01" required value={carrierPorcentajeValor} onChange={e => setCarrierPorcentajeValor(Number(e.target.value))}
                            className="bg-slate-950 border border-slate-800 text-hud-accent font-bold p-2.5 pr-8 rounded w-full outline-none font-mono focus:border-hud-accent transition-all text-xs"
                            placeholder="E.g., 4"
                          />
                          <span className="absolute right-3 top-3.5 text-xs font-bold text-slate-500">%</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] text-hud-accent block uppercase font-bold tracking-wider mb-1">Costo por Caja ($)</label>
                        <input 
                          type="number" required value={carrierCostoCaja} onChange={e => setCarrierCostoCaja(Number(e.target.value))}
                          className="bg-slate-950 border border-slate-800 text-hud-accent font-bold p-2.5 rounded w-full outline-none font-mono focus:border-hud-accent transition-all text-xs"
                          placeholder="E.g., 400"
                        />
                      </div>
                    </div>
                    
                    <div className="text-[9px] text-slate-400 leading-relaxed bg-slate-950 p-2.5 rounded border border-slate-900 font-mono">
                      <span className="text-hud-accent font-bold block mb-1">FÓRMULA ACTIVA:</span>
                      Costo = (Valor Facturado * <span className="text-white font-bold">{carrierPorcentajeValor}%</span>) + (Cajas Facturadas * <span className="text-white font-bold">${carrierCostoCaja}</span>)
                      <span className="block mt-1 text-slate-500 italic text-[8px]">* Si no hay valor facturado o cajas facturadas, se usará el valor/cajas iniciales de la solicitud.</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-900">
              <div>
                {editingCarrierId && (
                  <button 
                    type="button" 
                    onClick={() => handleDeleteCarrier(editingCarrierId)} 
                    className="bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-400 font-bold px-4 py-2 rounded-lg text-[10px] cursor-pointer transition-all font-sans uppercase tracking-wider flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-500" /> Eliminar Operador
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <button 
                  type="button" 
                  onClick={() => setIsCarrierFormOpen(false)} 
                  className="bg-slate-900 hover:bg-slate-850 text-slate-350 px-4 py-2 rounded-lg cursor-pointer font-bold text-[10px]"
                >
                  Cerrar
                </button>
                <button 
                  type="submit" 
                  className="bg-hud-accent text-slate-950 font-black tracking-wider px-5 py-2 rounded-lg hover:bg-hud-accent/80 transition-all font-display uppercase cursor-pointer text-[10px]"
                >
                  GUARDAR SOCIO ✔️
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🏢 MODAL: CUSTOMER SPECIFICATION FORM                                     */}
      {/* ========================================================================= */}
      {isCustomerFormOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[12000] flex justify-center items-start p-4 overflow-y-auto animate-fade-in pt-16 md:pt-24 pb-12">
          <form onSubmit={handleSaveCustomer} className="bg-[#080d19] border-2 border-hud-green/60 p-8 rounded-xl max-w-2xl md:max-w-3xl w-full space-y-6 font-mono text-xs my-4 text-left shadow-2xl relative">
            <h3 className="text-sm font-display font-extrabold text-hud-green tracking-widest uppercase border-b border-sky-950 pb-3 flex items-center gap-2">
              <Users className="w-5 h-5 text-hud-green" />
              {editingCustomerId ? 'Editar Registro Cliente' : 'Añadir Registro Cliente'}
            </h3>

            <div className="space-y-4">
              {/* Razón Social */}
              <div>
                <label className="text-[10px] text-[#00ffa3] block uppercase font-bold tracking-wider mb-1.5">Nombre / Razón Social *</label>
                <input 
                  type="text" required value={custName} onChange={e => setCustName(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white p-3 rounded-lg w-full outline-none font-bold text-xs focus:border-hud-green/50 transition-all"
                  placeholder="E.g., ALMACENES ÉXITO S.A."
                />
              </div>

              {/* Nit y Ciudad Sede */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider mb-1.5">Matricula Nit</label>
                  <input 
                    type="text" value={custNit} onChange={e => setCustNit(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-white p-3 rounded-lg w-full outline-none text-xs focus:border-hud-green/30 transition-all"
                    placeholder="E.g., 890.900.608-9"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#00ffa3] block uppercase font-bold tracking-wider mb-1.5">Ciudad Sede *</label>
                  <input 
                    type="text" required value={custCiudad} onChange={e => setCustCiudad(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-white p-3 rounded-lg w-full outline-none font-bold text-xs focus:border-hud-green/50 transition-all"
                    placeholder="E.g., Bogotá, Medellín"
                  />
                </div>
              </div>

              {/* Dirección exacta descarga */}
              <div>
                <label className="text-[10px] text-[#00ffa3] block uppercase font-bold tracking-wider mb-1.5">Dirección exacta descarga *</label>
                <input 
                  type="text" required value={custDir} onChange={e => setCustDir(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white p-3 rounded-lg w-full outline-none font-bold text-xs focus:border-hud-green/50 transition-all"
                  placeholder="E.g., Av. El Dorado #103-2"
                />
              </div>

              {/* Contacto Encargado, Correo Electrónico y Celular */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider mb-1.5">Contacto Encargado</label>
                  <input 
                    type="text" value={custCont} onChange={e => setCustCont(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-white p-3 rounded-lg w-full outline-none text-xs focus:border-hud-green/30 transition-all"
                    placeholder="E.g., Juan Carlos Pérez"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider mb-1.5">Correo Electrónico (Email)</label>
                  <input 
                    type="email" value={custEmail} onChange={e => setCustEmail(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-white p-3 rounded-lg w-full outline-none text-xs focus:border-hud-green/30 transition-all"
                    placeholder="E.g., contacto@cliente.com"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider mb-1.5">Teléfono Celular / Número</label>
                  <input 
                    type="text" value={custCel} onChange={e => setCustCel(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-white p-3 rounded-lg w-full outline-none text-xs focus:border-hud-green/30 transition-all"
                    placeholder="E.g., 315 440 2201"
                  />
                </div>
              </div>

              {/* Malla de Entrega Checkboxes Section */}
              <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-5 space-y-4">
                <span className="text-xs text-hud-green font-display font-extrabold uppercase tracking-widest block border-b border-sky-950 pb-1.5">
                  Malla de Entregas
                </span>
                
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-1">
                  {[
                    { key: 'Lunes', label: 'Lunes' },
                    { key: 'Martes', label: 'Martes' },
                    { key: 'Miércoles', label: 'Miércoles' },
                    { key: 'Jueves', label: 'Jueves' },
                    { key: 'Viernes', label: 'Viernes' },
                    { key: 'Sábado', label: 'Sábado' },
                  ].map(day => (
                    <label key={day.key} className="flex items-center gap-2.5 cursor-pointer select-none group">
                      <input
                        type="checkbox"
                        checked={isMallaDaySelected(day.key)}
                        onChange={() => toggleMallaDay(day.key)}
                        className="rounded border border-sky-850 text-hud-green focus:ring-hud-green w-4.5 h-4.5 bg-slate-950 cursor-pointer group-hover:border-hud-green/50 transition-all"
                      />
                      <span className="text-white text-xs font-bold font-sans group-hover:text-hud-green transition-all">{day.label}</span>
                    </label>
                  ))}
                </div>

                <div className="pt-1.5">
                  <div className="flex items-center gap-2.5 p-2.5 bg-slate-900/40 border border-slate-850 rounded-lg max-w-[200px] hover:border-hud-green/30 transition-all">
                    <input
                      type="checkbox"
                      id="malla-mercancia"
                      checked={isMallaDaySelected('Mercancía Lista')}
                      onChange={() => toggleMallaDay('Mercancía Lista')}
                      className="rounded border border-sky-850 text-hud-green focus:ring-hud-green w-4.5 h-4.5 bg-slate-950 cursor-pointer"
                    />
                    <label htmlFor="malla-mercancia" className="text-white text-xs font-bold font-sans cursor-pointer flex items-center gap-1.5 select-none hover:text-hud-green transition-all">
                      <span>📦</span> Mercancía Lista
                    </label>
                  </div>
                </div>
                
                {/* Visual state text info */}
                <div className="text-[10px] text-[#476a8a] font-mono border-t border-slate-900 pt-3 flex items-center justify-between">
                  <span>VALOR DE MALLA REGISTRADO:</span>
                  <strong className="text-white text-xs font-bold bg-slate-900/80 border border-slate-800 px-3 py-1 rounded-lg shadow-sm">{custMalla || '(Sin registrar)'}</strong>
                </div>
              </div>

              {/* ¿Requiere Cita de Entrega? */}
              <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-5 space-y-3">
                <label className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">¿Requiere Cita para entrega en muelle?</label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setCustCita('SI')}
                    className={`flex-1 py-3 rounded-lg font-sans font-extrabold text-xs border transition-all cursor-pointer text-center uppercase tracking-wider ${
                      custCita === 'SI'
                        ? 'bg-hud-accent/20 border-hud-accent text-hud-accent shadow-[0_0_12px_rgba(0,229,255,0.2)] font-black'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    SÍ, Requiere Cita
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustCita('NO')}
                    className={`flex-1 py-3 rounded-lg font-sans font-extrabold text-xs border transition-all cursor-pointer text-center uppercase tracking-wider ${
                      custCita === 'NO'
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)] font-black'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    NO Requiere Cita
                  </button>
                </div>
              </div>

              {/* Observaciones */}
              <div>
                <label className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider mb-1.5">Observaciones Logísticas</label>
                <textarea 
                  rows={3}
                  value={custObs} onChange={e => setCustObs(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white p-3 rounded-lg w-full outline-none font-sans text-xs resize-none focus:border-hud-green/30 transition-all"
                  placeholder="Observaciones de muelle, restricciones de horarios o vehículos..."
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-900">
              <div>
                {editingCustomerId && (
                  <button 
                    type="button" 
                    onClick={() => handleDeleteCustomer(editingCustomerId)} 
                    className="bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-400 font-bold px-5 py-3 rounded-lg text-[11px] cursor-pointer transition-all font-sans uppercase tracking-wider flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" /> Eliminar Cliente
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsCustomerFormOpen(false)} 
                  className="bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold px-5 py-3 rounded-lg text-[11px] cursor-pointer transition-all font-sans uppercase tracking-wider"
                >
                  Cerrar
                </button>
                <button 
                  type="submit" 
                  className="bg-hud-green hover:bg-emerald-500 text-slate-950 font-black px-6 py-3 rounded-lg text-[11px] cursor-pointer transition-all font-sans uppercase tracking-wider shadow-[0_0_15px_rgba(0,255,163,0.25)]"
                >
                  GUARDAR CLIENTE ✔️
                </button>
              </div>
            </div>
          </form>
        </div>
      )}


      {/* Custom Carrier Deletion Confirmation Modal */}
      {carrierToDelete && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[13000] flex justify-center items-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-[#080d19] border-2 border-red-500/60 p-6 rounded-xl max-w-md w-full space-y-6 font-mono text-xs text-left shadow-2xl relative">
            <h3 className="text-sm font-display font-extrabold text-red-400 tracking-widest uppercase border-b border-red-950 pb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
              Confirmar Eliminación de Operador
            </h3>

            {(() => {
              const target = carriers.find(c => c.id === carrierToDelete);
              if (!target) return <p className="text-slate-400">Operador no encontrado.</p>;
              return (
                <div className="space-y-4">
                  <p className="text-slate-300 leading-relaxed text-xs">
                    ¿Está completamente seguro de que desea eliminar permanentemente este operador logístico / transportadora? Esta operación es irreversible.
                  </p>
                  <div className="bg-black/40 border border-slate-900 rounded-lg p-4 space-y-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">Detalles del Operador:</div>
                    <div className="text-xs font-bold text-white uppercase">{target.nombre}</div>
                    <div className="text-[10.5px] text-slate-400">ID: <span className="text-hud-accent">{target.id}</span> | NIT: <span className="text-hud-accent">{target.nit || 'S/N'}</span></div>
                    <div className="text-[10.5px] text-slate-400">Sede: <span className="text-white font-semibold">{target.ciudad}</span></div>
                    {target.contacto && <div className="text-[10.5px] text-slate-500 truncate">👤 {target.contacto} - {target.tel}</div>}
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-900">
              <button 
                type="button" 
                onClick={() => setCarrierToDelete(null)} 
                className="bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold px-4 py-2.5 rounded-lg text-[11px] cursor-pointer transition-all font-sans uppercase tracking-wider"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={confirmDeleteCarrier}
                className="bg-red-600 hover:bg-red-500 text-white font-black px-5 py-2.5 rounded-lg text-[11px] cursor-pointer transition-all font-sans uppercase tracking-wider shadow-[0_0_15px_rgba(239,68,68,0.25)] flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> Eliminar Permanentemente
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Custom Customer Deletion Confirmation Modal */}
      {customerToDelete && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[13000] flex justify-center items-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-[#080d19] border-2 border-red-500/60 p-6 rounded-xl max-w-md w-full space-y-6 font-mono text-xs text-left shadow-2xl relative">
            <h3 className="text-sm font-display font-extrabold text-red-400 tracking-widest uppercase border-b border-red-950 pb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
              Confirmar Eliminación de Cliente
            </h3>

            {(() => {
              const target = customers.find(c => c.id === customerToDelete);
              if (!target) return <p className="text-slate-400">Cliente no encontrado.</p>;
              return (
                <div className="space-y-4">
                  <p className="text-slate-300 leading-relaxed text-xs">
                    ¿Está completamente seguro de que desea eliminar permanentemente este registro de cliente? Esta operación es irreversible.
                  </p>
                  <div className="bg-black/40 border border-slate-900 rounded-lg p-4 space-y-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">Detalles del Cliente:</div>
                    <div className="text-xs font-bold text-white uppercase">{target.nombre}</div>
                    <div className="text-[10.5px] text-slate-400">ID: <span className="text-[#00ffa3]">{target.id}</span> | NIT: <span className="text-[#00ffa3]">{target.nit || 'S/N'}</span></div>
                    <div className="text-[10.5px] text-slate-400">Ciudad: <span className="text-white font-semibold">{target.ciudad}</span></div>
                    {target.dir && <div className="text-[10.5px] text-slate-500 truncate">📍 {target.dir}</div>}
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-900">
              <button 
                type="button" 
                onClick={() => setCustomerToDelete(null)} 
                className="bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold px-4 py-2.5 rounded-lg text-[11px] cursor-pointer transition-all font-sans uppercase tracking-wider"
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={confirmDeleteCustomer}
                className="bg-red-600 hover:bg-red-500 text-white font-black px-5 py-2.5 rounded-lg text-[11px] cursor-pointer transition-all font-sans uppercase tracking-wider shadow-[0_0_15px_rgba(239,68,68,0.25)] flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> Eliminar Permanentemente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation & Deletion Modal */}
      {auditTargetId && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[13000] flex items-center justify-center p-4">
          <div className="bg-[#080d19] border-2 border-rose-500/50 rounded-xl max-w-sm w-full p-6 shadow-2xl relative space-y-4 text-xs font-mono">
            <div className="flex items-center gap-2 pb-2.5 border-b border-rose-500/20 text-rose-500">
              <Trash2 className="w-5 h-5 animate-pulse" />
              <h3 className="text-xs font-display font-extrabold uppercase tracking-widest text-[#00ffa3]">
                Eliminar / Anular Solicitud
              </h3>
            </div>

            <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
              Está a punto de modificar o retirar la orden <strong className="text-white">{auditTargetId}</strong> del sistema. Por seguridad, introduzca las credenciales.
            </p>

            <div className="space-y-3">
              {/* ACCIÓN A TOMAR */}
              <div className="space-y-1">
                <label className="text-[9px] text-[#00ffa3] font-bold block uppercase tracking-widest">
                  Tipo de Eliminación
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setAuditPhysical(false)}
                    className={`p-2 rounded border text-[10px] uppercase font-bold tracking-wider cursor-pointer text-center ${
                      !auditPhysical
                        ? 'bg-hud-accent/15 border-hud-accent text-hud-accent'
                        : 'bg-black/30 border-slate-800 text-slate-450 hover:bg-black/50'
                    }`}
                  >
                    Anular Pedido
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditPhysical(true)}
                    className={`p-2 rounded border text-[10px] uppercase font-bold tracking-wider cursor-pointer text-center ${
                      auditPhysical
                        ? 'bg-rose-500/15 border-rose-500 text-rose-400'
                        : 'bg-black/30 border-slate-800 text-slate-450 hover:bg-black/50'
                    }`}
                  >
                    Eliminar Físico
                  </button>
                </div>
              </div>

              {/* PIN INPUT */}
              <div className="space-y-1">
                <label className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">
                  PIN operativo (4 dígitos) *
                </label>
                <input 
                  type="password" 
                  maxLength={4}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={auditPinInput}
                  onChange={e => setAuditPinInput(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && handleConfirmCancellation()}
                  placeholder="••••"
                  className="bg-black border border-rose-500/30 text-xl font-extrabold text-[#00ffa3] rounded-lg p-2 tracking-[8px] text-center outline-none w-full"
                />

                {/* On-screen virtual numeric keypad */}
                <div className="grid grid-cols-3 gap-1 pt-1.5 max-w-[180px] mx-auto">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setAuditPinInput(prev => (prev + num).slice(0, 4))}
                      className="bg-slate-950 hover:bg-slate-900 border border-slate-850 text-white text-xs py-1.5 rounded font-mono font-bold active:scale-95 transition-all cursor-pointer"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAuditPinInput(prev => prev.slice(0, -1))}
                    className="bg-slate-950 hover:bg-rose-950/40 border border-slate-850 text-rose-500 text-xs py-1.5 rounded font-mono font-bold active:scale-95 transition-all text-center flex items-center justify-center cursor-pointer"
                  >
                    ⌫
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditPinInput(prev => (prev + '0').slice(0, 4))}
                    className="bg-slate-950 hover:bg-slate-900 border border-slate-850 text-white text-xs py-1.5 rounded font-mono font-bold active:scale-95 transition-all cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuditPinInput('')}
                    className="bg-slate-950 hover:bg-slate-900 border border-slate-850 text-slate-400 text-[10px] py-1.5 rounded font-mono font-bold active:scale-95 transition-all cursor-pointer"
                  >
                    C
                  </button>
                </div>
              </div>

              {/* MOTIVO */}
              <div className="space-y-1">
                <label className="text-[9px] text-slate-400 uppercase block tracking-wider">
                  {auditPhysical ? 'Motivo opcional' : 'Motivo de Anulación Obligatorio *'}
                </label>
                <textarea 
                  rows={2}
                  value={auditMotivo}
                  onChange={e => setAuditMotivo(e.target.value)}
                  placeholder="E.g., Cliente canceló pedido, error en cajas..."
                  className="bg-slate-950 border border-slate-800 text-white rounded p-2 w-full outline-none resize-none font-sans text-xs"
                />
              </div>

              {auditError && (
                <p className="text-rose-500 text-[10px] font-bold bg-rose-500/10 p-2 rounded">
                  {auditError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-900">
              <button
                type="button"
                onClick={() => setAuditTargetId(null)}
                className="px-3 py-1.5 rounded text-slate-400 hover:text-white font-bold cursor-pointer text-xs uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmCancellation}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold uppercase tracking-wider cursor-pointer text-xs"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Universal Intelligent PDF parsed result modal overlay */}
      {parsedPdfData && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#0b0f19] border border-hud-border rounded-xl p-5 max-w-xl w-full space-y-4 shadow-2xl relative animate-fade-in text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="text-sm font-display font-extrabold text-hud-green tracking-wider uppercase flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-hud-green" /> Escaneo de Documento Exitoso!
              </h3>
              <button onClick={() => setParsedPdfData(null)} className="text-slate-400 hover:text-white font-mono font-bold text-sm">✕</button>
            </div>

            <div className="bg-[#030610] p-3 rounded border border-slate-950 flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400 font-semibold">Tipo de Documento:</span>
              <span className={`text-[10.5px] uppercase font-mono px-2 py-1 rounded font-bold border ${
                parsedPdfData.tipoDocumento === 'FACTURA_PROVISION' 
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                  : 'bg-hud-accent/10 text-hud-accent border-hud-accent/20'
              }`}>
                {parsedPdfData.tipoDocumento === 'FACTURA_PROVISION' ? 'Provisión / Flete Transportadora' : 'Pedido / Orden de Compra Cliente'}
              </span>
            </div>

            {parsedPdfData.tipoDocumento === 'FACTURA_PROVISION' ? (
              /* --- RENDER FOR TRANS CARRIER PROVISION --- */
              <div className="space-y-4 text-white">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono bg-slate-950/40 p-3 rounded border border-slate-900/60">
                  <div className="col-span-2 text-sky-455 text-[10px] uppercase tracking-widest border-b border-slate-900/40 pb-1 mb-1 font-bold">Carga de Provisión Operativa</div>
                  <div><span className="text-slate-400 block text-[9.5px]">Factura Provisión (FP):</span> <strong className="text-rose-400 font-bold text-sm">{parsedPdfData.provision || 'S/N'}</strong></div>
                  <div><span className="text-slate-400 block text-[9.5px]">Transportadora:</span> <strong className="text-white">{parsedPdfData.transportadora}</strong></div>
                  <div><span className="text-slate-400 block text-[9.5px] font-sans">Valor Flete Extraído:</span> <strong className="text-rose-400 font-bold">${(parsedPdfData.flete || 0).toLocaleString('es-CO')}</strong></div>
                  <div><span className="text-slate-400 block text-[9.5px] mb-0.5">Orden de Compra Ref:</span> <strong className="text-white">OC: {parsedPdfData.oc || 'N/A'}</strong></div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-slate-400 uppercase tracking-widest font-mono block font-bold">Vincular a Orden en el Sistema:</label>
                  {pdfMatchingOrder ? (
                    <div className="bg-hud-green/10 border border-hud-green/30 rounded p-2.5 flex items-center justify-between text-xs font-mono">
                      <div className="space-y-0.5">
                        <span className="text-sky-400 block text-[9px] uppercase font-bold">Orden Coincidente Sugerida</span>
                        <div><strong className="text-white">{pdfMatchingOrder.id}</strong> - {pdfMatchingOrder.cliente} ({pdfMatchingOrder.ciudad})</div>
                        <span className="text-[9.5px] block text-slate-400">PV: <span className="text-yellow-400 font-bold">{pdfMatchingOrder.pv}</span> | Flete anterior: ${pdfMatchingOrder.flete.toLocaleString('es-CO')}</span>
                      </div>
                      <span className="text-[10px] bg-hud-green/20 text-hud-green border border-hud-green/30 px-1.5 py-0.5 rounded font-black font-mono">SÚPER COINCIDENCIA</span>
                    </div>
                  ) : (
                    <div className="bg-rose-500/5 border border-rose-500/25 rounded p-2.5 text-xs text-rose-300 font-mono">
                      ⚠ No se detectó ninguna orden abierta con el número OC "{parsedPdfData.oc || 'S/N'}" o PV "{parsedPdfData.pv || 'S/N'}".
                    </div>
                  )}

                  <div className="pt-1 space-y-1">
                    <label className="text-[10px] text-slate-400 block font-mono uppercase">Seleccionar Orden manualmente para vincular flete:</label>
                    <select
                      value={pdfSelectedMatchOrderId || (pdfMatchingOrder ? pdfMatchingOrder.id : '')}
                      onChange={e => setPdfSelectedMatchOrderId(e.target.value)}
                      className="bg-slate-950 border border-slate-900 rounded p-2.5 text-xs text-white outline-none w-full font-mono"
                    >
                      <option value="">-- Buscar y seleccionar orden manual --</option>
                      {orders.map(o => (
                        <option key={o.id} value={o.id}>
                          [{o.id}] {o.cliente.substring(0,35)} - {o.ciudad} ({o.oc ? `OC: ${o.oc}` : `PV: ${o.pv}`}) - Flete: ${o.flete.toLocaleString('es-CO')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-3">
                  <button 
                    type="button"
                    onClick={() => setParsedPdfData(null)}
                    className="flex-1 border border-slate-800 hover:bg-slate-900 text-slate-400 text-xs px-4 py-2.5 rounded-lg font-mono font-bold cursor-pointer"
                  >
                    Descartar
                  </button>
                  <button 
                    type="button"
                    disabled={!pdfSelectedMatchOrderId && !pdfMatchingOrder}
                    onClick={handleUpdateOrderFromProvisionPdf}
                    className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-4 py-2.5 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono uppercase tracking-wider cursor-pointer font-bold"
                  >
                    Registrar Flete Provisión
                  </button>
                </div>
              </div>
            ) : (
              /* --- RENDER FOR CLIENT ORDERS --- */
              <div className="space-y-4 text-white">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono bg-slate-950/40 p-3 rounded border border-slate-900/60">
                  <div><span className="text-slate-400 block text-[9.5px]">Orden de Compra (OC):</span> <strong className="text-white">{parsedPdfData.oc || 'N/A'}</strong></div>
                  <div><span className="text-slate-400 block text-[9.5px]">Orden de Venta (PV):</span> <strong className="text-yellow-400 font-bold">{parsedPdfData.pv || 'N/A'}</strong></div>
                  {parsedPdfData.fecha && (
                    <div className="col-span-2 bg-slate-900/40 px-2 py-1 rounded border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-400 text-[9.5px]">📅 Fecha de Ingreso Extraída (PV):</span>
                      <strong className="text-cyan-400 font-bold text-xs">{parsedPdfData.fecha}</strong>
                    </div>
                  )}
                  <div className="col-span-2 bg-[#050b14] p-2.5 rounded border border-slate-900 mt-1">
                    <span className="text-slate-400 block text-[9.5px] uppercase tracking-wider font-semibold mb-1">Cliente detectado:</span>
                    <strong className="text-hud-accent font-bold text-sm">{resolveCustomerFromPdf(parsedPdfData.cliente)}</strong>
                    {(() => {
                      const detectedName = resolveCustomerFromPdf(parsedPdfData.cliente);
                      const cleanCityName = (s: string) => (s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
                      const pdfCityClean = cleanCityName(parsedPdfData.ciudad);
                      
                      let matched = customers.find(c => {
                        const matchesName = c.nombre.trim().toUpperCase() === detectedName.trim().toUpperCase();
                        if (!matchesName) return false;
                        const cCityClean = cleanCityName(c.ciudad);
                        return cCityClean === pdfCityClean || pdfCityClean.includes(cCityClean) || cCityClean.includes(pdfCityClean);
                      });

                      if (!matched) {
                        matched = customers.find(c => c.nombre.trim().toUpperCase() === detectedName.trim().toUpperCase());
                      }

                      if (matched) {
                        return (
                          <div className="mt-1 text-[10.5px] font-mono text-slate-300 space-y-0.5 border-t border-slate-900 pt-1">
                            <div>📍 <span className="text-slate-500">Dirección Sede:</span> <strong className="text-emerald-400 font-bold">{matched.dir || "Sin Dirección Registrada"}</strong></div>
                          </div>
                        );
                      } else {
                        return (
                          <div className="mt-1 text-[10px] text-yellow-500 italic">
                            ⚠ No se encontró sucursal exacta en la base de datos para este cliente. Se generará un nuevo registro o se puede asociar al guardar.
                          </div>
                        );
                      }
                    })()}
                  </div>
                  <div><span className="text-slate-400 block text-[9.5px]">Cajas físicas:</span> <strong className="text-hud-green font-bold text-sm">{parsedPdfData.cajas}</strong></div>
                  <div><span className="text-slate-400 block text-[9.5px]">Peso en Kilogramos:</span> <strong className="text-hud-green font-bold text-sm">{parsedPdfData.peso} kg</strong></div>
                  <div className="col-span-2"><span className="text-slate-400 block text-[9.5px]">Ciudad Sede Destino:</span> <strong className="text-hud-accent font-bold">{parsedPdfData.ciudad}</strong></div>
                  {parsedPdfData.factura && (
                    <div className="col-span-2"><span className="text-slate-400 block text-[9.5px]">Factura de Venta Cliente:</span> <strong className="text-[#ffaa00] font-bold">{parsedPdfData.factura}</strong></div>
                  )}
                  <div className="col-span-2 pt-2 border-t border-slate-900"><span className="text-slate-400 text-sm">Valor de la Venta (COP):</span> <strong className="text-xl text-hud-green font-display font-extrabold block mt-0.5">${(Number(parsedPdfData.venta) || 0).toLocaleString('es-CO')}</strong></div>
                </div>

                <div className="flex items-center gap-3 pt-3">
                  <button 
                    type="button"
                    onClick={() => setParsedPdfData(null)}
                    className="flex-1 border border-slate-800 hover:bg-slate-900 text-slate-400 text-xs px-4 py-2.5 rounded-lg font-mono font-bold cursor-pointer"
                  >
                    Descartar
                  </button>
                  <button 
                    type="button"
                    onClick={handleCreateOrderFromPdf}
                    className="flex-1 bg-hud-green hover:bg-emerald-500 text-slate-950 font-black text-xs px-4 py-2.5 rounded-lg transition-colors font-mono uppercase tracking-wider cursor-pointer"
                  >
                    Generar Orden Digital
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Universal parsed error toast notification */}
      {pdfParsingError && (
        <div className="fixed bottom-6 left-6 z-[25000] bg-rose-950/95 border border-rose-500/50 p-4 rounded-xl shadow-2xl max-w-sm w-full font-mono text-xs flex items-start gap-3 backdrop-blur-md text-rose-300 animate-fade-in">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-500 animate-pulse" />
          <div className="flex-1 space-y-1">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Error de Lectura de PDF</h4>
            <p className="text-[10.5px] leading-snug">{pdfParsingError}</p>
          </div>
          <button onClick={() => setPdfParsingError(null)} className="text-slate-400 hover:text-white font-mono text-sm leading-none font-bold">✕</button>
        </div>
      )}

      {/* Backup & Hybrid System Modal */}
      {isBackupModalOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsBackupModalOpen(false);
          }}
          className="fixed inset-0 z-[26000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div className="bg-hud-card border border-hud-accent/40 rounded-xl max-w-2xl w-full p-4 sm:p-6 space-y-4 text-slate-200 shadow-2xl relative animate-fade-in font-mono max-h-[90vh] overflow-y-auto my-auto">
            <div className="sticky top-0 bg-hud-card z-20 flex items-center justify-between border-b border-slate-800 pb-3 pt-1">
              <div className="flex items-center gap-2 text-hud-accent">
                <Database className="w-5 h-5 text-hud-accent flex-shrink-0" />
                <h3 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white">Sistema Híbrido y Copias de Seguridad</h3>
              </div>
              <button 
                type="button"
                onClick={() => setIsBackupModalOpen(false)}
                className="bg-slate-800/80 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 border border-slate-700 hover:border-rose-500/40 px-3 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                title="Cerrar ventana"
              >
                <span>Cerrar</span> ✕
              </button>
            </div>

            {/* Hybrid Info Box */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-3 text-xs font-mono">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-900 pb-3">
                <span className="font-bold text-white uppercase flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${cloudStatus.connected ? 'bg-emerald-400 pulse-led' : 'bg-amber-400'}`}></span>
                  Estado: {cloudStatus.connected ? 'Sincronizado en Tiempo Real con Servidor Nube' : 'Modo Offline / Local (Nube Pausada)'}
                </span>
                <span className="text-[10px] text-hud-accent bg-slate-900 px-2 py-1 rounded border border-slate-800 font-bold">
                  {orders.length} Fletes Activos
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] bg-slate-900/60 p-2.5 rounded border border-slate-800/80">
                <div>
                  <span className="text-slate-400 block">Proyecto Firestore:</span>
                  <strong className="text-emerald-400 select-all">{cloudStatus.projectId}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Base de Datos Compartida:</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <strong className="text-hud-accent select-all">{cloudStatus.databaseId}</strong>
                    <button
                      type="button"
                      onClick={() => handleSwitchDatabase(cloudStatus.databaseId === '(default)' ? 'ai-studio-7257e416-c916-4773-80bd-ca9334204e28' : '(default)')}
                      className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                      title="Alternar entre la base de datos (default) y la personalizada de AI Studio"
                    >
                      Cambiar a {cloudStatus.databaseId === '(default)' ? 'ai-studio-7257e416...' : '(default)'}
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 block">Último Sync Servidor:</span>
                  <strong className="text-sky-300">{cloudStatus.lastServerSyncTime || 'Conectando a nube...'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Origen de Datos:</span>
                  <strong className={cloudStatus.isFromCache ? 'text-amber-400' : 'text-emerald-400'}>
                    {cloudStatus.isFromCache ? 'Caché Local (Sincronizando)' : 'Servidor Firestore Directo'}
                  </strong>
                </div>
              </div>

              {cloudStatus.lastError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-300 text-[11px] leading-relaxed font-sans">
                  <div className="font-bold flex items-center gap-1.5 text-rose-400 mb-1">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    Atención: Error detectado en Firebase Firestore
                  </div>
                  <p className="font-mono text-[10px] bg-slate-950 p-2 rounded border border-rose-900/50 mb-2 overflow-x-auto text-rose-200">
                    {cloudStatus.lastError}
                  </p>
                  <div className="text-[10px] text-slate-300 space-y-1">
                    <p>• <strong>Si dice "Missing or insufficient permissions":</strong> Las Reglas de Seguridad en la consola de Firebase están bloqueando las lecturas/escrituras. En la consola de Firebase &gt; Firestore &gt; Reglas (Rules), asegúrate de establecer <code className="text-amber-300">allow read, write: if true;</code> para la base de datos active.</p>
                    <p>• <strong>Prueba cambiar de Base de Datos:</strong> Usa el botón "Cambiar a..." de arriba para probar la base de datos <code className="text-emerald-300">(default)</code> o la de AI Studio.</p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                <p className="text-slate-400 text-[10px] leading-relaxed flex-1">
                  Todos los 4 PCs deben estar conectados a la misma BD <code className="text-hud-accent">{cloudStatus.databaseId}</code> para compartir fletes en tiempo real.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePushLocalToCloud}
                    className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap"
                    title="Subir inmediatamente los fletes y datos de este PC a la nube Firestore"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-400" /> Publicar a Nube
                  </button>
                  <button
                    type="button"
                    onClick={handleForceCloudSync}
                    className="bg-sky-500/20 border border-sky-500/40 text-sky-300 hover:bg-sky-500/30 px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all whitespace-nowrap"
                    title="Cargar la última versión directa del servidor de Firestore"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin-slow" /> Descargar de Nube
                  </button>
                </div>
              </div>
            </div>

            {backupRestoreMessage && (
              <div className={`p-3 rounded-lg border text-xs font-bold ${
                backupRestoreMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}>
                {backupRestoreMessage.text}
              </div>
            )}

            {/* Actions Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Backup Card */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase">
                    <Download className="w-4 h-4" /> Exportar Copia de Seguridad
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Descarga un archivo JSON completo con todos los fletes, clientes, novedades, reclamos y configuraciones de la aplicación.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const backup = generateFullBackupObject();
                    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const dateStr = new Date().toISOString().split('T')[0];
                    a.href = url;
                    a.download = `backup_sistemalog_${dateStr}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    setBackupRestoreMessage({ type: 'success', text: 'Copia de seguridad descargada exitosamente en formato JSON.' });
                  }}
                  className="w-full bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/30 text-emerald-300 font-bold py-2.5 rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer transition-all uppercase"
                >
                  <Download className="w-4 h-4" /> Descargar Backup JSON
                </button>
              </div>

              {/* Restore Card */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sky-400 font-bold text-xs uppercase">
                    <Upload className="w-4 h-4" /> Restaurar Copia de Seguridad
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Carga un archivo JSON de respaldo previo para restaurar todos los datos en la base local y sincronizarlos con la nube.
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => restoreFileInputRef.current?.click()}
                    className="w-full bg-sky-500/20 border border-sky-500/40 hover:bg-sky-500/30 text-sky-300 font-bold py-2.5 rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer transition-all uppercase"
                  >
                    <Upload className="w-4 h-4" /> Seleccionar Archivo JSON
                  </button>
                  <input
                    type="file"
                    ref={restoreFileInputRef}
                    accept=".json"
                    className="hidden"
                    onChange={async e => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        try {
                          const text = await file.text();
                          const json = JSON.parse(text);
                          const result = await restoreFullBackupObject(json);
                          if (result.success) {
                            setBackupRestoreMessage({ type: 'success', text: result.message });
                            setTimeout(() => {
                              window.location.reload();
                            }, 1500);
                          } else {
                            setBackupRestoreMessage({ type: 'error', text: result.message });
                          }
                        } catch (err: any) {
                          setBackupRestoreMessage({ type: 'error', text: 'Error al leer el archivo JSON seleccionado.' });
                        }
                      }
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              {/* Deduplication Card */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-3 flex flex-col justify-between md:col-span-2">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase">
                    <RefreshCw className="w-4 h-4" /> Depurar y Consolidar Duplicados
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Analiza automáticamente todos los registros cargados o importados desde Excel. Si encuentra solicitudes con el mismo Pedido de Venta (PV) o Factura, unifica la información en un solo registro completo sin duplicar datos.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const { cleanedList, removedCount } = deduplicateOrders(orders);
                    saveOrders(cleanedList);
                    setOrders(cleanedList);
                    if (removedCount > 0) {
                      setBackupRestoreMessage({ type: 'success', text: `Se unificaron y limpiaron ${removedCount} registros duplicados con éxito.` });
                    } else {
                      setBackupRestoreMessage({ type: 'success', text: 'No se encontraron duplicados. La base de datos está totalmente limpia.' });
                    }
                  }}
                  className="w-full bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 text-amber-300 font-bold py-2.5 rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer transition-all uppercase text-center"
                >
                  <RefreshCw className="w-4 h-4" /> Ejecutar Depuración de Duplicados
                </button>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 text-center border-t border-slate-800/80 pt-3">
              ID Base Firestore: <code className="text-hud-accent">{cloudStatus.databaseId}</code> | Propietario: soporteyabi@gmail.com
            </div>
          </div>
        </div>
      )}

      {/* Universal Successful parsing toast notification */}
      {pSuccessToast && (
        <div className="fixed bottom-6 right-6 z-[25000] bg-slate-950/95 border-2 border-hud-green p-4 rounded-xl shadow-2xl max-w-sm w-full font-mono text-xs animate-fade-in flex items-start gap-3 backdrop-blur-md text-white">
          <span className="text-xl text-hud-green">⚡</span>
          <div className="space-y-1">
            <h4 className="font-bold text-hud-green uppercase tracking-wide text-[11px]">{pSuccessToast.title}</h4>
            <p className="text-slate-200 text-[10.5px] leading-snug">{pSuccessToast.message}</p>
          </div>
          <button onClick={() => setPSuccessToast(null)} className="text-slate-500 hover:text-white font-mono text-xs font-bold ml-auto">✕</button>
        </div>
      )}

      {/* Sync Queue & Consistency Reconciliation Monitor Modal */}
      {isSyncMonitorOpen && (
        <SyncQueueMonitorModal 
          isOpen={isSyncMonitorOpen}
          orders={orders}
          savedVouchers={(() => {
            try {
              return JSON.parse(localStorage.getItem('prov_saved_vouchers') || '[]');
            } catch {
              return [];
            }
          })()}
          onClose={() => setIsSyncMonitorOpen(false)}
        />
      )}


    </div>
  );
}
