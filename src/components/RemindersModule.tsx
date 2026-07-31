/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Reminder } from '../types';
import { 
  Bell, Plus, Calendar, AlertTriangle, CheckSquare, Square, Trash2, Clock 
} from 'lucide-react';
import { 
  sendPushNotification, 
  requestNotificationPermission, 
  getNotificationPermission, 
  isNotificationSupported,
  checkAndNotifyDueEvents
} from '../notificationService';

interface RemindersModuleProps {
  reminders: Reminder[];
  onAddReminder: (reminder: Reminder) => void;
  onToggleReminder: (id: string) => void;
  onDeleteReminder: (id: string) => void;
}

export default function RemindersModule({ 
  reminders, onAddReminder, onToggleReminder, onDeleteReminder 
}: RemindersModuleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [dueDt, setDueDt] = useState('');
  const [priority, setPriority] = useState<'Alta' | 'Media' | 'Baja'>('Alta');
  const [permission, setPermission] = useState(getNotificationPermission());

  // Periodically check for due alerts
  useEffect(() => {
    // Check immediately on mount/update
    checkAndNotifyDueEvents(reminders, [], []);

    const interval = setInterval(() => {
      checkAndNotifyDueEvents(reminders, [], []);
    }, 15000); // Check every 15 seconds

    return () => clearInterval(interval);
  }, [reminders]);

  const handleRequestPermission = async () => {
    const res = await requestNotificationPermission();
    setPermission(res);
    sendPushNotification("Notificaciones Activadas", "¡Excelente! Ahora recibirás avisos importantes de tus recordatorios.", "system");
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newReminder: Reminder = {
      id: `REM-${100 + reminders.length + 1}`,
      titulo: title,
      desc,
      fecha: dueDt || new Date().toISOString().substring(0, 16),
      prioridad: priority,
      completado: false
    };

    onAddReminder(newReminder);

    // Instant Push Notification check
    sendPushNotification(
      `Nuevo Recordatorio: ${title}`,
      `Prioridad: ${priority}. Programado para: ${new Date(newReminder.fecha).toLocaleString()}`,
      'reminder'
    );

    setTitle('');
    setDesc('');
    setDueDt('');
    setPriority('Alta');
    setIsOpen(false);
  };

  const handleToggle = (id: string) => {
    const rem = reminders.find(r => r.id === id);
    if (rem) {
      const nextCompleted = !rem.completado;
      sendPushNotification(
        `Alerta ${nextCompleted ? 'Completada' : 'Reabierta'}`,
        `"${rem.titulo}" ha sido marcada como ${nextCompleted ? 'resuelta' : 'pendiente'}.`,
        'reminder'
      );
    }
    onToggleReminder(id);
  };

  return (
    <div className="space-y-6 animate-fade-in font-mono text-slate-100">
      
      {/* Dynamic Push Notifications Permission Widget */}
      {permission !== 'granted' ? (
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-amber-950/35 border-2 border-[#ffab00]/25 p-4 rounded-xl text-xs text-slate-300 justify-between shadow-lg">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-hud-orange animate-bounce" />
            <div className="space-y-0.5">
              <p className="font-bold text-white uppercase tracking-wider text-[11px]">¿Deseas activar Recordatorios de Escritorio (Push)?</p>
              <p className="text-[10px] text-slate-400">Recibirás alertas acústicas y visuales al cumplirse la fecha de fletes, cobros o vencimientos.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestPermission}
            className="px-4 py-2 bg-hud-orange text-slate-950 font-black rounded-lg transition-all hover:scale-105 active:scale-95 text-[10px] uppercase tracking-wider cursor-pointer font-bold whitespace-nowrap"
          >
            Activar Notificaciones
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-slate-950/45 border border-slate-900 px-4 py-2 rounded-lg text-[9.5px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Avisos Push activos en tu navegador</span>
          </div>
          <button 
            type="button"
            onClick={() => sendPushNotification("Prueba de Alerta", "Las alertas push automáticas ya están en funcionamiento.", "reminder")} 
            className="text-[8.5px] hover:text-[#00ffa3] underline font-bold uppercase transition"
          >
            Enviar Notificación de Prueba
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-900">
        <div className="space-y-1">
          <h2 className="text-xl font-display font-extrabold text-[#ffab00] tracking-widest flex items-center gap-2 uppercase">
            <Bell className="w-5 h-5 text-hud-orange" /> Centro de Recordatorios de Alertas
          </h2>
          <p className="text-xs text-slate-400">Verificaciones de flujos de flete, vencimiento de pólizas y cobros</p>
        </div>

        <button 
          onClick={() => setIsOpen(prev => !prev)}
          className="bg-[#ffab00] hover:bg-[#ffab00]/80 text-slate-950 font-black font-mono tracking-widest px-5 py-2.5 text-xs rounded-lg transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Nuevo Recordatorio
        </button>
      </div>

      {isOpen && (
        <form onSubmit={handleCreate} className="bg-hud-card border-2 border-hud-orange rounded-lg p-5 space-y-4 max-w-sm mx-auto shadow-2xl animate-fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-xs font-display font-extrabold text-hud-orange tracking-widest uppercase">
              Programar Alerta Crítica
            </h3>
            <button type="button" onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">✕</button>
          </div>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] text-hud-orange font-bold uppercase block">Título *</label>
              <input 
                type="text" 
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="E.g., Cobrar fletes FP-1200"
                className="bg-slate-950 border border-slate-800 text-white rounded p-2 w-full outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 uppercase block">Detalles adicionales</label>
              <textarea 
                rows={2}
                value={desc}
                onChange={e => setDesc(e.target.value)}
                placeholder="Indique códigos de PV vinculados..."
                className="bg-slate-950 border border-slate-800 text-white rounded p-2 w-full outline-none resize-none font-sans"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase block">Sugerido el</label>
                <input 
                  type="datetime-local" 
                  value={dueDt}
                  onChange={e => setDueDt(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white rounded p-1.5 w-full outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase block">Prioridad</label>
                <select 
                  value={priority}
                  onChange={e => setPriority(e.target.value as any)}
                  className="bg-slate-950 border border-slate-800 text-white rounded p-1.5 w-full outline-none"
                >
                  <option value="Alta">🔴 Alta</option>
                  <option value="Media">🟡 Media</option>
                  <option value="Baja">🟢 Baja</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="submit" className="bg-[#ffab00] hover:bg-[#ffab00]/80 text-slate-950 font-bold text-xs px-4 py-2 rounded w-full">
              GUARDAR ALERTA
            </button>
          </div>
        </form>
      )}

      {/* Grid of alarms */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reminders.length === 0 ? (
          <div className="col-span-2 bg-hud-card p-12 text-center text-xs text-slate-500 font-mono border border-slate-900 rounded-lg">
            -- No hay alertas programadas por el momento --
          </div>
        ) : (
          reminders.map(rem => (
            <div 
              key={rem.id}
              className={`bg-hud-card border border-hud-border/70 rounded-lg p-5 flex items-start gap-4 shadow-lg transition-all relative overflow-hidden ${
                rem.completado ? 'opacity-50 line-through' : ''
              }`}
            >
              {/* Checkbox block click */}
              <button 
                onClick={() => handleToggle(rem.id)}
                className="text-slate-400 hover:text-white cursor-pointer mt-1"
              >
                {rem.completado ? (
                  <CheckSquare className="w-5 h-5 text-hud-green" />
                ) : (
                  <Square className="w-5 h-5 text-slate-650" />
                )}
              </button>

              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[8.5px] font-bold px-2 py-0.2 rounded border uppercase ${
                    rem.prioridad === 'Alta' ? 'bg-rose-500/10 border-rose-500 text-rose-500' :
                    rem.prioridad === 'Media' ? 'bg-[#ff9100]/15 border-[#ff9100]/40 text-[#ff9100]' :
                    'bg-hud-green/10 border-hud-green text-hud-green'
                  }`}>
                    {rem.prioridad}
                  </span>
                  <span className="text-[10px] text-slate-550 font-bold">{rem.id}</span>
                </div>

                <h3 className="text-xs font-bold text-white uppercase tracking-wider font-sans">
                  {rem.titulo}
                </h3>

                <p className="text-[11px] text-slate-400 font-sans">
                  {rem.desc}
                </p>

                <div className="flex items-center gap-1 text-[9px] text-slate-500 pt-1">
                  <Calendar className="w-3 h-3" />
                  <span>Avisar el: {new Date(rem.fecha).toLocaleString()}</span>
                </div>
              </div>

              {/* Delete trash button */}
              <button 
                onClick={() => onDeleteReminder(rem.id)}
                className="text-[#ef4444] hover:bg-rose-500/10 p-1.5 rounded transition-all absolute right-4 bottom-4 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
