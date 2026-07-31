/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Order, Carrier } from '../types';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area, ComposedChart, LineChart, Line
} from 'recharts';
import { 
  TrendingUp, Activity, ShieldAlert, Award, ArrowUpRight, 
  MapPin, Truck, Sparkles, Copy, RefreshCw, BarChart2, Share2,
  Calendar, Users, ChevronDown, Check, RefreshCw as RotateCcw, HelpCircle, AlertTriangle
} from 'lucide-react';
import BookReportReader from './BookReportReader';

interface AnalyticsModuleProps {
  orders: Order[];
  carriers: Carrier[];
}

export default function AnalyticsModule({ orders, carriers }: AnalyticsModuleProps) {
  // --- STATE FOR FILTERS AND SELECTIONS ---
  const [selectedYear, setSelectedYear] = useState('2026');
  
  // Custom multi-select for Months (defaults to all months)
  const [selectedMonths, setSelectedMonths] = useState<string[]>(() => {
    return ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  });
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);

  // Periodo Especial filter
  const [specialPeriod, setSpecialPeriod] = useState('none');

  // Unique clients list derived from orders
  const uniqueClients = useMemo(() => {
    return Array.from(new Set(orders.map(o => o.cliente).filter(Boolean))).sort();
  }, [orders]);

  // Clients multi-select
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  // Transportadora filter
  const [analyticCarrier, setAnalyticCarrier] = useState('');

  // Dropdown click outside listeners
  const monthRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (monthRef.current && !monthRef.current.contains(event.target as Node)) {
        setShowMonthDropdown(false);
      }
      if (clientRef.current && !clientRef.current.contains(event.target as Node)) {
        setShowClientDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset Filters logic
  const handleResetFilters = () => {
    setSelectedYear('2026');
    setSelectedMonths(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
    setSpecialPeriod('none');
    setSelectedClients([]);
    setAnalyticCarrier('');
  };

  // --- SUB-NAVIGATION STATE (14 REPORTS) ---
  const [activeReportTab, setActiveReportTab] = useState('1_ventas');

  // --- NEW REGIONAL DETAIL STATE ---
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [regionMetricType, setRegionMetricType] = useState<'flete' | 'peso'>('flete');
  const [regionClientsPage, setRegionClientsPage] = useState(1);
  const [tab12ChartViewType, setTab12ChartViewType] = useState<'toneladas' | 'kilos' | 'ventas'>('toneladas');
  const [tab13ChartViewType, setTab13ChartViewType] = useState<'toneladas' | 'kilos' | 'ventas'>('toneladas');

  useEffect(() => {
    setRegionClientsPage(1);
  }, [selectedRegion, activeReportTab]);

  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [gptReport, setGptReport] = useState<string | null>(null);

  // Lists of month specifications
  const MONTHS_LIST = [
    { code: '01', name: 'Enero' },
    { code: '02', name: 'Febrero' },
    { code: '03', name: 'Marzo' },
    { code: '04', name: 'Abril' },
    { code: '05', name: 'Mayo' },
    { code: '06', name: 'Junio' },
    { code: '07', name: 'Julio' },
    { code: '08', name: 'Agosto' },
    { code: '09', name: 'Septiembre' },
    { code: '10', name: 'Octubre' },
    { code: '11', name: 'Noviembre' },
    { code: '12', name: 'Diciembre' }
  ];

  // Strategic Channel resolver
  const getCanalEstrategico = (cliente: string): string => {
    const c = (cliente || '').toLowerCase();
    if (
      c.includes('exito') || 
      c.includes('éxito') || 
      c.includes('cencosud') || 
      c.includes('jumbo') || 
      c.includes('olimpica') || 
      c.includes('olímpica') || 
      c.includes('alkosto') || 
      c.includes('metro') || 
      c.includes('carulla') || 
      c.includes('makro')
    ) {
      return 'Moderno (Grandes Superficies)';
    }
    if (c.includes('d1') || c.includes('ara') || c.includes('koba') || c.includes('isimo') || c.includes('ísimo')) {
      return 'Hard Discount';
    }
    if (c.includes('colsubsidio') || c.includes('cafam') || c.includes('comfandi')) {
      return 'Cajas de Compensación';
    }
    if (
      c.includes('distri') || 
      c.includes('mayorista') || 
      c.includes('comercializadora') || 
      c.includes('deposito') || 
      c.includes('surtidor') ||
      c.includes('cañaveral') ||
      c.includes('cañaveral')
    ) {
      return 'Distribución / Mayoristas';
    }
    if (
      c.includes('b2b') || 
      c.includes('ind') || 
      c.includes('quimica') || 
      c.includes('química') || 
      c.includes('pacifico') || 
      c.includes('pacífico') || 
      c.includes('industrial')
    ) {
      return 'Institucional / B2B';
    }
    return 'Tradicional / Otros Store';
  };

  // Helper to parse dates reliably in any format (ISO, YYYY-MM-DD, DD/MM/YYYY, etc.)
  const parseDateParts = (rawDateStr: any) => {
    if (!rawDateStr) return null;
    const str = String(rawDateStr).trim();
    if (!str) return null;

    if (/^\d{10,13}$/.test(str)) {
      const dObj = new Date(parseInt(str, 10));
      if (!isNaN(dObj.getTime())) {
        return { year: dObj.getFullYear(), month: dObj.getMonth() + 1, day: dObj.getDate() };
      }
    }

    const ymdMatch = str.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (ymdMatch) {
      const y = parseInt(ymdMatch[1], 10);
      const m = parseInt(ymdMatch[2], 10);
      const d = parseInt(ymdMatch[3], 10);
      if (y >= 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return { year: y, month: m, day: d };
      }
    }

    const dmyMatch = str.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (dmyMatch) {
      const p1 = parseInt(dmyMatch[1], 10);
      const p2 = parseInt(dmyMatch[2], 10);
      let y = parseInt(dmyMatch[3], 10);
      if (y < 100) y += 2000;
      if (p2 >= 1 && p2 <= 12 && p1 >= 1 && p1 <= 31) {
        return { year: y, month: p2, day: p1 };
      }
      if (p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 31) {
        return { year: y, month: p1, day: p2 };
      }
    }

    const dObj = new Date(str);
    if (!isNaN(dObj.getTime())) {
      return { year: dObj.getUTCFullYear(), month: dObj.getUTCMonth() + 1, day: dObj.getUTCDate() };
    }

    return null;
  };

  // --- FILTER APPLY PROCESS ---
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const orderDateStr = o.fechaFactura || o.fechaSalida || o.fechaIngreso;
      const parsed = parseDateParts(orderDateStr);

      // 1. Year filter
      if (selectedYear) {
        if (parsed) {
          if (parsed.year !== parseInt(selectedYear, 10)) {
            return false;
          }
        }
      }

      // 2. Month filter
      if (selectedMonths.length > 0 && selectedMonths.length < 12) {
        if (parsed) {
          const monthCode = String(parsed.month).padStart(2, '0');
          if (!selectedMonths.includes(monthCode)) {
            return false;
          }
        }
      }

      // 3. Special Period Filter
      if (specialPeriod !== 'none' && parsed) {
        const monthNum = parsed.month;
        if (specialPeriod === 'S1' && (monthNum < 1 || monthNum > 6)) return false;
        if (specialPeriod === 'S2' && (monthNum < 7 || monthNum > 12)) return false;
        if (specialPeriod === 'Q1' && (monthNum < 1 || monthNum > 3)) return false;
        if (specialPeriod === 'Q2' && (monthNum < 4 || monthNum > 6)) return false;
        if (specialPeriod === 'Q3' && (monthNum < 7 || monthNum > 9)) return false;
        if (specialPeriod === 'Q4' && (monthNum < 10 || monthNum > 12)) return false;
      }

      // 4. Multiple Clients Selector
      if (selectedClients.length > 0 && !selectedClients.includes(o.cliente)) {
        return false;
      }

      // 5. Carrier filter
      if (analyticCarrier && o.transportadora !== analyticCarrier) {
        return false;
      }

      return true;
    });
  }, [orders, selectedYear, selectedMonths, specialPeriod, selectedClients, analyticCarrier]);

  // --- COMPLEX STATISTICS COMPUTING ENGINE ---
  const stats = useMemo(() => {
    let subtotal = 0;       // Gross sum of order valuations
    let totalSales = 0;     // Billing sum for dispatched/delivered
    let transportCost = 0;  // Sum of fletes
    let totalWeight = 0;    // Sum of weight
    let totalBoxes = 0;     // Sum of boxes

    let shortageValue = 0;
    let pendingBoxes = 0;
    let pendingWeight = 0;
    let pendingValue = 0;

    // Filter statuses count
    const statusCounts: Record<string, { count: number; value: number; weight: number; boxes: number }> = {
      'Pendiente': { count: 0, value: 0, weight: 0, boxes: 0 },
      'En Cargue': { count: 0, value: 0, weight: 0, boxes: 0 },
      'Despachado': { count: 0, value: 0, weight: 0, boxes: 0 },
      'En Sitio / Bodega': { count: 0, value: 0, weight: 0, boxes: 0 },
      'Entregado': { count: 0, value: 0, weight: 0, boxes: 0 },
      'Finalizado': { count: 0, value: 0, weight: 0, boxes: 0 },
      'Anulado': { count: 0, value: 0, weight: 0, boxes: 0 }
    };

    filteredOrders.forEach(o => {
      // Gross subtotal is raw cumulative sell valuation
      if (o.estado !== 'Anulado') {
        subtotal += o.venta;
      }

      // Status aggregations
      if (statusCounts[o.estado]) {
        statusCounts[o.estado].count += 1;
        statusCounts[o.estado].value += o.venta;
        statusCounts[o.estado].weight += o.peso;
        statusCounts[o.estado].boxes += o.cajas;
      }

      // Delivered / Dispatched (operational sales)
      if (o.estado === 'Entregado' || o.estado === 'Despachado' || o.estado === 'En Sitio / Bodega') {
        totalSales += o.facturado || o.venta;
        transportCost += o.flete;
        totalWeight += o.pesoFact || o.peso;
        totalBoxes += o.cajasFact || o.cajas;

        // Devs / Shortage metrics comparing initial sales vs facturado
        const diffVal = o.venta - (o.facturado || o.venta);
        if (diffVal > 0) {
          shortageValue += diffVal;
        }
      } else if (o.estado === 'Pendiente' || o.estado === 'En Cargue') {
        pendingValue += o.venta;
        pendingBoxes += o.cajas;
        pendingWeight += o.peso;
      }
    });

    const impactPct = totalSales > 0 ? (transportCost / totalSales) * 100 : 0;
    const shortagePct = subtotal > 0 ? (shortageValue / subtotal) * 100 : 0;

    // Ahorro Estimado Logistico (10% Target margin)
    let estimatedSavings = 0;
    const tenPctTarget = totalSales * 0.10;
    if (transportCost < tenPctTarget) {
      estimatedSavings = tenPctTarget - transportCost;
    }

    const efficiencyCostPerKg = totalWeight > 0 ? transportCost / totalWeight : 0;

    // Carrier breakdown statistics
    const carrierKeys = Array.from(new Set(filteredOrders.map(o => o.transportadora).filter(Boolean)));
    const carriersBreakdown = carrierKeys.map(name => {
      const carrierOrders = filteredOrders.filter(o => o.transportadora === name && o.estado !== 'Anulado');
      const costGroup = carrierOrders.reduce((sum, o) => sum + o.flete, 0);
      const salesGroup = carrierOrders.reduce((sum, o) => sum + (o.facturado || o.venta), 0);
      const weightGroup = carrierOrders.reduce((sum, o) => sum + (o.pesoFact || o.peso), 0);
      const boxesGroup = carrierOrders.reduce((sum, o) => sum + (o.cajasFact || o.cajas), 0);
      const pct = salesGroup > 0 ? (costGroup / salesGroup) * 100 : 0;
      const costPerKg = weightGroup > 0 ? costGroup / weightGroup : 0;
      const costPerBox = boxesGroup > 0 ? costGroup / boxesGroup : 0;

      return { 
        name, 
        cost: costGroup, 
        sales: salesGroup, 
        weight: weightGroup,
        boxes: boxesGroup,
        pct,
        costPerKg,
        costPerBox
      };
    }).sort((a,b) => b.cost - a.cost);

    return {
      subtotal,
      totalSales,
      transportCost,
      impactPct,
      shortageValue,
      shortagePct,
      totalWeight,
      totalBoxes,
      efficiencyCostPerKg,
      estimatedSavings,
      pendingWeight,
      pendingBoxes,
      pendingValue,
      statusCounts,
      carriersBreakdown
    };
  }, [filteredOrders]);

  // --- REPORT 1: AREA EVOLUCION VENTAS VS FLETES ---
  const monthlyData = useMemo(() => {
    return MONTHS_LIST.map((m) => {
      const monthOrders = filteredOrders.filter(o => {
        const orderDateStr = o.fechaFactura || o.fechaSalida || o.fechaIngreso;
        const parsed = parseDateParts(orderDateStr);
        if (!parsed) return false;
        return String(parsed.month).padStart(2, '0') === m.code;
      });

      const ventas = monthOrders.reduce((sum, o) => sum + (o.estado !== 'Anulado' ? (o.facturado || o.venta) : 0), 0);
      const fletes = monthOrders.reduce((sum, o) => sum + (o.estado !== 'Anulado' ? o.flete : 0), 0);

      return {
        name: m.name,
        Ventas: ventas / 1000000, // in Millions
        Fletes: fletes / 1000000 // in Millions
      };
    });
  }, [filteredOrders]);

  // --- REPORT 5: TOP 5 CLIENTES FACTURACIÓN ---
  const topCustomersData = useMemo(() => {
    const customerNames = Array.from(new Set(filteredOrders.map(o => o.cliente).filter(Boolean))) as string[];
    const mapped = customerNames.map(name => {
      const matches = filteredOrders.filter(o => o.cliente === name && o.estado !== 'Anulado');
      const sales = matches.reduce((sum, o) => sum + (o.facturado || o.venta), 0);
      const weight = matches.reduce((sum, o) => sum + (o.pesoFact || o.peso), 0);
      const boxes = matches.reduce((sum, o) => sum + (o.cajasFact || o.cajas), 0);
      const orderCount = matches.length;

      return { 
        name: name.replace(' S.A.', '').replace(' S.A.S.', '').substring(0, 20), 
        Valor: sales / 1000000, // Millions
        rawValor: sales,
        weight,
        boxes,
        orderCount
      };
    });
    return mapped.sort((a,b) => b.Valor - a.Valor).slice(0, 5);
  }, [filteredOrders]);

  // --- REPORT 6: TOP 10 CITIES ---
  const regionalData = useMemo(() => {
    const cleanStr = (s: string) => 
      (s || '')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();

    const grouped: Record<string, { Fletes: number; Sales: number }> = {};

    filteredOrders.forEach(o => {
      if (o.estado !== 'Anulado' && o.ciudad) {
        const normCity = cleanStr(o.ciudad);
        if (!grouped[normCity]) {
          grouped[normCity] = { Fletes: 0, Sales: 0 };
        }
        grouped[normCity].Fletes += o.flete;
        grouped[normCity].Sales += (o.facturado || o.venta);
      }
    });

    const mapped = Object.entries(grouped).map(([city, data]) => {
      const ratio = data.Sales > 0 ? (data.Fletes / data.Sales) * 100 : 0;
      return {
        name: city,
        Fletes: data.Fletes,
        Sales: data.Sales,
        Ratio: ratio
      };
    });

    return mapped.sort((a, b) => b.Fletes - a.Fletes).slice(0, 10);
  }, [filteredOrders]);

  // --- REPORT 8: EVOLUCION FLETE PROMEDIO MENSUAL ---
  const monthlyFleteAverageData = useMemo(() => {
    let lastAvg = 0;
    return MONTHS_LIST.map((m) => {
      const monthOrders = filteredOrders.filter(o => {
        const orderDateStr = o.fechaFactura || o.fechaSalida || o.fechaIngreso;
        const parsed = parseDateParts(orderDateStr);
        if (!parsed) return false;
        return String(parsed.month).padStart(2, '0') === m.code && o.estado !== 'Anulado';
      });

      const count = monthOrders.length;
      const totalFlete = monthOrders.reduce((sum, o) => sum + o.flete, 0);
      const avg = count > 0 ? totalFlete / count : 0;
      
      // Calculate MoM percent change
      let changePct = 0;
      if (lastAvg > 0) {
        changePct = ((avg - lastAvg) / lastAvg) * 100;
      }
      lastAvg = avg > 0 ? avg : lastAvg; // persist if valid

      return {
        name: m.name,
        Promedio: avg,
        CambioMoM: changePct
      };
    });
  }, [filteredOrders]);

  // --- REPORT 10: REGIONAL MACRO BREAKDOWNS ---
  const macroRegionalData = useMemo(() => {
    // Basic heuristics to group Colombian Cities into regions
    const getRegionCode = (ciudad: string): string => {
      const c = (ciudad || '').toLowerCase();
      if (c.includes('cali') || c.includes('yumbo') || c.includes('buenaventura') || c.includes('pasto') || c.includes('popayan') || c.includes('popayán') || c.includes('palmira') || c.includes('jamundi') || c.includes('jamundí')) {
        return 'Pacífica / Occidente';
      }
      if (c.includes('bogot') || c.includes('bogót') || c.includes('medell') || c.includes('envigado') || c.includes('bello') || c.includes('bucaramanga') || c.includes('pereira') || c.includes('manizales') || c.includes('ibague') || c.includes('ibagué') || c.includes('armenia') || c.includes('neiva') || c.includes('tunja') || c.includes('cúcuta') || c.includes('cucuta')) {
        return 'Andina / Centro-Norte';
      }
      if (c.includes('barranquilla') || c.includes('cartagena') || c.includes('santa marta') || c.includes('valledupar') || c.includes('sincelejo') || c.includes('monteria') || c.includes('montería') || c.includes('riohacha')) {
        return 'Caribe Logístico';
      }
      return 'Ejes de Distribución Nacional';
    };

    const uniqueRegions = ['Pacífica / Occidente', 'Andina / Centro-Norte', 'Caribe Logístico', 'Ejes de Distribución Nacional'];
    
    return uniqueRegions.map(region => {
      const matches = filteredOrders.filter(o => getRegionCode(o.ciudad) === region && o.estado !== 'Anulado');
      const sales = matches.reduce((sum, o) => sum + (o.facturado || o.venta), 0);
      const flete = matches.reduce((sum, o) => sum + o.flete, 0);
      const ordersCount = matches.length;
      const ratio = sales > 0 ? (flete / sales) * 100 : 0;
      const totalWeight = matches.reduce((sum, o) => sum + o.peso, 0);

      // Group by client
      const clientMap: { [key: string]: { flete: number; sales: number; weight: number; count: number } } = {};
      matches.forEach(o => {
        const clientName = o.cliente || 'Otros Clientes';
        if (!clientMap[clientName]) {
          clientMap[clientName] = { flete: 0, sales: 0, weight: 0, count: 0 };
        }
        clientMap[clientName].flete += o.flete;
        clientMap[clientName].sales += (o.facturado || o.venta);
        clientMap[clientName].weight += o.peso;
        clientMap[clientName].count += 1;
      });

      const clients = Object.entries(clientMap).map(([name, stats]) => ({
        name,
        flete: stats.flete,
        sales: stats.sales,
        weight: stats.weight,
        count: stats.count,
        ratio: stats.sales > 0 ? (stats.flete / stats.sales) * 100 : 0
      })).sort((a, b) => b.sales - a.sales);

      return {
        name: region,
        value: flete,
        sales,
        ordersCount,
        ratio,
        totalWeight,
        clients
      };
    }).filter(r => r.value > 0 || r.sales > 0);
  }, [filteredOrders]);

  // --- REPORT 12 SPECIALLY MAPS: COMBINED REGIONAL DETAILED TONS & CLIENTS DATA ---
  const regionalTonsAndClientsData = useMemo(() => {
    const regionsList = [
      'ANTIOQUIA',
      'BUCARAMANGA',
      'NEIVA',
      'IBAGUE',
      'BOGOTA',
      'BARRANQUILLA',
      'CARTAGENA',
      'YUMBO',
      'CALI'
    ];

    const getCanonicalRegion = (ciudad: string): string => {
      const c = (ciudad || '').toLowerCase();
      if (c.includes('medell') || c.includes('antioq') || c.includes('envigado') || c.includes('bello') || c.includes('sabaneta') || c.includes('itagü') || c.includes('itagu')) return 'ANTIOQUIA';
      if (c.includes('bucaramanga') || c.includes('floridablanca') || c.includes('giron') || c.includes('girón')) return 'BUCARAMANGA';
      if (c.includes('neiva')) return 'NEIVA';
      if (c.includes('ibague') || c.includes('ibagué')) return 'IBAGUE';
      if (c.includes('bogot') || c.includes('bogót')) return 'BOGOTA';
      if (c.includes('barranquilla') || c.includes('soledad')) return 'BARRANQUILLA';
      if (c.includes('cartagena')) return 'CARTAGENA';
      if (c.includes('yumbo')) return 'YUMBO';
      if (c.includes('cali') || c.includes('jamundi') || c.includes('palmira')) return 'CALI';
      return '';
    };

    return regionsList.map(region => {
      const matches = filteredOrders.filter(o => getCanonicalRegion(o.ciudad) === region && o.estado !== 'Anulado');
      
      let planB_sales = 0, planB_weight = 0;
      let floralia_sales = 0, floralia_weight = 0;
      let olimpica_sales = 0, olimpica_weight = 0;
      let vaquita_sales = 0, vaquita_weight = 0;
      let otros_sales = 0, otros_weight = 0;

      matches.forEach(o => {
        const clientName = (o.cliente || '').toLowerCase();
        const val = o.facturado || o.venta || 0;
        const w = o.peso || 0;

        if (clientName.includes('plan b')) {
          planB_sales += val;
          planB_weight += w;
        } else if (clientName.includes('floralia')) {
          floralia_sales += val;
          floralia_weight += w;
        } else if (clientName.includes('olimpica') || clientName.includes('olímpica')) {
          olimpica_sales += val;
          olimpica_weight += w;
        } else if (clientName.includes('vaquita')) {
          vaquita_sales += val;
          vaquita_weight += w;
        } else {
          otros_sales += val;
          otros_weight += w;
        }
      });

      const totWeight = planB_weight + floralia_weight + olimpica_weight + vaquita_weight + otros_weight;

      return {
        name: region,
        'PLAN B_sales': planB_sales,
        'FLORALIA_sales': floralia_sales,
        'OLIMPICA_sales': olimpica_sales,
        'VAQUITA_sales': vaquita_sales,
        'OTROS CLI_sales': otros_sales,
        
        'PLAN B_tons': Number((planB_weight / 1000).toFixed(3)),
        'FLORALIA_tons': Number((floralia_weight / 1000).toFixed(3)),
        'OLIMPICA_tons': Number((olimpica_weight / 1000).toFixed(3)),
        'VAQUITA_tons': Number((vaquita_weight / 1000).toFixed(3)),
        'OTROS CLI_tons': Number((otros_weight / 1000).toFixed(3)),

        'PLAN B_kg': planB_weight,
        'FLORALIA_kg': floralia_weight,
        'OLIMPICA_kg': olimpica_weight,
        'VAQUITA_kg': vaquita_weight,
        'OTROS CLI_kg': otros_weight,
        
        'TON TOTAL': Number((totWeight / 1000).toFixed(3)),
        'KG TOTAL': totWeight,
        'VENTAS TOTAL': planB_sales + floralia_sales + olimpica_sales + vaquita_sales + otros_sales
      };
    });
  }, [filteredOrders]);

  // --- REPORT 12 & 13: CANALES ESTRATEGICOS ---
  const channelData = useMemo(() => {
    const channels = [
      'Moderno (Grandes Superficies)', 
      'Hard Discount', 
      'Cajas de Compensación', 
      'Distribución / Mayoristas', 
      'Institucional / B2B', 
      'Tradicional / Otros Store'
    ];

    return channels.map(channel => {
      const channelOrders = filteredOrders.filter(o => getCanalEstrategico(o.cliente) === channel && o.estado !== 'Anulado');
      const sales = channelOrders.reduce((sum, o) => sum + (o.facturado || o.venta), 0);
      const salesBoxes = channelOrders.reduce((sum, o) => sum + o.cajas, 0);
      const salesWeight = channelOrders.reduce((sum, o) => sum + o.peso, 0);
      const flete = channelOrders.reduce((sum, o) => sum + o.flete, 0);
      const count = channelOrders.length;

      // Pending factors
      const pendingOrders = filteredOrders.filter(o => getCanalEstrategico(o.cliente) === channel && (o.estado === 'Pendiente' || o.estado === 'En Cargue'));
      const pendingSales = pendingOrders.reduce((sum, o) => sum + o.venta, 0);
      const pendingBoxes = pendingOrders.reduce((sum, o) => sum + o.cajas, 0);
      const pendingWeight = pendingOrders.reduce((sum, o) => sum + o.peso, 0);

      return {
        name: channel,
        Ventas: sales,
        VentasCajas: salesBoxes,
        VentasPeso: salesWeight,
        Flete: flete,
        PedidosFacturados: count,
        PendienteValor: pendingSales,
        PendienteCajas: pendingBoxes,
        PendientePeso: pendingWeight,
        PedidosPendientes: pendingOrders.length
      };
    });
  }, [filteredOrders]);

  const computedTab12ChartData = useMemo(() => {
    return regionalTonsAndClientsData.map(item => {
      if (tab12ChartViewType === 'toneladas') {
        return {
          name: item.name,
          'PLAN B': item['PLAN B_tons'],
          'FLORALIA': item['FLORALIA_tons'],
          'OLIMPICA': item['OLIMPICA_tons'],
          'VAQUITA': item['VAQUITA_tons'],
          'OTROS CLI': item['OTROS CLI_tons'],
          'SECONDARY_VAL': item['VENTAS TOTAL'],
          unit: 'Ton',
          secUnit: 'COP'
        };
      } else if (tab12ChartViewType === 'kilos') {
        return {
          name: item.name,
          'PLAN B': item['PLAN B_kg'],
          'FLORALIA': item['FLORALIA_kg'],
          'OLIMPICA': item['OLIMPICA_kg'],
          'VAQUITA': item['VAQUITA_kg'],
          'OTROS CLI': item['OTROS CLI_kg'],
          'SECONDARY_VAL': item['VENTAS TOTAL'],
          unit: 'Kg',
          secUnit: 'COP'
        };
      } else {
        return {
          name: item.name,
          'PLAN B': item['PLAN B_sales'],
          'FLORALIA': item['FLORALIA_sales'],
          'OLIMPICA': item['OLIMPICA_sales'],
          'VAQUITA': item['VAQUITA_sales'],
          'OTROS CLI': item['OTROS CLI_sales'],
          'SECONDARY_VAL': item['TON TOTAL'],
          unit: 'COP',
          secUnit: 'Ton'
        };
      }
    });
  }, [regionalTonsAndClientsData, tab12ChartViewType]);

  // --- REPORT 13 SPECIALLY MAPS: COMBINED REGIONAL DETAILED BACKLOG TONS & CLIENTS DATA ---
  const regionalPendingTonsAndClientsData = useMemo(() => {
    const regionsList = [
      'ANTIOQUIA',
      'BUCARAMANGA',
      'NEIVA',
      'IBAGUE',
      'BOGOTA',
      'BARRANQUILLA',
      'CARTAGENA',
      'YUMBO',
      'CALI'
    ];

    const getCanonicalRegion = (ciudad: string): string => {
      const c = (ciudad || '').toLowerCase();
      if (c.includes('medell') || c.includes('antioq') || c.includes('envigado') || c.includes('bello') || c.includes('sabaneta') || c.includes('itagü') || c.includes('itagu')) return 'ANTIOQUIA';
      if (c.includes('bucaramanga') || c.includes('floridablanca') || c.includes('giron') || c.includes('girón')) return 'BUCARAMANGA';
      if (c.includes('neiva')) return 'NEIVA';
      if (c.includes('ibague') || c.includes('ibagué')) return 'IBAGUE';
      if (c.includes('bogot') || c.includes('bogót')) return 'BOGOTA';
      if (c.includes('barranquilla') || c.includes('soledad')) return 'BARRANQUILLA';
      if (c.includes('cartagena')) return 'CARTAGENA';
      if (c.includes('yumbo')) return 'YUMBO';
      if (c.includes('cali') || c.includes('jamundi') || c.includes('palmira')) return 'CALI';
      return '';
    };

    return regionsList.map(region => {
      const matches = filteredOrders.filter(o => getCanonicalRegion(o.ciudad) === region && (o.estado === 'Pendiente' || o.estado === 'En Cargue'));
      
      let planB_value = 0, planB_weight = 0;
      let floralia_value = 0, floralia_weight = 0;
      let olimpica_value = 0, olimpica_weight = 0;
      let vaquita_value = 0, vaquita_weight = 0;
      let otros_value = 0, otros_weight = 0;

      matches.forEach(o => {
        const clientName = (o.cliente || '').toLowerCase();
        const val = o.venta || o.facturado || 0;
        const w = o.peso || 0;

        if (clientName.includes('plan b')) {
          planB_value += val;
          planB_weight += w;
        } else if (clientName.includes('floralia')) {
          floralia_value += val;
          floralia_weight += w;
        } else if (clientName.includes('olimpica') || clientName.includes('olímpica')) {
          olimpica_value += val;
          olimpica_weight += w;
        } else if (clientName.includes('vaquita')) {
          vaquita_value += val;
          vaquita_weight += w;
        } else {
          otros_value += val;
          otros_weight += w;
        }
      });

      const totWeight = planB_weight + floralia_weight + olimpica_weight + vaquita_weight + otros_weight;

      return {
        name: region,
        'PLAN B_value': planB_value,
        'FLORALIA_value': floralia_value,
        'OLIMPICA_value': olimpica_value,
        'VAQUITA_value': vaquita_value,
        'OTROS CLI_value': otros_value,
        
        'PLAN B_tons': Number((planB_weight / 1000).toFixed(3)),
        'FLORALIA_tons': Number((floralia_weight / 1000).toFixed(3)),
        'OLIMPICA_tons': Number((olimpica_weight / 1000).toFixed(3)),
        'VAQUITA_tons': Number((vaquita_weight / 1000).toFixed(3)),
        'OTROS CLI_tons': Number((otros_weight / 1000).toFixed(3)),

        'PLAN B_kg': planB_weight,
        'FLORALIA_kg': floralia_weight,
        'OLIMPICA_kg': olimpica_weight,
        'VAQUITA_kg': vaquita_weight,
        'OTROS CLI_kg': otros_weight,
        
        'TON TOTAL': Number((totWeight / 1000).toFixed(3)),
        'KG TOTAL': totWeight,
        'VALOR TOTAL': planB_value + floralia_value + olimpica_value + vaquita_value + otros_value
      };
    });
  }, [filteredOrders]);

  const computedTab13ChartData = useMemo(() => {
    return regionalPendingTonsAndClientsData.map(item => {
      if (tab13ChartViewType === 'toneladas') {
        return {
          name: item.name,
          'PLAN B': item['PLAN B_tons'],
          'FLORALIA': item['FLORALIA_tons'],
          'OLIMPICA': item['OLIMPICA_tons'],
          'VAQUITA': item['VAQUITA_tons'],
          'OTROS CLI': item['OTROS CLI_tons'],
          'SECONDARY_VAL': item['VALOR TOTAL'],
          unit: 'Ton',
          secUnit: 'COP'
        };
      } else if (tab13ChartViewType === 'kilos') {
        return {
          name: item.name,
          'PLAN B': item['PLAN B_kg'],
          'FLORALIA': item['FLORALIA_kg'],
          'OLIMPICA': item['OLIMPICA_kg'],
          'VAQUITA': item['VAQUITA_kg'],
          'OTROS CLI': item['OTROS CLI_kg'],
          'SECONDARY_VAL': item['VALOR TOTAL'],
          unit: 'Kg',
          secUnit: 'COP'
        };
      } else {
        return {
          name: item.name,
          'PLAN B': item['PLAN B_value'],
          'FLORALIA': item['FLORALIA_value'],
          'OLIMPICA': item['OLIMPICA_value'],
          'VAQUITA': item['VAQUITA_value'],
          'OTROS CLI': item['OTROS CLI_value'],
          'SECONDARY_VAL': item['TON TOTAL'],
          unit: 'COP',
          secUnit: 'Ton'
        };
      }
    });
  }, [regionalPendingTonsAndClientsData, tab13ChartViewType]);



  // --- SERVER GEMINI INVOCATION WRAPPER ---
  const handleGenerateAiReport = async () => {
    setGenerating(true);
    setGptReport(null);

    // Build lists of filtered variables for robust custom prompting
    const activeMonthsString = MONTHS_LIST
      .filter(m => selectedMonths.includes(m.code))
      .map(m => m.name)
      .join(', ');

    const activeClientsString = selectedClients.length > 0 
      ? selectedClients.join(', ') 
      : "Todos los clientes de SISTEMALOG";

    // 1. Calculate canonical region summaries
    const regionsList = [
      'ANTIOQUIA',
      'BUCARAMANGA',
      'NEIVA',
      'IBAGUE',
      'BOGOTA',
      'BARRANQUILLA',
      'CARTAGENA',
      'YUMBO',
      'CALI'
    ];

    const getCanonicalRegion = (ciudad: string): string => {
      const c = (ciudad || '').toLowerCase();
      if (c.includes('medell') || c.includes('antioq') || c.includes('envigado') || c.includes('bello') || c.includes('sabaneta') || c.includes('itagü') || c.includes('itagu')) return 'ANTIOQUIA';
      if (c.includes('bucaramanga') || c.includes('floridablanca') || c.includes('giron') || c.includes('girón')) return 'BUCARAMANGA';
      if (c.includes('neiva')) return 'NEIVA';
      if (c.includes('ibague') || c.includes('ibagué')) return 'IBAGUE';
      if (c.includes('bogot') || c.includes('bogót')) return 'BOGOTA';
      if (c.includes('barranquilla') || c.includes('soledad')) return 'BARRANQUILLA';
      if (c.includes('cartagena')) return 'CARTAGENA';
      if (c.includes('yumbo')) return 'YUMBO';
      if (c.includes('cali') || c.includes('jamundi') || c.includes('palmira')) return 'CALI';
      return '';
    };

    const regionalSummaries = regionsList.map(region => {
      const regionOrders = filteredOrders.filter(o => getCanonicalRegion(o.ciudad) === region);
      
      let venta = 0;
      let ventaWeight = 0;
      let pend = 0;
      let pendWeight = 0;
      let flete = 0;

      regionOrders.forEach(o => {
        if (o.estado === 'Entregado' || o.estado === 'Despachado' || o.estado === 'En Sitio / Bodega') {
          venta += o.facturado || o.venta;
          ventaWeight += o.pesoFact || o.peso;
          flete += o.flete;
        } else if (o.estado === 'Pendiente' || o.estado === 'En Cargue') {
          pend += o.venta;
          pendWeight += o.peso;
        }
      });

      return {
        region,
        venta,
        ventaTons: ventaWeight / 1000,
        pend,
        pendTons: pendWeight / 1000,
        flete
      };
    });

    // 2. Compute attention metrics for client
    const clientMap: Record<string, { flete: number; sales: number }> = {};
    filteredOrders.forEach(o => {
      if (o.estado === 'Entregado' || o.estado === 'Despachado' || o.estado === 'En Sitio / Bodega') {
        const clientName = o.cliente || 'Otros';
        if (!clientMap[clientName]) {
          clientMap[clientName] = { flete: 0, sales: 0 };
        }
        clientMap[clientName].flete += o.flete;
        clientMap[clientName].sales += o.facturado || o.venta;
      }
    });

    let maxClientLogCost = { name: 'Sin registros', flete: 0, pct: 0 };
    Object.entries(clientMap).forEach(([name, data]) => {
      if (data.flete > maxClientLogCost.flete) {
        maxClientLogCost = {
          name,
          flete: data.flete,
          pct: data.sales > 0 ? (data.flete / data.sales) * 100 : 0
        };
      }
    });

    // 3. Compute attention metrics for region
    let maxRegionLogCost = { name: 'Sin registros', flete: 0, pct: 0 };
    regionalSummaries.forEach(reg => {
      if (reg.flete > maxRegionLogCost.flete) {
        maxRegionLogCost = {
          name: reg.region,
          flete: reg.flete,
          pct: reg.venta > 0 ? (reg.flete / reg.venta) * 100 : 0
        };
      }
    });

    // 4. Retrieve single capitalized month if applicable
    const activeMonthsNames = MONTHS_LIST
      .filter(m => selectedMonths.includes(m.code))
      .map(m => m.name.toUpperCase());
    
    let reportMonthName = 'CONSOLIDADO';
    if (activeMonthsNames.length === 1) {
      reportMonthName = activeMonthsNames[0];
    } else if (activeMonthsNames.length > 1 && activeMonthsNames.length < 12) {
      reportMonthName = `${activeMonthsNames[0]} - ${activeMonthsNames[activeMonthsNames.length - 1]}`;
    }

    try {
      const response = await fetch("/api/gemini/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          stats: {
            ...stats,
            // supply channels and other statistics to the AI for richer reporting context
            channelsBreakdown: channelData,
            macroRegionalBreakdown: macroRegionalData,
            regionalSummaries,
            attentionClient: maxClientLogCost,
            attentionRegion: maxRegionLogCost
          },
          filterInfo: {
            periodo: selectedYear ? `Año Fiscal ${selectedYear}` : "Histórico Total",
            meses: activeMonthsString || "Sin meses elegidos",
            clientes: activeClientsString,
            operador: analyticCarrier || "Todos los Operadores Socios",
            reportMonthName
          }
        }),
      });

      if (!response.ok) {
        throw new Error("La API del servidor retornó un error.");
      }

      const data = await response.json();
      setGptReport(data.report);
    } catch (err: any) {
      console.error(err);
      setGptReport(`⚠️ Error al invocar la API del servidor o falta GEMINI_API_KEY en configuraciones: ${err.message || ""}\n\nPor favor, configure la clave de Gemini API en la sección de secretos de su barra de herramientas superior.`);
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (gptReport) {
      navigator.clipboard.writeText(gptReport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Standard Recharts colors
  const COLORS = ['#00d2ff', '#00ffa3', '#ffc107', '#ff4444', '#a855f7', '#6366f1'];

  // Subtotal Net format helper
  const fmt = (v: number) => {
    return '$' + Math.round(v).toLocaleString('es-CO');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* 1. SECTION HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-sky-950/40">
        <div className="space-y-1">
          <h2 className="text-xl font-display font-extrabold text-hud-accent tracking-widest flex items-center gap-2 uppercase">
            <BarChart2 className="w-5 h-5 text-hud-accent animate-pulse-soft" /> 
            Inteligencia Logística y KPI de Gestión
          </h2>
          <p className="text-xs text-slate-400">Canalizaciones de carga, devoluciones de fletes y optimización de fletarios</p>
        </div>
      </div>

      {/* 2. ADVANCED FILTERS PANEL (As requested and shown in image) */}
      <div className="bg-hud-card border-x-2 border-l-hud-accent border-r-slate-800/20 bg-slate-900/10 border-y border-hud-border/40 rounded-xl p-5 shadow-lg relative">
        <div className="text-[10px] text-hud-accent font-semibold font-mono tracking-widest uppercase mb-3 flex items-center gap-1">
          <span>🔍</span> FILTROS DE ANÁLISIS
        </div>

        {/* Quick Month Filter Bar */}
        <div className="mb-5 p-3 sm:p-4 bg-slate-950/40 rounded-lg border border-slate-900/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[10.5px] font-mono uppercase text-slate-300 font-bold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-hud-accent animate-pulse-soft" />
              Filtrar Información por Meses Requeridos:
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedMonths(MONTHS_LIST.map(m => m.code))}
                className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-300 hover:text-[#00ffa3] bg-slate-950 hover:bg-slate-900 px-2.5 py-1 rounded border border-slate-800 transition cursor-pointer"
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonths(['01','02','03','04','05','06'])}
                className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-300 hover:text-[#00ffa3] bg-slate-950 hover:bg-slate-900 px-2.5 py-1 rounded border border-slate-800 transition cursor-pointer"
              >
                1er Semestre
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonths(['07','08','09','10','11','12'])}
                className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#3b82f6] hover:text-[#00ffa3] bg-slate-950 hover:bg-slate-900 px-2.5 py-1 rounded border border-slate-800 transition cursor-pointer"
              >
                2do Semestre
              </button>
              <button
                type="button"
                onClick={() => setSelectedMonths([])}
                className="text-[9px] font-mono font-bold uppercase tracking-wider text-rose-500 hover:text-rose-400 bg-slate-950 hover:bg-slate-900 px-2.5 py-1 rounded border border-slate-800 transition cursor-pointer"
              >
                Limpiar Todo
              </button>
            </div>
          </div>
          
          <div className="notranslate grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-1.5" translate="no">
            {MONTHS_LIST.map(m => {
              const isSelected = selectedMonths.includes(m.code);
              return (
                <button
                  type="button"
                  key={m.code}
                  translate="no"
                  onClick={() => {
                    if (isSelected) {
                      setSelectedMonths(selectedMonths.filter(x => x !== m.code));
                    } else {
                      setSelectedMonths([...selectedMonths, m.code].sort());
                    }
                  }}
                  className={`notranslate py-2 rounded text-[10px] font-mono font-bold transition-all cursor-pointer text-center border ${
                    isSelected
                      ? 'bg-hud-accent/15 border-hud-accent text-hud-accent shadow-[0_0_10px_rgba(0,255,163,0.15)] font-black'
                      : 'bg-slate-950 border-slate-900 text-slate-400 hover:text-white hover:border-slate-800'
                  }`}
                  title={`Alternar ${m.name}`}
                >
                  <span translate="no" className="notranslate">{m.name.substring(0, 3).toUpperCase()}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          
          {/* Filter 1: Analizar Año */}
          <div className="space-y-1.5">
            <label className="text-[10.5px] font-mono uppercase text-slate-400 block font-bold">Analizar Año</label>
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded px-3 py-2 outline-none hover:border-slate-700 transition"
            >
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="">Todos los años</option>
            </select>
          </div>

          {/* Filter 2: Mes de Análisis (Varios) con selector múltiple */}
          <div className="space-y-1.5 relative notranslate" ref={monthRef} translate="no">
            <label className="text-[10.5px] font-mono uppercase text-slate-400 block font-bold">Mes de Análisis (Varios)</label>
            <button
              type="button"
              translate="no"
              onClick={() => setShowMonthDropdown(!showMonthDropdown)}
              className="notranslate w-full bg-slate-950 border border-slate-800 text-xs text-left leading-relaxed text-slate-200 rounded px-3 py-2 flex items-center justify-between outline-none hover:border-slate-700 transition"
            >
              <span className="truncate notranslate" translate="no">
                {selectedMonths.length === 12 
                  ? 'Todos' 
                  : selectedMonths.length === 0 
                  ? 'Ninguno seleccionado'
                  : selectedMonths.length === 1
                  ? <span translate="no" className="notranslate">{MONTHS_LIST.find(m => m.code === selectedMonths[0])?.name}</span>
                  : `Varios (${selectedMonths.length})`}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${showMonthDropdown ? 'rotate-180' : ''}`} />
            </button>

             {/* Custom Multiple month lists selection dropdown */}
             {showMonthDropdown && (
               <div className="absolute top-full left-0 w-60 bg-slate-950 border border-slate-800 rounded-lg shadow-xl mt-1 p-2.5 z-50 space-y-2 notranslate" translate="no">
                 <div className="flex justify-between items-center pb-2 border-b border-sky-950 text-[10px] font-mono notranslate" translate="no">
                   <button
                     type="button"
                     translate="no"
                     onClick={() => setSelectedMonths(MONTHS_LIST.map(m => m.code))}
                     className="notranslate px-2 py-0.5 bg-slate-900 text-slate-300 hover:text-white rounded uppercase font-bold"
                   >
                     Todos
                   </button>
                   <button
                     type="button"
                     translate="no"
                     onClick={() => setSelectedMonths([])}
                     className="notranslate px-2 py-0.5 bg-slate-900 text-slate-300 hover:text-white rounded uppercase font-bold"
                   >
                     Ninguno
                   </button>
                 </div>
                 <div className="max-h-56 overflow-y-auto space-y-1 font-mono text-[11px] text-slate-300 pr-1 notranslate" translate="no">
                   {MONTHS_LIST.map(m => {
                     const isChecked = selectedMonths.includes(m.code);
                     return (
                       <button
                         type="button"
                         key={m.code}
                         translate="no"
                         onClick={() => {
                           if (isChecked) {
                             setSelectedMonths(selectedMonths.filter(x => x !== m.code));
                           } else {
                             setSelectedMonths([...selectedMonths, m.code].sort());
                           }
                         }}
                         className="notranslate w-full text-left p-1.5 rounded hover:bg-slate-900/60 flex items-center gap-2 cursor-pointer transition-all"
                       >
                         <div className={`w-3.5 h-3.5 rounded border border-slate-700 flex items-center justify-center ${isChecked ? 'bg-hud-accent border-hud-accent text-slate-950' : 'bg-slate-950'}`}>
                           {isChecked && <Check className="w-2.5 h-2.5 stroke-[4]" />}
                         </div>
                         <span translate="no" className="notranslate">{m.name}</span>
                       </button>
                     );
                   })}
                 </div>
               </div>
             )}
          </div>

          {/* Filter 3: Periodo Especial */}
          <div className="space-y-1.5">
            <label className="text-[10.5px] font-mono uppercase text-slate-400 block font-bold">Periodo Especial</label>
            <select
              value={specialPeriod}
              onChange={e => setSpecialPeriod(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded px-3 py-2 outline-none hover:border-slate-700 transition"
            >
              <option value="none">Sin Filtro Periodo</option>
              <option value="S1">Primer Semestre (Ene-Jun)</option>
              <option value="S2">Segundo Semestre (Jul-Dic)</option>
              <option value="Q1">Primer Trimestre (Q1)</option>
              <option value="Q2">Segundo Trimestre (Q2)</option>
              <option value="Q3">Tercer Trimestre (Q3)</option>
              <option value="Q4">Cuarto Trimestre (Q4)</option>
            </select>
          </div>

          {/* Filter 4: Cliente (Selección Múltiple) */}
          <div className="space-y-1.5 relative" ref={clientRef}>
            <label className="text-[10.5px] font-mono uppercase text-slate-400 block font-bold">Cliente (Selección Múltiple)</label>
            <button
              type="button"
              onClick={() => setShowClientDropdown(!showClientDropdown)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-left leading-relaxed text-slate-200 rounded px-3 py-2 flex items-center justify-between outline-none hover:border-slate-700 transition"
            >
              <span className="truncate">
                {selectedClients.length === 0 
                  ? 'Todos' 
                  : selectedClients.length === 1 
                  ? selectedClients[0].substring(0, 15) + '...'
                  : `Varios (${selectedClients.length})`}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${showClientDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Custom Multiple customer selection dropdown */}
            {showClientDropdown && (
              <div className="absolute top-full left-0 w-72 bg-slate-950 border border-slate-800 rounded-lg shadow-xl mt-1 p-2.5 z-50 space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-sky-950 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => setSelectedClients([])}
                    className="px-2 py-0.5 bg-slate-900 text-slate-300 hover:text-white rounded uppercase font-bold"
                  >
                    Todos (Ningún Filtro)
                  </button>
                  <span className="text-slate-500">Filtrando {selectedClients.length}</span>
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1 font-mono text-[10px] text-slate-300 pr-1 select-none">
                  {uniqueClients.map(cli => {
                    const isChecked = selectedClients.includes(cli);
                    return (
                      <button
                        type="button"
                        key={cli}
                        onClick={() => {
                          if (isChecked) {
                            setSelectedClients(selectedClients.filter(x => x !== cli));
                          } else {
                            setSelectedClients([...selectedClients, cli]);
                          }
                        }}
                        className="w-full text-left p-1.5 rounded hover:bg-slate-900/60 flex items-center gap-2 cursor-pointer transition-all"
                      >
                        <div className={`w-3.5 h-3.5 rounded border border-slate-700 flex items-center justify-center shrink-0 ${isChecked ? 'bg-hud-accent border-hud-accent text-slate-950' : 'bg-slate-950'}`}>
                          {isChecked && <Check className="w-2.5 h-2.5 stroke-[4]" />}
                        </div>
                        <span className="truncate">{cli}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Filter 5: Transportadora */}
          <div className="space-y-1.5 relative">
            <label className="text-[10.5px] font-mono uppercase text-slate-400 block font-bold">Transportadora</label>
            <select
              value={analyticCarrier}
              onChange={e => setAnalyticCarrier(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-white rounded px-3 py-2 outline-none hover:border-slate-700 transition"
            >
              <option value="">-- Todas --</option>
              {carriers.map(c => (
                <option key={c.id} value={c.nombre}>{c.nombre}</option>
              ))}
            </select>
          </div>

        </div>

        {/* Reset filters line with absolute link matching user visual */}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleResetFilters}
            className="flex items-center gap-1.5 text-[10.5px] font-mono font-bold uppercase tracking-wider text-hud-accent hover:text-slate-200 border border-hud-accent/30 hover:border-hud-accent rounded px-3.5 py-1.5 bg-slate-950 transition"
          >
            <RotateCcw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '6s' }} /> RESTABLECER FILTROS
          </button>
        </div>
      </div>

      {/* 3. COHESIVE KPI CARDS GRID (Designed exactly after the image layout) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* KPI: Subtotal Neto */}
        <div className="bg-hud-card border-l-2 border-l-cyan-400 border border-hud-border/70 rounded-lg p-4 space-y-1 bg-gradient-to-r from-cyan-950/20 to-transparent md:col-span-2">
          <div className="text-[10px] text-slate-400 font-mono tracking-widest uppercase block">SUBTOTAL NETO</div>
          <div className="text-xl font-mono font-extrabold text-[#00d2ff]">
            {fmt(stats.subtotal)} <span className="text-[9px] text-[#476a8a] font-normal">COP</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
            <span>📈</span> Suma de Pedidos Valorizados
          </div>
        </div>

        {/* KPI: Meta Año 2026 */}
        <div className="bg-hud-card border-l-2 border-l-emerald-400 border border-hud-border/70 rounded-lg p-4 space-y-1 bg-gradient-to-r from-emerald-950/20 to-transparent">
          <div className="text-[10px] text-slate-400 font-mono tracking-widest uppercase block">META AÑO 2026 (1000M)</div>
          <div className="text-xl font-mono font-extrabold text-[#10b981]">
            {((stats.totalSales / 1000000000) * 100).toFixed(1)}%
          </div>
          <p className="text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-1">
            {stats.totalSales >= 1000000000 ? '🎉 Meta Anual Superada!' : '🎯 En camino a meta anual'}
          </p>
        </div>

        {/* KPI: Pendiente por Despachar */}
        <div className="bg-hud-card border-l-2 border-l-amber-500 border border-hud-border/70 rounded-lg p-4 space-y-1 bg-gradient-to-r from-amber-950/20 to-transparent">
          <div className="text-[10px] text-amber-500 font-mono tracking-widest uppercase block font-bold">PENDIENTE POR DESPACHAR</div>
          <div className="text-xl font-mono font-extrabold text-[#f59e0b]">
            {fmt(stats.pendingValue)} <span className="text-[9px] text-[#476a8a] font-normal">COP</span>
          </div>
          <p className="text-[10px] font-mono text-slate-400">
            ⏳ Gestión en cola: {stats.pendingBoxes} Cajas
          </p>
        </div>

        {/* KPI: Costo Transporte Fletes */}
        <div className="bg-hud-card border border-hud-border/60 rounded-lg p-4 space-y-1">
          <div className="text-[10.5px] text-slate-400 font-mono tracking-widest uppercase block">COSTO LOGÍSTICO (FLETES)</div>
          <div className="text-lg font-mono font-bold text-white">
            {fmt(stats.transportCost)}
          </div>
          <p className="text-[10px] font-mono text-hud-accent font-bold">
            Impacto fletario: {stats.impactPct.toFixed(2)}% sobre venta
          </p>
        </div>

        {/* KPI: Volumen Fisico Cajas */}
        <div className="bg-hud-card border border-hud-border/60 rounded-lg p-4 space-y-1">
          <div className="text-[10.5px] text-slate-400 font-mono tracking-widest uppercase block">VOLUMEN FÍSICO DESPACHADO</div>
          <div className="text-lg font-mono font-bold text-slate-100">
            {stats.totalBoxes.toLocaleString('es-CO')} <span className="text-xs text-slate-500 font-normal">Cajas</span>
          </div>
          <p className="text-[10px] font-mono text-slate-400">
            Promedio: {stats.totalBoxes > 0 ? (stats.totalBoxes / filteredOrders.length).toFixed(1) : 0} cajas / orden
          </p>
        </div>

        {/* KPI: Masa Critica Kgs */}
        <div className="bg-hud-card border border-hud-border/60 rounded-lg p-4 space-y-1">
          <div className="text-[10.5px] text-slate-400 font-mono tracking-widest uppercase block">MASA CRÍTICA DESPACHADA</div>
          <div className="text-lg font-mono font-bold text-slate-100">
            {stats.totalWeight.toLocaleString('es-CO')} <span className="text-xs text-slate-500 font-normal">Kg</span>
          </div>
          <p className="text-[10px] font-mono text-slate-400">
            Equivale a: <strong className="text-hud-accent">{(stats.totalWeight / 1000).toFixed(2)} toneladas</strong>
          </p>
        </div>

        {/* KPI: Costo Kg Movilizado */}
        <div className="bg-hud-card border border-hud-border/60 rounded-lg p-4 space-y-1">
          <div className="text-[10.5px] text-slate-400 font-mono tracking-widest uppercase block">TASA LOGÍSTICA DE PESO</div>
          <div className="text-lg font-mono font-bold text-emerald-400">
            {stats.efficiencyCostPerKg.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 1 })} / Kg
          </div>
          <p className="text-[10px] font-mono text-slate-400">
            Ahorro Est. vs 10% meta: <strong className="text-hud-green">{fmt(stats.estimatedSavings)}</strong>
          </p>
        </div>

      </div>

      {/* 4. WORKSTATION LAYOUT: LEFT NAVIGATION OF 14 REPORTS, RIGHT DETAILED INTERACTIVE CHART & TABLES */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        
        {/* Left index: Sidebar select with the 14 reports list */}
        <aside className="lg:col-span-4 bg-hud-card border border-hud-border/60 rounded-lg p-4 space-y-3 shrink-0">
          <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#476a8a] border-b border-sky-950 pb-2">
            📋 MÓDULO DE ANÁLISIS LOGÍSTICO
          </div>

          <div className="space-y-1 mr-1 max-h-[640px] overflow-y-auto pr-1">
            {[
              { id: '1_ventas', label: '1. Evolución Mensual de Ventas' },
              { id: '2_estado', label: '2. Estado de Pedidos' },
              { id: '3_eficiencia', label: '3. Eficiencia por Operador (Costo por Kg)' },
              { id: '4_participacion', label: '4. Participación Transportadoras (Valor)' },
              { id: '5_clientes', label: '5. Top 5 Clientes (Facturación)' },
              { id: '6_costo_region', label: '6. Costo Logístico por Región (Top 10 Ciudades)' },
              { id: '7_eficiencia_transp', label: '7. Comparativo Eficiencia por Transportadora (%)' },
              { id: '8_flete_prom', label: '8. Evolución Flete Promedio Mensual ($ y %)' },
              { id: '9_flete_variacion', label: '9. Desglose Estratégico Variación Flete' },
              { id: '11_costo_log_transp', label: '10. Análisis Costo por Transportadora (Unitario)' },
              { id: '12_ventas_canal', label: '11. Ventas por Canal Estratégico' },
              { id: '10_costo_log_reg', label: '12. Análisis de Gasto, Peso Despachado y Clientes por Región (Consolidado)' },
              { id: '13_pendientes_canal', label: '13. Pendientes por Canal Estratégico' },
              { id: '14_informe_ia', label: '14. Informe de Gestión Inteligente (Gemini)' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveReportTab(tab.id)}
                className={`w-full text-left font-mono font-semibold text-xs rounded-lg p-2.5 transition flex items-center justify-between cursor-pointer ${
                  activeReportTab === tab.id 
                    ? 'bg-hud-accent/15 border-l-2 border-hud-accent text-hud-accent' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-900/40'
                }`}
              >
                <span className="truncate">{tab.label}</span>
                <ChevronDown className="w-3 h-3 rotate-270 opacity-30 shrink-0" />
              </button>
            ))}
          </div>
        </aside>

        {/* Right workspace: Selected Analysis content container */}
        <section className="lg:col-span-8 bg-hud-card border border-hud-border/60 rounded-lg p-5 space-y-6">
          
          {/* TAB 1: EVOLUCION MENSUAL DE VENTAS VS COSTO FLETES */}
          {activeReportTab === '1_ventas' && (
            <div className="space-y-5">
              <div className="border-b border-sky-950/60 pb-3">
                <h3 className="text-sm font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-hud-accent" /> 
                  1. Evolución Mensual de Ventas vs Costos de Flete ($ Millones COP)
                </h3>
                <p className="text-[11px] text-slate-400">Permite mapear la estacionalidad del flujo comercial fletario.</p>
              </div>

              <div className="h-72 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="gVentas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00d2ff" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#00d2ff" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="gFletes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ff9100" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#ff9100" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#08142c" />
                    <XAxis dataKey="name" stroke="#52647c" fontSize={10} className="font-mono" />
                    <YAxis stroke="#52647c" fontSize={10} className="font-mono" />
                    <Tooltip contentStyle={{ backgroundColor: '#091124', borderColor: '#1e3a5f', fontSize: '11px', color: '#fff' }} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Area type="monotone" name="Invoicing (Ventas-Millones)" dataKey="Ventas" stroke="#00d2ff" fillOpacity={1} fill="url(#gVentas)" strokeWidth={2} />
                    <Area type="monotone" name="Freights (Fletes-Millones)" dataKey="Fletes" stroke="#ff9100" fillOpacity={1} fill="url(#gFletes)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                <h4 className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wider">Tabulador Histórico por Meses</h4>
                <div className="overflow-x-auto border border-sky-950/40 rounded">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="bg-[#030610] text-[#476a8a] border-b border-sky-950/50 uppercase">
                      <tr>
                        <th className="p-2.5">Mes</th>
                        <th className="p-2.5">Facturado / Despachado (Millones)</th>
                        <th className="p-2.5">Incurido en Flete (Millones)</th>
                        <th className="p-2.5">Relación Impacto %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/60 text-slate-300">
                      {monthlyData.map((m, idx) => {
                        const ratio = m.Ventas > 0 ? (m.Fletes / m.Ventas) * 100 : 0;
                        return (
                          <tr key={idx} className="hover:bg-slate-900/10">
                            <td className="p-2.5 text-white font-bold">{m.name}</td>
                            <td className="p-2.5">${m.Ventas.toFixed(2)}M COP</td>
                            <td className="p-2.5">${m.Fletes.toFixed(2)}M COP</td>
                            <td className="p-2.5">
                              <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${ratio > 10 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                {ratio.toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ESTADO DE PEDIDOS */}
          {activeReportTab === '2_estado' && (
            <div className="space-y-5">
              <div className="border-b border-sky-950/60 pb-3">
                <h3 className="text-sm font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-hud-green" /> 
                  2. Análisis General de Estado de Pedidos y Embudo de Despacho
                </h3>
                <p className="text-[11px] text-slate-400">Detalla cantidad de pedidos, valorizaciones brutas, cajas y pesos por cada hito de muelle.</p>
              </div>

              {/* BarChart of active state factors */}
              <div className="h-64 bg-slate-950/40 p-2 rounded-lg border border-slate-900">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={Object.entries(stats.statusCounts).map(([status, dat]) => ({
                      status,
                      Valor: Math.round(dat.value / 1000000), // Millions
                      Conteo: dat.count
                    }))}
                    margin={{ top: 10, right: 10, left: -25, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#08142c" />
                    <XAxis dataKey="status" stroke="#52647c" fontSize={9} />
                    <YAxis stroke="#52647c" fontSize={9} />
                    <Tooltip contentStyle={{ backgroundColor: '#091124', borderColor: '#1e3a5f', fontSize: '11px' }} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Bar name="Valor (Millones COP)" dataKey="Valor" fill="#00ffa3" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Status table breakdown */}
              <div className="overflow-x-auto border border-sky-950/40 rounded">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead className="bg-[#030610] text-[#476a8a] border-b border-sky-950/50 uppercase">
                    <tr>
                      <th className="p-2.5">Estado del Pedido</th>
                      <th className="p-2.5 text-center">Conteo</th>
                      <th className="p-2.5">Suma Valor Bruto</th>
                      <th className="p-2.5">Peso Total (Kg)</th>
                      <th className="p-2.5">Volumen Cajas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 text-slate-350">
                    {Object.entries(stats.statusCounts).map(([status, dat], idx) => (
                      <tr key={idx} className="hover:bg-slate-900/15">
                        <td className="p-2.5 text-white font-bold flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${
                            status === 'Anulado' ? 'bg-red-500' :
                            status === 'Finalizado' || status === 'Entregado' ? 'bg-emerald-400' :
                            status === 'Pendiente' ? 'bg-amber-400' : 'bg-cyan-400'
                          }`}></span>
                          {status}
                        </td>
                        <td className="p-2.5 text-center font-bold text-white">{dat.count}</td>
                        <td className="p-2.5">{fmt(dat.value)}</td>
                        <td className="p-2.5">{dat.weight.toLocaleString('es-CO')} kg</td>
                        <td className="p-2.5">{dat.boxes.toLocaleString('es-CO')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: EFICIENCIA POR OPERADOR (COSTO POR KG) */}
          {activeReportTab === '3_eficiencia' && (
            <div className="space-y-5">
              <div className="border-b border-sky-950/60 pb-3">
                <h3 className="text-sm font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-emerald-400" />
                  3. Eficiencia por Operador de Transporte (Costo Neto por Kg de Carga)
                </h3>
                <p className="text-[11px] text-slate-400">Analiza el costo de flete incurrido por cada kilogramo de masa crítica transportada (A menor valor, mayor eficiencia).</p>
              </div>

              {/* Horizontal Bar Chart for Costo por Kg */}
              <div className="h-64 bg-slate-950/40 p-2 rounded-lg border border-slate-900">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={stats.carriersBreakdown.map(c => ({
                      name: c.name,
                      'Costo por Kg ($)': Math.round(c.costPerKg)
                    }))}
                    margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#08142c" />
                    <XAxis type="number" stroke="#52647c" fontSize={9} />
                    <YAxis type="category" dataKey="name" stroke="#52647c" fontSize={9} width={100} />
                    <Tooltip formatter={(value) => [`$${value} COP / Kg`, 'Costo Promedio']} contentStyle={{ backgroundColor: '#091124' }} />
                    <Bar name="Costo Unitario por Kilogramo COP" dataKey="Costo por Kg ($)" fill="#00d2ff" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Table details */}
              <div className="overflow-x-auto border border-sky-950/40 rounded">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead className="bg-[#030610] text-[#476a8a] border-b border-sky-950/50 uppercase">
                    <tr>
                      <th className="p-2.5">Socio Operador</th>
                      <th className="p-2.5">Masa Despachada (Kg)</th>
                      <th className="p-2.5">Gastos Flete Acumulado</th>
                      <th className="p-2.5">Costo Unitario Promedio por Kg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 text-slate-300">
                    {stats.carriersBreakdown.map((c, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/15">
                        <td className="p-2.5 text-white font-bold">{c.name}</td>
                        <td className="p-2.5">{c.weight.toLocaleString('es-CO')} kg</td>
                        <td className="p-2.5">{fmt(c.cost)}</td>
                        <td className="p-2.5 font-bold text-emerald-400">
                          {c.costPerKg.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 1 })} / Kg
                        </td>
                      </tr>
                    ))}
                    {stats.carriersBreakdown.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-500">No hay fletes registrados para este periodo.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: PARTICIPACION TRANSPORTADORAS (VALOR) */}
          {activeReportTab === '4_participacion' && (
            <div className="space-y-5">
              <div className="border-b border-sky-950/60 pb-3">
                <h3 className="text-sm font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-hud-accent" />
                  4. Participación de Socios en el Gasto de Transporte
                </h3>
                <p className="text-[11px] text-slate-400">Representación porcentual y por volumen fletario de cada transportadora sobre el presupuesto general.</p>
              </div>

              <div className="h-60 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="w-full md:w-1/2 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.carriersBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="cost"
                      >
                        {stats.carriersBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#091124', fontSize: '11px' }} formatter={(v) => fmt(v as number)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="w-full md:w-1/2 font-mono text-[10.5px] text-slate-300 space-y-2">
                  {stats.carriersBreakdown.map((item, idx) => {
                    const totalCost = stats.carriersBreakdown.reduce((s, x) => s + x.cost, 0);
                    const pct = totalCost > 0 ? (item.cost / totalCost) * 100 : 0;
                    return (
                      <div key={idx} className="flex items-center justify-between border-b border-sky-950/40 pb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                          <span className="text-white font-medium truncate">{item.name}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <strong className="text-hud-accent">{fmt(item.cost)}</strong>
                          <span className="text-slate-500 text-[9.5px] ml-1.5">({pct.toFixed(1)}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-950/40 border border-sky-950/60 p-4 rounded-lg space-y-2 text-[11px] font-mono leading-relaxed">
                <div className="text-hud-accent font-bold uppercase tracking-wider">&gt; Distribución Logística Estratégica:</div>
                <p className="text-slate-350 uppercase text-[10px]">
                  El mayor gasto está concentrado en <span className="text-white font-bold">{stats.carriersBreakdown[0]?.name || "N/D"}</span>, con una inversión activa de <span className="text-hud-green font-bold">{fmt(stats.carriersBreakdown[0]?.cost || 0)}</span>. Evalúe diversificar para reducir factores de riesgo de dependencia operativa única.
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: TOP 5 CLIENTES (FACTURACIÓN) */}
          {activeReportTab === '5_clientes' && (
            <div className="space-y-5">
              <div className="border-b border-sky-950/60 pb-3">
                <h3 className="text-sm font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-cyan-400" />
                  5. Top 5 Clientes Principales por Facturación (Venta Final)
                </h3>
                <p className="text-[11px] text-slate-400">Identifica los socios comerciales que sostienen la mayor masa crítica e impactos de órdenes facturadas.</p>
              </div>

              <div className="h-64 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={topCustomersData}
                    margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#08142c" />
                    <XAxis type="number" stroke="#52647c" fontSize={9} />
                    <YAxis type="category" dataKey="name" stroke="#52647c" fontSize={9} width={120} />
                    <Tooltip formatter={(value) => [`$${value.toFixed(2)}M COP`, 'Facturado']} contentStyle={{ backgroundColor: '#091124' }} />
                    <Bar name="Facturación Acumulada (Millones COP)" dataKey="Valor" fill="#00ffa3" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Table Details */}
              <div className="overflow-x-auto border border-sky-950/40 rounded">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead className="bg-[#030610] text-[#476a8a] border-b border-sky-950/50 uppercase">
                    <tr>
                      <th className="p-2.5">Nombre Comercial</th>
                      <th className="p-2.5 text-center">Órdenes</th>
                      <th className="p-2.5">Facturación Acumulada</th>
                      <th className="p-2.5">Cajas Despachadas</th>
                      <th className="p-2.5">Peso Despachado (Kg)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 text-slate-350">
                    {topCustomersData.map((cust, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/15">
                        <td className="p-2.5 text-white font-bold">{cust.name}</td>
                        <td className="p-2.5 text-center font-bold text-white">{cust.orderCount}</td>
                        <td className="p-2.5 text-[#00ffa3] font-bold">{fmt(cust.rawValor)}</td>
                        <td className="p-2.5">{cust.boxes.toLocaleString('es-CO')}</td>
                        <td className="p-2.5">{cust.weight.toLocaleString('es-CO')} kg</td>
                      </tr>
                    ))}
                    {topCustomersData.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-slate-500">No hay órdenes para este cliente o fecha.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: COSTO LOGÍSTICO POR REGIÓN (TOP 10 CIUDADES) */}
          {activeReportTab === '6_costo_region' && (
            <div className="space-y-5">
              <div className="border-b border-sky-950/60 pb-3">
                <h3 className="text-sm font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-hud-orange animate-pulse" />
                  6. Costo Logístico de Fletes por Destino (Top 10 Ciudades)
                </h3>
                <p className="text-[11px] text-slate-400">Visualiza las 10 principales ciudades destinatarias según el costo de envío consumido.</p>
              </div>

              <div className="h-68 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={regionalData} margin={{ top: 10, right: 10, left: 15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#08142c" />
                    <XAxis dataKey="name" stroke="#52647c" fontSize={9} />
                    <YAxis stroke="#52647c" fontSize={9} />
                    <Tooltip formatter={(v) => [fmt(v as number), 'Costo Flete']} contentStyle={{ backgroundColor: '#091124' }} />
                    <Bar name="Fletes Consumidos COP" dataKey="Fletes" fill="#ea580c" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Table details */}
              <div className="overflow-x-auto border border-sky-950/40 rounded">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead className="bg-[#030610] text-[#476a8a] border-b border-sky-950/50 uppercase">
                    <tr>
                      <th className="p-2.5">Posición y Ciudad Destino</th>
                      <th className="p-2.5">Fletes Consumidos</th>
                      <th className="p-2.5">Ventas Generadas</th>
                      <th className="p-2.5">Porcentaje Impacto Flete / Venta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 text-slate-350">
                    {regionalData.map((city, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/15">
                        <td className="p-2.5 text-white font-bold flex items-center gap-2">
                          <span className="text-[10px] bg-slate-900 border border-slate-800 text-slate-400 w-5 h-5 flex items-center justify-center rounded-full font-bold">
                            {idx + 1}
                          </span>
                          {city.name}
                        </td>
                        <td className="p-2.5 font-bold text-white">{fmt(city.Fletes)}</td>
                        <td className="p-2.5">{fmt(city.Sales)}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${city.Ratio > 12 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                            {city.Ratio.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: COMPARATIVO EFICIENCIA POR TRANSPORTADORA (%) */}
          {activeReportTab === '7_eficiencia_transp' && (
            <div className="space-y-5">
              <div className="border-b border-sky-950/60 pb-3">
                <h3 className="text-sm font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-hud-green" />
                  7. Comparativo Eficiencia por Transportadora (% sobre Venta Transportada)
                </h3>
                <p className="text-[11px] text-slate-400">Evalúa qué porcentaje de la facturación se destina a pagar el flete de cada operador (Menor porcentaje indica mayor eficiencia financiera por flete).</p>
              </div>

              <div className="h-64 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.carriersBreakdown}
                    margin={{ top: 10, right: 10, left: -25, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#08142c" />
                    <XAxis dataKey="name" stroke="#52647c" fontSize={9} />
                    <YAxis stroke="#52647c" fontSize={9} />
                    <Tooltip formatter={(value) => [`${(value as number).toFixed(2)}%`, 'Porcentaje de Impacto']} contentStyle={{ backgroundColor: '#091124' }} />
                    <Bar name="Relación % Flete vs Ventas" dataKey="pct" fill="#10b981" radius={[4, 4, 0, 0]}>
                      {stats.carriersBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.pct > 10 ? '#ef4444' : '#10b981'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* In-view KPI Diagnostic Box */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-emerald-950/10 border border-emerald-500/20 p-4 rounded-lg space-y-2 text-[11px] font-mono">
                  <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <span>✅</span> OPERADOR DE MÁXIMA RENTABILIDAD fletaria
                  </div>
                  <p className="text-slate-300">
                    El operador con menor impacto sobre venta es <strong className="text-white">
                      {stats.carriersBreakdown.length > 0 && [...stats.carriersBreakdown].sort((a,b) => a.pct - b.pct)[0]?.name}
                    </strong> con tan solo un <strong className="text-emerald-400">
                      {stats.carriersBreakdown.length > 0 && [...stats.carriersBreakdown].sort((a,b) => a.pct - b.pct)[0]?.pct.toFixed(2)}%
                    </strong>. Se sugiere priorizar la asignación de viajes de alta valorización con este socio.
                  </p>
                </div>

                <div className="bg-rose-950/10 border border-rose-500/20 p-4 rounded-lg space-y-2 text-[11px] font-mono">
                  <div className="text-rose-400 font-bold flex items-center gap-1.5">
                    <span>⚠️</span> ALERTA DE COSTO ELEVADO fletario
                  </div>
                  <p className="text-slate-300">
                    El operador <strong className="text-white">
                      {stats.carriersBreakdown.length > 0 && [...stats.carriersBreakdown].sort((a,b) => b.pct - a.pct)[0]?.name}
                    </strong> registra un impacto de <strong className="text-rose-400">
                      {stats.carriersBreakdown.length > 0 && [...stats.carriersBreakdown].sort((a,b) => b.pct - a.pct)[0]?.pct.toFixed(2)}%
                    </strong> (Mayor a la tasa de resguardo del 10%). Evaluar posible recargo por trayectos parciales o negociar tarifas planas.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: EVOLUCIÓN FLETE PROMEDIO MENSUAL ($ Y %) */}
          {activeReportTab === '8_flete_prom' && (
            <div className="space-y-5">
              <div className="border-b border-sky-950/60 pb-3">
                <h3 className="text-sm font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-amber-500" />
                  8. Evolución Flete de Envío Promedio Mensual ($ COP) y Variación MoM
                </h3>
                <p className="text-[11px] text-slate-400">Mide el costo flete promedio facturado por cada orden individual en muelle y su fluctuación mensual.</p>
              </div>

              {/* Composed chart representing average flete and MoM change */}
              <div className="h-68 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyFleteAverageData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#08142c" />
                    <XAxis dataKey="name" stroke="#52647c" fontSize={9} />
                    <YAxis stroke="#52647c" fontSize={9} />
                    <Tooltip formatter={(value, name) => {
                      if (name === 'Promedio') return [`$${Math.round(value as number).toLocaleString('es-CO')}`, 'Flete Promedio / Pedido'];
                      return [`${(value as number).toFixed(1)}%`, 'Cambio MoM'];
                    }} contentStyle={{ backgroundColor: '#091124' }} />
                    <Bar name="Promedio" dataKey="Promedio" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Detailed statistical breakdown table */}
              <div className="overflow-x-auto border border-sky-950/40 rounded">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead className="bg-[#030610] text-[#476a8a] border-b border-sky-950/50 uppercase">
                    <tr>
                      <th className="p-2.5">Mes</th>
                      <th className="p-2.5">Flete Promedio por Envío / Pedido (COP)</th>
                      <th className="p-2.5">Variación Porcentual Frente Mes Anterior (MoM)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 text-slate-350">
                    {monthlyFleteAverageData.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/15">
                        <td className="p-2.5 text-white font-bold">{m.name}</td>
                        <td className="p-2.5 text-slate-100 font-bold">
                          {m.Promedio > 0 ? fmt(m.Promedio) : '$0'} COP
                        </td>
                        <td className="p-2.5">
                          {idx === 0 ? (
                            <span className="text-slate-500 font-semibold">-</span>
                          ) : m.CambioMoM > 0 ? (
                            <span className="text-rose-400 font-bold">▲ +{m.CambioMoM.toFixed(1)}%</span>
                          ) : m.CambioMoM < 0 ? (
                            <span className="text-emerald-400 font-bold">▼ {m.CambioMoM.toFixed(1)}%</span>
                          ) : (
                            <span className="text-slate-400 font-semibold font-mono">0.0%</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 9: DESGLOSE ESTRATÉGICO VARIACIÓN FLETE */}
          {activeReportTab === '9_flete_variacion' && (
            <div className="space-y-5">
              <div className="border-b border-sky-950/60 pb-3">
                <h3 className="text-sm font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-hud-accent animate-pulse" />
                  9. Desglose Estratégico y Variación de Flete Promedio
                </h3>
                <p className="text-[11px] text-slate-400">Auditoría detallada de fletes promedio ponderados por unidad física física (Caja y Kilogramo) ante incrementos de combustibles.</p>
              </div>

              {/* Correlation of density chart / summary factors */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#030610] p-4 border border-sky-950 rounded-lg text-center space-y-1">
                  <div className="text-[10px] text-slate-400 font-mono text-center uppercase block">Costo Flete Promedio Ponderado</div>
                  <div className="text-lg font-mono font-bold text-[#00d2ff]">
                    {stats.totalSales > 0 ? fmt(stats.transportCost / filteredOrders.filter(o=>o.estado!=='Anulado').length) : '$0'} COP
                  </div>
                  <span className="text-[9px] text-slate-500 block uppercase font-mono">Por orden emitida</span>
                </div>

                <div className="bg-[#030610] p-4 border border-sky-950 rounded-lg text-center space-y-1">
                  <div className="text-[10px] text-slate-400 font-mono text-center uppercase block">Costo Flete Unitario por Caja</div>
                  <div className="text-lg font-mono font-bold text-[#00ffa3]">
                    {stats.totalBoxes > 0 ? fmt(stats.transportCost / stats.totalBoxes) : '$0'} COP
                  </div>
                  <span className="text-[9px] text-slate-500 block uppercase font-mono">Por caja movilizada</span>
                </div>

                <div className="bg-[#030610] p-4 border border-sky-950 rounded-lg text-center space-y-1">
                  <div className="text-[10px] text-slate-400 font-mono text-center uppercase block">Rendimiento por Tonelada</div>
                  <div className="text-lg font-mono font-bold text-amber-400">
                    {stats.totalWeight > 0 ? fmt((stats.transportCost / stats.totalWeight) * 1000) : '$0'} COP
                  </div>
                  <span className="text-[9px] text-slate-500 block uppercase font-mono">Por Tonelada métrica</span>
                </div>
              </div>

              {/* Dynamic diagnostic checklists */}
              <div className="p-4 bg-slate-950/60 border border-sky-950 rounded-lg space-y-3">
                <div className="text-xs font-mono font-bold text-hud-orange uppercase flex items-center gap-1.5 border-b border-sky-950 pb-1.5">
                  <AlertTriangle className="w-4 h-4" /> Diagnóstico de Variación Crítica Fletaria:
                </div>
                <div className="space-y-2 text-[10.5px] font-mono uppercase text-slate-400">
                  <div className="flex gap-2">
                    <span className="text-hud-orange font-bold">●</span>
                    <span>El indicador de costo por caja a nivel general se proyecta en <strong className="text-white">{stats.totalBoxes > 0 ? fmt(stats.transportCost / stats.totalBoxes) : '$0'} COP</strong>. Se mantiene alineado ante canastas fijas de fletes.</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-hud-green font-bold">●</span>
                    <span>La variación mensual MoM promedio indica que los esfuerzos de consolidación del hub de Acopi-Yumbo han controlado un incremento inflacionario sistémico.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: ANÁLISIS DE COSTO LOGÍSTICO POR REGIÓN */}
          {activeReportTab === '10_costo_log_reg' && (() => {
            const currentReg = macroRegionalData.find(r => r.name === selectedRegion) || macroRegionalData[0];
            return (
              <div className="space-y-5">
                <div className="border-b border-sky-950/60 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-[#00ffa3]" />
                      10. Análisis de Gasto, Peso Despachado y Clientes por Región (Consolidado)
                    </h3>
                    <p className="text-[11px] text-slate-400">Desglose integral de costos logísticos, toneladas métricas movilizadas e histórico de clientes por mallas regionales.</p>
                  </div>
                  
                  {/* Toggle switch for PieChart representation */}
                  <div className="flex bg-slate-950 border border-sky-950 p-1 rounded-md shrink-0">
                    <button 
                      type="button"
                      onClick={() => setRegionMetricType('flete')}
                      className={`px-3 py-1 text-[10px] font-mono rounded font-bold uppercase transition-all ${regionMetricType === 'flete' ? 'bg-[#00ffa3] text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      $ Fletes
                    </button>
                    <button 
                      type="button"
                      onClick={() => setRegionMetricType('peso')}
                      className={`px-3 py-1 text-[10px] font-mono rounded font-bold uppercase transition-all ${regionMetricType === 'peso' ? 'bg-[#00ffa3] text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      ⚖ Peso (Ton)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                  {/* Left Side: Dynamic Pie Chart representation */}
                  <div className="md:col-span-6 bg-slate-950/40 p-4 rounded-lg border border-slate-900 flex flex-col justify-between">
                    <div>
                      <h4 className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider mb-2 border-b border-sky-950/40 pb-1">
                        {regionMetricType === 'flete' ? 'Participación por Costos de Fletes' : 'Participación por Masa Movilizada (Peso)'}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono mb-4">
                        {regionMetricType === 'flete' 
                          ? 'Distribución proporcional del costo de transporte consolidado en pesos colombianos.' 
                          : 'Distribución física del volumen de carga (toneladas de peso bruto) entregado.'}
                      </p>
                    </div>

                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={macroRegionalData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={3}
                            dataKey={regionMetricType === 'flete' ? 'value' : 'totalWeight'}
                          >
                            {macroRegionalData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(v) => {
                              if (regionMetricType === 'flete') {
                                return [fmt(v as number), 'Flete Consumido'];
                              } else {
                                return [((v as number) / 1000).toFixed(2) + ' Ton', 'Peso Despachado'];
                              }
                            }} 
                            contentStyle={{ backgroundColor: '#091124', borderColor: '#1e3a5f', fontSize: '11px', color: '#fff' }} 
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Legend of dynamic parameters */}
                    <div className="font-mono text-[10px] text-slate-400 space-y-1.5 mt-2">
                      {macroRegionalData.map((item, idx) => {
                        const totalParam = macroRegionalData.reduce((s, x) => s + (regionMetricType === 'flete' ? x.value : x.totalWeight), 0);
                        const itemVal = regionMetricType === 'flete' ? item.value : item.totalWeight;
                        const pct = totalParam > 0 ? (itemVal / totalParam) * 100 : 0;
                        return (
                          <div key={idx} className="flex items-center justify-between border-b border-sky-900/10 pb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                              <span className="text-white truncate max-w-[140px]">{item.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-200 mr-1.5 font-bold">
                                {regionMetricType === 'flete' ? fmt(itemVal) : (itemVal / 1000).toFixed(2) + ' Ton'}
                              </span>
                              <span className="text-hud-accent font-semibold">({pct.toFixed(1)}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right Side: Tabular region overview with select row */}
                  <div className="md:col-span-6 space-y-3">
                    <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest block font-bold mb-1">
                      ➔ Seleccione una región para desglosar clientes y peso total:
                    </div>

                    <div className="overflow-x-auto border border-sky-950/40 rounded bg-slate-950/25 max-h-[350px] overflow-y-auto">
                      <table className="w-full text-left text-[11px] font-mono">
                        <thead className="bg-[#030610] text-[#476a8a] border-b border-sky-950/50 uppercase sticky top-0">
                          <tr>
                            <th className="p-2.5">Región</th>
                            <th className="p-2.5 text-right">Fletes</th>
                            <th className="p-2.5 text-right">Peso (Ton)</th>
                            <th className="p-2.5 text-right">Impacto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/60 text-slate-350">
                          {macroRegionalData.map((reg, idx) => {
                            const isSelected = currentReg?.name === reg.name;
                            return (
                              <tr 
                                key={idx} 
                                onClick={() => setSelectedRegion(reg.name)}
                                className={`cursor-pointer transition-all ${isSelected ? 'bg-sky-950/40 border-l-2 border-[#00ffa3] text-white font-bold' : 'hover:bg-slate-900/10'}`}
                              >
                                <td className="p-2.5 font-semibold text-slate-200">{reg.name}</td>
                                <td className="p-2.5 text-right font-bold text-slate-300">{fmt(reg.value)}</td>
                                <td className="p-2.5 text-right font-bold text-amber-500">{(reg.totalWeight / 1000).toFixed(2)} Ton</td>
                                <td className="p-2.5 text-right">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${reg.ratio > 10 ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                    {reg.ratio.toFixed(1)}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Macro Region breakdown: detailed analysis of customers and weight */}
                {currentReg && (
                  <div className="bg-slate-950/60 border border-sky-950/60 rounded-lg p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-sky-950/40 pb-2 gap-2">
                      <div>
                        <h4 className="text-xs font-mono font-bold text-[#00ffa3] uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#00ffa3] animate-ping shrink-0" />
                          Desglose Analítico por Cliente y Peso para la Región: {currentReg.name}
                        </h4>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Muestra el peso entregado y costos logísticos atribuidos a cada cliente en esta área geográfica.
                        </p>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 uppercase bg-slate-950 px-2 py-1 rounded border border-slate-900/80 shrink-0">
                        {currentReg.clients.length} Clientes Activos
                      </div>
                    </div>

                    {/* Region metrics cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-slate-950 p-3 rounded-md border border-sky-950/40">
                        <span className="text-[9px] text-slate-400 font-mono uppercase block">Peso Despachado Región</span>
                        <span className="text-sm font-mono font-bold text-white block">
                          {(currentReg.totalWeight / 1000).toFixed(3)} Toneladas
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">
                          Equivale a {currentReg.totalWeight.toLocaleString('es-CO')} Kilogramos
                        </span>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-md border border-sky-950/40">
                        <span className="text-[9px] text-slate-400 font-mono uppercase block">Fletes Totales en Región</span>
                        <span className="text-sm font-mono font-bold text-hud-accent block">
                          {fmt(currentReg.value)}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">
                          Tasa general: {((currentReg.value / (currentReg.sales || 1)) * 100).toFixed(2)}% sobre venta
                        </span>
                      </div>
                      <div className="bg-slate-950 p-3 rounded-md border border-sky-950/40">
                        <span className="text-[9px] text-slate-400 font-mono uppercase block">Eficiencia Logística</span>
                        <span className="text-sm font-mono font-bold text-emerald-400 block">
                          {currentReg.totalWeight > 0 ? fmt(currentReg.value / currentReg.totalWeight) : '$0'} / Kg
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">
                          Costo promedio en flete por kilogramo de muelle
                        </span>
                      </div>
                    </div>

                    {/* Detailed tabular overview of Clientes for this region */}
                    <div className="overflow-x-auto border border-sky-950/20 rounded">
                      <table className="w-full text-left text-[11px] font-mono">
                        <thead className="bg-[#030610] text-[#476a8a] border-b border-sky-950/40 uppercase">
                          <tr>
                            <th className="p-2">Cliente</th>
                            <th className="p-2 text-right">Peso Entregado</th>
                            <th className="p-2 text-right">Fletes Atribuidos</th>
                            <th className="p-2 text-right">Venta Facturada</th>
                            <th className="p-2 text-right">Relación (%)</th>
                            <th className="p-2 text-right">Órdenes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-900/40 text-slate-350">
                          {currentReg.clients
                            .slice((regionClientsPage - 1) * 12, regionClientsPage * 12)
                            .map((cli, sIdx) => {
                              return (
                                <tr key={sIdx} className="hover:bg-slate-900/10">
                                  <td className="p-2 text-white font-bold">{cli.name}</td>
                                  <td className="p-2 text-right text-amber-400 font-semibold">
                                    {(cli.weight / 1000).toFixed(2)} Ton <span className="text-[9px] text-slate-500">({cli.weight.toLocaleString('es-CO')} kg)</span>
                                  </td>
                                  <td className="p-2 text-right font-semibold text-slate-300">{fmt(cli.flete)}</td>
                                  <td className="p-2 text-right">{fmt(cli.sales)}</td>
                                  <td className="p-2 text-right">
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${cli.ratio > 10 ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                                      {cli.ratio.toFixed(1)}%
                                    </span>
                                  </td>
                                  <td className="p-2 text-right font-bold text-slate-200">{cli.count}</td>
                                </tr>
                              );
                            })}
                          {currentReg.clients.length === 0 && (
                            <tr>
                              <td colSpan={6} className="text-center py-4 text-slate-500 uppercase">Sin desglose para esta modificación regional.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {currentReg.clients.length > 12 && (
                      <div className="flex items-center justify-between pt-3 border-t border-sky-950/20 text-[10.5px] font-mono text-slate-400">
                        <button
                          type="button"
                          disabled={regionClientsPage === 1}
                          onClick={() => setRegionClientsPage(p => Math.max(1, p - 1))}
                          className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-30 disabled:cursor-not-allowed hover:text-white transition cursor-pointer font-bold"
                        >
                          ◀ Anterior
                        </button>
                        <span>Página {regionClientsPage} de {Math.ceil(currentReg.clients.length / 12)}</span>
                        <button
                          type="button"
                          disabled={regionClientsPage * 12 >= currentReg.clients.length}
                          onClick={() => setRegionClientsPage(p => p + 1)}
                          className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 disabled:opacity-30 disabled:cursor-not-allowed hover:text-white transition cursor-pointer font-bold"
                        >
                          Siguiente ▶
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* TAB 11: ANÁLISIS DE COSTO LOGÍSTICO POR TRANSPORTADORA */}
          {activeReportTab === '11_costo_log_transp' && (
            <div className="space-y-5">
              <div className="border-b border-sky-950/60 pb-3">
                <h3 className="text-sm font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-hud-green" />
                  11. Análisis de Costo Logístico Unitario por Transportadora (Kg y Cajas)
                </h3>
                <p className="text-[11px] text-slate-400">Análisis comparativo de los costos fijos promedios liquidados por cada caja de mercancía y kilogramo de peso movilizado.</p>
              </div>

              {/* Recharts side-by-side comparison */}
              <div className="h-64 bg-slate-950/40 p-2.5 rounded-lg border border-slate-900">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.carriersBreakdown} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#08142c" />
                    <XAxis dataKey="name" stroke="#52647c" fontSize={9} />
                    <YAxis stroke="#52647c" fontSize={9} />
                    <Tooltip formatter={(value, name) => [`$${Math.round(value as number).toLocaleString('es-CO')} COP`, name]} contentStyle={{ backgroundColor: '#091124' }} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                    <Bar name="Costo por Caja ($ / Caja)" dataKey="costPerBox" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar name="Costo por Kilogramo ($ / Kg)" dataKey="costPerKg" fill="#00ffa3" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Table matrix */}
              <div className="overflow-x-auto border border-sky-950/40 rounded">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead className="bg-[#030610] text-[#476a8a] border-b border-sky-950/50 uppercase">
                    <tr>
                      <th className="p-2.5">Transportadora</th>
                      <th className="p-2.5">Total Flete</th>
                      <th className="p-2.5">Costo Unitario por Caja</th>
                      <th className="p-2.5">Costo Unitario por Kilogramo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 text-slate-350">
                    {stats.carriersBreakdown.map((car, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/15">
                        <td className="p-2.5 text-white font-bold">{car.name}</td>
                        <td className="p-2.5 font-semibold text-slate-100">{fmt(car.cost)}</td>
                        <td className="p-2.5 text-amber-400 font-bold">
                          {car.costPerBox.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 1 })}/caja
                        </td>
                        <td className="p-2.5 text-emerald-400 font-bold">
                          {car.costPerKg.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 1 })}/kg
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 12: VENTAS POR CANAL ESTRATÉGICO */}
          {activeReportTab === '12_ventas_canal' && (
            <div className="space-y-5">
              <div className="border-b border-sky-950/60 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-hud-accent" />
                    12. Análisis de Despachos por Región y Almacén (Enfoque en Toneladas/Kilos)
                  </h3>
                  <p className="text-[11px] text-slate-400">Cuantifica volumetría física de masa (toneladas/kilos) movilizada en despachos por región con desglose por cliente principal (almacén, cadena).</p>
                </div>

                {/* Switch view buttons */}
                <div className="flex bg-slate-950 border border-sky-950 p-1 rounded-md shrink-0">
                  <button 
                    type="button"
                    onClick={() => setTab12ChartViewType('toneladas')}
                    className={`px-3 py-1.5 text-[10px] font-mono rounded font-bold uppercase transition-all ${tab12ChartViewType === 'toneladas' ? 'bg-[#00ffa3] text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    ⚖ Toneladas (Principal)
                  </button>
                  <button 
                    type="button"
                    onClick={() => setTab12ChartViewType('kilos')}
                    className={`px-3 py-1.5 text-[10px] font-mono rounded font-bold uppercase transition-all ${tab12ChartViewType === 'kilos' ? 'bg-[#00ffa3] text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    ⚖ Kilogramos
                  </button>
                  <button 
                    type="button"
                    onClick={() => setTab12ChartViewType('ventas')}
                    className={`px-3 py-1.5 text-[10px] font-mono rounded font-bold uppercase transition-all ${tab12ChartViewType === 'ventas' ? 'bg-[#00ffa3] text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    💵 Valor COP (Opción)
                  </button>
                </div>
              </div>

              {/* Dynamic Composed Bar & Line Chart */}
              <div className="bg-slate-950/40 p-4 rounded-lg border border-slate-900 space-y-3">
                <div className="flex justify-between items-center border-b border-sky-950/40 pb-2">
                  <h4 className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                    {tab12ChartViewType === 'toneladas' ? 'Despachos Físicos: Concentración de Carga en Toneladas por Cliente' :
                     tab12ChartViewType === 'kilos' ? 'Despachos Físicos: Concentración de Carga en Kilogramos por Cliente' :
                     'Análisis Comercial: Ventas COP por Region y Almacén'}
                  </h4>
                  <span className="text-[9px] font-mono text-slate-500 uppercase">
                    Eje Izquierdo: Columnas Apiladas por Cliente | Eje Derecho: Totales en Barra
                  </span>
                </div>

                <div className="h-80 w-full animate-fade-in">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={computedTab12ChartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#08142c" />
                      <XAxis dataKey="name" stroke="#52647c" fontSize={10} className="font-mono" />
                      
                      {/* Left Y Axis for Stacked Bar */}
                      <YAxis 
                        yAxisId="left" 
                        orientation="left" 
                        stroke="#00ffa3" 
                        fontSize={9} 
                        className="font-mono"
                        tickFormatter={(v) => {
                          if (tab12ChartViewType === 'toneladas') return `${v.toFixed(1)} T`;
                          if (tab12ChartViewType === 'kilos') return `${v.toLocaleString('es-CO')} kg`;
                          return `$${(v / 1000000).toFixed(0)}M`;
                        }}
                      />

                      {/* Right Y Axis for Secondary Line */}
                      <YAxis 
                        yAxisId="right" 
                        orientation="right" 
                        stroke="#f43f5e" 
                        fontSize={9} 
                        className="font-mono"
                        tickFormatter={(v) => {
                          if (tab12ChartViewType === 'ventas') return `${v.toFixed(1)} T`;
                          return `$${(v / 1000000).toFixed(0)}M`;
                        }}
                      />

                      <Tooltip 
                        formatter={(value, name) => {
                          if (name === 'SECONDARY_VAL') {
                            if (tab12ChartViewType === 'ventas') {
                              return [`${Number(value).toFixed(2)} Toneladas`, 'Total Masa Despachada (Tons)'];
                            }
                            return [fmt(Number(value)), 'Total Ventas Facturadas (COP)'];
                          }
                          const unitSuf = tab12ChartViewType === 'toneladas' ? ' Ton' : (tab12ChartViewType === 'kilos' ? ' kg' : '');
                          const valStr = tab12ChartViewType === 'ventas' ? fmt(Number(value)) : `${Number(value).toLocaleString('es-CO', {maximumFractionDigits: 3})}${unitSuf}`;
                          return [valStr, name];
                        }}
                        contentStyle={{ backgroundColor: '#091124', borderColor: '#1e3a5f', fontSize: '11px', color: '#fff' }} 
                      />
                      
                      <Legend iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      
                      {/* Stacked client Bars */}
                      <Bar name="PLAN B" dataKey="PLAN B" fill="#00ffa3" stackId="a" yAxisId="left" opacity={0.85} />
                      <Bar name="FLORALIA" dataKey="FLORALIA" fill="#3b82f6" stackId="a" yAxisId="left" opacity={0.85} />
                      <Bar name="OLÍMPICA" dataKey="OLIMPICA" fill="#f59e0b" stackId="a" yAxisId="left" opacity={0.85} />
                      <Bar name="LA VAQUITA" dataKey="VAQUITA" fill="#ec4899" stackId="a" yAxisId="left" opacity={0.85} />
                      <Bar name="OTROS CLI" dataKey="OTROS CLI" fill="#94a3b8" stackId="a" yAxisId="left" opacity={0.85} />

                      {/* Secondary total as a bar */}
                      <Bar 
                        name={tab12ChartViewType === 'ventas' ? "Total General (Tons)" : "Total General (COP)"} 
                        dataKey="SECONDARY_VAL" 
                        fill="#f43f5e" 
                        yAxisId="right" 
                        radius={[4, 4, 0, 0]}
                        opacity={0.9}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Region detailed Table */}
              <div className="bg-slate-950/40 p-5 rounded-lg border border-slate-900 space-y-3">
                <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider border-b border-sky-950/40 pb-1.5 flex items-center gap-2">
                  <span>📊 Desglose de Masa (Tons) y Facturación por Región y Almacén</span>
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="text-[#476a8a] border-b border-sky-950/50 uppercase">
                      <tr>
                        <th className="pb-2">Región / Destino</th>
                        <th className="pb-2 text-right">PLAN B</th>
                        <th className="pb-2 text-right">FLORALIA</th>
                        <th className="pb-2 text-right">OLÍMPICA</th>
                        <th className="pb-2 text-right">LA VAQUITA</th>
                        <th className="pb-2 text-right">OTROS CLI</th>
                        <th className="pb-2 text-right text-white">Masa Total</th>
                        <th className="pb-2 text-right">Ventas Totales (COP)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/40 text-slate-350">
                      {regionalTonsAndClientsData.map((reg, idx) => {
                        return (
                          <tr key={idx} className="hover:bg-slate-900/10">
                            <td className="py-2.5 text-white font-bold">{reg.name}</td>
                            <td className="py-2.5 text-right font-semibold text-[#00ffa3]">{reg['PLAN B_tons'].toFixed(2)} T</td>
                            <td className="py-2.5 text-right font-medium text-[#3b82f6]">{reg['FLORALIA_tons'].toFixed(2)} T</td>
                            <td className="py-2.5 text-right font-medium text-[#f59e0b]">{reg['OLIMPICA_tons'].toFixed(2)} T</td>
                            <td className="py-2.5 text-right font-medium text-[#ec4899]">{reg['VAQUITA_tons'].toFixed(2)} T</td>
                            <td className="py-2.5 text-right text-slate-400">{reg['OTROS CLI_tons'].toFixed(2)} T</td>
                            <td className="py-2.5 text-right font-bold text-white bg-slate-900/30">{reg['TON TOTAL'].toFixed(2)} T</td>
                            <td className="py-2.5 text-right text-slate-355 font-bold text-slate-100">{fmt(reg['VENTAS TOTAL'])}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 13: PENDIENTES POR CANAL ESTRATÉGICO */}
          {activeReportTab === '13_pendientes_canal' && (
            <div className="space-y-5">
              <div className="border-b border-sky-950/60 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-500" />
                    13. Análisis de Backlog y Pendientes por Región y Almacén (Enfoque en Toneladas/Kilos)
                  </h3>
                  <p className="text-[11px] text-slate-400">Cuantifica el volumen físico de masa (toneladas/kilos) represada y retenida en espera de despacho por región y cliente principal.</p>
                </div>

                {/* Switch view buttons */}
                <div className="flex bg-slate-950 border border-sky-950 p-1 rounded-md shrink-0">
                  <button 
                    type="button"
                    onClick={() => setTab13ChartViewType('toneladas')}
                    className={`px-3 py-1.5 text-[10px] font-mono rounded font-bold uppercase transition-all ${tab13ChartViewType === 'toneladas' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    ⚖ Toneladas (Principal)
                  </button>
                  <button 
                    type="button"
                    onClick={() => setTab13ChartViewType('kilos')}
                    className={`px-3 py-1.5 text-[10px] font-mono rounded font-bold uppercase transition-all ${tab13ChartViewType === 'kilos' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    ⚖ Kilogramos
                  </button>
                  <button 
                    type="button"
                    onClick={() => setTab13ChartViewType('ventas')}
                    className={`px-3 py-1.5 text-[10px] font-mono rounded font-bold uppercase transition-all ${tab13ChartViewType === 'ventas' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    💵 Valor COP (Opción)
                  </button>
                </div>
              </div>

              {/* Dynamic Composed Bar & Line Chart */}
              <div className="bg-slate-950/40 p-4 rounded-lg border border-slate-900 space-y-3">
                <div className="flex justify-between items-center border-b border-sky-950/40 pb-2">
                  <h4 className="text-[11px] font-mono font-bold text-slate-300 uppercase tracking-wider">
                    {tab13ChartViewType === 'toneladas' ? 'Backlog Represado: Carga Retenida en Toneladas por Cliente' :
                     tab13ChartViewType === 'kilos' ? 'Backlog Represado: Carga Retenida en Kilogramos por Cliente' :
                     'Backlog Represado: Valor Comercial COP Pendiente por Región y Almacén'}
                  </h4>
                  <span className="text-[9px] font-mono text-slate-500 uppercase">
                    Eje Izquierdo: Columnas Apiladas por Cliente | Eje Derecho: Totales en Barra
                  </span>
                </div>

                <div className="h-80 w-full animate-fade-in">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={computedTab13ChartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#08142c" />
                      <XAxis dataKey="name" stroke="#52647c" fontSize={10} className="font-mono" />
                      
                      {/* Left Y Axis for Stacked Bar */}
                      <YAxis 
                        yAxisId="left" 
                        orientation="left" 
                        stroke="#00ffa3" 
                        fontSize={9} 
                        className="font-mono"
                        tickFormatter={(v) => {
                          if (tab13ChartViewType === 'toneladas') return `${v.toFixed(1)} T`;
                          if (tab13ChartViewType === 'kilos') return `${v.toLocaleString('es-CO')} kg`;
                          return `$${(v / 1000000).toFixed(0)}M`;
                        }}
                      />

                      {/* Right Y Axis for Secondary Line */}
                      <YAxis 
                        yAxisId="right" 
                        orientation="right" 
                        stroke="#ef4444" 
                        fontSize={9} 
                        className="font-mono"
                        tickFormatter={(v) => {
                          if (tab13ChartViewType === 'ventas') return `${v.toFixed(1)} T`;
                          return `$${(v / 1000000).toFixed(0)}M`;
                        }}
                      />

                      <Tooltip 
                        formatter={(value, name) => {
                          if (name === 'SECONDARY_VAL') {
                            if (tab13ChartViewType === 'ventas') {
                              return [`${Number(value).toFixed(2)} Toneladas`, 'Backlog Total (Tons)'];
                            }
                            return [fmt(Number(value)), 'Total Valor Retenido (COP)'];
                          }
                          const unitSuf = tab13ChartViewType === 'toneladas' ? ' Ton' : (tab13ChartViewType === 'kilos' ? ' kg' : '');
                          const valStr = tab13ChartViewType === 'ventas' ? fmt(Number(value)) : `${Number(value).toLocaleString('es-CO', {maximumFractionDigits: 3})}${unitSuf}`;
                          return [valStr, name];
                        }}
                        contentStyle={{ backgroundColor: '#091124', borderColor: '#1e3a5f', fontSize: '11px', color: '#fff' }} 
                      />
                      
                      <Legend iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      
                      {/* Stacked client Bars */}
                      <Bar name="PLAN B" dataKey="PLAN B" fill="#00ffa3" stackId="a" yAxisId="left" opacity={0.85} />
                      <Bar name="FLORALIA" dataKey="FLORALIA" fill="#3b82f6" stackId="a" yAxisId="left" opacity={0.85} />
                      <Bar name="OLÍMPICA" dataKey="OLIMPICA" fill="#f59e0b" stackId="a" yAxisId="left" opacity={0.85} />
                      <Bar name="LA VAQUITA" dataKey="VAQUITA" fill="#ec4899" stackId="a" yAxisId="left" opacity={0.85} />
                      <Bar name="OTROS CLI" dataKey="OTROS CLI" fill="#94a3b8" stackId="a" yAxisId="left" opacity={0.85} />

                      {/* Secondary total as a bar */}
                      <Bar 
                        name={tab13ChartViewType === 'ventas' ? "Backlog Total (Tons)" : "Backlog Total (COP)"} 
                        dataKey="SECONDARY_VAL" 
                        fill="#ef4444" 
                        yAxisId="right" 
                        radius={[4, 4, 0, 0]}
                        opacity={0.9}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Consolidated Channel Backlog Table */}
              <div className="bg-slate-950/40 p-5 rounded-lg border border-slate-900 space-y-3">
                <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider border-b border-sky-950/40 pb-1.5 flex items-center gap-2">
                  <span>📊 Desglose de Backlog Represado (Tons) por Región y Almacén</span>
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="text-[#476a8a] border-b border-sky-950/50 uppercase">
                      <tr>
                        <th className="pb-2">Región / Destino</th>
                        <th className="pb-2 text-right">PLAN B</th>
                        <th className="pb-2 text-right">FLORALIA</th>
                        <th className="pb-2 text-right">OLÍMPICA</th>
                        <th className="pb-2 text-right">LA VAQUITA</th>
                        <th className="pb-2 text-right">OTROS CLI</th>
                        <th className="pb-2 text-right text-white">Masa Total</th>
                        <th className="pb-2 text-right">Valor Represado (COP)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900/40 text-slate-350">
                      {regionalPendingTonsAndClientsData.map((reg, idx) => {
                        return (
                          <tr key={idx} className="hover:bg-slate-900/10">
                            <td className="py-2.5 text-white font-bold">{reg.name}</td>
                            <td className="py-2.5 text-right font-semibold text-[#00ffa3]">{reg['PLAN B_tons'].toFixed(2)} T</td>
                            <td className="py-2.5 text-right font-medium text-[#3b82f6]">{reg['FLORALIA_tons'].toFixed(2)} T</td>
                            <td className="py-2.5 text-right font-medium text-[#f59e0b]">{reg['OLIMPICA_tons'].toFixed(2)} T</td>
                            <td className="py-2.5 text-right font-medium text-[#ec4899]">{reg['VAQUITA_tons'].toFixed(2)} T</td>
                            <td className="py-2.5 text-right text-slate-400">{reg['OTROS CLI_tons'].toFixed(2)} T</td>
                            <td className="py-2.5 text-right font-bold text-white bg-slate-900/30">{reg['TON TOTAL'].toFixed(2)} T</td>
                            <td className="py-2.5 text-right text-slate-355 font-bold text-rose-500">{fmt(reg['VALOR TOTAL'])}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 14: INFORME DE GESTIÓN INTELIGENTE (POWERED BY GEMINI) */}
          {activeReportTab === '14_informe_ia' && (
            <div className="space-y-5">
              <div className="border-b border-sky-950/60 pb-3 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-hud-accent animate-pulse-soft" />
                    14. Auditoría de Gestión e Informe Ejecutivo con Inteligencia Artificial
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Genera una auditoría SWOT formal redactada por Gemini 3.5 en segundos usando las variables filtradas actuales de muelle.
                  </p>
                </div>

                <button 
                  type="button"
                  onClick={handleGenerateAiReport}
                  disabled={generating}
                  className="bg-hud-accent hover:bg-hud-accent/80 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 font-black font-mono tracking-widest px-4 py-2 text-[10.5px] rounded transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-hud-accent/15"
                >
                  {generating ? (
                    <span className="flex items-center gap-2" key="generating">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Procesando datos...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2" key="idle">
                      <Sparkles className="w-3.5 h-3.5" /> Generar Auditoría
                    </span>
                  )}
                </button>
              </div>

              {/* Progress State details */}
              {generating && (
                <div className="font-mono text-[10px] text-hud-accent/85 border border-hud-accent/20 bg-black/60 p-3 rounded space-y-1 uppercase">
                  <div>&gt; Generando lote analítico regional de canales... <strong className="text-hud-green">PROCESADO</strong></div>
                  <div>&gt; Consolidando tasas fletarias de combustible... <strong className="text-hud-green">COMPLETO</strong></div>
                  <div className="animate-pulse">&gt; Invocando modelo ejecutivo gemini-3.5-flash... <strong className="text-hud-orange">EN CURSO</strong></div>
                </div>
              )}

              {/* AI Report Content Result Box */}
              {gptReport ? (
                <BookReportReader 
                  rawReport={gptReport} 
                  onCopy={copyToClipboard} 
                  copied={copied} 
                />
              ) : (
                !generating && (
                  <div className="flex flex-col items-center justify-center p-8 bg-slate-950/20 border border-slate-900 rounded-lg text-center space-y-2">
                    <HelpCircle className="w-10 h-10 text-slate-600" />
                    <p className="text-slate-400 font-mono text-[11px] uppercase">Haga clic en "Generar Auditoría" para iniciar el análisis ejecutivo con Inteligencia Artificial.</p>
                  </div>
                )
              )}
            </div>
          )}

        </section>

      </div>

    </div>
  );
}
