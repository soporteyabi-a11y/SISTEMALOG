/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Order, Customer, Carrier } from '../types';
import { matchOrderSearch, sortOrdersBySearchRelevance } from '../utils/searchHelper';
import * as XLSX from 'xlsx';
import { 
  Plus, FileSpreadsheet, Search, CheckCircle, Clock, Trash2, 
  MapPin, Clipboard, Tag, Calendar, User, Truck, DollarSign, Upload, AlertTriangle, RefreshCw,
  ChevronLeft, ChevronRight, Printer
} from 'lucide-react';
import { printSingleOrder } from '../utils/printRequest';

interface OrdersModuleProps {
  orders: Order[];
  customers: Customer[];
  carriers: Carrier[];
  onAddOrder: (order: Order) => void;
  onAddOrders?: (orders: Order[]) => void;
  onUpdateOrder: (order: Order) => void;
  onUpdateOrders?: (orders: Order[]) => void;
  onDeleteOrder: (id: string, pin: string, motivo: string, physical?: boolean) => boolean;
  onOpenOrderForm: (order?: Order, isSplitAction?: boolean) => void;
  onDeleteImportedOrders?: () => void;
  onResetDatabase?: () => void;
  onDeduplicateOrders?: () => void;
}

export default function OrdersModule({ 
  orders, customers, carriers, onAddOrder, onAddOrders, onUpdateOrder, onUpdateOrders, onDeleteOrder, onOpenOrderForm,
  onDeleteImportedOrders, onResetDatabase, onDeduplicateOrders
}: OrdersModuleProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(15);
  const [sortOrder, setSortOrder] = useState<'id_desc' | 'id_asc' | 'date_desc' | 'date_asc' | 'client_asc'>('id_desc');
  const [currentPage, setCurrentPage] = useState(1);

  // Selected items state for Consolidation
  const [selectedIds, setSelectedItems] = useState<string[]>([]);
  // Consolidation Modal Open State
  const [isConsoOpen, setIsConsoOpen] = useState(false);
  
  // Custom HUD Toast state for instant feedback
  const [successToast, setSuccessToast] = useState<{ title: string; message: string } | null>(null);

  // Deletion Dialog State
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletePin, setDeletePin] = useState('');
  const [deleteMotivo, setDeleteMotivo] = useState('');
  const [deletePhysical, setDeletePhysical] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // XLSX Parsing & Advanced Maintenance States
  const [uploadedMatrix, setUploadedMatrix] = useState<string[][] | null>(null);
  const [excelParsingError, setExcelParsingError] = useState<string | null>(null);

  const [activeMaintenanceAction, setActiveMaintenanceAction] = useState<'delete_imported' | 'reset_db' | null>(null);
  const [maintenancePin, setMaintenancePin] = useState('');
  const [maintenanceError, setMaintenanceError] = useState('');

  // Filters and Sorting
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    if (searchTerm.trim()) {
      result = result.filter(o => matchOrderSearch(o, searchTerm));
      result = sortOrdersBySearchRelevance(result, searchTerm);
    }

    if (statusFilter) {
      result = result.filter(o => o.estado === statusFilter);
    }

    if (carrierFilter) {
      result = result.filter(o => o.transportadora === carrierFilter);
    }

    // Apply sorting when not using keyword search
    if (!searchTerm.trim()) {
      if (sortOrder === 'id_desc') {
        result.sort((a, b) => {
          const numA = parseInt((a.id || '').replace(/\D/g, ''), 10) || 0;
          const numB = parseInt((b.id || '').replace(/\D/g, ''), 10) || 0;
          return numB - numA;
        });
      } else if (sortOrder === 'id_asc') {
        result.sort((a, b) => {
          const numA = parseInt((a.id || '').replace(/\D/g, ''), 10) || 0;
          const numB = parseInt((b.id || '').replace(/\D/g, ''), 10) || 0;
          return numA - numB;
        });
      } else if (sortOrder === 'date_desc') {
        result.sort((a, b) => (b.fechaIngreso || '').localeCompare(a.fechaIngreso || ''));
      } else if (sortOrder === 'date_asc') {
        result.sort((a, b) => (a.fechaIngreso || '').localeCompare(b.fechaIngreso || ''));
      } else if (sortOrder === 'client_asc') {
        result.sort((a, b) => (a.cliente || '').localeCompare(b.cliente || ''));
      }
    }

    return result;
  }, [orders, searchTerm, statusFilter, carrierFilter, sortOrder]);

  // Bulk values for consolidation selection
  const consolidatedStats = useMemo(() => {
    const selectedOrders = orders.filter(o => selectedIds.includes(o.id));
    const totalBoxes = selectedOrders.reduce((sum, o) => sum + o.cajas, 0);
    const totalWeight = selectedOrders.reduce((sum, o) => sum + o.peso, 0);
    const totalValue = selectedOrders.reduce((sum, o) => sum + o.venta, 0);
    const totalFacturado = selectedOrders.reduce((sum, o) => sum + ((o.facturado && o.facturado > 0) ? o.facturado : o.venta), 0);
    return { count: selectedOrders.length, totalBoxes, totalWeight, totalValue, totalFacturado };
  }, [orders, selectedIds]);

  // Reset page when filter changes or out of bounds
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, carrierFilter, itemsPerPage, sortOrder]);

  // Pagination for main table
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(Math.max(1, totalPages));
    }
  }, [totalPages, currentPage]);

  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  const toggleSelectItem = (id: string) => {
    setSelectedItems(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(paginatedOrders.map(o => o.id));
    } else {
      setSelectedItems([]);
    }
  };

  // Mass change state for Consolidation form
  const [consoCarrier, setConsoOperador] = useState('');
  const [consoPlaca, setConsoPlaca] = useState('');
  const [consoConductor, setConsoConductor] = useState('');
  const [consoCelular, setConsoCelular] = useState('');
  const [consoFlete, setConsoFlete] = useState(0);
  const [consoEstado, setConsoEstado] = useState('Despachado');
  const [consoHoraSalida, setConsoHoraSalida] = useState('');
  const [consoOrders, setConsoOrders] = useState<Order[]>([]);

  // Synchronize consoOrders state with selectedIds and open status safely
  const lastSelectedIdsRef = useRef<string[]>([]);
  useEffect(() => {
    if (isConsoOpen) {
      const sortedIds = [...selectedIds].sort();
      const lastSortedIds = [...lastSelectedIdsRef.current].sort();
      const idsChanged = sortedIds.join(',') !== lastSortedIds.join(',');
      
      if (idsChanged || consoOrders.length === 0) {
        lastSelectedIdsRef.current = [...selectedIds];
        const selected = orders.filter(o => selectedIds.includes(o.id));
        const todayStr = new Date().toISOString().split('T')[0];
        setConsoOrders(selected.map(o => {
          let initFacturado = o.facturado;
          const numFactura = Number(String(o.factura).replace(/[^0-9]/g, ''));
          // If facturado is empty, equals the invoice number, or is a small integer (likely an invoice number under 100,000) while venta is large
          if (
            !initFacturado || 
            initFacturado === numFactura || 
            (initFacturado > 0 && initFacturado < 100000 && o.venta > 100000)
          ) {
            initFacturado = o.venta;
          }
          return {
            ...o,
            fechaFactura: o.fechaFactura || todayStr,
            factura: o.factura || '',
            facturado: initFacturado,
            cajasFact: o.cajasFact || o.cajas,
            pesoFact: o.pesoFact || o.peso
          };
        }));
      }
    } else {
      lastSelectedIdsRef.current = [];
      if (consoOrders.length > 0) {
        setConsoOrders([]);
      }
    }
  }, [isConsoOpen, selectedIds, orders]);

  const handleUpdateConsoOrder = (id: string, field: keyof Order, value: any) => {
    setConsoOrders(prev => prev.map(o => {
      if (o.id === id) {
        return { ...o, [field]: value };
      }
      return o;
    }));
  };

  const consoTotals = useMemo(() => {
    const totalBoxes = consoOrders.reduce((sum, o) => sum + Number(o.cajasFact !== undefined ? o.cajasFact : (o.cajas || 0)), 0);
    const totalWeight = consoOrders.reduce((sum, o) => sum + Number(o.pesoFact !== undefined ? o.pesoFact : (o.peso || 0)), 0);
    const totalValue = consoOrders.reduce((sum, o) => sum + Number(o.venta || 0), 0);
    const totalFacturado = consoOrders.reduce((sum, o) => sum + Number(o.facturado || o.venta || 0), 0);
    return { totalBoxes, totalWeight, totalValue, totalFacturado };
  }, [consoOrders]);

  const isFormulaCarrier = (name: string | undefined | null): boolean => {
    if (!name) return false;
    const matched = carriers.find(c => c.nombre.trim().toUpperCase() === name.trim().toUpperCase());
    if (matched) {
      return matched.tipoCalculo === 'formula';
    }
    const upper = name.toUpperCase();
    return upper.includes("FREDY") && (upper.includes("HERNANDEZ") || upper.includes("HERNÁNDEZ"));
  };

  const getCarrierCalculatedFlete = (
    carrierName: string | undefined | null,
    orderVal: number,
    orderBoxes: number,
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
      const matched = carriers.find(c => c.nombre.trim().toUpperCase() === carrierName.trim().toUpperCase());
      if (matched) {
        if (matched.tipoCalculo === 'formula') {
          const pct = matched.porcentajeValor || 0;
          const flatCaja = matched.costoCaja || 0;
          return Math.round((orderVal * (pct / 100)) + (orderBoxes * flatCaja));
        } else {
          return matched.costoSugerido || 0;
        }
      }
      return Math.round((orderVal * 0.035) + (orderBoxes * 400));
    }

    const matched = carriers.find(c => c.nombre.trim().toUpperCase() === carrierName.trim().toUpperCase());
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

  const calculateFormulaFlete = () => {
    const total = consoOrders.reduce((sum, co) => {
      const vFact = Number(co.facturado) > 0 ? Number(co.facturado) : Number(co.venta || 0);
      const cFact = Number(co.cajasFact) > 0 ? Number(co.cajasFact) : Number(co.cajas || 0);
      return sum + getCarrierCalculatedFlete(consoCarrier, vFact, cFact, co.cliente);
    }, 0);
    setConsoFlete(Math.round(total));
  };

  const getFormulaDisplayLabel = (carrierName: string | undefined | null): string => {
    if (!carrierName) return '';
    const matched = carriers.find(c => c.nombre.trim().toUpperCase() === carrierName.trim().toUpperCase());
    if (matched && matched.tipoCalculo === 'formula') {
      const pct = matched.porcentajeValor || 0;
      const flatCaja = matched.costoCaja || 0;
      return `(Calcular Fórmula: ${pct}% + $${flatCaja}/cj)`;
    }
    const upper = carrierName.toUpperCase();
    if (upper.includes("FREDY") && (upper.includes("HERNANDEZ") || upper.includes("HERNÁNDEZ"))) {
      return `(Calcular Fredy: 3.5% + $400/cj - Mercapava $550/cj)`;
    }
    return '';
  };

  // 1. For formula-based carriers, automatically recalculate flete whenever cargo details change
  useEffect(() => {
    if (!consoCarrier) return;
    const isFormula = isFormulaCarrier(consoCarrier);
    if (isFormula) {
      calculateFormulaFlete();
    }
  }, [consoOrders, consoCarrier]);

  // 2. Only automatically load carrier's suggested flete cost when the selected carrier itself changes (prevents manual overrides from being erased)
  useEffect(() => {
    if (!consoCarrier) {
      setConsoFlete(0);
      return;
    }
    const isFormula = isFormulaCarrier(consoCarrier);
    if (!isFormula) {
      const matched = carriers.find(c => c.nombre === consoCarrier);
      setConsoFlete(matched ? (matched.costoSugerido || 0) : 0);
    }
  }, [consoCarrier, carriers]);

  const handleApplyConsolidation = () => {
    // Updates all selected orders
    const updatedOrdersList: Order[] = [];
    consoOrders.forEach(co => {
      let finalFacturado = co.facturado;
      const numFactura = Number(String(co.factura).replace(/[^0-9]/g, ''));
      if (
        !finalFacturado || 
        finalFacturado === numFactura || 
        (finalFacturado > 0 && finalFacturado < 100000 && co.venta > 100000)
      ) {
        finalFacturado = co.venta;
      }

      let finalFlete = co.flete;
      const isFormula = isFormulaCarrier(consoCarrier);
      if (isFormula) {
        const vFact = Number(finalFacturado) > 0 ? Number(finalFacturado) : Number(co.venta || 0);
        const cFact = Number(co.cajasFact) > 0 ? Number(co.cajasFact) : Number(co.cajas || 0);
        finalFlete = getCarrierCalculatedFlete(consoCarrier, vFact, cFact, co.cliente);
      } else if (consoFlete > 0) {
        const orderVal = (finalFacturado && finalFacturado > 0) ? finalFacturado : co.venta;
        finalFlete = consoTotals.totalFacturado > 0
          ? Math.round(consoFlete * (orderVal / consoTotals.totalFacturado))
          : Math.round(consoFlete / consoOrders.length);
      } else {
        finalFlete = 0;
      }

      updatedOrdersList.push({
        ...co,
        facturado: finalFacturado,
        estado: (consoEstado || 'Despachado') as any,
        transportadora: consoCarrier || co.transportadora,
        placa: consoPlaca || co.placa,
        conductor: consoConductor || co.conductor,
        celular: consoCelular || co.celular,
        flete: finalFlete,
        fechaSalida: consoHoraSalida ? consoHoraSalida.split('T')[0] : (co.fechaSalida || co.fechaFactura || co.fechaIngreso || new Date().toISOString().split('T')[0])
      });
    });

    if (onUpdateOrders) {
      onUpdateOrders(updatedOrdersList);
    } else {
      updatedOrdersList.forEach(onUpdateOrder);
    }

    setSelectedItems([]);
    setIsConsoOpen(false);
    // Reset conso inputs
    setConsoOperador('');
    setConsoPlaca('');
    setConsoConductor('');
    setConsoCelular('');
    setConsoFlete(0);
    setConsoHoraSalida('');
    setConsoEstado('Despachado');
  };

  // Excel / CSV Importer state
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [excelInputText, setExcelInputText] = useState('');
  const [hasHeaders, setHasHeaders] = useState(true);
  const [customMappings, setCustomMappings] = useState<Record<string, number>>({});

  const parsedExcelData = useMemo(() => {
    if (uploadedMatrix && uploadedMatrix.length > 0) return uploadedMatrix;
    if (!excelInputText.trim()) return [];
    const lines = excelInputText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return [];

    // Auto-detect delimiter based on frequency in first row
    const firstLine = lines[0];
    const tabs = (firstLine.match(/\t/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    let delim = '\t';
    if (semicolons > tabs && semicolons > commas) delim = ';';
    else if (commas > tabs && commas > semicolons) delim = ',';

    const matrix = lines.map(line => {
      let cells: string[] = [];
      if (delim === ',') {
        const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        if (matches) {
          cells = matches.map(c => c.replace(/^"|"$/g, '').trim());
        } else {
          cells = line.split(delim).map(c => c.trim());
        }
      } else {
        cells = line.split(delim).map(c => c.trim());
      }
      return cells;
    });

    return matrix;
  }, [uploadedMatrix, excelInputText]);

  const autoMappedCols = useMemo(() => {
    const mappings: Record<string, number> = {
      pv: -1,
      oc: -1,
      cliente: -1,
      ciudad: -1,
      cajas: -1,
      peso: -1,
      venta: -1,
      factura: -1,
      flete: -1,
      transportadora: -1,
      fechaIngreso: -1,
      fechaFactura: -1,
    };

    if (parsedExcelData.length === 0) return mappings;
    const headers = hasHeaders ? parsedExcelData[0] : [];
    
    // Helper search dictionary
    const keywords: Record<string, string[]> = {
      pv: ['pv', 'pedido', 'venta', 'vta', 'solicitud', 'sap'],
      oc: ['oc', 'orden', 'compra', 'op', 'servicio', 'po'],
      cliente: ['cliente', 'nombre', 'razon', 'empresa', 'destinatario'],
      ciudad: ['ciudad', 'destino', 'sede', 'municipio', 'city', 'entrega'],
      cajas: ['cajas', 'caja', 'unidades', 'cant', 'bultos', 'cjs', 'qty'],
      peso: ['peso', 'kg', 'kilos', 'kilogramos', 'weight'],
      venta: ['venta', 'valor', 'comercial', 'monto', 'subtotal', 'precio', 'total'],
      factura: ['factura', 'fact', 'fe', 'fv', 'número factura'],
      flete: ['flete', 'costo flete', 'gasto', 'transporte', 'tarifa', 'carrier cost'],
      transportadora: ['transportadora', 'trans', 'operador', 'empresa trans'],
      fechaIngreso: ['fecha ingreso', 'fecha_ingreso', 'fecha de ingreso', 'fecha pedido', 'fecha creacion', 'fecha creación', 'created_at', 'date'],
      fechaFactura: ['fecha factura', 'fecha_factura', 'fecha de factura', 'fecha facturacion', 'fecha facturación', 'fecha_fact', 'invoice_date', 'billing_date'],
    };

    if (hasHeaders && headers.length > 0) {
      headers.forEach((h, idx) => {
        const text = h.toLowerCase();
        Object.keys(keywords).forEach(field => {
          if (mappings[field] !== -1) return; // already matched
          let matches = keywords[field].some(kw => text.includes(kw));
          if (field === 'factura' && (
            text.includes('fecha') || 
            text.includes('date') || 
            text.includes('dia') || 
            text.includes('día') ||
            text.includes('valor') ||
            text.includes('monto') ||
            text.includes('pesos') ||
            text.includes('$')
          )) {
            matches = false;
          }
          if (field === 'pv' && (
            text.includes('valor') ||
            text.includes('monto') ||
            text.includes('comercial') ||
            text.includes('total') ||
            text.includes('$')
          )) {
            matches = false;
          }
          if (matches) {
            mappings[field] = idx;
          }
        });
      });
    }

    if (!hasHeaders) {
      const keys = ['pv', 'oc', 'cliente', 'ciudad', 'cajas', 'peso', 'venta', 'factura', 'flete', 'transportadora'];
      keys.forEach((key, idx) => {
        if (parsedExcelData[0] && idx < parsedExcelData[0].length) {
          mappings[key] = idx;
        }
      });
    } else {
      const fields = ['pv', 'oc', 'cliente', 'ciudad', 'cajas', 'peso', 'venta', 'factura', 'flete', 'transportadora'];
      fields.forEach(f => {
        if (mappings[f] === -1) {
          for (let i = 0; i < headers.length; i++) {
            const isMapped = Object.values(mappings).includes(i);
            if (!isMapped) {
              const sampleVal = parsedExcelData[1]?.[i] || '';
              if (f === 'pv' || f === 'oc') {
                if (/^\d{6,15}$/.test(sampleVal)) { mappings[f] = i; break; }
              } else if (f === 'cajas' || f === 'peso') {
                if (/^\d+$/.test(sampleVal) && parseInt(sampleVal) > 0 && parseInt(sampleVal) < 10000) { mappings[f] = i; break; }
              } else if (f === 'venta' || f === 'flete') {
                if (/^\d+(\.\d+)?$/.test(sampleVal.replace(/[^0-9]/g, ''))) { mappings[f] = i; break; }
              }
            }
          }
        }
      });
    }

    return mappings;
  }, [parsedExcelData, hasHeaders]);

  const finalMappings = useMemo(() => {
    const merged = { ...autoMappedCols };
    Object.keys(customMappings).forEach(key => {
      if (customMappings[key] !== undefined) {
        merged[key] = customMappings[key];
      }
    });
    return merged;
  }, [autoMappedCols, customMappings]);

  const resolveMatchedCustomer = (rawName: string) => {
    const validCustomers = customers.map(c => c.nombre);
    if (!rawName) return validCustomers[0] || "CLIENTE NO REGISTRADO";

    const norm = rawName.toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[.\-,()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (validCustomers.length === 0) return rawName;

    // 1. First try standard exact matching
    for (const c of validCustomers) {
      const cNorm = c.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.\-,()]/g, ' ').replace(/\s+/g, ' ').trim();
      if (norm === cNorm) return c;
    }

    // 2. Specific guard: If raw name contains "MERCAPAVA", find a valid customer containing "MERCAPAVA"
    if (norm.includes("MERCAPAVA")) {
      for (const c of validCustomers) {
        const cNorm = c.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.\-,()]/g, ' ').replace(/\s+/g, ' ').trim();
        if (cNorm.includes("MERCAPAVA")) {
          // Let's find the best sub-match if there are multiple MERCAPAVA locations
          // E.g., comparing branch codes or specific names (013 vs 010)
          const rawWords = norm.split(/\s+/);
          const branchCode = rawWords.find(w => /^\d+$/.test(w) || w.startsWith("0"));
          if (branchCode && cNorm.includes(branchCode)) {
            return c;
          }
        }
      }
      // If no specific branch code matched, just return the first customer containing MERCAPAVA
      for (const c of validCustomers) {
        if (c.toUpperCase().includes("MERCAPAVA")) return c;
      }
    }

    // 3. Try to check if raw name contains other major brands to map them securely
    for (const c of validCustomers) {
      const cNorm = c.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.\-,()]/g, ' ');
      if (norm.includes("EXITO") && c.toUpperCase().includes("EXITO")) return c;
      if (norm.includes("JUMBO") && c.toUpperCase().includes("JUMBO")) return c;
      if (norm.includes("CENCOSUD") && c.toUpperCase().includes("JUMBO")) return c;
      // ONLY map to ALKOSTO if it doesn't contain MERCAPAVA
      if (!norm.includes("MERCAPAVA") && norm.includes("ALKOSTO") && c.toUpperCase().includes("ALKOSTO")) return c;
      if (norm.includes("OLIMPICA") && c.toUpperCase().includes("OLIMPICA")) return c;
      if (norm.includes("VALLE") && c.toUpperCase().includes("VALLE")) return c;
      if (norm.includes("CANAVERAL") && c.toUpperCase().includes("CANAVERAL")) return c;
      if (norm.includes("PACIFICO") && c.toUpperCase().includes("PACIFICO")) return c;
      if (norm.includes("HUILA") && c.toUpperCase().includes("HUILA")) return c;
      if (norm.includes("MERCACENTRO") && c.toUpperCase().includes("MERCACENTRO")) return c;

      const words = norm.split(/\s+/).filter(w => w.length > 2);
      const hostWords = cNorm.split(/\s+/).filter(w => w.length > 2);
      const intersection = words.filter(w => hostWords.includes(w));
      if (intersection.length > 0) return c;
    }

    // Default to the actual excel client name to avoid matching completely unrelated customers!
    return rawName;
  };

  const resolveMatchedCarrier = (rawName: string) => {
    const validCarriers = carriers.map(c => c.nombre);
    if (!rawName) return validCarriers[0] || "SISA CARGO";

    const norm = rawName.toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[.\-,()]/g, ' ')
      .trim();

    if (validCarriers.length === 0) return rawName;

    for (const c of validCarriers) {
      const cNorm = c.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.\-,()]/g, ' ');
      if (norm.includes("SISA") && cNorm.includes("SISA")) return c;
      if (norm.includes("VIA") && cNorm.includes("VIA")) return c;
      if (norm.includes("THR") && cNorm.includes("THR")) return c;
      if (norm.includes("FRED") && cNorm.includes("FRED")) return c;
      if (norm.includes("A5") && cNorm.includes("A5")) return c;

      const words = norm.split(/\s+/).filter(w => w.length > 2);
      const hostWords = cNorm.split(/\s+/).filter(w => w.length > 2);
      const intersection = words.filter(w => hostWords.includes(w));
      if (intersection.length > 0) return c;
    }

    return rawName;
  };

  const rowsToImport = useMemo(() => {
    if (parsedExcelData.length === 0) return [];
    
    const parseColombianFloat = (valStr: string): number => {
      if (!valStr) return 0;
      let clean = valStr.trim();
      
      // Remove currency symbols, percentage signs and spaces
      clean = clean.replace(/[$%\s]/g, '');
      
      // Detect if there's both thousands and decimals
      // Standard Colombian format: 12.513,68 or English format: 12,513.68
      if (clean.includes('.') && clean.includes(',')) {
        const dotIdx = clean.indexOf('.');
        const commaIdx = clean.indexOf(',');
        if (dotIdx < commaIdx) {
          // 12.513,68 -> 12513.68
          clean = clean.replace(/\./g, '').replace(/,/g, '.');
        } else {
          // 12,513.68 -> 12513.68
          clean = clean.replace(/,/g, '');
        }
      } else if (clean.includes(',')) {
        // Only has commas, e.g. 12513,68 or 12,513
        const parts = clean.split(',');
        if (parts.length === 2 && parts[1].length !== 3) {
          clean = clean.replace(/,/g, '.');
        } else if (parts.length === 2 && parts[1].length === 3) {
          // In Colombia, weight of 1,250 kg means 1.250 kg.
          // Let's treat it as decimal
          clean = clean.replace(/,/g, '.');
        } else {
          // Multiple commas -> thousands separator
          clean = clean.replace(/,/g, '');
        }
      } else if (clean.includes('.')) {
        // Only has dots, e.g. 12.513 or 12513.68 or 109443.903
        const parts = clean.split('.');
        if (parts.length === 2) {
          const beforeDot = parts[0];
          const afterDot = parts[1];
          if (beforeDot.length > 3 || afterDot.length !== 3) {
            // Decimal point (e.g. 109443.903 or 12513.68) - keep the dot
          } else {
            // Thousand separator (e.g. 109.443) - remove the dot
            clean = clean.replace(/\./g, '');
          }
        } else {
          // Multiple dots (e.g. 109.443.903) -> thousand separators
          clean = clean.replace(/\./g, '');
        }
      }
      
      const parsed = parseFloat(clean);
      return isNaN(parsed) ? 0 : parsed;
    };

    const startIndex = hasHeaders ? 1 : 0;
    const records = parsedExcelData.slice(startIndex).filter(row => {
      return row.some(cell => String(cell).trim() !== '');
    });

    return records.map((row, idx) => {
      const getCellValue = (field: string) => {
        const colIdx = finalMappings[field];
        if (colIdx === undefined || colIdx === -1 || colIdx >= row.length) return '';
        const rawValue = row[colIdx];
        if (rawValue === null || rawValue === undefined) return '';
        return String(rawValue).trim();
      };

      const pv = getCellValue('pv');
      const oc = getCellValue('oc');
      const rawCliente = getCellValue('cliente');
      const clienteResolved = resolveMatchedCustomer(rawCliente);
      const ciudad = getCellValue('ciudad') || 'Medellín';
      const flete = Math.round(parseColombianFloat(getCellValue('flete')));
      const cajas = Math.round(parseColombianFloat(getCellValue('cajas'))) || 10;
      const peso = parseColombianFloat(getCellValue('peso')) || 100;
      const venta = Math.round(parseColombianFloat(getCellValue('venta')));
      const factura = getCellValue('factura');
      const rawCarrier = getCellValue('transportadora');
      const carrierResolved = resolveMatchedCarrier(rawCarrier);

      const normalizeImportedDate = (val: string): string => {
        if (!val) return '';
        let cleaned = val.replace(/[.\s]/g, '-').replace(/\//g, '-');
        if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
          return cleaned;
        }
        const parts = cleaned.split('-');
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            const y = parts[0];
            const m = parts[1].padStart(2, '0');
            const d = parts[2].padStart(2, '0');
            return `${y}-${m}-${d}`;
          }
          if (parts[2].length === 4) {
            const y = parts[2];
            const d = parts[0].padStart(2, '0');
            const m = parts[1].padStart(2, '0');
            return `${y}-${m}-${d}`;
          }
        }
        try {
          const dObj = new Date(val);
          if (!isNaN(dObj.getTime())) {
            return dObj.toISOString().split('T')[0];
          }
        } catch (e) {}
        return val;
      };

      const rawFechaIngreso = getCellValue('fechaIngreso');
      const fechaIngresoVal = rawFechaIngreso ? normalizeImportedDate(rawFechaIngreso) : new Date().toISOString().split('T')[0];

      const rawFechaFactura = getCellValue('fechaFactura');
      const fechaFacturaVal = rawFechaFactura ? normalizeImportedDate(rawFechaFactura) : '';

      const rawFechaSalida = getCellValue('fechaSalida');
      const fechaSalidaVal = rawFechaSalida ? normalizeImportedDate(rawFechaSalida) : '';

      const existingMaxId = orders.reduce((max, o) => {
        const match = o.id ? o.id.match(/\d+/) : null;
        if (match) {
          const num = parseInt(match[0], 10);
          return num > max ? num : max;
        }
        return max;
      }, 2000);

      return {
        id: `SOL-${existingMaxId + idx + 1}`,
        pv,
        oc,
        fechaIngreso: fechaIngresoVal,
        fechaSalida: fechaSalidaVal,
        fechaEntrega: "",
        fechaFactura: fechaFacturaVal,
        horaCita: "",
        cliente: clienteResolved,
        ciudad,
        origen: "ACOPI-YUMBO",
        peso,
        cajas,
        venta,
        factura,
        facturado: venta,
        cajasFact: cajas,
        pesoFact: peso,
        flete,
        provision: "",
        transportadora: carrierResolved,
        placa: "",
        conductor: "",
        celular: "",
        estado: (fechaFacturaVal ? "Despachado" : "Pendiente") as any,
        obs: `Importado en lote desde Excel.`
      };
    });
  }, [parsedExcelData, hasHeaders, finalMappings, orders.length, customers, carriers]);

  const handleApplyExcelBulkImport = () => {
    if (rowsToImport.length === 0) return;
    if (onAddOrders) {
      onAddOrders(rowsToImport as any);
    } else {
      rowsToImport.forEach(o => onAddOrder(o as any));
    }
    // Reset states
    setIsExcelModalOpen(false);
    setExcelInputText('');
    setUploadedMatrix(null);
    setExcelParsingError(null);
    setCustomMappings({});
  };

  const handleExcelOrCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setExcelParsingError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const name = file.name.toLowerCase();
      const reader = new FileReader();

      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        reader.onload = (event) => {
          try {
            const ab = event.target?.result as ArrayBuffer;
            const workbook = XLSX.read(ab, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
            
            const stringMatrix = jsonData
              .filter(row => Array.isArray(row) && row.some(cell => String(cell).trim() !== ''))
              .map(row => 
                row.map(cell => (cell !== null && cell !== undefined) ? String(cell).trim() : '')
              );

            if (stringMatrix.length === 0) {
              setExcelParsingError("⚠️ El archivo Excel está vacío o no contiene filas válidas.");
              return;
            }

            setUploadedMatrix(stringMatrix);
            setExcelInputText(''); // Clear plain text input as we got a raw matrix
            setSuccessToast({
              title: "EXCEL LEÍDO CORRECTAMENTE",
              message: `Se cargaron con éxito ${stringMatrix.length} filas desde el archivo XLSX.`
            });
            setTimeout(() => setSuccessToast(null), 4000);
          } catch (err: any) {
            console.error(err);
            setExcelParsingError(`❌ Error al procesar archivo Excel: ${err.message || err}`);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        // Plain CSV / Text reader
        reader.onload = (event) => {
          try {
            const text = event.target?.result as string;
            setExcelInputText(text);
            setUploadedMatrix(null); // Clear matrix to fallback to computed text regex mapping
            setSuccessToast({
              title: "CSV LEÍDO CORRECTAMENTE",
              message: "Se cargó el archivo de texto/CSV correctamente."
            });
            setTimeout(() => setSuccessToast(null), 4000);
          } catch (err: any) {
            console.error(err);
            setExcelParsingError(`❌ Error al procesar archivo CSV: ${err.message || err}`);
          }
        };
        reader.readAsText(file);
      }
    }
  };

  const handleConfirmMaintenanceAction = () => {
    if (maintenancePin !== '1234') {
      setMaintenanceError("❌ PIN de supervisor incorrecto.");
      return;
    }
    
    if (activeMaintenanceAction === 'delete_imported') {
      if (onDeleteImportedOrders) {
        onDeleteImportedOrders();
        setSuccessToast({
          title: "IMPORTACIONES ELIMINADAS",
          message: "Se han removido con éxito las solicitudes importadas por Excel."
        });
        setTimeout(() => setSuccessToast(null), 4000);
      }
    } else if (activeMaintenanceAction === 'reset_db') {
      if (onResetDatabase) {
        onResetDatabase();
        setSuccessToast({
          title: "BASE DE DATOS RESTABLECIDA",
          message: "Se ha reiniciado el sistema con los datos originales de fábrica."
        });
        setTimeout(() => setSuccessToast(null), 4000);
      }
    }
    
    // Close modal & reset pin state
    setIsExcelModalOpen(false);
    setActiveMaintenanceAction(null);
    setMaintenancePin('');
    setMaintenanceError('');
  };

  const handleTriggerDelete = (id: string) => {
    setDeleteTargetId(id);
    setDeletePin('');
    setDeleteMotivo('');
    setDeletePhysical(false);
    setDeleteError('');
  };

  const handleConfirmDelete = () => {
    if (!deletePin) {
      setDeleteError("❌ El PIN de supervisor es obligatorio.");
      return;
    }
    if (!deletePhysical && !deleteMotivo.trim()) {
      setDeleteError("❌ El motivo es obligatorio para anular el pedido.");
      return;
    }

    const success = onDeleteOrder(deleteTargetId!, deletePin, deleteMotivo, deletePhysical);
    if (!success) {
      setDeleteError("❌ PIN de autorización incorrecto. No disponible o inválido.");
      return;
    }

    setSuccessToast({
      title: deletePhysical ? "ORDEN ELIMINADA FÍSICAMENTE" : "ORDEN ANULADA CON ÉXITO",
      message: deletePhysical 
        ? `La orden ${deleteTargetId} ha sido eliminada permanentemente del sistema.` 
        : `La orden ${deleteTargetId} se ha marcado con estado 'Anulado'.`
    });
    setTimeout(() => setSuccessToast(null), 6000);

    setDeleteTargetId(null);
  };

  // Excel XLSX export trigger
  const exportToCSV = () => {
    const headers = [
      "Código", "PV", "OC", "Ingreso", "Cliente", "Ciudad", "Estado", "Flete", 
      "Transportadora", "VentaOriginal", "CajasOriginal", "PesoOriginal", 
      "VentaFacturado", "CajasFacturado", "PesoFacturado", "FacturaSocio", "Provision"
    ];
    const rows = filteredOrders.map(o => [
      o.id,
      o.pv,
      o.oc,
      o.fechaIngreso,
      o.cliente,
      o.ciudad,
      o.estado,
      o.flete,
      o.transportadora,
      o.venta,
      o.cajas,
      o.peso,
      o.facturado || o.venta,
      o.cajasFact || o.cajas,
      o.pesoFact || o.peso,
      o.factura || '',
      o.provision || ''
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Solicitudes");
    XLSX.writeFile(wb, `solicitudes_sistemalog_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="sticky -top-6 bg-[#040814] pt-6 pb-4 z-20 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-900/60 shadow-lg">
        <div className="space-y-1">
          <h2 className="text-xl font-display font-extrabold text-hud-accent tracking-widest flex items-center gap-2 uppercase">
            <Clipboard className="w-5 h-5" /> Gestión de Solicitudes y Facturación
          </h2>
          <p className="text-xs text-slate-400">Controladores operativos de muelle y distribución física</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Import Excel / CSV Button */}
          <button 
            type="button"
            onClick={() => setIsExcelModalOpen(true)}
            className="border border-sky-400/30 hover:border-sky-400 bg-slate-950 text-sky-450 hover:text-sky-300 hover:bg-sky-500/5 text-xs font-mono font-bold tracking-wider px-4 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4 text-sky-400" /> Importar Excel/CSV
          </button>

          <button 
            onClick={() => onOpenOrderForm()}
            className="bg-hud-accent text-slate-950 hover:bg-hud-accent/80 hover:scale-[1.01] text-xs font-mono font-black tracking-widest px-5 py-2.5 rounded-lg cursor-pointer transition-all flex items-center gap-2 shadow-lg shadow-hud-accent/15"
          >
            <Plus className="w-4 h-4" /> Nueva Solicitud
          </button>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="bg-hud-card border border-hud-border/50 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Palabra Clave</label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              name="search_no_autofill_val"
              id="search_no_autofill_val"
              autoComplete="one-time-code"
              autoCorrect="off"
              spellCheck="false"
              placeholder="Buscar PV, OC, Cliente, Localidad..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="bg-slate-950/80 border border-slate-800 text-xs rounded px-8 py-2 w-full text-white outline-none focus:border-hud-accent/60"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Filtrar Estado</label>
          <select 
            value={statusFilter} 
            onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950/80 border border-slate-800 text-xs rounded px-3 py-2 w-full text-white outline-none focus:border-hud-accent/60"
          >
            <option value="">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="En Cargue">En Cargue</option>
            <option value="Despachado">Despachado</option>
            <option value="En Sitio / Bodega">En Sitio / Bodega</option>
            <option value="Entregado">Entregado</option>
            <option value="Anulado">Anulado</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Filtrar Operador</label>
          <select 
            value={carrierFilter} 
            onChange={e => { setCarrierFilter(e.target.value); setCurrentPage(1); }}
            className="bg-slate-950/80 border border-slate-800 text-xs rounded px-3 py-2 w-full text-white outline-none focus:border-hud-accent/60"
          >
            <option value="">Todos los transportadores</option>
            {carriers.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Ordenación</label>
          <select 
            value={sortOrder} 
            onChange={e => { setSortOrder(e.target.value as any); setCurrentPage(1); }}
            className="bg-slate-950/80 border border-slate-800 text-xs rounded px-3 py-2 w-full text-white outline-none focus:border-hud-accent/60"
          >
            <option value="id_desc">Código Descendente</option>
            <option value="id_asc">Código Ascendente</option>
            <option value="date_desc">Fecha Inversa</option>
            <option value="date_asc">Fecha Directa</option>
            <option value="client_asc">Cliente (A-Z)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Filas por Pág.</label>
          <select 
            value={itemsPerPage} 
            onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            className="bg-slate-950/80 border border-slate-800 text-xs rounded px-3 py-2 w-full text-hud-accent font-bold outline-none focus:border-hud-accent/60"
          >
            <option value={8}>8 filas</option>
            <option value={15}>15 filas</option>
            <option value={25}>25 filas</option>
            <option value={50}>50 filas</option>
            <option value={100}>100 filas</option>
            <option value={250}>250 filas</option>
            <option value={9999}>Todas</option>
          </select>
        </div>

        <div className="flex items-end">
          <button 
            onClick={exportToCSV}
            className="bg-slate-950 border border-hud-green text-hud-green hover:bg-hud-green/10 text-xs font-mono font-bold tracking-wider rounded py-2 px-3 w-full flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Tag className="w-3.5 h-3.5" /> Exportar
          </button>
        </div>
      </div>

      {/* Orders Table inside card */}
      <div className="bg-hud-card border border-hud-border/70 rounded-lg overflow-hidden shadow-xl">
        {/* Top-Left pagination & export block */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-950/40 border-b border-hud-border/30 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-4">
            {/* Pagination Controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer text-xs"
                title="Primera página"
              >
                &laquo;
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-hud-accent disabled:opacity-20 cursor-pointer text-xs flex items-center"
                title="Página anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              
              <div className="flex items-center gap-1 text-hud-accent font-bold px-1 text-xs">
                <span>PÁG.</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={currentPage}
                  onChange={e => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      setCurrentPage(Math.max(1, Math.min(totalPages, val)));
                    }
                  }}
                  className="w-12 bg-slate-900 border border-slate-700 text-hud-accent font-bold text-center rounded py-0.5 text-xs outline-none focus:border-hud-accent"
                />
                <span>/ {totalPages}</span>
              </div>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-hud-accent disabled:opacity-20 cursor-pointer text-xs flex items-center"
                title="Página siguiente"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages}
                className="px-2 py-1 rounded border border-slate-850 bg-slate-950 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer text-xs"
                title="Última página"
              >
                &raquo;
              </button>
            </div>

            {/* Export block */}
            <button
              onClick={exportToCSV}
              className="bg-hud-accent/10 border border-hud-accent/30 text-hud-accent hover:bg-hud-accent/20 px-3 py-1 rounded text-[10px] font-mono tracking-wider flex items-center gap-1.5 cursor-pointer uppercase font-bold transition-all"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-hud-accent" /> Exportar a Excel
            </button>
          </div>

          <div className="text-slate-400 text-xs">
            Mostrando <strong className="text-white">{filteredOrders.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</strong> a <strong className="text-white">{Math.min(currentPage * itemsPerPage, filteredOrders.length)}</strong> de <strong className="text-hud-accent">{filteredOrders.length}</strong> solicitudes
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#030610] text-[#476a8a] border-b border-hud-border/40 font-mono text-[10px] tracking-widest uppercase">
              <tr>
                <th className="p-4" style={{ width: '40px' }}>
                  <input 
                    type="checkbox" 
                    onChange={e => toggleSelectAll(e.target.checked)} 
                    checked={paginatedOrders.length > 0 && paginatedOrders.every(o => selectedIds.includes(o.id))}
                    className="accent-hud-green"
                  />
                </th>
                <th className="p-4">Código / PV / OC</th>
                <th className="p-4">F. Registro</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Ciudad</th>
                <th className="p-4 text-center">Cajas</th>
                <th className="p-4 text-center">Peso</th>
                <th className="p-4">Factura Venta</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/60 font-mono text-slate-300">
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500 text-xs font-mono">
                    -- No se encontraron solicitudes que coincidan con la búsqueda --
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order, idx) => {
                  const isChecked = selectedIds.includes(order.id);
                  return (
                    <tr 
                      key={`${order.id}-p${currentPage}-r${idx}`} 
                      className={`hover:bg-slate-900/30 transition-colors ${isChecked ? 'bg-hud-accent/5' : ''}`}
                    >
                      <td className="p-4">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => toggleSelectItem(order.id)}
                          className="accent-hud-green"
                        />
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-white text-xs">{order.id}</div>
                        <div className="text-[10px] text-slate-400">PV: <span className="text-yellow-450 font-black text-yellow-400">{order.pv || 'N/A'}</span></div>
                        <div className="text-[9px] text-slate-500">OC: {order.oc || 'N/A'}</div>
                      </td>
                      <td className="p-4 text-slate-400">{order.fechaIngreso}</td>
                      <td className="p-4 font-sans font-medium text-white max-w-xs truncate">{order.cliente}</td>
                      <td className="p-4 font-sans text-slate-400">{order.ciudad}</td>
                      <td className="p-4 text-center font-bold text-white">{order.cajas}</td>
                      <td className="p-4 text-center text-slate-450">{order.peso.toLocaleString('es-CO')} kg</td>
                      <td className="p-4">
                        {order.factura ? (
                          <span className="text-hud-green font-bold">{order.factura}</span>
                        ) : (
                          <span className="text-[9px] bg-red-500/10 border border-red-500/30 text-rose-400 px-1.5 py-0.5 rounded uppercase">Sin Factura</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <select
                          value={order.estado}
                          onChange={(e) => {
                            const newVal = e.target.value as any;
                            if (newVal === 'Anulado') {
                              handleTriggerDelete(order.id);
                            } else {
                              onUpdateOrder({
                                ...order,
                                estado: newVal
                              });
                            }
                          }}
                          className={`text-[9px] px-2 py-1 rounded uppercase font-bold bg-slate-950 border outline-none cursor-pointer hover:border-slate-500 transition-all ${
                            order.estado === 'Entregado' ? 'border-hud-green/60 text-hud-green/80' :
                            order.estado === 'Despachado' ? 'border-hud-accent text-hud-accent' :
                            order.estado === 'En Cargue' ? 'border-hud-orange text-hud-orange' :
                            order.estado === 'Anulado' ? 'border-rose-500 text-rose-500' :
                            'border-slate-700 text-slate-350'
                          }`}
                        >
                          <option value="Pendiente" className="bg-slate-950 text-slate-300">Pendiente</option>
                          <option value="En Cargue" className="bg-slate-950 text-hud-orange">En Cargue</option>
                          <option value="Despachado" className="bg-slate-950 text-hud-accent">Despachado</option>
                          <option value="En Sitio / Bodega" className="bg-slate-950 text-slate-400">En Sitio / Bodega</option>
                          <option value="Entregado" className="bg-slate-950 text-hud-green/80">Entregado</option>
                          <option value="Anulado" className="bg-slate-950 text-rose-500">Anulado</option>
                        </select>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button 
                            onClick={() => onOpenOrderForm(order, true)}
                            className="px-2 py-1 text-[10px] text-yellow-400 font-bold hover:bg-yellow-400/10 border border-yellow-400/20 rounded cursor-pointer transition-all uppercase"
                            title="Registrar otra factura o despacho adicional para esta misma PV"
                          >
                            + FACTURA
                          </button>
                          <button 
                            onClick={() => onOpenOrderForm(order)}
                            className="px-2 py-1 text-[10px] text-hud-accent font-bold hover:bg-hud-accent/10 border border-hud-accent/20 rounded cursor-pointer transition-all uppercase"
                          >
                            EDITAR
                          </button>
                          <button 
                            onClick={() => printSingleOrder(order, carriers, customers)}
                            className="px-2.5 py-1 text-[10px] text-[#00ffa3] font-bold hover:bg-[#00ffa3]/10 border border-[#00ffa3]/20 rounded cursor-pointer transition-all flex items-center gap-1 uppercase"
                            title="Imprimir Solicitud de Vehículo"
                          >
                            <Printer className="w-3 h-3" /> IMPRIMIR
                          </button>
                          <button 
                            onClick={() => handleTriggerDelete(order.id)}
                            className="px-2.5 py-1 text-[10px] text-rose-400 font-bold hover:bg-rose-500/10 border border-rose-500/20 rounded cursor-pointer transition-all flex items-center gap-1 uppercase"
                          >
                            <Trash2 className="w-3 h-3" /> ELIMINAR
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Consolidation / Mass Action Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-950/95 border-2 border-hud-green rounded-full px-6 py-3.5 flex items-center justify-between gap-6 z-50 shadow-2xl shadow-hud-green/10 animate-fade-in backdrop-blur-md">
          <div className="flex items-center gap-4 text-xs font-mono text-slate-300">
            <span className="bg-hud-green/10 text-hud-green font-extrabold px-3 py-1 rounded-full border border-hud-green/30 tracking-widest">
              {selectedIds.length} ÓRDENES SELECCIONADAS
            </span>
            <div className="hidden md:flex gap-3 text-[10px] text-slate-400">
              <span>📦 <strong>{consolidatedStats.totalBoxes}</strong> cj</span>
              <span>⚖️ <strong>{consolidatedStats.totalWeight.toLocaleString('es-CO')}</strong> kg</span>
              <span className="text-hud-green">💰 <strong>${consolidatedStats.totalValue.toLocaleString('es-CO')}</strong></span>
            </div>
          </div>

          <div className="w-[1px] h-6 bg-slate-800"></div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsConsoOpen(true)}
              className="bg-hud-green text-slate-950 hover:bg-hud-green/80 font-black font-mono tracking-widest px-5 py-2 text-[10px] rounded-full transition-all uppercase"
            >
              🚀 CONSOLIDAR DESPACHO
            </button>
            <button 
              onClick={() => setSelectedItems([])}
              className="bg-transparent border border-slate-800 hover:bg-slate-900 text-slate-450 font-bold px-4 py-2 text-[10px] rounded-full transition-colors font-mono uppercase"
            >
              Limpiar
            </button>
          </div>
        </div>
      )}

      {/* Deep Consolidation Master Overlay Modal */}
      {isConsoOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[11000] flex items-center justify-center p-4">
          <div className="bg-[#0b1220] border border-slate-800 rounded-xl max-w-6xl w-full p-6 shadow-[0_0_50px_rgba(0,0,0,0.8)] space-y-6 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-850">
              <h3 className="text-base font-extrabold text-[#00e5ff] tracking-widest uppercase font-sans">
                GESTIÓN DE DESPACHO CONSOLIDADO
              </h3>
              <button onClick={() => setIsConsoOpen(false)} className="text-slate-400 hover:text-white text-lg transition-colors">✕</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {/* Row 1: ESTADO MASIVO & OPERADOR LOGÍSTICO */}
              <div className="space-y-1">
                <label className="text-[10px] text-[#00ffa3] font-bold font-sans tracking-wider uppercase flex items-center gap-1.5">
                  📦 ESTADO MASIVO
                </label>
                <select 
                  value={consoEstado} 
                  onChange={e => setConsoEstado(e.target.value)}
                  className="bg-[#040812] border border-[#00ffa3]/50 text-white font-bold font-mono rounded-lg p-2.5 w-full outline-none focus:border-[#00ffa3] transition-colors"
                >
                  <option value="Despachado">🚀 DESPACHADO</option>
                  <option value="En Cargue">📦 EN CARGUE</option>
                  <option value="En Sitio / Bodega">📍 EN SITIO / BODEGA</option>
                  <option value="Entregado">✅ ENTREGADO</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-[#00ffa3] font-bold font-sans tracking-wider uppercase flex items-center gap-1.5">
                  🚚 OPERADOR LOGÍSTICO
                </label>
                <select 
                  value={consoCarrier} 
                  onChange={e => setConsoOperador(e.target.value)}
                  className="bg-[#040812] border border-[#00ffa3]/50 text-white rounded-lg p-2.5 w-full outline-none focus:border-[#00ffa3] transition-colors"
                >
                  <option value="">-- SELECCIONE OPERADOR --</option>
                  {carriers.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                </select>
              </div>

              {/* Row 2: CONDUCTOR & PLACA */}
              <div className="space-y-1">
                <label className="text-[10px] text-[#e28a50] font-bold font-sans tracking-wider uppercase flex items-center gap-1.5">
                  👤 CONDUCTOR
                </label>
                <input 
                  type="text" 
                  placeholder="Nombre"
                  value={consoConductor}
                  onChange={e => setConsoConductor(e.target.value)}
                  className="bg-[#040812] border border-slate-800 text-sm text-white rounded-lg p-2.5 w-full outline-none focus:border-slate-700 placeholder-slate-600 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-[#00ffa3] font-bold font-sans tracking-wider uppercase flex items-center gap-1.5">
                  🚚 PLACA
                </label>
                <input 
                  type="text" 
                  placeholder="Placa"
                  value={consoPlaca}
                  onChange={e => setConsoPlaca(e.target.value)}
                  className="bg-[#040812] border border-slate-800 text-sm text-white rounded-lg p-2.5 w-full outline-none focus:border-slate-700 placeholder-slate-600 transition-colors"
                />
              </div>

              {/* Row 3: CELULAR & HORA SALIDA */}
              <div className="space-y-1">
                <label className="text-[10px] text-[#00c8ff] font-bold font-sans tracking-wider uppercase flex items-center gap-1.5">
                  📱 CELULAR
                </label>
                <input 
                  type="text" 
                  placeholder="Celular"
                  value={consoCelular}
                  onChange={e => setConsoCelular(e.target.value)}
                  className="bg-[#040812] border border-slate-800 text-sm text-white rounded-lg p-2.5 w-full outline-none focus:border-slate-700 placeholder-slate-600 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-300 font-bold font-sans tracking-wider uppercase flex items-center gap-1.5">
                  📅 HORA SALIDA
                </label>
                <input 
                  type="datetime-local" 
                  value={consoHoraSalida}
                  onChange={e => setConsoHoraSalida(e.target.value)}
                  className="bg-[#040812] border border-slate-800 text-sm text-white rounded-lg p-2.5 w-full outline-none focus:border-slate-700 transition-colors"
                />
              </div>

              {/* Row 4: COSTO TOTAL VEHÍCULO */}
              <div className="col-span-1 md:col-span-2 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-[#ffaa00] font-bold font-sans tracking-wider uppercase flex items-center gap-1.5">
                    💰 COSTO TOTAL VEHÍCULO
                  </label>
                  {isFormulaCarrier(consoCarrier) && (
                    <button 
                      type="button"
                      onClick={calculateFormulaFlete}
                      className="text-[10px] text-[#ffaa00] hover:underline font-mono font-bold animate-pulse"
                    >
                      {getFormulaDisplayLabel(consoCarrier)}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Costo total"
                    value={consoFlete || ''}
                    onChange={e => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setConsoFlete(Number(val));
                    }}
                    className="w-full bg-[#ecf3fe] border-2 border-[#ffaa00] text-[#1e293b] font-extrabold text-xl rounded-lg px-4 py-3 outline-none shadow-[0_0_15px_rgba(255,170,0,0.15)] placeholder-slate-400 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* List of orders included with editable properties */}
            <div className="space-y-2">
              <span className="text-slate-400 font-bold block text-xs tracking-wider uppercase">Órdenes a Consolidar:</span>
              <div className="border border-slate-800/80 rounded-lg overflow-x-auto bg-[#070b14]/50">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="border-b border-slate-850 bg-[#070b14]">
                      <th className="p-3 text-[10px] font-bold text-[#00c8ff] uppercase font-mono tracking-wider">
                        OC / PV
                      </th>
                      <th className="p-3 text-[10px] font-bold text-[#00c8ff] uppercase font-mono tracking-wider">
                        CLIENTE
                      </th>
                      <th className="p-3 text-[10px] font-bold text-[#00c8ff] uppercase font-mono tracking-wider">
                        DESTINO
                      </th>
                      <th className="p-3 text-[10px] font-bold text-[#00c8ff] uppercase font-mono tracking-wider text-center">
                        VENTA ($)
                      </th>
                      <th className="p-3 text-[10px] font-bold text-[#00ffa3] uppercase font-mono tracking-wider text-center">
                        VALOR FACTURADO ($)
                      </th>
                      <th className="p-3 text-[10px] font-bold text-[#00c8ff] uppercase font-mono tracking-wider text-center">
                        📄 N' FACTURA
                      </th>
                      <th className="p-3 text-[10px] font-bold text-[#00c8ff] uppercase font-mono tracking-wider text-center">
                        📅 FECHA FACTURA
                      </th>
                      <th className="p-3 text-[10px] font-bold text-[#00c8ff] uppercase font-mono tracking-wider text-center">
                        📦 CAJAS FACT.
                      </th>
                      <th className="p-3 text-[10px] font-bold text-[#00c8ff] uppercase font-mono tracking-wider text-center">
                        ⚖️ PESO FACT. (KG)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/60">
                    {consoOrders.map(co => (
                      <tr key={co.id} className="hover:bg-slate-900/40 transition-colors">
                        {/* OC / PV */}
                        <td className="p-3 font-mono">
                          <span className="text-[#00c8ff] font-bold block">{co.oc || 'SIN OC'}</span>
                          <span className="text-yellow-400 font-bold text-xs block mt-0.5">PV: {co.pv}</span>
                        </td>
                        {/* CLIENTE */}
                        <td className="p-3 text-xs text-slate-300 font-sans font-medium uppercase">
                          {co.cliente}
                        </td>
                        {/* DESTINO */}
                        <td className="p-3 text-xs text-slate-300 font-sans font-medium uppercase">
                          {co.ciudad}
                        </td>
                        {/* VENTA ($) */}
                        <td className="p-3 text-center">
                          <input 
                            type="number"
                            name={`conso_venta_${co.id}`}
                            autoComplete="off"
                            value={co.venta || ''}
                            onChange={e => handleUpdateConsoOrder(co.id, 'venta', Number(e.target.value))}
                            className="bg-[#03060f] border border-slate-700/80 text-slate-300 rounded px-2 py-1 text-center font-mono w-28 focus:border-[#00ffa3] outline-none text-xs font-bold"
                          />
                        </td>
                        {/* VALOR FACTURADO ($) */}
                        <td className="p-3 text-center">
                          <input 
                            type="number"
                            name={`conso_facturado_${co.id}`}
                            autoComplete="off"
                            value={co.facturado || ''}
                            onChange={e => handleUpdateConsoOrder(co.id, 'facturado', Number(e.target.value))}
                            className="bg-[#03060f] border border-slate-700/80 text-[#00ffa3] rounded px-2 py-1 text-center font-mono w-28 focus:border-[#00ffa3] outline-none text-xs font-bold"
                          />
                        </td>
                        {/* N' FACTURA */}
                        <td className="p-3 text-center">
                          <input 
                            type="text"
                            name={`conso_factura_${co.id}`}
                            autoComplete="off"
                            placeholder="Factura Nº"
                            value={co.factura || ''}
                            onChange={e => handleUpdateConsoOrder(co.id, 'factura', e.target.value)}
                            className="bg-[#03060f] border border-slate-700/80 text-white placeholder-slate-600 rounded px-2.5 py-1 text-center font-mono w-28 focus:border-[#00ffa3] outline-none text-xs"
                          />
                        </td>
                        {/* FECHA FACTURA */}
                        <td className="p-3 text-center">
                          <input 
                            type="date"
                            name={`conso_fechaFactura_${co.id}`}
                            autoComplete="off"
                            value={co.fechaFactura || ''}
                            onChange={e => handleUpdateConsoOrder(co.id, 'fechaFactura', e.target.value)}
                            className="bg-[#03060f] border border-slate-700/80 text-white rounded px-2 py-1 text-center font-mono w-32 focus:border-[#00ffa3] outline-none text-xs"
                          />
                        </td>
                        {/* CAJAS FACTURADAS */}
                        <td className="p-3 text-center">
                          <input 
                            type="number"
                            name={`conso_cajasFact_${co.id}`}
                            autoComplete="off"
                            value={co.cajasFact === undefined ? co.cajas : co.cajasFact}
                            onChange={e => handleUpdateConsoOrder(co.id, 'cajasFact', e.target.value === '' ? 0 : Number(e.target.value))}
                            className="bg-[#03060f] border border-slate-700/80 text-white rounded px-2 py-1 text-center font-mono w-16 focus:border-[#00ffa3] outline-none text-xs font-bold"
                          />
                          <span className="text-[9px] text-slate-500 block mt-0.5">Sol: {co.cajas}</span>
                        </td>
                        {/* PESO FACTURADO (KG) */}
                        <td className="p-3 text-center">
                          <input 
                            type="number"
                            step="0.01"
                            name={`conso_pesoFact_${co.id}`}
                            autoComplete="off"
                            value={co.pesoFact === undefined ? co.peso : co.pesoFact}
                            onChange={e => handleUpdateConsoOrder(co.id, 'pesoFact', e.target.value === '' ? 0 : Number(e.target.value))}
                            className="bg-[#03060f] border border-slate-700/80 text-white rounded px-2 py-1 text-center font-mono w-20 focus:border-[#00ffa3] outline-none text-xs font-bold"
                          />
                          <span className="text-[9px] text-slate-500 block mt-0.5">Sol: {co.peso.toLocaleString()} kg</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <div className="text-[10px] text-slate-500 font-mono uppercase font-bold">
                LOTE CON {consoOrders.length} ÓRDENES • {consoTotals.totalBoxes} CJ • {consoTotals.totalWeight.toFixed(1)} KG
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  type="button"
                  onClick={() => setIsConsoOpen(false)}
                  className="bg-[#182335]/80 hover:bg-[#202f47] text-slate-250 font-bold font-sans tracking-widest px-6 py-3 rounded-lg border border-slate-800 uppercase transition-colors text-xs"
                >
                  CANCELAR
                </button>
                
                <button 
                  type="button"
                  onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      const html = `
                        <html>
                          <head>
                            <title>DESPACHO CONSOLIDADO - ${consoCarrier || 'SIN_OPERADOR'}</title>
                            <style>
                              body { font-family: 'Inter', sans-serif; padding: 30px; color: #1e293b; line-height: 1.5; }
                              .header { border-bottom: 2px solid #0f172a; padding-bottom: 15px; margin-bottom: 25px; }
                              .title { font-size: 24px; font-weight: bold; margin: 0; text-transform: uppercase; color: #0f172a; }
                              .subtitle { font-size: 14px; color: #64748b; margin-top: 5px; }
                              .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 30px; }
                              .info-box { border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; background-color: #f8fafc; }
                              .info-label { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; }
                              .info-val { font-size: 14px; font-weight: 600; color: #0f172a; margin-top: 2px; }
                              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                              th { border-bottom: 2px solid #cbd5e1; color: #475569; font-size: 11px; text-transform: uppercase; font-weight: bold; padding: 8px 12px; text-align: left; }
                              td { border-bottom: 1px solid #e2e8f0; padding: 10px 12px; font-size: 12px; color: #334155; }
                              .text-right { text-align: right; }
                              .text-center { text-align: center; }
                              .totals { font-weight: bold; background-color: #f1f5f9; }
                              @media print {
                                body { padding: 0; }
                              }
                            </style>
                          </head>
                          <body>
                            <div class="header">
                              <div class="title">Gestión de Despacho Consolidado</div>
                              <div class="subtitle">Generado el: ${new Date().toLocaleString()}</div>
                            </div>

                            <div class="grid">
                              <div class="info-box">
                                <div>
                                  <span class="info-label">Estado Masivo</span>
                                  <div class="info-val" style="color: #10b981;">🚀 ${consoEstado.toUpperCase()}</div>
                                </div>
                                <div style="margin-top: 10px;">
                                  <span class="info-label">Operador Logístico</span>
                                  <div class="info-val">🚚 ${consoCarrier || 'No especificado'}</div>
                                </div>
                              </div>
                              <div class="info-box">
                                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                                  <div>
                                    <span class="info-label">Conductor</span>
                                    <div class="info-val">${consoConductor || 'No especificado'}</div>
                                  </div>
                                  <div>
                                    <span class="info-label">Placa</span>
                                    <div class="info-val">${consoPlaca || 'No especificada'}</div>
                                  </div>
                                </div>
                                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 10px;">
                                  <div>
                                    <span class="info-label">Celular</span>
                                    <div class="info-val">${consoCelular || 'No especificado'}</div>
                                  </div>
                                  <div>
                                    <span class="info-label">Hora Salida</span>
                                    <div class="info-val">${consoHoraSalida ? new Date(consoHoraSalida).toLocaleString() : 'No especificada'}</div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div class="info-box" style="margin-bottom: 30px; border-left: 4px solid #f59e0b; background-color: #fffbeb;">
                              <span class="info-label" style="color: #b45309;">Costo Total Vehículo (Flete Consolidado)</span>
                              <div class="info-val" style="font-size: 20px; color: #b45309;">$${consoFlete.toLocaleString('es-CO')}</div>
                            </div>

                            <h3>Detalle de Órdenes Consolidadas</h3>
                            <table>
                              <thead>
                                <tr>
                                  <th>OC / PV</th>
                                  <th>Cliente</th>
                                  <th>Destino</th>
                                  <th class="text-right">Venta ($)</th>
                                  <th class="text-center">Cajas</th>
                                  <th class="text-right">Peso (KG)</th>
                                  <th>N' Factura</th>
                                  <th>Fecha Factura</th>
                                </tr>
                              </thead>
                              <tbody>
                                ${consoOrders.map(o => `
                                  <tr>
                                    <td>
                                      <strong>${o.oc || 'N/A'}</strong><br/>
                                      <span style="font-size: 10px; color: #0284c7;">PV: ${o.pv}</span>
                                    </td>
                                    <td>${o.cliente}</td>
                                    <td>${o.ciudad}</td>
                                    <td class="text-right">$${o.venta.toLocaleString('es-CO')}</td>
                                    <td class="text-center">${o.cajas}</td>
                                    <td class="text-right">${o.peso.toFixed(2)}</td>
                                    <td>${o.factura || 'Pendiente'}</td>
                                    <td>${o.fechaFactura || 'N/A'}</td>
                                  </tr>
                                `).join('')}
                                <tr class="totals">
                                  <td colspan="3">TOTALES CONSOLIDADOS</td>
                                  <td class="text-right">$${consoTotals.totalValue.toLocaleString('es-CO')}</td>
                                  <td class="text-center">${consoTotals.totalBoxes} cj</td>
                                  <td class="text-right">${consoTotals.totalWeight.toFixed(2)} KG</td>
                                  <td colspan="2"></td>
                                </tr>
                              </tbody>
                            </table>
                          </body>
                        </html>
                      `;
                      printWindow.document.write(html);
                      printWindow.document.close();
                      printWindow.print();
                    }
                  }}
                  className="bg-transparent border border-[#00c8ff] hover:bg-[#00c8ff]/10 text-[#00c8ff] font-bold font-sans tracking-widest px-5 py-3 rounded-lg flex items-center gap-2 uppercase transition-all text-xs"
                >
                  🖨️ IMPRIMIR LOTE
                </button>
                
                <button 
                  disabled={!consoCarrier}
                  onClick={handleApplyConsolidation}
                  className="bg-[#00ffa3] hover:bg-[#00ff88] text-slate-950 disabled:bg-slate-800 disabled:text-slate-500 hover:scale-[1.01] font-bold font-sans tracking-widest px-6 py-3 rounded-lg flex items-center gap-2 uppercase transition-all shadow-[0_0_15px_rgba(0,255,163,0.3)] text-xs"
                >
                  🚀 PROCESAR Y NOTIFICAR LOTE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Excel / CSV Bulk Loader Modal */}
      {isExcelModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[11000] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-hud-card border border-hud-border rounded-xl max-w-5xl w-full p-6 shadow-2xl space-y-4 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="space-y-0.5">
                <h3 className="text-base font-display font-extrabold text-sky-400 tracking-widest uppercase flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-sky-400" /> Carga Masiva de Solicitudes desde Excel
                </h3>
                <p className="text-xs text-slate-400 font-sans">Soporta plantillas .xlsx o .xls de Excel, archivos .csv y pegado de celdas</p>
              </div>
              <button 
                type="button"
                onClick={() => {
                  setIsExcelModalOpen(false);
                  setExcelInputText('');
                  setUploadedMatrix(null);
                  setExcelParsingError(null);
                  setCustomMappings({});
                }} 
                className="text-slate-450 hover:text-white text-base font-bold w-7 h-7 flex items-center justify-center bg-slate-950 border border-slate-850 hover:border-slate-700 rounded-full cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Paste or Upload Area */}
              <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-zinc-400 font-mono tracking-widest uppercase block font-bold">
                    1. Pegar celdas o cargar archivo
                  </label>
                  <label className="text-[10px] bg-slate-950 border border-slate-800 hover:border-slate-700 text-sky-455 hover:text-sky-305 font-mono font-bold tracking-wider px-3 py-1.5 rounded cursor-pointer transition-colors block">
                    📁 Cargar Archivo (.xlsx, .xls, .csv)
                    <input 
                      type="file" 
                      onChange={handleExcelOrCSVUpload} 
                      accept=".xlsx,.xls,.csv,.txt" 
                      className="hidden" 
                    />
                  </label>
                </div>

                {uploadedMatrix ? (
                  <div className="bg-hud-green/10 border border-hud-green/20 p-4 rounded-lg text-xs font-mono text-hud-green space-y-2 animate-fade-in">
                    <div className="flex items-center justify-between bg-hud-green/5 p-2 rounded border border-hud-green/10">
                      <span className="font-bold">🟢 ARCHIVO EXCEL CARGADO CORRECTAMENTE</span>
                      <button 
                        type="button"
                        onClick={() => {
                          setUploadedMatrix(null);
                          setExcelInputText('');
                          setCustomMappings({});
                        }}
                        className="text-rose-400 hover:text-rose-300 font-bold underline cursor-pointer hover:no-underline"
                      >
                        Quitar y pegar texto
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-normal">
                      Se cargó la hoja número 1 del libro Excel recibiendo <strong className="text-white">{uploadedMatrix.length}</strong> renglones válidos. Mapea las columnas debajo para importarlo.
                    </p>
                  </div>
                ) : (
                  <textarea
                    value={excelInputText}
                    onChange={e => {
                      setExcelInputText(e.target.value);
                      setUploadedMatrix(null);
                    }}
                    placeholder={`Pega tus celdas de Excel / Google Sheets aquí haciendo clic y presionando Ctrl+V.\nFormato esperado:\nPedido\tCompra\tCliente\tCiudad\tCajas\tPeso\tVenta Vta\tFactura\tFlete\tTransportadora\n4500309990\t90054213\tAlmacenes Éxito S.A.\tMedellín\t154\t4800\t64200000\tFE-1229\t854000\tSISA CARGO`}
                    rows={8}
                    className="bg-slate-950 text-slate-100 placeholder-slate-700 border border-slate-850 rounded-lg p-3 w-full text-xs font-mono outline-none focus:border-sky-500/50 resize-y"
                  />
                )}

                {excelParsingError && (
                  <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded-lg text-xs font-mono text-rose-400 flex items-center gap-2 animate-fade-in">
                    <span>⚠️</span>
                    <span>{excelParsingError}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-300 bg-slate-950/20 p-2.5 rounded border border-slate-900/60 font-medium">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={hasHeaders} 
                      onChange={e => setHasHeaders(e.target.checked)} 
                      className="accent-sky-500 pointer-events-auto"
                    />
                    <span>La primera fila contiene encabezados</span>
                  </label>

                  <span className="text-slate-800 block">|</span>

                  <div>
                    <span className="text-slate-400">Filas Detectadas:</span>{' '}
                    <strong className="text-[#00ffa3]">{parsedExcelData.length}</strong>
                  </div>
                </div>
              </div>

              {/* Instructions / Template Help Card & ROLLBACK Maintenance Panel */}
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-900 flex flex-col justify-between text-xs font-mono space-y-4">
                <div className="space-y-2">
                  <h4 className="text-[10px] text-sky-455 tracking-widest font-bold uppercase block border-b border-slate-900/60 pb-1">Carga Inteligente</h4>
                  <ul className="space-y-1.5 text-[10.5px] text-slate-400 list-disc list-inside leading-relaxed">
                    <li>Selecciona y sube un archivo <strong className="text-white">.xlsx o .xls</strong> directo.</li>
                    <li>Soporta autohomologación de Clientes y Transportistas locales.</li>
                    <li>Si dejas la columna Factura vacía, quedarán como pendientes de bodega.</li>
                  </ul>
                </div>

                {/* ACTIVE MAINTENANCE / REVERT ACTIONS FOR ERROR RECOVERY */}
                <div className="bg-rose-950/15 border border-rose-500/15 p-3 rounded-lg space-y-2">
                  <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[10px] tracking-widest uppercase">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Reversión de Datos
                  </div>
                  <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
                    ¿Subiste una base errónea? Limpia o restablece el sistema aquí:
                  </p>
                  
                  <div className="grid grid-cols-1 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMaintenanceAction('delete_imported');
                        setMaintenancePin('');
                        setMaintenanceError('');
                      }}
                      className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 rounded p-1.5 text-[10.5px] text-left flex items-center justify-between font-bold cursor-pointer transition-all"
                    >
                      <span>🗑️ Borrar excel importado</span>
                      <span className="bg-rose-950/80 px-1 py-0.5 rounded text-[9px] text-[#00ffa3]">
                        {orders.filter(o => o.obs?.includes("Importado")).length} regs
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveMaintenanceAction('reset_db');
                        setMaintenancePin('');
                        setMaintenanceError('');
                      }}
                      className="bg-slate-900 hover:bg-slate-850 hover:text-white border border-slate-800 rounded p-1.5 text-[10.5px] text-left flex items-center justify-between cursor-pointer transition-all"
                    >
                      <span>🔄 Resetear fábrica</span>
                      <span className="text-slate-500 text-[9px] uppercase font-bold">ERP completo</span>
                    </button>
                  </div>
                </div>

                <div className="bg-sky-500/5 border border-sky-500/10 p-2 rounded text-[10px] text-sky-300 space-y-0.5">
                  <strong className="text-white uppercase block">💡 Tip Operativo:</strong>
                  <span>El flete se distribuye por regla prorrata de valor facturado para transportistas externos a Fredy Hdez.</span>
                </div>
              </div>
            </div>

            {/* Column Mapping Section */}
            {parsedExcelData.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[10px] text-sky-450 tracking-widest font-mono font-bold uppercase block">
                  2. Mapear Columnas de Excel a Campos del Sistema
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 bg-slate-950/80 p-3 rounded border border-slate-900/60">
                  {[
                    { key: 'pv', label: 'PV / Pedido', required: true },
                    { key: 'oc', label: 'OC / Compra', required: false },
                    { key: 'cliente', label: 'Cliente', required: true },
                    { key: 'ciudad', label: 'Ciudad Destino', required: true },
                    { key: 'cajas', label: 'Cajas/Bultos', required: false },
                    { key: 'peso', label: 'Peso (Kg)', required: false },
                    { key: 'venta', label: 'Venta ($)', required: false },
                    { key: 'factura', label: 'Factura Venta', required: false },
                    { key: 'flete', label: 'Flete ($)', required: false },
                    { key: 'transportadora', label: 'Transportadora', required: false },
                    { key: 'fechaIngreso', label: 'Fecha de Ingreso', required: false },
                    { key: 'fechaFactura', label: 'Fecha de Factura', required: false },
                  ].map(f => (
                    <div key={f.key} className="flex flex-col gap-1">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block truncate">
                        {f.label} {f.required && <span className="text-rose-500 font-bold">*</span>}
                      </label>
                      <select
                        value={finalMappings[f.key] !== undefined ? finalMappings[f.key] : -1}
                        onChange={e => setCustomMappings(prev => ({ ...prev, [f.key]: parseInt(e.target.value) }))}
                        className="bg-[#030610] border border-slate-900 text-[10px] text-white rounded p-1.5 font-mono focus:border-sky-500/55 outline-none w-full"
                      >
                        <option value="-1">-- Omitir campo --</option>
                        {parsedExcelData[0]?.map((col, idx) => (
                          <option key={idx} value={idx}>
                            Col {idx + 1}: {hasHeaders ? `${col.substring(0, 15) || '(Vacío)'}` : `Ej: ${col.substring(0, 15) || '(Vacío)'}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preview and Validation Result Table */}
            {parsedExcelData.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-[10px] text-sky-450 tracking-widest font-mono font-bold uppercase block">
                    3. Vista Previa de Solicitudes a Procesar ({rowsToImport.length} registros)
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                    <span className="bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded">
                      ✨ Nuevas: <strong>{rowsToImport.filter(r => !orders.some(o => o.estado !== 'Anulado' && ((r.pv && o.pv && o.pv.trim().toLowerCase() === r.pv.trim().toLowerCase()) || (r.factura && o.factura && o.factura.trim().toLowerCase() === r.factura.trim().toLowerCase())))).length}</strong>
                    </span>
                    <span className="bg-sky-950/60 border border-sky-500/30 text-sky-300 px-2 py-0.5 rounded">
                      🔄 Actualizaciones: <strong>{rowsToImport.filter(r => orders.some(o => o.estado !== 'Anulado' && ((r.pv && o.pv && o.pv.trim().toLowerCase() === r.pv.trim().toLowerCase()) || (r.factura && o.factura && o.factura.trim().toLowerCase() === r.factura.trim().toLowerCase())))).length}</strong>
                    </span>
                    <span className="text-slate-400">Cajas: <strong className="text-hud-green">{rowsToImport.reduce((sum, r) => sum + r.cajas, 0)} cj</strong></span>
                    <span className="text-slate-400">Peso: <strong className="text-hud-green">{rowsToImport.reduce((sum, r) => sum + r.peso, 0).toLocaleString('es-CO')} kg</strong></span>
                  </div>
                </div>

                <div className="bg-slate-950/50 border border-slate-900 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-[10px] font-mono">
                    <thead className="bg-[#030610] text-[#476a8a] border-b border-slate-900 uppercase">
                      <tr>
                        <th className="p-2">PV / OC</th>
                        <th className="p-2">Acción Registro</th>
                        <th className="p-2">Cliente Homologado</th>
                        <th className="p-2">Ciudad</th>
                        <th className="p-2 text-center">Cajas</th>
                        <th className="p-2 text-center">Peso</th>
                        <th className="p-2 text-right">Venta (COP)</th>
                        <th className="p-2">Factura</th>
                        <th className="p-2 text-right font-semibold text-rose-300">Flete</th>
                        <th className="p-2">Transportador</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/40 text-slate-300">
                      {rowsToImport.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-4 text-center text-slate-500">
                            No hay registros válidos para mostrar. Por favor mapea los campos obligatorios.
                          </td>
                        </tr>
                      ) : (
                        rowsToImport.map((rowRef, idx) => {
                          const isAlreadyInDb = orders.some(o => 
                            o.estado !== 'Anulado' && (
                              (rowRef.pv && o.pv && o.pv.trim().toLowerCase() === rowRef.pv.trim().toLowerCase()) ||
                              (rowRef.factura && o.factura && o.factura.trim().toLowerCase() === rowRef.factura.trim().toLowerCase())
                            )
                          );
                          return (
                            <tr key={idx} className="hover:bg-slate-900/30">
                              <td className="p-2">
                                <span className="text-yellow-400 font-bold block">PV: {rowRef.pv || 'S/N'}</span>
                                <span className="text-slate-500 text-[9px]">OC: {rowRef.oc || 'S/N'}</span>
                              </td>
                              <td className="p-2 whitespace-nowrap">
                                {isAlreadyInDb ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                                    🔄 Actualiza existente
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                    ✨ Nueva orden
                                  </span>
                                )}
                              </td>
                             <td className="p-2 text-white font-sans font-medium">
                               {rowRef.cliente}
                               {!customers.some(c => c.nombre.trim().toUpperCase() === rowRef.cliente.trim().toUpperCase()) && (
                                 <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] uppercase font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                                   ⚠️ No Registrado
                                 </span>
                               )}
                             </td>
                            <td className="p-2 text-slate-400 font-sans">{rowRef.ciudad}</td>
                            <td className="p-2 text-center font-bold text-slate-200">{rowRef.cajas}</td>
                            <td className="p-2 text-center text-slate-400">{rowRef.peso.toLocaleString('es-CO')} kg</td>
                            <td className="p-2 text-right text-hud-green font-bold">${rowRef.venta.toLocaleString('es-CO')}</td>
                            <td className="p-2 text-slate-400">
                              {rowRef.factura ? (
                                <span className="bg-hud-green/10 text-hud-green border border-hud-green/20 px-1 py-0.5 rounded text-[9px] font-bold">{rowRef.factura}</span>
                              ) : (
                                <span className="text-slate-600 block">Pendiente</span>
                              )}
                            </td>
                            <td className="p-2 text-right text-rose-400 font-bold">${rowRef.flete.toLocaleString('es-CO')}</td>
                            <td className="p-2 text-slate-450">{rowRef.transportadora}</td>
                          </tr>
                        );
                      })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Modal Actions Footer */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-900">
              <button 
                onClick={() => {
                  setIsExcelModalOpen(false);
                  setExcelInputText('');
                  setCustomMappings({});
                }}
                className="bg-slate-900 hover:bg-slate-850 text-slate-400 text-xs font-mono font-bold tracking-widest px-5 py-2.5 rounded-lg border border-slate-850 uppercase"
              >
                Cancelar
              </button>
              <button 
                disabled={rowsToImport.length === 0}
                onClick={handleApplyExcelBulkImport}
                className="bg-sky-500 text-slate-950 hover:bg-sky-400 hover:scale-[1.01] disabled:bg-slate-800 disabled:text-slate-300 text-xs font-mono font-black tracking-widest px-6 py-2.5 rounded-lg transition-all uppercase"
              >
                Confirmar Importación Masiva ({rowsToImport.length}) 🚀
              </button>
            </div>
          </div>
        </div>
      )}

      {activeMaintenanceAction && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[13100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#080d19] border-2 border-rose-500/50 rounded-xl max-w-sm w-full p-6 shadow-2xl relative space-y-4 text-xs font-mono">
            <div className="flex items-center gap-2 pb-2.5 border-b border-rose-500/20 text-rose-500">
              <AlertTriangle className="w-5 h-5 animate-pulse text-rose-500" />
              <h3 className="text-xs font-display font-extrabold uppercase tracking-widest text-[#00ffa3]">
                Confirmar Acción Crítica
              </h3>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
              {activeMaintenanceAction === 'delete_imported' 
                ? 'Esta acción eliminará de forma irreversible todas las solicitudes que hayan sido cargadas utilizando la función de Importar Excel/CSV.'
                : 'Esta acción restablecerá por completo toda la base de datos de solicitudes, clientes y transportistas a su estado inicial de fábrica.'
              }
            </p>

            {maintenanceError && (
              <div className="bg-rose-500/10 border border-rose-500/30 p-2 rounded text-rose-400 text-[10px] uppercase font-bold text-center">
                {maintenanceError}
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] text-[#00ffa3] font-bold block uppercase tracking-widest">
                  PIN DE AUTORIZACIÓN (1234)
                </label>
                <input 
                  type="password" 
                  maxLength={4}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="••••"
                  value={maintenancePin}
                  onChange={e => setMaintenancePin(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && handleConfirmMaintenanceAction()}
                  className="bg-slate-950 border border-slate-850 text-white placeholder-slate-800 rounded px-3 py-2 text-center text-sm font-bold tracking-[1em] focus:border-hud-accent outline-none w-full"
                />

                {/* On-screen virtual numeric keypad */}
                <div className="grid grid-cols-3 gap-1 pt-1.5 max-w-[180px] mx-auto">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setMaintenancePin(prev => (prev + num).slice(0, 4))}
                      className="bg-slate-950 hover:bg-slate-900 border border-slate-850 text-white text-xs py-1.5 rounded font-mono font-bold active:scale-95 transition-all cursor-pointer"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMaintenancePin(prev => prev.slice(0, -1))}
                    className="bg-slate-950 hover:bg-rose-950/40 border border-slate-850 text-rose-500 text-xs py-1.5 rounded font-mono font-bold active:scale-95 transition-all text-center flex items-center justify-center cursor-pointer"
                  >
                    ⌫
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaintenancePin(prev => (prev + '0').slice(0, 4))}
                    className="bg-slate-950 hover:bg-slate-900 border border-slate-850 text-white text-xs py-1.5 rounded font-mono font-bold active:scale-95 transition-all cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaintenancePin('')}
                    className="bg-slate-950 hover:bg-slate-900 border border-slate-850 text-slate-400 text-[10px] py-1.5 rounded font-mono font-bold active:scale-95 transition-all cursor-pointer"
                  >
                    C
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMaintenanceAction(null);
                    setMaintenancePin('');
                    setMaintenanceError('');
                  }}
                  className="bg-slate-900 hover:bg-slate-850 text-slate-400 p-2.5 rounded hover:text-white uppercase font-bold tracking-wider text-center cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMaintenanceAction}
                  className="bg-rose-600 hover:bg-rose-500 text-white p-2.5 rounded uppercase font-bold tracking-wider text-center cursor-pointer transition-colors"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTargetId && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[13000] flex items-center justify-center p-4">
          <div className="bg-[#080d19] border-2 border-rose-500/50 rounded-xl max-w-sm w-full p-6 shadow-2xl relative space-y-4 text-xs font-mono">
            <div className="flex items-center gap-2 pb-2.5 border-b border-rose-500/20 text-rose-500">
              <Trash2 className="w-5 h-5 animate-pulse" />
              <h3 className="text-xs font-display font-extrabold uppercase tracking-widest text-[#00ffa3]">
                Eliminar / Anular Solicitud
              </h3>
            </div>

            <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
              Está a punto de modificar o retirar permanentemente la orden <strong className="text-white">{deleteTargetId}</strong> del sistema operativo. Por seguridad, introduzca las credenciales.
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
                    onClick={() => setDeletePhysical(false)}
                    className={`p-2 rounded border text-[10px] uppercase font-bold tracking-wider cursor-pointer text-center ${
                      !deletePhysical
                        ? 'bg-hud-accent/15 border-hud-accent text-hud-accent'
                        : 'bg-black/30 border-slate-800 text-slate-450 hover:bg-black/50'
                    }`}
                  >
                    Anular Pedido
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletePhysical(true)}
                    className={`p-2 rounded border text-[10px] uppercase font-bold tracking-wider cursor-pointer text-center ${
                      deletePhysical
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
                  value={deletePin}
                  onChange={e => setDeletePin(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && handleConfirmDelete()}
                  placeholder="••••"
                  className="bg-black border border-rose-500/30 text-xl font-extrabold text-[#00ffa3] rounded-lg p-2 tracking-[8px] text-center outline-none w-full"
                />

                {/* On-screen virtual numeric keypad */}
                <div className="grid grid-cols-3 gap-1 pt-1.5 max-w-[180px] mx-auto">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setDeletePin(prev => (prev + num).slice(0, 4))}
                      className="bg-slate-950 hover:bg-slate-900 border border-slate-850 text-white text-xs py-1.5 rounded font-mono font-bold active:scale-95 transition-all cursor-pointer"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDeletePin(prev => prev.slice(0, -1))}
                    className="bg-slate-950 hover:bg-rose-950/40 border border-slate-850 text-rose-500 text-xs py-1.5 rounded font-mono font-bold active:scale-95 transition-all text-center flex items-center justify-center cursor-pointer"
                  >
                    ⌫
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletePin(prev => (prev + '0').slice(0, 4))}
                    className="bg-slate-950 hover:bg-slate-900 border border-slate-850 text-white text-xs py-1.5 rounded font-mono font-bold active:scale-95 transition-all cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletePin('')}
                    className="bg-slate-950 hover:bg-slate-900 border border-slate-850 text-slate-400 text-[10px] py-1.5 rounded font-mono font-bold active:scale-95 transition-all cursor-pointer"
                  >
                    C
                  </button>
                </div>
              </div>

              {/* MOTIVO */}
              <div className="space-y-1">
                <label className="text-[9px] text-slate-400 uppercase block tracking-wider">
                  {deletePhysical ? 'Motivo opcional' : 'Motivo de Anulación Obligatorio *'}
                </label>
                <textarea 
                  rows={2}
                  value={deleteMotivo}
                  onChange={e => setDeleteMotivo(e.target.value)}
                  placeholder="E.g., Cliente canceló pedido, error en cajas..."
                  className="bg-slate-950 border border-slate-800 text-white rounded p-2 w-full outline-none resize-none font-sans"
                />
              </div>

              {deleteError && (
                <p className="text-rose-500 text-[10px] font-bold bg-rose-500/10 p-2 rounded">
                  {deleteError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-500/10">
              <button 
                type="button" 
                onClick={() => setDeleteTargetId(null)}
                className="bg-slate-900 border border-slate-800 text-slate-350 text-[10px] px-3.5 py-2 rounded cursor-pointer hover:bg-slate-850"
              >
                CANCELAR
              </button>
              <button 
                type="button"
                onClick={handleConfirmDelete}
                className="bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold px-4 py-2 rounded cursor-pointer transition-all"
              >
                EJECUTAR ACCIÓN
              </button>
            </div>
          </div>
        </div>
      )}

      {successToast && (
        <div className="fixed bottom-6 right-6 z-[25000] bg-slate-950/95 border-2 border-hud-green p-4 rounded-xl shadow-2xl max-w-sm w-full font-mono text-xs animate-fade-in flex items-start gap-3 backdrop-blur-md">
          <span className="text-xl text-hud-green">⚡</span>
          <div className="space-y-1">
            <h4 className="font-bold text-hud-green uppercase tracking-wide text-[11px]">{successToast.title}</h4>
            <p className="text-slate-200 text-[10.5px] leading-snug">{successToast.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
