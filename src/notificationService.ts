/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Helper to check if standard Notifications are supported
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

// Request permission to use Web Notifications
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) {
    console.warn("Notifications are not supported in this browser.");
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error("Error requesting notification permission:", err);
    return 'default';
  }
}

// Check current permission state
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

// Send standard push notification with fallback to console
export function sendPushNotification(title: string, body: string, iconType: 'reminder' | 'novedad' | 'cita' | 'system' = 'system') {
  if (!isNotificationSupported()) {
    console.log(`[Notification Fallback] ${title}: ${body}`);
    return false;
  }

  // Define emoji/icon indicators depending on type
  const emojis = {
    reminder: '🔔',
    novedad: '🚨',
    cita: '📅',
    system: '⚡',
  };

  const formattedTitle = `${emojis[iconType]} ${title}`;

  if (Notification.permission === 'granted') {
    try {
      new Notification(formattedTitle, {
        body,
        icon: '/favicon.ico',
        tag: `lp-${iconType}-${Date.now()}`,
      });
      return true;
    } catch (e) {
      console.warn("Fallo al enviar notificación nativa (posible iframe sandbox restrictivo):", e);
      return false;
    }
  } else {
    console.log(`[Notification Muted - Permission: ${Notification.permission}] ${formattedTitle}: ${body}`);
    return false;
  }
}

// In-memory or session-based tracking of already notified events to prevent spam
const alertedEventIdsSet = new Set<string>();

/**
 * Checks for upcoming due reminders, appointments or open emergencies and fires push notifications.
 * @param reminders list of Reminder items
 * @param appointments list of Cita items
 * @param novedades list of Novedad items
 */
export function checkAndNotifyDueEvents(
  reminders: any[],
  appointments: any[],
  novedades: any[]
) {
  const now = new Date();
  
  // 1. Check Reminders (Recordatorios)
  // Check if a reminder's date is today/past/due soon (within 30 mins) and not completed
  reminders.forEach((rem) => {
    if (rem.completado) return;
    
    const remKey = `rem-${rem.id}`;
    if (alertedEventIdsSet.has(remKey)) return;

    try {
      const remDate = new Date(rem.fecha);
      const diffMinutes = (remDate.getTime() - now.getTime()) / (1000 * 60);

      // Notify if due soon (within 30 mins) or overdue
      if (diffMinutes <= 30 && diffMinutes >= -120) {
        sendPushNotification(
          `Recordatorio Próximo (${rem.prioridad})`,
          `"${rem.titulo}" está programado para hoy: ${rem.desc || 'Sin descripción adicional'}`,
          'reminder'
        );
        alertedEventIdsSet.add(remKey);
      }
    } catch (e) {
      // Avoid date parse breaks
    }
  });

  // 2. Check Appointments (Citas)
  // Check if an appointment is due today and within 1 hour
  appointments.forEach((cita) => {
    if (cita.status === 'confirmed' && cita.completedAt) return; // Skip finished

    const citaKey = `cita-${cita.id}`;
    if (alertedEventIdsSet.has(citaKey)) return;

    try {
      // Date is formatted of shape: YYYY-MM-DD, Time is HH:MM
      const citaDateTimeStr = `${cita.date}T${cita.time || '00:00'}`;
      const citaDate = new Date(citaDateTimeStr);
      const diffMinutes = (citaDate.getTime() - now.getTime()) / (1000 * 60);

      // Notify if scheduled today within next 60 minutes or slightly past
      if (diffMinutes <= 60 && diffMinutes >= -30) {
        sendPushNotification(
          `Cita Próxima: ${cita.client}`,
          `Hito de hoy a las ${cita.time}: "${cita.desc}"`,
          'cita'
        );
        alertedEventIdsSet.add(citaKey);
      }
    } catch (e) {
      // Skip
    }
  });

  // 3. Check Emergencies in Novedades (Incidencias críticas abiertas)
  novedades.forEach((nov) => {
    if (nov.estado !== 'Abierta') return;

    const novKey = `nov-${nov.id}`;
    if (alertedEventIdsSet.has(novKey)) return;

    // Trigger instant check for incident level types
    if (nov.tipo?.includes('🚨') || nov.tipo?.includes('Incidencia')) {
      sendPushNotification(
        `Novedad Crítica Pendiente`,
        `${nov.cliente || 'Muelle'}: ${nov.titulo} (Responsable: ${nov.responsable})`,
        'novedad'
      );
      alertedEventIdsSet.add(novKey);
    }
  });
}
