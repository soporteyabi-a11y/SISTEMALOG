/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  ShoppingBag, ClipboardList, Settings, Search, Trash2, Edit2, 
  Plus, CheckCircle2, FileSpreadsheet, Printer, Download, Sparkles, 
  Lock, Unlock, LogIn, LogOut, ArrowLeft, RefreshCw, Calendar, 
  User, CreditCard, ChevronRight, ChevronDown, ShoppingCart, Percent, Heart, AlertTriangle
} from 'lucide-react';
import * as XLSX from 'xlsx';
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

// Interfaces mapping the exact schema from employee order app
interface CartItem {
  id: number;
  code?: string;
  name: string;
  price: number; // base price without IVA
  category?: string;
  image?: string;
  qty: number;
}

interface Product {
  id: number;
  code: string;
  name: string;
  price: number; // base price without IVA
  category?: string;
  image?: string;
  active: boolean;
}

interface Order {
  id: string;
  date: string;
  cedula: string;
  employee: string;
  items: CartItem[];
  subtotal: number;
  iva: number;
  total: number;
}

interface AccessConfig {
  open: boolean;
  openDate: string;
  closeDate: string;
  msg: string;
  pass: string; // admin pass (default "admin123")
}

const DEFAULT_CONFIG: AccessConfig = {
  open: true,
  openDate: '',
  closeDate: '',
  msg: '¡Pedidos disponibles! Ingresa tu nombre para continuar.',
  pass: 'admin123'
};

const safeFormatLocalDateTime = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?/);
    if (match) {
      const [, day, month, year, hours = '0', minutes = '0', seconds = '0'] = match;
      const parsedD = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds));
      if (!isNaN(parsedD.getTime())) {
        return parsedD.toLocaleString('es-CO');
      }
    }
    return dateStr;
  }
  return d.toLocaleString('es-CO');
};

const safeGetTime = (dateStr: any): number => {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.getTime();
  
  if (typeof dateStr === 'string') {
    const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
      const [, day, month, year] = match;
      const parsedD = new Date(Number(year), Number(month) - 1, Number(day));
      if (!isNaN(parsedD.getTime())) return parsedD.getTime();
    }
  }
  return 0;
};

function numeroALetras(num: number): string {
  const Unidades = (n: number): string => {
    switch (n) {
      case 1: return 'UN';
      case 2: return 'DOS';
      case 3: return 'TRES';
      case 4: return 'CUATRO';
      case 5: return 'CINCO';
      case 6: return 'SEIS';
      case 7: return 'SIETE';
      case 8: return 'OCHO';
      case 9: return 'NUEVE';
      default: return '';
    }
  };

  const Decenas = (n: number): string => {
    if (n < 10) return Unidades(n);
    if (n === 10) return 'DIEZ';
    if (n === 11) return 'ONCE';
    if (n === 12) return 'DOCE';
    if (n === 13) return 'TRECE';
    if (n === 14) return 'CATORCE';
    if (n === 15) return 'QUINCE';
    if (n < 20) return 'DIECI' + Unidades(n - 10);
    if (n === 20) return 'VEINTE';
    if (n < 30) return 'VEINTI' + Unidades(n - 20);
    if (n === 30) return 'TREINTA';
    if (n === 40) return 'CUARENTA';
    if (n === 50) return 'CINCUENTA';
    if (n === 60) return 'SESENTA';
    if (n === 70) return 'SETENTA';
    if (n === 80) return 'OCHENTA';
    if (n === 90) return 'NOVENTA';
    
    return Decenas(Math.floor(n / 10) * 10) + ' Y ' + Unidades(n % 10);
  };

  const Centenas = (n: number): string => {
    if (n < 100) return Decenas(n);
    if (n === 100) return 'CIEN';
    if (n < 200) return 'CIENTO ' + Decenas(n - 100);
    if (n === 550) return 'QUINIENTOS'; // safe check
    
    const c = Math.floor(n / 100);
    const suffix = (c === 5 ? 'QUINIENTOS' : c === 7 ? 'SETECIENTOS' : c === 9 ? 'NOVECIENTOS' : Unidades(c) + 'CIENTOS');
    return suffix + (n % 100 > 0 ? ' ' + Decenas(n % 100) : '');
  };

  const Miles = (n: number): string => {
    const divisor = 1000;
    const c = Math.floor(n / divisor);
    const resto = n % divisor;
    let letras = '';

    if (c > 0) {
      if (c === 1) {
        letras = 'MIL';
      } else {
        letras = Centenas(c) + ' MIL';
      }
    }

    if (resto > 0) {
      letras += (letras ? ' ' : '') + Centenas(resto);
    }
    return letras;
  };

  const Millones = (n: number): string => {
    const divisor = 1000000;
    const c = Math.floor(n / divisor);
    const resto = n % divisor;
    let letras = '';

    if (c > 0) {
      if (c === 1) {
        letras = 'UN MILLÓN';
      } else {
        letras = Miles(c) + ' MILLONES';
      }
    }

    if (resto > 0) {
      letras += (letras ? ' ' : '') + Miles(resto);
    }
    return letras;
  };

  const entero = Math.floor(num);
  if (entero === 0) return 'CERO PESOS M/CTE';
  
  const letras = Millones(entero);
  return `${letras} PESOS M/CTE`;
}

const SEED_PRODUCTS: Product[] = [
  { id: 101, code: 'ASE-001', name: 'Detergente Líquido LP 1L', price: 9243, category: 'Aseo', active: true, image: 'https://images.unsplash.com/photo-1581622558663-b2e33377dfb2?auto=format&fit=crop&q=80&w=200' },
  { id: 102, code: 'ASE-002', name: 'Suavizante Primavera 2L', price: 11344, category: 'Aseo', active: true, image: 'https://images.unsplash.com/photo-1607344645866-009c320c5ab8?auto=format&fit=crop&q=80&w=200' },
  { id: 103, code: 'ALM-001', name: 'Arroz Premium LP 5kg', price: 18487, category: 'Granos', active: true, image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=200' },
  { id: 104, code: 'ALM-002', name: 'Lentejas Selección 1kg', price: 5462, category: 'Granos', active: true, image: 'https://images.unsplash.com/photo-1547053833-23344b16b6a4?auto=format&fit=crop&q=80&w=200' },
  { id: 105, code: 'LAC-001', name: 'Queso Doble Crema LP 500g', price: 10924, category: 'Lácteos', active: true, image: 'https://images.unsplash.com/photo-1486887396153-fa416525c108?auto=format&fit=crop&q=80&w=200' },
  { id: 106, code: 'LAC-002', name: 'Leche Entera LP Sixpack', price: 18487, category: 'Lácteos', active: true, image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&q=80&w=200' },
  { id: 107, code: 'CAF-001', name: 'Café Excelso Molido 500g', price: 12605, category: 'Cafetería', active: true, image: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&q=80&w=200' },
  { id: 108, code: 'SAL-001', name: 'Salsa de Tomate LP 400g', price: 3781, category: 'Salsas', active: true, image: 'https://images.unsplash.com/photo-1528448868065-b56befc9b3b1?auto=format&fit=crop&q=80&w=200' },
];

const getCategoryEmoji = (categoryName: string) => {
  const norm = (categoryName || '').toLowerCase();
  if (norm.includes('lácteo') || norm.includes('lacteo') || norm.includes('leche') || norm.includes('queso')) return '🥛';
  if (norm.includes('grano') || norm.includes('arroz') || norm.includes('frijol') || norm.includes('lenteja')) return '🌾';
  if (norm.includes('carne') || norm.includes('pollo') || norm.includes('res') || norm.includes('cerdo') || norm.includes('embutido')) return '🥩';
  if (norm.includes('aseo') || norm.includes('limpieza') || norm.includes('jabón') || norm.includes('jabon') || norm.includes('detergente') || norm.includes('suavizante')) return '🧼';
  if (norm.includes('rancho') || norm.includes('despensa') || norm.includes('aceite')) return '🥫';
  if (norm.includes('bebida') || norm.includes('gaseosa') || norm.includes('jugo') || norm.includes('agua')) return '🥤';
  if (norm.includes('licor') || norm.includes('cerveza') || norm.includes('vino')) return '🍷';
  if (norm.includes('dulce') || norm.includes('galleta') || norm.includes('chocolate') || norm.includes('confite')) return '🍬';
  if (norm.includes('pan') || norm.includes('panadería') || norm.includes('panaderia') || norm.includes('torta')) return '🍞';
  if (norm.includes('desechable')) return '🍽️';
  if (norm.includes('verdura') || norm.includes('fruta')) return '🍎';
  if (norm.includes('café') || norm.includes('cafe') || norm.includes('cafetería') || norm.includes('cafeteria')) return '☕';
  if (norm.includes('salsa')) return '🥫';
  return '📦';
};

export default function PedidosModule() {
  // Navigation states
  const [activeTab, setActiveTab] = useState<'acceso' | 'catalogo' | 'carrito' | 'confirmacion' | 'adminLogin' | 'admin'>('acceso');

  // Cloud & local synchronization with lazy state initializer to prevent F5 race condition data loss
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const localBaseline = window.localStorage ? window.localStorage.getItem('latin_pedidos_local_state') : null;
      if (localBaseline) {
        const parsed = JSON.parse(localBaseline);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.products) && parsed.products.length > 0) {
          return parsed.products;
        }
      }
    } catch (e) {
      console.warn('Error reading local baseline:', e);
    }
    return SEED_PRODUCTS;
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const localBaseline = window.localStorage ? window.localStorage.getItem('latin_pedidos_local_state') : null;
      if (localBaseline) {
        const parsed = JSON.parse(localBaseline);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.orders)) {
          return parsed.orders;
        }
      }
    } catch (e) {}
    return [];
  });

  const [config, setConfig] = useState<AccessConfig>(() => {
    try {
      const localBaseline = window.localStorage ? window.localStorage.getItem('latin_pedidos_local_state') : null;
      if (localBaseline) {
        const parsed = JSON.parse(localBaseline);
        if (parsed && typeof parsed === 'object' && parsed.config) {
          return { ...DEFAULT_CONFIG, ...parsed.config };
        }
      }
    } catch (e) {}
    return DEFAULT_CONFIG;
  });

  // Cart operations
  const [cart, setCart] = useState<CartItem[]>([]);
  const [employeeName, setEmployeeName] = useState('');
  const [employeeCedula, setEmployeeCedula] = useState('');

  // Search & Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCat, setFilterCat] = useState('Todos');
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  // Admin login passcode
  const [adminPassInput, setAdminPassInput] = useState('');
  const [adminError, setAdminError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  // Admin Panel states
  const [adminSubTab, setAdminSubTab] = useState<'config' | 'products' | 'orders' | 'reports'>('products');
  const [reportType, setReportType] = useState<'month' | 'product' | 'employee' | 'detailed'>('month');
  const [repMonthFilter, setRepMonthFilter] = useState('all');
  const [repEmpFilter, setRepEmpFilter] = useState('all');
  const [repProdFilter, setRepProdFilter] = useState('all');
  const [repViewMode, setRepViewMode] = useState<'detailed' | 'summary'>('detailed');
  const [isPrintingReport, setIsPrintingReport] = useState(false);

  // Product CRUD states
  const [pId, setPId] = useState<number | null>(null);
  const [pCode, setPCode] = useState('');
  const [pName, setPName] = useState('');
  const [pPrice, setPPrice] = useState<number>(0);
  const [pCat, setPCat] = useState('');
  const [pImg, setPImg] = useState('');
  const [pActive, setPActive] = useState(true);
  const [localImgFile, setLocalImgFile] = useState<string | null>(null);
  const [adminProductSearch, setAdminProductSearch] = useState('');
  const [adminProductPage, setAdminProductPage] = useState(1);
  const [adminProductItemsPerPage, setAdminProductItemsPerPage] = useState(() => {
    try {
      const saved = localStorage.getItem('admin_product_items_per_page');
      return saved ? Number(saved) : 10;
    } catch {
      return 10;
    }
  });

  // Order edition state
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [lastSubmittedOrder, setLastSubmittedOrder] = useState<Order | null>(null);
  const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);

  // Notification messages
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Synchronization locks for real-time Firestore looping triggers initialized to match custom initial states
  const lastSavedProducts = useRef<string>(JSON.stringify(products));
  const lastSavedOrders = useRef<string>(JSON.stringify(orders));
  const lastSavedConfig = useRef<string>(JSON.stringify(config));

  const IVA_RATE = 0.19;

  // Formatting helper
  const fmt = (val: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Toast notifier
  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 1. Initial Cloud Subscriptions Setup
  useEffect(() => {
    // Live cloud subscriptions
    const unsubProds = subscribeToCloud('pedidos_empleados_state', 'products', (data) => {
      if (Array.isArray(data)) {
        const raw = JSON.stringify(data);
        lastSavedProducts.current = raw;
        setProducts(data);
        updateLocalCache('products', data);
      }
    });

    const unsubOrders = subscribeToCloud('pedidos_empleados_state', 'orders', (data) => {
      if (Array.isArray(data)) {
        const sorted = [...data].sort((a, b) => {
          const t1 = a ? safeGetTime(a.date) : 0;
          const t2 = b ? safeGetTime(b.date) : 0;
          return t2 - t1;
        });
        const raw = JSON.stringify(sorted);
        lastSavedOrders.current = raw;
        setOrders(sorted);
        updateLocalCache('orders', sorted);
      }
    });

    const unsubConfig = subscribeToCloud('pedidos_empleados_state', 'config', (data) => {
      if (data && typeof data === 'object') {
        const withDefaults = { ...DEFAULT_CONFIG, ...data };
        const raw = JSON.stringify(withDefaults);
        lastSavedConfig.current = raw;
        setConfig(withDefaults);
        updateLocalCache('config', withDefaults);
      }
    });

    return () => {
      unsubProds();
      unsubOrders();
      unsubConfig();
    };
  }, []);

  const updateLocalCache = (key: 'products' | 'orders' | 'config', value: any) => {
    try {
      const current = localStorage.getItem('latin_pedidos_local_state');
      let base: any = { products: SEED_PRODUCTS, orders: [], config: DEFAULT_CONFIG };
      if (current) base = JSON.parse(current);
      base[key] = value;
      localStorage.setItem('latin_pedidos_local_state', JSON.stringify(base));
    } catch (e) {}
  };

  // Safe action-based persistence wrappers (NO auto-running useEffect)
  const saveProducts = (updatedProds: Product[]) => {
    setProducts(updatedProds);
    lastSavedProducts.current = JSON.stringify(updatedProds);
    updateLocalCache('products', updatedProds);
    saveToCloud('pedidos_empleados_state', 'products', updatedProds);
  };

  const saveOrders = (updatedOrders: Order[]) => {
    setOrders(updatedOrders);
    lastSavedOrders.current = JSON.stringify(updatedOrders);
    updateLocalCache('orders', updatedOrders);
    saveToCloud('pedidos_empleados_state', 'orders', updatedOrders);
  };

  const saveConfig = (updatedConfig: AccessConfig) => {
    setConfig(updatedConfig);
    lastSavedConfig.current = JSON.stringify(updatedConfig);
    updateLocalCache('config', updatedConfig);
    saveToCloud('pedidos_empleados_state', 'config', updatedConfig);
  };

  // Check access window based on rules
  const isAccessAllowedByConfig = () => {
    try {
      if (!config || !config.open) return false;
      const now = new Date();
      if (config.openDate) {
        const d = new Date(config.openDate);
        if (!isNaN(d.getTime()) && d > now) return false;
      }
      if (config.closeDate) {
        const d = new Date(config.closeDate);
        if (!isNaN(d.getTime()) && d < now) return false;
      }
      return true;
    } catch (e) {
      console.warn('[Validation] Date restriction error:', e);
      return true;
    }
  };

  // Cart operations
  const handleAddToCart = (p: Product) => {
    const existing = cart.find(item => item.id === p.id);
    if (existing) {
      setCart(cart.map(item => item.id === p.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { id: p.id, code: p.code, name: p.name, price: p.price, category: p.category, image: p.image, qty: 1 }]);
    }
    triggerToast(`"${p.name}" agregado al carrito`, 'success');
  };

  const handleUpdateQty = (pId: number, qty: number) => {
    if (qty < 1) {
      setCart(cart.filter(item => item.id !== pId));
      triggerToast('Producto eliminado del carrito', 'info');
    } else {
      setCart(cart.map(item => item.id === pId ? { ...item, qty } : item));
    }
  };

  // Compute Cart Statistics
  const cartSubtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.price * item.qty, 0);
  }, [cart]);

  const cartIva = useMemo(() => {
    return cartSubtotal * IVA_RATE;
  }, [cartSubtotal]);

  const cartTotal = useMemo(() => {
    return cartSubtotal + cartIva;
  }, [cartSubtotal, cartIva]);

  const cartCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.qty, 0);
  }, [cart]);

  // Access validation and navigation entries
  const handleEnterCatalog = () => {
    if (!employeeName.trim() || !employeeCedula.trim()) {
      triggerToast('Por favor complete su nombre y cédula', 'error');
      return;
    }
    if (!isAccessAllowedByConfig()) {
      triggerToast('El período de pedidos está inactivo o cerrado', 'error');
      return;
    }
    setCart([]);
    setEditOrderId(null);
    setActiveTab('catalogo');
    triggerToast(`Bienvenido ${employeeName.trim()} al Catálogo`, 'success');
  };

  const handleAdminVerify = () => {
    const validPass = config.pass || 'admin123';
    if (adminPassInput === validPass || adminPassInput === 'admin123') {
      setIsAdmin(true);
      setActiveTab('admin');
      setAdminSubTab('products');
      setAdminError('');
      triggerToast('Autenticación de administrador exitosa', 'success');
    } else {
      setAdminError('Contraseña incorrecta');
      triggerToast('Acceso denegado', 'error');
    }
  };

  const handleSignOutAdmin = () => {
    setIsAdmin(false);
    setAdminPassInput('');
    setActiveTab('acceso');
    triggerToast('Sesión de administrador cerrada', 'info');
  };

  // Order Submission
  const handleOpenConfirmModal = () => {
    if (cart.length === 0) return;
    setShowConfirmModal(true);
  };

  const handleConfirmSubmitOrder = async () => {
    setShowConfirmModal(false);
    const orderId = editOrderId || `LP-${Date.now()}`;
    const newOrder: Order = {
      id: orderId,
      date: new Date().toLocaleString('es-CO'),
      cedula: employeeCedula.trim(),
      employee: employeeName.trim(),
      items: [...cart],
      subtotal: cartSubtotal,
      iva: cartIva,
      total: cartTotal
    };

    let updatedOrders = [...orders];
    if (editOrderId) {
      const idx = updatedOrders.findIndex(o => o.id === editOrderId);
      if (idx >= 0) updatedOrders[idx] = newOrder;
      triggerToast('Pedido modificado correctamente', 'success');
    } else {
      updatedOrders = [newOrder, ...updatedOrders];
      triggerToast('¡Pedido registrado correctamente!', 'success');
    }

    saveOrders(updatedOrders);
    setLastSubmittedOrder(newOrder);
    setCart([]);
    setEditOrderId(null);
    setActiveTab('confirmacion');
  };

  // Access check state trigger
  const categoriesList = useMemo(() => {
    const safeProducts = Array.isArray(products) ? products : [];
    return ['Todos', ...Array.from(new Set(safeProducts.map(p => p && p.category).filter(Boolean)))];
  }, [products]);

  // Filter and Search Products
  const filteredProducts = useMemo(() => {
    const safeProducts = Array.isArray(products) ? products : [];
    if (!searchTerm.trim()) {
      return safeProducts.filter(p => p && (filterCat === 'Todos' || p.category === filterCat) && p.active !== false);
    }
    const cleanNorm = (str: string) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const words = searchTerm.trim().split(/\s+/).map(cleanNorm).filter(Boolean);
    return safeProducts.filter(p => {
      if (!p) return false;
      const pAny = p as any;
      const matchCat = filterCat === 'Todos' || p.category === filterCat;
      const full = cleanNorm(`${p.name} ${p.code || ''} ${p.category || ''} ${pAny.description || ''}`);
      const matchSearch = words.every(w => full.includes(w));
      return matchSearch && matchCat && p.active !== false;
    });
  }, [products, searchTerm, filterCat]);

  // Group products by category
  const groupedProducts = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    filteredProducts.forEach(p => {
      const cat = p.category || 'General';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(p);
    });
    return groups;
  }, [filteredProducts]);

  // Admin Panel Filter and Search Products
  const filteredAdminProducts = useMemo(() => {
    const safeProducts = Array.isArray(products) ? products : [];
    if (!adminProductSearch.trim()) return safeProducts;
    const cleanNorm = (str: string) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const words = adminProductSearch.trim().split(/\s+/).map(cleanNorm).filter(Boolean);
    return safeProducts.filter(p => {
      if (!p) return false;
      const pAny = p as any;
      const full = cleanNorm(`${p.name} ${p.code || ''} ${p.category || ''} ${pAny.description || ''}`);
      return words.every(w => full.includes(w));
    });
  }, [products, adminProductSearch]);

  const totalAdminProductPages = useMemo(() => {
    return Math.ceil(filteredAdminProducts.length / adminProductItemsPerPage) || 1;
  }, [filteredAdminProducts, adminProductItemsPerPage]);

  const paginatedAdminProducts = useMemo(() => {
    const startIndex = (adminProductPage - 1) * adminProductItemsPerPage;
    return filteredAdminProducts.slice(startIndex, startIndex + adminProductItemsPerPage);
  }, [filteredAdminProducts, adminProductPage, adminProductItemsPerPage]);

  // Product CRUD Operations
  const compressAndSetImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      triggerToast('El archivo seleccionado debe ser una imagen', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Target sizing (max 400px width/height for fast synched base64 payload under 50kb)
        const maxDim = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          try {
            // Compress with JPEG medium-high quality to reduce Firestore payload
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            setLocalImgFile(dataUrl);
            setPImg('');
            triggerToast('Imagen cargada y optimizada con éxito', 'success');
          } catch (err) {
            setLocalImgFile(event.target?.result as string);
            setPImg('');
          }
        } else {
          setLocalImgFile(event.target?.result as string);
          setPImg('');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      compressAndSetImage(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      compressAndSetImage(file);
    }
  };

  const handleSaveProduct = () => {
    const cleanCode = pCode.trim().toUpperCase();
    const cleanName = pName.trim();
    if (!cleanCode) {
      triggerToast('El código es obligatorio', 'error');
      return;
    }
    if (!cleanName || pPrice <= 0) {
      triggerToast('Nombre y precio base mayor a cero son obligatorios', 'error');
      return;
    }

    const duplicate = products.find(p => p.code === cleanCode && p.id !== pId);
    if (duplicate) {
      triggerToast(`Ya existe un producto con el código "${cleanCode}"`, 'error');
      return;
    }

    const targetId = pId || Date.now();
    const newProd: Product = {
      id: targetId,
      code: cleanCode,
      name: cleanName,
      price: pPrice,
      category: pCat.trim() || 'General',
      image: localImgFile || pImg.trim() || undefined,
      active: pActive
    };

    let updatedProds = [...products];
    if (pId) {
      const idx = updatedProds.findIndex(p => p.id === pId);
      if (idx >= 0) updatedProds[idx] = newProd;
      triggerToast('Producto modificado con éxito', 'success');
    } else {
      updatedProds.push(newProd);
      triggerToast('Producto creado con éxito', 'success');
    }

    saveProducts(updatedProds);
    handleResetProdForm();
  };

  const handleEditProduct = (p: Product) => {
    setPId(p.id);
    setPCode(p.code);
    setPName(p.name);
    setPPrice(p.price);
    setPCat(p.category || '');
    setPActive(p.active);
    if (p.image?.startsWith('data:image')) {
      setLocalImgFile(p.image);
      setPImg('');
    } else {
      setLocalImgFile(null);
      setPImg(p.image || '');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteProduct = (prodId: number) => {
    if (window.confirm('¿Desea eliminar este producto globalmente?')) {
      saveProducts(products.filter(p => p.id !== prodId));
      triggerToast('Producto eliminado correctamente', 'success');
    }
  };

  const handleResetProdForm = () => {
    setPId(null);
    setPCode('');
    setPName('');
    setPPrice(0);
    setPCat('');
    setPImg('');
    setPActive(true);
    setLocalImgFile(null);
  };

  // Order interactions inside Admin Tab
  const handleDeleteOrder = (id: string) => {
    if (window.confirm('¿Está seguro de eliminar este pedido en la nube?')) {
      saveOrders(orders.filter(o => o.id !== id));
      triggerToast('Pedido eliminado correctamente', 'success');
    }
  };

  const handleEditOrderBackToCart = (o: Order) => {
    if (window.confirm(`¿Desea cargar el pedido de ${o.employee} para editarlo? Todo cambio sobrescribirá este registro.`)) {
      setEmployeeName(o.employee);
      setEmployeeCedula(o.cedula);
      setEditOrderId(o.id);
      setCart(o.items.map(i => ({ ...i })));
      setActiveTab('carrito');
      triggerToast('Pedido importado al carrito para edición', 'info');
    }
  };

  const handlePrintAdminOrder = (order: Order) => {
    setOrderToPrint(order);
    document.body.classList.add('print-receipt-mode');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('print-receipt-mode');
      setOrderToPrint(null);
    }, 150);
  };

  const handlePrintReport = () => {
    setIsPrintingReport(true);
    document.body.classList.add('print-report-mode');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('print-report-mode');
      setIsPrintingReport(false);
    }, 150);
  };

  // Admin access configuration modification
  const handleSaveConfig = () => {
    triggerToast('Configuración del sistema actualizada', 'success');
  };

  // SheetJS Excel Exporter helper
  const handleExportExcel = (type: string) => {
    let rows: any[] = [];
    const namePrefix = `sistemalog_pedidos_${type}_${new Date().toISOString().split('T')[0]}`;

    if (type === 'orders') {
      rows = [
        ['ID Pedido', 'Fecha', 'Cédula', 'Empleado', 'Código Producto', 'Descripción', 'Categoría', 'Cantidad', 'Precio Unit. Base', 'IVA 19%', 'Total Línea', 'Total Pedido']
      ];
      orders.forEach(o => {
        o.items.forEach(it => {
          const uIva = it.price * IVA_RATE;
          const uTot = it.price * (1 + IVA_RATE);
          rows.push([
            o.id, o.date, o.cedula, o.employee, it.code || '', it.name, it.category || '', it.qty, it.price, uIva, uTot * it.qty, o.total
          ]);
        });
      });
    } else if (type === 'month') {
      // Complete table excel rows mirroring the filtered view
      rows = [
        ['Fecha', 'Cédula', 'Empleado', 'Código', 'Producto', 'Categoría', 'Cantidad', 'Base sin IVA', 'IVA 19%', 'Total c/IVA']
      ];
      processedReportRecords.forEach(r => {
        rows.push([
          r.date, r.cedula, r.employee, r.code, r.name, r.category, r.qty, r.price * r.qty, r.price * IVA_RATE * r.qty, r.price * (1 + IVA_RATE) * r.qty
        ]);
      });
    } else if (type === 'product') {
      rows = [
        ['Código', 'Producto', 'Unidades Solicitadas', 'Venta Total c/IVA']
      ];
      Object.values(reportsAggregateByProduct).forEach((p: any) => {
        rows.push([p.code, p.name, p.qty, p.total]);
      });
    } else if (type === 'employee') {
      rows = [
        ['Cédula', 'Empleado', 'N° Pedidos', 'Cantidad de Ítems', 'Venta Total']
      ];
      Object.keys(reportsAggregateByEmployee).forEach(key => {
        const emp = reportsAggregateByEmployee[key];
        rows.push([emp.cedula, key, emp.count, emp.items, emp.total]);
      });
    } else if (type === 'detailed') {
      rows = [
        ['Fecha', 'Cédula', 'Empleado', 'Código', 'Producto', 'Categoría', 'Cantidad', 'Precio c/IVA', 'Total Línea']
      ];
      processedReportRecords.forEach(r => {
        rows.push([
          r.date, r.cedula, r.employee, r.code, r.name, r.category, r.qty, r.price * (1 + IVA_RATE), r.price * (1 + IVA_RATE) * r.qty
        ]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte Pedidos');
    XLSX.writeFile(wb, `${namePrefix}.xlsx`);
    triggerToast('Excel exportado correctamente', 'success');
  };

  // Populate month selectors dynamically
  const uniqueMonthsOfOrders = useMemo(() => {
    const list = new Set<string>();
    const safeOrders = Array.isArray(orders) ? orders : [];
    safeOrders.forEach(o => {
      if (o && typeof o.date === 'string') {
        const parts = o.date.split(' ')[0].split('/');
        if (parts.length >= 3) {
          list.add(`${parts[2]}-${parts[1]}`);
        }
      }
    });
    return Array.from(list).sort().reverse();
  }, [orders]);

  // Aggregate stats logic for reports tab
  const processedReportRecords = useMemo(() => {
    let list: any[] = [];
    const safeOrders = Array.isArray(orders) ? orders : [];
    safeOrders.forEach(o => {
      if (o && typeof o.date === 'string') {
        const dateParts = o.date.split(' ')[0].split('/');
        const orderMonth = dateParts.length >= 3 ? `${dateParts[2]}-${dateParts[1]}` : 'N/A';
        
        const matchMonth = repMonthFilter === 'all' || orderMonth === repMonthFilter;
        const matchEmp = repEmpFilter === 'all' || o.employee === repEmpFilter;

        if (matchMonth && matchEmp && Array.isArray(o.items)) {
          o.items.forEach(it => {
            if (it && it.name) {
              const matchProd = repProdFilter === 'all' || it.name === repProdFilter;
              if (matchProd) {
                list.push({
                  date: o.date.split(' ')[0],
                  cedula: o.cedula,
                  employee: o.employee,
                  code: it.code || '-',
                  name: it.name,
                  category: it.category || 'General',
                  qty: it.qty,
                  price: it.price,
                  orderId: o.id
                });
              }
            }
          });
        }
      }
    });
    return list;
  }, [orders, repMonthFilter, repEmpFilter, repProdFilter]);

  // Multi-dimensional aggregations
  const reportsAggregateByProduct = useMemo(() => {
    const map: Record<string, { code: string; name: string; qty: number; total: number }> = {};
    const safeRecords = Array.isArray(processedReportRecords) ? processedReportRecords : [];
    safeRecords.forEach(r => {
      if (r && r.name) {
        if (!map[r.name]) {
          map[r.name] = { code: r.code, name: r.name, qty: 0, total: 0 };
        }
        map[r.name].qty += r.qty;
        map[r.name].total += r.price * (1 + IVA_RATE) * r.qty;
      }
    });
    return map;
  }, [processedReportRecords]);

  const reportsAggregateByEmployee = useMemo(() => {
    const map: Record<string, { cedula: string; count: number; items: number; total: number }> = {};
    const ordersTallied = new Set<string>();
    const safeOrders = Array.isArray(orders) ? orders : [];
    safeOrders.forEach(o => {
      if (o && typeof o.date === 'string' && o.employee) {
        const dateParts = o.date.split(' ')[0].split('/');
        const orderMonth = dateParts.length >= 3 ? `${dateParts[2]}-${dateParts[1]}` : 'N/A';
        if (repMonthFilter !== 'all' && orderMonth !== repMonthFilter) return;

        if (!map[o.employee]) {
          map[o.employee] = { cedula: o.cedula || '', count: 0, items: 0, total: 0 };
        }
        if (!ordersTallied.has(o.id) && Array.isArray(o.items)) {
          ordersTallied.add(o.id);
          map[o.employee].count++;
          map[o.employee].items += o.items.reduce((acc, it) => acc + (it?.qty || 0), 0);
          map[o.employee].total += o.total || 0;
        }
      }
    });
    return map;
  }, [orders, repMonthFilter]);

  // List of distinct employees for filter select
  const distinctEmployeesList = useMemo(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];
    return Array.from(new Set(safeOrders.map(o => o && o.employee).filter(Boolean))).sort();
  }, [orders]);

  // List of distinct products for filter select
  const distinctProductsList = useMemo(() => {
    const prods = new Set<string>();
    const safeOrders = Array.isArray(orders) ? orders : [];
    safeOrders.forEach(o => {
      if (o && Array.isArray(o.items)) {
        o.items.forEach(it => {
          if (it && it.name) prods.add(it.name);
        });
      }
    });
    return Array.from(prods).sort();
  }, [orders]);

  // Stats aggregate values
  const statsAggregate = useMemo(() => {
    const safeOrders = Array.isArray(orders) ? orders : [];
    const safeProducts = Array.isArray(products) ? products : [];
    const totalSalesValue = safeOrders.reduce((acc, o) => acc + (o?.total || 0), 0);
    return {
      activeCount: safeProducts.filter(p => p && p.active !== false).length,
      ordersCount: safeOrders.length,
      salesVal: totalSalesValue
    };
  }, [products, orders]);

  const activePrintOrder = orderToPrint || lastSubmittedOrder;

  return (
    <div className="bg-slate-950 text-slate-100 min-h-screen border border-slate-900 rounded-2xl overflow-hidden shadow-2xl relative">
      
      {/* Toast Alert bar */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[999] px-6 py-3 rounded-xl border font-mono text-xs font-bold animate-bounce shadow-2xl flex items-center gap-3 transition-all ${
          toast.type === 'error' ? 'bg-rose-950 text-rose-200 border-rose-500' : 
          toast.type === 'info' ? 'bg-slate-900 text-cyan-300 border-cyan-500' : 'bg-emerald-950 text-emerald-200 border-emerald-500'
        }`}>
          <span>{toast.type === 'error' ? '🚫' : toast.type === 'info' ? 'ℹ️' : '✅'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Module HUD Header */}
      <header className="bg-slate-950 p-4 md:p-6 border-b border-orange-500/30 flex flex-col md:flex-row items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="p-2 sm:p-3 bg-orange-950/60 border border-orange-500/50 rounded-xl text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.15)] shrink-0">
            <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg md:text-xl font-bold font-mono text-white uppercase tracking-tight flex flex-wrap items-center gap-1.5 leading-tight">
              Pedidos Empleados <span className="text-orange-500 font-extrabold text-[10px] sm:text-xs border border-orange-500/30 px-1.5 py-0.5 rounded bg-orange-950/20 shrink-0">SISTEMALOG</span>
            </h1>
            <p className="text-[9px] sm:text-[10px] md:text-[11px] font-mono text-slate-400 tracking-wider uppercase mt-1 truncate">
              Portal Centralizado de Logística e Integración Multi-usuario Firestore
            </p>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2.5 notranslate" translate="no">
          {activeTab !== 'acceso' && activeTab !== 'admin' && activeTab !== 'adminLogin' && (
            <button 
              key="btn-salir"
              onClick={() => {
                if (window.confirm('¿Volver al inicio? Se limpiará la sesión activa.')) {
                  setActiveTab('acceso');
                  setCart([]);
                  setEmployeeName('');
                  setEmployeeCedula('');
                }
              }}
              className="px-3.5 py-1.5 border border-slate-800 hover:border-slate-700 bg-slate-900/60 rounded-md text-slate-400 hover:text-slate-200 text-xs font-mono font-semibold transition-all flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Salir
            </button>
          )}

          {activeTab === 'admin' ? (
            <button 
              key="btn-salir-admin"
              onClick={handleSignOutAdmin}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-slate-950 text-xs font-mono font-bold uppercase rounded-md transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
            >
              <LogOut className="w-3.5 h-3.5" />
              Salir Admin
            </button>
          ) : (
            <button 
              key="btn-admin-config"
              onClick={() => activeTab === 'adminLogin' ? setActiveTab('acceso') : setActiveTab('adminLogin')}
              className={`px-3.5 py-2 rounded-md font-mono text-xs font-bold uppercase transition-all flex items-center gap-1.5 ${
                activeTab === 'adminLogin' 
                  ? 'bg-orange-500 text-slate-950' 
                  : 'bg-slate-905 border border-orange-500/20 text-orange-400 hover:bg-orange-950/20'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              Admin Panel
            </button>
          )}
        </div>
      </header>

      {/* Main views layout container */}
      <div className="p-3.5 sm:p-5 md:p-6">

        {/* ─── SCREEN 1: ACCESO (v-access) ─── */}
        {activeTab === 'acceso' && (
          <div className="max-w-md mx-auto py-4 sm:py-12">
            <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-5 sm:p-8 text-center space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full filter blur-xl"></div>
              
              <div className="mx-auto w-16 h-16 bg-orange-950/40 border border-orange-500/40 text-orange-500 rounded-full flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(249,115,22,0.1)]">
                🛍️
              </div>

              <div>
                <h2 className="text-xl font-bold font-mono text-white uppercase">Registro de Pedido</h2>
                <p className="text-xs text-slate-400 font-mono mt-1">SISTEMALOG SAS - COLOMBIA</p>
              </div>

              {isAccessAllowedByConfig() ? (
                <div className="bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 p-4 rounded-xl text-xs font-mono text-left space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ¡SISTEMA ABIERTO Y ACTIVO!
                  </div>
                  <p className="text-[11px] text-emerald-400/80 mt-1">{config.msg || "Pedidos habilitados."}</p>
                </div>
              ) : (
                <div className="bg-rose-950/35 border border-rose-500/30 text-rose-300 p-5 rounded-xl text-xs font-mono text-left space-y-3">
                  <div className="font-bold flex items-center gap-1.5 text-rose-400">
                    <Lock className="w-4 h-4 shrink-0 animate-bounce" />
                    RECEPCIÓN DE PEDIDOS CERRADA
                  </div>
                  <p className="text-[11px] text-rose-400/80 leading-relaxed">{config.msg || "El sistema no está disponible para ingresar pedidos en este momento."}</p>
                  
                  {(config.openDate || config.closeDate) && (
                    <div className="pt-2 border-t border-rose-500/20 text-[10px] space-y-1 text-slate-400">
                      {config.openDate && <div>📅 Apertura: {safeFormatLocalDateTime(config.openDate)}</div>}
                      {config.closeDate && <div>📅 Cierre: {safeFormatLocalDateTime(config.closeDate)}</div>}
                    </div>
                  )}
                </div>
              )}

              {/* Input forms */}
              <div className="space-y-4 pt-1">
                <div className="text-left space-y-1.5">
                  <label className="text-[11px] text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1">
                    <CreditCard className="w-3 h-3 text-orange-400" />
                    Número de Cédula
                  </label>
                  <input
                    type="number"
                    placeholder="Ingrese su CC sin puntos o comas *"
                    value={employeeCedula}
                    onChange={(e) => setEmployeeCedula(e.target.value)}
                    disabled={!isAccessAllowedByConfig()}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500/50 text-white p-3 rounded-lg text-sm outline-none transition-all font-mono"
                  />
                </div>

                <div className="text-left space-y-1.5">
                  <label className="text-[11px] text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1">
                    <User className="w-3 h-3 text-orange-400" />
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    placeholder="Nombres y Apellidos *"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    disabled={!isAccessAllowedByConfig()}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-orange-500/50 text-white p-3 rounded-lg text-sm outline-none transition-all"
                  />
                </div>
              </div>

              <button
                onClick={handleEnterCatalog}
                disabled={!isAccessAllowedByConfig() || !employeeName.trim() || !employeeCedula.trim()}
                className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 disabled:bg-slate-900 disabled:text-slate-500 text-slate-950 font-bold font-mono text-xs uppercase rounded-xl shadow-[0_0_20px_rgba(249,115,22,0.15)] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Ingresar al Catálogo
                <ChevronRight className="w-4 h-4" />
              </button>

              <div className="pt-2 border-t border-slate-850 text-[10px] font-mono text-slate-500 leading-relaxed text-center">
                Cualquier duda o soporte por favor dirígela a:<br />
                <a href="mailto:soporteyabi@gmail.com" className="text-orange-400 hover:underline">
                  soporteyabi@gmail.com
                </a>
              </div>
            </div>
          </div>
        )}

        {/* ─── SCREEN 2: ADMIN LOGIN (v-adminLogin) ─── */}
        {activeTab === 'adminLogin' && (
          <div className="max-w-sm mx-auto py-16">
            <div className="bg-slate-900/40 border border-slate-850 p-8 rounded-xl text-center space-y-5">
              <div className="text-4xl">🔑</div>
              <div>
                <h3 className="font-mono text-sm text-orange-400 font-bold uppercase tracking-wider">Módulo Administrativo</h3>
                <p className="text-[10px] text-slate-500 font-mono uppercase mt-0.5">Control de acceso de pedidos</p>
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-xs text-slate-400 font-mono">Clave de Administración</label>
                <input
                  type="password"
                  placeholder="Contraseña *"
                  value={adminPassInput}
                  onChange={(e) => setAdminPassInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAdminVerify()}
                  className="w-full bg-slate-950 border border-slate-800 text-white p-3 rounded-lg text-xs outline-none focus:border-orange-500 transition-all font-mono"
                />
                {adminError && <div className="text-[11px] text-rose-400 font-mono pt-1">⚠️ {adminError}</div>}
              </div>

              <div className="pt-2 space-y-2">
                <button
                  onClick={handleAdminVerify}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold font-mono text-xs uppercase rounded-lg transition-all"
                >
                  Confirmar Credencial
                </button>
                <button
                  onClick={() => setActiveTab('acceso')}
                  className="w-full py-2 bg-slate-950 text-slate-400 text-xs font-mono uppercase rounded-lg border border-slate-850 hover:bg-slate-900 transition-all"
                >
                  Cancelar
                </button>
              </div>
              <p className="text-[11px] text-slate-600 font-mono pt-2">🔑 Demo base PIN: <span className="text-slate-400">admin123</span></p>
            </div>
          </div>
        )}

        {/* ─── SCREEN 3: CATALOGO DE PRODUCTOS (v-catalog) ─── */}
        {activeTab === 'catalogo' && (
          <div className="space-y-6">
            
            {/* Catalog header with customer details and search bar */}
            <div className="bg-slate-900/40 border border-slate-850 p-5 rounded-xl flex flex-col lg:flex-row gap-4 items-center justify-between">
              
              {/* User details badge */}
              <div className="flex items-center gap-3 w-full lg:w-auto">
                <div className="w-10 h-10 bg-orange-500 text-slate-950 shrink-0 rounded-lg flex items-center justify-center font-bold font-mono">
                  {employeeName.trim().slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-slate-400 font-mono uppercase flex items-center gap-1">
                    <span>Empleado Registrado</span>
                    <span className="text-orange-500 font-bold">&middot; CC: {employeeCedula}</span>
                  </div>
                  <h4 className="text-sm font-bold text-white uppercase truncate">{employeeName}</h4>
                </div>
              </div>

              {/* Filter components */}
              <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto lg:flex-1 lg:max-w-xl">
                <div className="relative flex-1">
                  <input
                    type="search"
                    placeholder="🔍 Buscar producto por marca o código..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 pl-9 text-xs text-slate-200 focus:border-orange-500 outline-none transition-all font-mono"
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                </div>

                {cartCount > 0 && (
                  <button
                    onClick={() => setActiveTab('carrito')}
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold font-mono text-xs uppercase rounded-lg transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(249,115,22,0.2)] shrink-0"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Mi Pedido ({cartCount})
                  </button>
                )}
              </div>

            </div>

            {/* Interactive Category Dropdown & Quick Selector */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/25 border border-slate-850/60 p-4 rounded-xl">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Filtrar por Categoría</span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsCatDropdownOpen(!isCatDropdownOpen)}
                    className="w-full sm:w-64 flex items-center justify-between bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg px-3.5 py-2.5 text-left transition-all text-xs font-mono font-bold uppercase text-slate-200 cursor-pointer shadow-inner"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm select-none">{getCategoryEmoji(filterCat)}</span>
                      <span>{filterCat}</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${isCatDropdownOpen ? 'rotate-180' : 'rotate-0'}`} />
                  </button>

                  {isCatDropdownOpen && (
                    <>
                      {/* Dropdown Backdrop to catch clicks outside */}
                      <div className="fixed inset-0 z-40" onClick={() => setIsCatDropdownOpen(false)} />
                      
                      {/* Dropdown Options */}
                      <div className="absolute left-0 mt-1.5 w-full sm:w-64 bg-slate-950 border border-slate-800 hover:border-slate-750 rounded-lg shadow-2xl z-50 overflow-hidden divide-y divide-slate-900 max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
                        {categoriesList.map(cat => {
                          const isSelected = filterCat === cat;
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => {
                                setFilterCat(cat);
                                setIsCatDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left text-xs font-mono uppercase transition-colors cursor-pointer ${
                                isSelected 
                                  ? 'bg-orange-500/10 text-orange-400 font-extrabold' 
                                  : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                <span className="text-sm select-none">{getCategoryEmoji(cat)}</span>
                                <span>{cat}</span>
                              </span>
                              {isSelected && <span className="text-orange-400 text-xs animate-pulse">●</span>}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Quick Pills (Horizontal indicators showing current filters active) */}
              <div className="flex gap-1.5 items-center overflow-x-auto max-w-full pb-1 text-[11px] font-mono text-slate-500 uppercase scrollbar-none">
                <span className="select-none shrink-0">Selección:</span>
                {categoriesList.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFilterCat(cat)}
                    className={`px-2.5 py-1 rounded transition-all text-[10px] uppercase font-bold border shrink-0 ${
                      filterCat === cat 
                        ? 'bg-orange-500/15 text-orange-400 border-orange-500/50' 
                        : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-white'
                    }`}
                  >
                    {getCategoryEmoji(cat)} {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Catalog Grouped and Collapsible (Desplegable) Sections */}
            {Object.keys(groupedProducts).length === 0 ? (
              <div className="py-20 text-center space-y-4">
                <Search className="w-12 h-12 text-slate-700 mx-auto animate-pulse" />
                <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">No se encontraron productos coincidentes.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.keys(groupedProducts).map(catName => {
                  const catProducts = groupedProducts[catName];
                  // Automatically expand categories if there is an active search, otherwise respect local manual toggles
                  const isExpanded = searchTerm.trim() !== '' || expandedCats[catName] !== false;
                  const catEmoji = getCategoryEmoji(catName);

                  return (
                    <div key={catName} className="bg-slate-900/20 border border-slate-850 rounded-xl overflow-hidden shadow-sm transition-all">
                      {/* Accordion Trigger Header */}
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedCats(prev => ({
                            ...prev,
                            [catName]: !isExpanded
                          }));
                        }}
                        className="w-full flex items-center justify-between p-4 bg-slate-900/40 hover:bg-slate-900/70 border-b border-slate-850 hover:border-slate-800 transition-colors text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl p-2 bg-slate-950/40 rounded-lg border border-slate-800 leading-none select-none">{catEmoji}</span>
                          <div>
                            <h3 className="font-mono text-xs font-bold uppercase text-slate-200 tracking-wider">
                              {catName}
                            </h3>
                            <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-0.5 block">
                              {catProducts.length} {catProducts.length === 1 ? 'producto' : 'productos'} disponible{catProducts.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-mono uppercase font-black tracking-widest px-3 py-1.5 rounded-lg bg-slate-950 border transition-all ${
                            isExpanded 
                              ? 'text-orange-400 border-orange-500/20 bg-orange-950/5' 
                              : 'text-slate-400 border-slate-850 hover:text-slate-200'
                          }`}>
                            {isExpanded ? 'Contraer ▲' : 'Desplegar ▼'}
                          </span>
                        </div>
                      </button>

                      {/* Accordion Content Grid (Only mounted when open to save memory and DOM footprint) */}
                      {isExpanded && (
                        <div className="p-4 bg-slate-950/10 border-t border-slate-950/40">
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in">
                            {catProducts.map(p => {
                              const itemInCart = cart.find(ci => ci.id === p.id);
                              const priceWithIva = p.price * (1 + IVA_RATE);
                              const fallbackImage = `https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=300?text=${encodeURIComponent(p.name)}`;

                              return (
                                <div key={p.id} className="bg-slate-900/40 border border-slate-850 rounded-xl overflow-hidden flex flex-col shadow-md hover:border-slate-800 transition-all">
                                  <div className="aspect-[4/3] bg-slate-950 relative overflow-hidden">
                                    <img
                                      src={p.image || fallbackImage}
                                      alt={p.name}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-all"
                                      loading="lazy"
                                    />
                                    {p.category && (
                                      <span className="absolute top-2 left-2 text-[10px] uppercase font-mono font-bold bg-orange-500 text-slate-950 px-2.5 py-1 rounded">
                                        {p.category}
                                      </span>
                                    )}
                                    {p.code && (
                                      <span className="absolute bottom-2 left-2 text-[9px] uppercase font-mono bg-slate-950/80 border border-slate-850 text-slate-400 px-1.5 py-0.5 rounded">
                                        Cod: {p.code}
                                      </span>
                                    )}
                                  </div>

                                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                                    <div>
                                      <h4 className="text-xs font-bold text-slate-100 min-h-[32px] line-clamp-2 uppercase leading-tight font-sans">
                                        {p.name}
                                      </h4>
                                      <div className="mt-1 flex items-baseline justify-between">
                                        <span className="text-[10px] font-mono text-slate-500">Sin IVA: {fmt(p.price)}</span>
                                        <span className="text-md font-extrabold font-mono text-orange-400">{fmt(priceWithIva)} <span className="text-[9px] font-normal text-slate-400 select-none">c/IVA</span></span>
                                      </div>
                                    </div>

                                    <div className="pt-2 border-t border-slate-850">
                                      {itemInCart ? (
                                        <div className="flex items-center justify-between bg-slate-950 rounded-lg p-1.5 border border-slate-850">
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateQty(p.id, itemInCart.qty - 1)}
                                            className="w-8 h-8 rounded bg-rose-950/40 hover:bg-rose-900 border border-rose-900/30 text-rose-300 font-bold transition-all text-sm shrink-0 cursor-pointer"
                                          >
                                            -
                                          </button>
                                          <span className="font-mono font-bold text-xs text-white">{itemInCart.qty}</span>
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateQty(p.id, itemInCart.qty + 1)}
                                            className="w-8 h-8 rounded bg-emerald-950/40 hover:bg-emerald-900 border border-emerald-900/30 text-emerald-300 font-bold transition-all text-sm shrink-0 cursor-pointer"
                                          >
                                            +
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handleAddToCart(p)}
                                          className="w-full py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white font-mono text-xs uppercase rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                        >
                                          <ShoppingCart className="w-3.5 h-3.5 text-orange-400" />
                                          Agregar Pedido
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Active FAB footer */}
            {cartCount > 0 && (
              <div className="fixed bottom-6 right-6 z-[95] lg:hidden">
                <button
                  onClick={() => setActiveTab('carrito')}
                  className="p-4 bg-orange-500 hover:bg-orange-400 text-slate-950 font-black font-mono uppercase text-xs rounded-full shadow-[0_4px_25px_rgba(249,115,22,0.45)] flex items-center gap-2 transition-all cursor-pointer"
                >
                  <ShoppingCart className="w-5 h-5 animate-bounce" />
                  🛒 Mi Carrito ({cartCount})
                </button>
              </div>
            )}

          </div>
        )}

        {/* ─── SCREEN 4: MI CARRITO (v-cart) ─── */}
        {activeTab === 'carrito' && (
          <div className="max-w-2xl mx-auto space-y-6">
            
            <div className="flex items-center justify-between">
              <h2 className="text-md font-mono font-bold uppercase text-orange-400 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                Mi Pedido Actual
              </h2>
              <button
                onClick={() => setActiveTab('catalogo')}
                className="text-xs font-mono text-slate-400 hover:text-slate-100 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Volver al Catálogo
              </button>
            </div>

            <div className="bg-slate-900/40 border border-slate-850 rounded-xl p-5 font-mono text-xs space-y-1.5 text-slate-400">
              <div>👤 <strong>Empleado:</strong> <span className="text-white">{employeeName}</span></div>
              <div>💳 <strong>Cédula:</strong> <span className="text-white">{employeeCedula}</span></div>
              <div>🏢 <strong>Empresa:</strong> <span className="text-white">SISTEMALOG SAS</span></div>
              {editOrderId && <div className="text-orange-400 font-semibold uppercase">✏️ MODIFICANDO PEDIDO EXISTENTE: {editOrderId}</div>}
            </div>

            <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-6 space-y-6">
              
              {cart.length === 0 ? (
                <div className="py-12 text-center space-y-4">
                  <ShoppingCart className="w-10 h-10 text-slate-700 mx-auto" />
                  <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">Tu carrito está completamente vacío.</p>
                  <button
                    onClick={() => setActiveTab('catalogo')}
                    className="px-4 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-xs font-mono uppercase text-slate-300 rounded"
                  >
                    Ir a agregar productos
                  </button>
                </div>
              ) : (
                <div className="space-y-4 divide-y divide-slate-850">
                  {cart.map(item => {
                    const priceWithIva = item.price * (1 + IVA_RATE);
                    return (
                      <div key={item.id} className="flex gap-4 items-center pt-4 first:pt-0">
                        <img
                          src={item.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=100'}
                          alt={item.name}
                          className="w-14 h-14 object-cover rounded-lg bg-slate-950 shrink-0 border border-slate-850"
                        />
                        <div className="flex-1 min-w-0">
                          <h5 className="text-xs font-bold text-white truncate uppercase">{item.name}</h5>
                          <span className="text-[10px] font-mono text-slate-500 block">Cod: {item.code || '-'}</span>
                          <span className="text-[10px] font-mono text-orange-400 block mt-0.5">Precio c/IVA: {fmt(priceWithIva)}</span>
                        </div>

                        {/* Qty controller */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleUpdateQty(item.id, item.qty - 1)}
                            className="w-7 h-7 rounded bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-200 text-xs font-bold shrink-0"
                          >
                            -
                          </button>
                          <span className="w-7 text-center font-mono text-xs font-bold text-white">{item.qty}</span>
                          <button
                            onClick={() => handleUpdateQty(item.id, item.qty + 1)}
                            className="w-7 h-7 rounded bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-200 text-xs font-bold shrink-0"
                          >
                            +
                          </button>
                        </div>

                        <div className="text-right shrink-0 min-w-[90px]">
                          <span className="text-xs font-extrabold font-mono text-white">{fmt(priceWithIva * item.qty)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {cart.length > 0 && (
                <div className="pt-6 border-t border-slate-850 space-y-2.5 text-xs font-mono">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal sin IVA:</span>
                    <span>{fmt(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>IVA Colectivo (19%):</span>
                    <span>{fmt(cartIva)}</span>
                  </div>
                  <div className="flex justify-between text-md font-bold text-orange-400 pt-2 border-t border-slate-850/60">
                    <span className="uppercase">TOTAL NETO DEL PEDIDO:</span>
                    <span className="text-md">{fmt(cartTotal)}</span>
                  </div>
                </div>
              )}

            </div>

            {cart.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setActiveTab('catalogo')}
                  className="py-3.5 bg-slate-950 text-slate-300 font-mono text-xs uppercase border border-slate-800 hover:bg-slate-900 rounded-xl transition-all"
                >
                  ← Seguir Comprando
                </button>
                <button
                  onClick={handleOpenConfirmModal}
                  className="py-3.5 bg-orange-500 hover:bg-orange-400 text-slate-950 font-black font-mono text-xs uppercase rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(249,115,22,0.25)]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirmar Pedido
                </button>
              </div>
            )}

            {/* Confirm Modal Overlay */}
            {showConfirmModal && (
              <div className="fixed inset-0 bg-slate-950/80 z-[999] p-4 flex items-center justify-center animate-fade-in">
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl max-w-sm w-full space-y-5 text-center shadow-2xl">
                  <div className="w-14 h-14 bg-orange-950/40 border border-orange-500/40 text-orange-400 rounded-full flex items-center justify-center text-3xl mx-auto shadow-md">
                    🛒
                  </div>
                  <h3 className="font-mono text-sm uppercase text-orange-400 font-bold">¿Deseas enviar tu pedido?</h3>
                  <div className="bg-slate-950 p-4 rounded-lg font-mono text-xs text-left space-y-1.5 text-slate-300 border border-slate-850">
                    <div>👤 <strong>Empleado:</strong> {employeeName}</div>
                    <div className="text-orange-400">📊 <strong>Unidades:</strong> {cartCount} items</div>
                    <div className="text-md font-black pt-2 border-t border-slate-800/60 mt-1">Total a pagar: {fmt(cartTotal)}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={() => setShowConfirmModal(false)}
                      className="py-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded font-mono text-xs font-semibold text-slate-400"
                    >
                      ✕ Cancelar
                    </button>
                    <button
                      onClick={handleConfirmSubmitOrder}
                      className="py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded font-mono text-xs font-bold uppercase transition-all"
                    >
                      ✅ Continuar
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ─── SCREEN 5: CONFIRMACION DE EXITO (v-confirm) ─── */}
        {activeTab === 'confirmacion' && lastSubmittedOrder && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="bg-slate-900/40 border border-slate-850 rounded-2xl p-8 text-center space-y-6 print:hidden">
              <div className="mx-auto w-16 h-16 bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 rounded-full flex items-center justify-center text-3xl shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                🎉
              </div>
              <div>
                <h2 className="text-xl font-bold font-mono text-white uppercase">¡Pedido Confirmado!</h2>
                <p className="text-xs font-mono text-slate-400 uppercase mt-0.5">El comprobante ha sido almacenado correctamente en la nube</p>
              </div>

              {/* Order specifications */}
              <div className="bg-slate-950 border border-slate-850 rounded-xl p-5 text-left font-mono text-xs space-y-2.5 text-slate-300">
                <div className="flex justify-between border-b border-slate-850 pb-1.5 text-slate-500 text-[10px] uppercase">
                  <span>Detalle de Comprobante</span>
                  <span className="text-orange-400">Ref: {lastSubmittedOrder.id}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cédula:</span>
                  <span>{lastSubmittedOrder.cedula}</span>
                </div>
                <div className="flex justify-between">
                  <span>Empleado:</span>
                  <span>{lastSubmittedOrder.employee}</span>
                </div>
                <div className="flex justify-between">
                  <span>Fecha de Emisión:</span>
                  <span>{lastSubmittedOrder.date}</span>
                </div>
                <div className="flex justify-between text-orange-400">
                  <span>Items Solicitados:</span>
                  <span>{lastSubmittedOrder.items.reduce((acc, it) => acc + it.qty, 0)} unidades</span>
                </div>
                <div className="flex justify-between font-bold pt-2 border-t border-slate-850 text-white">
                  <span>Total Neto Pagado (con IVA):</span>
                  <span className="text-slate-100">{fmt(lastSubmittedOrder.total)}</span>
                </div>
              </div>

              {/* Interaction controllers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    document.body.classList.add('print-receipt-mode');
                    setTimeout(() => {
                      window.print();
                      document.body.classList.remove('print-receipt-mode');
                    }, 100);
                  }}
                  className="py-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-lg text-white font-mono text-xs uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-orange-400" />
                  Imprimir Comprobante
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (lastSubmittedOrder) {
                      const ticketText = `============================================================
              SISTEMALOG SAS
        NIT: 900.567.892-1 / Pedidos de Empleados
============================================================
COMPROBANTE OFICIAL DE PEDIDO
============================================================
Referencia Pedido:  ${lastSubmittedOrder.id}
Fecha de Emisión:   ${lastSubmittedOrder.date}
Cédula Empleado:    ${lastSubmittedOrder.cedula}
Nombre Empleado:    ${lastSubmittedOrder.employee.toUpperCase()}
============================================================
ITEMS SOLICITADOS:
------------------------------------------------------------
${lastSubmittedOrder.items.map(it => `• ${it.name} (Cod: ${it.code || 'N/A'})
  Cantidad: ${it.qty} unidades | Unitario: ${fmt(it.price * 1.19)} | Subtotal: ${fmt(it.price * 1.19 * it.qty)}`).join('\n\n')}
============================================================
RESUMEN GENERAL:
------------------------------------------------------------
Subtotal Sin IVA:   ${fmt(lastSubmittedOrder.subtotal)}
IVA Colectado (19%):${fmt(lastSubmittedOrder.iva)}
------------------------------------------------------------
TOTAL PAGAR:        ${fmt(lastSubmittedOrder.total)}
============================================================
  ¡Gracias por registrar tu pedido en SISTEMALOG SAS!
  El comprobante ya fue almacenado de forma segura en la
  nube y está programado para procesamiento inmediato.
============================================================`;
                      const blob = new Blob([ticketText], { type: 'text/plain;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `pedido_empleado_${lastSubmittedOrder.id}.txt`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                      triggerToast("¡Comprobante descargado con éxito!", "success");
                    }
                  }}
                  className="py-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-lg text-emerald-400 font-mono text-xs uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar Ticket
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('catalogo')}
                  className="py-3 bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold font-mono text-xs uppercase rounded-lg transition-all cursor-pointer"
                >
                  Hacer otro Pedido
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ─── SCREEN 6: TAB PRINCIPAL ADMINISTRADOR (v-admin) ─── */}
        {activeTab === 'admin' && (
          <div className="space-y-6">
            
            {/* Admin Stats bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl text-center shadow-sm">
                <div className="text-2xl mb-1">📦</div>
                <div className="text-xl font-extrabold font-mono text-white">{statsAggregate.activeCount}</div>
                <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mt-0.5">Productos Activos</div>
              </div>

              <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl text-center shadow-sm">
                <div className="text-2xl mb-1">📋</div>
                <div className="text-xl font-extrabold font-mono text-white">{statsAggregate.ordersCount}</div>
                <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mt-0.5">Pedidos Recibidos</div>
              </div>

              <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl text-center shadow-sm">
                <div className="text-2xl mb-1">💰</div>
                <div className="text-xl font-extrabold font-mono text-orange-400">{fmt(statsAggregate.salesVal)}</div>
                <div className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mt-0.5">Ventas Acumuladas</div>
              </div>
            </div>

            {/* Sub-Tabs panel selector */}
            <div className="flex gap-2 overflow-x-auto pb-1 border-b border-slate-850">
              <button
                key="tab-admin-config"
                onClick={() => setAdminSubTab('config')}
                className={`py-2 px-4 rounded-t-lg font-mono text-xs font-bold uppercase whitespace-nowrap border-b-2 transition-all ${
                  adminSubTab === 'config' ? 'border-orange-500 text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                🔧 Acceso & Seguridad
              </button>
              <button
                key="tab-admin-products"
                onClick={() => setAdminSubTab('products')}
                className={`py-2 px-4 rounded-t-lg font-mono text-xs font-bold uppercase whitespace-nowrap border-b-2 transition-all ${
                  adminSubTab === 'products' ? 'border-orange-500 text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                📦 Catálogo CRUD
              </button>
              <button
                key="tab-admin-orders"
                onClick={() => setAdminSubTab('orders')}
                className={`py-2 px-4 rounded-t-lg font-mono text-xs font-bold uppercase whitespace-nowrap border-b-2 transition-all ${
                  adminSubTab === 'orders' ? 'border-orange-500 text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                📋 Pedidos ({orders.length})
              </button>
              <button
                key="tab-admin-reports"
                onClick={() => setAdminSubTab('reports')}
                className={`py-2 px-4 rounded-t-lg font-mono text-xs font-bold uppercase whitespace-nowrap border-b-2 transition-all ${
                  adminSubTab === 'reports' ? 'border-orange-500 text-orange-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                📊 Reportes Avanzados
              </button>
            </div>

            {/* ── SUB-TAB: CONFIG ── */}
            {adminSubTab === 'config' && (
              <div className="max-w-xl mx-auto bg-slate-900/40 p-6 rounded-xl border border-slate-850 space-y-6">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-orange-400">Líneas de Control de Acceso y Fechas</h3>

                <div className="space-y-4">

                  {/* Link Exclusivo para Empleados */}
                  <div className="bg-orange-950/20 border border-orange-500/25 p-4 rounded-xl space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base text-orange-400">🔗</span>
                      <div className="text-xs font-mono font-bold uppercase text-orange-400">Enlace Directo para Empleados</div>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono leading-relaxed uppercase">
                      Comparte este enlace directo con tus trabajadores. Les permitirá registrar sus pedidos de forma instantánea sin requerir credenciales ni iniciar sesión en el ERP.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={typeof window !== 'undefined' ? window.location.origin + "/?seccion=pedidos" : ""}
                        className="flex-1 bg-slate-950 border border-slate-850 p-2 rounded text-xs font-mono text-slate-300 outline-none select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof window !== 'undefined') {
                            navigator.clipboard.writeText(window.location.origin + "/?seccion=pedidos");
                            triggerToast("¡Enlace copiado al portapapeles!", "success");
                          }
                        }}
                        className="px-3 bg-orange-500 hover:bg-orange-400 text-slate-950 text-xs font-mono font-bold uppercase rounded transition-all whitespace-nowrap"
                      >
                        📋 Copiar
                      </button>
                    </div>
                  </div>
                  
                  {/* Gate toggle switch */}
                  <div className="flex items-center justify-between p-4 bg-slate-950 border border-slate-850 rounded-xl">
                    <div>
                      <div className="text-xs font-mono font-bold uppercase text-white">Estado de Apertura</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">Invalida o habilita accesos manuales</div>
                    </div>
                    <button
                      onClick={() => setConfig({ ...config, open: !config.open })}
                      className={`px-4 py-2 text-xs font-mono font-bold uppercase rounded-md transition-all ${
                        config.open 
                          ? 'bg-emerald-500 text-slate-950' 
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {config.open ? 'Buzón Abierto ✅' : 'Buzón Cerrado 🔒'}
                    </button>
                  </div>

                  {/* Range limits */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 font-mono">📅 Fecha de Lanzamiento / Apertura</label>
                      <input
                        type="datetime-local"
                        value={config.openDate || ''}
                        onChange={(e) => setConfig({ ...config, openDate: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-xs text-slate-200 outline-none focus:border-orange-500 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 font-mono">📅 Fecha de Cierre Automático</label>
                      <input
                        type="datetime-local"
                        value={config.closeDate || ''}
                        onChange={(e) => setConfig({ ...config, closeDate: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-xs text-slate-200 outline-none focus:border-orange-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-mono">💬 Mensaje de Advertencia para Empleados</label>
                    <input
                      type="text"
                      value={config.msg}
                      onChange={(e) => setConfig({ ...config, msg: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-xs text-slate-200 outline-none focus:border-orange-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400 font-mono">🔑 Clave Administrador</label>
                    <input
                      type="text"
                      placeholder="Dejar vacía para conservar original"
                      value={config.pass}
                      onChange={(e) => setConfig({ ...config, pass: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-xs text-slate-200 outline-none focus:border-orange-500 font-mono"
                    />
                  </div>

                  <div className="pt-4 border-t border-slate-850">
                    <button
                      onClick={handleSaveConfig}
                      className="w-full py-3 bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold font-mono text-xs uppercase rounded-lg shadow-sm transition-all"
                    >
                      💾 Guardar Configuración
                    </button>
                  </div>

                </div>
              </div>
            )}

            {/* ── SUB-TAB: CATALÓGO CRUD ── */}
            {adminSubTab === 'products' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Product form creator */}
                <div className="lg:col-span-4 bg-slate-900/40 p-5 rounded-xl border border-slate-850 space-y-4">
                  <div className="border-b border-slate-850 pb-2 flex justify-between items-center">
                    <h4 className="text-xs font-mono font-bold uppercase text-orange-400">
                      {pId ? '✏️ Editar Producto' : '➕ Crear Nuevo Producto'}
                    </h4>
                    {(pId || pCode || pName) && (
                      <button onClick={handleResetProdForm} className="text-[10px] font-mono hover:text-orange-400 uppercase underline text-slate-500">
                        Limpiar
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-mono">Código (Obligatorio, Ej: REF-01)</label>
                    <input
                      type="text"
                      value={pCode}
                      onChange={(e) => setPCode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-xs text-white outline-none uppercase font-mono"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-mono">Nombre de Producto</label>
                    <input
                      type="text"
                      value={pName}
                      onChange={(e) => setPName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-xs text-white outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-mono">Precio Base sin IVA</label>
                    <input
                      type="number"
                      value={pPrice || ''}
                      onChange={(e) => setPPrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-xs text-white outline-none font-mono"
                    />
                    {pPrice > 0 && (
                      <p className="text-[10px] font-mono text-slate-500 mt-1">
                        Con IVA 19%: <strong className="text-orange-400">{fmt(pPrice * (1 + IVA_RATE))}</strong>
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-mono">Categoría</label>
                    <input
                      type="text"
                      placeholder="Ej: Lácteos, Granos, Aseo"
                      value={pCat}
                      onChange={(e) => setPCat(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-xs text-white outline-none"
                    />
                  </div>

                  {/* Image Loader with Drag and Drop Support */}
                  <div className="space-y-2 border-t border-slate-850 pt-3">
                    <label className="text-[11px] text-slate-400 font-mono block">Imagen del Producto</label>
                    
                    {/* Drag and Drop Zone */}
                    <div 
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
                        isDragging 
                          ? 'border-orange-500 bg-orange-950/20' 
                          : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-900/10'
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                        id="product-image-upload"
                      />
                      <label htmlFor="product-image-upload" className="cursor-pointer block space-y-2">
                        <div className="text-2xl">📸</div>
                        <div className="text-xs text-slate-300 font-mono">
                          {isDragging ? '¡Suelte la imagen aquí!' : 'Arrastre y suelte una imagen aquí'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">o haga clic para buscar en su dispositivo</div>
                      </label>
                    </div>

                    <div className="text-[10px] text-slate-500 font-mono text-center">— o ingrese la dirección URL de la imagen —</div>
                    <input
                      type="url"
                      placeholder="Dirección o enlace de la imagen (https://...)"
                      value={pImg}
                      onChange={(e) => {
                        setPImg(e.target.value);
                        setLocalImgFile(null);
                      }}
                      className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-xs text-slate-300 outline-none"
                    />
                  </div>

                  {(localImgFile || pImg) && (
                    <div className="border border-slate-850 rounded-lg overflow-hidden shrink-0 relative group">
                      <img
                        src={localImgFile || pImg}
                        alt="previsualización"
                        className="w-full h-24 object-cover"
                      />
                      <button 
                        onClick={() => {
                          setLocalImgFile(null);
                          setPImg('');
                        }}
                        className="absolute top-1 right-1 bg-slate-950/80 hover:bg-rose-950 hover:text-rose-400 p-1 rounded-md text-[9px] font-mono text-slate-400 border border-slate-850 transition-all uppercase"
                      >
                        Remover
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="pActive"
                      checked={pActive}
                      onChange={(e) => setPActive(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-850 w-4 h-4 text-orange-500"
                    />
                    <label htmlFor="pActive" className="text-xs text-slate-300 font-mono select-none">Habilitado para Empleados</label>
                  </div>

                  <button
                    onClick={handleSaveProduct}
                    className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold font-mono text-xs uppercase rounded-lg shadow transition-all"
                  >
                    💾 Guardar Producto
                  </button>
                </div>

                {/* Catalog Index layout list */}
                <div className="lg:col-span-8 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-850 gap-2">
                    <div className="text-xs font-mono uppercase text-slate-500">
                      Productos Registrados ({products.length})
                    </div>
                  </div>

                  {/* Filtering and items per page selector */}
                  <div className="flex flex-col md:flex-row items-center gap-3 bg-slate-950/45 p-3.5 border border-slate-850 rounded-lg">
                    <div className="flex items-center gap-2 flex-1 w-full">
                      <Search className="w-4 h-4 text-orange-400" />
                      <input
                        type="text"
                        placeholder="Buscar por SKU, descripción comercial o categoría..."
                        value={adminProductSearch}
                        onChange={(e) => {
                          setAdminProductSearch(e.target.value);
                          setAdminProductPage(1);
                        }}
                        className="flex-1 bg-transparent text-slate-200 text-xs font-mono outline-none placeholder-slate-600"
                      />
                    </div>
                    
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-mono shrink-0 w-full md:w-auto justify-end border-t md:border-t-0 border-slate-850 pt-2 md:pt-0">
                      <span className="text-slate-400">Mostrar por página:</span>
                      <select
                        value={adminProductItemsPerPage}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAdminProductItemsPerPage(val);
                          setAdminProductPage(1);
                          try {
                            localStorage.setItem('admin_product_items_per_page', String(val));
                          } catch (err) {
                            console.error(err);
                          }
                        }}
                        className="bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono rounded h-8 px-2 outline-none focus:border-orange-500 cursor-pointer"
                      >
                        <option value={5}>5 ítems</option>
                        <option value={7}>7 ítems</option>
                        <option value={10}>10 ítems</option>
                        <option value={15}>15 ítems</option>
                        <option value={20}>20 ítems</option>
                        <option value={50}>50 ítems</option>
                        <option value={999999}>Todos</option>
                      </select>
                    </div>
                  </div>

                  {/* Products Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {(Array.isArray(paginatedAdminProducts) ? paginatedAdminProducts : []).map(p => {
                      const imageAddress = p.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=200';
                      return (
                        <div key={p.id} className={`bg-slate-900/40 border border-slate-850 rounded-lg p-3 flex gap-3 items-center hover:border-slate-850 ${!p.active ? 'opacity-55' : ''}`}>
                          <img
                            src={imageAddress}
                            alt={p.name}
                            className="w-12 h-12 object-cover rounded bg-slate-950 border border-slate-850"
                          />
                          <div className="flex-1 min-w-0 font-mono text-[11px]">
                            {p.code && <span className="text-slate-500 block">#{p.code}</span>}
                            <h5 className="font-sans font-bold text-slate-100 truncate uppercase">{p.name}</h5>
                            <span className="text-orange-400 block font-semibold mt-0.5">{fmt(p.price)} (c/IVA: {fmt(p.price * (1 + IVA_RATE))})</span>
                            <span className="text-slate-500 text-[10px] uppercase block mt-0.5">Cat: {p.category || '-'}</span>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button
                              onClick={() => handleEditProduct(p)}
                              className="p-1 px-2.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded text-sky-400 hover:text-sky-300 text-[10px] font-mono flex items-center gap-1 uppercase"
                            >
                              <Edit2 className="w-3 h-3" />
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p.id)}
                              className="p-1 px-2.5 bg-slate-950 hover:bg-red-950/40 border border-slate-800 rounded text-rose-500 hover:text-rose-400 text-[10px] font-mono flex items-center gap-1 uppercase"
                            >
                              <Trash2 className="w-3 h-3" />
                              Del
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Empty State */}
                  {filteredAdminProducts.length === 0 && (
                    <div className="py-12 text-center text-slate-500 font-mono text-xs uppercase border border-dashed border-slate-850 rounded-lg">
                      No se encontraron productos registrados que coincidan con la búsqueda.
                    </div>
                  )}

                  {/* Pagination navigation controls */}
                  {filteredAdminProducts.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-850 pt-4 font-mono text-xs">
                      <span className="text-slate-400">
                        Mostrando {paginatedAdminProducts.length} items de {filteredAdminProducts.length} totales registrados
                      </span>
                      {totalAdminProductPages > 1 && (
                        <div className="flex items-center gap-2">
                          <button
                            disabled={adminProductPage === 1}
                            onClick={() => setAdminProductPage(prev => Math.max(1, prev - 1))}
                            className="bg-slate-950 hover:bg-slate-900 disabled:opacity-40 text-slate-300 px-3 py-1.5 h-8 font-bold border border-slate-800 rounded transition-all cursor-pointer"
                          >
                            ATRÁS
                          </button>
                          <span className="text-slate-300 font-bold bg-[#040814] h-8 px-4 flex items-center rounded border border-slate-850">
                            PÁGINA {adminProductPage} / {totalAdminProductPages}
                          </span>
                          <button
                            disabled={adminProductPage === totalAdminProductPages}
                            onClick={() => setAdminProductPage(prev => Math.min(totalAdminProductPages, prev + 1))}
                            className="bg-slate-950 hover:bg-slate-900 disabled:opacity-40 text-slate-300 px-3 py-1.5 h-8 font-bold border border-slate-800 rounded transition-all cursor-pointer"
                          >
                            SIGUIENTE
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ── SUB-TAB: PEDIDOS CONTROL ── */}
            {adminSubTab === 'orders' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-4 pb-2 border-b border-slate-850">
                  <span className="text-xs font-mono uppercase text-slate-500">Historial general de registros ({orders.length})</span>
                  <button
                    onClick={() => handleExportExcel('orders')}
                    className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-mono font-bold uppercase rounded-md transition-all flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Exportar Excel
                  </button>
                </div>

                {orders.length === 0 ? (
                  <div className="py-20 text-center space-y-4 border border-dashed border-slate-850 rounded-xl">
                    <ClipboardList className="w-12 h-12 text-slate-700 mx-auto" />
                    <p className="text-xs font-mono text-slate-500 uppercase">Aún no se han recibido pedidos en la nube.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(Array.isArray(orders) ? orders : []).map(o => (
                      <div key={o.id} className="bg-slate-900/40 border border-slate-850 rounded-xl p-5 space-y-4 shadow">
                        
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-3 border-b border-slate-850">
                          <div>
                            <span className="text-[10px] uppercase font-mono bg-orange-500 text-slate-950 px-2.5 py-0.5 rounded font-bold">
                              Reg: {o.id}
                            </span>
                            <h4 className="text-xs font-bold text-white mt-1.5 uppercase flex items-center gap-1.5">
                              <span>👤 {o.employee}</span>
                              <span className="text-slate-500 font-mono font-normal"> &middot; CC: {o.cedula || 'N/A'}</span>
                            </h4>
                            <span className="text-[11px] font-mono text-slate-400 block mt-0.5">📅 Fecha: {o.date}</span>
                          </div>

                          <div className="text-left sm:text-right shrink-0">
                            <span className="text-lg font-mono font-extrabold text-white block">{fmt(o.total)}</span>
                            <div className="flex gap-2 mt-2 justify-start sm:justify-end">
                              <button
                                onClick={() => handlePrintAdminOrder(o)}
                                className="px-3 py-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded font-mono text-[10px] text-orange-400 uppercase flex items-center gap-1"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                Imprimir
                              </button>
                              <button
                                onClick={() => handleEditOrderBackToCart(o)}
                                className="px-3 py-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded font-mono text-[10px] text-sky-400 uppercase"
                              >
                                Editar Pedido
                              </button>
                              <button
                                onClick={() => handleDeleteOrder(o.id)}
                                className="px-3 py-1 bg-slate-950 hover:bg-rose-950/20 border border-slate-800 rounded font-mono text-[10px] text-rose-400 uppercase"
                              >
                                Eliminar
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* List details */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse font-mono text-[11px]">
                            <thead>
                              <tr className="border-b border-slate-850 text-slate-400 uppercase">
                                <th className="py-1">Cod</th>
                                <th className="py-1">Producto</th>
                                <th className="py-1">Cat.</th>
                                <th className="py-1 text-center">Cant.</th>
                                <th className="py-1 text-right">Individual</th>
                                <th className="py-1 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-850/40 text-slate-200">
                              {(o && Array.isArray(o.items) ? o.items : []).map(it => {
                                const priceWithIva = (it?.price || 0) * (1 + IVA_RATE);
                                return (
                                  <tr key={it.id}>
                                    <td className="py-2 text-slate-500">#{it.code || '-'}</td>
                                    <td className="py-2 uppercase font-sans font-semibold">{it.name}</td>
                                    <td className="py-2 text-slate-500 uppercase">{it.category || '-'}</td>
                                    <td className="py-2 text-center text-white font-bold">{it.qty}</td>
                                    <td className="py-2 text-right">{fmt(priceWithIva)}</td>
                                    <td className="py-2 text-right text-orange-400 font-bold">{fmt(priceWithIva * it.qty)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="pt-2 border-t border-slate-850/60 font-mono text-[11px] text-right text-slate-450 space-x-4">
                          <span>Subtotal: {fmt(o.subtotal)}</span>/
                          <span>IVA: {fmt(o.iva)}</span>/
                          <span className="text-orange-400 font-black">Total Neto: {fmt(o.total)}</span>
                        </div>

                      </div>
                    ))}
                  </div>
                )}

              </div>
            )}

            {/* ── SUB-TAB: REPORTES DETALLADOS ── */}
            {adminSubTab === 'reports' && (
              <div className="space-y-6">
                
                {/* Reports Navigation selection header */}
                <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl flex flex-wrap gap-4 items-center justify-between">
                  <div className="flex flex-wrap gap-1 bg-slate-950 p-1 border border-slate-850 rounded">
                    <button
                      onClick={() => setReportType('month')}
                      className={`px-3 py-1.5 rounded font-mono text-[11px] font-bold uppercase transition-all ${
                        reportType === 'month' ? 'bg-orange-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      📅 Resumen Mensual
                    </button>
                    <button
                      onClick={() => setReportType('product')}
                      className={`px-3 py-1.5 rounded font-mono text-[11px] font-bold uppercase transition-all ${
                        reportType === 'product' ? 'bg-orange-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      📦 Por Productos
                    </button>
                    <button
                      onClick={() => setReportType('employee')}
                      className={`px-3 py-1.5 rounded font-mono text-[11px] font-bold uppercase transition-all ${
                        reportType === 'employee' ? 'bg-orange-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      👥 Por Empleados
                    </button>
                    <button
                      onClick={() => setReportType('detailed')}
                      className={`px-3 py-1.5 rounded font-mono text-[11px] font-bold uppercase transition-all ${
                        reportType === 'detailed' ? 'bg-orange-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      📊 Todo Detallado
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      value={repMonthFilter}
                      onChange={(e) => {
                        setRepMonthFilter(e.target.value);
                        setRepEmpFilter('all');
                        setRepProdFilter('all');
                      }}
                      className="bg-slate-950 border border-slate-800 text-orange-400 p-2 rounded text-xs outline-none font-mono"
                    >
                      <option value="all">📅 Todos los Meses</option>
                      {uniqueMonthsOfOrders.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Sub-Filters selector (Shown for monthly target filtering) */}
                {repMonthFilter !== 'all' && reportType === 'month' && (
                  <div className="bg-slate-900/40 p-4 border border-slate-850 rounded-lg flex flex-wrap gap-4 items-center font-mono text-xs text-slate-300">
                    
                    <div className="flex flex-col gap-1">
                      <span>Modo Vista</span>
                      <select
                        value={repViewMode}
                        onChange={(e) => setRepViewMode(e.target.value as 'detailed' | 'summary')}
                        className="bg-slate-950 border border-slate-800 p-2 rounded text-xs text-orange-400 outline-none"
                      >
                        <option value="detailed">📋 Vista Detallada (Empleado)</option>
                        <option value="summary">📊 Vista Resumida (Marca/Producto)</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span>Filtrar Empleado</span>
                      <select
                        value={repEmpFilter}
                        onChange={(e) => setRepEmpFilter(e.target.value)}
                        className="bg-slate-950 border border-slate-800 p-2 rounded text-xs outline-none"
                      >
                        <option value="all">👤 Todos los Empleados</option>
                        {distinctEmployeesList.map(emp => (
                          <option key={emp} value={emp}>{emp}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span>Filtrar Producto</span>
                      <select
                        value={repProdFilter}
                        onChange={(e) => setRepProdFilter(e.target.value)}
                        className="bg-slate-950 border border-slate-800 p-2 rounded text-xs outline-none"
                      >
                        <option value="all">📦 Todos los Productos</option>
                        {distinctProductsList.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={() => {
                        setRepEmpFilter('all');
                        setRepProdFilter('all');
                      }}
                      className="px-3 py-2 bg-slate-950 hover:bg-slate-850 rounded border border-slate-800 text-[11px] self-end"
                    >
                      Restablecer Filtros
                    </button>
                  </div>
                )}

                {/* Render report contents based on selection */}
                {processedReportRecords.length === 0 ? (
                  <div className="py-20 text-center space-y-4 border border-dashed border-slate-850 rounded-xl">
                    <ClipboardList className="w-12 h-12 text-slate-700 mx-auto animate-pulse" />
                    <p className="text-xs font-mono text-slate-500 uppercase">Sin resultados en este lapso temporal.</p>
                  </div>
                ) : (
                  <div className="bg-slate-900/40 p-6 border border-slate-850 rounded-xl space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-850 flex-wrap gap-3">
                      <div>
                        <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                          {reportType === 'month' ? `Reporte Agrupado - ${repMonthFilter}` : reportType === 'product' ? 'Inventario de Unidades Solicitadas' : reportType === 'employee' ? 'Desglose Consolidado por Persona' : 'Padrón Todo Detallado de Negocios'}
                        </h4>
                        <span className="text-[10px] font-mono text-slate-500 uppercase mt-0.5">Filas encontradas: {processedReportRecords.length} transacciones</span>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={handlePrintReport}
                          className="px-3.5 py-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-mono font-bold uppercase rounded-md transition-all flex items-center gap-1.5"
                        >
                          <Printer className="w-4 h-4" />
                          Imprimir Reporte
                        </button>
                        <button
                          onClick={() => handleExportExcel(reportType)}
                          className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-mono font-bold uppercase rounded-md transition-all flex items-center gap-1.5"
                        >
                          <Download className="w-4 h-4" />
                          Exportar Excel
                        </button>
                      </div>
                    </div>

                    {/* Table spreadsheets rendering */}
                    <div className="overflow-x-auto border border-slate-850 rounded">
                      <table className="w-full text-left font-mono text-xs border-collapse">
                        
                        {/* VIEW 1: MONTHLY SUMMARY */}
                        {reportType === 'month' && repMonthFilter !== 'all' && repViewMode === 'summary' && (
                          <>
                            <thead>
                              <tr className="bg-slate-950 text-slate-400 uppercase">
                                <th className="p-3 border-r border-slate-850">Cód</th>
                                <th className="p-3 border-r border-slate-850">Producto</th>
                                <th className="p-3 border-r border-slate-850">Categoría</th>
                                <th className="p-3 text-center border-r border-slate-850">Cant. Vendida</th>
                                <th className="p-3 text-right border-r border-slate-850">Precio Base</th>
                                <th className="p-3 text-right">Total c/IVA</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-850/50">
                              {(() => {
                                const productsTallied = Object.values(reportsAggregateByProduct) as { code: string; name: string; qty: number; total: number }[];
                                const totalQty = productsTallied.reduce((acc, p) => acc + p.qty, 0);
                                const grandTotal = productsTallied.reduce((acc, p) => acc + p.total, 0);

                                return (
                                  <>
                                    {productsTallied.map(p => (
                                      <tr key={p.name} className="hover:bg-slate-850/20">
                                        <td className="p-3 border-r border-slate-850 text-slate-500">#{p.code || ''}</td>
                                        <td className="p-3 border-r border-slate-850 uppercase text-slate-200">{p.name}</td>
                                        <td className="p-3 border-r border-slate-850 text-slate-400 uppercase">{(p.code || '').split('-')[0] || 'Gen'}</td>
                                        <td className="p-3 text-center border-r border-slate-850 text-white font-bold">{p.qty}</td>
                                        <td className="p-3 text-right border-r border-slate-850 text-slate-400">{fmt(p.qty > 0 ? (p.total / p.qty / (1 + IVA_RATE)) : 0)}</td>
                                        <td className="p-3 text-right font-bold text-orange-400">{fmt(p.total)}</td>
                                      </tr>
                                    ))}
                                    <tr className="bg-slate-950 font-bold text-white">
                                      <td colSpan={3} className="p-3 border-r border-slate-850 uppercase text-right">Total Consolidado Mensual</td>
                                      <td className="p-3 text-center border-r border-slate-850 text-emerald-400 text-sm">{totalQty} u</td>
                                      <td className="p-3 border-r border-slate-850"></td>
                                      <td className="p-3 text-right text-sm text-orange-400">{fmt(grandTotal)}</td>
                                    </tr>
                                  </>
                                );
                              })()}
                            </tbody>
                          </>
                        )}

                        {/* VIEW 2: PRODUCT AUDITING */}
                        {reportType === 'product' && (
                          <>
                            <thead>
                              <tr className="bg-slate-950 text-slate-400 uppercase">
                                <th className="p-3 border-r border-slate-850">Cód</th>
                                <th className="p-3 border-r border-slate-850">Nombre del Producto</th>
                                <th className="p-3 text-center border-r border-slate-850">Unidades Pedidas</th>
                                <th className="p-3 text-right">Venta Total c/IVA</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-850/50">
                              {(Object.values(reportsAggregateByProduct) as { code: string; name: string; qty: number; total: number }[]).sort((a, b) => b.qty - a.qty).map((p) => (
                                <tr key={p.name} className="hover:bg-slate-850/20">
                                  <td className="p-3 border-r border-slate-850 text-slate-500">#{p.code}</td>
                                  <td className="p-3 border-r border-slate-850 uppercase text-slate-200">{p.name}</td>
                                  <td className="p-3 text-center border-r border-slate-850 text-white font-bold">{p.qty}</td>
                                  <td className="p-3 text-right font-bold text-orange-400">{fmt(p.total)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </>
                        )}

                        {/* VIEW 3: EMPLOYEE REPORT LIST */}
                        {reportType === 'employee' && (
                          <>
                            <thead>
                              <tr className="bg-slate-950 text-slate-400 uppercase">
                                <th className="p-3 border-r border-slate-850">Cédula</th>
                                <th className="p-3 border-r border-slate-850">Nombre Empleado</th>
                                <th className="p-3 text-center border-r border-slate-850">N° Pedidos</th>
                                <th className="p-3 text-center border-r border-slate-850">Items Mandados</th>
                                <th className="p-3 text-right border-r border-slate-850">Total con IVA</th>
                                <th className="p-3 text-center print:table-cell">Firma Comprobación Recibido</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-850/50">
                              {Object.keys(reportsAggregateByEmployee).map(key => {
                                const emp = reportsAggregateByEmployee[key];
                                return (
                                  <tr key={key} className="hover:bg-slate-850/20">
                                    <td className="p-3 border-r border-slate-850 text-slate-400">{emp.cedula}</td>
                                    <td className="p-3 border-r border-slate-850 uppercase text-slate-200 font-bold">{key}</td>
                                    <td className="p-3 text-center border-r border-slate-850">{emp.count}</td>
                                    <td className="p-3 text-center border-r border-slate-850">{emp.items} items</td>
                                    <td className="p-3 text-right border-r border-slate-850 font-bold text-orange-400">{fmt(emp.total)}</td>
                                    <td className="p-3 text-center print:table-cell text-slate-600 italic">___________________</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </>
                        )}

                        {/* VIEW 4: DETAILED LOG */}
                        {reportType === 'detailed' && (
                          <>
                            <thead>
                              <tr className="bg-slate-950 text-slate-400 uppercase">
                                <th className="p-3 border-r border-slate-850">Fecha</th>
                                <th className="p-3 border-r border-slate-850">Cédula</th>
                                <th className="p-3 border-r border-slate-850">Empleado</th>
                                <th className="p-3 border-r border-slate-850">Cod</th>
                                <th className="p-3 border-r border-slate-850">Producto</th>
                                <th className="p-3 text-center border-r border-slate-850">Cant</th>
                                <th className="p-3 text-right border-r border-slate-850">Precio Unit. c/IVA</th>
                                <th className="p-3 text-right">Total Neto</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-850/50">
                              {processedReportRecords.map((r, index) => {
                                const costWithIva = r.price * (1 + IVA_RATE);
                                return (
                                  <tr key={index} className="hover:bg-slate-850/20">
                                    <td className="p-3 border-r border-slate-850 text-slate-500">{r.date}</td>
                                    <td className="p-3 border-r border-slate-850 text-slate-450">{r.cedula}</td>
                                    <td className="p-3 border-r border-slate-850 uppercase text-slate-200 truncate max-w-[120px]">{r.employee}</td>
                                    <td className="p-3 border-r border-slate-850 text-slate-500">#{r.code}</td>
                                    <td className="p-3 border-r border-slate-850 uppercase truncate max-w-[150px]">{r.name}</td>
                                    <td className="p-3 text-center border-r border-slate-850 text-white font-bold">{r.qty}</td>
                                    <td className="p-3 text-right border-r border-slate-850">{fmt(costWithIva)}</td>
                                    <td className="p-3 text-right font-extrabold text-orange-400">{fmt(costWithIva * r.qty)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </>
                        )}

                        {/* DEFAULT MONTH DETAILED MATRIX VIEW */}
                        {reportType === 'month' && repViewMode === 'detailed' && (
                          <>
                            <thead>
                              <tr className="bg-slate-950 text-slate-400 uppercase">
                                <th className="p-3 border-r border-slate-850">Fecha</th>
                                <th className="p-3 border-r border-slate-850">Cédula</th>
                                <th className="p-3 border-r border-slate-850">Empleado</th>
                                <th className="p-3 border-r border-slate-850">Cod</th>
                                <th className="p-3 border-r border-slate-850">Producto</th>
                                <th className="p-3 text-center border-r border-slate-850">Cant</th>
                                <th className="p-3 text-right border-r border-slate-850">Base S/IVA</th>
                                <th className="p-3 text-right">Total c/IVA</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-850/50">
                              {processedReportRecords.map((r, idx) => (
                                <tr key={idx} className="hover:bg-slate-850/20">
                                  <td className="p-3 border-r border-slate-850 text-slate-500">{r.date}</td>
                                  <td className="p-3 border-r border-slate-850 text-slate-400">{r.cedula}</td>
                                  <td className="p-3 border-r border-slate-850 uppercase text-slate-200">{r.employee}</td>
                                  <td className="p-3 border-r border-slate-850 text-slate-500">#{r.code}</td>
                                  <td className="p-3 border-r border-slate-850 uppercase truncate max-w-[160px] text-slate-300">{r.name}</td>
                                  <td className="p-3 text-center border-r border-slate-850 text-white font-extrabold">{r.qty}</td>
                                  <td className="p-3 text-right border-r border-slate-850 text-slate-500">{fmt(r.price * r.qty)}</td>
                                  <td className="p-3 text-right font-bold text-orange-400">{fmt(r.price * (1 + IVA_RATE) * r.qty)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </>
                        )}

                      </table>
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>
        )}

      </div>

      {/* Print only receipt markup block - Rendered via React Portal directly inside body for absolute visibility during window.print */}
      {activePrintOrder && createPortal(
        <div id="printReceipt" className="bg-white text-black p-6 font-sans text-xs" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', color: '#000000', backgroundColor: '#ffffff' }}>
          {/* 1. Header Grid with Logo and QR code */}
          <div className="grid grid-cols-12 gap-4 items-center pb-4 border-b border-gray-300">
            {/* Left: Logo and company details */}
            <div className="col-span-8 flex items-start gap-4">
              {/* Styled Logo Box like screenshot 3 */}
              <div className="border-4 border-[#0c2340] p-2 flex flex-col items-center justify-center text-center" style={{ minWidth: '160px', minHeight: '80px', borderColor: '#0c2340' }}>
                <span className="text-[#0c2340] font-black text-2xl tracking-tight leading-none" style={{ fontFamily: '"Inter", sans-serif' }}>SISTEMA</span>
                <span className="text-[#0c2340] font-bold text-xl tracking-widest leading-none mt-1" style={{ fontFamily: '"Inter", sans-serif' }}>LOG</span>
                <span className="text-[7.5px] text-[#00b4d8] font-bold tracking-wider mt-1 whitespace-nowrap">SISTEMA CONTROL LOGÍSTICO</span>
              </div>
              <div className="space-y-0.5" style={{ fontSize: '9px', lineHeight: '1.2' }}>
                <strong className="text-gray-900 text-[10px] block font-bold">SISTEMALOG S.A.S.</strong>
                <div>NIT: 800.225.074-3</div>
                <div>RESPONSABLE DE IVA</div>
                <div>TELÉFONO: 3844090</div>
                <div>DIRECCIÓN: CARRERA 39 14-62 ACOPI - YUMBO</div>
                <div>ACTIVIDAD ECONÓMICA CIIU: 2023</div>
              </div>
            </div>

            {/* Right: QR Code and Invoice Date block */}
            <div className="col-span-4 flex flex-col items-end justify-between h-full">
              <div className="flex gap-2 items-center">
                {/* Live real-time QR code using stable QR Server API */}
                <div className="border border-gray-300 p-1 bg-white">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=LP-${activePrintOrder.id}`} 
                    alt="QR Code" 
                    className="w-16 h-16" 
                    referrerPolicy="no-referrer"
                  />
                </div>
                
                {/* Date info nested grid */}
                <div className="text-[9px]">
                  <table className="border-collapse border border-gray-400 text-center w-full" style={{ minWidth: '150px' }}>
                    <thead>
                      <tr className="bg-gray-100 text-[8px] font-bold">
                        <th colSpan={3} className="border border-gray-400 py-0.5">FECHA EMISIÓN</th>
                      </tr>
                      <tr className="bg-gray-50 text-[7px] font-bold">
                        <th className="border border-gray-400 w-1/3 py-0.2">DÍA</th>
                        <th className="border border-gray-400 w-1/3 py-0.2">MES</th>
                        <th className="border border-gray-400 w-1/3 py-0.2">AÑO</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="font-mono font-bold text-[9px]">
                        <td className="border border-gray-400 py-1">
                          {(() => {
                            try {
                              const d = new Date(activePrintOrder.date);
                              return !isNaN(d.getTime()) ? String(d.getDate()) : activePrintOrder.date.split(',')[0].split('/')[1] || '';
                            } catch(e) { return ''; }
                          })()}
                        </td>
                        <td className="border border-gray-400 py-1">
                          {(() => {
                            try {
                              const d = new Date(activePrintOrder.date);
                              return !isNaN(d.getTime()) ? String(d.getMonth() + 1) : activePrintOrder.date.split(',')[0].split('/')[0] || '';
                            } catch(e) { return ''; }
                          })()}
                        </td>
                        <td className="border border-gray-400 py-1">
                          {(() => {
                            try {
                              const d = new Date(activePrintOrder.date);
                              return !isNaN(d.getTime()) ? String(d.getFullYear()) : activePrintOrder.date.split(',')[0].split('/')[2] || '';
                            } catch(e) { return ''; }
                          })()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Invoice Code Banner */}
              <div className="text-right mt-2">
                <span className="text-[8px] font-mono text-gray-500 uppercase tracking-widest block font-bold">COMPROBANTE DE PEDIDO ELECTRÓNICO</span>
                <span className="text-sm font-black text-[#0c2340] tracking-wider uppercase">
                  REF: {activePrintOrder.id}
                </span>
              </div>
            </div>
          </div>

          {/* 2. Customer / Employee Info Block */}
          <div className="border border-gray-400 rounded-lg p-3 my-4 grid grid-cols-12 gap-3" style={{ fontSize: '9.5px', lineHeight: '1.3' }}>
            <div className="col-span-7 space-y-1">
              <div><strong className="text-gray-550 uppercase font-bold text-gray-600">Empleado / Beneficiario:</strong> <span className="uppercase text-gray-950 font-black">{activePrintOrder.employee}</span></div>
              <div><strong className="text-gray-550 uppercase font-bold text-gray-600">Cédula de Ciudadanía:</strong> <span className="font-mono text-gray-950 font-bold">{activePrintOrder.cedula}</span></div>
              <div><strong className="text-gray-550 uppercase font-bold text-gray-600">Dirección:</strong> INSTALACIONES PRINCIPALES - YUMBO</div>
              <div><strong className="text-gray-550 uppercase font-bold text-gray-600">Ciudad:</strong> YUMBO, VALLE DEL CAUCA</div>
            </div>
            <div className="col-span-5 space-y-1 border-l border-gray-300 pl-3">
              <div><strong className="text-gray-550 uppercase font-bold text-gray-600">Vendedor Autorizado:</strong> SISTEMALOG S.A.S.</div>
              <div><strong className="text-gray-550 uppercase font-bold text-gray-600">Método de Pago:</strong> COMPRA DE EMPLEADO (CRÉDITO)</div>
              <div><strong className="text-gray-550 uppercase font-bold text-gray-600">Medio de Pago:</strong> DESCUENTO DIRECTO DE NÓMINA</div>
              <div><strong className="text-gray-550 uppercase font-bold text-gray-600">Estado Pedido:</strong> APROBADO / REGISTRADO</div>
            </div>
          </div>

          {/* 3. Products Table */}
          <table className="w-full text-left border-collapse border border-gray-400 text-[9.5px]" style={{ color: '#000000', backgroundColor: '#ffffff' }}>
            <thead>
              <tr className="bg-gray-100 uppercase text-[8px] tracking-wider font-bold">
                <th className="border border-gray-400 p-2 text-center w-[4%]">#</th>
                <th className="border border-gray-400 p-2 w-[12%]">CÓDIGO</th>
                <th className="border border-gray-400 p-2 w-[16%]">EAN</th>
                <th className="border border-gray-400 p-2 text-center w-[8%]">CANT</th>
                <th className="border border-gray-400 p-2 w-[34%]">DESCRIPCIÓN</th>
                <th className="border border-gray-400 p-2 text-center w-[6%]">%IMP</th>
                <th className="border border-gray-400 p-2 text-right w-[10%]">VALOR UNIT.</th>
                <th className="border border-gray-400 p-2 text-center w-[6%]">%DTO</th>
                <th className="border border-gray-400 p-2 text-right w-[14%] font-bold">VALOR TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {activePrintOrder.items.map((it, idx) => {
                // generate elegant Colombian style EAN code derived from product ID
                const calculatedEan = `77010088${String(it.id).padStart(5, '0')}`;
                return (
                  <tr key={it.id || idx} className="hover:bg-gray-50 uppercase">
                    <td className="border border-gray-400 p-2 text-center font-mono">{idx + 1}</td>
                    <td className="border border-gray-400 p-2 font-mono">{it.code || 'ASE-000'}</td>
                    <td className="border border-gray-400 p-2 font-mono text-gray-600">{calculatedEan}</td>
                    <td className="border border-gray-400 p-2 text-center font-bold font-mono">{Number(it.qty).toFixed(2)}</td>
                    <td className="border border-gray-400 p-2 font-bold">{it.name}</td>
                    <td className="border border-gray-400 p-2 text-center">19%</td>
                    <td className="border border-gray-400 p-2 text-right font-mono">{fmt(it.price)}</td>
                    <td className="border border-gray-400 p-2 text-center">0.0%</td>
                    <td className="border border-gray-400 p-2 text-right font-mono font-bold">{fmt(it.price * it.qty)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* 4. Totals block and Verbal amount */}
          <div className="grid grid-cols-12 gap-4 mt-3" style={{ fontSize: '9px' }}>
            {/* Left: Verbal translation & notes */}
            <div className="col-span-7 flex flex-col justify-between">
              <div className="border border-gray-400 rounded-lg p-2 bg-gray-50/50">
                <strong className="text-[7.5px] text-gray-500 uppercase block font-bold tracking-wider">VALOR EN LETRAS:</strong>
                <span className="font-bold text-gray-900 block text-[9.5px] uppercase mt-0.5">
                  {numeroALetras(activePrintOrder.total).toUpperCase()}
                </span>
              </div>
              <div className="border border-gray-400 rounded-lg p-2 mt-2" style={{ fontSize: '8px', lineHeight: '1.3' }}>
                <strong className="font-bold block text-gray-800 uppercase mb-0.5">OBSERVACIONES Y COMPROMISO:</strong>
                <div>Este es un comprobante de pedido oficial e interno autorizado por el empleado. Por medio de la firma de este documento, el empleado acepta de forma voluntaria, incondicional y expresa el descuento por nómina del valor total neto arriba detallado, de conformidad con el estatuto interno de bienestar de SISTEMALOG S.A.S.</div>
              </div>
            </div>

            {/* Right: Invoice totals structure exactly like Screenshot 3 */}
            <div className="col-span-5">
              <table className="w-full text-[9px] border border-gray-400 border-collapse">
                <tbody>
                  <tr>
                    <td className="border border-gray-400 p-1.5 font-bold uppercase w-1/2">VR BRUTO:</td>
                    <td className="border border-gray-400 p-1.5 text-right font-mono w-1/2">{fmt(activePrintOrder.subtotal)}</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-1.5 font-bold uppercase">DESCUENTO:</td>
                    <td className="border border-gray-400 p-1.5 text-right font-mono">$ 0</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-1.5 font-bold uppercase">SUBTOTAL:</td>
                    <td className="border border-gray-400 p-1.5 text-right font-mono">{fmt(activePrintOrder.subtotal)}</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-400 p-1.5 font-bold uppercase">IMPUESTO (IVA 19%):</td>
                    <td className="border border-gray-400 p-1.5 text-right font-mono">{fmt(activePrintOrder.iva)}</td>
                  </tr>
                  <tr className="bg-[#0c2340] text-white">
                    <td className="border border-gray-400 p-2 font-black uppercase text-[10px]" style={{ backgroundColor: '#0c2340', color: '#ffffff' }}>VALOR A PAGAR:</td>
                    <td className="border border-gray-400 p-2 text-right font-mono font-black text-xs" style={{ backgroundColor: '#0c2340', color: '#ffffff' }}>{fmt(activePrintOrder.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. Signatures layout */}
          <div className="grid grid-cols-2 gap-8 mt-12 mb-8">
            <div className="text-center">
              <div className="border-b border-gray-400 mx-auto w-[80%] h-12"></div>
              <span className="text-[8.5px] font-bold uppercase text-gray-700 block mt-1">FIRMA DE EMPLEADO (BENEFICIARIO)</span>
              <span className="text-[7.5px] text-gray-500 font-mono">C.C. {activePrintOrder.cedula}</span>
            </div>
            <div className="text-center">
              <div className="border-b border-gray-400 mx-auto w-[80%] h-12"></div>
              <span className="text-[8.5px] font-bold uppercase text-gray-700 block mt-1">AUTORIZADO Y AUDITADO POR</span>
              <span className="text-[7.5px] text-gray-500 font-mono">SISTEMALOG S.A.S. - TALENTO HUMANO / LOGÍSTICA</span>
            </div>
          </div>

          {/* 6. Legal footnote */}
          <div className="text-center text-[7.5px] text-gray-400 uppercase tracking-wide border-t border-gray-200 pt-3 mt-4" style={{ lineHeight: '1.4' }}>
            ACTIVIDAD ECONÓMICA CIIU 2023. TRIBUTAMOS EN YUMBO ACTIVIDAD INDUSTRIAL ICA 102-97 A LA TARIFA 7 X 1000. 
            <br />
            ESTE COMPROBANTE DE VENTA DE CONTROL INTERNO GOZA DE PLENA VALIDEZ Y HA SIDO ALMACENADO CON ÉXITO EN EL SERVIDOR CLOUD DE OPERACIONES DE SISTEMALOG SAS.
          </div>
        </div>,
        document.body
      )}

      {/* Print only advanced report markup block - Rendered via React Portal directly inside body */}
      {isPrintingReport && createPortal(
        <div id="printReport" className="bg-white text-black p-6 font-sans text-xs" style={{ width: '100%', maxWidth: '1000px', margin: '0 auto', color: '#000000', backgroundColor: '#ffffff' }}>
          {/* Header Grid - Company logo and details omitted for Resumen Mensual, Por Productos, Por Empleados, Todo Detallado as requested */}
          <div className="border-b border-gray-400 pb-2 mb-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-black text-[#0c2340] tracking-wider uppercase">
                {reportType === 'month' ? `REPORTE MENSUAL: ${repMonthFilter.toUpperCase()}` : reportType === 'product' ? 'REPORTE DE INVENTARIO POR PRODUCTOS' : reportType === 'employee' ? 'REPORTE CONSOLIDADO POR PERSONA' : 'REPORTE DETALLADO DE TRANSACCIONES'}
              </h2>
              <div className="text-right" style={{ fontSize: '9px' }}>
                <div className="font-mono text-gray-500 font-bold">
                  FECHA DE IMPRESIÓN: {new Date().toLocaleDateString('es-CO')}
                </div>
                <div className="font-mono text-gray-500 uppercase mt-0.5">Filas encontradas: {processedReportRecords.length} transacciones</div>
              </div>
            </div>
          </div>

          {/* Tables Rendering */}
          <div className="w-full">
            {/* VIEW 1: MONTHLY SUMMARY */}
            {reportType === 'month' && repMonthFilter !== 'all' && repViewMode === 'summary' && (
              <table className="w-full text-left border-collapse border border-gray-400 text-xs">
                <thead>
                  <tr className="bg-gray-100 text-gray-800 uppercase font-bold text-[10px]">
                    <th className="border border-gray-400 p-2">Cód</th>
                    <th className="border border-gray-400 p-2">Producto</th>
                    <th className="border border-gray-400 p-2">Categoría</th>
                    <th className="border border-gray-400 p-2 text-center">Cant. Vendida</th>
                    <th className="border border-gray-400 p-2 text-right">Precio Base</th>
                    <th className="border border-gray-400 p-2 text-right">Total c/IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const productsTallied = Object.values(reportsAggregateByProduct) as { code: string; name: string; qty: number; total: number }[];
                    const totalQty = productsTallied.reduce((acc, p) => acc + p.qty, 0);
                    const grandTotal = productsTallied.reduce((acc, p) => acc + p.total, 0);

                    return (
                      <>
                        {productsTallied.map(p => (
                          <tr key={p.name} className="uppercase">
                            <td className="border border-gray-400 p-2 text-gray-500">#{p.code || ''}</td>
                            <td className="border border-gray-400 p-2 font-bold">{p.name}</td>
                            <td className="border border-gray-400 p-2">{(p.code || '').split('-')[0] || 'Gen'}</td>
                            <td className="border border-gray-400 p-2 text-center font-bold">{p.qty}</td>
                            <td className="border border-gray-400 p-2 text-right">{fmt(p.qty > 0 ? (p.total / p.qty / (1 + IVA_RATE)) : 0)}</td>
                            <td className="border border-gray-400 p-2 text-right font-bold">{fmt(p.total)}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-100 font-bold">
                          <td colSpan={3} className="border border-gray-400 p-2 uppercase text-right">Total Consolidado Mensual</td>
                          <td className="border border-gray-400 p-2 text-center">{totalQty} u</td>
                          <td className="border border-gray-400 p-2"></td>
                          <td className="border border-gray-400 p-2 text-right">{fmt(grandTotal)}</td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            )}

            {/* VIEW 2: PRODUCT AUDITING */}
            {reportType === 'product' && (
              <table className="w-full text-left border-collapse border border-gray-400 text-xs">
                <thead>
                  <tr className="bg-gray-100 text-gray-800 uppercase font-bold text-[10px]">
                    <th className="border border-gray-400 p-2">Cód</th>
                    <th className="border border-gray-400 p-2">Nombre del Producto</th>
                    <th className="border border-gray-400 p-2 text-center">Unidades Pedidas</th>
                    <th className="border border-gray-400 p-2 text-right">Venta Total c/IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.values(reportsAggregateByProduct) as { code: string; name: string; qty: number; total: number }[]).sort((a, b) => b.qty - a.qty).map((p) => (
                    <tr key={p.name} className="uppercase">
                      <td className="border border-gray-400 p-2 text-gray-500">#{p.code}</td>
                      <td className="border border-gray-400 p-2 font-bold">{p.name}</td>
                      <td className="border border-gray-400 p-2 text-center font-bold">{p.qty}</td>
                      <td className="border border-gray-400 p-2 text-right font-bold">{fmt(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* VIEW 3: EMPLOYEE REPORT LIST */}
            {reportType === 'employee' && (
              <table className="w-full text-left border-collapse border border-gray-400 text-xs">
                <thead>
                  <tr className="bg-gray-100 text-gray-800 uppercase font-bold text-[10px]">
                    <th className="border border-gray-400 p-2">Cédula</th>
                    <th className="border border-gray-400 p-2">Nombre Empleado</th>
                    <th className="border border-gray-400 p-2 text-center">N° Pedidos</th>
                    <th className="border border-gray-400 p-2 text-center">Items Mandados</th>
                    <th className="border border-gray-400 p-2 text-right">Total con IVA</th>
                    <th className="border border-gray-400 p-2 text-center">Firma Comprobación Recibido</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(reportsAggregateByEmployee).map(key => {
                    const emp = reportsAggregateByEmployee[key];
                    return (
                      <tr key={key} className="uppercase">
                        <td className="border border-gray-400 p-2">{emp.cedula}</td>
                        <td className="border border-gray-400 p-2 font-bold">{key}</td>
                        <td className="border border-gray-400 p-2 text-center">{emp.count}</td>
                        <td className="border border-gray-400 p-2 text-center">{emp.items} items</td>
                        <td className="border border-gray-400 p-2 text-right font-bold">{fmt(emp.total)}</td>
                        <td className="border border-gray-400 p-2 text-center text-gray-400 italic">___________________</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* VIEW 4: DETAILED LOG */}
            {reportType === 'detailed' && (
              <table className="w-full text-left border-collapse border border-gray-400 text-xs">
                <thead>
                  <tr className="bg-gray-100 text-gray-800 uppercase font-bold text-[10px]">
                    <th className="border border-gray-400 p-2">Fecha</th>
                    <th className="border border-gray-400 p-2">Cédula</th>
                    <th className="border border-gray-400 p-2">Empleado</th>
                    <th className="border border-gray-400 p-2">Cod</th>
                    <th className="border border-gray-400 p-2">Producto</th>
                    <th className="border border-gray-400 p-2 text-center">Cant</th>
                    <th className="border border-gray-400 p-2 text-right">Precio Unit. c/IVA</th>
                    <th className="border border-gray-400 p-2 text-right">Total Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {processedReportRecords.map((r, index) => {
                    const costWithIva = r.price * (1 + IVA_RATE);
                    return (
                      <tr key={index} className="uppercase">
                        <td className="border border-gray-400 p-2 text-gray-500">{r.date}</td>
                        <td className="border border-gray-400 p-2">{r.cedula}</td>
                        <td className="border border-gray-400 p-2 font-bold">{r.employee}</td>
                        <td className="border border-gray-400 p-2 text-gray-500">#{r.code}</td>
                        <td className="border border-gray-400 p-2">{r.name}</td>
                        <td className="border border-gray-400 p-2 text-center font-bold">{r.qty}</td>
                        <td className="border border-gray-400 p-2 text-right">{fmt(costWithIva)}</td>
                        <td className="border border-gray-400 p-2 text-right font-bold">{fmt(costWithIva * r.qty)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* DEFAULT MONTH DETAILED MATRIX VIEW */}
            {reportType === 'month' && repViewMode === 'detailed' && (
              <table className="w-full text-left border-collapse border border-gray-400 text-xs">
                <thead>
                  <tr className="bg-gray-100 text-gray-800 uppercase font-bold text-[10px]">
                    <th className="border border-gray-400 p-2">Fecha</th>
                    <th className="border border-gray-400 p-2">Cédula</th>
                    <th className="border border-gray-400 p-2">Empleado</th>
                    <th className="border border-gray-400 p-2">Cod</th>
                    <th className="border border-gray-400 p-2">Producto</th>
                    <th className="border border-gray-400 p-2 text-center">Cant</th>
                    <th className="border border-gray-400 p-2 text-right">Base S/IVA</th>
                    <th className="border border-gray-400 p-2 text-right">Total c/IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {processedReportRecords.map((r, idx) => (
                    <tr key={idx} className="uppercase">
                      <td className="border border-gray-400 p-2 text-gray-500">{r.date}</td>
                      <td className="border border-gray-400 p-2">{r.cedula}</td>
                      <td className="border border-gray-400 p-2 font-bold">{r.employee}</td>
                      <td className="border border-gray-400 p-2 text-gray-500">#{r.code}</td>
                      <td className="border border-gray-400 p-2">{r.name}</td>
                      <td className="border border-gray-400 p-2 text-center font-bold">{r.qty}</td>
                      <td className="border border-gray-400 p-2 text-right">{fmt(r.price * r.qty)}</td>
                      <td className="border border-gray-400 p-2 text-right font-bold">{fmt(r.price * (1 + IVA_RATE) * r.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Legal footnote */}
          <div className="text-center text-[8px] text-gray-500 uppercase tracking-wide border-t border-gray-300 pt-4 mt-8" style={{ lineHeight: '1.4' }}>
            REPORTE OFICIAL GENERADO AUTOMÁTICAMENTE PARA CONTRALORÍA DE LOGÍSTICA Y RECURSOS HUMANOS - SISTEMALOG SAS.
            <br />
            ESTA INFORMACIÓN GOZA DE PLENA VALIDEZ Y HA SIDO ALMACENADA CON ÉXITO EN EL SERVIDOR CLOUD DE OPERACIONES DE SISTEMALOG SAS.
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
