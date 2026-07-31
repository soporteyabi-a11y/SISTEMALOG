/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileText, Sliders, Database, Users, History, Trash2, Edit2, Check, X, Plus, 
  Search, Printer, Download, Upload, RefreshCw, Save, AlertTriangle, FileUp, Sparkles, Filter
} from 'lucide-react';
import { LIQ_SEED_CLIENTES as seedClientes, LIQ_SEED_CATALOG as seedCatalog, cleanRefVolume } from '../data/liquidadorSeed';
import { saveToCloud, subscribeToCloud } from '../firebaseService';

// Safe LocalStorage proxy to prevent SecurityErrors in sandboxed environments
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return window.localStorage ? window.localStorage.getItem(key) : null;
    } catch (e) {
      console.warn(`[Storage] localStorage is unavailable (key: ${key}):`, e);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn(`[Storage] localStorage set failed (key: ${key}):`, e);
    }
  },
  removeItem: (key: string): void => {
    try {
      if (window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (e) {
      console.warn(`[Storage] localStorage remove failed (key: ${key}):`, e);
    }
  }
};

const localStorage = safeLocalStorage;

export default function LiquidadorModule() {
  // Navigation
  const [activeSubTab, setActiveSubTab] = useState<'liquidacion' | 'catalogo' | 'clientes' | 'historial'>('liquidacion');

  // Database collections (persisted in localStorage under separate keys to isolate from main ERP)
  const [catalog, setCatalog] = useState<any[]>([]);
  const [clientes, setClientes] = useState<Record<string, any>>({});
  const [historial, setHistorial] = useState<any[]>([]);

  // Current PV form inputs
  const [clienteActual, setClienteActual] = useState('');
  const [sucursalActual, setSucursalActual] = useState('');
  const [pvNum, setPvNum] = useState('');
  const [pvFecha, setPvFecha] = useState(() => new Date().toISOString().split('T')[0]);
  const [pvOc, setPvOc] = useState('');
  const [pdfStatus, setPdfStatus] = useState('');
  const [pdfRefFound, setPdfRefFound] = useState<number | null>(null);
  const [extractedCajas, setExtractedCajas] = useState<number | null>(null);
  const [extractedPeso, setExtractedPeso] = useState<number | null>(null);

  // active billing state
  const [pedido, setPedido] = useState<Record<string, number>>({}); // cod -> cajas
  const [preciosPV, setPreciosPV] = useState<Record<string, number>>({}); // cod -> precio
  const [selectedProductIndex, setSelectedProductIndex] = useState<Record<string, number>>({}); // cod -> original index in catalog
  const [verSoloPV, setVerSoloPV] = useState(false);

  // Administrative inline editing states (Catalog)
  const [searchCatalogQuery, setSearchCatalogQuery] = useState('');
  const [editingCatalogIdx, setEditingCatalogIdx] = useState<number | null>(null);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogItemsPerPage, setCatalogItemsPerPage] = useState(() => {
    try {
      const saved = localStorage.getItem('liq_catalog_items_per_page');
      return saved ? Number(saved) : 10;
    } catch {
      return 10;
    }
  });

  // New catalog item forms
  const [newCatalogCod, setNewCatalogCod] = useState('');
  const [newCatalogRef, setNewCatalogRef] = useState('');
  const [newCatalogMarca, setNewCatalogMarca] = useState('');
  const [newCatalogUnd, setNewCatalogUnd] = useState(24);
  const [newCatalogPrecio, setNewCatalogPrecio] = useState(0);
  const [newCatalogPeso, setNewCatalogPeso] = useState(0);
  const [isAddingProduct, setIsAddingProduct] = useState(false);

  // Administrative inline editing states (Clientes)
  const [searchClientQuery, setSearchClientQuery] = useState('');
  const [searchClientDropdownQuery, setSearchClientDropdownQuery] = useState('');
  const [editingClientKey, setEditingClientKey] = useState<string | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editClientSucursales, setEditClientSucursales] = useState('');
  const [editClientMarcas, setEditClientMarcas] = useState('');
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');

  // Historial pagination
  const [historialPage, setHistorialPage] = useState(1);
  const historyItemsPerPage = 10;

  // Toast / System updates
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Custom confirmation modal state
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // PDF.js worker availability tracker
  const [isPdfLibLoading, setIsPdfLibLoading] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [selectedPdfFile, setSelectedPdfFile] = useState<File | null>(null);

  // Loop locks for Firestore array and record states
  const lastSavedCatalog = useRef<string>('');
  const lastSavedLiqClientes = useRef<string>('');
  const lastSavedHistorial = useRef<string>('');
  const isInitialLoadCompleted = useRef<boolean>(false);

  // Initialize and load catalogs on mount
  useEffect(() => {
    // 1. Local storage or seed fallback loaded instantly
    const savedCat = localStorage.getItem('liq_catalog');
    if (savedCat) {
      try {
        const parsed = JSON.parse(savedCat);
        setCatalog(parsed);
        const raw = JSON.stringify(parsed);
        lastSavedCatalog.current = raw;
      } catch {
        const cleanedSeed = seedCatalog.map(p => ({ ...p, ref: cleanRefVolume(p.ref) }));
        setCatalog(cleanedSeed);
        const rawSeed = JSON.stringify(cleanedSeed);
        lastSavedCatalog.current = rawSeed;
        localStorage.setItem('liq_catalog', rawSeed);
        localStorage.setItem('liq_catalog_updatedAt', new Date().toISOString());
      }
    } else {
      const cleanedSeed = seedCatalog.map(p => ({ ...p, ref: cleanRefVolume(p.ref) }));
      setCatalog(cleanedSeed);
      const rawSeed = JSON.stringify(cleanedSeed);
      lastSavedCatalog.current = rawSeed;
      localStorage.setItem('liq_catalog', rawSeed);
      localStorage.setItem('liq_catalog_updatedAt', new Date().toISOString());
    }

    const savedCli = localStorage.getItem('liq_clientes');
    if (savedCli) {
      try {
        const parsed = JSON.parse(savedCli);
        const mergedWithSeed = { ...seedClientes, ...parsed };
        setClientes(mergedWithSeed);
        lastSavedLiqClientes.current = JSON.stringify(mergedWithSeed);
      } catch {
        setClientes(seedClientes);
        lastSavedLiqClientes.current = JSON.stringify(seedClientes);
      }
    } else {
      setClientes(seedClientes);
      const rawSeed = JSON.stringify(seedClientes);
      lastSavedLiqClientes.current = rawSeed;
      localStorage.setItem('liq_clientes', rawSeed);
      localStorage.setItem('liq_clientes_updatedAt', new Date().toISOString());
    }

    const savedHist = localStorage.getItem('liq_historial');
    if (savedHist) {
      setHistorial(JSON.parse(savedHist));
      lastSavedHistorial.current = savedHist;
    } else {
      lastSavedHistorial.current = JSON.stringify([]);
    }

    // Now mark initial load as completed BEFORE establishing subscriptions
    isInitialLoadCompleted.current = true;

    // 2. Subscribe to live Firestore state updates using safe non-destructive merging
    const unsubCatalog = subscribeToCloud('liq_state', 'catalog', (data, rawDoc) => {
      if (Array.isArray(data) && data.length > 0) {
        const rawCloud = JSON.stringify(data);
        if (rawCloud === lastSavedCatalog.current) return;

        const cloudUpdatedAt = rawDoc?.updatedAt || "";
        const localUpdatedAt = localStorage.getItem('liq_catalog_updatedAt') || "";
        
        const shouldPullFromCloud = !localUpdatedAt || (cloudUpdatedAt && new Date(cloudUpdatedAt) > new Date(localUpdatedAt));

        if (shouldPullFromCloud) {
          lastSavedCatalog.current = rawCloud;
          setCatalog(data);
          localStorage.setItem('liq_catalog', rawCloud);
          if (cloudUpdatedAt) {
            localStorage.setItem('liq_catalog_updatedAt', cloudUpdatedAt);
          }
        }
      }
    });

    const unsubClientes = subscribeToCloud('liq_state', 'clientes', (data, rawDoc) => {
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        const rawCloud = JSON.stringify(data);
        if (rawCloud === lastSavedLiqClientes.current) return;

        const cloudUpdatedAt = rawDoc?.updatedAt || "";
        const localUpdatedAt = localStorage.getItem('liq_clientes_updatedAt') || "";
        
        const shouldPullFromCloud = !localUpdatedAt || (cloudUpdatedAt && new Date(cloudUpdatedAt) > new Date(localUpdatedAt));

        if (shouldPullFromCloud) {
          setClientes(prev => {
            const currentLocal = prev && Object.keys(prev).length > 0 
              ? prev 
              : (() => {
                  try {
                    return JSON.parse(localStorage.getItem('liq_clientes') || '{}');
                  } catch {
                    return {};
                  }
                })();
            // Safely merge seed, local user-created clients, and cloud data so no client is deleted
            const merged = { ...seedClientes, ...currentLocal, ...data };
            const mergedRaw = JSON.stringify(merged);
            lastSavedLiqClientes.current = mergedRaw;
            localStorage.setItem('liq_clientes', mergedRaw);
            if (cloudUpdatedAt) {
              localStorage.setItem('liq_clientes_updatedAt', cloudUpdatedAt);
            }
            return merged;
          });
        }
      }
    });

    const unsubHistorial = subscribeToCloud('liq_state', 'historial', (data, rawDoc) => {
      if (Array.isArray(data)) {
        const rawCloud = JSON.stringify(data);
        if (rawCloud === lastSavedHistorial.current) return;

        const cloudUpdatedAt = rawDoc?.updatedAt || "";
        const localUpdatedAt = localStorage.getItem('liq_historial_updatedAt') || "";
        
        const shouldPullFromCloud = !localUpdatedAt || (cloudUpdatedAt && new Date(cloudUpdatedAt) > new Date(localUpdatedAt));

        if (shouldPullFromCloud) {
          setHistorial(prev => {
            const currentLocal = prev && prev.length > 0 
              ? prev 
              : (() => {
                  try {
                    return JSON.parse(localStorage.getItem('liq_historial') || '[]');
                  } catch {
                    return [];
                  }
                })();
            const map = new Map();
            data.forEach((item: any) => map.set(item.id, item));
            currentLocal.forEach((item: any) => {
              if (!map.has(item.id)) {
                map.set(item.id, item);
              }
            });
            const merged = Array.from(map.values());
            const mergedRaw = JSON.stringify(merged);
            lastSavedHistorial.current = mergedRaw;
            localStorage.setItem('liq_historial', mergedRaw);
            if (cloudUpdatedAt) {
              localStorage.setItem('liq_historial_updatedAt', mergedRaw);
            }
            return merged;
          });
        }
      }
    });

    // Dynamic Script Injection for pdf.js if not present
    if (!(window as any).pdfjsLib) {
      setIsPdfLibLoading(true);
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js';
      script.async = true;
      script.onload = () => {
        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        setIsPdfLibLoading(false);
      };
      script.onerror = () => {
        setIsPdfLibLoading(false);
        showToast('error', 'Error al cargar módulo de pdf.js');
      };
      document.head.appendChild(script);
    }

    return () => {
      unsubCatalog();
      unsubClientes();
      unsubHistorial();
    };
  }, []);

  // Show interactive notifications
  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Helper formats
  const fmt = (n: number) => Math.round(n).toLocaleString('es-CO');
  const fmtD = (n: number) => n.toFixed(2);
  const parseNum = (val: any): number => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const cleaned = String(val).replace(/,/g, '.').replace(/[^\d.-]/g, '');
    const res = parseFloat(cleaned);
    return isNaN(res) ? 0 : res;
  };

  // Computed properties
  const filteredProductsByCliente = useMemo(() => {
    const mappedCatalog = catalog.map((p, idx) => ({ ...p, catalogIndex: idx }));
    if (!clienteActual || !clientes[clienteActual]) return mappedCatalog;
    const clientInfo = clientes[clienteActual] as any;
    const marcasCliente = clientInfo?.marcas || [];
    
    if (marcasCliente.length === 0) {
      return mappedCatalog;
    }
    const cleanStr = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    return mappedCatalog.filter(p => {
      const isContracted = marcasCliente.some((m: string) => cleanStr(m) === cleanStr(p.marca));
      if (isContracted) return true;
      if (pedido[p.cod] > 0) return true;
      return false;
    });
  }, [clienteActual, catalog, clientes, pedido]);

  const groupedProductsByCode = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    filteredProductsByCliente.forEach((p) => {
      // Keep track of original index in complete catalog to map correctly
      const itemWithMeta = { ...p, originalIndex: p.catalogIndex };
      if (!grouped[p.cod]) {
        grouped[p.cod] = [itemWithMeta];
      } else {
        grouped[p.cod].push(itemWithMeta);
      }
    });
    return grouped;
  }, [filteredProductsByCliente]);

  // Robust product resolver by code and selected variant index
  const getProductForCode = useCallback((cod: string) => {
    const matchingProducts = catalog.map((p, idx) => ({ ...p, catalogIndex: idx })).filter(p => p.cod === cod);
    if (matchingProducts.length === 0) return null;
    if (matchingProducts.length === 1) return matchingProducts[0];

    const selectedIdx = selectedProductIndex[cod];
    if (typeof selectedIdx === 'number') {
      if (catalog[selectedIdx] && catalog[selectedIdx].cod === cod) {
        return { ...catalog[selectedIdx], catalogIndex: selectedIdx };
      }
    }
    
    // Fallback to first matching product for this code
    return matchingProducts[0];
  }, [catalog, selectedProductIndex]);

  // Totals calculations
  const totals = useMemo(() => {
    let rawCajas = 0;
    let rawUnds = 0;
    let rawPeso = 0;
    let rawSubtotal = 0;

    Object.entries(pedido).forEach(([cod, cajasVal]) => {
      const cajas = parseNum(cajasVal);
      if (cajas <= 0) return;
      
      const product = getProductForCode(cod);
      if (!product) return;

      const undFactor = parseNum(product.und) || 1;
      const pesoFactor = parseNum(product.peso);
      const precioFactor = preciosPV[cod] !== undefined ? parseNum(preciosPV[cod]) : parseNum(product.precio);

      rawCajas += cajas;
      const units = cajas * undFactor;
      rawUnds += units;
      rawPeso += cajas * pesoFactor;
      rawSubtotal += units * precioFactor;
    });

    return {
      cajas: rawCajas,
      unidades: rawUnds,
      peso: rawPeso,
      subtotal: rawSubtotal,
    };
  }, [pedido, catalog, preciosPV, selectedProductIndex, getProductForCode]);

  // Memoized items list filtered for printing (only with quantities > 0)
  const itemsToPrint = useMemo(() => {
    return Object.entries(pedido)
      .map(([cod, cajasVal]) => {
        const cajas = parseNum(cajasVal);
        if (cajas <= 0) return null;

        const product = getProductForCode(cod);
        if (!product) return null;

        const undFactor = parseNum(product.und) || 1;
        const pesoFactor = parseNum(product.peso);
        const unds = cajas * undFactor;
        const finalPrecio = preciosPV[cod] !== undefined ? parseNum(preciosPV[cod]) : parseNum(product.precio);
        const subtotal = unds * finalPrecio;
        const weight = cajas * pesoFactor;

        return {
          cod,
          ref: product.ref,
          marca: product.marca,
          und: undFactor,
          cajas,
          unidades: unds,
          precio: finalPrecio,
          subtotal,
          weight
        };
      })
      .filter(Boolean) as Array<{
        cod: string;
        ref: string;
        marca: string;
        und: number;
        cajas: number;
        unidades: number;
        precio: number;
        subtotal: number;
        weight: number;
      }>;
  }, [pedido, selectedProductIndex, catalog, preciosPV, getProductForCode]);


  // PDF Selection handler (triggered when a file is chosen)
  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedPdfFile(file);
      setPdfStatus(`Listo para procesar: ${file.name}`);
      showToast('success', `Archivo "${file.name}" cargado. Presiona el botón "PROCESAR Y CARGAR PV" para consolidar.`);
    }
  };

  // PDF Parser Executor (manually triggered via the CARGAR PV button)
  const handleExecutePdfLoad = async () => {
    if (!selectedPdfFile) {
      showToast('error', 'Por favor, selecciona primero un archivo PDF.');
      return;
    }

    // Reset form state COMPLETELY before processing new PDF to avoid carrying over previous PV data
    setClienteActual('');
    setSucursalActual('');
    setPvNum('');
    setPvOc('');
    setExtractedCajas(null);
    setExtractedPeso(null);
    setPedido({});
    setPreciosPV({});
    setSelectedProductIndex({});
    
    setPdfStatus('Leyendo archivo...');
    setPdfRefFound(null);

    const fileReader = new FileReader();
    fileReader.onerror = () => {
      setPdfStatus('');
      showToast('error', 'Error al leer el archivo PDF');
    };

    fileReader.onload = async function() {
      try {
        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) {
          setPdfStatus('');
          showToast('error', 'El lector PDF aún no está listo. Intenta de nuevo en unos segundos.');
          return;
        }

        const typedarray = new Uint8Array(this.result as ArrayBuffer);
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        const pdf = await loadingTask.promise;
        
        let fullText = '';
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str).join(' ');
          fullText += ' ' + strings;
        }

        const normalizedText = fullText.replace(/\s+/g, ' ');

        // Clean string helper
        const cleanString = (s: string) => {
          return (s || '').toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[.\-,()_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        };

        // 1. Extract raw client label directly from document text if present
        let extractedRawClient = '';
        const clientLabelRegexes = [
          /Cliente\s*[:\-–]\s*(.*?)(?=\s*(?:NIT|Dirección|Direccion|Teléfono|Telefono|Ciudad|Sucursal|Vendedor|Bodega|OC|Código|Codigo|Sede|Lugar|Fecha|Cant|Vr\.|Descripción|Descripcion|Subtotal|\s{2,}|$))/i,
          /Adquiriente\s*[:\-–]\s*(.*?)(?=\s*(?:NIT|Dirección|Direccion|Teléfono|Telefono|Ciudad|Sucursal|Vendedor|Bodega|OC|Código|Codigo|Sede|Lugar|Fecha|Cant|Vr\.|Descripción|Descripcion|Subtotal|\s{2,}|$))/i,
          /Señor\(es\)\s*[:\-–]\s*(.*?)(?=\s*(?:NIT|Dirección|Direccion|Teléfono|Telefono|Ciudad|Sucursal|Vendedor|Bodega|OC|Código|Codigo|Sede|Lugar|Fecha|Cant|Vr\.|Descripción|Descripcion|Subtotal|\s{2,}|$))/i,
          /Comprador\s*[:\-–]\s*(.*?)(?=\s*(?:NIT|Dirección|Direccion|Teléfono|Telefono|Ciudad|Sucursal|Vendedor|Bodega|OC|Código|Codigo|Sede|Lugar|Fecha|Cant|Vr\.|Descripción|Descripcion|Subtotal|\s{2,}|$))/i,
          /Razón\s*Social\s*[:\-–]\s*(.*?)(?=\s*(?:NIT|Dirección|Direccion|Teléfono|Telefono|Ciudad|Sucursal|Vendedor|Bodega|OC|Código|Codigo|Sede|Lugar|Fecha|Cant|Vr\.|Descripción|Descripcion|Subtotal|\s{2,}|$))/i,
          /Facturado\s*a\s*[:\-–]\s*(.*?)(?=\s*(?:NIT|Dirección|Direccion|Teléfono|Telefono|Ciudad|Sucursal|Vendedor|Bodega|OC|Código|Codigo|Sede|Lugar|Fecha|Cant|Vr\.|Descripción|Descripcion|Subtotal|\s{2,}|$))/i,
        ];

        for (const rx of clientLabelRegexes) {
          const m = normalizedText.match(rx);
          if (m && m[1] && m[1].trim().length > 2) {
            extractedRawClient = m[1].trim().replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
            break;
          }
        }

        // 2. Identify client against registered clients dictionary
        let matchedClient = '';
        const normText = cleanString(normalizedText);

        if (extractedRawClient) {
          const normExtracted = cleanString(extractedRawClient);
          for (const clientKey of Object.keys(clientes)) {
            const normKey = cleanString(clientKey);
            if (normKey === normExtracted || normText.includes(normKey) || normExtracted.includes(normKey) || normKey.includes(normExtracted)) {
              matchedClient = clientKey;
              break;
            }
          }
        }

        if (!matchedClient) {
          for (const clientKey of Object.keys(clientes)) {
            const normKey = cleanString(clientKey);
            if (normKey.length > 3 && normText.includes(normKey)) {
              matchedClient = clientKey;
              break;
            }
          }
        }

        // 3. Set final client (NEVER fallback to stale previous client)
        let finalClient = matchedClient;
        if (!finalClient && extractedRawClient) {
          finalClient = extractedRawClient.toUpperCase();
          if (!clientes[finalClient]) {
            setClientes(prev => {
              const updated = {
                ...prev,
                [finalClient]: {
                  sucursales: ["PRINCIPAL"],
                  marcas: []
                }
              };
              localStorage.setItem('liq_clientes', JSON.stringify(updated));
              saveToCloud('liq_state', 'clientes', updated);
              return updated;
            });
          }
        }

        if (finalClient) {
          setClienteActual(finalClient);
          showToast('success', `Cliente detectado: ${finalClient}`);

          // Detect sucursal for the newly matched client
          let matchedSucursal = '';
          const clientBranches = (clientes[finalClient] as any)?.sucursales || ["PRINCIPAL"];
          for (const s of clientBranches) {
            if (normText.includes(cleanString(s))) {
              matchedSucursal = s;
              break;
            }
          }
          if (!matchedSucursal && normText.includes('PRINCIPAL')) {
            const principal = clientBranches.find((x: string) => cleanString(x).includes('PRINCIPAL'));
            if (principal) matchedSucursal = principal;
          }
          setSucursalActual(matchedSucursal || clientBranches[0] || 'PRINCIPAL');
        } else {
          setClienteActual('');
          setSucursalActual('');
          showToast('error', 'No se identificó el cliente en el PDF. Por favor selecciona o ingresa el cliente.');
        }

        // Search for PV Number & OC code in text
        const pvMatch = normalizedText.match(/PV\s*(\d+)/i) || normalizedText.match(/Pedido\s*(?:de\s*Venta)?\s*N°?\s*(\d+)/i) || normalizedText.match(/N(?:o|º|°|úm\.?)\s*PV\s*(\d+)/i);
        if (pvMatch) {
          setPvNum('PV ' + pvMatch[1]);
        }
        
        const ocMatch = normalizedText.match(/OC[A-Z0-9-]*\d+/i) || normalizedText.match(/Orden\s*(?:de\s*Compra)?\s*(?:N°?)?\s*([A-Za-z0-9-]+)/i);
        if (ocMatch) {
          setPvOc(ocMatch[1] || ocMatch[0]);
        }

        // Extract Fecha de PV
        const extractDate = (strText: string): string => {
          if (!strText) return "";
          const formatIso = (dStr: string, mStr: string, yStr: string): string => {
            let day = parseInt(dStr, 10);
            let month = parseInt(mStr, 10);
            let year = parseInt(yStr, 10);
            if (isNaN(day) || isNaN(month) || isNaN(year)) return "";
            if (year < 100) year += 2000;
            if (month > 12 && day <= 12) { const tmp = day; day = month; month = tmp; }
            if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2099) return "";
            const mm = month < 10 ? `0${month}` : `${month}`;
            const dd = day < 10 ? `0${day}` : `${day}`;
            return `${year}-${mm}-${dd}`;
          };

          const dm1 = strText.match(/(?:Dia|Día)\s*[:\-–]?\s*(\d{1,2})\s*(?:Mes)\s*[:\-–]?\s*(\d{1,2})\s*(?:Año|Anio|Añ|Ano)\s*[:\-–]?\s*(\d{2,4})/i);
          if (dm1) { const res = formatIso(dm1[1], dm1[2], dm1[3]); if (res) return res; }

          const dm2 = strText.match(/(?:Dia|Día)\s+(?:Mes)\s+(?:Año|Anio|Añ|Ano)\s*[:\-–]?\s*(\d{1,2})\s*[\/\-\s]\s*(\d{1,2})\s*[\/\-\s]\s*(\d{2,4})/i);
          if (dm2) { const res = formatIso(dm2[1], dm2[2], dm2[3]); if (res) return res; }

          const f1 = strText.match(/(?:Fecha|FECHA|Fec)\s*[:\-–]?\s*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](20\d{2}|\d{2})/i);
          if (f1) { const res = formatIso(f1[1], f1[2], f1[3]); if (res) return res; }

          const f2 = strText.match(/(?:Fecha|FECHA|Fec)\s*[:\-–]?\s*(20\d{2})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/i);
          if (f2) { const res = formatIso(f2[3], f2[2], f2[1]); if (res) return res; }

          const gen = strText.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](20\d{2})\b/);
          if (gen) { const res = formatIso(gen[1], gen[2], gen[3]); if (res) return res; }

          return "";
        };

        const extractedPvDate = extractDate(normalizedText);
        if (extractedPvDate) {
          setPvFecha(extractedPvDate);
        }

        // Extract Cajas & Peso from the PDF text (using robust matching patterns)
        let parsedCajas: number | null = null;
        let parsedPeso: number | null = null;

        // Try joint matches first (like "Cajas 716.00 Peso 9,919.08")
        const jointMatch = normalizedText.match(/(?:Cajas|Cjs|Cja|Cjs\.|Bultos)\s*([\d\.,]+)\s*(?:Peso|Kilos|Kg|Kgs|Kgs\.|Kilogramos)\s*([\d\.,]+)/i);
        const jointMatchReverse = normalizedText.match(/(?:Peso|Kilos|Kg|Kgs|Kgs\.|Kilogramos)\s*([\d\.,]+)\s*(?:Cajas|Cjs|Cja|Cjs\.|Bultos)\s*([\d\.,]+)/i);

        if (jointMatch) {
          parsedCajas = Math.round(parseFloat(jointMatch[1].replace(/,/g, "")));
          parsedPeso = parseFloat(jointMatch[2].replace(/,/g, ""));
        } else if (jointMatchReverse) {
          parsedPeso = parseFloat(jointMatchReverse[1].replace(/,/g, ""));
          parsedCajas = Math.round(parseFloat(jointMatchReverse[2].replace(/,/g, "")));
        } else {
          // If joint matches fail, try to extract them individually from the text
          const cajasKeywords = ["Cajas", "Total Cajas", "Bultos", "Cjs", "Cja", "Caja"];
          for (const kw of cajasKeywords) {
            const regex = new RegExp(kw + '\\s*[:\\-–]?\\s*([\\d\\.,]+)', 'i');
            const match = normalizedText.match(regex);
            if (match) {
              const num = parseFloat(match[1].replace(/,/g, ""));
              if (!isNaN(num) && num > 0) {
                parsedCajas = Math.round(num);
                break;
              }
            }
          }

          const pesoKeywords = ["Peso Total", "Peso Bruto", "Peso", "Kilos", "Kgs", "Kg", "Kilogramos"];
          for (const kw of pesoKeywords) {
            const regex = new RegExp(kw + '\\s*[:\\-–]?\\s*([\\d\\.,]+)', 'i');
            const match = normalizedText.match(regex);
            if (match) {
              const num = parseFloat(match[1].replace(/,/g, ""));
              if (!isNaN(num) && num > 0) {
                parsedPeso = num;
                break;
              }
            }
          }
        }

        if (parsedCajas !== null && !isNaN(parsedCajas)) {
          setExtractedCajas(parsedCajas);
        } else {
          setExtractedCajas(null);
        }
        if (parsedPeso !== null && !isNaN(parsedPeso)) {
          setExtractedPeso(parsedPeso);
        } else {
          setExtractedPeso(null);
        }

        // Initialize temporary structures for mapped order
        const newPedido: Record<string, number> = {};
        const newPrices: Record<string, number> = {};
        const newSelectedProdIndex: Record<string, number> = {};
        let countRef = 0;

        // Fetch products matching parsed client's brands, grouped by code
        const targetCatalogByCode: Record<string, any[]> = {};
        let scanList: any[] = [];

        if (finalClient) {
          const clientInfo = clientes[finalClient] as any;
          const brands = clientInfo?.marcas || [];
          if (brands.length === 0) {
            scanList = catalog.map((p, idx) => ({ ...p, originalIndex: idx }));
          } else {
            const cleanStr = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            scanList = catalog.map((p, idx) => ({ ...p, originalIndex: idx }))
                              .filter(p => brands.some((b: string) => cleanStr(b) === cleanStr(p.marca)));
          }
        } else {
          scanList = catalog.map((p, idx) => ({ ...p, originalIndex: idx }));
        }

        scanList.forEach(p => {
          if (!targetCatalogByCode[p.cod]) targetCatalogByCode[p.cod] = [];
          targetCatalogByCode[p.cod].push(p);
        });

        // Fallback para códigos no cubiertos por las marcas del cliente
        catalog.forEach((p, idx) => {
          if (!targetCatalogByCode[p.cod]) {
            targetCatalogByCode[p.cod] = [{ ...p, originalIndex: idx }];
          }
        });

        // Loop over target codes to parse amounts from text
        Object.keys(targetCatalogByCode).forEach(cod => {
          const items = targetCatalogByCode[cod];
          const standardPrice = items[0].precio;
          const standardUnd = items[0].und;

          // Try both full code (e.g., "01050461") and trimmed numeric code (e.g., "1050461")
          const codStrVariants = [cod, parseInt(cod, 10).toString()];
          let foundMatch = false;

          for (const variant of codStrVariants) {
            if (foundMatch) break;

            // Pattern 1: Standard with $ sign: code + (descript) + qty + $ + price
            const regex1 = new RegExp(
              variant + "\\s+([^$]{1,150}?)\\s+([\\d,]+(?:\\.\\d+)?)\\s*\\$\\s*([\\d,]+(?:\\.\\d+)?)", "i"
            );
            // Pattern 2: Without $ sign: code + (descript) + qty + price at the end
            const regex2 = new RegExp(
              variant + "\\s+([^0-9]{1,150}?)\\s+([\\d,]{1,10}(?:\\.\\d{1,2})?)\\s+([\\d,]{3,12}(?:\\.\\d{1,2})?)", "i"
            );
            // Pattern 3: Simple sequential columns: code + qty + price directly
            const regex3 = new RegExp(
              variant + "\\s+([\\d,]+(?:\\.\\d+)?)\\s+([\\d,]+(?:\\.\\d+)?)", "i"
            );

            const patterns = [regex1, regex2, regex3];
            for (const pat of patterns) {
              const match = normalizedText.match(pat);
              if (match) {
                let qtyStr = match[2];
                let priceStr = match[3];

                if (!priceStr && match[1]) {
                  qtyStr = match[1];
                  priceStr = match[2];
                }

                qtyStr = qtyStr.replace(/,/g, "");
                priceStr = priceStr.replace(/,/g, "");

                const units = parseFloat(qtyStr);
                const price = parseFloat(priceStr);

                if (!isNaN(units) && units > 0 && !isNaN(price) && price > 0) {
                  let bestProduct = items[0];
                  let minDiff = Infinity;
                  
                  items.forEach(item => {
                    const diff = Math.abs(item.precio - price);
                    if (diff < minDiff) {
                      minDiff = diff;
                      bestProduct = item;
                    }
                  });

                  newSelectedProdIndex[cod] = bestProduct.originalIndex;
                  newPedido[cod] = units / bestProduct.und;
                  newPrices[cod] = price;
                  countRef++;
                  foundMatch = true;
                  break;
                }
              }
            }

            // Heuristic close-proximity backup scanner if regular regex matches failed
            if (!foundMatch) {
              const codIndex = normalizedText.indexOf(variant);
              if (codIndex !== -1) {
                const rangeText = normalizedText.substring(codIndex + variant.length, codIndex + variant.length + 200);
                // Look for sequence of numbers
                const numberMatches = rangeText.match(/[\d,.]+/g) || [];
                const numbers = numberMatches.map(m => {
                  let cleanNum = m;
                  const hasComma = m.includes(',');
                  const hasDot = m.includes('.');
                  if (hasComma && hasDot) {
                    if (m.indexOf(',') < m.indexOf('.')) {
                      cleanNum = m.replace(/,/g, '');
                    } else {
                      cleanNum = m.replace(/\./g, '').replace(/,/g, '.');
                    }
                  } else if (hasComma) {
                    if (m.split(',')[1]?.length <= 2) {
                      cleanNum = m.replace(/,/g, '.');
                    } else {
                      cleanNum = m.replace(/,/g, '');
                    }
                  } else if (hasDot) {
                    const splitVal = m.split('.');
                    if (splitVal[1]?.length === 3) {
                      const valAsDecimal = parseFloat(m);
                      const valWithoutDot = parseFloat(m.replace(/\./g, ''));
                      if (Math.abs(valWithoutDot - standardPrice) < Math.abs(valAsDecimal - standardPrice)) {
                        cleanNum = m.replace(/\./g, '');
                      }
                    }
                  }
                  return parseFloat(cleanNum);
                }).filter(n => !isNaN(n) && n > 0 && n !== standardUnd);

                if (numbers.length >= 2) {
                  let foundPrice = 0;
                  let foundPriceIdx = -1;
                  let minPriceDiff = Infinity;

                  // Find the number closest to the catalog price
                  numbers.forEach((num, idx) => {
                    const priceDiff = Math.abs(num - standardPrice) / standardPrice;
                    if (priceDiff < 0.6 && priceDiff < minPriceDiff) {
                      minPriceDiff = priceDiff;
                      foundPrice = num;
                      foundPriceIdx = idx;
                    }
                  });

                  // If not identified by matching standard price, default to selecting the closest one
                  if (foundPriceIdx === -1) {
                    let bestPriceIdx = -1;
                    let bestPriceDiff = Infinity;
                    numbers.forEach((num, idx) => {
                      const diff = Math.abs(num - standardPrice);
                      if (diff < bestPriceDiff) {
                        bestPriceDiff = diff;
                        bestPriceIdx = idx;
                      }
                    });
                    if (bestPriceIdx !== -1) {
                      foundPrice = numbers[bestPriceIdx];
                      foundPriceIdx = bestPriceIdx;
                    }
                  }

                  if (foundPriceIdx !== -1) {
                    let qtyIndex = -1;
                    for (let i = 0; i < numbers.length; i++) {
                      if (i !== foundPriceIdx) {
                        qtyIndex = i;
                        break;
                      }
                    }

                    if (qtyIndex !== -1) {
                      const units = numbers[qtyIndex];
                      const price = foundPrice;

                      let bestProduct = items[0];
                      let minDiff = Infinity;
                      items.forEach(item => {
                        const diff = Math.abs(item.precio - price);
                        if (diff < minDiff) {
                          minDiff = diff;
                          bestProduct = item;
                        }
                      });

                      newSelectedProdIndex[cod] = bestProduct.originalIndex;
                      newPedido[cod] = units / bestProduct.und;
                      newPrices[cod] = price;
                      countRef++;
                      foundMatch = true;
                    }
                  }
                }
              }
            }
          }
        });

        setPedido(newPedido);
        setPreciosPV(newPrices);
        setSelectedProductIndex(prev => ({ ...prev, ...newSelectedProdIndex }));
        setPdfRefFound(countRef);
        setPdfStatus('PDF procesado exitosamente.');
        showToast('success', `PDF procesado: Se cargaron ${countRef} referencias.`);

      } catch (err) {
        console.error(err);
        setPdfStatus('');
        showToast('error', 'Error al procesar el archivo PDF');
      }
    };

    fileReader.readAsArrayBuffer(selectedPdfFile);
  };

  // Pre-fill fallback demo helper
  const handlePreFillDemo = () => {
    if (!clienteActual) {
      setClienteActual("SUPERMERCADO LA VAQUITA BELLO");
      setSucursalActual("BELLO PRINCIPAL");
    }
    setPvNum("PV 2070");
    setPvOc("OC-COE-00000081");
    
    // Set quantities according to the user's legacy seed
    const mockPedido = {
      "01050461": 111.11,
      "01050715": 222.22,
      "01060349": 83.33,
      "01200004": 18,
      "01200005": 177.78
    };

    // Ensure selected productive indexes are set correctly of duplicates
    const mockSelectedProdIndex: Record<string, number> = {};
    Object.keys(mockPedido).forEach(cod => {
      const idx = catalog.findIndex(p => p.cod === cod);
      if (idx !== -1) mockSelectedProdIndex[cod] = idx;
    });

    setPedido(mockPedido);
    setSelectedProductIndex(mockSelectedProdIndex);
    showToast('success', 'Formulario rellenado con datos de demo (PV 2070) exitosamente!');
  };

  const handleUpdateProductQty = (cod: string, rawVal: string, type: 'cajas' | 'unidades') => {
    const val = parseFloat(rawVal) || 0;
    if (val < 0) return;

    const p = getProductForCode(cod);
    if (!p) return;

    setPedido(prev => {
      const copy = { ...prev };
      if (type === 'cajas') {
        if (val === 0) {
          delete copy[cod];
        } else {
          copy[cod] = val;
        }
      } else {
        const undFactor = Number(p.und) || 1;
        const calculatedCajas = undFactor > 0 ? val / undFactor : 0;
        if (calculatedCajas === 0) {
          delete copy[cod];
        } else {
          copy[cod] = calculatedCajas;
        }
      }
      return copy;
    });
  };

  // Clear current loadout
  const handleClearBilling = () => {
    setPedido({});
    setPreciosPV({});
    setSelectedProductIndex({});
    setPvNum('');
    setPvOc('');
    setPdfStatus('');
    setPdfRefFound(null);
    setExtractedCajas(null);
    setExtractedPeso(null);
    showToast('success', 'Liquidación reiniciada.');
  };

  // Save bill into local history
  const handleSavePV = () => {
    if (!clienteActual || !sucursalActual) {
      showToast('error', 'Selecciona el cliente y sucursal antes de guardar.');
      return;
    }
    if (!pvNum.trim()) {
      showToast('error', 'Ingresa el número de pedido/PV antes de guardar.');
      return;
    }

    const newPvItem = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleString('es-CO'),
      numPV: pvNum,
      fecha: pvFecha,
      oc: pvOc,
      cliente: clienteActual,
      sucursal: sucursalActual,
      pedido,
      preciosPV,
      selectedProductIndex,
      subtotal: totals.subtotal,
      extractedCajas,
      extractedPeso
    };

    setHistorial(prev => {
      const updated = [newPvItem, ...prev];
      localStorage.setItem('liq_historial', JSON.stringify(updated));
      return updated;
    });

    showToast('success', `Pedido ${pvNum} de ${clienteActual} guardado exitosamente.`);
  };

  // Load a saved PV from history
  const handleLoadPVFromHistory = (item: any) => {
    setPvNum(item.numPV || '');
    setPvFecha(item.fecha || '');
    setPvOc(item.oc || '');
    setClienteActual(item.cliente || '');
    setSucursalActual(item.sucursal || '');
    setPedido(item.pedido || {});
    setPreciosPV(item.preciosPV || {});
    setSelectedProductIndex(item.selectedProductIndex || {});
    setExtractedCajas(item.extractedCajas !== undefined ? item.extractedCajas : null);
    setExtractedPeso(item.extractedPeso !== undefined ? item.extractedPeso : null);
    
    // Navigate home to billing screen
    setActiveSubTab('liquidacion');
    showToast('success', `Cargado PV ${item.numPV} de ${item.cliente}`);
  };

  // Delete a saved PV from history
  const handleDeletePVFromHistory = (id: string) => {
    setConfirmState({
      isOpen: true,
      title: 'ELIMINAR LIQUIDACIÓN',
      message: '¿Estás seguro de que deseas eliminar este registro de liquidación en el historial local? Esta acción no se puede deshacer.',
      onConfirm: () => {
        setHistorial(prev => {
          const filtered = prev.filter(item => item.id !== id);
          localStorage.setItem('liq_historial', JSON.stringify(filtered));
          return filtered;
        });
        showToast('success', 'Registro eliminado del historial');
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Download raw database to backup
  const handleDownloadDatabaseBackup = () => {
    const backupObj = {
      catalog,
      clientes,
      historial
    };
    const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Liquidador_Resumen_Completo_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Copia de seguridad descargada.');
  };

  // Upload database from backup
  const handleUploadDatabaseBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.catalog && data.clientes) {
          const nowIso = new Date().toISOString();
          const cleanedCat = data.catalog.map((p: any) => ({ ...p, ref: cleanRefVolume(p.ref) }));
          const rawCat = JSON.stringify(cleanedCat);

          setCatalog(cleanedCat);
          lastSavedCatalog.current = rawCat;
          localStorage.setItem('liq_catalog', rawCat);
          localStorage.setItem('liq_catalog_updatedAt', nowIso);
          saveToCloud('liq_state', 'catalog', cleanedCat);
          
          setClientes(data.clientes);
          const rawCli = JSON.stringify(data.clientes);
          lastSavedLiqClientes.current = rawCli;
          localStorage.setItem('liq_clientes', rawCli);
          localStorage.setItem('liq_clientes_updatedAt', nowIso);
          saveToCloud('liq_state', 'clientes', data.clientes);
          
          if (data.historial) {
            setHistorial(data.historial);
            const rawHist = JSON.stringify(data.historial);
            lastSavedHistorial.current = rawHist;
            localStorage.setItem('liq_historial', rawHist);
            localStorage.setItem('liq_historial_updatedAt', nowIso);
            saveToCloud('liq_state', 'historial', data.historial);
          }
          showToast('success', 'Base de datos restaurada correctamente');
        } else {
          showToast('error', 'El archivo no contiene un formato de respaldo válido');
        }
      } catch (err) {
        showToast('error', 'Error al leer o parsear el archivo JSON de respaldo');
      }
    };
    reader.readAsText(file);
  };

  // Direct print option
  const handlePrintView = () => {
    document.body.classList.add('print-liquidador-mode');
    window.print();
    document.body.classList.remove('print-liquidador-mode');
  };

  // --- CATALOG MANAGEMENT ADMIN METHODS ---
  const filteredCatalogForAdmin = useMemo(() => {
    if (!searchCatalogQuery || !searchCatalogQuery.trim()) return catalog;
    const cleanNorm = (str: string) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const words = searchCatalogQuery.trim().split(/\s+/).map(cleanNorm).filter(Boolean);
    return catalog.filter(p => {
      const full = cleanNorm(`${p.cod} ${p.ref} ${p.marca}`);
      return words.every(w => full.includes(w));
    });
  }, [catalog, searchCatalogQuery]);

  const totalCatalogPages = Math.ceil(filteredCatalogForAdmin.length / catalogItemsPerPage) || 1;
  const paginatedCatalogForAdmin = useMemo(() => {
    const start = (catalogPage - 1) * catalogItemsPerPage;
    return filteredCatalogForAdmin.slice(start, start + catalogItemsPerPage);
  }, [filteredCatalogForAdmin, catalogPage]);

  const handleSaveCatalogEdit = (idxInFilter: number) => {
    // We need to resolve standard index in complete catalog list
    const itemInFilter = paginatedCatalogForAdmin[idxInFilter];
    const originalIndex = catalog.findIndex(p => p.cod === itemInFilter.cod && p.ref === itemInFilter.ref);
    if (originalIndex === -1) return;

    const editedCod = (document.getElementById(`edit-cod-${idxInFilter}`) as HTMLInputElement)?.value.trim();
    const editedRef = (document.getElementById(`edit-ref-${idxInFilter}`) as HTMLInputElement)?.value.trim();
    const editedMarca = (document.getElementById(`edit-marca-${idxInFilter}`) as HTMLInputElement)?.value.trim();
    const editedUnd = parseInt((document.getElementById(`edit-und-${idxInFilter}`) as HTMLInputElement)?.value) || 24;
    const editedPrecio = parseFloat((document.getElementById(`edit-precio-${idxInFilter}`) as HTMLInputElement)?.value) || 0;
    const editedPeso = parseFloat((document.getElementById(`edit-peso-${idxInFilter}`) as HTMLInputElement)?.value) || 0;

    if (!editedCod || !editedRef) {
      showToast('error', 'El código y la descripción son obligatorios.');
      return;
    }

    setCatalog(prev => {
      const updated = [...prev];
      updated[originalIndex] = {
        cod: editedCod,
        ref: editedRef,
        marca: editedMarca,
        und: editedUnd,
        precio: editedPrecio,
        peso: editedPeso
      };
      const raw = JSON.stringify(updated);
      lastSavedCatalog.current = raw;
      const nowIso = new Date().toISOString();
      localStorage.setItem('liq_catalog', raw);
      localStorage.setItem('liq_catalog_updatedAt', nowIso);
      saveToCloud('liq_state', 'catalog', updated);
      return updated;
    });

    setEditingCatalogIdx(null);
    showToast('success', 'Producto actualizado en el catálogo.');
  };

  const handleDeleteCatalogProduct = (cod: string, ref: string) => {
    setConfirmState({
      isOpen: true,
      title: 'ELIMINAR PRODUCTO',
      message: `¿Estás seguro de eliminar el producto "${ref}" del catálogo?`,
      onConfirm: () => {
        const updated = catalog.filter(p => !(p.cod === cod && p.ref === ref));
        setCatalog(updated);
        const raw = JSON.stringify(updated);
        lastSavedCatalog.current = raw;
        const nowIso = new Date().toISOString();
        localStorage.setItem('liq_catalog', raw);
        localStorage.setItem('liq_catalog_updatedAt', nowIso);
        saveToCloud('liq_state', 'catalog', updated);
        showToast('success', 'Producto removido del catálogo.');
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleAddNewCatalogProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatalogCod.trim() || !newCatalogRef.trim() || !newCatalogMarca.trim()) {
      showToast('error', 'Por favor llena los campos código, descripción y marca.');
      return;
    }

    const newItem = {
      cod: newCatalogCod.trim(),
      ref: newCatalogRef.trim(),
      marca: newCatalogMarca.trim(),
      und: newCatalogUnd,
      precio: newCatalogPrecio,
      peso: newCatalogPeso
    };

    setCatalog(prev => {
      const updated = [newItem, ...prev];
      const raw = JSON.stringify(updated);
      lastSavedCatalog.current = raw;
      const nowIso = new Date().toISOString();
      localStorage.setItem('liq_catalog', raw);
      localStorage.setItem('liq_catalog_updatedAt', nowIso);
      saveToCloud('liq_state', 'catalog', updated);
      return updated;
    });

    setNewCatalogCod('');
    setNewCatalogRef('');
    setNewCatalogMarca('');
    setNewCatalogUnd(24);
    setNewCatalogPrecio(0);
    setNewCatalogPeso(0);
    setIsAddingProduct(false);
    setCatalogPage(1);
    showToast('success', 'Nuevo producto agregado exitosamente.');
  };

  // --- CLIENT MANAGEMENT ADMIN METHODS ---
  const handleSaveClientEdit = (originalKey: string) => {
    const editKey = editingClientKey;
    if (!editKey) return;

    const parsedName = editClientName.trim();
    const parsedSucursales = editClientSucursales.split(',').map(s => s.trim()).filter(s => s);
    const parsedMarcas = editClientMarcas.split(',').map(s => s.trim()).filter(s => s);

    if (!parsedName) {
      showToast('error', 'El nombre del cliente no puede estar vacío');
      return;
    }

    setClientes(prev => {
      const copy = { ...prev };
      if (parsedName !== originalKey) {
        delete copy[originalKey];
      }
      copy[parsedName] = {
        sucursales: parsedSucursales.length > 0 ? parsedSucursales : ['PRINCIPAL'],
        marcas: parsedMarcas
      };
      const raw = JSON.stringify(copy);
      lastSavedLiqClientes.current = raw;
      const nowIso = new Date().toISOString();
      localStorage.setItem('liq_clientes', raw);
      localStorage.setItem('liq_clientes_updatedAt', nowIso);
      saveToCloud('liq_state', 'clientes', copy);
      return copy;
    });

    if (clienteActual === originalKey && parsedName !== originalKey) {
      setClienteActual(parsedName);
    }

    setEditingClientKey(null);
    showToast('success', 'Información de cliente guardada.');
  };

  const handleDeleteClient = (key: string) => {
    setConfirmState({
      isOpen: true,
      title: 'ELIMINAR CLIENTE',
      message: `¿Estás seguro de eliminar el cliente "${key}" del liquidador?`,
      onConfirm: () => {
        setClientes(prev => {
          const copy = { ...prev };
          delete copy[key];
          const raw = JSON.stringify(copy);
          lastSavedLiqClientes.current = raw;
          const nowIso = new Date().toISOString();
          localStorage.setItem('liq_clientes', raw);
          localStorage.setItem('liq_clientes_updatedAt', nowIso);
          saveToCloud('liq_state', 'clientes', copy);
          return copy;
        });
        if (clienteActual === key) {
          setClienteActual('');
          setSucursalActual('');
        }
        showToast('success', 'Cliente removido.');
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleAddNewClient = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newClientName.trim();
    if (!name) return;

    if (clientes[name]) {
      showToast('error', 'Este cliente ya existe.');
      return;
    }

    setClientes(prev => {
      const updated = {
        ...prev,
        [name]: {
          sucursales: ['PRINCIPAL'],
          marcas: []
        }
      };
      const raw = JSON.stringify(updated);
      lastSavedLiqClientes.current = raw;
      const nowIso = new Date().toISOString();
      localStorage.setItem('liq_clientes', raw);
      localStorage.setItem('liq_clientes_updatedAt', nowIso);
      saveToCloud('liq_state', 'clientes', updated);
      return updated;
    });

    setNewClientName('');
    setIsAddingClient(false);
    showToast('success', 'Nuevo cliente inicializado (configura sus sucursales y marcas).');
  };

  // Pagination for Historial
  const paginatedHistorial = useMemo(() => {
    const start = (historialPage - 1) * historyItemsPerPage;
    return historial.slice(start, start + historyItemsPerPage);
  }, [historial, historialPage]);

  const totalHistoryPages = Math.ceil(historial.length / historyItemsPerPage) || 1;

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Toast Notification HUD */}
      {toastMessage && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-lg border shadow-2xl z-[99999] flex items-center gap-3 animate-fade-in ${
          toastMessage.type === 'success' 
            ? 'bg-hud-green/10 border-hud-green text-hud-green' 
            : 'bg-hud-red/10 border-hud-red text-hud-red'
        }`}>
          {toastMessage.type === 'success' ? <Sparkles className="w-5 h-5 shrink-0 animate-bounce" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
          <span className="text-xs uppercase font-mono font-bold tracking-wider">{toastMessage.text}</span>
        </div>
      )}

      {/* Header Panel */}
      <div className="bg-hud-card border border-hud-border p-6 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden print:hidden glow-border">
        <div>
          <h2 className="text-2xl font-display font-extrabold text-hud-accent tracking-wide uppercase flex items-center gap-2">
            <Sliders className="w-6 h-6 text-hud-accent" />
            Liquidador de Carga de Pedidos
          </h2>
          <p className="text-xs text-slate-400 font-mono mt-1 uppercase tracking-wider">
            Consolidador financiero express de solicitudes de compra y auditoría de cubicaje.
          </p>
        </div>

        {/* Global actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <input 
            type="file" 
            id="global-db-import" 
            accept=".json" 
            className="hidden" 
            onChange={handleUploadDatabaseBackup} 
          />
          <button 
            onClick={() => document.getElementById('global-db-import')?.click()} 
            className="bg-slate-900 border border-hud-border/40 hover:bg-slate-800 text-slate-300 font-mono text-[10px] px-3.5 py-2.5 rounded-lg font-bold tracking-widest transition-all hover:scale-[1.01]"
          >
            📂 CARGAR BASE (.JSON)
          </button>
          
          <button 
            onClick={handleDownloadDatabaseBackup} 
            className="bg-slate-900 border border-hud-border/40 hover:bg-slate-800 text-slate-300 font-mono text-[10px] px-3.5 py-2.5 rounded-lg font-bold tracking-widest transition-all hover:scale-[1.01]"
          >
            💾 RESPALDAR BASE (.JSON)
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs bar */}
      <div className="flex border-b border-hud-border/30 gap-1 print:hidden">
        <button
          onClick={() => setActiveSubTab('liquidacion')}
          className={`px-5 py-3.5 font-mono text-xs font-bold tracking-wider uppercase border-b-2 transition-all flex items-center gap-2 ${
            activeSubTab === 'liquidacion'
              ? 'border-hud-accent text-hud-accent bg-hud-accent/5'
              : 'border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-950/20'
          }`}
        >
          <Sliders className="w-4 h-4" />
          General de Liquidación
        </button>
        
        <button
          onClick={() => setActiveSubTab('catalogo')}
          className={`px-5 py-3.5 font-mono text-xs font-bold tracking-wider uppercase border-b-2 transition-all flex items-center gap-2 ${
            activeSubTab === 'catalogo'
              ? 'border-hud-accent text-hud-accent bg-hud-accent/5'
              : 'border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-950/20'
          }`}
        >
          <Database className="w-4 h-4" />
          Configuración Catálogo
        </button>

        <button
          onClick={() => setActiveSubTab('clientes')}
          className={`px-5 py-3.5 font-mono text-xs font-bold tracking-wider uppercase border-b-2 transition-all flex items-center gap-2 ${
            activeSubTab === 'clientes'
              ? 'border-hud-accent text-hud-accent bg-hud-accent/5'
              : 'border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-950/20'
          }`}
        >
          <Users className="w-4 h-4" />
          Filtro de Clientes
        </button>

        <button
          onClick={() => setActiveSubTab('historial')}
          className={`px-5 py-3.5 font-mono text-xs font-bold tracking-wider uppercase border-b-2 transition-all flex items-center gap-2 ${
            activeSubTab === 'historial'
              ? 'border-hud-accent text-hud-accent bg-hud-accent/5'
              : 'border-transparent text-slate-400 hover:text-slate-100 hover:bg-slate-950/20'
          }`}
        >
          <History className="w-4 h-4" />
          Historial Local
        </button>
      </div>

      {/* SUB-TABS SCREENS */}

      {/* 1. LIQUIDACION TAB */}
      {activeSubTab === 'liquidacion' && (
        <div className="space-y-6">
          {/* Main ERP parameter bar */}
          <div className="bg-hud-card border border-hud-border/70 rounded-xl p-5 space-y-4 print:bg-white print:border-none print:shadow-none print:p-0">
            <h4 className="text-xs font-mono font-bold text-hud-accent tracking-widest uppercase flex items-center gap-2 print:hidden">
              <span className="w-1.5 h-1.5 bg-hud-accent rounded-full pulse-led"></span>
              METADATOS DEL PEDIDO (ERP / DOCUMENTOS)
            </h4>

            {/* Inputs grid */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider">TIPO/BUSCAR CLIENTE</label>
                  {searchClientDropdownQuery && (
                    <button
                      onClick={() => setSearchClientDropdownQuery('')}
                      className="text-[9px] font-mono text-hud-red hover:underline uppercase"
                      title="Limpiar consulta"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Digita para filtrar..."
                  value={searchClientDropdownQuery}
                  onChange={(e) => setSearchClientDropdownQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-hud-border/50 text-slate-200 rounded-lg h-10 px-3 font-mono text-xs focus:border-hud-accent outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider">CLIENTE DIRECTO</label>
                <select
                  value={clienteActual}
                  onChange={(e) => {
                    const c = e.target.value;
                    setClienteActual(c);
                    const clientBranches = clientes[c]?.sucursales || [];
                    if (!sucursalActual || !clientBranches.includes(sucursalActual)) {
                      setSucursalActual(clientBranches[0] || '');
                    }
                  }}
                  className="w-full bg-slate-950 border border-hud-border/50 text-slate-200 rounded-lg h-10 px-3 font-mono text-xs focus:border-hud-accent outline-none font-bold"
                >
                  <option value="">— SELECCIONAR CLIENTE —</option>
                  {Object.keys(clientes)
                    .filter(c => {
                      const q = searchClientDropdownQuery.toLowerCase().trim();
                      if (!q) return true;
                      return c.toLowerCase().includes(q);
                    })
                    .map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider">SUCURSAL / DESTINO</label>
                <select
                  value={sucursalActual}
                  onChange={(e) => {
                    setSucursalActual(e.target.value);
                  }}
                  disabled={!clienteActual}
                  className="w-full bg-slate-950 border border-hud-border/50 text-slate-200 rounded-lg h-10 px-3 font-mono text-xs focus:border-hud-accent outline-none disabled:opacity-40"
                >
                  <option value="">— SELECCIONAR SUCURSAL —</option>
                  {clienteActual && clientes[clienteActual]?.sucursales.map((s: string) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider">NÚMERO PV (PEDIDO DE VENTA)</label>
                <input
                  type="text"
                  placeholder="Ej: PV 2070"
                  value={pvNum}
                  onChange={(e) => setPvNum(e.target.value)}
                  className="w-full bg-slate-950 border border-hud-border/50 text-slate-200 rounded-lg h-10 px-3 font-mono text-xs focus:border-hud-accent outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase font-bold text-slate-400 tracking-wider">CÓDIGO OC (ORDEN DE COMPRA)</label>
                <input
                  type="text"
                  placeholder="Ej: OC-COE-00000081"
                  value={pvOc}
                  onChange={(e) => setPvOc(e.target.value)}
                  className="w-full bg-slate-950 border border-hud-border/50 text-slate-200 rounded-lg h-10 px-3 font-mono text-xs focus:border-hud-accent outline-none"
                />
              </div>
            </div>

            {/* Document parser and manual fill block */}
            <div className="bg-slate-950/60 p-4 border border-slate-900 rounded-lg flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
              <div className="flex items-center gap-3">
                <FileUp className="w-8 h-8 text-hud-accent animate-pulse shrink-0" />
                <div className="space-y-1">
                  <h5 className="text-xs font-mono font-bold text-slate-200 uppercase">MÓDULO LECTOR AUTOMÁTICO DE ARCHIVO PDF</h5>
                  <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                    {isPdfLibLoading ? 'Iniciando parser PDF en segundo plano...' : 'Sube tu PDF del pedido para pre-llenar las cantidades y precios automáticamente.'}
                  </p>
                  {selectedPdfFile && (
                    <div className="flex items-center gap-2 mt-2 bg-hud-accent/10 border border-hud-accent/20 rounded px-2.5 py-1 text-[10px] text-hud-accent font-semibold flex-wrap">
                      <span className="w-1.5 h-1.5 bg-hud-accent rounded-full animate-ping"></span>
                      <span>Archivo seleccionado: <span className="font-bold underline">{selectedPdfFile.name}</span> ({(selectedPdfFile.size / 1024).toFixed(1)} KB)</span>
                      <button 
                        onClick={() => {
                          setSelectedPdfFile(null);
                          setPdfStatus('');
                          if (pdfInputRef.current) pdfInputRef.current.value = '';
                        }}
                        className="text-hud-red hover:text-white font-bold ml-2 underline uppercase text-[9px] cursor-pointer"
                        title="Quitar Archivo"
                      >
                        [ Quitar ]
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:justify-end">
                {pdfStatus && (
                  <span className="text-[10px] font-mono font-bold text-hud-green uppercase px-3.5 py-2.5 rounded-lg border border-hud-green/20 bg-hud-green/5 max-w-xs truncate">
                    {pdfStatus}
                  </span>
                )}

                <input 
                  type="file" 
                  ref={pdfInputRef} 
                  accept=".pdf" 
                  className="hidden" 
                  onChange={handlePdfUpload} 
                />
                
                <button
                  onClick={() => pdfInputRef.current?.click()}
                  className="bg-slate-900 border border-hud-border/40 hover:bg-slate-800 text-slate-200 font-mono font-bold text-[10px] px-4 py-2.5 rounded-lg uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  SELECCIONAR PDF
                </button>

                {selectedPdfFile && (
                  <button
                    onClick={handleExecutePdfLoad}
                    className="bg-hud-green hover:bg-hud-green/90 text-slate-950 font-mono font-extrabold text-[10px] px-4 py-2.5 rounded-lg uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5 animate-pulse"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3px]" />
                    CARGAR PV
                  </button>
                )}

                <button
                  onClick={handlePreFillDemo}
                  className="bg-slate-900 border border-hud-border/40 hover:bg-slate-800 text-hud-accent font-mono text-[10px] px-4 py-2.5 rounded-lg font-bold tracking-widest transition-all cursor-pointer"
                >
                  ⚡ IMPORTAR DEMO (PV 2070)
                </button>
              </div>
            </div>
          </div>

          {/* Quick Metrics display row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-hud-card border border-hud-border/40 rounded-xl p-5 relative overflow-hidden">
              <span className="text-[9px] font-mono font-bold text-hud-accent uppercase tracking-widest block">Suma Total Cajas</span>
              <div className="text-2xl font-display font-black text-slate-100 mt-1">{fmtD(totals.cajas)}</div>
              <span className="text-[9px] font-mono text-slate-500 block uppercase mt-0.5">Unidades de embalaje</span>
              {extractedCajas !== null && (
                <div className="mt-2 text-[10px] font-mono bg-hud-green/10 border border-hud-green/20 text-hud-green px-2 py-1 rounded flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span>En PDF:</span>
                    <span className="font-extrabold">{fmtD(extractedCajas)} Cjs</span>
                  </div>
                  {Math.round(totals.cajas) !== Math.round(extractedCajas) && (
                    <div className="text-amber-400 text-[9px] flex items-center gap-1 mt-0.5 border-t border-hud-border/20 pt-0.5">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Dif: {fmtD(totals.cajas - extractedCajas)} Cjs</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-hud-card border border-hud-border/40 rounded-xl p-5 relative overflow-hidden">
              <span className="text-[9px] font-mono font-bold text-hud-accent uppercase tracking-widest block">Suma Total Unidades</span>
              <div className="text-2xl font-display font-black text-slate-100 mt-1">{fmt(totals.unidades)}</div>
              <span className="text-[9px] font-mono text-slate-500 block uppercase mt-0.5">Piezas comerciales sueltas</span>
            </div>

            <div className="bg-hud-card border border-hud-border/40 rounded-xl p-5 relative overflow-hidden">
              <span className="text-[9px] font-mono font-bold text-hud-accent uppercase tracking-widest block">Peso Bruto Total</span>
              <div className="text-2xl font-display font-black text-slate-100 mt-1">{fmtD(totals.peso)} kg</div>
              <span className="text-[9px] font-mono text-slate-500 block uppercase mt-0.5">Métrica de cubicaje de transporte</span>
              {extractedPeso !== null && (
                <div className="mt-2 text-[10px] font-mono bg-hud-green/10 border border-hud-green/20 text-hud-green px-2 py-1 rounded flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span>En PDF:</span>
                    <span className="font-extrabold">{fmtD(extractedPeso)} kg</span>
                  </div>
                  {Math.abs(totals.peso - extractedPeso) > 0.5 && (
                    <div className="text-amber-400 text-[9px] flex items-center gap-1 mt-0.5 border-t border-hud-border/20 pt-0.5">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Dif: {fmtD(totals.peso - extractedPeso)} kg</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-hud-card border border-hud-border/40 rounded-xl p-5 relative overflow-hidden border-b-2 border-b-hud-green">
              <span className="text-[9px] font-mono font-bold text-hud-green uppercase tracking-widest block">Subtotal sin IVA</span>
              <div className="text-2xl font-display font-black text-hud-green mt-1">${fmt(totals.subtotal)}</div>
              <span className="text-[9px] font-mono text-slate-500 block uppercase mt-0.5">Suma valor comercial COP</span>
            </div>
          </div>

          {/* User Operation Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 print:hidden">
            <button
              onClick={handleSavePV}
              disabled={totals.cajas === 0}
              className="bg-hud-green hover:bg-hud-green/90 disabled:opacity-45 text-slate-950 font-mono font-bold text-xs px-5 py-3 rounded-lg flex items-center gap-2 transition-all tracking-wider uppercase font-extrabold cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Guardar en Historial
            </button>

            <button
              onClick={() => {
                // Download summary JSON
                const resumen = {
                  cliente: clienteActual,
                  sucursal: sucursalActual,
                  fecha: pvFecha,
                  totalCajas: totals.cajas,
                  totalUnds: totals.unidades,
                  totalPeso: totals.peso,
                  totalSubtotal: totals.subtotal,
                  items: Object.entries(pedido).map(([cod, cajasVal]) => {
                    const cajas = Number(cajasVal) || 0;
                    const p = getProductForCode(cod);
                    const undFactor = Number(p?.und) || 24;
                    const pesoFactor = Number(p?.peso) || 0;
                    const units = cajas * undFactor;
                    const price = preciosPV[cod] !== undefined ? Number(preciosPV[cod]) : Number(p?.precio || 0);
                    return {
                      cod,
                      cajas,
                      unidades: units,
                      precio: price,
                      subtotal: units * price,
                      peso: cajas * pesoFactor
                    };
                  })
                };
                const blob = new Blob([JSON.stringify(resumen, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Resumen_PV_Liquidado_${clienteActual}_${pvNum || 'SinNumero'}.json`;
                a.click();
              }}
              disabled={totals.cajas === 0}
              className="bg-slate-900 border border-hud-border/30 text-slate-200 hover:bg-slate-800 disabled:opacity-45 font-mono font-bold text-xs px-5 py-3 rounded-lg flex items-center gap-2 transition-all tracking-wider uppercase cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Descargar Resumen (.json)
            </button>

            <button
              onClick={handlePrintView}
              className="bg-slate-900 border border-hud-border/30 text-slate-200 hover:bg-slate-800 font-mono font-bold text-xs px-5 py-3 rounded-lg flex items-center gap-2 transition-all tracking-wider uppercase cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Imprimir Liquidación
            </button>

            <button
              onClick={handleClearBilling}
              className="bg-slate-950 border border-hud-red/30 text-hud-red hover:bg-hud-red/10 font-mono font-bold text-xs px-5 py-3 rounded-lg flex items-center gap-2 transition-all tracking-wider uppercase ml-auto cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Limpiar Todo
            </button>
          </div>

          {/* Spreadsheet order items grid */}
          <div className="bg-hud-card border border-hud-border rounded-xl spill-hidden">
            {/* Table Header block */}
            <div className="p-4 border-b border-hud-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/60 print:bg-slate-200 print:text-black">
              <div>
                <h4 className="text-xs font-mono font-bold text-[#00ffa3] uppercase print:text-black print:text-sm">
                  REPORTE DE REFERENCIAS CORRESPONDIENTES A MARCAS AUTORIZADAS
                </h4>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase print:hidden">
                  Mostrando catálogo filtrado por marcas contratadas de {clienteActual || 'sin cliente'}.
                </p>
              </div>

              {/* Show only filled elements filter toggle */}
              <div className="flex items-center gap-2 shrink-0 print:hidden">
                <label className="text-xs font-mono font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={verSoloPV}
                    onChange={(e) => setVerSoloPV(e.target.checked)}
                    className="w-4 h-4 bg-slate-950 border border-hud-border rounded cursor-pointer accent-hud-accent"
                  />
                  <Filter className="w-3.5 h-3.5" />
                  VER SOLO REPORTADAS EN PV
                </label>
              </div>
            </div>

            {/* Main Interactive Table Grid */}
            <div className="overflow-x-auto">
              {!clienteActual || !sucursalActual ? (
                <div className="p-16 text-center text-slate-500 font-mono border border-transparent rounded-lg">
                  <AlertTriangle className="w-8 h-8 text-hud-orange animate-bounce mx-auto mb-3" />
                  SELECCIONA UN CLIENTE DIRECTO Y SU SUCURSAL DESTINO PARA DESBLOQUEAR EL INGRESO DE REPORTES
                </div>
              ) : filteredProductsByCliente.length === 0 ? (
                <div className="p-16 text-center text-slate-500 font-mono border border-transparent rounded-lg">
                  No hay marcas ni productos registrados en el catálogo de marcas para este cliente. Configúralos en las pestañas administrativas.
                </div>
              ) : (
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950/90 text-slate-400 border-b border-hud-border/40 print:bg-slate-100 print:text-black">
                      <th className="p-3 font-semibold uppercase text-[10px]">CÓDIGO</th>
                      <th className="p-3 font-semibold uppercase text-[10px]">DESCRIPCIÓN COMERCIAL</th>
                      <th className="p-3 font-semibold uppercase text-[10px] text-center">EMBALAJE (UND/CAJA)</th>
                      <th className="p-3 font-semibold uppercase text-[10px] text-right">PRECIO UNITARIO</th>
                      <th className="p-3 font-semibold uppercase text-[10px] text-center w-28">CAJAS</th>
                      <th className="p-3 font-semibold uppercase text-[10px] text-center w-28">UNIDADES</th>
                      <th className="p-3 font-semibold uppercase text-[10px] text-right">PESO (KG)</th>
                      <th className="p-3 font-semibold uppercase text-[10px] text-right">SUBTOTAL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hud-border/20 print:text-black">
                    {Object.keys(groupedProductsByCode).map(cod => {
                      const products = groupedProductsByCode[cod];
                      const cajas = pedido[cod] || 0;
                      
                      // Filter if "Only PV items" checkbox is active
                      if (verSoloPV && cajas <= 0) return null;

                      // Retrieve currently active selection for duplicates mapping
                      const p = getProductForCode(cod) || products[0];
                      const undFactor = parseNum(p.und) || 1;
                      const pesoFactor = parseNum(p.peso);

                      const unds = cajas * undFactor;
                      const finalWeight = cajas * pesoFactor;
                      const finalPrecio = preciosPV[cod] !== undefined ? parseNum(preciosPV[cod]) : parseNum(p.precio);
                      const subtotal = unds * finalPrecio;
                      const isFractional = cajas > 0 && Math.abs(cajas - Math.round(cajas)) > 0.001;

                      return (
                        <tr key={cod} className={`hover:bg-slate-900/10 transition-colors ${cajas > 0 ? 'bg-hud-accent/5' : ''} print:hover:bg-transparent`}>
                          <td className="p-3 font-bold text-slate-400">{cod}</td>
                          <td className="p-3">
                            <div className="space-y-1">
                              {products.length === 1 ? (
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-100 font-bold font-sans print:text-black">{p.ref}</span>
                                  <span className="text-[9px] bg-slate-900 border border-hud-border/40 text-hud-accent px-1.5 py-0.5 rounded font-bold uppercase">{p.marca}</span>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1 w-full max-w-md print:hidden">
                                  <span className="text-[10px] text-[#e67e22] font-mono font-bold uppercase flex items-center gap-1">
                                    ⚠️ DUPLICADO - REFS DISPONIBLES:
                                  </span>
                                  <select
                                    value={p.catalogIndex ?? p.originalIndex}
                                    onChange={(e) => {
                                      const idx = parseInt(e.target.value, 10);
                                      setSelectedProductIndex(prev => ({ ...prev, [cod]: idx }));
                                    }}
                                    className="h-8 bg-slate-950 border border-[#e67e22]/50 text-slate-200 rounded px-2 text-xs focus:border-[#e67e22] outline-none"
                                  >
                                    {products.map(prod => (
                                      <option key={prod.originalIndex} value={prod.originalIndex}>
                                        {prod.ref} ({prod.marca}) — {prod.und}U — ${fmt(prod.precio)} — {prod.peso}kg
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}

                              {isFractional && (
                                <span className="inline-flex items-center gap-1 text-[9px] bg-hud-orange/10 border border-hud-orange/30 text-hud-orange px-2 py-0.5 rounded font-black font-sans uppercase">
                                  ⚠️ Cajas Incompletas (Fracción)
                                </span>
                              )}
                            </div>
                            
                            {/* Static print representation of duplicates selection */}
                            <div className="hidden print:block font-bold">
                              {p.ref} <span className="text-[9px] border border-black p-0.5">({p.marca})</span>
                            </div>
                          </td>
                          <td className="p-3 text-center font-bold text-slate-300">{p.und}</td>
                          <td className="p-3 text-right font-bold text-slate-300">${fmt(finalPrecio)}</td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0"
                              value={cajas > 0 ? Number(cajas.toFixed(2)) : ''}
                              onChange={(e) => handleUpdateProductQty(cod, e.target.value, 'cajas')}
                              className="w-full bg-slate-950/80 border border-hud-border/40 text-slate-100 placeholder-slate-700 h-8 rounded text-center focus:border-hud-accent outline-none print:border-none print:bg-transparent"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              placeholder="0"
                              value={unds > 0 ? Number(unds.toFixed(2)) : ''}
                              onChange={(e) => handleUpdateProductQty(cod, e.target.value, 'unidades')}
                              className="w-full bg-slate-950/40 border border-hud-accent/25 text-slate-400 placeholder-slate-800 h-8 rounded text-center focus:border-hud-accent outline-none print:border-none print:bg-transparent"
                            />
                          </td>
                          <td className="p-3 text-right text-slate-450 font-bold">{finalWeight > 0 ? fmtD(finalWeight) : '-'}</td>
                          <td className="p-3 text-right font-bold text-[#00ffa3]">{subtotal > 0 ? '$' + fmt(subtotal) : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            
            {/* Direct table footer sum row */}
            {totals.cajas > 0 && (
              <div className="p-5 border-t border-hud-border bg-slate-950/45 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs font-mono font-bold">
                <span className="text-slate-400 uppercase">RESUMEN LIQUIDACIÓN EXCLUSIVO:</span>
                <span className="text-[#00ffa3] uppercase space-x-4">
                  <span>CAJAS: {fmtD(totals.cajas)}</span>
                  <span>|</span>
                  <span>UNIDADES: {fmt(totals.unidades)}</span>
                  <span>|</span>
                  <span>PESO: {fmtD(totals.peso)} KG</span>
                  <span>|</span>
                  <span>SUBTOTAL: ${fmt(totals.subtotal)} COP</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. CATALOGO ADMIN TAB */}
      {activeSubTab === 'catalogo' && (
        <div className="bg-hud-card border border-hud-border rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hud-border/20 pb-4">
            <div>
              <h3 className="text-sm font-mono font-bold text-hud-accent uppercase">MANTENIMIENTO INTEGRAL DE CATÁLOGO GENERAL</h3>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                Modifica los códigos, marcas, embalajes, precios unitarios base y factores de peso en kilogramos de toda la compañía.
              </p>
            </div>

            {/* Toggle add product layout button */}
            <button
              onClick={() => setIsAddingProduct(!isAddingProduct)}
              className="bg-hud-accent hover:bg-hud-accent/90 text-slate-950 font-mono font-bold text-[10px] px-4.5 py-2.5 rounded-lg flex items-center gap-1.5 uppercase transition-all tracking-wider ml-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {isAddingProduct ? 'Cancelar Formulario' : 'Nuevo Producto'}
            </button>
          </div>

          {/* New product addition block form */}
          {isAddingProduct && (
            <form onSubmit={handleAddNewCatalogProduct} className="bg-slate-950/70 p-5 rounded-lg border border-hud-accent/20 space-y-4 font-mono text-xs max-w-xl mx-auto">
              <h4 className="text-xs font-mono font-black text-hud-accent uppercase tracking-wider">CREAR NUEVA REFERENCIA DE PRODUCTO</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Descripción o Nombre Comercial de la Referencia</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Citronela Belalcázar Especial 3L"
                    value={newCatalogRef}
                    onChange={(e) => setNewCatalogRef(e.target.value)}
                    className="w-full bg-slate-900 border border-hud-border/40 text-slate-105 rounded px-3 h-9 outline-none focus:border-hud-accent"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">CÓDIGO ÚNICO PLU/SKU</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: 01020120"
                    value={newCatalogCod}
                    onChange={(e) => setNewCatalogCod(e.target.value)}
                    className="w-full bg-slate-900 border border-hud-border/40 text-slate-105 rounded px-3 h-9 outline-none focus:border-hud-accent"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">MARCA COMERCIAL</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Belalcázar"
                    value={newCatalogMarca}
                    onChange={(e) => setNewCatalogMarca(e.target.value)}
                    className="w-full bg-slate-900 border border-hud-border/40 text-slate-105 rounded px-3 h-9 outline-none focus:border-hud-accent"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">UND / EMBALAJE CAJA</label>
                  <input
                    type="number"
                    min="1"
                    value={newCatalogUnd}
                    onChange={(e) => setNewCatalogUnd(parseInt(e.target.value) || 24)}
                    className="w-full bg-slate-900 border border-hud-border/40 text-slate-150 rounded px-3 h-9 outline-none focus:border-hud-accent"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">PRECIO UNITARIO SIN IVA</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newCatalogPrecio}
                    onChange={(e) => setNewCatalogPrecio(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-hud-border/40 text-slate-150 rounded px-3 h-9 outline-none focus:border-hud-accent"
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">PESO POR CAJA (KILOGRAMOS BRUTOS)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newCatalogPeso}
                    onChange={(e) => setNewCatalogPeso(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-hud-border/40 text-slate-150 rounded px-3 h-9 outline-none focus:border-hud-accent"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-hud-green hover:bg-hud-green/90 text-slate-950 font-bold px-4 py-2.5 rounded text-[10px] tracking-widest uppercase cursor-pointer"
                >
                  Agregar Referencia
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingProduct(false)}
                  className="bg-slate-900 hover:bg-slate-800 border border-hud-border/30 text-slate-200 font-bold px-4 py-2.5 rounded text-[10px] tracking-widest uppercase cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {/* Filtering bar in admin Catalogue with Items per page selector */}
          <div className="flex flex-col md:flex-row items-center gap-3 bg-slate-950/45 p-3.5 border border-slate-900 rounded-lg">
            <div className="flex items-center gap-2 flex-1 w-full">
              <Search className="w-4 h-4 text-hud-accent" />
              <input
                type="text"
                placeholder="Buscar por código SKU, descripción comercial o marca registrada..."
                value={searchCatalogQuery}
                onChange={(e) => {
                  setSearchCatalogQuery(e.target.value);
                  setCatalogPage(1);
                }}
                className="flex-1 bg-transparent text-slate-200 text-xs font-mono outline-none placeholder-slate-600"
              />
            </div>
            
            <div className="flex items-center gap-2 text-slate-400 text-xs font-mono shrink-0 w-full md:w-auto justify-end border-t md:border-t-0 border-slate-900 pt-2 md:pt-0">
              <span className="text-slate-400">Mostrar por página:</span>
              <select
                value={catalogItemsPerPage}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCatalogItemsPerPage(val);
                  setCatalogPage(1);
                  try {
                    localStorage.setItem('liq_catalog_items_per_page', String(val));
                  } catch (err) {
                    console.error(err);
                  }
                }}
                className="bg-slate-900 border border-hud-border/40 text-slate-200 text-xs font-mono rounded h-8 px-2 outline-none focus:border-hud-accent cursor-pointer"
              >
                <option value={5}>5 ítems</option>
                <option value={7}>7 ítems</option>
                <option value={10}>10 ítems</option>
                <option value={12}>12 ítems</option>
                <option value={15}>15 ítems</option>
                <option value={20}>20 ítems</option>
                <option value={50}>50 ítems</option>
                <option value={100}>100 ítems</option>
                <option value={999999}>Todos</option>
              </select>
            </div>
          </div>

          {/* Table display */}
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 border-b border-hud-border/30">
                  <th className="p-3 col-cod">CÓDIGO PLU/SKU</th>
                  <th className="p-3">REFERENCIA NOMBRE COMERCIAL</th>
                  <th className="p-3">MARCA</th>
                  <th className="p-3 text-center">EMBALAJE INDS</th>
                  <th className="p-2.5 text-right">PRECIO BASE SIN IVA</th>
                  <th className="p-2.5 text-right">PESO KG</th>
                  <th className="p-3 text-center w-28">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hud-border/10">
                {paginatedCatalogForAdmin.map((p, idx) => {
                  const isEditing = editingCatalogIdx === idx;
                  return (
                    <tr key={`${p.cod}-${p.ref}-${idx}`} className="hover:bg-slate-910/20 transition-colors">
                      <td className="p-3 font-semibold text-slate-400">
                        {isEditing ? (
                          <input
                            type="text"
                            id={`edit-cod-${idx}`}
                            className="bg-slate-950 border border-hud-border text-slate-200 text-xs h-7 px-2 w-28 font-mono rounded"
                            defaultValue={p.cod}
                          />
                        ) : (
                          p.cod
                        )}
                      </td>
                      <td className="p-3 font-bold text-slate-200 font-sans">
                        {isEditing ? (
                          <input
                            type="text"
                            id={`edit-ref-${idx}`}
                            className="bg-slate-950 border border-hud-border text-slate-250 text-xs h-7 px-2 w-full font-mono rounded"
                            defaultValue={p.ref}
                          />
                        ) : (
                          p.ref
                        )}
                      </td>
                      <td className="p-3 text-slate-300">
                        {isEditing ? (
                          <input
                            type="text"
                            id={`edit-marca-${idx}`}
                            className="bg-slate-950 border border-hud-border text-slate-200 text-xs h-7 px-2 w-28 font-mono rounded"
                            defaultValue={p.marca}
                          />
                        ) : (
                          p.marca
                        )}
                      </td>
                      <td className="p-3 text-center text-slate-350">
                        {isEditing ? (
                          <input
                            type="number"
                            id={`edit-und-${idx}`}
                            className="bg-slate-950 border border-hud-border text-slate-200 text-xs h-7 px-2 w-16 text-center font-mono rounded"
                            defaultValue={p.und}
                          />
                        ) : (
                          p.und
                        )}
                      </td>
                      <td className="p-2.5 text-right font-bold text-hud-green">
                        {isEditing ? (
                          <input
                            type="number"
                            id={`edit-precio-${idx}`}
                            step="0.01"
                            className="bg-slate-950 border border-hud-border text-slate-200 text-xs h-7 px-2 w-24 text-right font-mono rounded"
                            defaultValue={p.precio}
                          />
                        ) : (
                          `$${fmt(p.precio)}`
                        )}
                      </td>
                      <td className="p-2.5 text-right text-slate-400">
                        {isEditing ? (
                          <input
                            type="number"
                            id={`edit-peso-${idx}`}
                            step="0.01"
                            className="bg-slate-950 border border-hud-border text-slate-200 text-xs h-7 px-2 w-20 text-right font-mono rounded"
                            defaultValue={p.peso}
                          />
                        ) : (
                          p.peso
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 justify-center">
                            <button
                              onClick={() => handleSaveCatalogEdit(idx)}
                              className="bg-hud-green border border-hud-green/40 hover:bg-hud-green/80 text-slate-950 rounded p-1"
                              title="Guardar Cambios"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingCatalogIdx(null)}
                              className="bg-slate-900 border border-hud-border/20 text-slate-400 rounded p-1 hover:text-slate-100"
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 justify-center">
                            <button
                              onClick={() => setEditingCatalogIdx(idx)}
                              className="bg-slate-900 border border-hud-border/20 text-hud-accent rounded p-1 hover:bg-hud-accent/10"
                              title="Editar Inline"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteCatalogProduct(p.cod, p.ref)}
                              className="bg-slate-900 border border-hud-border/20 text-hud-red rounded p-1 hover:bg-hud-red/10"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {paginatedCatalogForAdmin.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 font-mono">
                      No se encontraron resultados de productos en el catálogo para tu búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Catalog Pagination navigation */}
          {filteredCatalogForAdmin.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-hud-border/20 pt-4 font-mono text-xs">
              <span className="text-slate-400">
                Mostrando {paginatedCatalogForAdmin.length} items de {filteredCatalogForAdmin.length} totales registrados
              </span>
              {totalCatalogPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    disabled={catalogPage === 1}
                    onClick={() => setCatalogPage(prev => Math.max(1, prev - 1))}
                    className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-200 px-3 py-1.5 h-8 font-bold border border-hud-border/40 rounded transition-all cursor-pointer"
                  >
                    ATRÁS
                  </button>
                  <span className="text-slate-300 font-bold bg-[#040814] h-8 px-4 flex items-center rounded border border-hud-border/20">
                    PÁGINA {catalogPage} / {totalCatalogPages}
                  </span>
                  <button
                    disabled={catalogPage === totalCatalogPages}
                    onClick={() => setCatalogPage(prev => Math.min(totalCatalogPages, prev + 1))}
                    className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-200 px-3 py-1.5 h-8 font-bold border border-hud-border/40 rounded transition-all cursor-pointer"
                  >
                    SIGUIENTE
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. CLIENT MANAGEMENT TAB */}
      {activeSubTab === 'clientes' && (
        <div className="bg-hud-card border border-hud-border rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hud-border/20 pb-4">
            <div>
              <h3 className="text-sm font-mono font-bold text-hud-accent uppercase">MÓDULO DE CLIENTES, MARCAS Y SU_CURSALES</h3>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                Modifica y filtra qué marcas (catálogos de producto) y cuáles sucursales son válidas para facturar a cada empresa cliente.
              </p>
            </div>

            <button
              onClick={() => setIsAddingClient(!isAddingClient)}
              className="bg-hud-accent hover:bg-hud-accent/90 text-slate-950 font-mono font-bold text-[10px] px-4.5 py-2.5 rounded-lg flex items-center gap-1.5 uppercase transition-all tracking-wider ml-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {isAddingClient ? 'Cancelar' : 'Nuevo Cliente'}
            </button>
          </div>

          {/* New Customer Form */}
          {isAddingClient && (
            <form onSubmit={handleAddNewClient} className="bg-slate-950/70 p-5 rounded-lg border border-hud-accent/20 space-y-4 font-mono text-xs max-w-sm mx-auto">
              <h4 className="text-xs font-mono font-black text-hud-accent uppercase tracking-wider">CREAR NUEVA ENTIDAD CLIENTE</h4>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Nombre Completo del Cliente/Empresa</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: SUPERMERCADOS BELALCÁZAR LIMITADA"
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  className="w-full bg-slate-900 border border-hud-border/40 text-slate-105 rounded px-3 h-9 outline-none focus:border-hud-accent"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-hud-green hover:bg-hud-green/90 text-slate-950 font-bold px-4 py-2.5 rounded text-[10px] tracking-widest uppercase cursor-pointer"
                >
                  Agregar Cliente
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingClient(false)}
                  className="bg-slate-900 hover:bg-slate-800 border border-hud-border/30 text-slate-205 font-bold px-4 py-2.5 rounded text-[10px] tracking-widest uppercase cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {/* Filtering bar in admin Clientes */}
          <div className="flex items-center gap-3 bg-slate-950/45 p-3.5 border border-slate-900 rounded-lg">
            <Search className="w-4 h-4 text-hud-accent" />
            <input
              type="text"
              placeholder="Buscar cliente por nombre, marca registrada o sucursal..."
              value={searchClientQuery}
              onChange={(e) => setSearchClientQuery(e.target.value)}
              className="flex-1 bg-transparent text-slate-200 text-xs font-mono outline-none placeholder-slate-600"
            />
          </div>

          {/* Database display inside clients */}
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400">
                  <th style={{ width: '260px' }}>Cliente</th>
                  <th>Sucursales (separadas por coma)</th>
                  <th>Marcas Propias (separadas por coma)</th>
                  <th className="text-center w-[120px]">Operaciones</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(clientes)
                  .filter(([key, itemVal]) => {
                    const q = searchClientQuery.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    if (!q) return true;
                    const item = itemVal as any;
                    const nameMatch = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(q);
                    const sucursalMatch = item.sucursales?.some((s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(q));
                    const marcaMatch = item.marcas?.some((m: string) => m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(q));
                    return nameMatch || sucursalMatch || marcaMatch;
                  })
                  .map(([key, itemVal], idxInLoop) => {
                    const item = itemVal as any;
                    const isEditing = editingClientKey === key;
                  return (
                    <tr key={key} className="hover:bg-slate-910/20 border-b border-hud-border/10">
                      <td className="p-3 font-semibold text-hud-accent font-sans">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editClientName}
                            onChange={(e) => setEditClientName(e.target.value)}
                            className="bg-slate-950 border border-hud-border text-slate-250 text-xs h-8 px-2 w-full font-mono rounded"
                          />
                        ) : (
                          key
                        )}
                      </td>
                      <td className="p-3 text-slate-300">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editClientSucursales}
                            onChange={(e) => setEditClientSucursales(e.target.value)}
                            placeholder="SUCURSAL A, SUCURSAL B"
                            className="bg-slate-950 border border-hud-border text-slate-200 text-xs h-8 px-2 w-full font-mono rounded"
                          />
                        ) : (
                          item.sucursales?.join(', ') || 'N/A'
                        )}
                      </td>
                      <td className="p-3 text-slate-350">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editClientMarcas}
                            onChange={(e) => setEditClientMarcas(e.target.value)}
                            placeholder="Marca A, Marca B"
                            className="bg-slate-950 border border-hud-border text-slate-200 text-xs h-8 px-2 w-full font-mono rounded"
                          />
                        ) : (
                          item.marcas?.length > 0 ? item.marcas.join(', ') : 'Ninguna (Ve todos los productos)'
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center gap-1.5 justify-center">
                          {isEditing ? (
                            <>
                              <button 
                                onClick={() => handleSaveClientEdit(key)} 
                                className="bg-hud-green border border-hud-green/40 hover:bg-hud-green/80 text-slate-950 rounded p-1"
                                title="Guardar Cambios"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => setEditingClientKey(null)} 
                                className="bg-slate-900 border border-hud-border/20 text-slate-400 rounded p-1 hover:text-slate-100"
                                title="Cancelar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button 
                                onClick={() => {
                                  setEditingClientKey(key);
                                  setEditClientName(key);
                                  setEditClientSucursales(item.sucursales?.join(', ') || '');
                                  setEditClientMarcas(item.marcas?.join(', ') || '');
                                }} 
                                className="bg-slate-900 border border-hud-border/20 text-hud-accent rounded p-1 hover:bg-hud-accent/10"
                                title="Editar"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteClient(key)} 
                                className="bg-slate-900 border border-hud-border/20 text-hud-red rounded p-1 hover:bg-hud-red/10"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. HISTORIAL SUB-TAB */}
      {activeSubTab === 'historial' && (
        <div className="bg-hud-card border border-hud-border rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-mono font-bold text-hud-accent uppercase">HISTORIAL DE LIQUIDACIONES LOCALES GUARDADAS</h3>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              Consultar, cargar para re-auditar, descargar reportes comerciales específicos o eliminar registros archivados en este equipo.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950/80 text-slate-400 border-b border-hud-border/30">
                  <th className="p-3">FECHA/REGISTRO</th>
                  <th className="p-3">NÚM PV</th>
                  <th className="p-3">CLIENTE DIRECTO</th>
                  <th className="p-3">SUCURSAL</th>
                  <th className="p-3 text-right">VALOR COMERCIAL</th>
                  <th className="p-3 text-center w-36">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hud-border/10">
                {paginatedHistorial.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-910/20 transition-colors">
                    <td className="p-3 text-slate-400 font-bold">{item.timestamp}</td>
                    <td className="p-3 text-slate-100 font-black">{item.numPV}</td>
                    <td className="p-3 text-slate-350 font-sans">{item.cliente}</td>
                    <td className="p-3 text-slate-400">{item.sucursal}</td>
                    <td className="p-3 text-right font-bold text-hud-green">${fmt(item.subtotal || 0)}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center gap-1.5 justify-center">
                        <button
                          onClick={() => handleLoadPVFromHistory(item)}
                          className="bg-hud-accent hover:bg-hud-accent/90 text-slate-950 font-bold px-2.5 py-1 rounded text-[10px] uppercase tracking-wider"
                        >
                          Cargar
                        </button>
                        <button
                          onClick={() => handleDeletePVFromHistory(item.id)}
                          className="bg-slate-900 border border-hud-border/20 hover:border-hud-red/40 text-hud-red p-1 rounded"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {historial.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 font-mono">
                      No hay liquidaciones de PV archivadas en el historial local de este navegador.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Historial pagination */}
          {totalHistoryPages > 1 && (
            <div className="flex items-center justify-between border-t border-hud-border/20 pt-4 font-mono text-xs">
              <span className="text-slate-550">
                Mostrando {paginatedHistorial.length} de {historial.length} registros guardados
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={historialPage === 1}
                  onClick={() => setHistorialPage(prev => Math.max(1, prev - 1))}
                  className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-200 px-3 py-1.5 h-8 font-bold border border-hud-border/40 rounded transition-all cursor-pointer"
                >
                  ATRÁS
                </button>
                <span className="text-slate-300 font-bold bg-[#040814] h-8 px-4 flex items-center rounded border border-hud-border/20">
                  PÁGINA {historialPage} / {totalHistoryPages}
                </span>
                <button
                  disabled={historialPage === totalHistoryPages}
                  onClick={() => setHistorialPage(prev => Math.min(totalHistoryPages, prev + 1))}
                  className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-200 px-3 py-1.5 h-8 font-bold border border-hud-border/40 rounded transition-all cursor-pointer"
                >
                  SIGUIENTE
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== CUSTOM CONFIRMATION DIALOG MODAL ===================== */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b1329] border border-red-500/30 rounded-xl w-full max-w-sm overflow-hidden animate-fade-in shadow-2xl">
            <div className="bg-slate-950 p-4 border-b border-red-500/20 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
              <h3 className="font-display font-extrabold text-red-500 text-xs uppercase tracking-widest leading-none">
                {confirmState.title}
              </h3>
            </div>
            <div className="p-5 space-y-4 font-mono">
              <p className="text-slate-300 text-xs leading-relaxed">
                {confirmState.message}
              </p>
              <div className="flex justify-end gap-2.5 pt-2">
                <button 
                  type="button"
                  onClick={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
                  className="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 px-4 py-2 rounded text-[11px] font-bold uppercase transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={confirmState.onConfirm}
                  className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded text-[11px] font-bold uppercase tracking-widest transition-all"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ===================== PORTAL DE IMPRESIÓN COMPACTO (TIPO FACTURA CONTABLE) ===================== */}
      {createPortal(
        <div id="printLiquidador" className="hidden print:block bg-white text-black p-2 font-sans">
          {/* Cabecera */}
          <div className="text-center pb-1.5 mb-2 border-b-2 border-black">
            <div className="text-base font-extrabold tracking-wide uppercase">SISTEMALOG SAS</div>
            <div className="text-[9px] text-gray-500 font-mono">NIT: 900.567.892-1 / Control y Liquidación de Operaciones</div>
            <div className="text-[10px] font-bold uppercase mt-1 bg-slate-100 py-0.5 px-2 border border-black inline-block tracking-widest">
              VALORACIÓN DE CARGA / LIQUIDACIÓN COMERCIAL
            </div>
          </div>

          {/* Información de Metadatos */}
          <table className="w-full border-collapse border-2 border-black mb-2 text-[9px]">
            <tbody>
              <tr>
                <td className="p-1 border border-black font-bold bg-gray-100 w-[15%]">Cliente:</td>
                <td className="p-1 border border-black uppercase w-[35%] font-bold">{clienteActual || 'N/A'}</td>
                <td className="p-1 border border-black font-bold bg-gray-100 w-[15%]">Sucursal / Destino:</td>
                <td className="p-1 border border-black uppercase w-[35%] font-bold">{sucursalActual || 'N/A'}</td>
              </tr>
              <tr>
                <td className="p-1 border border-black font-bold bg-gray-100">Planilla PV No.:</td>
                <td className="p-1 border border-black font-mono">{pvNum || 'S/N'}</td>
                <td className="p-1 border border-black font-bold bg-gray-100">Fecha Operación:</td>
                <td className="p-1 border border-black font-mono">{pvFecha || '-'}</td>
              </tr>
              {pvOc && (
                <tr>
                  <td className="p-1 border border-black font-bold bg-gray-100">Orden Compra (O.C):</td>
                  <td className="p-1 border border-black font-mono" colSpan={3}>{pvOc}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Tabla de Productos Compacta (Tipo Factura) */}
          <table className="w-full border-collapse border-2 border-black text-[9px]">
            <thead>
              <tr className="bg-gray-200">
                <th className="border border-black p-0.5 text-center font-bold font-mono w-[2.5%]">#</th>
                <th className="border border-black p-0.5 text-center font-bold font-mono w-[9.5%]">Código</th>
                <th className="border border-black p-0.5 text-left font-bold font-sans">Descripción</th>
                <th className="border border-black p-0.5 text-center font-bold font-mono w-[7.5%]">Cajas</th>
                <th className="border border-black p-0.5 text-center font-bold font-mono w-[8%]">Cant</th>
                <th className="border border-black p-0.5 text-right font-bold font-mono w-[10%]">Vr. Unitario</th>
                <th className="border border-black p-0.5 text-center font-bold font-mono w-[5.5%]">% Imp</th>
                <th className="border border-black p-0.5 text-right font-bold font-mono w-[9.5%]">Vr. Imp</th>
                <th className="border border-black p-0.5 text-right font-bold font-mono w-[10.5%]">Vr. Bruto</th>
                <th className="border border-black p-0.5 text-center font-bold font-mono w-[4.5%]">% Desc</th>
                <th className="border border-black p-0.5 text-right font-bold font-mono w-[6%]">Vr. Desc</th>
                <th className="border border-black p-0.5 text-right font-bold font-mono w-[10.5%]">Vr. Total</th>
              </tr>
            </thead>
            <tbody>
              {itemsToPrint.map((item, idx) => {
                const vrImp = item.subtotal * 0.19;
                const vrBruto = item.subtotal;
                const vrTotal = item.subtotal;

                return (
                  <tr key={item.cod} className="leading-none">
                    <td className="border border-black p-0.5 text-center font-mono text-[8px]">{idx + 1}</td>
                    <td className="border border-black p-0.5 text-center font-mono font-bold text-[8.5px]">{item.cod}</td>
                    <td className="border border-black p-0.5 uppercase font-sans font-medium text-[8px] leading-tight">
                      {item.ref} <span className="text-[7.5px] font-bold text-gray-600">({item.marca})</span>
                    </td>
                    <td className="border border-black p-0.5 text-center font-mono font-bold text-[8.5px]">
                      {item.cajas % 1 !== 0 ? fmtD(item.cajas) : `${fmt(item.cajas)}.00`}
                    </td>
                    <td className="border border-black p-0.5 text-center font-mono font-bold text-[8.5px]">
                      {fmt(item.unidades)}.00
                    </td>
                    <td className="border border-black p-0.5 text-right font-mono text-[8px]">
                      ${fmt(item.precio)}
                    </td>
                    <td className="border border-black p-0.5 text-center font-mono text-[8px]">
                      19.00%
                    </td>
                    <td className="border border-black p-0.5 text-right font-mono text-gray-700 text-[8px]">
                      ${fmt(vrImp)}
                    </td>
                    <td className="border border-black p-0.5 text-right font-mono font-semibold text-[8px]">
                      ${fmt(vrBruto)}
                    </td>
                    <td className="border border-black p-0.5 text-center font-mono text-[8px]">
                      -
                    </td>
                    <td className="border border-black p-0.5 text-right font-mono text-[8px]">
                      $0.00
                    </td>
                    <td className="border border-black p-0.5 text-right font-mono font-bold text-[8.5px]">
                      ${fmt(vrTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Resumen Logístico y Financiero */}
          <div className="mt-2 grid grid-cols-2 gap-3">
            {/* Consolidado Logístico */}
            <table className="border-collapse border border-black text-[9px] self-start">
              <thead>
                <tr className="bg-gray-100">
                  <th colSpan={2} className="border border-black p-1 text-left font-bold font-sans uppercase">
                    Consolidado Logístico de Carga
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-black p-1 bg-gray-50 w-1/2">Total de Cajas Programadas:</td>
                  <td className="border border-black p-1 font-bold font-mono text-right">{fmtD(totals.cajas)} Cjs</td>
                </tr>
                {extractedCajas !== null && (
                  <tr className="bg-green-50/40">
                    <td className="border border-black p-1 text-green-800 font-medium">Cajas Totales en PDF:</td>
                    <td className="border border-black p-1 font-bold font-mono text-right text-green-800">{fmtD(extractedCajas)} Cjs</td>
                  </tr>
                )}
                <tr>
                  <td className="border border-black p-1 bg-gray-50">Total de Unidades Netas:</td>
                  <td className="border border-black p-1 font-bold font-mono text-right">{fmt(totals.unidades)} Unds</td>
                </tr>
                <tr>
                  <td className="border border-black p-1 bg-gray-50 font-semibold">Peso Bruto Estimado:</td>
                  <td className="border border-black p-1 font-bold font-mono text-right text-indigo-900">{fmtD(totals.peso)} KG</td>
                </tr>
                {extractedPeso !== null && (
                  <tr className="bg-green-50/40">
                    <td className="border border-black p-1 text-green-800 font-medium">Peso Total en PDF:</td>
                    <td className="border border-black p-1 font-bold font-mono text-right text-green-800">{fmtD(extractedPeso)} KG</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Resumen Financiero */}
            <table className="border-collapse border border-black text-[9px]">
              <thead>
                <tr className="bg-gray-100">
                  <th colSpan={2} className="border border-black p-1 text-right font-bold font-sans uppercase">
                    Resumen Financiero (COP)
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-black p-1 bg-gray-50 w-1/2 text-right">Valor Bruto Subtotal:</td>
                  <td className="border border-black p-1 font-bold font-mono text-right">${fmt(totals.subtotal)}</td>
                </tr>
                <tr>
                  <td className="border border-black p-1 bg-gray-50 text-right">Total IVA Colectado (19%):</td>
                  <td className="border border-black p-1 font-bold font-mono text-right text-gray-700">${fmt(totals.subtotal * 0.19)}</td>
                </tr>
                <tr>
                  <td className="border border-black p-1 bg-gray-50 text-right">Descuentos Aplicados (0%):</td>
                  <td className="border border-black p-1 font-bold font-mono text-right">$0.00</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="border border-black p-1 font-bold text-right text-xs">VALOR TOTAL NETO:</td>
                  <td className="border border-black p-1 font-black font-mono text-right text-xs text-blue-900">${fmt(totals.subtotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Bloque de Firmas */}
          <div className="mt-6 grid grid-cols-2 gap-8 text-center text-[8.5px] font-sans">
            <div className="border-t border-black pt-1">
              <div className="font-bold uppercase">ELABORÓ / LIQUIDADOR DE CARGA</div>
              <div className="text-gray-500 mt-0.5">SISTEMALOG SAS - Operaciones</div>
            </div>
            <div className="border-t border-black pt-1">
              <div className="font-bold uppercase">RECIBIDO / DESPACHOS Y BODEGA</div>
              <div className="text-gray-500 mt-0.5">Control de Inventarios y Logística</div>
            </div>
          </div>

          <div className="text-center text-[7.5px] text-gray-500 mt-4 pt-1.5 border-t border-gray-200">
            Este reporte es una valoración oficial interna de SISTEMALOG SAS. Todos los valores están sujetos a auditoría de facturación.
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
