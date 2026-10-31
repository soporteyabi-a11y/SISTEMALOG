/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Clock, Plus, Users, Archive, LayoutDashboard, Trash2, Edit, 
  Activity, Bell, AlertTriangle, CheckCircle2, Calendar, 
  DollarSign, Sliders, Settings, ChevronDown, Download, 
  RefreshCw, Save, FileSpreadsheet, Sparkles, Filter, Briefcase, UserCheck,
  ChevronLeft, ChevronRight
} from 'lucide-react';
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

export default function HorasModule() {
  // Navigation tabs
  const [activeSubTab, setActiveSubTab] = useState<'registrar' | 'historial' | 'personal' | 'ajustes' | 'consulta'>('registrar');

  // Core records and master worker directory State
  const [records, setRecords] = useState<OvertimeRecord[]>(() => {
    const current = localStorage.getItem('latin_overtime_state');
    if (current) {
      try {
        const parsed = JSON.parse(current);
        if (parsed.records) return parsed.records;
      } catch (e) {}
    }
    return [];
  });
  const [workers, setWorkers] = useState<Worker[]>(() => {
    const current = localStorage.getItem('latin_overtime_state');
    if (current) {
      try {
        const parsed = JSON.parse(current);
        if (parsed.workers) return parsed.workers;
      } catch (e) {}
    }
    return [];
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

  // Historical lists and filtering
  const [filterWeekDate, setFilterWeekDate] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    return monday.toISOString().split('T')[0];
  });
  const [historyRangeType, setHistoryRangeType] = useState<'all' | 'weekly' | 'fortnightly' | 'monthly'>('weekly');
  const [historyViewMode, setHistoryViewMode] = useState<'table' | 'cards'>('cards');
  const [filterWorker, setFilterWorker] = useState<string>('__all');
  const [activeWorkerTab, setActiveWorkerTab] = useState<string>('__global');

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
      }
      checkAllLoaded();
    });

    const unsubWorkers = subscribeToCloud('horas_extras_state', 'workers', (data) => {
      if (Array.isArray(data) && data.length > 0) {
        const raw = JSON.stringify(data);
        lastSavedWorkers.current = raw;
        setWorkers(data);
        updateLocal('workers', data);
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
    let baseObj: any = { records: [], workers: [], config: DEFAULT_CONFIG };
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

    if (editingRecordId !== null) {
      // Modify existing
      const idx = updatedRecords.findIndex(r => r.id === editingRecordId);
      if (idx >= 0) {
        updatedRecords[idx] = {
          ...(computedPreview as OvertimeRecord),
          id: editingRecordId,
          timestamp: Date.now(),
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
      };
      updatedRecords.push(finalRec);
      triggerToast('Registro guardado exitosamente', 'success');
    }

    setRecords(updatedRecords);
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
      setRecords(remaining);
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

    setWorkers(updated);
    setNewWorkerNom('');
    setNewWorkerCar('');
    setNewWorkerAre('');
  };

  const handleEditWorker = (w: Worker) => {
    setEditingWorkerId(w.id);
    setNewWorkerNom(w.nom);
    setNewWorkerCar(w.car);
    setNewWorkerAre(w.are);
  };

  const handleDeleteWorker = (id: number) => {
    if (window.confirm('¿Está seguro de eliminar este trabajador del directorio?')) {
      const processed = workers.filter(w => w.id !== id);
      setWorkers(processed);
      triggerToast('Trabajador eliminado del directorio');
    }
  };

  // Surcharges/schedules legal custom formulary save handlers
  const handleSaveConfig = () => {
    triggerToast('Ajustes y fórmulas de ley actualizadas correctamente', 'success');
  };

  // Navigate through history range periods (weekly, fortnightly, monthly)
  const handleNavigatePeriod = (direction: 'prev' | 'next') => {
    if (!filterWeekDate) return;
    const current = new Date(filterWeekDate + 'T00:00:00');
    const factor = direction === 'prev' ? -1 : 1;

    if (historyRangeType === 'weekly') {
      current.setDate(current.getDate() + (factor * 7));
    } else if (historyRangeType === 'fortnightly') {
      const day = current.getDate();
      if (direction === 'prev') {
        if (day > 15) {
          current.setDate(1); // Move to 1st of current month
        } else {
          current.setMonth(current.getMonth() - 1);
          current.setDate(16); // Move to 16th of previous month
        }
      } else {
        if (day <= 15) {
          current.setDate(16); // Move to 16th of current month
        } else {
          current.setMonth(current.getMonth() + 1);
          current.setDate(1); // Move to 1st of next month
        }
      }
    } else if (historyRangeType === 'monthly') {
      current.setMonth(current.getMonth() + factor);
      current.setDate(1); // Keep at first day of month
    }
    setFilterWeekDate(current.toISOString().split('T')[0]);
  };

  // Group Records inside a structured index for calculations rendering
  const recordsIndexedByWorker = useMemo(() => {
    const indexes: Record<string, { nom: string; car: string; are: string; regs: OvertimeRecord[] }> = {};
    records.forEach(r => {
      const tag = r.nom.trim();
      const normalize = tag.toLowerCase();
      if (!indexes[normalize]) {
        indexes[normalize] = { nom: tag, car: r.car || 'Operario', are: r.are || 'Logística', regs: [] };
      }
      indexes[normalize].regs.push(r);
    });
    return indexes;
  }, [records]);

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

  // Get a readable label for the active history range
  const getHistoryRangeLabel = () => {
    if (historyRangeType === 'all') {
      return 'Todos los registros históricos';
    }
    if (!filterWeekDate) return '';

    const centerDate = new Date(filterWeekDate + 'T00:00:00');
    const year = centerDate.getFullYear();
    const month = centerDate.getMonth();
    const day = centerDate.getDate();

    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const formatDate = (date: Date) => {
      const dd = String(date.getDate()).padStart(2, '0');
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const yyyy = date.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    if (historyRangeType === 'weekly') {
      const centerDay = centerDate.getDay();
      const diffToMonday = centerDay === 0 ? -6 : 1 - centerDay;
      const startOfWeek = new Date(centerDate);
      startOfWeek.setDate(centerDate.getDate() + diffToMonday);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return `Semana: del ${formatDate(startOfWeek)} al ${formatDate(endOfWeek)}`;
    }

    if (historyRangeType === 'fortnightly') {
      if (day <= 15) {
        const start = new Date(year, month, 1);
        const end = new Date(year, month, 15);
        return `1ª Quincena de ${months[month]}: del ${formatDate(start)} al ${formatDate(end)}`;
      } else {
        const start = new Date(year, month, 16);
        const end = new Date(year, month + 1, 0);
        return `2ª Quincena de ${months[month]}: del ${formatDate(start)} al ${formatDate(end)}`;
      }
    }

    if (historyRangeType === 'monthly') {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      return `Mes de ${months[month]}: del ${formatDate(start)} al ${formatDate(end)}`;
    }

    return '';
  };

  // Filter records matching selected range type and reference date input of active historical list view
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      // 1. Worker filter
      const inWorkerName = filterWorker === '__all' || r.nom.toLowerCase() === filterWorker.toLowerCase();
      if (!inWorkerName) return false;

      // 2. Date Range filters
      if (historyRangeType !== 'all' && filterWeekDate) {
        const centerDate = new Date(filterWeekDate + 'T00:00:00');
        const year = centerDate.getFullYear();
        const month = centerDate.getMonth();
        const day = centerDate.getDate();

        let startRange: Date;
        let endRange: Date;

        if (historyRangeType === 'weekly') {
          const centerDay = centerDate.getDay();
          const diffToMonday = centerDay === 0 ? -6 : 1 - centerDay;
          startRange = new Date(centerDate);
          startRange.setDate(centerDate.getDate() + diffToMonday);
          startRange.setHours(0, 0, 0, 0);

          endRange = new Date(startRange);
          endRange.setDate(startRange.getDate() + 6);
          endRange.setHours(23, 59, 59, 999);
        } else if (historyRangeType === 'fortnightly') {
          if (day <= 15) {
            startRange = new Date(year, month, 1, 0, 0, 0, 0);
            endRange = new Date(year, month, 15, 23, 59, 59, 999);
          } else {
            startRange = new Date(year, month, 16, 0, 0, 0, 0);
            endRange = new Date(year, month + 1, 0, 23, 59, 59, 999);
          }
        } else { // 'monthly'
          startRange = new Date(year, month, 1, 0, 0, 0, 0);
          endRange = new Date(year, month + 1, 0, 23, 59, 59, 999);
        }

        const recordMoment = new Date(r.fec + 'T00:00:00');
        const inRange = recordMoment >= startRange && recordMoment <= endRange;
        if (!inRange) return false;
      }

      return true;
    }).sort((a, b) => b.fec.localeCompare(a.fec)); // Sort with most recent first
  }, [records, filterWeekDate, filterWorker, historyRangeType]);

  // Quick helper to fetch initials
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

  // Export dataset to JSON format
  const triggerDownloadJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ records, config, workers }, null, 2));
    const container = document.createElement('a');
    container.setAttribute("href", dataStr);
    container.setAttribute("download", `Sistemalog_ResumenHorasExtras_${filterWeekDate || 'Export'}.json`);
    document.body.appendChild(container);
    container.click();
    container.remove();
    triggerToast('JSON de auditoría descargado exitosamente', 'success');
  };

  return (
    <div className="bg-slate-950 min-height-screen text-slate-100 font-sans border border-slate-900 rounded-2xl overflow-hidden shadow-2xl relative">
      {/* HUD Header Banner */}
      <div className="bg-slate-950 p-6 border-b border-cyan-500/30 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-950 border border-cyan-400/50 rounded-lg text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-mono tracking-tight text-white uppercase flex items-center gap-2">
                Sistema Horas Extras <span className="text-cyan-400 font-black">SISTEMALOG SAS</span>
              </h1>
              <p className="text-[11px] font-mono text-cyan-400/75 uppercase tracking-widest mt-0.5">
                Módulo Inteligente de Cálculo, Nómina y Fórmulas Modificables por Ley
              </p>
              
              {/* Firebase real-time status banner */}
              <div className="flex items-center gap-2 mt-1.5">
                {syncStatus === 'loading' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[9px] font-mono uppercase bg-slate-900 text-slate-400 border border-slate-800">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin text-slate-500" />
                    Cargando desde Firebase...
                  </span>
                )}
                {syncStatus === 'saving' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[9px] font-mono uppercase bg-cyan-950/40 text-cyan-400 border border-cyan-800/50">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin text-cyan-400" />
                    Guardando en Firebase...
                  </span>
                )}
                {syncStatus === 'synced' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[9px] font-mono uppercase bg-emerald-950/40 text-emerald-400 border border-emerald-800/40">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                    Nube Firebase Conectada
                  </span>
                )}
                {syncStatus === 'error' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[9px] font-mono uppercase bg-rose-950/40 text-rose-400 border border-rose-800/40 animate-pulse">
                    <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
                    {syncError || 'Error de Sincronización'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Navigation Tabs bar */}
        <div className="flex flex-wrap gap-1 bg-slate-900/60 p-1 border border-slate-800 rounded-lg font-mono text-xs">
          <button 
            onClick={() => setActiveSubTab('registrar')}
            className={`px-4 py-2.5 rounded-md flex items-center gap-2 transition-all ${activeSubTab === 'registrar' ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_10px_rgba(34,211,238,0.4)]' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'}`}
          >
            <Clock className="w-3.5 h-3.5" />
            Registrar
          </button>
          
          <button 
            onClick={() => setActiveSubTab('historial')}
            className={`px-4 py-2.5 rounded-md flex items-center gap-2 transition-all ${activeSubTab === 'historial' ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_10px_rgba(34,211,238,0.4)]' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'}`}
          >
            <Archive className="w-3.5 h-3.5" />
            Historial / Reporte
          </button>

          <button 
            onClick={() => setActiveSubTab('consulta')}
            className={`px-4 py-2.5 rounded-md flex items-center gap-2 transition-all ${activeSubTab === 'consulta' ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_10px_rgba(34,211,238,0.4)]' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'}`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Consulta Personal
          </button>

          <button 
            onClick={() => setActiveSubTab('personal')}
            className={`px-4 py-2.5 rounded-md flex items-center gap-2 transition-all ${activeSubTab === 'personal' ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_10px_rgba(34,211,238,0.4)]' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'}`}
          >
            <Users className="w-3.5 h-3.5" />
            Personal ({workers.length})
          </button>

          <button 
            onClick={() => setActiveSubTab('ajustes')}
            className={`px-4 py-2.5 rounded-md flex items-center gap-2 transition-all ${activeSubTab === 'ajustes' ? 'bg-amber-500 text-slate-950 font-bold shadow-[0_0_10px_rgba(245,158,11,0.4)]' : 'text-amber-400/80 hover:text-amber-100 hover:bg-amber-950/20'}`}
          >
            <Settings className="w-3.5 h-3.5" />
            Fórmulas y Ley
          </button>
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
                  {editingRecordId ? 'Modificar Registro Existente' : 'Ingresar Jornada Trabajada'}
                </h3>
                <button 
                  onClick={handleResetForm}
                  className="text-[10px] font-mono text-slate-500 hover:text-slate-300 uppercase underline"
                >
                  Limpiar Formulario
                </button>
              </div>

              {/* Step 1: Info del Trabajador */}
              <div className="space-y-4">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
                  1. Información General del Personal
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs text-slate-400 font-mono">Nombre Completo</label>
                    <select
                      value={workerName}
                      onChange={(e) => handleSelectMasterWorker(e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-white rounded-md p-3 text-sm focus:border-cyan-400 outline-none transition-all"
                    >
                      <option value="">-- Seleccione un Trabajador --</option>
                      {workers.map(w => (
                        <option key={w.id} value={w.nom}>{w.nom}</option>
                      ))}
                    </select>
                    <div className="text-[10px] text-slate-500 mt-1 uppercase font-mono">
                      ¿No está? Añádalo en la pestaña <span className="text-cyan-400">"Personal"</span>
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
            
            {/* Filters Bar */}
            <div className="bg-slate-900/60 p-5 border border-slate-850 rounded-xl flex flex-wrap gap-4 items-end justify-between">
              
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-mono text-slate-500 uppercase">Fecha de Referencia</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={historyRangeType === 'all'}
                      onClick={() => handleNavigatePeriod('prev')}
                      className={`bg-slate-950 border border-slate-800 text-slate-400 hover:text-cyan-400 px-2.5 py-2.5 rounded-md hover:border-cyan-500/50 transition-all ${historyRangeType === 'all' ? 'opacity-30 cursor-not-allowed' : ''}`}
                      title="Período anterior"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <input
                      type="date"
                      value={filterWeekDate}
                      disabled={historyRangeType === 'all'}
                      onChange={(e) => setFilterWeekDate(e.target.value)}
                      className={`bg-slate-950 border border-slate-800 text-cyan-400 rounded-md p-2.5 text-xs font-mono focus:border-cyan-400 outline-none transition-all ${historyRangeType === 'all' ? 'opacity-30 cursor-not-allowed' : ''}`}
                    />
                    <button
                      type="button"
                      disabled={historyRangeType === 'all'}
                      onClick={() => handleNavigatePeriod('next')}
                      className={`bg-slate-950 border border-slate-800 text-slate-400 hover:text-cyan-400 px-2.5 py-2.5 rounded-md hover:border-cyan-500/50 transition-all ${historyRangeType === 'all' ? 'opacity-30 cursor-not-allowed' : ''}`}
                      title="Período siguiente"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-mono text-slate-500 uppercase">Filtrar Trabajador</span>
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
                    className="bg-slate-950 border border-slate-800 text-slate-300 rounded-md p-2.5 text-xs focus:border-cyan-400 outline-none font-mono"
                  >
                    <option value="__all">-- Todos los Trabajadores --</option>
                    {workers.map(w => (
                      <option key={w.id} value={w.nom}>{w.nom}</option>
                    ))}
                  </select>
                </div>

                {/* Rango/Modo de Historial Selector */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-mono text-slate-500 uppercase">Rango de Historial</span>
                  <div className="flex bg-slate-950 p-1 rounded-md border border-slate-800 h-[42px] items-center">
                    <button
                      type="button"
                      onClick={() => setHistoryRangeType('all')}
                      className={`px-3 py-1.5 text-[10px] font-mono font-black uppercase rounded transition-all h-8 flex items-center ${
                        historyRangeType === 'all'
                          ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Ver Todo
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryRangeType('weekly')}
                      className={`px-3.5 py-1.5 text-[10px] font-mono font-black uppercase rounded transition-all h-8 flex items-center ${
                        historyRangeType === 'weekly'
                          ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Semana
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryRangeType('fortnightly')}
                      className={`px-3.5 py-1.5 text-[10px] font-mono font-black uppercase rounded transition-all h-8 flex items-center ${
                        historyRangeType === 'fortnightly'
                          ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Quincena
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryRangeType('monthly')}
                      className={`px-3.5 py-1.5 text-[10px] font-mono font-black uppercase rounded transition-all h-8 flex items-center ${
                        historyRangeType === 'monthly'
                          ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Mes
                    </button>
                  </div>
                </div>

                {/* Modo de Visualización */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-mono text-slate-500 uppercase">Vista de Historial</span>
                  <div className="flex bg-slate-950 p-1 rounded-md border border-slate-800 h-[42px] items-center">
                    <button
                      type="button"
                      onClick={() => setHistoryViewMode('cards')}
                      className={`px-3 py-1.5 text-[10px] font-mono font-black uppercase rounded transition-all h-8 flex items-center gap-1.5 ${
                        historyViewMode === 'cards'
                          ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>🎴</span> Tarjetas
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryViewMode('table')}
                      className={`px-3.5 py-1.5 text-[10px] font-mono font-black uppercase rounded transition-all h-8 flex items-center gap-1.5 ${
                        historyViewMode === 'table'
                          ? 'bg-cyan-500 text-slate-950 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>📋</span> Tabla
                    </button>
                  </div>
                </div>
              </div>

              {/* Action utilities */}
              <div className="flex gap-2">
                <button
                  onClick={triggerDownloadJSON}
                  className="bg-slate-950 border border-slate-800 px-4 py-2.5 rounded-lg text-xs font-mono text-cyan-400 hover:bg-slate-900 hover:border-cyan-500/50 transition-all flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  JSON Auditoría
                </button>
                <button
                  onClick={() => window.print()}
                  className="bg-slate-950 border border-slate-800 px-4 py-2.5 rounded-lg text-xs font-mono text-slate-400 hover:text-slate-100 hover:bg-slate-900 transition-all flex items-center gap-2"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Imprimir Nómina
                </button>
              </div>

            </div>

            {/* Quick Workers Horizontal Slices for Multi-user Dashboard */}
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-2 min-w-max">
                <button
                  onClick={() => {
                    setActiveWorkerTab('__global');
                    setFilterWorker('__all');
                  }}
                  className={`px-4 py-2 text-xs font-mono uppercase font-bold rounded-md border transition-all flex items-center gap-2 ${
                    activeWorkerTab === '__global' ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'bg-slate-900 border-slate-850 text-slate-400'
                  }`}
                >
                  <span>★</span>
                  Reporte Total Global
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
                      className={`px-4 py-2 text-xs font-mono uppercase rounded-md border transition-all flex items-center gap-2 ${
                        activeWorkerTab === k ? 'bg-cyan-500 border-cyan-400 text-slate-950 font-bold' : 'bg-slate-900 border-slate-850 text-slate-400'
                      }`}
                    >
                      <span className="w-5 h-5 rounded bg-slate-950 text-cyan-400 text-[10px] font-black flex items-center justify-center">
                        {initialsOf(chunk.nom)}
                      </span>
                      <span>{chunk.nom.split(' ')[0]}</span>
                      <span className="bg-slate-950/60 text-cyan-300 font-bold px-1.5 py-0.5 rounded text-[10px]">
                        {totals.netas.toFixed(1)}h
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
                            <td className="p-4 text-center">
                              <div className="flex justify-center gap-1.5">
                                <button
                                  onClick={() => handleEditRecord(r)}
                                  className="p-1.5 hover:bg-slate-700/50 text-cyan-400 rounded transition-colors"
                                  title="Editar turno"
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
                          <div className="flex items-center gap-2">
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
                          </div>

                          <div className="flex gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEditRecord(r)}
                              className="p-1.5 hover:bg-slate-800 text-cyan-400 rounded transition-colors"
                              title="Editar turno"
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

        {/* TAB 3: MASTER DIRECTORY WORKERS */}
        {activeSubTab === 'personal' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 font-mono text-xs">
            
            {/* CRUD Form Column */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-md h-fit">
              <div className="border-b border-slate-800 pb-3 mb-4">
                <h4 className="text-cyan-400 font-bold uppercase tracking-wide flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-cyan-400" />
                  {editingWorkerId ? 'Modificar Información' : 'Registrar Nuevo Trabajador'}
                </h4>
              </div>

              <form onSubmit={handleSaveWorker} className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 uppercase tracking-widest text-[9px]">Nombre Completo</label>
                  <input 
                    type="text"
                    required
                    placeholder="Ej: Pedro Valenzuela"
                    value={newWorkerNom}
                    onChange={(e) => setNewWorkerNom(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-white rounded-md p-3 focus:border-cyan-400 outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 uppercase tracking-widest text-[9px]">Cargo / Rol</label>
                  <input 
                    type="text"
                    placeholder="Ej: Operario de Bodega"
                    value={newWorkerCar}
                    onChange={(e) => setNewWorkerCar(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-white rounded-md p-3 focus:border-cyan-400 outline-none"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-400 uppercase tracking-widest text-[9px]">Área / Proceso</label>
                  <input 
                    type="text"
                    placeholder="Ej: Despacho y Logística"
                    value={newWorkerAre}
                    onChange={(e) => setNewWorkerAre(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-white rounded-md p-3 focus:border-cyan-400 outline-none"
                  />
                </div>

                <div className="pt-4 space-y-2">
                  <button
                    type="submit"
                    className="w-full bg-emerald-500 text-slate-950 font-extrabold uppercase py-3.5 rounded-lg hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 shadow"
                  >
                    <Save className="w-4 h-4" />
                    {editingWorkerId ? 'Actualizar Ficha' : 'Guardar Información'}
                  </button>
                  {editingWorkerId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingWorkerId(null);
                        setNewWorkerNom('');
                        setNewWorkerCar('');
                        setNewWorkerAre('');
                      }}
                      className="w-full bg-slate-950 border border-slate-850 py-2.5 rounded-lg text-slate-400 uppercase text-[10px]"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Dir Directory column */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
              <div className="px-5 py-4 bg-slate-950/60 border-b border-slate-850 font-bold uppercase tracking-wider text-cyan-400">
                Directorio Activo de Fichas Logísticas ({workers.length})
              </div>

              {workers.length > 0 ? (
                <div className="divide-y divide-slate-850">
                  {workers.map(w => (
                    <div key={w.id} className="p-4 hover:bg-slate-850/30 transition-all flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        <div className="w-9 h-9 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-400 font-mono font-bold flex items-center justify-center">
                          {initialsOf(w.nom)}
                        </div>
                        <div>
                          <header className="font-bold text-white uppercase text-xs">{w.nom}</header>
                          <footer className="text-[10px] text-slate-400 mt-1 uppercase">
                            Cargo: <b className="text-cyan-500">{w.car || '-'}</b> &middot; Área: <b className="text-slate-300">{w.are || '-'}</b>
                          </footer>
                        </div>
                      </div>

                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleEditWorker(w)}
                          className="p-2 hover:bg-slate-800 text-cyan-400 rounded border border-slate-800 hover:border-cyan-500/30 transition-all"
                          title="Editar ficha"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteWorker(w.id)}
                          className="p-2 hover:bg-rose-950/20 text-rose-400 border border-slate-850 hover:border-rose-500/30 rounded transition-all"
                          title="Eliminar de la lista"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                  <Users className="w-10 h-10 text-slate-700 animate-bounce" />
                  <p className="text-xs font-mono text-slate-500 uppercase max-w-[280px]">
                    El catálogo está vacío. Cargue su primer trabajador utilizando el panel de la izquierda para autocompletar la nómina.
                  </p>
                </div>
              )}
            </div>

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
    </div>
  );
}
