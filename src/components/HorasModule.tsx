/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Clock, Plus, Users, Archive, LayoutDashboard, Trash2, Edit, 
  Activity, Bell, AlertTriangle, CheckCircle2, Calendar, 
  DollarSign, Sliders, Settings, ChevronDown, Download, 
  RefreshCw, Save, FileSpreadsheet, Sparkles, Filter, Briefcase, UserCheck,
  ChevronLeft, ChevronRight, Lock, Unlock, Check
} from 'lucide-react';
import { saveToCloud, subscribeToCloud } from '../firebaseService';
import { SEED_WORKERS, SEED_OVERTIME_RECORDS } from '../data/seedOvertime';
import { AppUser } from '../types';

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

interface OvertimeRecord {
  id: number;
  nom: string;
  car?: string;
  are?: string;
  fec: string;
  tipo: 'ord' | 'dom' | 'fest' | 'sab';
  jorn: 'lmjv' | 'mie' | 'esp';
  comp: number;
  mot?: string;
  _ent: string;
  _sal: string;
  // Computed values
  hT: number;
  base: number;
  extraTotal: number;
  extraOrd: number;
  extDiurna: number;
  extNocturna: number;
  recNoct: number;
  domFest: number;
  netas: number;
  timestamp: number;
  creadoPor?: string;
  creadoEn?: string;
  modificadoPor?: string;
  modificadoEn?: string;
  pagado?: boolean;
  fechaPago?: string;
  corteLiquidado?: string;
}

interface Worker {
  id: number;
  nom: string;
  car: string;
  are: string;
}

interface ConfigHours {
  normalBaseHours: number;
  normalEndTime: string;
  wedBaseHours: number;
  wedEndTime: string;
  suggestedStartTime: string;
  nightOvertimeStartHour: number; // e.g. 22:00
  nightSurchargeStartHour: number; // e.g. 21:00
  extraOrdMultiplier: number; // e.g. 1.25
  extraDiurnaMultiplier: number; // e.g. 1.25
  extraNocturnaMultiplier: number; // e.g. 1.75
  recNoctMultiplier: number; // e.g. 0.35
  domFestMultiplier: number; // e.g. 1.75
}

const DEFAULT_CONFIG: ConfigHours = {
  normalBaseHours: 9,
  normalEndTime: '16:30',
  wedBaseHours: 9.25,
  wedEndTime: '16:45',
  suggestedStartTime: '07:30',
  nightOvertimeStartHour: 22,
  nightSurchargeStartHour: 21,
  extraOrdMultiplier: 1.25,
  extraDiurnaMultiplier: 1.25,
  extraNocturnaMultiplier: 1.75,
  recNoctMultiplier: 0.35,
  domFestMultiplier: 1.75,
};

export default function HorasModule({ currentUser }: { currentUser?: AppUser | null } = {}) {
  // Access level: Washington (Admin) has full rights to everything; workers have self-registration access
  const isAdmin = currentUser?.rol === 'SUPER_ADMIN' || !currentUser;
  const isSST = currentUser?.rol === 'SST_TALENTO';
  const hasAdminRights = isAdmin || isSST;

  // Navigation tabs - workers (Deyci, Julian, Juan, Antonio) default to 'registrar', admin defaults to 'historial'
  const [activeSubTab, setActiveSubTab] = useState<'registrar' | 'historial' | 'personal' | 'ajustes' | 'consulta'>(() => {
    return hasAdminRights ? 'historial' : 'registrar';
  });

  // Core records and master worker directory State (pre-seeded with production records)
  const [records, setRecords] = useState<OvertimeRecord[]>(() => {
    const current = localStorage.getItem('latin_overtime_state');
    if (current) {
      try {
        const parsed = JSON.parse(current);
        if (Array.isArray(parsed.records) && parsed.records.length > 0) return parsed.records;
      } catch (e) {}
    }
    return (SEED_OVERTIME_RECORDS as unknown) as OvertimeRecord[];
  });
  const [workers, setWorkers] = useState<Worker[]>(() => {
    const current = localStorage.getItem('latin_overtime_state');
    if (current) {
      try {
        const parsed = JSON.parse(current);
        if (Array.isArray(parsed.workers) && parsed.workers.length > 0) return parsed.workers;
      } catch (e) {}
    }
    return (SEED_WORKERS as unknown) as Worker[];
  });
  const [config, setConfig] = useState<ConfigHours>(() => {
    const current = localStorage.getItem('latin_overtime_state');
    if (current) {
      try {
        const parsed = JSON.parse(current);
        if (parsed.config) {
          const loadedConfig = { ...parsed.config };
          let modified = false;
          if (loadedConfig.suggestedStartTime === '07:15' || !loadedConfig.suggestedStartTime) {
            loadedConfig.suggestedStartTime = '07:30';
            modified = true;
          }
          if (loadedConfig.wedEndTime === '17:30' || !loadedConfig.wedEndTime) {
            loadedConfig.wedEndTime = '16:45';
            loadedConfig.wedBaseHours = 9.25;
            modified = true;
          }
          if (loadedConfig.wedBaseHours === 10) {
            loadedConfig.wedBaseHours = 9.25;
            modified = true;
          }
          if (modified) {
            // Save upgraded config back to local storage
            const baseObj = JSON.parse(current);
            baseObj.config = loadedConfig;
            localStorage.setItem('latin_overtime_state', JSON.stringify(baseObj));
          }
          return loadedConfig;
        }
      } catch (e) {}
    }
    return DEFAULT_CONFIG;
  });

  // Form State
  const [workerName, setWorkerName] = useState('');
  const [workerRole, setWorkerRole] = useState('');
  const [workerDept, setWorkerDept] = useState('');
  const [recordDate, setRecordDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dayType, setDayType] = useState<'ord' | 'dom' | 'fest' | 'sab'>('ord');
  const [shiftType, setShiftType] = useState<'lmjv' | 'mie' | 'esp'>('lmjv');
  const [startTime, setStartTime] = useState(() => config.suggestedStartTime || '07:30');
  const [endTime, setEndTime] = useState('');
  const [deductedHours, setDeductedHours] = useState<number>(0);
  const [deductReason, setDeductReason] = useState('');

  // Editing States
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [editingPos, setEditingPos] = useState<number | null>(null);

  // Master Workers CRUD State
  const [newWorkerNom, setNewWorkerNom] = useState('');
  const [newWorkerCar, setNewWorkerCar] = useState('');
  const [newWorkerAre, setNewWorkerAre] = useState('');
  const [editingWorkerId, setEditingWorkerId] = useState<number | null>(null);

  // Historical lists and explicit Corte / Period binding
  const [corteType, setCorteType] = useState<'all' | 'corte12' | 'corte27' | 'mes' | 'custom'>('all');
  const [selectedMonth, setSelectedMonth] = useState<number>(9); // 9 = Octubre (donde están los turnos de producción)
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [corteStartDate, setCorteStartDate] = useState<string>('2026-09-28');
  const [corteEndDate, setCorteEndDate] = useState<string>('2026-10-12');
  const [filterWeekDate, setFilterWeekDate] = useState<string>('2026-10-30');
  const [historyRangeType, setHistoryRangeType] = useState<'all' | 'weekly' | 'fortnightly' | 'monthly'>('all');
  const [historyViewMode, setHistoryViewMode] = useState<'table' | 'cards'>('cards');
  const [filterWorker, setFilterWorker] = useState<string>('__all');
  const [activeWorkerTab, setActiveWorkerTab] = useState<string>('__global');
  const [historySearchTerm, setHistorySearchTerm] = useState<string>('');
  const [workerFilterSearch, setWorkerFilterSearch] = useState<string>('');
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState<boolean>(false);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'pending' | 'paid'>('all');

  // Personal consultation search states
  const [personalSearchWorker, setPersonalSearchWorker] = useState<string>('');
  const [personalStartDate, setPersonalStartDate] = useState<string>('');
  const [personalEndDate, setPersonalEndDate] = useState<string>('');

  // Preview / Computed buffer for the form before saving
  const [computedPreview, setComputedPreview] = useState<Partial<OvertimeRecord> | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Sync status to reassure user about cloud status
  const [syncStatus, setSyncStatus] = useState<'synced' | 'saving' | 'error' | 'loading'>('loading');
  const [syncError, setSyncError] = useState<string | null>(null);

  // Loop safety locks for real-time Firestore synchronization
  const lastSavedRecords = useRef<string>(JSON.stringify(records));
  const lastSavedWorkers = useRef<string>(JSON.stringify(workers));
  const lastSavedConfig = useRef<string>(JSON.stringify(config));

  // Trigger interactive toast notifications
  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Helper to match worker name with logged in user (e.g. Deyci, Julian, Juan, Antonio, Washington)
  const findMatchingWorker = (name: string, list: Worker[]) => {
    if (!name) return null;
    const q = name.toLowerCase();
    return list.find(w => {
      const n = w.nom.toLowerCase();
      if (q.includes('deyci') && n.includes('deyci')) return true;
      if (q.includes('julian') && n.includes('julian')) return true;
      if (q.includes('juan') && n.includes('juan')) return true;
      if (q.includes('antonio') && n.includes('antonio')) return true;
      if (q.includes('washington') && n.includes('washington')) return true;
      return n.includes(q) || q.includes(n);
    });
  };

  // Pre-fill worker name for workers registering their turn
  useEffect(() => {
    if (!hasAdminRights && currentUser && workers.length > 0 && !workerName) {
      const match = findMatchingWorker(currentUser.nombre, workers);
      if (match) {
        setWorkerName(match.nom);
        setWorkerRole(match.car || '');
        setWorkerDept(match.are || '');
      } else {
        setWorkerName(currentUser.nombre);
        setWorkerRole(currentUser.cargo || 'Operario');
        setWorkerDept(currentUser.departamento || 'Logística');
      }
    }
  }, [currentUser, workers, hasAdminRights, workerName]);

  // Set default worker in personal consultation tab for workers
  useEffect(() => {
    if (!hasAdminRights && currentUser && !personalSearchWorker) {
      const match = findMatchingWorker(currentUser.nombre, workers);
      if (match) {
        setPersonalSearchWorker(match.nom);
      } else {
        setPersonalSearchWorker(currentUser.nombre);
      }
    }
  }, [currentUser, workers, hasAdminRights, personalSearchWorker]);

  // Convert "HH:MM" string to decimal hours
  const parseTimeToHours = (timeStr: string): number | null => {
    if (!timeStr || !timeStr.includes(':')) return null;
    const [h, m] = timeStr.split(':').map(Number);
    return h + m / 60;
  };

  // Format decimal hours to human readable "Xh YYm"
  const formatHoursHuman = (decimalHours: number): string => {
    if (!decimalHours || decimalHours <= 0) return '0h 00m';
    const h = Math.floor(decimalHours);
    const m = Math.round((decimalHours - h) * 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
  };

  // Initialize and load default or synced data
  useEffect(() => {
    setSyncStatus('loading');
    let loadedCount = 0;
    const checkAllLoaded = () => {
      loadedCount++;
      if (loadedCount >= 3) {
        setSyncStatus('synced');
        setSyncError(null);
      }
    };

    // Establish live real-time Firestore subscriptions
    const unsubRecords = subscribeToCloud('horas_extras_state', 'records', (data) => {
      if (Array.isArray(data) && data.length > 0) {
        const raw = JSON.stringify(data);
        lastSavedRecords.current = raw;
        setRecords(data);
        updateLocal('records', data);
      } else if (!data || (Array.isArray(data) && data.length === 0)) {
        // Auto-seed Firestore if missing or empty
        saveToCloud('horas_extras_state', 'records', SEED_OVERTIME_RECORDS);
      }
      checkAllLoaded();
    });

    const unsubWorkers = subscribeToCloud('horas_extras_state', 'workers', (data) => {
      if (Array.isArray(data) && data.length > 0) {
        const raw = JSON.stringify(data);
        lastSavedWorkers.current = raw;
        setWorkers(data);
        updateLocal('workers', data);
      } else if (!data || (Array.isArray(data) && data.length === 0)) {
        // Auto-seed workers in Firestore if missing or empty
        saveToCloud('horas_extras_state', 'workers', SEED_WORKERS);
      }
      checkAllLoaded();
    });

    const unsubConfig = subscribeToCloud('horas_extras_state', 'config', (data) => {
      if (data && typeof data === 'object') {
        const loadedConfig = { ...(data as ConfigHours) };
        if (loadedConfig.suggestedStartTime === '07:15' || !loadedConfig.suggestedStartTime) {
          loadedConfig.suggestedStartTime = '07:30';
        }
        if (loadedConfig.wedEndTime === '17:30' || !loadedConfig.wedEndTime) {
          loadedConfig.wedEndTime = '16:45';
          loadedConfig.wedBaseHours = 9.25;
        }
        if (loadedConfig.wedBaseHours === 10) {
          loadedConfig.wedBaseHours = 9.25;
        }
        const raw = JSON.stringify(loadedConfig);
        lastSavedConfig.current = raw;
        setConfig(loadedConfig);
        updateLocal('config', loadedConfig);
      }
      checkAllLoaded();
    });

    // Fallback if subscription never fires or stays idle
    const timer = setTimeout(() => {
      setSyncStatus((current) => current === 'loading' ? 'synced' : current);
    }, 4000);

    return () => {
      unsubRecords();
      unsubWorkers();
      unsubConfig();
      clearTimeout(timer);
    };
  }, []);

  // Sync to local helper helper
  const updateLocal = (key: 'records' | 'workers' | 'config', value: any) => {
    const current = localStorage.getItem('latin_overtime_state');
    let baseObj: any = { records: SEED_OVERTIME_RECORDS, workers: SEED_WORKERS, config: DEFAULT_CONFIG };
    if (current) {
      try {
        baseObj = JSON.parse(current);
      } catch (e) {}
    }
    baseObj[key] = value;
    localStorage.setItem('latin_overtime_state', JSON.stringify(baseObj));
  };

  // Safe action-based persistence wrappers (NO auto-running useEffect)
  const saveRecords = (updatedRecords: OvertimeRecord[]) => {
    setRecords(updatedRecords);
    lastSavedRecords.current = JSON.stringify(updatedRecords);
    updateLocal('records', updatedRecords);
    setSyncStatus('saving');
    saveToCloud('horas_extras_state', 'records', updatedRecords).then(success => {
      setSyncStatus(success ? 'synced' : 'error');
      if (!success) setSyncError('Error de sincronización con la nube');
    });
  };

  const saveWorkers = (updatedWorkers: Worker[]) => {
    setWorkers(updatedWorkers);
    lastSavedWorkers.current = JSON.stringify(updatedWorkers);
    updateLocal('workers', updatedWorkers);
    setSyncStatus('saving');
    saveToCloud('horas_extras_state', 'workers', updatedWorkers).then(success => {
      setSyncStatus(success ? 'synced' : 'error');
      if (!success) setSyncError('Error de sincronización con la nube');
    });
  };

  const saveConfig = (updatedConfig: ConfigHours) => {
    setConfig(updatedConfig);
    lastSavedConfig.current = JSON.stringify(updatedConfig);
    updateLocal('config', updatedConfig);
    setSyncStatus('saving');
    saveToCloud('horas_extras_state', 'config', updatedConfig).then(success => {
      setSyncStatus(success ? 'synced' : 'error');
      if (!success) setSyncError('Error de sincronización con la nube');
    });
  };

  // Handle worker dropdown change
  const handleSelectMasterWorker = (name: string) => {
    setWorkerName(name);
    const found = workers.find(w => w.nom === name);
    if (found) {
      setWorkerRole(found.car);
      setWorkerDept(found.are);
    } else {
      setWorkerRole('');
      setWorkerDept('');
    }
  };

  // Watch shift updates to auto-suggest and format suggested end-times
  const handleShiftChange = (type: 'lmjv' | 'mie' | 'esp') => {
    setShiftType(type);
    if (type === 'mie') {
      setEndTime(config.wedEndTime || '16:45');
      setStartTime(config.suggestedStartTime || '07:30');
    } else if (type === 'lmjv') {
      setEndTime(config.normalEndTime || '16:30');
      setStartTime(config.suggestedStartTime || '07:30');
    } else {
      setEndTime(''); // Custom / Especial (No predetermined shift end-time)
    }
  };

  // Watch day type change and automatically assign standard shift configurations
  const handleDayTypeChange = (type: 'ord' | 'dom' | 'fest' | 'sab') => {
    setDayType(type);
    if (type !== 'ord') {
      setShiftType('esp');
      setEndTime(''); // Clear default weekday clock out times since weekend is base 0 hours
    } else {
      // Monday-Friday
      setShiftType('lmjv');
      setEndTime(config.normalEndTime);
      setStartTime(config.suggestedStartTime || '07:30');
    }
  };

  // CALCULATION CORE ENGINE (Incorporating Configurable Legal Surcharges & Shift Rules)
  const computeOvertimeEngine = (
    entStr: string,
    salStr: string,
    type: 'ord' | 'dom' | 'fest' | 'sab',
    jorn: 'lmjv' | 'mie' | 'esp'
  ): Partial<OvertimeRecord> | null => {
    const ent = parseTimeToHours(entStr);
    let sal = parseTimeToHours(salStr);
    if (ent === null || sal === null) return null;

    // Handle overnight shifts natively (e.g. checked out next day)
    if (sal < ent) {
      sal += 24;
    }

    const workedHoursDecimal = sal - ent;
    const isSpecialDay = type === 'dom' || type === 'fest' || type === 'sab';

    // 1. Determine daily base hours before overtime kicks in according to current laws (Configurable!)
    let baseShiftHours = 0;
    if (!isSpecialDay) {
      if (jorn === 'mie') {
        baseShiftHours = Number(config.wedBaseHours); // Wednesday Shift Base Hour (e.g. 10 or 9 or 8)
      } else {
        baseShiftHours = Number(config.normalBaseHours); // Daily shift base (e.g. 9 or 8)
      }
    }

    // 2. Computed Gross Overtime Hours
    const rawOvertimeTotal = Math.max(0, workedHoursDecimal - baseShiftHours);

    // 3. Extent of worked horas inside standard daytime or night limits
    const overtimeStartPoint = isSpecialDay ? ent : ent + baseShiftHours;

    // Daily night overtime hours start threshold (standard e.g. 22:00)
    const nightStart = config.nightOvertimeStartHour; 

    // Compute Diurna / Daytime overtime (within 06:00 to 22:00)
    const overtimeDiurna = Math.max(
      0,
      Math.min(sal, nightStart) - Math.max(overtimeStartPoint, 6)
    );

    // Compute Nocturna overtime (remaining hours from gross overtime that happened at night)
    const overtimeNocturna = Math.max(0, rawOvertimeTotal - overtimeDiurna);

    // 4. Night shifts Surcharges (Recargo Nocturnos) -> hours worked in standard night hours (e.g. 21:00 to 6:00 next day)
    const nightSurchargeThreshold = config.nightSurchargeStartHour; // default 21:00
    const recargoNocturnoRange = Math.max(
      0,
      Math.min(sal, ent + baseShiftHours, 30) - Math.max(ent, nightSurchargeThreshold)
    );

    const domFestValue = isSpecialDay ? workedHoursDecimal : 0;
    const ordinaryDiur = isSpecialDay ? 0 : overtimeDiurna;

    return {
      hT: Number(workedHoursDecimal.toFixed(3)),
      base: Number(baseShiftHours.toFixed(2)),
      extraTotal: Number(rawOvertimeTotal.toFixed(3)),
      extraOrd: Number(ordinaryDiur.toFixed(3)),
      extDiurna: Number(overtimeDiurna.toFixed(3)),
      extNocturna: Number(overtimeNocturna.toFixed(3)),
      recNoct: Number(Math.max(0, recargoNocturnoRange).toFixed(3)),
      domFest: Number(domFestValue.toFixed(3)),
    };
  };

  // Perform Calculation Form preview handler
  const handleCalculatePreview = () => {
    if (!workerName.trim()) {
      triggerToast('Seleccione o ingrese un trabajador', 'error');
      return;
    }
    if (!startTime) {
      triggerToast('Ingrese hora de entrada', 'error');
      return;
    }
    if (!endTime) {
      triggerToast('Ingrese hora de salida', 'error');
      return;
    }

    const calculated = computeOvertimeEngine(startTime, endTime, dayType, shiftType);
    if (!calculated) {
      triggerToast('Error calculando horas. Revise las horas de entrada/salida.', 'error');
      return;
    }

    // Incorporate deductions
    const grossExtra = calculated.extraTotal || 0;
    const finalNet = Math.max(0, grossExtra - deductedHours);

    const completed: Partial<OvertimeRecord> = {
      ...calculated,
      nom: workerName,
      car: workerRole,
      are: workerDept,
      fec: recordDate,
      tipo: dayType,
      jorn: shiftType,
      comp: deductedHours,
      mot: deductReason,
      _ent: startTime,
      _sal: endTime,
      netas: Number(finalNet.toFixed(3)),
    };

    setComputedPreview(completed);
    triggerToast('Cálculo generado. Revise el desglose detallado abajo.', 'info');
  };

  // Reset calculator states
  const handleResetForm = () => {
    setWorkerName('');
    setWorkerRole('');
    setWorkerDept('');
    setRecordDate(new Date().toISOString().split('T')[0]);
    setDayType('ord');
    setShiftType('lmjv');
    setStartTime(config.suggestedStartTime || '07:30');
    setEndTime('');
    setDeductedHours(0);
    setDeductReason('');
    setComputedPreview(null);
    setEditingRecordId(null);
    setEditingPos(null);
  };

  // Persist computed records in the list (Updates or Creates)
  const handleSaveRecord = () => {
    if (!computedPreview) {
      triggerToast('Calcule las horas primero', 'error');
      return;
    }

    let updatedRecords = [...records];
    const savedDate = computedPreview.fec;

    const isOwner = currentUser?.rol === 'SUPER_ADMIN' || currentUser?.email === 'soporteyabi@gmail.com';
    const isSamePerson = currentUser && workerName && (
      currentUser.nombre.toLowerCase().includes(workerName.toLowerCase().split(' ')[0]) ||
      workerName.toLowerCase().includes(currentUser.nombre.toLowerCase().split(' ')[0])
    );

    const authorStamp = isOwner 
      ? `${workerName} (Registrado por Washington Quiñones - Aux coordinador logistico)`
      : currentUser
      ? isSamePerson
        ? `${workerName} (${currentUser.email})`
        : `${workerName} (Registrado en terminal de ${currentUser.nombre})`
      : `${workerName} (Registro directo)`;

    if (editingRecordId !== null) {
      // Modify existing while preserving settlement / payment status
      const idx = updatedRecords.findIndex(r => r.id === editingRecordId);
      if (idx >= 0) {
        const prev = updatedRecords[idx];
        updatedRecords[idx] = {
          ...prev,
          ...(computedPreview as OvertimeRecord),
          id: editingRecordId,
          timestamp: Date.now(),
          modificadoPor: authorStamp,
          modificadoEn: new Date().toISOString(),
          pagado: prev.pagado,
          fechaPago: prev.fechaPago,
          corteLiquidado: prev.corteLiquidado,
        };
      }
      triggerToast('Registro actualizado exitosamente', 'success');
    } else {
      // Append new record with dynamic ID
      const newId = records.length > 0 ? Math.max(...records.map(r => r.id)) + 1 : 1;
      const finalRec: OvertimeRecord = {
        ...(computedPreview as OvertimeRecord),
        id: newId,
        timestamp: Date.now(),
        creadoPor: authorStamp,
        creadoEn: new Date().toISOString(),
      };
      updatedRecords.push(finalRec);
      triggerToast('Registro guardado exitosamente con sello de autor', 'success');
    }

    saveRecords(updatedRecords);
    if (savedDate) {
      setFilterWeekDate(savedDate);
    }
    handleResetForm();
    setActiveSubTab('historial');
  };

  // Populate form with record for modifications
  const handleEditRecord = (record: OvertimeRecord) => {
    setEditingRecordId(record.id);
    setWorkerName(record.nom);
    setWorkerRole(record.car || '');
    setWorkerDept(record.are || '');
    setRecordDate(record.fec);
    setDayType(record.tipo);
    setShiftType(record.jorn);
    setStartTime(record._ent);
    setEndTime(record._sal);
    setDeductedHours(record.comp);
    setDeductReason(record.mot || '');
    
    // Suggest the edit changes
    setComputedPreview(record);
    setActiveSubTab('registrar');
    triggerToast('Editando registro seleccionado', 'info');
  };

  // Delete Record Handler
  const handleDeleteRecord = (id: number) => {
    if (window.confirm('¿Desea borrar este registro de horas extras permanentemente?')) {
      const remaining = records.filter(r => r.id !== id);
      saveRecords(remaining);
      triggerToast('Registro eliminado exitosamente', 'success');
    }
  };

  // MASTER directory CRUD Workers handlers
  const handleSaveWorker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerNom.trim()) {
      triggerToast('Ingrese nombre del trabajador', 'error');
      return;
    }

    let updated = [...workers];
    if (editingWorkerId !== null) {
      const idx = updated.findIndex(w => w.id === editingWorkerId);
      if (idx >= 0) {
        updated[idx] = {
          id: editingWorkerId,
          nom: newWorkerNom.trim(),
          car: newWorkerCar.trim(),
          are: newWorkerAre.trim(),
        };
      }
      triggerToast('Trabajador actualizado exitosamente', 'success');
      setEditingWorkerId(null);
    } else {
      const newId = workers.length > 0 ? Math.max(...workers.map(w => w.id)) + 1 : Date.now();
      updated.push({
        id: newId,
        nom: newWorkerNom.trim(),
        car: newWorkerCar.trim(),
        are: newWorkerAre.trim(),
      });
      triggerToast('Nuevo trabajador añadido', 'success');
    }

    saveWorkers(updated);
    setNewWorkerNom('');
    setNewWorkerCar('');
    setNewWorkerAre('');
    setIsWorkerModalOpen(false);
  };

  const handleEditWorker = (w: Worker) => {
    setEditingWorkerId(w.id);
    setNewWorkerNom(w.nom);
    setNewWorkerCar(w.car);
    setNewWorkerAre(w.are);
    setIsWorkerModalOpen(true);
  };

  const handleDeleteWorker = (id: number) => {
    if (window.confirm('¿Está seguro de eliminar este trabajador del directorio?')) {
      const processed = workers.filter(w => w.id !== id);
      saveWorkers(processed);
      triggerToast('Trabajador eliminado del directorio');
    }
  };

  // Surcharges/schedules legal custom formulary save handlers
  const handleSaveConfig = () => {
    triggerToast('Ajustes y fórmulas de ley actualizadas correctamente', 'success');
  };

  // Apply explicit Corte / Period selection
  const applyCorteSelection = (
    type: 'all' | 'corte12' | 'corte27' | 'mes' | 'custom',
    monthIdx: number = selectedMonth,
    yearNum: number = selectedYear
  ) => {
    setCorteType(type);
    setSelectedMonth(monthIdx);
    setSelectedYear(yearNum);

    if (type === 'all') {
      setCorteStartDate('');
      setCorteEndDate('');
      setHistoryRangeType('all');
      return;
    }

    const pad = (n: number) => String(n).padStart(2, '0');

    if (type === 'corte12') {
      // Del 28 del mes anterior al 12 del mes actual
      const prevMonth = monthIdx === 0 ? 11 : monthIdx - 1;
      const prevYear = monthIdx === 0 ? yearNum - 1 : yearNum;
      setCorteStartDate(`${prevYear}-${pad(prevMonth + 1)}-28`);
      setCorteEndDate(`${yearNum}-${pad(monthIdx + 1)}-12`);
      setHistoryRangeType('fortnightly');
      setFilterWeekDate(`${yearNum}-${pad(monthIdx + 1)}-12`);
    } else if (type === 'corte27') {
      // Del 13 al 27 del mes actual
      setCorteStartDate(`${yearNum}-${pad(monthIdx + 1)}-13`);
      setCorteEndDate(`${yearNum}-${pad(monthIdx + 1)}-27`);
      setHistoryRangeType('fortnightly');
      setFilterWeekDate(`${yearNum}-${pad(monthIdx + 1)}-27`);
    } else if (type === 'mes') {
      // Mes completo
      const lastDay = new Date(yearNum, monthIdx + 1, 0).getDate();
      setCorteStartDate(`${yearNum}-${pad(monthIdx + 1)}-01`);
      setCorteEndDate(`${yearNum}-${pad(monthIdx + 1)}-${pad(lastDay)}`);
      setHistoryRangeType('monthly');
      setFilterWeekDate(`${yearNum}-${pad(monthIdx + 1)}-01`);
    }
  };

  // Navigate through history range periods (weekly, fortnightly, monthly)
  const handleNavigatePeriod = (direction: 'prev' | 'next') => {
    const factor = direction === 'prev' ? -1 : 1;
    let nextMonth = selectedMonth;
    let nextYear = selectedYear;

    if (corteType === 'corte12') {
      if (direction === 'prev') {
        nextMonth = selectedMonth === 0 ? 11 : selectedMonth - 1;
        nextYear = selectedMonth === 0 ? selectedYear - 1 : selectedYear;
        applyCorteSelection('corte27', nextMonth, nextYear);
      } else {
        applyCorteSelection('corte27', selectedMonth, selectedYear);
      }
      return;
    } else if (corteType === 'corte27') {
      if (direction === 'prev') {
        applyCorteSelection('corte12', selectedMonth, selectedYear);
      } else {
        nextMonth = selectedMonth === 11 ? 0 : selectedMonth + 1;
        nextYear = selectedMonth === 11 ? selectedYear + 1 : selectedYear;
        applyCorteSelection('corte12', nextMonth, nextYear);
      }
      return;
    } else if (corteType === 'mes') {
      nextMonth = selectedMonth + factor;
      if (nextMonth < 0) {
        nextMonth = 11;
        nextYear -= 1;
      } else if (nextMonth > 11) {
        nextMonth = 0;
        nextYear += 1;
      }
      applyCorteSelection('mes', nextMonth, nextYear);
      return;
    } else if (filterWeekDate) {
      const current = new Date(filterWeekDate + 'T00:00:00');
      current.setDate(current.getDate() + (factor * 7));
      setFilterWeekDate(current.toISOString().split('T')[0]);
    }
  };

  // Group Records inside a structured index for calculations rendering
  const recordsIndexedByWorker = useMemo(() => {
    const indexes: Record<string, { nom: string; car: string; are: string; regs: OvertimeRecord[] }> = {};
    // Ensure all registered workers are initialized in the index
    workers.forEach(w => {
      const normalize = w.nom.trim().toLowerCase();
      indexes[normalize] = { nom: w.nom, car: w.car || 'Operario', are: w.are || 'Logística', regs: [] };
    });
    records.forEach(r => {
      const tag = r.nom.trim();
      const normalize = tag.toLowerCase();
      if (!indexes[normalize]) {
        indexes[normalize] = { nom: tag, car: r.car || 'Operario', are: r.are || 'Logística', regs: [] };
      }
      indexes[normalize].regs.push(r);
    });
    return indexes;
  }, [records, workers]);

  // Summarize calculation attributes of worker's cumulative weeks
  const getCumulativeAggregateStats = (regs: OvertimeRecord[]) => {
    const stats = regs.reduce(
      (acc, r) => ({
        hT: acc.hT + r.hT,
        base: acc.base + r.base,
        extraTotal: acc.extraTotal + r.extraTotal,
        extraOrd: acc.extraOrd + (r.extraOrd || 0),
        extDiurna: acc.extDiurna + r.extDiurna,
        extNocturna: acc.extNocturna + r.extNocturna,
        recNoct: acc.recNoct + r.recNoct,
        domFest: acc.domFest + r.domFest,
        comp: acc.comp + r.comp,
      }),
      { hT: 0, base: 0, extraTotal: 0, extraOrd: 0, extDiurna: 0, extNocturna: 0, recNoct: 0, domFest: 0, comp: 0 }
    );
    const netas = Math.max(0, stats.extraTotal - stats.comp);
    const deficit = Math.max(0, stats.comp - stats.extraTotal);
    return { ...stats, netas, deficit };
  };

  // Get active selected list context
  const activeWorkerAggregateStats = useMemo(() => {
    if (activeWorkerTab === '__global' || !recordsIndexedByWorker[activeWorkerTab]) return null;
    return getCumulativeAggregateStats(recordsIndexedByWorker[activeWorkerTab].regs);
  }, [activeWorkerTab, recordsIndexedByWorker]);

  // Get a readable label for the active history range (Amarre de período)
  const getHistoryRangeLabel = () => {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    if (corteType === 'all') {
      return 'Todos los registros históricos (95 turnos)';
    }
    if (corteType === 'corte12') {
      return `Corte del 12 (${months[selectedMonth]} ${selectedYear}): del ${corteStartDate} al ${corteEndDate}`;
    }
    if (corteType === 'corte27') {
      return `Corte del 27 (${months[selectedMonth]} ${selectedYear}): del ${corteStartDate} al ${corteEndDate}`;
    }
    if (corteType === 'mes') {
      return `Mes de ${months[selectedMonth]} ${selectedYear}: del ${corteStartDate} al ${corteEndDate}`;
    }
    return `Período Personalizado: del ${corteStartDate || 'Inicio'} al ${corteEndDate || 'Fin'}`;
  };

  // 1. Records strictly matching active Corte date boundaries, worker filter, and search query
  const recordsInCorte = useMemo(() => {
    return records.filter(r => {
      // Worker filter
      const inWorkerName = filterWorker === '__all' || r.nom.toLowerCase() === filterWorker.toLowerCase();
      if (!inWorkerName) return false;

      // Search query filter
      if (historySearchTerm.trim()) {
        const query = historySearchTerm.trim().toLowerCase();
        const matchesNom = r.nom.toLowerCase().includes(query);
        const matchesCar = (r.car || '').toLowerCase().includes(query);
        const matchesFec = r.fec.includes(query);
        const matchesMot = (r.mot || '').toLowerCase().includes(query);
        if (!matchesNom && !matchesCar && !matchesFec && !matchesMot) return false;
      }

      // Strict Date Range filters (Amarre exacto de fechas de corte)
      if (corteType !== 'all') {
        if (corteStartDate && r.fec < corteStartDate) return false;
        if (corteEndDate && r.fec > corteEndDate) return false;
      }

      return true;
    }).sort((a, b) => b.fec.localeCompare(a.fec));
  }, [records, corteType, corteStartDate, corteEndDate, filterWorker, historySearchTerm]);

  // 2. Metrics for the active corte: separates Horas Pendientes de Liquidar vs Horas Ya Pagadas (Amarradas)
  const corteStats = useMemo(() => {
    const totalCount = recordsInCorte.length;
    const totalNetas = recordsInCorte.reduce((acc, r) => acc + (r.netas || 0), 0);
    const pendingList = recordsInCorte.filter(r => !r.pagado);
    const paidList = recordsInCorte.filter(r => !!r.pagado);
    return {
      totalCount,
      totalNetas,
      pendingCount: pendingList.length,
      pendingNetas: pendingList.reduce((acc, r) => acc + (r.netas || 0), 0),
      paidCount: paidList.length,
      paidNetas: paidList.reduce((acc, r) => acc + (r.netas || 0), 0),
    };
  }, [recordsInCorte]);

  // 3. Filtered records respecting the active payment status tab (Todos | ⏳ Pendientes | ✅ Pagados)
  const filteredRecords = useMemo(() => {
    if (paymentFilter === 'pending') {
      return recordsInCorte.filter(r => !r.pagado);
    }
    if (paymentFilter === 'paid') {
      return recordsInCorte.filter(r => !!r.pagado);
    }
    return recordsInCorte;
  }, [recordsInCorte, paymentFilter]);

  // 4. Quick helper to fetch initials
  const initialsOf = (nameStr: string): string => {
    if (!nameStr) return '?';
    return nameStr
      .trim()
      .split(/\s+/)
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  // 5. Actions: Liquidar y amarrar horas como pagadas en este corte (no volverán a sumarse a pendientes)
  const handleMarcarCortePagado = () => {
    const pendingRecords = recordsInCorte.filter(r => !r.pagado);
    if (pendingRecords.length === 0) {
      triggerToast('No hay turnos pendientes por liquidar en este período', 'info');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const corteLabel = getHistoryRangeLabel();
    const pendingIds = new Set(pendingRecords.map(r => r.id));
    
    const updated = records.map(r => {
      if (pendingIds.has(r.id)) {
        return {
          ...r,
          pagado: true,
          fechaPago: today,
          corteLiquidado: corteLabel
        };
      }
      return r;
    });

    saveRecords(updated);
    triggerToast(
      `✅ Corte liquidado: ${pendingRecords.length} turnos (${pendingRecords.reduce((a, b) => a + b.netas, 0).toFixed(2)}h) amarrados como PAGADOS. No volverán a sumarse a saldos pendientes.`,
      'success'
    );
  };

  // 6. Action: Reabrir corte si hubo algún error para poder corregir
  const handleReabrirCorte = () => {
    const paidRecords = recordsInCorte.filter(r => r.pagado);
    if (paidRecords.length === 0) {
      triggerToast('No hay turnos pagados en este corte para desmarcar', 'info');
      return;
    }
    if (!window.confirm(`¿Desea reabrir este corte y desmarcar ${paidRecords.length} turnos pagados para realizar correcciones?`)) {
      return;
    }
    const paidIds = new Set(paidRecords.map(r => r.id));
    const updated = records.map(r => {
      if (paidIds.has(r.id)) {
        return {
          ...r,
          pagado: false,
          fechaPago: undefined,
          corteLiquidado: undefined
        };
      }
      return r;
    });

    saveRecords(updated);
    triggerToast(`🔓 Corte reabierto: ${paidRecords.length} turnos desmarcados para corrección`, 'info');
  };

  // 7. Action: Alternar pago de un turno individual (para corrección inmediata de errores)
  const handleToggleShiftPayment = (id: number) => {
    const today = new Date().toISOString().split('T')[0];
    const corteLabel = getHistoryRangeLabel();
    let isNowPaid = false;
    const updated = records.map(r => {
      if (r.id === id) {
        isNowPaid = !r.pagado;
        return {
          ...r,
          pagado: isNowPaid,
          fechaPago: isNowPaid ? (r.fechaPago || today) : undefined,
          corteLiquidado: isNowPaid ? (r.corteLiquidado || corteLabel) : undefined
        };
      }
      return r;
    });

    saveRecords(updated);
    triggerToast(
      isNowPaid 
        ? '✅ Turno amarrado como PAGADO (no volverá a sumarse a pendientes)' 
        : '🔓 Turno desmarcado a PENDIENTE (habilitado para corregir)',
      'success'
    );
  };

  // Export dataset to JSON format
  const triggerDownloadJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ records, config, workers }, null, 2));
    const container = document.createElement('a');
    container.setAttribute("href", dataStr);
    container.setAttribute("download", `Sistemalog_ResumenHorasExtras_${corteStartDate || 'Export'}_${corteEndDate || 'Fin'}.json`);
    document.body.appendChild(container);
    container.click();
    container.remove();
    triggerToast('JSON de auditoría descargado exitosamente', 'success');
  };

  // Print official A4 Payroll sheet for Ley 2466 with 12/27 cutoffs
  const handlePrintNominaA4 = () => {
    document.body.classList.add('print-nomina-mode');
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove('print-nomina-mode');
      }, 1000);
    }, 150);
  };

  // Group filtered records by worker for the printable A4 payroll report
  const printPayrollSummary = useMemo(() => {
    const summaryMap: Record<string, { 
      nom: string; 
      car: string; 
      are: string; 
      count: number; 
      hT: number; 
      extDiurna: number; 
      extNocturna: number; 
      recNoct: number; 
      domFest: number; 
      comp: number; 
      netas: number;
      pendingNetas: number;
      paidNetas: number;
      pendingCount: number;
      paidCount: number;
    }> = {};
    
    filteredRecords.forEach(r => {
      const key = r.nom.trim();
      if (!summaryMap[key]) {
        summaryMap[key] = {
          nom: r.nom,
          car: r.car || 'Operario Logístico',
          are: r.are || 'Operaciones',
          count: 0,
          hT: 0,
          extDiurna: 0,
          extNocturna: 0,
          recNoct: 0,
          domFest: 0,
          comp: 0,
          netas: 0,
          pendingNetas: 0,
          paidNetas: 0,
          pendingCount: 0,
          paidCount: 0
        };
      }
      summaryMap[key].count += 1;
      summaryMap[key].hT += r.hT;
      summaryMap[key].extDiurna += r.extDiurna;
      summaryMap[key].extNocturna += r.extNocturna;
      summaryMap[key].recNoct += r.recNoct;
      summaryMap[key].domFest += r.domFest;
      summaryMap[key].comp += r.comp;
      summaryMap[key].netas += r.netas;
      if (r.pagado) {
        summaryMap[key].paidNetas += r.netas;
        summaryMap[key].paidCount += 1;
      } else {
        summaryMap[key].pendingNetas += r.netas;
        summaryMap[key].pendingCount += 1;
      }
    });

    const rows = Object.values(summaryMap).sort((a, b) => a.nom.localeCompare(b.nom));
    const grandTotals = rows.reduce((acc, row) => ({
      count: acc.count + row.count,
      hT: acc.hT + row.hT,
      extDiurna: acc.extDiurna + row.extDiurna,
      extNocturna: acc.extNocturna + row.extNocturna,
      recNoct: acc.recNoct + row.recNoct,
      domFest: acc.domFest + row.domFest,
      comp: acc.comp + row.comp,
      netas: acc.netas + row.netas,
      pendingNetas: acc.pendingNetas + row.pendingNetas,
      paidNetas: acc.paidNetas + row.paidNetas,
      pendingCount: acc.pendingCount + row.pendingCount,
      paidCount: acc.paidCount + row.paidCount,
    }), { count: 0, hT: 0, extDiurna: 0, extNocturna: 0, recNoct: 0, domFest: 0, comp: 0, netas: 0, pendingNetas: 0, paidNetas: 0, pendingCount: 0, paidCount: 0 });

    return { rows, grandTotals };
  }, [filteredRecords]);

  return (
    <div className="bg-[#02161a] min-height-screen text-slate-100 font-sans border border-[#00f0b5]/25 rounded-2xl overflow-hidden shadow-2xl relative">
      {/* HUD Header Banner */}
      <div className="bg-gradient-to-r from-[#03242a] via-[#02161a] to-[#042d35] p-6 border-b border-[#00f0b5]/30 flex flex-col lg:flex-row items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-[#02161a] border-2 border-[#00f0b5]/60 rounded-xl text-[#00f0b5] shadow-[0_0_20px_rgba(0,240,181,0.3)]">
              <Clock className="w-7 h-7 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl md:text-2xl font-black font-mono tracking-tight text-white uppercase text-relief-title">
                  SISTEMA DE NÓMINA & HORAS EXTRAS <span className="text-[#00f0b5]">SISTEMALOG SAS</span>
                </h1>
                <span className="hidden sm:inline-block px-2.5 py-0.5 rounded text-[10px] font-black font-mono uppercase bg-[#00f0b5]/15 text-[#00f0b5] border border-[#00f0b5]/40 shadow-sm">
                  LEY 2466 VIGENTE
                </span>
              </div>
              <p className="text-xs font-mono text-[#00f0b5]/80 uppercase tracking-widest mt-1">
                Control Operativo de Turnos, Recargos Nocturnos (19:00), Dominicales y Cortes 12/27
              </p>
              
              {/* Firebase real-time status banner */}
              <div className="flex items-center gap-2.5 mt-2">
                {syncStatus === 'loading' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono uppercase bg-[#04242a] text-slate-400 border border-slate-700">
                    <RefreshCw className="w-3 h-3 animate-spin text-[#00f0b5]" />
                    Sincronizando con Firebase Firestore...
                  </span>
                )}
                {syncStatus === 'saving' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono uppercase bg-[#00f0b5]/20 text-[#00f0b5] border border-[#00f0b5]/40">
                    <RefreshCw className="w-3 h-3 animate-spin text-[#00f0b5]" />
                    Guardando en la nube Firebase...
                  </span>
                )}
                {syncStatus === 'synced' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono uppercase bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 shadow-sm">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Base en la Nube Sincronizada (95 Turnos | 5 Colaboradores)
                  </span>
                )}
                {syncStatus === 'error' && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-mono uppercase bg-rose-950/60 text-rose-300 border border-rose-500/40 animate-pulse">
                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                    {syncError || 'Error de Sincronización'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Navigation Tabs bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#02161a] p-1.5 border border-[#00f0b5]/30 rounded-xl font-mono text-xs shadow-lg">
          <div className="flex flex-wrap gap-1.5 items-center">
            {hasAdminRights ? (
              <>
                {/* Admin Subtabs: Full access to everything */}
                <button 
                  onClick={() => setActiveSubTab('historial')}
                  className={`px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                    activeSubTab === 'historial' 
                      ? 'bg-[#00f0b5] text-slate-950 font-black shadow-[0_0_15px_rgba(0,240,181,0.4)]' 
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Historial & Turnos</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                    activeSubTab === 'historial' ? 'bg-slate-950/25 text-slate-950' : 'bg-[#00f0b5]/15 text-[#00f0b5] border border-[#00f0b5]/30'
                  }`}>
                    {records.length}
                  </span>
                </button>

                <button 
                  onClick={() => setActiveSubTab('personal')}
                  className={`px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                    activeSubTab === 'personal' 
                      ? 'bg-[#00f0b5] text-slate-950 font-black shadow-[0_0_15px_rgba(0,240,181,0.4)]' 
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Personal & Fichas</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                    activeSubTab === 'personal' ? 'bg-slate-950/25 text-slate-950' : 'bg-[#00f0b5]/15 text-[#00f0b5] border border-[#00f0b5]/30'
                  }`}>
                    {workers.length}
                  </span>
                </button>

                <button 
                  onClick={() => setActiveSubTab('registrar')}
                  className={`px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                    activeSubTab === 'registrar' 
                      ? 'bg-[#00f0b5] text-slate-950 font-black shadow-[0_0_15px_rgba(0,240,181,0.4)]' 
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Registrar Turno</span>
                </button>

                <button 
                  onClick={() => setActiveSubTab('consulta')}
                  className={`px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                    activeSubTab === 'consulta' 
                      ? 'bg-[#00f0b5] text-slate-950 font-black shadow-[0_0_15px_rgba(0,240,181,0.4)]' 
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Consulta Nómina</span>
                </button>

                <button 
                  onClick={() => setActiveSubTab('ajustes')}
                  className={`px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                    activeSubTab === 'ajustes' 
                      ? 'bg-amber-400 text-slate-950 font-black shadow-[0_0_15px_rgba(251,191,36,0.4)]' 
                      : 'text-amber-400/80 hover:text-amber-200 hover:bg-amber-950/30'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Fórmulas Ley 2466</span>
                </button>
              </>
            ) : (
              <>
                {/* Workers Subtabs (Deyci, Julian, Juan, Antonio): strictly self-registration & personal consultation */}
                <button 
                  onClick={() => setActiveSubTab('registrar')}
                  className={`px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                    activeSubTab === 'registrar' 
                      ? 'bg-[#00f0b5] text-slate-950 font-black shadow-[0_0_15px_rgba(0,240,181,0.4)]' 
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Registrar Mi Turno</span>
                </button>

                <button 
                  onClick={() => setActiveSubTab('consulta')}
                  className={`px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all cursor-pointer ${
                    activeSubTab === 'consulta' 
                      ? 'bg-[#00f0b5] text-slate-950 font-black shadow-[0_0_15px_rgba(0,240,181,0.4)]' 
                      : 'text-slate-300 hover:text-white hover:bg-slate-900/80'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Mis Horas Registradas</span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 pr-2">
            <span className={`text-[10px] font-mono px-2.5 py-1 rounded-md font-bold uppercase tracking-wider ${
              hasAdminRights 
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30' 
                : 'bg-[#00f0b5]/15 text-[#00f0b5] border border-[#00f0b5]/30'
            }`}>
              {hasAdminRights ? '👑 MODO ADMINISTRADOR (CONTROL TOTAL)' : '👤 MODO TRABAJADOR: REGISTRO DE TURNOS'}
            </span>
          </div>
        </div>
      </div>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3.5 rounded-xl text-xs font-mono font-bold shadow-2xl border transition-all duration-300 animate-bounce flex items-center gap-3 ${
          toast.type === 'error' ? 'bg-rose-950 text-rose-200 border-rose-500' : 
          toast.type === 'info' ? 'bg-slate-900 text-cyan-300 border-cyan-500' : 'bg-emerald-950 text-emerald-200 border-emerald-500'
        }`}>
          <span>{toast.type === 'error' ? '❌' : toast.type === 'info' ? 'ℹ️' : '✅'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Panel views */}
      <div className="p-6">
        
        {/* TAB 1: FORMULARIO REGISTRAR */}
        {activeSubTab === 'registrar' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Form Fields column */}
            <div className="lg:col-span-7 bg-slate-900/40 p-6 rounded-xl border border-slate-850 space-y-6">
              <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                <h3 className="font-mono text-sm uppercase text-cyan-400 font-bold flex items-center gap-2">
                  <Plus className="w-4 h-4 text-cyan-400" />
                  {editingRecordId 
                    ? 'Modificar Registro Existente' 
                    : hasAdminRights 
                    ? 'Ingresar Jornada Trabajada (Administrador)' 
                    : `Registrar Mi Jornada (${currentUser?.nombre || 'Colaborador'})`}
                </h3>
                <button 
                  onClick={handleResetForm}
                  className="text-[10px] font-mono text-slate-500 hover:text-slate-300 uppercase underline cursor-pointer"
                >
                  Limpiar Formulario
                </button>
              </div>

              {/* Notice for workers self-registering their overtime shifts */}
              {!hasAdminRights && currentUser && (
                <div className="bg-[#04242a] border border-[#00f0b5]/40 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono shadow-sm">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-black font-mono text-sm border shadow-md shrink-0"
                      style={{
                        backgroundColor: `${currentUser.color || '#00f0b5'}20`,
                        borderColor: `${currentUser.color || '#00f0b5'}60`,
                        color: currentUser.color || '#00f0b5'
                      }}
                    >
                      {currentUser.avatar || 'TB'}
                    </div>
                    <div>
                      <span className="text-[#00f0b5] font-black uppercase text-xs block">
                        Autogestión de Horas Extras — {currentUser.nombre}
                      </span>
                      <span className="text-slate-300 text-[10px] leading-tight block">
                        Registra aquí tu hora de entrada, salida y motivo. Tu jornada quedará firmada con tu autoría. El Administrador consolidará la nómina en los cortes 12 y 27.
                      </span>
                    </div>
                  </div>
                  <span className="px-3 py-1 bg-[#00f0b5] text-slate-950 text-[10px] rounded-lg font-black uppercase tracking-wider self-start sm:self-center shrink-0">
                    Turno Personal
                  </span>
                </div>
              )}

              {/* Step 1: Info del Trabajador */}
              <div className="space-y-4">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                  1. Información General del Personal
                </div>
                
                {/* Quick 1-click worker selectors for shared workstation terminals */}
                <div className="bg-[#032026] border border-[#00f0b5]/30 p-3 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-black uppercase text-[#00f0b5] tracking-wider flex items-center gap-1.5">
                      <span>⚡</span> ¿Quién está registrando? (Selección Rápida con 1 Clic):
                    </span>
                    <span className="text-[9px] font-mono text-slate-400">
                      Terminal compartida (No requiere correo)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {workers.map(w => {
                      const isSelected = workerName.trim().toLowerCase() === w.nom.trim().toLowerCase();
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => handleSelectMasterWorker(w.nom)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                            isSelected
                              ? 'bg-[#00f0b5] text-slate-950 border-[#00f0b5] shadow-[0_0_12px_rgba(0,240,181,0.4)] scale-105'
                              : 'bg-slate-950/80 text-slate-300 border-slate-700 hover:border-[#00f0b5]/60 hover:text-white'
                          }`}
                        >
                          <span>👤</span>
                          <span>{w.nom}</span>
                          {isSelected && <span className="text-slate-950 font-black">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-slate-400 font-mono flex items-center justify-between">
                      <span>Colaborador / Trabajador del Turno</span>
                      {workerName && (
                        <span className="text-[9.5px] text-[#00f0b5] font-bold">✓ Seleccionado: {workerName}</span>
                      )}
                    </label>
                    <select
                      value={workerName}
                      onChange={(e) => handleSelectMasterWorker(e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-white rounded-md p-3 text-sm focus:border-cyan-400 outline-none transition-all cursor-pointer font-bold"
                    >
                      <option value="">-- Seleccione un Trabajador --</option>
                      {workers.map(w => (
                        <option key={w.id} value={w.nom}>{w.nom}</option>
                      ))}
                    </select>
                    <div className="text-[10px] text-slate-500 mt-1 uppercase font-mono">
                      Cualquier colaborador (Julian, Antonio, Juan, Deyci) puede registrar aquí su turno libremente
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-slate-400 font-mono">Fecha de Jornada</label>
                    <input 
                      type="date"
                      value={recordDate}
                      onChange={(e) => setRecordDate(e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-white rounded-md p-2.5 text-sm focus:border-cyan-400 outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-slate-400 font-mono">Cargo (Autollenado)</label>
                    <input 
                      type="text"
                      placeholder="Autocompletado..."
                      value={workerRole}
                      onChange={(e) => setWorkerRole(e.target.value)}
                      className="bg-slate-950 border border-slate-850 text-slate-300 rounded-md p-3 text-sm focus:border-cyan-400 outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-slate-400 font-mono">Área / Proceso (Autollenado)</label>
                    <input 
                      type="text"
                      placeholder="Autocompletado..."
                      value={workerDept}
                      onChange={(e) => setWorkerDept(e.target.value)}
                      className="bg-slate-950 border border-slate-850 text-slate-300 rounded-md p-3 text-sm focus:border-cyan-400 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Step 2: Shift and Day type code */}
              <div className="space-y-4 pt-4 border-t border-slate-850">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                  2. Tipo de Día y Jornada Laboral Base
                </div>

                {/* Cyber style tab selectors for Day Type */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDayTypeChange('ord')}
                    className={`p-3 rounded-lg border text-center font-mono text-xs transition-all flex flex-col items-center justify-center gap-1 ${
                      dayType === 'ord' ? 'bg-cyan-500/10 border-cyan-400 text-cyan-300 shadow-md' : 'bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-bold">ORDINARIO</span>
                    <span className="text-[9px] opacity-70">Lunes a Viernes</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDayTypeChange('sab')}
                    className={`p-3 rounded-lg border text-center font-mono text-xs transition-all flex flex-col items-center justify-center gap-1 ${
                      dayType === 'sab' ? 'bg-purple-500/10 border-purple-400 text-purple-300 shadow-md' : 'bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-bold">SÁBADO</span>
                    <span className="text-[9px] opacity-70">Overtime Completo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDayTypeChange('dom')}
                    className={`p-3 rounded-lg border text-center font-mono text-xs transition-all flex flex-col items-center justify-center gap-1 ${
                      dayType === 'dom' ? 'bg-amber-500/10 border-amber-400 text-amber-300 shadow-md' : 'bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-bold">DOMINICAL</span>
                    <span className="text-[9px] opacity-70">Surcharge Dominical</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDayTypeChange('fest')}
                    className={`p-3 rounded-lg border text-center font-mono text-xs transition-all flex flex-col items-center justify-center gap-1 ${
                      dayType === 'fest' ? 'bg-rose-500/10 border-rose-400 text-rose-300 shadow-md' : 'bg-slate-950 border-slate-850 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="font-bold">FESTIVO</span>
                    <span className="text-[9px] opacity-70">Surcharge Festivo</span>
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  <header className="flex justify-between items-center">
                    <label className="text-xs text-slate-400 font-mono">Selección de Horario Base</label>
                    <span className="text-[10px] text-emerald-400 font-mono uppercase font-semibold">
                      Cambios en Ley de este año habilitados
                    </span>
                  </header>
                  <select
                    value={shiftType}
                    onChange={(e) => handleShiftChange(e.target.value as 'lmjv' | 'mie' | 'esp')}
                    className="bg-slate-950 border border-slate-800 text-white rounded-md p-3 text-sm focus:border-cyan-400 outline-none transition-all"
                  >
                    <option value="lmjv">
                      Lunes / Martes / Jueves / Viernes — {config.normalBaseHours}h Base (Sugerido hasta {config.normalEndTime})
                    </option>
                    <option value="mie">
                      Miércoles del año en curso — {config.wedBaseHours}h Base (Sugerido hasta {config.wedEndTime})
                    </option>
                    <option value="esp">
                      Fin de Semana / Festivos / Ausente — 0h Base
                    </option>
                  </select>
                </div>
              </div>

              {/* Step 3: Clock times */}
              <div className="space-y-4 pt-4 border-t border-slate-850">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                  3. Registro de Reloj de Control (Entrada y Salida)
                </div>

                <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-850">
                  <div className="flex flex-col items-center p-3 border-r border-slate-850">
                    <span className="text-[10px] font-mono tracking-widest text-emerald-400 font-bold mb-2 uppercase">ENTRADA REGISTRADA</span>
                    <input 
                      type="time" 
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="text-3xl font-bold font-mono text-white bg-transparent outline-none border-b border-transparent focus:border-cyan-500 text-center w-full focus:shadow-sm"
                    />
                  </div>

                  <div className="flex flex-col items-center p-3">
                    <span className="text-[10px] font-mono tracking-widest text-rose-400 font-bold mb-2 uppercase">SALIDA REGISTRADA</span>
                    <input 
                      type="time" 
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="text-3xl font-bold font-mono text-white bg-transparent outline-none border-b border-transparent focus:border-cyan-500 text-center w-full focus:shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Step 4: Compenses o Ausentismo */}
              <div className="space-y-4 pt-4 border-t border-slate-850">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 flex justify-between">
                  <span>4. Ausentismos o Descuento de Horas Compensadas</span>
                  <span className="text-amber-400 text-[10px] font-semibold uppercase">Permisos / Salidas Tempranas</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="flex flex-col gap-1.5 md:col-span-4">
                    <label className="text-xs text-slate-400 font-mono">Horas a Descontar</label>
                    <input 
                      type="number" 
                      min="0" 
                      step="0.25"
                      value={deductedHours}
                      onChange={(e) => setDeductedHours(parseFloat(e.target.value) || 0)}
                      className="bg-slate-950 border border-slate-800 text-white rounded-md p-3 text-sm focus:border-cyan-400 outline-none font-mono"
                      placeholder="0.00"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5 md:col-span-8">
                    <label className="text-xs text-slate-400 font-mono">Motivo del Descuento</label>
                    <input 
                      type="text" 
                      value={deductReason}
                      onChange={(e) => setDeductReason(e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-white rounded-md p-3 text-sm focus:border-cyan-400 outline-none"
                      placeholder="Ej: Retiro familiar, cita médica, ausentismo de 2 horas..."
                    />
                  </div>
                </div>
              </div>

              {/* Action submission triggers */}
              <div className="pt-6 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCalculatePreview}
                  className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono uppercase py-4 rounded-xl shadow-[0_0_20px_rgba(34,211,238,0.25)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)] transition-all flex items-center justify-center gap-3 text-sm"
                >
                  <Sparkles className="w-5 h-5" />
                  Calcular y Desglosar Horas Extras
                </button>
              </div>

            </div>

            {/* Calculations Breakdown column */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Header result preview card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden shadow-lg">
                <div className="absolute top-0 right-0 p-3 bg-slate-950/60 text-[9px] font-mono text-slate-500 uppercase tracking-widest border-l border-b border-slate-800 rounded-bl-lg">
                  Preview de Desgloce
                </div>

                {computedPreview ? (
                  <div className="space-y-6">
                    {/* Worker Hero Badge */}
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-cyan-500 text-slate-950 font-black font-mono text-xl rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.3)]">
                        {initialsOf(computedPreview.nom || '')}
                      </div>
                      <div>
                        <h4 className="text-md font-bold text-white uppercase tracking-tight">{computedPreview.nom || 'Anónimo'}</h4>
                        <p className="text-[11px] font-mono text-slate-400 uppercase mt-0.5">
                          {computedPreview.car || 'Cargo indefinido'} &middot; {computedPreview.are || 'Logística'}
                        </p>
                      </div>
                    </div>

                    {/* Output metric widgets */}
                    <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-850">
                      <div className="bg-slate-950 p-4 border border-slate-850 rounded-lg text-center">
                        <span className="text-[10px] font-mono text-slate-500 uppercase block tracking-wider">H. Trabajadas</span>
                        <span className="text-xl font-bold text-slate-100 font-mono mt-1 block">
                          {computedPreview.hT ? formatHoursHuman(computedPreview.hT) : '0h'}
                        </span>
                      </div>

                      <div className="bg-slate-950 p-4 border border-slate-850 rounded-lg text-center">
                        <span className="text-[10px] font-mono text-slate-500 uppercase block tracking-wider">Límite Base</span>
                        <span className="text-xl font-bold text-slate-400 font-mono mt-1 block">
                          {computedPreview.base || 0}h
                        </span>
                      </div>

                      <div className="bg-slate-950 p-4 border border-slate-850 rounded-lg text-center col-span-2 relative">
                        <span className="text-[10px] font-mono text-slate-500 uppercase block tracking-wider">Horas Netas Extras a Pagar</span>
                        <span className="text-4xl font-extrabold text-cyan-400 font-mono tracking-tight mt-1.5 block drop-shadow-[0_0_10px_rgba(34,211,238,0.25)]">
                          {computedPreview.netas ? computedPreview.netas.toFixed(2) : '0.00'}h
                        </span>
                        {computedPreview.comp ? (
                          <div className="absolute top-2 right-2 text-[9px] bg-rose-500/10 border border-rose-500/30 text-rose-400 px-2.5 py-1 rounded font-mono">
                            Deducidas: -{computedPreview.comp}h
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {/* Surcharges Detailed Breakdown */}
                    <div className="space-y-2.5 pt-4 border-t border-slate-850 text-xs font-mono">
                      <div className="text-[10px] uppercase text-cyan-400 font-bold tracking-wider mb-2">Desglose Técnico de Surcharges</div>
                      
                      <div className="flex justify-between items-center py-2 border-b border-slate-850">
                        <span className="text-slate-400">H. Extra Ordinaria (+{(config.extraOrdMultiplier - 1) * 100}%):</span>
                        <span className="text-cyan-300 font-bold">{computedPreview.extraOrd ? `${computedPreview.extraOrd.toFixed(2)}h` : '—'}</span>
                      </div>

                      <div className="flex justify-between items-center py-2 border-b border-slate-850">
                        <span className="text-slate-400">H. Extra Diurna (+{(config.extraDiurnaMultiplier - 1) * 100}%):</span>
                        <span className="text-cyan-300 font-bold">{computedPreview.extDiurna ? `${computedPreview.extDiurna.toFixed(2)}h` : '—'}</span>
                      </div>

                      <div className="flex justify-between items-center py-2 border-b border-slate-850">
                        <span className="text-slate-400">H. Extra Nocturna (+{(config.extraNocturnaMultiplier - 1) * 100}%):</span>
                        <span className="text-purple-400 font-bold">{computedPreview.extNocturna ? `${computedPreview.extNocturna.toFixed(2)}h` : '—'}</span>
                      </div>

                      <div className="flex justify-between items-center py-2 border-b border-slate-850">
                        <span className="text-slate-400">Recargo Nocturno Ord. (+{config.recNoctMultiplier * 100}%):</span>
                        <span className="text-rose-400 font-bold">{computedPreview.recNoct ? `${computedPreview.recNoct.toFixed(2)}h` : '—'}</span>
                      </div>

                      <div className="flex justify-between items-center py-2">
                        <span className="text-slate-400">Surcharge Dominical / Festivo (+{(config.domFestMultiplier - 1) * 100}%):</span>
                        <span className="text-amber-400 font-bold">{computedPreview.domFest ? `${computedPreview.domFest.toFixed(2)}h` : '—'}</span>
                      </div>

                      {computedPreview.mot && (
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-850 text-[11px] text-slate-400 italic">
                          <strong className="text-slate-300">Novedad/Descuento:</strong> {computedPreview.mot}
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-slate-800 space-y-2">
                      <button
                        type="button"
                        onClick={handleSaveRecord}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black font-mono uppercase py-4.5 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-2"
                      >
                        <Save className="w-5 h-5" />
                        {editingRecordId ? 'Actualizar Registro de Horas' : 'Confirmar y Guardar Registro'}
                      </button>
                      <button
                        type="button"
                        onClick={handleResetForm}
                        className="w-full bg-slate-950 hover:bg-slate-900 text-slate-400 border border-slate-800 font-mono uppercase py-3.5 rounded-xl text-xs transition-all text-center block"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                    <Clock className="w-12 h-12 text-slate-700 animate-pulse" />
                    <p className="text-xs font-mono text-slate-500 uppercase max-w-[280px]">
                      Complete los campos del formulario y presione "Calcular" para ver el desglose técnico de Horas Extras.
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: REGISTRO / AUDITORÍA */}
        {activeSubTab === 'historial' && (
          <div className="space-y-6">
            
            {/* ========================================================================= */}
            {/* 🔒 PANEL PRINCIPAL DE AMARRE DE PERÍODO & CORTES 12/27 (LEY 2466)          */}
            {/* ========================================================================= */}
            <div className="bg-[#04242a] p-5 border border-[#00f0b5]/30 rounded-xl space-y-4 shadow-xl">
              
              {/* Row 1: Quick Corte Selectors & Month / Year */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#00f0b5]/20 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-mono font-black uppercase text-[#00f0b5] tracking-widest flex items-center gap-1.5 mr-1">
                    <Lock className="w-3.5 h-3.5 text-[#00f0b5]" />
                    <span>Cortes Ley 2466:</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => applyCorteSelection('all')}
                    className={`px-3 py-1.5 text-xs font-mono font-bold uppercase rounded-lg transition-all cursor-pointer border ${
                      corteType === 'all'
                        ? 'bg-[#00f0b5] border-[#00f0b5] text-slate-950 shadow-[0_0_12px_rgba(0,240,181,0.4)]'
                        : 'bg-[#02161a] border-slate-700 text-slate-300 hover:text-white hover:border-[#00f0b5]/50'
                    }`}
                  >
                    🌐 Todo el Histórico ({records.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => applyCorteSelection('corte12', selectedMonth, selectedYear)}
                    className={`px-3.5 py-1.5 text-xs font-mono font-black uppercase rounded-lg transition-all cursor-pointer flex items-center gap-1.5 border ${
                      corteType === 'corte12'
                        ? 'bg-amber-400 border-amber-400 text-slate-950 shadow-[0_0_12px_rgba(251,191,36,0.4)] scale-105'
                        : 'bg-[#02161a] border-amber-400/50 text-amber-300 hover:bg-amber-950/30'
                    }`}
                    title="Corte del 12: Del 28 del mes previo al 12 del mes en curso"
                  >
                    <span>✂️</span>
                    <span>Corte 12 (28 al 12)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyCorteSelection('corte27', selectedMonth, selectedYear)}
                    className={`px-3.5 py-1.5 text-xs font-mono font-black uppercase rounded-lg transition-all cursor-pointer flex items-center gap-1.5 border ${
                      corteType === 'corte27'
                        ? 'bg-amber-400 border-amber-400 text-slate-950 shadow-[0_0_12px_rgba(251,191,36,0.4)] scale-105'
                        : 'bg-[#02161a] border-amber-400/50 text-amber-300 hover:bg-amber-950/30'
                    }`}
                    title="Corte del 27: Del 13 al 27 del mes en curso"
                  >
                    <span>✂️</span>
                    <span>Corte 27 (13 al 27)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => applyCorteSelection('mes', selectedMonth, selectedYear)}
                    className={`px-3 py-1.5 text-xs font-mono font-bold uppercase rounded-lg transition-all cursor-pointer border ${
                      corteType === 'mes'
                        ? 'bg-[#00f0b5] border-[#00f0b5] text-slate-950 shadow-[0_0_12px_rgba(0,240,181,0.4)]'
                        : 'bg-[#02161a] border-slate-700 text-slate-300 hover:text-white hover:border-[#00f0b5]/50'
                    }`}
                  >
                    📅 Mes Completo
                  </button>
                </div>

                {/* Ciclo / Mes y Año dropdown */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-[#02161a] p-1 rounded-lg border border-slate-700">
                    <button
                      type="button"
                      disabled={corteType === 'all'}
                      onClick={() => handleNavigatePeriod('prev')}
                      className={`p-1.5 text-slate-400 hover:text-[#00f0b5] rounded hover:bg-slate-900 transition-all ${corteType === 'all' ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                      title="Corte / Mes anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <select
                      value={selectedMonth}
                      onChange={(e) => {
                        const m = parseInt(e.target.value);
                        const targetType = corteType === 'all' || corteType === 'custom' ? 'corte12' : corteType;
                        applyCorteSelection(targetType, m, selectedYear);
                      }}
                      className="bg-transparent text-[#00f0b5] text-xs font-mono font-bold outline-none cursor-pointer px-1 py-1"
                    >
                      {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((nom, idx) => (
                        <option key={nom} value={idx} className="bg-slate-900 text-white">{nom}</option>
                      ))}
                    </select>

                    <select
                      value={selectedYear}
                      onChange={(e) => {
                        const y = parseInt(e.target.value);
                        const targetType = corteType === 'all' || corteType === 'custom' ? 'corte12' : corteType;
                        applyCorteSelection(targetType, selectedMonth, y);
                      }}
                      className="bg-transparent text-white text-xs font-mono font-bold outline-none cursor-pointer px-1 py-1"
                    >
                      <option value="2025" className="bg-slate-900 text-white">2025</option>
                      <option value="2026" className="bg-slate-900 text-white">2026</option>
                      <option value="2027" className="bg-slate-900 text-white">2027</option>
                    </select>

                    <button
                      type="button"
                      disabled={corteType === 'all'}
                      onClick={() => handleNavigatePeriod('next')}
                      className={`p-1.5 text-slate-400 hover:text-[#00f0b5] rounded hover:bg-slate-900 transition-all ${corteType === 'all' ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
                      title="Corte / Mes siguiente"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2: Explicit Start & End Dates "Amarradas" + Search & Actions */}
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap items-end gap-3">
                  
                  {/* Fecha Desde */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <span>🔒 Desde (Inicio Corte):</span>
                    </span>
                    <input
                      type="date"
                      value={corteStartDate}
                      onChange={(e) => {
                        setCorteStartDate(e.target.value);
                        setCorteType('custom');
                      }}
                      className="bg-[#02161a] border border-[#00f0b5]/40 text-[#00f0b5] rounded-lg px-3 py-2 text-xs font-mono focus:border-[#00f0b5] outline-none font-bold"
                    />
                  </div>

                  {/* Fecha Hasta */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <span>🔒 Hasta (Fin Corte):</span>
                    </span>
                    <input
                      type="date"
                      value={corteEndDate}
                      onChange={(e) => {
                        setCorteEndDate(e.target.value);
                        setCorteType('custom');
                      }}
                      className="bg-[#02161a] border border-[#00f0b5]/40 text-[#00f0b5] rounded-lg px-3 py-2 text-xs font-mono focus:border-[#00f0b5] outline-none font-bold"
                    />
                  </div>

                  {/* Worker selector */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">Colaborador</span>
                    <select
                      value={filterWorker}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFilterWorker(val);
                        if (val === '__all') {
                          setActiveWorkerTab('__global');
                        } else {
                          setActiveWorkerTab(val.toLowerCase());
                        }
                      }}
                      className="bg-[#02161a] border border-slate-700 text-white rounded-lg px-3 py-2 text-xs focus:border-[#00f0b5] outline-none font-mono cursor-pointer"
                    >
                      <option value="__all">-- Todos ({workers.length}) --</option>
                      {workers.map(w => (
                        <option key={w.id} value={w.nom}>{w.nom}</option>
                      ))}
                    </select>
                  </div>

                  {/* Search query */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono text-[#00f0b5] font-bold uppercase tracking-wider">Buscar</span>
                    <div className="relative">
                      <input
                        type="text"
                        value={historySearchTerm}
                        onChange={(e) => setHistorySearchTerm(e.target.value)}
                        placeholder="TRABAJADOR, MOTIVO..."
                        className="bg-[#02161a] border border-[#00f0b5]/30 text-white rounded-lg pl-3 pr-7 py-2 text-xs font-mono uppercase focus:border-[#00f0b5] outline-none w-44 placeholder-slate-500"
                      />
                      {historySearchTerm && (
                        <button
                          onClick={() => setHistorySearchTerm('')}
                          className="absolute right-2 top-2 text-slate-400 hover:text-white text-xs font-mono"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* View Mode */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">Vista</span>
                    <div className="flex bg-[#02161a] p-0.5 rounded-lg border border-slate-700 h-[36px] items-center">
                      <button
                        type="button"
                        onClick={() => setHistoryViewMode('cards')}
                        className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded transition-all cursor-pointer ${
                          historyViewMode === 'cards'
                            ? 'bg-[#00f0b5] text-slate-950 font-black'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        🎴 Tarjetas
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistoryViewMode('table')}
                        className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded transition-all cursor-pointer ${
                          historyViewMode === 'table'
                            ? 'bg-[#00f0b5] text-slate-950 font-black'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        📋 Tabla
                      </button>
                    </div>
                  </div>

                  {/* Payment Status Filter Tabs */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider">Estado Pago</span>
                    <div className="flex bg-[#02161a] p-0.5 rounded-lg border border-slate-700 h-[36px] items-center">
                      <button
                        type="button"
                        onClick={() => setPaymentFilter('all')}
                        className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded transition-all cursor-pointer ${
                          paymentFilter === 'all'
                            ? 'bg-[#00f0b5] text-slate-950 font-black'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title="Ver todos los registros del corte"
                      >
                        Todos ({corteStats.totalCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentFilter('pending')}
                        className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded transition-all cursor-pointer flex items-center gap-1 ${
                          paymentFilter === 'pending'
                            ? 'bg-amber-400 text-slate-950 font-black shadow-sm'
                            : 'text-amber-400 hover:text-amber-300'
                        }`}
                        title="Ver solo horas pendientes por liquidar"
                      >
                        <span>⏳ Pendientes ({corteStats.pendingCount})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentFilter('paid')}
                        className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase rounded transition-all cursor-pointer flex items-center gap-1 ${
                          paymentFilter === 'paid'
                            ? 'bg-emerald-400 text-slate-950 font-black shadow-sm'
                            : 'text-emerald-400 hover:text-emerald-300'
                        }`}
                        title="Ver solo horas ya pagadas y amarradas"
                      >
                        <span>✅ Pagados ({corteStats.paidCount})</span>
                      </button>
                    </div>
                  </div>

                </div>

                {/* Print & Export Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={triggerDownloadJSON}
                    className="bg-[#02161a] border border-[#00f0b5]/40 px-3 py-2 rounded-lg text-xs font-mono text-[#00f0b5] hover:bg-[#032026] transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="Descargar archivo JSON de auditoría"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>
                  <button
                    onClick={handlePrintNominaA4}
                    className="bg-[#00f0b5] hover:bg-[#25ffcb] text-slate-950 border border-[#00f0b5] px-4 py-2 rounded-lg text-xs font-mono font-black transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(0,240,181,0.4)]"
                    title="Imprimir Planilla Oficial A4 con cabecera corporativa, firmas y cortes 12/27"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-slate-950" />
                    <span>Impresión A4 Nómina ({filteredRecords.length})</span>
                  </button>
                </div>

              </div>

            </div>

            {/* ========================================================================= */}
            {/* 🔒 BANNER DE PERÍODO AMARRADO AL CORTE ACTIVO & LIQUIDACIÓN               */}
            {/* ========================================================================= */}
            <div className="bg-[#021b20] border-2 border-[#00f0b5]/70 p-4 rounded-xl flex flex-col xl:flex-row items-center justify-between gap-4 shadow-[0_0_20px_rgba(0,240,181,0.15)]">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#00f0b5]/20 border border-[#00f0b5] flex items-center justify-center text-[#00f0b5] text-lg font-bold shadow-sm shrink-0">
                  🔒
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-black uppercase text-[#00f0b5] tracking-widest">
                      PERÍODO AMARRADO AL CORTE & REPORTE A4
                    </span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-black font-mono uppercase bg-amber-400/20 text-amber-300 border border-amber-400/40">
                      LEY 2466
                    </span>
                  </div>
                  <p className="text-sm font-bold font-mono text-white mt-0.5">
                    {getHistoryRangeLabel()}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400">
                    Límites exactos de liquidación: Del <strong className="text-white underline">{corteStartDate || 'Sin límite inicial'}</strong> al <strong className="text-white underline">{corteEndDate || 'Sin límite final'}</strong>
                  </p>
                </div>
              </div>

              {/* Metrics & Settlement Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 self-stretch xl:self-auto justify-end">
                {/* 1. Pendientes a Liquidar */}
                <div className="text-right font-mono bg-[#03242a] border border-amber-400/40 px-3.5 py-2 rounded-lg">
                  <span className="text-[9px] text-amber-300 uppercase block font-bold">⏳ Pendiente por Pagar</span>
                  <span className="text-base font-black text-amber-300">
                    {corteStats.pendingNetas.toFixed(2)}h
                  </span>
                  <span className="text-[9px] text-slate-400 block font-normal">
                    {corteStats.pendingCount} turnos
                  </span>
                </div>

                {/* 2. Horas Amarradas / Pagadas */}
                <div className="text-right font-mono bg-[#03242a] border border-emerald-500/40 px-3.5 py-2 rounded-lg">
                  <span className="text-[9px] text-emerald-400 uppercase block font-bold">✅ Pagadas (Amarradas)</span>
                  <span className="text-base font-black text-emerald-400">
                    {corteStats.paidNetas.toFixed(2)}h
                  </span>
                  <span className="text-[9px] text-slate-400 block font-normal">
                    {corteStats.paidCount} turnos
                  </span>
                </div>

                {/* 3. Total Período */}
                <div className="text-right font-mono bg-[#03242a] border border-cyan-500/30 px-3.5 py-2 rounded-lg">
                  <span className="text-[9px] text-cyan-300 uppercase block font-bold">Total Período</span>
                  <span className="text-base font-black text-cyan-300">
                    {corteStats.totalNetas.toFixed(2)}h
                  </span>
                  <span className="text-[9px] text-slate-400 block font-normal">
                    {corteStats.totalCount} turnos
                  </span>
                </div>

                {/* Action Buttons: Marcar como Pagado / Reabrir para Corregir */}
                {hasAdminRights && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    {corteStats.pendingCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarcarCortePagado}
                        className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-black text-xs px-3.5 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-[0_0_12px_rgba(16,185,129,0.35)] cursor-pointer"
                        title="Amarrar horas de este corte como pagadas para que no sumen a saldos pendientes"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Liquidar Corte ({corteStats.pendingCount})</span>
                      </button>
                    )}

                    {corteStats.paidCount > 0 && (
                      <button
                        type="button"
                        onClick={handleReabrirCorte}
                        className="bg-slate-900 hover:bg-amber-950/60 text-amber-300 border border-amber-500/50 font-mono font-bold text-xs px-3 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        title="Reabrir el corte y desmarcar turnos para corregir errores"
                      >
                        <Unlock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Reabrir Corte (Corregir)</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Aviso inteligente si no hay turnos en el rango seleccionado */}
            {filteredRecords.length === 0 && (
              <div className="bg-amber-950/40 border border-amber-500/50 p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono shadow-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <span className="text-amber-300 font-bold block">
                      0 turnos encontrados en este período ({corteStartDate || 'Inicio'} al {corteEndDate || 'Fin'})
                    </span>
                    <span className="text-slate-300 text-[11px]">
                      Los 95 registros históricos de nómina están en Agosto, Septiembre y Octubre de 2026. Haz clic para ir al corte correspondiente:
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => applyCorteSelection('corte12', 9, 2026)}
                    className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-lg text-xs cursor-pointer shadow-md"
                  >
                    📌 Octubre Corte 12
                  </button>
                  <button
                    onClick={() => applyCorteSelection('corte27', 9, 2026)}
                    className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-lg text-xs cursor-pointer shadow-md"
                  >
                    📌 Octubre Corte 27
                  </button>
                  <button
                    onClick={() => applyCorteSelection('all')}
                    className="px-3 py-1.5 bg-[#00f0b5] hover:bg-[#25ffcb] text-slate-950 font-black rounded-lg text-xs cursor-pointer shadow-md"
                  >
                    🌐 Ver Todo (95)
                  </button>
                </div>
              </div>
            )}

            {/* Quick Workers Horizontal Slices for Multi-user Dashboard */}
            <div className="overflow-x-auto pb-2">
              <div className="flex gap-2.5 min-w-max">
                <button
                  onClick={() => {
                    setActiveWorkerTab('__global');
                    setFilterWorker('__all');
                  }}
                  className={`px-4 py-2 text-xs font-mono uppercase font-black rounded-xl border transition-all flex items-center gap-2 cursor-pointer ${
                    activeWorkerTab === '__global' 
                      ? 'bg-[#00f0b5] border-[#00f0b5] text-slate-950 shadow-[0_0_15px_rgba(0,240,181,0.35)]' 
                      : 'bg-[#04242a] border-[#00f0b5]/25 text-slate-300 hover:bg-[#052f37]'
                  }`}
                >
                  <span>★</span>
                  <span>Todos los Colaboradores ({records.length} turnos)</span>
                </button>

                {Object.keys(recordsIndexedByWorker).map(k => {
                  const chunk = recordsIndexedByWorker[k];
                  const totals = getCumulativeAggregateStats(chunk.regs);
                  return (
                    <button
                      key={k}
                      onClick={() => {
                        setActiveWorkerTab(k);
                        setFilterWorker(chunk.nom);
                      }}
                      className={`px-3.5 py-2 text-xs font-mono uppercase rounded-xl border transition-all flex items-center gap-2 cursor-pointer ${
                        activeWorkerTab === k 
                          ? 'bg-[#00f0b5] border-[#00f0b5] text-slate-950 font-black shadow-[0_0_15px_rgba(0,240,181,0.35)]' 
                          : 'bg-[#04242a] border-[#00f0b5]/25 text-slate-300 hover:bg-[#052f37]'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-md bg-slate-950 text-[#00f0b5] text-[9.5px] font-black flex items-center justify-center border border-[#00f0b5]/30">
                        {initialsOf(chunk.nom)}
                      </span>
                      <span className="font-bold">{chunk.nom.split(' ')[0]}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                        activeWorkerTab === k ? 'bg-slate-950 text-[#00f0b5]' : 'bg-slate-950/70 text-[#00f0b5] border border-[#00f0b5]/20'
                      }`}>
                        {totals.netas.toFixed(1)}h
                      </span>
                      <span className="text-[9px] text-slate-400">
                        ({chunk.regs.length})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* If Single Worker tab is active, show cumulative aggregate report first */}
            {activeWorkerTab !== '__global' && activeWorkerAggregateStats && recordsIndexedByWorker[activeWorkerTab] && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg animate-fadeIn">
                <div className="bg-slate-950 p-5 border-b border-slate-850 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 bg-cyan-500 text-slate-950 font-mono font-black text-xl rounded-xl flex items-center justify-center">
                      {initialsOf(recordsIndexedByWorker[activeWorkerTab].nom)}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white uppercase">{recordsIndexedByWorker[activeWorkerTab].nom}</h3>
                      <p className="text-[10px] font-mono text-slate-400 uppercase mt-0.5">
                        {recordsIndexedByWorker[activeWorkerTab].car} &middot; {recordsIndexedByWorker[activeWorkerTab].are}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[28px] font-mono font-black text-cyan-400 block drop-shadow-[0_0_10px_rgba(34,211,238,0.25)]">
                      {activeWorkerAggregateStats.netas.toFixed(2)}h
                    </span>
                    <span className="text-[9px] font-mono text-cyan-500 uppercase tracking-widest mt-0.5 block">
                      HORAS NETAS TOTALES ACUMULADAS
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-7 gap-px bg-slate-800 text-center font-mono">
                  <div className="bg-slate-900 p-4">
                    <span className="text-[10px] text-slate-500 uppercase block">TRABAJADAS</span>
                    <span className="text-lg font-bold text-slate-300 mt-1 block">{activeWorkerAggregateStats.hT.toFixed(2)}h</span>
                  </div>
                  <div className="bg-slate-900 p-4">
                    <span className="text-[10px] text-slate-500 uppercase block">EXTRA TOTAL</span>
                    <span className="text-lg font-bold text-slate-300 mt-1 block">{activeWorkerAggregateStats.extraTotal.toFixed(2)}h</span>
                  </div>
                  <div className="bg-slate-900 p-4">
                    <span className="text-[10px] text-slate-500 uppercase block">EXTRA DIURNA</span>
                    <span className="text-lg font-bold text-cyan-400 mt-1 block">{activeWorkerAggregateStats.extDiurna.toFixed(2)}h</span>
                  </div>
                  <div className="bg-slate-900 p-4">
                    <span className="text-[10px] text-slate-500 uppercase block">EXTRA NOCT</span>
                    <span className="text-lg font-bold text-purple-400 mt-1 block">{activeWorkerAggregateStats.extNocturna.toFixed(2)}h</span>
                  </div>
                  <div className="bg-slate-900 p-4">
                    <span className="text-[10px] text-slate-500 uppercase block">RECARG NOCT</span>
                    <span className="text-lg font-bold text-rose-400 mt-1 block">{activeWorkerAggregateStats.recNoct.toFixed(2)}h</span>
                  </div>
                  <div className="bg-slate-900 p-4">
                    <span className="text-[10px] text-slate-500 uppercase block">DOM / FEST</span>
                    <span className="text-lg font-bold text-amber-400 mt-1 block">{activeWorkerAggregateStats.domFest.toFixed(2)}h</span>
                  </div>
                  <div className="bg-slate-950 p-4 border border-cyan-500/30">
                    <span className="text-[10px] text-emerald-400 uppercase block font-semibold">NETAS A PAGAR</span>
                    <span className="text-lg font-bold text-emerald-400 mt-1 block">{activeWorkerAggregateStats.netas.toFixed(2)}h</span>
                  </div>
                </div>
              </div>
            )}

            {/* Warning banner about filtered-out records */}
            {records.length > filteredRecords.length && historyRangeType !== 'all' && (
              <div className="bg-slate-950/40 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shrink-0">
                    <AlertTriangle className="w-4 h-4 animate-bounce" />
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-white uppercase font-mono">Registros Ocultos</h5>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                      Tienes <b>{records.length - filteredRecords.length} turnos</b> registrados en otros períodos de tiempo que están ocultos por el filtro activo.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryRangeType('all')}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-4 py-2 rounded-lg text-[10px] font-mono font-black uppercase tracking-wider shadow-lg hover:shadow-cyan-500/25 transition-all w-full md:w-auto text-center shrink-0"
                >
                  Ver Todo el Historial
                </button>
              </div>
            )}

            {/* List Table of individual entries */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg animate-fadeIn">
              <div className="px-5 py-4 bg-slate-950/60 border-b border-slate-850 flex flex-wrap justify-between items-center text-xs font-mono gap-2">
                <div className="flex flex-col gap-1.5">
                  <span className="uppercase font-bold text-cyan-400">Desglose de Turnos del Período Integrado</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{getHistoryRangeLabel()}</span>
                </div>
                <span className="text-slate-400">Coincidentes con Filtro: <b className="text-white">{filteredRecords.length} turnos</b></span>
              </div>

              {filteredRecords.length > 0 ? (
                historyViewMode === 'table' ? (
                  <div className="overflow-x-auto font-mono text-[11px]">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                          <th className="p-4">Trabajador</th>
                          <th className="p-4">Fecha</th>
                          <th className="p-4">Tipo Día</th>
                          <th className="p-4 text-center">Reloj (E / S)</th>
                          <th className="p-4 text-center">H. Trabajadas</th>
                          <th className="p-4 text-center">H. Extra Bruta</th>
                          <th className="p-4 text-center">Diurna</th>
                          <th className="p-4 text-center">Nocturna</th>
                          <th className="p-4 text-center">Recargo N.</th>
                          <th className="p-4 text-center">Dom / Fest</th>
                          <th className="p-4 text-center">Compensadas</th>
                          <th className="p-4 text-center text-cyan-400 font-bold">H. Netas</th>
                          <th className="p-4 text-center">Estado Pago</th>
                          <th className="p-4 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {filteredRecords.map(r => (
                          <tr key={r.id} className="hover:bg-slate-850/40 transition-colors">
                            <td className="p-4 font-bold text-white uppercase">
                              {r.nom}
                              <span className="text-[9px] text-slate-500 font-normal block uppercase">{r.car || 'Operario'}</span>
                            </td>
                            <td className="p-4 text-slate-300 font-mono">{r.fec}</td>
                            <td className="p-4">
                              <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${
                                r.tipo === 'ord' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                                r.tipo === 'sab' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                r.tipo === 'dom' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}>
                                {r.tipo === 'ord' ? 'Ordinario' : r.tipo === 'sab' ? 'Sábado' : r.tipo === 'dom' ? 'Dominica' : 'Festivo'}
                              </span>
                            </td>
                            <td className="p-4 text-center text-slate-300 whitespace-nowrap">{r._ent} a {r._sal}</td>
                            <td className="p-4 text-center font-bold text-slate-200">{formatHoursHuman(r.hT)}</td>
                            <td className="p-4 text-center text-slate-300 font-bold">{r.extraTotal.toFixed(2)}h</td>
                            <td className="p-4 text-center text-cyan-400">{r.extDiurna > 0 ? `${r.extDiurna.toFixed(2)}h` : '—'}</td>
                            <td className="p-4 text-center text-purple-400">{r.extNocturna > 0 ? `${r.extNocturna.toFixed(2)}h` : '—'}</td>
                            <td className="p-4 text-center text-rose-400">{r.recNoct > 0 ? `${r.recNoct.toFixed(2)}h` : '—'}</td>
                            <td className="p-4 text-center text-amber-400">{r.domFest > 0 ? `${r.domFest.toFixed(2)}h` : '—'}</td>
                            <td className="p-4 text-center text-slate-500 font-semibold">{r.comp > 0 ? `-${r.comp.toFixed(2)}h` : '—'}</td>
                            <td className="p-4 text-center font-extrabold text-white text-xs bg-cyan-950/20 border-l border-r border-slate-800 text-cyan-400">
                              {r.netas.toFixed(2)}h
                            </td>
                            <td className="p-4 text-center whitespace-nowrap">
                              {r.pagado ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleShiftPayment(r.id)}
                                  className="px-2 py-1 rounded text-[9px] font-bold uppercase font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-rose-950/40 hover:text-rose-300 hover:border-rose-500/40 transition-all cursor-pointer inline-flex items-center gap-1 shadow-sm"
                                  title={`Amarrado como PAGADO${r.fechaPago ? ` el ${r.fechaPago}` : ''}. Clic para desmarcar y permitir corrección.`}
                                >
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Pagado {r.fechaPago ? `(${r.fechaPago.slice(5)})` : ''} 🔒</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleToggleShiftPayment(r.id)}
                                  className="px-2 py-1 rounded text-[9px] font-bold uppercase font-mono bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-emerald-950/40 hover:text-emerald-300 hover:border-emerald-500/40 transition-all cursor-pointer inline-flex items-center gap-1 shadow-sm"
                                  title="Turno pendiente por liquidar. Clic para amarrar como pagado."
                                >
                                  <span>⏳ Pendiente</span>
                                </button>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex justify-center gap-1.5">
                                <button
                                  onClick={() => handleEditRecord(r)}
                                  className="p-1.5 hover:bg-slate-700/50 text-cyan-400 rounded transition-colors"
                                  title="Editar turno (corregir error)"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteRecord(r.id)}
                                  className="p-1.5 hover:bg-rose-950/45 text-rose-400 rounded transition-colors"
                                  title="Eliminar turno"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-950 border-t-2 border-cyan-500/30 text-xs text-white uppercase font-bold">
                          <td className="p-4">TOTAL ACUMULADO</td>
                          <td colSpan={3}></td>
                          <td className="p-4 text-center">
                            {filteredRecords.reduce((acc, r) => acc + r.hT, 0).toFixed(1)}h
                          </td>
                          <td className="p-4 text-center text-slate-300">
                            {filteredRecords.reduce((acc, r) => acc + r.extraTotal, 0).toFixed(1)}h
                          </td>
                          <td className="p-4 text-center text-cyan-400">
                            {filteredRecords.reduce((acc, r) => acc + r.extDiurna, 0).toFixed(1)}h
                          </td>
                          <td className="p-4 text-center text-purple-400">
                            {filteredRecords.reduce((acc, r) => acc + r.extNocturna, 0).toFixed(1)}h
                          </td>
                          <td className="p-4 text-center text-rose-400">
                            {filteredRecords.reduce((acc, r) => acc + r.recNoct, 0).toFixed(1)}h
                          </td>
                          <td className="p-4 text-center text-amber-400">
                            {filteredRecords.reduce((acc, r) => acc + r.domFest, 0).toFixed(1)}h
                          </td>
                          <td className="p-4 text-center text-rose-500">
                            {filteredRecords.reduce((acc, r) => acc + r.comp, 0).toFixed(1)}h
                          </td>
                          <td className="p-4 text-center text-emerald-400 font-extrabold text-sm bg-cyan-950/40 border-l border-r border-slate-850">
                            {filteredRecords.reduce((acc, r) => acc + r.netas, 0).toFixed(2)}h
                          </td>
                          <td className="p-4 text-center text-[10px] font-mono text-slate-300 whitespace-nowrap">
                            {filteredRecords.filter(r => !r.pagado).length} pend / {filteredRecords.filter(r => r.pagado).length} pag
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  /* Cards Layout */
                  <div className="p-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {filteredRecords.map(r => (
                      <div key={r.id} className="bg-slate-950/40 border border-slate-800 rounded-xl p-5 hover:border-cyan-500/30 transition-all flex flex-col justify-between shadow-lg relative group">
                        
                        {/* Card Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-850/60">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_#22d3ee]" />
                            <span className="text-sm font-bold text-slate-100 font-mono">{r.fec}</span>
                            <span className={`px-2.5 py-0.5 rounded text-[9px] font-bold uppercase font-mono ${
                              r.tipo === 'ord' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                              r.tipo === 'sab' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                              r.tipo === 'dom' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                              'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            }`}>
                              {r.tipo === 'ord' ? 'Ordinario' : r.tipo === 'sab' ? 'Sábado' : r.tipo === 'dom' ? 'Dominica' : 'Festivo'}
                            </span>

                            {r.comp > 0 && (
                              <span className="bg-rose-500/15 border border-rose-500/30 text-rose-400 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono">
                                -{r.comp.toFixed(1)}h
                              </span>
                            )}

                            {/* Amarre y Corrección de Pago */}
                            {r.pagado ? (
                              <button
                                type="button"
                                onClick={() => handleToggleShiftPayment(r.id)}
                                className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-rose-950/40 hover:text-rose-300 hover:border-rose-500/40 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                                title={`Turno amarrado como PAGADO${r.fechaPago ? ` el ${r.fechaPago}` : ''}. Clic para desmarcar y permitir corrección.`}
                              >
                                <Check className="w-2.5 h-2.5 text-emerald-400" />
                                <span>Pagado {r.fechaPago ? `(${r.fechaPago.slice(5)})` : ''} 🔒</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleToggleShiftPayment(r.id)}
                                className="px-2 py-0.5 rounded text-[9px] font-bold font-mono bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-emerald-950/40 hover:text-emerald-300 hover:border-emerald-500/40 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                                title="Turno pendiente por liquidar. Clic para amarrar como pagado."
                              >
                                <span>⏳ Pendiente</span>
                              </button>
                            )}
                          </div>

                          <div className="flex gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEditRecord(r)}
                              className="p-1.5 hover:bg-slate-800 text-cyan-400 rounded transition-colors"
                              title="Editar turno (corregir error)"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRecord(r.id)}
                              className="p-1.5 hover:bg-rose-950/45 text-rose-400 rounded transition-colors"
                              title="Eliminar turno"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Shift Info Subtitle */}
                        <div className="pt-3 text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-bold uppercase text-white font-mono">{r.nom}</span>
                          <span className="text-slate-600">&middot;</span>
                          <span>Entrada <b className="text-slate-200">{r._ent}</b> → Salida <b className="text-slate-200">{r._sal}</b></span>
                          <span className="text-slate-600">&middot;</span>
                          <span className="font-mono bg-slate-900/80 border border-slate-800 px-2 py-0.5 rounded text-slate-350">
                            {formatHoursHuman(r.hT)} trabajadas
                          </span>
                        </div>

                        {/* Surcharges Grid (Replicates previous app structure perfectly) */}
                        <div className="grid grid-cols-3 gap-px bg-slate-850 border border-slate-800 rounded-lg overflow-hidden mt-4 text-center">
                          {/* 1. EXTRA */}
                          <div className="bg-slate-900/40 p-2.5 flex flex-col justify-center min-h-[50px]">
                            <span className="text-xs font-bold text-slate-200 font-mono">
                              {r.extraTotal > 0 ? r.extraTotal.toFixed(2) : '—'}
                            </span>
                            <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider mt-0.5 font-bold">EXTRA</span>
                          </div>
                          
                          {/* 2. DIURNA */}
                          <div className="bg-slate-900/40 p-2.5 flex flex-col justify-center min-h-[50px]">
                            <span className="text-xs font-bold text-cyan-400 font-mono">
                              {(r.extDiurna + r.extraOrd) > 0 ? (r.extDiurna + r.extraOrd).toFixed(2) : '—'}
                            </span>
                            <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider mt-0.5 font-bold">DIURNA</span>
                          </div>

                          {/* 3. NOCTURNA */}
                          <div className="bg-slate-900/40 p-2.5 flex flex-col justify-center min-h-[50px]">
                            <span className="text-xs font-bold text-purple-400 font-mono">
                              {r.extNocturna > 0 ? r.extNocturna.toFixed(2) : '—'}
                            </span>
                            <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider mt-0.5 font-bold">NOCT.</span>
                          </div>

                          {/* 4. RECARGO NOCTURNO */}
                          <div className="bg-slate-900/40 p-2.5 flex flex-col justify-center min-h-[50px]">
                            <span className="text-xs font-bold text-rose-400 font-mono">
                              {r.recNoct > 0 ? r.recNoct.toFixed(2) : '—'}
                            </span>
                            <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider mt-0.5 font-bold">REC.N</span>
                          </div>

                          {/* 5. DOMINICAL/FESTIVO */}
                          <div className="bg-slate-900/40 p-2.5 flex flex-col justify-center min-h-[50px]">
                            <span className="text-xs font-bold text-amber-400 font-mono">
                              {r.domFest > 0 ? r.domFest.toFixed(2) : '—'}
                            </span>
                            <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider mt-0.5 font-bold">DOM/F</span>
                          </div>

                          {/* 6. NETAS */}
                          <div className="bg-slate-900/90 p-2.5 flex flex-col justify-center min-h-[50px] border-l border-slate-800 bg-cyan-950/20">
                            <span className="text-sm font-black text-emerald-400 font-mono">
                              {r.netas.toFixed(2)}
                            </span>
                            <span className="text-[8px] font-mono text-cyan-400 uppercase tracking-wider mt-0.5 font-bold">NETAS</span>
                          </div>
                        </div>

                        {/* Optional Deducted Hours Footer Info */}
                        {r.comp > 0 && (
                          <div className="mt-3 p-2 bg-rose-950/20 border border-rose-900/25 rounded-md text-[10px] text-rose-400 font-mono flex items-start gap-1.5">
                            <span className="font-bold">⬇ Descuento:</span>
                            <span>{r.comp.toFixed(1)}h {r.mot ? `(${r.mot})` : ''}</span>
                          </div>
                        )}

                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                  <Archive className="w-10 h-10 text-slate-700 animate-pulse" />
                  <p className="text-xs text-slate-500 uppercase max-w-[280px]">
                    {historyRangeType === 'all' 
                      ? 'No hay turnos registrados en la base de datos para los filtros de trabajador activos.'
                      : 'Sin registros que coincidan con la fecha y el rango seleccionados. Pruebe cambiando la Fecha de Referencia o seleccionando "Ver Todo".'
                    }
                  </p>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 3: DIRECTORIO Y NÓMINA DE PERSONAL */}
        {activeSubTab === 'personal' && (
          <div className="space-y-6 font-mono text-xs">
            {/* Top KPI Header for Workforce */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card-3d-teal p-4 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Colaboradores Activos</span>
                  <span className="text-2xl font-black text-white text-relief-card mt-0.5 block">{workers.length}</span>
                  <span className="text-[9px] text-[#00f0b5] uppercase mt-0.5 block">100% en Nómina Activa</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#00f0b5]/15 border border-[#00f0b5]/40 flex items-center justify-center text-[#00f0b5]">
                  <Users className="w-5 h-5" />
                </div>
              </div>

              <div className="card-3d-teal p-4 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Turnos Registrados</span>
                  <span className="text-2xl font-black text-cyan-300 text-relief-card mt-0.5 block">{records.length}</span>
                  <span className="text-[9px] text-slate-400 uppercase mt-0.5 block">Historial Consolidado</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <Archive className="w-5 h-5" />
                </div>
              </div>

              <div className="card-3d-teal p-4 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">H. Extras Netas Totales</span>
                  <span className="text-2xl font-black text-[#00f0b5] text-relief-card mt-0.5 block">
                    {records.reduce((acc, r) => acc + r.netas, 0).toFixed(1)}h
                  </span>
                  <span className="text-[9px] text-emerald-400 uppercase mt-0.5 block">Horas Liquidables</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Clock className="w-5 h-5" />
                </div>
              </div>

              <div className="card-3d-teal p-4 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Franja Nocturna Ley 2466</span>
                  <span className="text-xl font-black text-amber-400 text-relief-card mt-0.5 block">19:00 - 06:00</span>
                  <span className="text-[9px] text-amber-300/80 uppercase mt-0.5 block">Cortes 12 y 27</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Sparkles className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Actions Bar & Worker Search */}
            <div className="bg-[#02161a] border border-[#00f0b5]/25 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg">
              <div className="flex-1 w-full md:w-auto relative">
                <input
                  type="text"
                  value={workerFilterSearch}
                  onChange={(e) => setWorkerFilterSearch(e.target.value)}
                  placeholder="BUSCAR COLABORADOR POR NOMBRE, CARGO O ÁREA..."
                  className="w-full bg-[#04242a] border border-[#00f0b5]/30 text-white rounded-lg px-4 py-2.5 text-xs font-mono uppercase placeholder-slate-500 focus:border-[#00f0b5] outline-none"
                />
                {workerFilterSearch && (
                  <button
                    onClick={() => setWorkerFilterSearch('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-white font-mono text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
                <button
                  onClick={() => {
                    setEditingWorkerId(null);
                    setNewWorkerNom('');
                    setNewWorkerCar('');
                    setNewWorkerAre('');
                    setIsWorkerModalOpen(true);
                  }}
                  className="bg-[#00f0b5] hover:bg-[#00dfc0] text-slate-950 font-black px-4 py-2.5 rounded-lg text-xs uppercase tracking-wider flex items-center gap-2 shadow-[0_0_15px_rgba(0,240,181,0.3)] transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nuevo Trabajador</span>
                </button>
              </div>
            </div>

            {/* Workers Directory 3D Grid */}
            {(() => {
              const displayedWorkers = workers.filter(w => {
                if (!workerFilterSearch.trim()) return true;
                const q = workerFilterSearch.toLowerCase();
                return w.nom.toLowerCase().includes(q) || (w.car || '').toLowerCase().includes(q) || (w.are || '').toLowerCase().includes(q);
              });

              if (displayedWorkers.length === 0) {
                return (
                  <div className="card-3d-teal p-12 text-center rounded-xl space-y-3">
                    <Users className="w-10 h-10 text-slate-600 mx-auto animate-pulse" />
                    <p className="text-slate-400 uppercase text-xs">No se encontraron trabajadores que coincidan con la búsqueda.</p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {displayedWorkers.map(w => {
                    const wRecords = records.filter(r => r.nom.toLowerCase() === w.nom.toLowerCase());
                    const wStats = getCumulativeAggregateStats(wRecords);
                    return (
                      <div
                        key={w.id}
                        className="card-3d-teal rounded-2xl p-5 flex flex-col justify-between space-y-4 relative group hover:border-[#00f0b5] transition-all"
                      >
                        {/* Worker Header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3.5">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#02161a] to-[#042d35] border-2 border-[#00f0b5] text-[#00f0b5] font-black text-lg flex items-center justify-center shadow-[0_0_15px_rgba(0,240,181,0.25)]">
                              {initialsOf(w.nom)}
                            </div>
                            <div>
                              <h3 className="font-extrabold text-white uppercase text-sm text-relief-card leading-tight">
                                {w.nom}
                              </h3>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                <span className="bg-[#00f0b5]/15 text-[#00f0b5] border border-[#00f0b5]/30 text-[9px] px-2 py-0.5 rounded font-black uppercase">
                                  {w.car || 'OPERARIO'}
                                </span>
                                <span className="bg-slate-900/80 text-slate-300 border border-slate-700 text-[9px] px-2 py-0.5 rounded font-mono uppercase">
                                  {w.are || 'LOGÍSTICA'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEditWorker(w)}
                              className="p-1.5 hover:bg-slate-800 text-[#00f0b5] rounded-md transition-colors"
                              title="Editar Ficha de Trabajador"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteWorker(w.id)}
                              className="p-1.5 hover:bg-rose-950/40 text-rose-400 rounded-md transition-colors"
                              title="Eliminar de Nómina"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Stats Matrix 4-Cols */}
                        <div className="grid grid-cols-4 gap-px bg-slate-900/90 border border-[#00f0b5]/20 rounded-xl overflow-hidden text-center">
                          <div className="bg-[#032026] p-2.5 flex flex-col justify-center">
                            <span className="text-xs font-black text-white">{wRecords.length}</span>
                            <span className="text-[8px] text-slate-400 uppercase tracking-wider mt-0.5 font-bold">TURNOS</span>
                          </div>

                          <div className="bg-[#032026] p-2.5 flex flex-col justify-center">
                            <span className="text-xs font-black text-[#00f0b5]">
                              {(wStats.extDiurna + wStats.extraOrd).toFixed(1)}h
                            </span>
                            <span className="text-[8px] text-slate-400 uppercase tracking-wider mt-0.5 font-bold">DIURNAS</span>
                          </div>

                          <div className="bg-[#032026] p-2.5 flex flex-col justify-center">
                            <span className="text-xs font-black text-purple-300">
                              {(wStats.extNocturna + wStats.recNoct + wStats.domFest).toFixed(1)}h
                            </span>
                            <span className="text-[8px] text-slate-400 uppercase tracking-wider mt-0.5 font-bold">NOCT/DOM</span>
                          </div>

                          <div className="bg-[#042d35] p-2.5 flex flex-col justify-center border-l border-[#00f0b5]/30">
                            <span className="text-sm font-black text-[#00f0b5] drop-shadow-[0_0_8px_rgba(0,240,181,0.3)]">
                              {wStats.netas.toFixed(2)}h
                            </span>
                            <span className="text-[8px] text-[#00f0b5] uppercase tracking-wider mt-0.5 font-black">H. NETAS</span>
                          </div>
                        </div>

                        {/* Interactive Action Shortcuts */}
                        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#00f0b5]/15">
                          <button
                            onClick={() => {
                              setActiveWorkerTab(w.nom.toLowerCase());
                              setFilterWorker(w.nom);
                              setHistoryRangeType('all');
                              setActiveSubTab('historial');
                            }}
                            className="bg-[#02161a] hover:bg-[#04242a] border border-[#00f0b5]/30 text-white font-bold py-2 rounded-lg text-[10px] uppercase flex items-center justify-center gap-1 transition-all cursor-pointer"
                          >
                            <Archive className="w-3 h-3 text-[#00f0b5]" />
                            <span>Ver Turnos</span>
                          </button>

                          <button
                            onClick={() => {
                              setPersonalSearchWorker(w.nom);
                              setActiveSubTab('consulta');
                            }}
                            className="bg-[#02161a] hover:bg-[#04242a] border border-[#00f0b5]/30 text-white font-bold py-2 rounded-lg text-[10px] uppercase flex items-center justify-center gap-1 transition-all cursor-pointer"
                          >
                            <UserCheck className="w-3 h-3 text-[#00f0b5]" />
                            <span>Nómina</span>
                          </button>

                          <button
                            onClick={() => {
                              handleSelectMasterWorker(w.nom);
                              setActiveSubTab('registrar');
                            }}
                            className="bg-[#00f0b5]/15 hover:bg-[#00f0b5]/25 border border-[#00f0b5]/40 text-[#00f0b5] font-black py-2 rounded-lg text-[10px] uppercase flex items-center justify-center gap-1 transition-all cursor-pointer"
                          >
                            <Plus className="w-3 h-3 text-[#00f0b5]" />
                            <span>+ Turno</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Modal for Creating or Editing Worker */}
            {isWorkerModalOpen && (
              <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[12000] flex items-center justify-center p-4">
                <div className="bg-[#032026] border-2 border-[#00f0b5] rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl relative font-mono text-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-[#00f0b5]/30">
                    <h4 className="text-base font-extrabold text-[#00f0b5] uppercase tracking-wide flex items-center gap-2">
                      <UserCheck className="w-5 h-5 text-[#00f0b5]" />
                      {editingWorkerId ? 'Modificar Ficha de Colaborador' : 'Registrar Nuevo Trabajador'}
                    </h4>
                    <button
                      onClick={() => {
                        setIsWorkerModalOpen(false);
                        setEditingWorkerId(null);
                        setNewWorkerNom('');
                        setNewWorkerCar('');
                        setNewWorkerAre('');
                      }}
                      className="text-slate-400 hover:text-white font-bold text-sm"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleSaveWorker} className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-slate-400 uppercase tracking-widest text-[9px] font-bold">
                        Nombre Completo del Trabajador *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: Pedro Valenzuela"
                        value={newWorkerNom}
                        onChange={(e) => setNewWorkerNom(e.target.value)}
                        className="bg-[#02161a] border border-[#00f0b5]/40 text-white rounded-lg p-3 text-xs focus:border-[#00f0b5] outline-none uppercase font-bold"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-slate-400 uppercase tracking-widest text-[9px] font-bold">
                        Cargo / Rol en Planta *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej: Auxiliar Logístico / Conductor"
                        value={newWorkerCar}
                        onChange={(e) => setNewWorkerCar(e.target.value)}
                        className="bg-[#02161a] border border-[#00f0b5]/40 text-white rounded-lg p-3 text-xs focus:border-[#00f0b5] outline-none uppercase font-bold"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-slate-400 uppercase tracking-widest text-[9px] font-bold">
                        Área / Proceso
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Logística y Despacho"
                        value={newWorkerAre}
                        onChange={(e) => setNewWorkerAre(e.target.value)}
                        className="bg-[#02161a] border border-[#00f0b5]/40 text-white rounded-lg p-3 text-xs focus:border-[#00f0b5] outline-none uppercase font-bold"
                      />
                    </div>

                    <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#00f0b5]/20">
                      <button
                        type="button"
                        onClick={() => {
                          setIsWorkerModalOpen(false);
                          setEditingWorkerId(null);
                          setNewWorkerNom('');
                          setNewWorkerCar('');
                          setNewWorkerAre('');
                        }}
                        className="px-4 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold uppercase text-[10px] cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="bg-[#00f0b5] hover:bg-[#00dfc0] text-slate-950 font-black uppercase px-5 py-2.5 rounded-lg text-xs flex items-center gap-2 shadow-[0_0_15px_rgba(0,240,181,0.3)] transition-all cursor-pointer"
                      >
                        <Save className="w-4 h-4" />
                        <span>{editingWorkerId ? 'Actualizar Ficha' : 'Guardar Trabajador'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3.5: CONSULTA PERSONAL */}
        {activeSubTab === 'consulta' && (
          <div className="space-y-6">
            
            {/* Worker Selector Card */}
            <div className="bg-slate-900/60 p-5 border border-slate-850 rounded-xl flex flex-wrap gap-4 items-end justify-between">
              <div className="flex flex-wrap gap-4 items-center w-full md:w-auto">
                <div className="flex flex-col gap-1.5 w-full md:w-64">
                  <span className="text-xs font-mono text-slate-500 uppercase">Consultar Trabajador</span>
                  <select
                    value={personalSearchWorker}
                    onChange={(e) => setPersonalSearchWorker(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-cyan-400 rounded-md p-2.5 text-xs font-mono focus:border-cyan-400 outline-none w-full"
                  >
                    <option value="">-- Seleccione un Trabajador --</option>
                    {workers.map(w => (
                      <option key={w.id} value={w.nom}>{w.nom}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-mono text-slate-500 uppercase">Desde (Opcional)</span>
                  <input
                    type="date"
                    value={personalStartDate}
                    onChange={(e) => setPersonalStartDate(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 rounded-md p-2 text-xs font-mono focus:border-cyan-400 outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-mono text-slate-500 uppercase">Hasta (Opcional)</span>
                  <input
                    type="date"
                    value={personalEndDate}
                    onChange={(e) => setPersonalEndDate(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-300 rounded-md p-2 text-xs font-mono focus:border-cyan-400 outline-none"
                  />
                </div>
              </div>

              {personalSearchWorker && (
                <div className="flex gap-2 w-full md:w-auto justify-end">
                  <button
                    onClick={() => {
                      setPersonalStartDate('');
                      setPersonalEndDate('');
                    }}
                    className="bg-slate-950 border border-slate-850 px-3 py-2 rounded text-[10px] font-mono text-slate-400 hover:text-slate-100 transition-all"
                  >
                    Limpiar Fechas
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="bg-cyan-500 text-slate-950 font-bold px-4 py-2 rounded text-xs font-mono hover:bg-cyan-400 transition-all flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Imprimir Reporte
                  </button>
                </div>
              )}
            </div>

            {personalSearchWorker ? (() => {
              // Get worker info
              const workerObj = workers.find(w => w.nom === personalSearchWorker);
              
              // Filter their records
              const personalRecords = records.filter(r => {
                const isWorker = r.nom.toLowerCase() === personalSearchWorker.toLowerCase();
                if (!isWorker) return false;
                
                if (personalStartDate && r.fec < personalStartDate) return false;
                if (personalEndDate && r.fec > personalEndDate) return false;
                
                return true;
              }).sort((a, b) => b.fec.localeCompare(a.fec)); // most recent first

              const personalStats = getCumulativeAggregateStats(personalRecords);

              return (
                <div className="space-y-6 animate-fadeIn">
                  {/* Worker Card Banner */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                    <div className="bg-slate-950 p-6 border-b border-slate-850 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-cyan-500 text-slate-950 font-mono font-black text-2xl rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.25)]">
                          {initialsOf(personalSearchWorker)}
                        </div>
                        <div>
                          <h3 className="text-lg font-black text-white uppercase tracking-tight">{personalSearchWorker}</h3>
                          <p className="text-xs font-mono text-cyan-400 uppercase mt-1">
                            {workerObj?.car || 'Operario'} &middot; {workerObj?.are || 'Logística'}
                          </p>
                        </div>
                      </div>

                      <div className="text-left md:text-right">
                        <span className="text-3xl font-mono font-black text-emerald-400 block drop-shadow-[0_0_15px_rgba(52,211,153,0.2)]">
                          {personalStats.netas.toFixed(2)}h
                        </span>
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mt-0.5 block font-bold">
                          Total Horas Extras Netas Liquidables
                        </span>
                      </div>
                    </div>

                    {/* Stats Matrix */}
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-slate-800 text-center font-mono text-xs">
                      <div className="bg-slate-900 p-4">
                        <span className="text-[10px] text-slate-500 uppercase block">H. TRABAJADAS</span>
                        <span className="text-md font-bold text-slate-300 mt-1 block">{personalStats.hT.toFixed(2)}h</span>
                      </div>
                      <div className="bg-slate-900 p-4">
                        <span className="text-[10px] text-slate-500 uppercase block">LIMITE BASE</span>
                        <span className="text-md font-bold text-slate-400 mt-1 block">{personalStats.base.toFixed(2)}h</span>
                      </div>
                      <div className="bg-slate-900 p-4">
                        <span className="text-[10px] text-slate-500 uppercase block">EXTRA TOTAL</span>
                        <span className="text-md font-bold text-slate-300 mt-1 block">{personalStats.extraTotal.toFixed(2)}h</span>
                      </div>
                      <div className="bg-slate-900 p-4">
                        <span className="text-[10px] text-slate-400 uppercase block">DIURNAS / ORDINARIAS</span>
                        <span className="text-md font-bold text-cyan-400 mt-1 block">{(personalStats.extDiurna + personalStats.extraOrd).toFixed(2)}h</span>
                      </div>
                      <div className="bg-slate-900 p-4">
                        <span className="text-[10px] text-slate-400 uppercase block">NOCTURNAS / RECARGOS</span>
                        <span className="text-md font-bold text-purple-400 mt-1 block">{(personalStats.extNocturna + personalStats.recNoct).toFixed(2)}h</span>
                      </div>
                      <div className="bg-slate-900 p-4">
                        <span className="text-[10px] text-slate-400 uppercase block">DOM / FEST</span>
                        <span className="text-md font-bold text-amber-400 mt-1 block">{personalStats.domFest.toFixed(2)}h</span>
                      </div>
                    </div>
                  </div>

                  {/* Personal Table List */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                    <div className="px-5 py-4 bg-slate-950/60 border-b border-slate-850 flex justify-between items-center text-xs font-mono">
                      <span className="uppercase font-bold text-cyan-400">Detalle de Turnos Reportados</span>
                      <span className="text-slate-400">Coincidentes: <b className="text-white">{personalRecords.length} días</b></span>
                    </div>

                    {personalRecords.length > 0 ? (
                      <div className="overflow-x-auto font-mono text-[11px]">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                              <th className="p-4">Fecha</th>
                              <th className="p-4">Tipo de Día</th>
                              <th className="p-4 text-center">Horario (E / S)</th>
                              <th className="p-4 text-center">H. Trabajadas</th>
                              <th className="p-4 text-center">Base</th>
                              <th className="p-4 text-center">Extra Bruta</th>
                              <th className="p-4 text-center">Deducidas / Compensadas</th>
                              <th className="p-4 text-center text-cyan-400 font-bold">H. Netas a Pagar</th>
                              <th className="p-4 text-center">Novedad</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850">
                            {personalRecords.map(r => (
                              <tr key={r.id} className="hover:bg-slate-850/40 transition-colors">
                                <td className="p-4 font-bold text-white">{r.fec}</td>
                                <td className="p-4">
                                  <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${
                                    r.tipo === 'ord' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                                    r.tipo === 'sab' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                    r.tipo === 'dom' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                    'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  }`}>
                                    {r.tipo === 'ord' ? 'Ordinario' : r.tipo === 'sab' ? 'Sábado' : r.tipo === 'dom' ? 'Dominical' : 'Festivo'}
                                  </span>
                                </td>
                                <td className="p-4 text-center text-slate-300">{r._ent} a {r._sal}</td>
                                <td className="p-4 text-center text-slate-200 font-bold">{formatHoursHuman(r.hT)}</td>
                                <td className="p-4 text-center text-slate-400">{r.base}h</td>
                                <td className="p-4 text-center text-slate-300">{r.extraTotal.toFixed(2)}h</td>
                                <td className="p-4 text-center text-rose-400 font-semibold">{r.comp > 0 ? `-${r.comp.toFixed(2)}h` : '—'}</td>
                                <td className="p-4 text-center font-extrabold text-cyan-400 bg-cyan-950/10">{r.netas.toFixed(2)}h</td>
                                <td className="p-4 text-slate-400 italic max-w-xs truncate" title={r.mot || undefined}>{r.mot || 'Ninguna'}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-950 border-t-2 border-cyan-500/30 text-xs text-white uppercase font-bold">
                              <td className="p-4">TOTALES ACUMULADOS</td>
                              <td colSpan={2}></td>
                              <td className="p-4 text-center">{personalStats.hT.toFixed(1)}h</td>
                              <td className="p-4 text-center text-slate-400">{personalStats.base.toFixed(1)}h</td>
                              <td className="p-4 text-center text-slate-300">{personalStats.extraTotal.toFixed(1)}h</td>
                              <td className="p-4 text-center text-rose-400">-{personalStats.comp.toFixed(1)}h</td>
                              <td className="p-4 text-center text-emerald-400 font-extrabold text-sm bg-cyan-950/40">
                                {personalStats.netas.toFixed(2)}h
                              </td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                        <Archive className="w-8 h-8 text-slate-700 animate-pulse" />
                        <p className="text-xs text-slate-500 uppercase">No se encontraron registros de horas extras en el rango especificado.</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })() : (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-16 text-center flex flex-col items-center justify-center space-y-4 shadow-lg">
                <Users className="w-12 h-12 text-slate-700 animate-pulse" />
                <h4 className="text-sm font-bold text-slate-400 uppercase font-mono">Consulte su Historial Individual de Horas Extras</h4>
                <p className="text-xs text-slate-500 max-w-md uppercase font-mono leading-relaxed">
                  Seleccione su nombre en el desplegable superior para ver el desglose completo de sus turnos, horas acumuladas, compensadas y netas a pagar.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: AJUSTES FÓRMULAS Y LEY */}
        {activeSubTab === 'ajustes' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 font-mono text-xs text-slate-300">
            
            {/* Shifts configuration panel */}
            <div className="lg:col-span-12 space-y-6">
              
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md space-y-6">
                
                <header className="border-b border-slate-800 pb-3 flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-bold uppercase text-amber-400 flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-amber-400" />
                      Configure Parámetros y Fórmulas
                    </h3>
                    <p className="text-[10px] text-slate-500 uppercase mt-1">
                      Modifique los límites semanales y coeficientes de liquidación para cumplir la ley en curso.
                    </p>
                  </div>
                  
                  <span className="text-[9px] font-mono font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400 px-3 py-1.5 rounded uppercase tracking-wider">
                    Ley Vigente Colombia Modificable
                  </span>
                </header>

                {/* Sub sections */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Wed configuration block */}
                  <div className="bg-slate-950 p-5 rounded-xl border border-slate-850 space-y-4">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-widest block border-b border-slate-850 pb-2">
                      1. Jornada Especial del Miércoles
                    </span>

                    <div className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-slate-400">Nombre de la Jornada Sugerida</label>
                        <input 
                          type="text"
                          className="bg-slate-900 border border-slate-800 text-white rounded p-3"
                          defaultValue="Miércoles — Ley Especial"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-400">Límite Base Horas (Wednesday)</label>
                          <input 
                            type="number"
                            min="1"
                            max="24"
                            className="bg-slate-900 border border-slate-800 text-cyan-400 rounded p-3 font-bold"
                            value={config.wedBaseHours}
                            onChange={(e) => setConfig({ ...config, wedBaseHours: parseFloat(e.target.value) || 9.25 })}
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-400">Hora Sugerida Salida</label>
                          <input 
                            type="time"
                            className="bg-slate-900 border border-slate-800 text-white p-3 text-center"
                            value={config.wedEndTime}
                            onChange={(e) => setConfig({ ...config, wedEndTime: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-500 leading-normal uppercase">
                        El sistema utiliza la base de <b className="text-cyan-500 font-mono">{config.wedBaseHours} horas</b> para Miércoles. Cualquier minuto trabajado posterior cuenta como Overtime. Puede variarlo según las directrices vigentes de este año.
                      </div>
                    </div>
                  </div>

                  {/* Standard day block */}
                  <div className="bg-slate-950 p-5 rounded-xl border border-slate-850 space-y-4">
                    <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-widest block border-b border-slate-850 pb-2">
                      2. Jornada Estándar (Lun / Mar / Jue / Vie)
                    </span>

                    <div className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-slate-400">Nombre de la Jornada Estándar</label>
                        <input 
                          type="text"
                          className="bg-slate-900 border border-slate-800 text-white rounded p-3"
                          defaultValue="Lun, Mar, Jue, Vie — General"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-400">Base Horas (LMJV)</label>
                          <input 
                            type="number"
                            min="1"
                            max="24"
                            className="bg-slate-900 border border-slate-800 text-cyan-400 rounded p-3 font-bold text-center"
                            value={config.normalBaseHours}
                            onChange={(e) => setConfig({ ...config, normalBaseHours: parseFloat(e.target.value) || 9 })}
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-400">Hora Entrada (Gral)</label>
                          <input 
                            type="time"
                            className="bg-slate-900 border border-slate-800 text-white p-3 text-center rounded outline-none focus:border-cyan-400"
                            value={config.suggestedStartTime}
                            onChange={(e) => setConfig({ ...config, suggestedStartTime: e.target.value })}
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-slate-400">Hora Salida (LMJV)</label>
                          <input 
                            type="time"
                            className="bg-slate-900 border border-slate-800 text-white p-3 text-center rounded outline-none focus:border-cyan-400"
                            value={config.normalEndTime}
                            onChange={(e) => setConfig({ ...config, normalEndTime: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-500 leading-normal uppercase">
                        Si la ley reduce la semana general laboral, disminuya este indicador (por ejemplo de <b className="text-cyan-500">9 horas</b> a <b className="text-cyan-500">8.5 u 8</b>) para que las horas ordinarias comiencen antes. Puede configurar la <b>Hora Entrada (Gral)</b> para adaptar el ingreso logístico.
                      </div>
                    </div>
                  </div>

                  {/* Coefficients and Surcharges multipliers */}
                  <div className="bg-slate-950 p-5 rounded-xl border border-slate-850 space-y-4 md:col-span-2">
                    <span className="text-[11px] font-bold text-purple-400 uppercase tracking-widest block border-b border-slate-850 pb-2">
                      3. Coeficientes y Porcentajes de Recargos de Ley (Porcentaje de Multiplicador)
                    </span>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-400 uppercase">Extra Diurna</label>
                        <input 
                          type="number"
                          step="0.05"
                          className="bg-slate-900 border border-slate-800 text-center font-bold text-white rounded p-2"
                          value={config.extraDiurnaMultiplier}
                          onChange={(e) => setConfig({ ...config, extraDiurnaMultiplier: parseFloat(e.target.value) || 1.25 })}
                        />
                        <span className="text-[9px] text-slate-500 text-center uppercase">Mult: {config.extraDiurnaMultiplier} (+{(config.extraDiurnaMultiplier - 1) * 100}%)</span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-400 uppercase">Extra Nocturna</label>
                        <input 
                          type="number"
                          step="0.05"
                          className="bg-slate-900 border border-slate-800 text-center font-bold text-white rounded p-2"
                          value={config.extraNocturnaMultiplier}
                          onChange={(e) => setConfig({ ...config, extraNocturnaMultiplier: parseFloat(e.target.value) || 1.75 })}
                        />
                        <span className="text-[9px] text-slate-500 text-center uppercase">Mult: {config.extraNocturnaMultiplier} (+{(config.extraNocturnaMultiplier - 1) * 100}%)</span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-400 uppercase">Recargo Nocturno</label>
                        <input 
                          type="number"
                          step="0.05"
                          className="bg-slate-900 border border-slate-800 text-center font-bold text-white rounded p-2"
                          value={config.recNoctMultiplier}
                          onChange={(e) => setConfig({ ...config, recNoctMultiplier: parseFloat(e.target.value) || 0.35 })}
                        />
                        <span className="text-[9px] text-slate-500 text-center uppercase">Mult: {config.recNoctMultiplier} (+{config.recNoctMultiplier * 100}%)</span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-400 uppercase">Dominical / Fest</label>
                        <input 
                          type="number"
                          step="0.05"
                          className="bg-slate-900 border border-slate-800 text-center font-bold text-white rounded p-2"
                          value={config.domFestMultiplier}
                          onChange={(e) => setConfig({ ...config, domFestMultiplier: parseFloat(e.target.value) || 1.75 })}
                        />
                        <span className="text-[9px] text-slate-500 text-center uppercase">Mult: {config.domFestMultiplier} (+{(config.domFestMultiplier - 1) * 100}%)</span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-400 uppercase">Extra Ord (+25%)</label>
                        <input 
                          type="number"
                          step="0.05"
                          className="bg-slate-900 border border-slate-800 text-center font-bold text-white rounded p-2"
                          value={config.extraOrdMultiplier}
                          onChange={(e) => setConfig({ ...config, extraOrdMultiplier: parseFloat(e.target.value) || 1.25 })}
                        />
                        <span className="text-[9px] text-slate-500 text-center uppercase">Mult: {config.extraOrdMultiplier} (+{(config.extraOrdMultiplier - 1) * 100}%)</span>
                      </div>
                    </div>
                  </div>

                  {/* Night hours constraints */}
                  <div className="bg-slate-950 p-5 rounded-xl border border-slate-850 space-y-4">
                    <span className="text-[11px] font-bold text-rose-400 uppercase tracking-widest block border-b border-slate-850 pb-2">
                      4. Delimitación de Horas Nocturnas vigentes
                    </span>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-slate-400">Inicio de Overtime Nocturno</label>
                        <select
                          value={config.nightOvertimeStartHour}
                          onChange={(e) => setConfig({ ...config, nightOvertimeStartHour: parseInt(e.target.value) || 22 })}
                          className="bg-slate-900 border border-slate-800 text-center font-bold text-white rounded p-2 focus:border-cyan-400 outline-none"
                        >
                          <option value="20">20:00 (8:00 PM)</option>
                          <option value="21">21:00 (9:00 PM)</option>
                          <option value="22">22:00 (10:00 PM) - Legal</option>
                          <option value="23">23:00 (11:00 PM)</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-slate-400">Inicio Recargo Nocturno</label>
                        <select
                          value={config.nightSurchargeStartHour}
                          onChange={(e) => setConfig({ ...config, nightSurchargeStartHour: parseInt(e.target.value) || 21 })}
                          className="bg-slate-900 border border-slate-800 text-center font-bold text-white rounded p-2 focus:border-cyan-400 outline-none"
                        >
                          <option value="19">19:00 (7:00 PM)</option>
                          <option value="20">20:00 (8:00 PM)</option>
                          <option value="21">21:00 (9:00 PM) - Legal</option>
                          <option value="22">22:00 (10:00 PM)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-5 rounded-xl border border-slate-850 flex flex-col justify-center space-y-3">
                    <span className="text-emerald-400 font-bold uppercase block text-center">Formularios de Ley Conectados</span>
                    <p className="text-slate-400 text-center text-[10px] leading-relaxed uppercase">
                      El motor inteligente de guardado en la nube de Firebase mantendrá sincronizados los cálculos e índices de todos los usuarios de la corporación.
                    </p>
                  </div>

                </div>

                {/* Submits trigger changes */}
                <div className="pt-4 border-t border-slate-850 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveConfig}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-mono uppercase px-8 py-3.5 rounded-lg shadow-lg flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Guardar Fórmulas y Recargos de Ley
                  </button>
                </div>

              </div>

            </div>

          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* 📄 FORMATO OFICIAL A4 IMPRESIÓN DE NÓMINA & CORTES 12/27 (LEY 2466)       */}
      {/* RENDERIZADO MEDIANTE PORTAL A DOCUMENT.BODY PARA IMPRESIÓN 100% CONFIABLE  */}
      {/* ========================================================================= */}
      {typeof document !== 'undefined' && createPortal(
        <div id="printNominaA4">
          {/* Cabecera Corporativa Oficial */}
          <div className="border-b-2 border-slate-900 pb-3 mb-3 flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black tracking-tight text-slate-950 font-mono">SISTEMALOG S.A.S.</span>
                <span className="text-sm text-slate-700 font-bold">| LATIN PRODUCTS S.A.S.</span>
              </div>
              <p className="text-[10px] text-slate-700 font-mono mt-0.5 font-semibold">
                NIT: 901.458.921-3 • Centro Logístico Acopi-Yumbo • Valle del Cauca, Colombia
              </p>
              <p className="text-[9.5px] text-slate-600 font-mono">
                Sistema Integral de Nómina, Turnos, Horas Extras y Recargos Nocturnos
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block border-2 border-slate-900 bg-slate-100 text-slate-950 font-mono font-black text-[10px] px-3 py-1 rounded">
                LEY 2466 DE 2025/2026
              </span>
              <p className="text-[10px] font-mono text-slate-700 mt-1 font-semibold">
                Fecha de Emisión: <strong>{new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>
              </p>
            </div>
          </div>

          {/* Bloque Informativo de Período Amarrado */}
          <div className="bg-slate-100 border-2 border-slate-800 rounded p-2.5 mb-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xs font-black uppercase text-slate-950 font-mono tracking-wide">
                  PLANILLA OFICIAL DE LIQUIDACIÓN DE HORAS EXTRAS & RECARGOS
                </h2>
                {corteStats.pendingCount === 0 && corteStats.paidCount > 0 ? (
                  <span className="text-[8px] font-black uppercase font-mono px-2 py-0.5 rounded bg-emerald-100 border border-emerald-800 text-emerald-950">
                    ESTADO: CORTE LIQUIDADO & PAGADO 🔒
                  </span>
                ) : corteStats.paidCount === 0 ? (
                  <span className="text-[8px] font-black uppercase font-mono px-2 py-0.5 rounded bg-amber-100 border border-amber-800 text-amber-950">
                    ESTADO: PENDIENTE DE PAGO ⏳
                  </span>
                ) : (
                  <span className="text-[8px] font-black uppercase font-mono px-2 py-0.5 rounded bg-blue-100 border border-blue-800 text-blue-950">
                    ESTADO: PARCIALMENTE PAGADO ({corteStats.paidCount} Pagados / {corteStats.pendingCount} Pendientes)
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-800 font-mono">
                Período Liquidado: <strong className="text-slate-950 uppercase">{getHistoryRangeLabel()}</strong>
              </p>
              <p className="text-[9px] text-slate-600 font-mono">
                Límites de Corte: Del <strong>{corteStartDate || 'Primer registro'}</strong> al <strong>{corteEndDate || 'Último registro'}</strong>
              </p>
            </div>
            <div className="text-right text-[9.5px] font-mono space-y-0.5">
              <div className="text-slate-700">Turnos en este corte: <strong className="text-slate-950 font-bold">{printPayrollSummary.grandTotals.count} registros</strong></div>
              <div className="text-amber-900 font-bold">Horas Pendientes a Liquidar: <strong className="text-amber-950 font-black text-xs">{printPayrollSummary.grandTotals.pendingNetas.toFixed(2)}h</strong></div>
              <div className="text-emerald-900 font-bold">Horas Ya Amarradas / Pagadas: <strong className="text-emerald-950">{printPayrollSummary.grandTotals.paidNetas.toFixed(2)}h</strong></div>
              <div className="text-slate-700 border-t border-slate-300 pt-0.5">Total Horas Netas: <strong className="text-slate-950 font-black">{printPayrollSummary.grandTotals.netas.toFixed(2)}h</strong></div>
            </div>
          </div>

          {/* TABLA 1: Resumen Oficial Consolidado por Colaborador */}
          <div className="mb-3">
            <div className="text-[9.5px] font-mono font-black uppercase text-slate-900 mb-1">
              1. Consolidado de Liquidación por Colaborador ({printPayrollSummary.rows.length} colaboradores activos en el corte)
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-200 text-slate-950 text-[8.5px] uppercase font-bold text-center">
                  <th className="border border-slate-700 p-1 text-left w-6">N°</th>
                  <th className="border border-slate-700 p-1 text-left">Colaborador / Trabajador</th>
                  <th className="border border-slate-700 p-1 text-left">Cargo / Proceso</th>
                  <th className="border border-slate-700 p-1">Turnos</th>
                  <th className="border border-slate-700 p-1">H. Trab.</th>
                  <th className="border border-slate-700 p-1">Ext. Diurna (1.25)</th>
                  <th className="border border-slate-700 p-1">Ext. Nocturna (1.75)</th>
                  <th className="border border-slate-700 p-1">Recargo Noct. (0.35)</th>
                  <th className="border border-slate-700 p-1">Dom. / Fest. (1.75)</th>
                  <th className="border border-slate-700 p-1">Comp. (-)</th>
                  <th className="border border-slate-700 p-1 bg-amber-100 font-black">Pendientes</th>
                  <th className="border border-slate-700 p-1 bg-emerald-100 font-black">Pagadas</th>
                  <th className="border border-slate-700 p-1 bg-slate-300 font-black">Total Netas</th>
                </tr>
              </thead>
              <tbody className="text-[8.5px] font-mono text-slate-900">
                {printPayrollSummary.rows.map((row, idx) => (
                  <tr key={row.nom} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="border border-slate-600 p-1 text-center font-bold">{idx + 1}</td>
                    <td className="border border-slate-600 p-1 font-bold uppercase">{row.nom}</td>
                    <td className="border border-slate-600 p-1">{row.car} ({row.are})</td>
                    <td className="border border-slate-600 p-1 text-center">{row.count}</td>
                    <td className="border border-slate-600 p-1 text-center">{row.hT.toFixed(1)}h</td>
                    <td className="border border-slate-600 p-1 text-center">{row.extDiurna > 0 ? `${row.extDiurna.toFixed(2)}h` : '—'}</td>
                    <td className="border border-slate-600 p-1 text-center">{row.extNocturna > 0 ? `${row.extNocturna.toFixed(2)}h` : '—'}</td>
                    <td className="border border-slate-600 p-1 text-center">{row.recNoct > 0 ? `${row.recNoct.toFixed(2)}h` : '—'}</td>
                    <td className="border border-slate-600 p-1 text-center">{row.domFest > 0 ? `${row.domFest.toFixed(2)}h` : '—'}</td>
                    <td className="border border-slate-600 p-1 text-center text-rose-700">{row.comp > 0 ? `-${row.comp.toFixed(2)}h` : '—'}</td>
                    <td className="border border-slate-600 p-1 text-center font-black bg-amber-50/70 text-amber-950">
                      {row.pendingNetas > 0 ? `${row.pendingNetas.toFixed(2)}h` : '0.00h'}
                    </td>
                    <td className="border border-slate-600 p-1 text-center font-bold bg-emerald-50/70 text-emerald-950">
                      {row.paidNetas > 0 ? `${row.paidNetas.toFixed(2)}h` : '—'}
                    </td>
                    <td className="border border-slate-600 p-1 text-center font-black bg-slate-100 text-slate-950">
                      {row.netas.toFixed(2)}h
                    </td>
                  </tr>
                ))}
                {printPayrollSummary.rows.length === 0 && (
                  <tr>
                    <td colSpan={13} className="border border-slate-600 p-4 text-center text-slate-600 font-mono">
                      No hay turnos registrados para el período seleccionado ({corteStartDate || 'Inicio'} al {corteEndDate || 'Fin'}).
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-200 text-slate-950 font-mono font-black text-[9px]">
                  <td colSpan={3} className="border border-slate-800 p-1 text-right uppercase">
                    TOTALES GENERALES DEL CORTE:
                  </td>
                  <td className="border border-slate-800 p-1 text-center">{printPayrollSummary.grandTotals.count}</td>
                  <td className="border border-slate-800 p-1 text-center">{printPayrollSummary.grandTotals.hT.toFixed(1)}h</td>
                  <td className="border border-slate-800 p-1 text-center">{printPayrollSummary.grandTotals.extDiurna.toFixed(2)}h</td>
                  <td className="border border-slate-800 p-1 text-center">{printPayrollSummary.grandTotals.extNocturna.toFixed(2)}h</td>
                  <td className="border border-slate-800 p-1 text-center">{printPayrollSummary.grandTotals.recNoct.toFixed(2)}h</td>
                  <td className="border border-slate-800 p-1 text-center">{printPayrollSummary.grandTotals.domFest.toFixed(2)}h</td>
                  <td className="border border-slate-800 p-1 text-center text-rose-700">-{printPayrollSummary.grandTotals.comp.toFixed(2)}h</td>
                  <td className="border border-slate-800 p-1 text-center bg-amber-100 text-amber-950 font-black text-xs">
                    {printPayrollSummary.grandTotals.pendingNetas.toFixed(2)}h
                  </td>
                  <td className="border border-slate-800 p-1 text-center bg-emerald-100 text-emerald-950 font-bold text-xs">
                    {printPayrollSummary.grandTotals.paidNetas.toFixed(2)}h
                  </td>
                  <td className="border border-slate-800 p-1 text-center bg-slate-300 text-slate-950 font-black text-xs">
                    {printPayrollSummary.grandTotals.netas.toFixed(2)}h
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* TABLA 2: Detalle Cronológico de Turnos Amarrados en este Corte */}
          {filteredRecords.length > 0 && (
            <div className="mb-3">
              <div className="text-[9.5px] font-mono font-black uppercase text-slate-900 mb-1">
                2. Detalle Cronológico de Turnos Registrados en este Corte ({filteredRecords.length} turnos)
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-200 text-slate-950 text-[7.5px] uppercase font-bold text-center">
                    <th className="border border-slate-700 p-1 w-5">#</th>
                    <th className="border border-slate-700 p-1 text-left w-14">Fecha</th>
                    <th className="border border-slate-700 p-1 text-left">Colaborador</th>
                    <th className="border border-slate-700 p-1 text-center w-12">Entrada</th>
                    <th className="border border-slate-700 p-1 text-center w-12">Salida</th>
                    <th className="border border-slate-700 p-1 text-center w-10">H. Trab</th>
                    <th className="border border-slate-700 p-1 text-center w-10">Diurna</th>
                    <th className="border border-slate-700 p-1 text-center w-10">Noct</th>
                    <th className="border border-slate-700 p-1 text-center w-10">Recargo</th>
                    <th className="border border-slate-700 p-1 text-center w-10">Dom/Fest</th>
                    <th className="border border-slate-700 p-1 text-center w-10 font-black bg-slate-300">Netas</th>
                    <th className="border border-slate-700 p-1 text-center w-20">Estado Pago</th>
                    <th className="border border-slate-700 p-1 text-left">Sello / Autoría</th>
                  </tr>
                </thead>
                <tbody className="text-[7.5px] font-mono text-slate-900">
                  {filteredRecords.slice(0, 50).map((r, idx) => (
                    <tr key={r.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="border border-slate-600 p-1 text-center">{idx + 1}</td>
                      <td className="border border-slate-600 p-1 font-bold">{r.fec}</td>
                      <td className="border border-slate-600 p-1 font-bold uppercase">{r.nom}</td>
                      <td className="border border-slate-600 p-1 text-center">{r._ent}</td>
                      <td className="border border-slate-600 p-1 text-center">{r._sal}</td>
                      <td className="border border-slate-600 p-1 text-center">{r.hT ? r.hT.toFixed(1) : '—'}h</td>
                      <td className="border border-slate-600 p-1 text-center">{r.extDiurna > 0 ? `${r.extDiurna.toFixed(2)}h` : '—'}</td>
                      <td className="border border-slate-600 p-1 text-center">{r.extNocturna > 0 ? `${r.extNocturna.toFixed(2)}h` : '—'}</td>
                      <td className="border border-slate-600 p-1 text-center">{r.recNoct > 0 ? `${r.recNoct.toFixed(2)}h` : '—'}</td>
                      <td className="border border-slate-600 p-1 text-center">{r.domFest > 0 ? `${r.domFest.toFixed(2)}h` : '—'}</td>
                      <td className="border border-slate-600 p-1 text-center font-bold bg-slate-100">{r.netas.toFixed(2)}h</td>
                      <td className="border border-slate-600 p-1 text-center font-bold">
                        {r.pagado ? (
                          <span className="text-emerald-800">✅ PAGADO {r.fechaPago ? `(${r.fechaPago.slice(5)})` : ''}</span>
                        ) : (
                          <span className="text-amber-800">⏳ PENDIENTE</span>
                        )}
                      </td>
                      <td className="border border-slate-600 p-1 text-[7px] truncate max-w-[130px] text-slate-700">{r.creadoPor || 'Sistema'}</td>
                    </tr>
                  ))}
                  {filteredRecords.length > 50 && (
                    <tr>
                      <td colSpan={13} className="border border-slate-600 p-1 text-center text-slate-500 italic">
                        Mostrando primeros 50 registros de {filteredRecords.length} turnos amarrados en este reporte.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Parámetros de Ley 2466 aplicados */}
          <div className="border border-slate-400 rounded p-2 mb-4 bg-slate-50 text-[8.5px] font-mono text-slate-800 flex justify-between items-center">
            <div>
              <strong>Reglas de Ley 2466 aplicadas:</strong> Jornada base: {config.normalBaseHours}h (Miér {config.wedBaseHours}h) • Franja nocturna iniciada a las {config.nightSurchargeStartHour}:00 • Multiplicadores: Ext. Diurna x{config.extraDiurnaMultiplier}, Ext. Nocturna x{config.extraNocturnaMultiplier}, Recargo x{config.recNoctMultiplier}, Dom/Fest x{config.domFestMultiplier}.
            </div>
            <div className="font-bold text-slate-950">
              Cortes: 12 y 27 de cada mes
            </div>
          </div>

          {/* Bloque de Firmas y Autorizaciones Oficiales */}
          <div className="grid grid-cols-3 gap-6 pt-4 border-t-2 border-slate-900 text-slate-900 font-mono">
            <div className="text-center">
              <div className="border-b border-slate-700 mb-1 h-9"></div>
              <p className="text-[9.5px] font-black uppercase">Diana Agudelo</p>
              <p className="text-[8px] text-slate-700">SST & Talento Humano</p>
              <p className="text-[7.5px] text-slate-500">sst@latinproducts.com.co</p>
              <span className="inline-block mt-0.5 text-[7.5px] text-slate-800 border border-slate-400 px-1 rounded font-bold">ELABORÓ</span>
            </div>

            <div className="text-center">
              <div className="border-b border-slate-700 mb-1 h-9"></div>
              <p className="text-[9.5px] font-black uppercase">Washington Quiñones</p>
              <p className="text-[8px] text-slate-700">Aux coordinador logistico</p>
              <p className="text-[7.5px] text-slate-500">soporteyabi@gmail.com</p>
              <span className="inline-block mt-0.5 text-[7.5px] text-slate-800 border border-slate-400 px-1 rounded font-bold">REVISÓ Y APROBÓ</span>
            </div>

            <div className="text-center">
              <div className="border-b border-slate-700 mb-1 h-9"></div>
              <p className="text-[9.5px] font-black uppercase">Contabilidad & Nómina</p>
              <p className="text-[8px] text-slate-700">Pagaduría Latin Products SAS</p>
              <p className="text-[7.5px] text-slate-500">Fecha: ____/____/________</p>
              <span className="inline-block mt-0.5 text-[7.5px] text-slate-800 border border-slate-400 px-1 rounded font-bold">RECIBIÓ CONFORME</span>
            </div>
          </div>

          <div className="mt-4 text-[7.5px] font-mono text-slate-600 text-center border-t border-slate-300 pt-1.5">
            Documento Oficial generado por SISTEMALOG • Impresión formato A4 conforme a Ley 2466 • Liquidación aprobada para pago
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
