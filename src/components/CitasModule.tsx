/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Calendar, Plus, Users, Archive, LayoutDashboard, Trash2, Edit, 
  Activity, Bell, AlertTriangle, CheckCircle2, Clock, Search, 
  ChevronLeft, ChevronRight, CheckSquare, Info, History
} from 'lucide-react';
import { saveToCloud, subscribeToCloud } from '../firebaseService';
import { Customer } from '../types';
import { 
  sendPushNotification, 
  requestNotificationPermission, 
  getNotificationPermission, 
  isNotificationSupported,
  checkAndNotifyDueEvents
} from '../notificationService';

interface Cita {
  id: number;
  client: string;
  desc: string;
  date: string;
  time: string;
  priority: 'normal' | 'high' | 'urgent';
  status: 'pending' | 'confirmed';
  notes: string;
  completedAt?: string;
}

interface ComponenteCli {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

const DEFAULT_APPOINTMENTS: Cita[] = [
  {id: 1, client: 'Almacenes Pérez Ltda.', desc: 'Entrega contenedor 40ft — Puerto Buenaventura', date: '2026-06-07', time: '08:00', priority: 'urgent', status: 'confirmed', notes: 'Contacto: Luis Pérez 315-xxx'},
  {id: 2, client: 'Distribuidora El Progreso', desc: 'Recepción mercancía importación textil', date: '2026-06-06', time: '10:30', priority: 'high', status: 'pending', notes: ''},
  {id: 3, client: 'Cementos del Valle S.A.', desc: 'Inspección flota / despacho planta', date: '2026-06-10', time: '07:00', priority: 'normal', status: 'confirmed', notes: 'Requiere orden de salida'},
  {id: 4, client: 'Supermercados La Canasta', desc: 'Entrega fría — cadena frío activa', date: '2026-06-15', time: '06:00', priority: 'high', status: 'pending', notes: 'Camión refrigerado'},
  {id: 5, client: 'Ferreterías del Pacífico', desc: 'Despacho materiales construcción', date: '2026-06-20', time: '09:00', priority: 'normal', status: 'pending', notes: ''},
  {id: 6, client: 'Farmacéutica Biomed', desc: 'Transporte especial medicamentos', date: '2026-06-25', time: '11:00', priority: 'urgent', status: 'confirmed', notes: 'Temperatura controlada'},
  {id: 7, client: 'Textiles del Norte', desc: 'Recolección de muestras en bodega', date: '2026-06-28', time: '14:00', priority: 'normal', status: 'pending', notes: ''},
  {id: 8, client: 'Logística Andina S.A.S.', desc: 'Consolidación de carga exportación', date: '2026-07-02', time: '07:30', priority: 'high', status: 'confirmed', notes: 'Aduana Cali'},
  {id: 9, client: 'Importaciones Rincón', desc: 'Entrega última milla zona norte', date: '2026-07-05', time: '10:00', priority: 'normal', status: 'pending', notes: ''},
];

const DEFAULT_CLIENTS: ComponenteCli[] = [
  {id: 1, name: 'Almacenes Pérez Ltda.', phone: '315-111-0001', email: 'contacto@almperez.com', address: 'Cali, Valle del Cauca', notes: 'Contacto: Luis Pérez'},
  {id: 2, name: 'Distribuidora El Progreso', phone: '315-111-0002', email: 'info@elprogreso.com', address: 'Bogotá, Cundinamarca', notes: ''},
  {id: 3, name: 'Cementos del Valle S.A.', phone: '315-111-0003', email: 'logistica@cementosvalle.com', address: 'Cali, Valle del Cauca', notes: 'Requiere orden de salida'},
  {id: 4, name: 'Supermercados La Canasta', phone: '315-111-0004', email: 'compras@lacanasta.com', address: 'Medellín, Antioquia', notes: 'Requiere camión refrigerado'},
  {id: 5, name: 'Ferreterías del Pacífico', phone: '315-111-0005', email: 'pedidos@ferrpacif.com', address: 'Buenaventura, Valle', notes: ''},
  {id: 6, name: 'Farmacéutica Biomed', phone: '315-111-0006', email: 'despacho@biomed.com', address: 'Bogotá, Cundinamarca', notes: 'Temperatura controlada'},
  {id: 7, name: 'Textiles del Norte', phone: '315-111-0007', email: 'bodega@textilesnorte.com', address: 'Barranquilla, Atlántico', notes: ''},
  {id: 8, name: 'Logística Andina S.A.S.', phone: '315-111-0008', email: 'ops@logisticaandina.com', address: 'Cali, Valle del Cauca', notes: 'Aduana Cali'},
  {id: 9, name: 'Importaciones Rincón', phone: '315-111-0009', email: 'importaciones@rincon.com', address: 'Bogotá, Cundinamarca', notes: ''},
];

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Safe LocalStorage helper to prevent SecurityErrors in sandboxed iframes
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn(`[Storage] localStorage is disabled (key: ${key}):`, e);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[Storage] localStorage set error (key: ${key}):`, e);
    }
  }
};

export default function CitasModule({ customers = [] }: { customers?: Customer[] }) {
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'appointments' | 'calendar' | 'clients' | 'archive'>('dashboard');
  const [permission, setPermission] = useState(getNotificationPermission());

  // Load state from local storage or defaults
  const [appointments, setAppointments] = useState<Cita[]>(() => {
    const raw = safeLocalStorage.getItem('logicoord_appointments');
    try {
      return raw ? JSON.parse(raw) : DEFAULT_APPOINTMENTS;
    } catch (e) {
      return DEFAULT_APPOINTMENTS;
    }
  });

  // Periodically check for due appointments
  useEffect(() => {
    checkAndNotifyDueEvents([], appointments, []);

    const interval = setInterval(() => {
      checkAndNotifyDueEvents([], appointments, []);
    }, 15000); // Check every 15 seconds

    return () => clearInterval(interval);
  }, [appointments]);

  const handleRequestPermission = async () => {
    const res = await requestNotificationPermission();
    setPermission(res);
    sendPushNotification("Canal Agenda Vinculado", "¡Excelente! Recibirás avisos de tus citas y entregas programadas.", "system");
  };

  const [clients, setClients] = useState<ComponenteCli[]>(() => {
    const raw = safeLocalStorage.getItem('logicoord_clients');
    try {
      return raw ? JSON.parse(raw) : DEFAULT_CLIENTS;
    } catch (e) {
      return DEFAULT_CLIENTS;
    }
  });

  const [archived, setArchived] = useState<Cita[]>(() => {
    const raw = safeLocalStorage.getItem('logicoord_archived');
    try {
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  // Loop locks for Firestore updates of arrays
  const lastSavedAppointments = useRef<string>('');
  const lastSavedClients = useRef<string>('');
  const lastSavedArchived = useRef<string>('');

  const saveAppointments = (updated: Cita[] | ((prev: Cita[]) => Cita[])) => {
    setAppointments(prev => {
      const next = typeof updated === 'function' ? updated(prev) : updated;
      const raw = JSON.stringify(next);
      lastSavedAppointments.current = raw;
      safeLocalStorage.setItem('logicoord_appointments', raw);
      saveToCloud('citas_state', 'appointments', next);
      return next;
    });
  };

  const saveClients = (updated: ComponenteCli[] | ((prev: ComponenteCli[]) => ComponenteCli[])) => {
    setClients(prev => {
      const next = typeof updated === 'function' ? updated(prev) : updated;
      const raw = JSON.stringify(next);
      lastSavedClients.current = raw;
      safeLocalStorage.setItem('logicoord_clients', raw);
      saveToCloud('citas_state', 'clients', next);
      return next;
    });
  };

  const saveArchived = (updated: Cita[] | ((prev: Cita[]) => Cita[])) => {
    setArchived(prev => {
      const next = typeof updated === 'function' ? updated(prev) : updated;
      const raw = JSON.stringify(next);
      lastSavedArchived.current = raw;
      safeLocalStorage.setItem('logicoord_archived', raw);
      saveToCloud('citas_state', 'archived', next);
      return next;
    });
  };

  // Subscribe to real-time changes in Firestore
  useEffect(() => {
    const unsubAppts = subscribeToCloud('citas_state', 'appointments', (data) => {
      if (Array.isArray(data) && data.length > 0) {
        setAppointments(prev => {
          const map = new Map<string, any>();
          prev.forEach(item => { if (item && item.id !== undefined) map.set(String(item.id), item); });
          data.forEach(item => { if (item && item.id !== undefined) map.set(String(item.id), item); });
          const merged = Array.from(map.values());
          const raw = JSON.stringify(merged);
          lastSavedAppointments.current = raw;
          safeLocalStorage.setItem('logicoord_appointments', raw);
          return merged;
        });
      }
    });

    const unsubClients = subscribeToCloud('citas_state', 'clients', (data) => {
      if (Array.isArray(data) && data.length > 0) {
        setClients(prev => {
          const map = new Map<string, any>();
          prev.forEach(item => { if (item && (item.id !== undefined || item.name !== undefined)) map.set(String(item.id ?? item.name), item); });
          data.forEach(item => { if (item && (item.id !== undefined || item.name !== undefined)) map.set(String(item.id ?? item.name), item); });
          const merged = Array.from(map.values());
          const raw = JSON.stringify(merged);
          lastSavedClients.current = raw;
          safeLocalStorage.setItem('logicoord_clients', raw);
          return merged;
        });
      }
    });

    const unsubArchived = subscribeToCloud('citas_state', 'archived', (data) => {
      if (Array.isArray(data) && data.length > 0) {
        setArchived(prev => {
          const map = new Map<string, any>();
          prev.forEach(item => { if (item && item.id !== undefined) map.set(String(item.id), item); });
          data.forEach(item => { if (item && item.id !== undefined) map.set(String(item.id), item); });
          const merged = Array.from(map.values());
          const raw = JSON.stringify(merged);
          lastSavedArchived.current = raw;
          safeLocalStorage.setItem('logicoord_archived', raw);
          return merged;
        });
      }
    });

    return () => {
      unsubAppts();
      unsubClients();
      unsubArchived();
    };
  }, []);

  // Global search input
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination current pages
  const [apptPage, setApptPage] = useState(1);
  const [clientPage, setClientPage] = useState(1);
  const [archivePage, setArchivePage] = useState(1);

  // Calendar dates view
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Modal open controls
  const [isApptModalOpen, setIsApptModalOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Partial<Cita> | null>(null);
  const [apptClientSearch, setApptClientSearch] = useState('');

  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Partial<ComponenteCli> | null>(null);

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyClient, setHistoryClient] = useState<ComponenteCli | null>(null);

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

  // Helper date tools
  const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getDaysUntil = (dateStr: string) => {
    const a = new Date(dateStr + 'T00:00:00');
    const b = new Date(getTodayString() + 'T00:00:00');
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  };

  const fmtDateString = (dateStr: string) => {
    if (!dateStr || !dateStr.includes('-')) return dateStr;
    const p = dateStr.split('-');
    return `${p[2]}/${p[1]}/${p[0]}`;
  };

  // Critical alerts filter
  const urgentAppts = useMemo(() => {
    return appointments.filter(a => {
      const days = getDaysUntil(a.date);
      return days >= 0 && days <= 3;
    });
  }, [appointments]);

  // Upcoming non-expired appointments
  const upcomingAppts = useMemo(() => {
    return appointments
      .filter(a => getDaysUntil(a.date) >= 0)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  }, [appointments]);

  // Paginated active appointments under All Appts
  const filteredAppointments = useMemo(() => {
    const sorted = [...appointments].sort((a, b) => a.date.localeCompare(b.date));
    if (!searchQuery.trim()) return sorted;
    const cleanNorm = (str: string) => (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const words = searchQuery.trim().split(/\s+/).map(cleanNorm).filter(Boolean);
    return sorted.filter(a => {
      const aAny = a as any;
      const full = cleanNorm(`${a.client} ${a.desc} ${a.notes} ${aAny.location || ''} ${aAny.assignedTo || ''} ${a.date} ${a.time}`);
      return words.every(w => full.includes(w));
    });
  }, [appointments, searchQuery]);

  const paginatedAppts = useMemo(() => {
    const start = (apptPage - 1) * 6;
    return filteredAppointments.slice(start, start + 6);
  }, [filteredAppointments, apptPage]);

  const totalApptPages = useMemo(() => {
    return Math.ceil(filteredAppointments.length / 6) || 1;
  }, [filteredAppointments]);

  // Clients filtration
  const paginatedClients = useMemo(() => {
    const start = (clientPage - 1) * 6;
    return clients.slice(start, start + 6);
  }, [clients, clientPage]);

  const totalClientPages = useMemo(() => {
    return Math.ceil(clients.length / 6) || 1;
  }, [clients]);

  // Archive filtration
  const paginatedArchived = useMemo(() => {
    const start = (archivePage - 1) * 6;
    return archived.slice(start, start + 6);
  }, [archived, archivePage]);

  const totalArchivePages = useMemo(() => {
    return Math.ceil(archived.length / 6) || 1;
  }, [archived]);

  // Calendar month selection
  const handleCalNav = (direction: number) => {
    let nextMonth = calMonth + direction;
    let nextYear = calYear;
    if (nextMonth > 11) {
      nextMonth = 0;
      nextYear++;
    } else if (nextMonth < 0) {
      nextMonth = 11;
      nextYear--;
    }
    setCalMonth(nextMonth);
    setCalYear(nextYear);
    setSelectedDate(null);
  };

  // Archive process
  const handleArchive = (id: number) => {
    const target = appointments.find(a => a.id === id);
    if (!target) return;
    const completedItem: Cita = {
      ...target,
      completedAt: fmtDateString(getTodayString())
    };
    saveArchived(prev => [completedItem, ...prev]);
    saveAppointments(prev => prev.filter(a => a.id !== id));
    sendPushNotification(
      "Cita Completada",
      `La cita de ${target.client} se ha completado correctamente y archivado.`,
      'cita'
    );
  };

  // Restore archived
  const handleRestore = (id: number) => {
    const target = archived.find(a => a.id === id);
    if (!target) return;
    // Remove completedAt property
    const { completedAt, ...rest } = target;
    saveAppointments(prev => [...prev, rest]);
    saveArchived(prev => prev.filter(a => a.id !== id));
    sendPushNotification(
      "Cita Reactivada",
      `La cita de ${target.client} se ha restaurado al calendario de pendientes.`,
      'cita'
    );
  };

  // Deletions
  const handleDeleteAppointment = (id: number, isArchivedList = false) => {
    setConfirmState({
      isOpen: true,
      title: 'CONFIRMAR ELIMINACIÓN DE CITA',
      message: '¿Está seguro de que desea eliminar esta cita de forma definitiva? Esta acción no se puede deshacer.',
      onConfirm: () => {
        if (isArchivedList) {
          saveArchived(prev => prev.filter(c => c.id !== id));
        } else {
          saveAppointments(prev => prev.filter(c => c.id !== id));
        }
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleDeleteClient = (id: number) => {
    setConfirmState({
      isOpen: true,
      title: 'CONFIRMAR ELIMINACIÓN DE CLIENTE',
      message: '¿Está seguro de que desea eliminar este cliente definitivamente? Esto no borrará sus citas anteriores de la base de datos.',
      onConfirm: () => {
        saveClients(prev => prev.filter(c => c.id !== id));
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Creating/Editing Appointment Form handlers
  const handleOpenApptForm = (appt: Cita | null = null) => {
    setApptClientSearch(appt ? appt.client : '');
    if (appt) {
      setEditingAppt({ ...appt });
    } else {
      setEditingAppt({
        client: '',
        desc: '',
        date: getTodayString(),
        time: '09:00',
        priority: 'normal',
        status: 'pending',
        notes: ''
      });
    }
    setIsApptModalOpen(true);
  };

  const handleSaveAppt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAppt || !editingAppt.client || !editingAppt.date) return;

    if (editingAppt.id) {
      // Edit existing
      saveAppointments(prev => prev.map(a => a.id === editingAppt.id ? (editingAppt as Cita) : a));
      sendPushNotification(
        "Cita Modificada",
        `Cliente: ${editingAppt.client}. Modificaciones guardadas correctamente.`,
        'cita'
      );
    } else {
      // Create new
      const nextId = Math.max(0, ...appointments.map(a => a.id), ...archived.map(a => a.id)) + 1;
      saveAppointments(prev => [...prev, { ...(editingAppt as Cita), id: nextId }]);
      sendPushNotification(
        "📅 Nueva Cita Agendada",
        `Hito para ${editingAppt.client} programado el ${editingAppt.date} a las ${editingAppt.time || '00:00'}.`,
        'cita'
      );

      // If client is brand new, auto register it
      const clientExists = clients.some(c => c.name.toLowerCase().trim() === editingAppt.client?.toLowerCase().trim());
      if (!clientExists && editingAppt.client) {
        const matchingCust = customers.find(c => c.nombre.toLowerCase().trim() === editingAppt.client?.toLowerCase().trim());
        if (matchingCust) {
          saveClients(prev => [...prev, {
            id: prev.length + 101,
            name: matchingCust.nombre,
            phone: matchingCust.celular || matchingCust.fijo || '',
            email: matchingCust.email || '',
            address: matchingCust.dir ? `${matchingCust.dir}${matchingCust.ciudad ? `, ${matchingCust.ciudad}` : ''}` : matchingCust.ciudad || '',
            notes: `NIT: ${matchingCust.nit || ''} | Contacto: ${matchingCust.contacto || ''} | Malla: ${matchingCust.malla || ''}${matchingCust.obs ? ` | Obs: ${matchingCust.obs}` : ''}`
          }]);
        } else {
          saveClients(prev => [...prev, {
            id: prev.length + 101,
            name: editingAppt.client!,
            phone: '',
            email: '',
            address: '',
            notes: ''
          }]);
        }
      }
    }

    setIsApptModalOpen(false);
    setEditingAppt(null);
  };

  // Client edit triggers
  const handleOpenClientForm = (client: ComponenteCli | null = null) => {
    if (client) {
      setEditingClient({ ...client });
    } else {
      setEditingClient({
        name: '',
        phone: '',
        email: '',
        address: '',
        notes: ''
      });
    }
    setIsClientModalOpen(true);
  };

  const handleSaveClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClient || !editingClient.name) return;

    if (editingClient.id) {
      const oldName = clients.find(c => c.id === editingClient.id)?.name;
      saveClients(prev => prev.map(c => c.id === editingClient.id ? (editingClient as ComponenteCli) : c));

      // Rename clients on active appointments too
      if (oldName && oldName !== editingClient.name) {
        saveAppointments(prev => prev.map(a => a.client === oldName ? { ...a, client: editingClient.name! } : a));
        saveArchived(prev => prev.map(a => a.client === oldName ? { ...a, client: editingClient.name! } : a));
      }
    } else {
      const nextId = Math.max(0, ...clients.map(c => c.id)) + 1;
      saveClients(prev => [...prev, { ...(editingClient as ComponenteCli), id: nextId }]);
    }

    setIsClientModalOpen(false);
    setEditingClient(null);
  };

  const handleOpenHistory = (c: ComponenteCli) => {
    setHistoryClient(c);
    setIsHistoryModalOpen(true);
  };

  // Month Chart calculation (pure SVG rendering for perfect alignment)
  const monthlyStats = useMemo(() => {
    const stats: Record<string, number> = {};
    MONTHS.forEach(m => { stats[m] = 0; });

    appointments.forEach(a => {
      const parts = a.date.split('-');
      if (parts.length === 3 && parseInt(parts[0]) === calYear) {
        const mIdx = parseInt(parts[1]) - 1;
        if (mIdx >= 0 && mIdx < 12) {
          stats[MONTHS[mIdx]]++;
        }
      }
    });

    archived.forEach(a => {
      const parts = a.date.split('-');
      if (parts.length === 3 && parseInt(parts[0]) === calYear) {
        const mIdx = parseInt(parts[1]) - 1;
        if (mIdx >= 0 && mIdx < 12) {
          stats[MONTHS[mIdx]]++;
        }
      }
    });

    return stats;
  }, [appointments, archived, calYear]);

  // Calendar render grid helpers
  const calendarCells = useMemo(() => {
    const cells: { dayNum: number; dateStr: string; isOtherMonth: boolean; events: Cita[] }[] = [];
    const firstDayIndex = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate();

    // Previous month filler days
    for (let i = 0; i < firstDayIndex; i++) {
      const prevDay = daysInPrevMonth - firstDayIndex + 1 + i;
      cells.push({
        dayNum: prevDay,
        dateStr: `${calMonth === 0 ? calYear - 1 : calYear}-${String(calMonth === 0 ? 12 : calMonth).padStart(2, '0')}-${String(prevDay).padStart(2, '0')}`,
        isOtherMonth: true,
        events: []
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = appointments.filter(a => a.date === dateStr);
      cells.push({
        dayNum: d,
        dateStr,
        isOtherMonth: false,
        events: dayEvents
      });
    }

    // Next month filler days
    const totalFilled = cells.length;
    const remaining = 7 - (totalFilled % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        cells.push({
          dayNum: i,
          dateStr: `${calMonth === 11 ? calYear + 1 : calYear}-${String(calMonth === 11 ? 1 : calMonth + 2).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
          isOtherMonth: true,
          events: []
        });
      }
    }

    return cells;
  }, [appointments, calYear, calMonth]);

  return (
    <div className="space-y-6 animate-fade-in font-mono text-xs">
      
      {/* Dynamic Push Notifications Permission Widget */}
      {permission !== 'granted' ? (
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-emerald-950/30 border-2 border-[#00ffa3]/20 p-4 rounded-xl text-xs text-slate-350 justify-between shadow-lg print:hidden">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-hud-accent animate-bounce" />
            <div className="space-y-0.5">
              <p className="font-bold text-white uppercase tracking-wider text-[11px]">Activar Alertas Agenda y Citas de Entregas</p>
              <p className="text-[10px] text-slate-400">Recibe push y avisos de muelle en tiempo real 60 minutos antes de cada cita logística configurada.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestPermission}
            className="px-4 py-2 bg-[#00ffa3] text-slate-950 font-black rounded-lg transition-all hover:scale-105 active:scale-95 text-[10px] uppercase tracking-wider cursor-pointer font-bold whitespace-nowrap"
          >
            Vincular Alertas
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-slate-950/45 border border-slate-900 px-4 py-2 rounded-lg text-[9.5px] text-slate-400 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Avisos de Agenda Integrados Correctamente</span>
          </div>
          <button 
            type="button"
            onClick={() => sendPushNotification("Agenda Sincronizada", "Recibirás avisos 60 minutos antes de tus citas de hoy.", "cita")} 
            className="text-[8.5px] hover:text-[#00ffa3] underline font-bold uppercase transition"
          >
            Enviar Prueba Agenda
          </button>
        </div>
      )}

      {/* Header section with branding and Tab selectors */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-900">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-hud-accent/10 border border-hud-accent text-hud-accent font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-widest font-mono">
              Agenda & Calendario
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white uppercase font-display flex items-center gap-2">
            <Calendar className="w-5 h-5 text-hud-accent pulse-led" /> LogiCoord — Módulo de Agenda de Citas
          </h2>
          <p className="text-slate-400 text-xs font-sans">
            Planificación y calendarización inteligente de entregas y recolecciones de mercancías
          </p>
        </div>

        {/* Global Toolbar */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button 
            onClick={() => handleOpenApptForm(null)}
            className="bg-[#00ffa3] hover:bg-[#00ffa3]/85 text-slate-950 font-black tracking-widest text-[11px] uppercase px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-1.5 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Registrar Cita
          </button>
        </div>
      </div>

      {/* Module tab sub-navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-900/40 pb-2">
        <button 
          onClick={() => { setActiveSubTab('dashboard'); setSelectedDate(null); }}
          className={`px-3 py-1.5 rounded-md text-[11px] font-bold uppercase transition-all tracking-wider flex items-center gap-1.5 ${activeSubTab === 'dashboard' ? 'bg-hud-accent text-slate-950 shadow-md shadow-hud-accent/25' : 'bg-slate-950/40 text-slate-400 hover:text-white'}`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" /> Dashboard
        </button>
        <button 
          onClick={() => { setActiveSubTab('appointments'); setSelectedDate(null); }}
          className={`px-3 py-1.5 rounded-md text-[11px] font-bold uppercase transition-all tracking-wider flex items-center gap-1.5 ${activeSubTab === 'appointments' ? 'bg-hud-accent text-slate-950 shadow-md shadow-hud-accent/25' : 'bg-slate-950/40 text-slate-400 hover:text-white'}`}
        >
          <Clock className="w-3.5 h-3.5" /> Gestión Citas
        </button>
        <button 
          onClick={() => { setActiveSubTab('calendar'); setSelectedDate(null); }}
          className={`px-3 py-1.5 rounded-md text-[11px] font-bold uppercase transition-all tracking-wider flex items-center gap-1.5 ${activeSubTab === 'calendar' ? 'bg-hud-accent text-slate-950 shadow-md shadow-hud-accent/25' : 'bg-slate-950/40 text-slate-400 hover:text-white'}`}
        >
          <Calendar className="w-3.5 h-3.5" /> Calendario
        </button>
        <button 
          onClick={() => { setActiveSubTab('clients'); setSelectedDate(null); }}
          className={`px-3 py-1.5 rounded-md text-[11px] font-bold uppercase transition-all tracking-wider flex items-center gap-1.5 ${activeSubTab === 'clients' ? 'bg-hud-accent text-slate-950 shadow-md shadow-hud-accent/25' : 'bg-slate-950/40 text-slate-400 hover:text-white'}`}
        >
          <Users className="w-3.5 h-3.5" /> Clientes Agenda
        </button>
        <button 
          onClick={() => { setActiveSubTab('archive'); setSelectedDate(null); }}
          className={`px-3 py-1.5 rounded-md text-[11px] font-bold uppercase transition-all tracking-wider flex items-center gap-1.5 ${activeSubTab === 'archive' ? 'bg-hud-accent text-slate-950 shadow-md shadow-hud-accent/25' : 'bg-slate-950/40 text-slate-400 hover:text-white'}`}
        >
          <Archive className="w-3.5 h-3.5" /> Historial Completadas ({archived.length})
        </button>
      </div>

      {/* Critical Alerts Banner (Global Alerts inside component) */}
      {urgentAppts.length > 0 && activeSubTab === 'dashboard' && (
        <div className="bg-hud-red/10 border-l-4 border-hud-red text-slate-200 rounded-r-lg p-4 space-y-2.5 animate-pulse">
          <div className="flex items-center gap-2 text-hud-red font-black text-xs">
            <AlertTriangle className="w-4.5 h-4.5" /> ATENCIÓN: ENTREGAS CRÍTICAS PRÓXIMAS ({urgentAppts.length})
          </div>
          <div className="space-y-1.5 max-h-24 overflow-y-auto pr-2 custom-scrollbar">
            {urgentAppts.map(a => {
              const d = getDaysUntil(a.date);
              return (
                <div key={a.id} className="flex justify-between items-center text-[10.5px] border-b border-hud-red/5 pb-1 last:border-b-0">
                  <div className="truncate flex-1">
                    <strong className="text-white uppercase">{a.client}</strong> — {a.desc} ({a.time})
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded leading-none shrink-0 ${
                    d === 0 ? 'bg-hud-red/20 text-hud-red' : d === 1 ? 'bg-amber-500/20 text-amber-500' : 'bg-[#00ffa3]/25 text-[#00ffa3]'
                  }`}>
                    {d === 0 ? 'HOY' : d === 1 ? 'MAÑANA' : `EN ${d} DÍAS`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* RENDER ACTIVE TAB */}

      {/* ===================== TAB: DASHBOARD ===================== */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-hud-card border border-hud-border/30 rounded-lg p-4 space-y-1 hover:border-hud-accent/30 transition-all">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Citas Totales</div>
              <div className="text-2xl font-black text-white">{appointments.length}</div>
              <span className="bg-slate-900 text-[#00ffa3] text-[9px] font-bold px-2 py-0.5 rounded inline-block uppercase">
                Activas
              </span>
            </div>

            <div className="bg-hud-card border border-hud-border/30 rounded-lg p-4 space-y-1 hover:border-hud-accent/30 transition-all">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Confirmadas</div>
              <div className="text-2xl font-black text-hud-green">
                {appointments.filter(a => a.status === 'confirmed').length}
              </div>
              <span className="bg-hud-green/10 text-hud-green text-[9px] font-bold px-2 py-0.5 rounded inline-block uppercase">
                Listas
              </span>
            </div>

            <div className="bg-hud-card border border-hud-border/30 rounded-lg p-4 space-y-1 hover:border-hud-accent/30 transition-all">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pendientes</div>
              <div className="text-2xl font-black text-amber-500">
                {appointments.filter(a => a.status === 'pending').length}
              </div>
              <span className="bg-amber-500/10 text-amber-500 text-[9px] font-bold px-2 py-0.5 rounded inline-block uppercase">
                Por Gestionar
              </span>
            </div>

            <div className="bg-hud-card border border-hud-border/30 rounded-lg p-4 space-y-1 hover:border-hud-accent/30 transition-all">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Historial Archivadas</div>
              <div className="text-2xl font-black text-purple-500">{archived.length}</div>
              <span className="bg-purple-500/10 text-purple-500 text-[9px] font-bold px-2 py-0.5 rounded inline-block uppercase">
                Completadas
              </span>
            </div>
          </div>

          {/* Grid: Charts + Next Appointments + Calendar widget */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Monthly Chart (Left side) */}
            <div className="lg:col-span-8 bg-hud-card border border-hud-border/30 rounded-lg overflow-hidden flex flex-col justify-between">
              <div className="p-4 border-b border-hud-border/20 flex items-center justify-between">
                <h3 className="font-display font-extrabold text-[11px] text-white uppercase tracking-widest flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-hud-accent" /> Flujo Mensual de Citas ({calYear})
                </h3>
                <span className="text-[10px] text-slate-400">Total Programaciones</span>
              </div>
              
              {/* Pure SVG Custom Glowing Column Chart */}
              <div className="p-5 flex-1 flex flex-col justify-end min-h-[170px] select-none">
                <div className="w-full h-36 flex items-end justify-between gap-1.5">
                  {MONTHS.map(m => {
                    const count = monthlyStats[m] || 0;
                    const maxVal = Math.max(1, ...Object.keys(monthlyStats).map(key => monthlyStats[key]));
                    const percentage = (count / maxVal) * 100;
                    return (
                      <div key={m} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                        <div className="relative w-full flex flex-col justify-end h-full">
                          {/* Label tooltip */}
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-900 border border-hud-accent/30 text-white font-mono font-bold text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointers-none">
                            {count} {count === 1 ? 'cita' : 'citas'}
                          </div>
                          {/* Column */}
                          <div 
                            style={{ height: `${percentage}%` }}
                            className="w-full bg-gradient-to-t from-hud-accent to-hud-accent/80 hover:from-white hover:to-white/90 rounded-md transition-all duration-500 shadow-md group-hover:shadow-hud-accent/40"
                          />
                        </div>
                        <span translate="no" className="notranslate text-[9px] uppercase tracking-wider text-slate-500 font-bold group-hover:text-hud-accent transition-colors font-mono">
                          {m.substring(0, 3)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Calendar widget (Right side) */}
            <div className="lg:col-span-4 bg-hud-card border border-[#00ffa3]/25 rounded-lg overflow-hidden flex flex-col">
              <div className="p-4 border-b border-hud-border/20 flex items-center justify-between">
                <h3 className="font-display font-extrabold text-[11px] text-[#00ffa3] uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-hud-green" /> Calendario <span translate="no" className="notranslate">{MONTHS[calMonth]}</span>
                </h3>
                <div className="flex gap-1.5">
                  <button onClick={() => handleCalNav(-1)} className="p-1 text-slate-400 hover:text-white bg-slate-950 border border-slate-800 rounded">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleCalNav(1)} className="p-1 text-slate-400 hover:text-white rounded bg-slate-950 border border-slate-800">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-7 text-center text-[9px] font-bold text-slate-500 uppercase pb-2">
                  {DAYS.map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {calendarCells.map((cell, idx) => {
                    const isToday = cell.dateStr === getTodayString();
                    const isSel = cell.dateStr === selectedDate;
                    return (
                      <button 
                        key={idx}
                        onClick={() => { setSelectedDate(cell.dateStr); setActiveSubTab('calendar'); }}
                        className={`aspect-square flex flex-col justify-between items-center p-1.5 rounded relative text-[10px] font-mono border ${
                          cell.isOtherMonth ? 'opacity-25 border-transparent text-slate-600' : 'border-slate-850 text-slate-350 hover:bg-slate-900/50'
                        } ${isToday ? 'bg-hud-accent/15 border-hud-accent font-bold text-white' : ''} ${isSel ? 'bg-slate-800 border-white text-white' : ''}`}
                      >
                        <span className="leading-none">{cell.dayNum}</span>
                        {/* Event dots */}
                        <div className="flex justify-center gap-0.5 mt-0.5 w-full flex-wrap h-1">
                          {cell.events.slice(0, 3).map(ev => (
                            <span 
                              key={ev.id} 
                              className={`w-1 h-1 rounded-full ${
                                ev.priority === 'urgent' ? 'bg-hud-red' : ev.priority === 'high' ? 'bg-amber-500' : 'bg-hud-accent'
                              }`} 
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>

          {/* Grid row: Next Deliveries list */}
          <div className="bg-hud-card border border-hud-border/30 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-hud-border/20 flex items-center justify-between">
              <h3 className="font-display font-extrabold text-[11px] text-white uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-hud-accent" /> Próximas Citas Programadas ({upcomingAppts.length})
              </h3>
              <button 
                onClick={() => setActiveSubTab('appointments')}
                className="text-hud-accent hover:underline uppercase text-[9.5px] font-bold"
              >
                Administrar Citas →
              </button>
            </div>
            
            {upcomingAppts.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-mono">
                -- No se disponen de citas programadas próximamente --
              </div>
            ) : (
              <div className="divide-y divide-slate-850 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                {upcomingAppts.slice(0, 5).map(appt => {
                  const d = getDaysUntil(appt.date);
                  return (
                    <div key={appt.id} className="p-4 flex items-center justify-between hover:bg-slate-900/25 transition-colors gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex flex-col justify-center items-center text-center text-[10px] text-black ${
                          d <= 0 ? 'bg-hud-red border border-rose-500 font-bold' : d <= 3 ? 'bg-amber-500 border border-amber-300 font-bold' : 'bg-hud-accent border border-sky-400'
                        }`}>
                          <strong className="text-xs block leading-none font-sans">{appt.date.split('-')[2]}</strong>
                          <span translate="no" className="notranslate text-[7.5px] uppercase font-bold tracking-widest">{MONTHS[parseInt(appt.date.split('-')[1])-1].substring(0,3)}</span>
                        </div>
                        <div>
                          <h4 className="font-extrabold text-white text-xs uppercase">{appt.client}</h4>
                          <p className="text-slate-400 text-[11px] line-clamp-1">{appt.desc}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            appt.status === 'confirmed' ? 'bg-hud-green/10 text-hud-green' : 'bg-amber-500/10 text-amber-500'
                          }`}>
                            {appt.status === 'confirmed' ? 'CONFIRMADA' : 'PENDIENTE'}
                          </span>
                          <div className="text-[9.5px] text-slate-500 mt-1 font-mono">{appt.time} · {d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `En ${d}d`}</div>
                        </div>

                        <div className="flex gap-1">
                          <button 
                            onClick={() => handleArchive(appt.id)}
                            className="bg-hud-green/15 text-hud-green border border-hud-green/35 hover:bg-hud-green hover:text-black p-1.5 rounded transition-all"
                            title="Completar y archivar"
                          >
                            <CheckSquare className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ===================== TAB: GESTION CITAS ===================== */}
      {activeSubTab === 'appointments' && (
        <div className="space-y-4">
          <div className="bg-hud-card border border-hud-border/30 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-hud-border/20 flex flex-col sm:flex-row gap-3 items-center justify-between">
              <h3 className="font-display font-extrabold text-[11px] text-white uppercase tracking-widest">
                Gestión Integral de Citas ({appointments.length})
              </h3>
              
              {/* Search bar inside header */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Buscar PV, Cliente o Servicio..."
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); setApptPage(1); }}
                  className="bg-slate-950 border border-slate-800 text-[11px] text-white rounded pl-8 pr-3 py-1.5 w-full outline-none focus:border-hud-accent font-sans"
                />
              </div>
            </div>

            {paginatedAppts.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-mono">
                {appointments.length === 0 ? 'No hay descripciones de entregas registradas' : 'No se encontraron citas con la consulta de búsqueda'}
              </div>
            ) : (
              <div className="divide-y divide-slate-850">
                {paginatedAppts.map(appt => {
                  const d = getDaysUntil(appt.date);
                  const isExp = d < 0;
                  return (
                    <div key={appt.id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-slate-900/10 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className={`w-11 h-11 rounded-lg flex flex-col justify-center items-center text-center text-[10px] text-black shrink-0 ${
                          isExp ? 'bg-slate-700 text-slate-400 border border-slate-600' : d <= 0 ? 'bg-hud-red border border-rose-500 font-bold' : d <= 3 ? 'bg-amber-500 border border-amber-300 font-bold' : 'bg-hud-accent border border-sky-400'
                        }`}>
                          <strong className="text-sm block leading-none font-sans">{appt.date.split('-')[2]}</strong>
                          <span translate="no" className="notranslate text-[7.5px] uppercase font-bold tracking-widest">{MONTHS[parseInt(appt.date.split('-')[1])-1].substring(0,3)}</span>
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-extrabold text-white text-xs uppercase flex items-center gap-1.5 flex-wrap">
                            {appt.client} 
                            <span className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded leading-none uppercase ${
                              appt.priority === 'urgent' ? 'bg-hud-red/20 text-hud-red' : appt.priority === 'high' ? 'bg-amber-500/10 text-amber-500' : 'bg-hud-accent/15 text-hud-accent'
                            }`}>
                              {appt.priority}
                            </span>
                          </h4>
                          <p className="text-slate-350 text-[11px] leading-snug">{appt.desc}</p>
                          {appt.notes && <p className="text-slate-500 text-[10px] bg-slate-950/20 px-2 py-1 rounded inline-block font-sans">{appt.notes}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 self-end md:self-auto shrink-0 w-full md:w-auto justify-between md:justify-end border-t border-slate-900 md:border-t-0 pt-3 md:pt-0">
                        <div className="md:text-right">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            appt.status === 'confirmed' ? 'bg-hud-green/10 text-hud-green' : 'bg-amber-500/10 text-amber-500'
                          }`}>
                            {appt.status === 'confirmed' ? 'CONFIRMADA' : 'PENDIENTE'}
                          </span>
                          <div className="text-[9.5px] text-slate-500 mt-1 font-mono">{appt.time} · {isExp ? 'Cita Pasada' : d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : `En ${d}d`}</div>
                        </div>

                        <div className="flex gap-1.5">
                          <button 
                            onClick={() => handleArchive(appt.id)}
                            className="bg-hud-green/15 text-hud-green border border-hud-green/35 hover:bg-hud-green hover:text-black py-1.5 px-3 rounded text-[10px] font-bold uppercase transition-all flex items-center gap-1"
                            title="Marcar como Completada"
                          >
                            <CheckSquare className="w-3.5 h-3.5" /> Completar
                          </button>
                          <button 
                            onClick={() => handleOpenApptForm(appt)}
                            className="text-slate-400 hover:text-white bg-slate-950 border border-slate-800 p-2 rounded transition-all"
                            title="Editar Cita"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteAppointment(appt.id)}
                            className="text-hud-red hover:text-white hover:bg-hud-red/25 bg-slate-950 border border-slate-800 p-2 rounded transition-all"
                            title="Eliminar Cita"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination footer */}
            {totalApptPages > 1 && (
              <div className="p-4 border-t border-hud-border/20 flex justify-between items-center">
                <span className="text-slate-500 text-[10.5px]">Mostrando citas de la página {apptPage} de {totalApptPages}</span>
                <div className="flex gap-1">
                  <button 
                    disabled={apptPage === 1}
                    onClick={() => setApptPage(p => Math.max(1, p - 1))}
                    className="p-1.5 bg-slate-950 border border-slate-800 rounded disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button 
                    disabled={apptPage === totalApptPages}
                    onClick={() => setApptPage(p => Math.min(totalApptPages, p + 1))}
                    className="p-1.5 bg-slate-950 border border-slate-800 rounded disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== TAB: CALENDARIO INTERACTIVO ===================== */}
      {activeSubTab === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Main Grid Calendar (8 cols inside grid) */}
          <div className="lg:col-span-8 bg-hud-card border border-hud-border/30 rounded-lg overflow-hidden flex flex-col">
            <div className="p-4 border-b border-hud-border/20 flex items-center justify-between">
              <h3 className="font-display font-extrabold text-[12px] text-white uppercase tracking-widest">
                Calendario Operativo: <span translate="no" className="notranslate">{MONTHS[calMonth]}</span> {calYear}
              </h3>
              <div className="flex gap-1.5">
                <button onClick={() => handleCalNav(-1)} className="p-1.5 text-slate-400 hover:text-white bg-slate-950 border border-slate-800 rounded">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => handleCalNav(1)} className="p-1.5 text-slate-400 hover:text-white rounded bg-slate-950 border border-slate-800">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4">
              <div className="grid grid-cols-7 text-center mb-2 font-mono">
                {DAYS.map(d => <div key={d} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest py-1">{d}</div>)}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((cell, idx) => {
                  const isToday = cell.dateStr === getTodayString();
                  const isSel = cell.dateStr === selectedDate;
                  const borderClass = isSel ? 'border-hud-accent bg-slate-900/50' : isToday ? 'border-hud-green bg-hud-green/5' : 'border-slate-850 hover:bg-slate-900/20';

                  return (
                    <button 
                      key={idx}
                      onClick={() => setSelectedDate(cell.dateStr)}
                      className={`min-h-[55px] flex flex-col justify-between items-center p-2 rounded border text-[11px] font-mono transition-all ${
                        cell.isOtherMonth ? 'opacity-20 text-slate-650' : 'text-slate-300'
                      } ${borderClass}`}
                    >
                      <span className={`text-[10.5px] ${isToday ? 'text-hud-green font-bold' : isSel ? 'text-hud-accent font-bold' : 'text-slate-400'}`}>
                        {cell.dayNum}
                      </span>

                      {/* Dots list indicator */}
                      <div className="flex justify-center gap-1 mt-1 w-full flex-wrap max-w-full">
                        {cell.events.slice(0, 4).map(ev => (
                          <span 
                            key={ev.id} 
                            className={`w-1.5 h-1.5 rounded-full shadow-lg ${
                              ev.priority === 'urgent' ? 'bg-hud-red' : ev.priority === 'high' ? 'bg-amber-500' : 'bg-hud-accent'
                            }`}
                            title={`Cita con: ${ev.client} (${ev.time})`}
                          />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
              
              {/* Grid map references */}
              <div className="flex gap-4 pt-4 text-[10px] text-slate-500 justify-start border-t border-slate-900 mt-4 font-mono font-bold">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-hud-accent block shadow-lg"></span> Normal</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 block shadow-lg"></span> Alta prioridad</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-hud-red block shadow-lg animate-pulse"></span> Urgente / Alerta</span>
              </div>
            </div>
          </div>

          {/* Selected Date Appointments sidebar List (4 cols inside grid) */}
          <div className="lg:col-span-4 bg-hud-card border border-hud-border/30 rounded-lg overflow-hidden flex flex-col">
            <div className="p-4 border-b border-hud-border/20 flex flex-col gap-1">
              <h3 className="font-display font-extrabold text-[11px] text-white uppercase tracking-widest flex items-center gap-1">
                <Clock className="w-4 h-4 text-hud-accent" /> Citas de la Fecha
              </h3>
              <p className="text-[10.5px] text-hud-accent font-mono font-bold uppercase">
                {selectedDate ? fmtDateString(selectedDate) : 'Todos los despachos del mes'}
              </p>
            </div>

            {/* List */}
            <div className="p-4 space-y-3 max-h-[480px] overflow-y-auto custom-scrollbar">
              {(() => {
                const dayList = selectedDate 
                  ? appointments.filter(a => a.date === selectedDate).sort((a,b) => a.time.localeCompare(b.time))
                  : appointments.filter(a => a.date.startsWith(`${calYear}-${String(calMonth+1).padStart(2, '0')}`)).sort((a,b) => a.date.localeCompare(b.date));

                if (dayList.length === 0) {
                  return (
                    <div className="p-6 text-center text-slate-500 font-mono italic">
                      No hay rutas calendarizadas para esta selección.
                    </div>
                  );
                }

                return dayList.map(a => {
                  const d = getDaysUntil(a.date);
                  return (
                    <div key={a.id} className="bg-slate-900/35 border border-slate-850 rounded-lg p-3 space-y-2 hover:border-slate-800 transition-all font-sans relative">
                      <div className="flex justify-between items-start gap-1 pb-1.5 border-b border-slate-900">
                        <strong className="text-white text-[11.5px] uppercase font-mono max-w-[150px] truncate">{a.client}</strong>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase leading-none font-mono ${
                          a.priority === 'urgent' ? 'bg-hud-red/20 text-hud-red' : a.priority === 'high' ? 'bg-amber-500/10 text-amber-500' : 'bg-hud-accent/15 text-hud-accent'
                        }`}>
                          {a.priority}
                        </span>
                      </div>
                      
                      <div className="text-[11px] text-slate-400 select-all leading-normal">{a.desc}</div>
                      {a.notes && <div className="text-[10px] text-slate-500 italic">Nota: {a.notes}</div>}
                      
                      <div className="pt-1.5 border-t border-slate-900 flex justify-between items-center text-[10.5px] font-mono">
                        <span className="text-hud-accent font-bold"><i className="far fa-clock"></i> {a.time}</span>
                        <span className="text-slate-500">{d === 0 ? 'Hoy' : d === 1 ? 'Mañana' : d < 0 ? 'Pasada' : `En ${d}d`}</span>
                      </div>

                      {/* Row actions */}
                      <div className="absolute right-2.5 top-2.5 flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleArchive(a.id)}
                          className="bg-hud-green/10 text-hud-green border border-hud-green/20 hover:bg-hud-green hover:text-black p-1 rounded transition-colors"
                          title="Completar"
                        >
                          <CheckSquare className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

        </div>
      )}

      {/* ===================== TAB: CLIENTES AGENDA ===================== */}
      {activeSubTab === 'clients' && (
        <div className="space-y-4">
          <div className="bg-hud-card border border-hud-border/30 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-hud-border/20 flex items-center justify-between">
              <h3 className="font-display font-extrabold text-[11px] text-white uppercase tracking-widest">
                Directorio Especializado de Clientes ({clients.length})
              </h3>
              <button 
                onClick={() => handleOpenClientForm()}
                className="bg-hud-accent text-slate-950 font-black tracking-widest text-[10px] uppercase px-4 py-2 rounded flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Nuevo Cliente
              </button>
            </div>

            {paginatedClients.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-mono">
                No hay clientes registrados en este directorio especial.
              </div>
            ) : (
              <div className="divide-y divide-slate-850">
                {paginatedClients.map(cli => {
                  const cliAppts = appointments.filter(a => a.client.toLowerCase().trim() === cli.name.toLowerCase().trim());
                  const nextAppt = [...cliAppts]
                    .filter(a => getDaysUntil(a.date) >= 0)
                    .sort((a,b) => a.date.localeCompare(b.date))[0];
                  
                  const initials = cli.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();

                  return (
                    <div key={cli.id} className="p-4 flex items-center justify-between hover:bg-slate-900/10 transition-colors gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-hud-accent/15 border border-hud-accent/35 flex items-center justify-center font-bold text-hud-accent text-xs">
                          {initials}
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-extrabold text-white text-xs uppercase">{cli.name}</h4>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400 text-[10.5px]">
                            {cli.phone && <span>📞 {cli.phone}</span>}
                            {cli.email && <span>✉️ {cli.email}</span>}
                            {cli.address && <span>📍 {cli.address}</span>}
                          </div>
                          <p className="text-slate-500 text-[10px] font-sans">
                            {cliAppts.length} cita(s) activa(s) {nextAppt ? `· Próxima: ${fmtDateString(nextAppt.date)} (${nextAppt.time})` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="bg-slate-950 border border-slate-800 text-hud-green text-[10.5px] font-mono font-bold px-3 py-1 rounded">
                          {cliAppts.length} citas
                        </span>
                        
                        <div className="flex gap-1">
                          <button 
                            onClick={() => handleOpenClientForm(cli)}
                            className="text-slate-400 hover:text-white bg-slate-950 border border-slate-800 p-2 rounded transition-all"
                            title="Editar Datos"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleOpenHistory(cli)}
                            className="text-hud-accent hover:text-white bg-slate-950 border border-slate-800 p-2 rounded transition-all"
                            title="Ver Historial"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => handleDeleteClient(cli.id)}
                            className="text-hud-red hover:text-white hover:bg-hud-red/25 bg-slate-950 border border-slate-800 p-2 rounded transition-all"
                            title="Eliminar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination footer */}
            {totalClientPages > 1 && (
              <div className="p-4 border-t border-hud-border/20 flex justify-between items-center">
                <span className="text-slate-500 text-[10.5px]">Mostrando clientes de la página {clientPage} de {totalClientPages}</span>
                <div className="flex gap-1">
                  <button 
                    disabled={clientPage === 1}
                    onClick={() => setClientPage(p => Math.max(1, p - 1))}
                    className="p-1.5 bg-slate-950 border border-slate-800 rounded disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button 
                    disabled={clientPage === totalClientPages}
                    onClick={() => setClientPage(p => Math.min(totalClientPages, p + 1))}
                    className="p-1.5 bg-slate-950 border border-slate-800 rounded disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== TAB: ARCHIVO / COMPLETADAS ===================== */}
      {activeSubTab === 'archive' && (
        <div className="space-y-4 font-mono">
          <div className="bg-hud-card border-2 border-hud-green/30 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-850 bg-hud-green/[0.03] flex items-center justify-between">
              <h3 className="font-display font-extrabold text-[11px] text-hud-green uppercase tracking-widest flex items-center gap-1.5">
                <Archive className="w-4 h-4" /> Registro de Citas Completadas Históricas ({archived.length})
              </h3>
            </div>

            {paginatedArchived.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-mono">
                No hay registros de citas completadas o archivadas en el historial.
              </div>
            ) : (
              <div className="divide-y divide-slate-850">
                {paginatedArchived.map(appt => {
                  return (
                    <div key={appt.id} className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-l-4 border-hud-green hover:bg-hud-green/[0.01] transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 flex flex-col justify-center items-center text-center text-[10px] shrink-0">
                          <strong className="text-sm block leading-none font-sans">{appt.date.split('-')[2]}</strong>
                          <span translate="no" className="notranslate text-[7.5px] uppercase font-bold tracking-widest">{MONTHS[parseInt(appt.date.split('-')[1])-1].substring(0,3)}</span>
                        </div>
                        <div className="space-y-1">
                          <h4 className="font-extrabold text-white text-xs uppercase flex items-center gap-1.5 flex-wrap">
                            {appt.client} 
                            <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded leading-none uppercase bg-hud-green/10 text-hud-green border border-hud-green/20">
                              Leída
                            </span>
                          </h4>
                          <p className="text-slate-400 text-[11px] leading-snug">{appt.desc}</p>
                          {appt.completedAt && (
                            <p className="text-hud-green text-[10px] font-sans flex items-center gap-1 font-bold">
                              ✓ Completada el {appt.completedAt}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 self-end md:self-auto shrink-0 w-full md:w-auto justify-between md:justify-end border-t border-slate-900 md:border-t-0 pt-3 md:pt-0">
                        <div className="md:text-right">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-hud-green/5 text-hud-green border border-hud-green/20">
                            COMPLETADA
                          </span>
                          <div className="text-[9.5px] text-slate-500 mt-1 font-mono">{appt.time} · Programado</div>
                        </div>

                        <div className="flex gap-1.5">
                          <button 
                            onClick={() => handleRestore(appt.id)}
                            className="bg-slate-950 text-slate-400 hover:text-white border border-slate-850 hover:border-slate-700 py-1.5 px-3 rounded text-[10px] font-bold uppercase transition-all"
                            title="Restaurar a pendientes"
                          >
                            Restaurar
                          </button>
                          <button 
                            onClick={() => handleDeleteAppointment(appt.id, true)}
                            className="text-hud-red hover:text-white hover:bg-hud-red/25 bg-slate-950 border border-slate-850 p-2 rounded transition-all"
                            title="Eliminar registro"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination footer */}
            {totalArchivePages > 1 && (
              <div className="p-4 border-t border-slate-850 flex justify-between items-center bg-hud-green/[0.01]">
                <span className="text-slate-500 text-[10.5px]">Mostrando registros archivados de la página {archivePage} de {totalArchivePages}</span>
                <div className="flex gap-1">
                  <button 
                    disabled={archivePage === 1}
                    onClick={() => setArchivePage(p => Math.max(1, p - 1))}
                    className="p-1.5 bg-slate-950 border border-slate-850 rounded disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button 
                    disabled={archivePage === totalArchivePages}
                    onClick={() => setArchivePage(p => Math.min(totalArchivePages, p + 1))}
                    className="p-1.5 bg-slate-950 border border-slate-850 rounded disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== FORM MODAL: ADD / EDIT CITA ===================== */}
      {isApptModalOpen && editingAppt && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-hud-card border border-hud-border/70 rounded-xl w-full max-w-md overflow-hidden animate-fade-in shadow-2xl">
            <div className="bg-slate-950 p-4 border-b border-hud-border/20 flex items-center justify-between">
              <h3 className="font-display font-extrabold text-[#00ffa3] text-xs uppercase tracking-widest">
                {editingAppt.id ? 'EDITAR CITA PROGRAMADA' : 'REGISTRAR NUEVA CITA'}
              </h3>
              <button onClick={() => { setIsApptModalOpen(false); setEditingAppt(null); }} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveAppt} className="p-5 space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 uppercase font-bold block flex justify-between items-center">
                  <span>Cliente / Empresa *</span>
                  <span className="text-[8px] text-[#00ffa3]/80 tracking-normal lowercase normal-case italic font-normal">
                    Filtra abajo para autoseleccionar
                  </span>
                </label>
                <div className="space-y-1.5 bg-slate-900/40 p-2 border border-slate-850 rounded-lg">
                  <input 
                    type="text" 
                    placeholder="🔍 Escribe para filtrar la lista..."
                    value={apptClientSearch}
                    onChange={e => {
                      setApptClientSearch(e.target.value);
                      // If the search text was manually written and they want to register that directly as the client
                      setEditingAppt({ ...editingAppt, client: e.target.value });
                    }}
                    className="bg-slate-950 border border-slate-800 text-white rounded p-2 w-full outline-none focus:border-[#00ffa3] text-[11px]"
                  />
                  
                  <select 
                    required
                    value={editingAppt.client || ''}
                    onChange={e => {
                      setEditingAppt({ ...editingAppt, client: e.target.value });
                      if (e.target.value) {
                        setApptClientSearch(e.target.value);
                      }
                    }}
                    className="bg-slate-950 border border-slate-800 text-white rounded p-2 w-full outline-none focus:border-hud-accent font-bold text-[11px]"
                  >
                    <option value="">-- Seleccionar cliente --</option>
                    
                    {/* If we've typed some search term and have chosen to keep it manually, let's allow it */}
                    {editingAppt.client && !clients.some(c => c.name === editingAppt.client) && !customers.some(c => c.nombre === editingAppt.client) && (
                      <option value={editingAppt.client}>
                        [Personalizado] {editingAppt.client}
                      </option>
                    )}

                    <optgroup label="Clientes de Agenda">
                      {clients
                        .filter(c => {
                          const term = apptClientSearch.toLowerCase().trim();
                          if (!term) return true;
                          return c.name.toLowerCase().includes(term) ||
                                 (c.phone && c.phone.toLowerCase().includes(term)) ||
                                 (c.email && c.email.toLowerCase().includes(term));
                        })
                        .map(c => (
                          <option key={`client-${c.id}`} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                    </optgroup>

                    {customers && customers.length > 0 && (
                      <optgroup label="Malla y Registro de Clientes (General)">
                        {customers
                          .filter(c => {
                            const term = apptClientSearch.toLowerCase().trim();
                            if (!term) return true;
                            return c.nombre.toLowerCase().includes(term) ||
                                   (c.nit && c.nit.toLowerCase().includes(term)) ||
                                   (c.ciudad && c.ciudad.toLowerCase().includes(term));
                          })
                          .map(c => (
                            <option key={`cust-${c.id}`} value={c.nombre}>
                              {c.nombre} ({c.ciudad || 'Sin Ciudad'})
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase font-bold block">Descripción / Servicio *</label>
                <input 
                  type="text" 
                  required
                  value={editingAppt.desc || ''}
                  onChange={e => setEditingAppt({ ...editingAppt, desc: e.target.value })}
                  placeholder="E.g., Entrega de contenedor, despacho muelle 3..."
                  className="bg-slate-950 border border-slate-850 text-white rounded p-2.5 w-full outline-none focus:border-hud-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase block font-bold">Fecha Entrega *</label>
                  <input 
                    type="date" 
                    required
                    value={editingAppt.date || ''}
                    onChange={e => setEditingAppt({ ...editingAppt, date: e.target.value })}
                    className="bg-slate-950 border border-slate-850 text-white rounded p-2 w-full outline-none font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase block font-bold">Hora *</label>
                  <input 
                    type="time" 
                    required
                    value={editingAppt.time || ''}
                    onChange={e => setEditingAppt({ ...editingAppt, time: e.target.value })}
                    className="bg-slate-950 border border-slate-850 text-white rounded p-2 w-full outline-none font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase block font-bold">Prioridad</label>
                  <select 
                    value={editingAppt.priority || 'normal'}
                    onChange={e => setEditingAppt({ ...editingAppt, priority: e.target.value as any })}
                    className="bg-slate-950 border border-slate-850 text-white rounded p-2 w-full outline-none font-bold"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase block font-bold">Estado</label>
                  <select 
                    value={editingAppt.status || 'pending'}
                    onChange={e => setEditingAppt({ ...editingAppt, status: e.target.value as any })}
                    className="bg-slate-950 border border-slate-850 text-white rounded p-2 w-full outline-none font-bold"
                  >
                    <option value="pending">Pendiente</option>
                    <option value="confirmed">Confirmada</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 block uppercase">Notas adicionales</label>
                <textarea 
                  rows={2}
                  value={editingAppt.notes || ''}
                  onChange={e => setEditingAppt({ ...editingAppt, notes: e.target.value })}
                  placeholder="Contacto, muelle asignado, instrucciones de seguridad..."
                  className="bg-slate-950 border border-slate-850 text-white rounded p-2.5 w-full outline-none resize-none font-sans"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => { setIsApptModalOpen(false); setEditingAppt(null); }}
                  className="flex-1 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded py-2.5 font-bold"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-hud-accent text-slate-950 font-black rounded py-2.5 font-bold hover:bg-opacity-90 transition-opacity"
                >
                  {editingAppt.id ? 'GUARDAR CAMBIOS' : 'AÑADIR CITA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== FORM MODAL: ADD / EDIT CLIENTE ===================== */}
      {isClientModalOpen && editingClient && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-hud-card border border-hud-border/70 rounded-xl w-full max-w-sm overflow-hidden animate-fade-in shadow-2xl">
            <div className="bg-slate-950 p-4 border-b border-hud-border/20 flex items-center justify-between">
              <h3 className="font-display font-extrabold text-[#00ffa3] text-xs uppercase tracking-widest">
                {editingClient.id ? 'EDITAR CLIENTE ESPECIAL' : 'NUEVO CLIENTE EN AGENDA'}
              </h3>
              <button onClick={() => { setIsClientModalOpen(false); setEditingClient(null); }} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveClient} className="p-5 space-y-4 text-xs font-mono">
              {/* Import/Autofill helper from central register list */}
              {!editingClient.id && customers && customers.length > 0 && (
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-[#00ffa3]/20 space-y-1.5 mb-2">
                  <label className="text-[9px] text-[#00ffa3] uppercase font-bold block flex items-center gap-1">
                    <span>⚡ Importar de Registro General:</span>
                  </label>
                  <select
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      if (!selectedId) return;
                      const customer = customers.find(c => c.id === selectedId);
                      if (customer) {
                        setEditingClient({
                          ...editingClient,
                          name: customer.nombre,
                          phone: customer.celular || customer.fijo || '',
                          email: customer.email || '',
                          address: customer.dir ? `${customer.dir}${customer.ciudad ? `, ${customer.ciudad}` : ''}` : customer.ciudad || '',
                          notes: `NIT: ${customer.nit || ''} | Contacto: ${customer.contacto || ''} | Malla: ${customer.malla || ''}${customer.obs ? ` | Obs: ${customer.obs}` : ''}`
                        });
                      }
                    }}
                    className="bg-slate-950 border border-slate-800 text-white rounded p-2 w-full outline-none focus:border-hud-accent font-bold text-[10px]"
                  >
                    <option value="">-- Selecciona un cliente de la Malla --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} ({c.ciudad || 'Sin Ciudad'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase font-bold block">Nombre / Empresa *</label>
                <input 
                  type="text" 
                  required
                  value={editingClient.name || ''}
                  onChange={e => setEditingClient({ ...editingClient, name: e.target.value })}
                  placeholder="E.g., Almacenes Pérez Ltda."
                  className="bg-slate-950 border border-slate-850 text-white rounded p-2.5 w-full outline-none focus:border-hud-accent font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase block">Teléfono de contacto</label>
                <input 
                  type="text" 
                  value={editingClient.phone || ''}
                  onChange={e => setEditingClient({ ...editingClient, phone: e.target.value })}
                  placeholder="E.g., 315-111-0001"
                  className="bg-slate-950 border border-slate-850 text-white rounded p-2.5 w-full outline-none focus:border-hud-accent"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase block">Correo electrónico</label>
                <input 
                  type="email" 
                  value={editingClient.email || ''}
                  onChange={e => setEditingClient({ ...editingClient, email: e.target.value })}
                  placeholder="E.g., contacto@correo.com"
                  className="bg-slate-950 border border-slate-850 text-white rounded p-2.5 w-full outline-none focus:border-hud-accent"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase block">Dirección / Sede</label>
                <input 
                  type="text" 
                  value={editingClient.address || ''}
                  onChange={e => setEditingClient({ ...editingClient, address: e.target.value })}
                  placeholder="E.g., Calle 10 #12-30 Cali"
                  className="bg-slate-950 border border-slate-850 text-white rounded p-2.5 w-full outline-none focus:border-hud-accent"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 block uppercase">Notas de Cliente</label>
                <textarea 
                  rows={2}
                  value={editingClient.notes || ''}
                  onChange={e => setEditingClient({ ...editingClient, notes: e.target.value })}
                  placeholder="Requisitos de facturación, muelles de entrega habituales..."
                  className="bg-slate-950 border border-slate-850 text-white rounded p-2.5 w-full outline-none resize-none font-sans"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => { setIsClientModalOpen(false); setEditingClient(null); }}
                  className="flex-1 bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded py-2.5 font-bold"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-hud-accent text-slate-950 font-black rounded py-2.5 font-bold hover:bg-opacity-90 transition-opacity"
                >
                  {editingClient.id ? 'ACTUALIZAR' : 'REGISTRAR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== HISTORY MODAL: CLIENT HISTORY ===================== */}
      {isHistoryModalOpen && historyClient && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 font-mono">
          <div className="bg-hud-card border border-hud-border/70 rounded-xl w-full max-w-md overflow-hidden animate-fade-in shadow-2xl">
            <div className="bg-slate-950 p-4 border-b border-hud-border/20 flex items-center justify-between">
              <h3 className="font-display font-extrabold text-[#00ffa3] text-xs uppercase tracking-widest flex items-center gap-1">
                <History className="w-4 h-4" /> Historial de {historyClient.name}
              </h3>
              <button onClick={() => { setIsHistoryModalOpen(false); setHistoryClient(null); }} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <div className="p-5 space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">
              {(() => {
                const clientName = historyClient.name.toLowerCase().trim();
                const historyList = [
                  ...appointments.filter(a => a.client.toLowerCase().trim() === clientName),
                  ...archived.filter(a => a.client.toLowerCase().trim() === clientName)
                ].sort((a,b) => b.date.localeCompare(a.date));

                if (historyList.length === 0) {
                  return (
                    <div className="p-4 text-center text-slate-500 italic text-[11px]">
                      No sé registran citas calendarizadas en el historial para este cliente.
                    </div>
                  );
                }

                return historyList.map(a => {
                  const isCompleted = archived.some(x => x.id === a.id);
                  return (
                    <div key={a.id} className="p-3 bg-slate-900/40 border border-slate-850 rounded-lg space-y-1.5 text-xs text-slate-350">
                      <div className="flex justify-between items-center pb-1 border-b border-slate-900 text-[10.5px]">
                        <strong className="text-hud-accent">{fmtDateString(a.date)} · {a.time}</strong>
                        <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded leading-none ${
                          isCompleted ? 'bg-hud-green/10 text-hud-green' : 'bg-amber-500/10 text-amber-500'
                        }`}>
                          {isCompleted ? 'COMPLETADA' : 'PENDIENTE'}
                        </span>
                      </div>
                      <p className="font-sans leading-relaxed text-[11.5px] text-white">{a.desc}</p>
                      {a.notes && <p className="text-slate-500 text-[10px] italic">Soporte: {a.notes}</p>}
                    </div>
                  );
                });
              })()}
            </div>

            <div className="p-4 border-t border-slate-900 bg-slate-950 flex justify-end">
              <button 
                onClick={() => { setIsHistoryModalOpen(false); setHistoryClient(null); }} 
                className="bg-slate-950 border border-slate-800 text-slate-300 hover:text-white rounded py-2 px-4 font-bold text-xs"
              >
                Cerrar Historial
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== CUSTOM CONFIRMATION DIALOG MODAL ===================== */}
      {confirmState.isOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b1329] border border-red-500/30 rounded-xl w-full max-w-sm overflow-hidden animate-fade-in shadow-2xl">
            <div className="bg-slate-950 p-4 border-b border-red-500/20 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 animate-pulse" />
              <h3 className="font-display font-extrabold text-red-500 text-xs uppercase tracking-widest">
                {confirmState.title}
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-slate-300 text-xs leading-relaxed font-mono">
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

    </div>
  );
}
