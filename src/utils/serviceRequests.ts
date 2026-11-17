// Lógica pura de la bandeja de solicitudes (asistente, fase 2). Las reglas que
// importan de verdad viven en la base de datos (migraciones 042/043); aquí solo se
// anticipan para avisar al gestor antes de llamar a la RPC.

import type { Client, ServiceOrder } from '../types';
import type {
  PreferredSlot,
  ServiceRequest,
  ServiceRequestProposal,
  ServiceRequestStatus,
} from '../types/serviceRequest';

export const STATUS_META: Record<ServiceRequestStatus, { label: string; cls: string }> = {
  borrador:   { label: 'En curso',   cls: 'bg-sunken text-ink-soft' },
  pendiente:  { label: 'Pendiente',  cls: 'bg-amber-100 text-amber-800' },
  confirmada: { label: 'Confirmada', cls: 'bg-green-100 text-green-800' },
  rechazada:  { label: 'Rechazada',  cls: 'bg-red-100 text-red-700' },
  cancelada:  { label: 'Cancelada',  cls: 'bg-sunken text-ink-faint' },
};

export const CHANNEL_LABEL: Record<string, string> = {
  web: 'Chat web',
  whatsapp: 'WhatsApp',
  manual: 'Llamada',
};

/** Roles que la app deja asignar a una orden (UserSearchModal) y que acepta confirm_service_request. */
export const ASSIGNABLE_ROLES = ['admin', 'supervisor', 'technician'] as const;

export const DURATION_OPTIONS = [30, 60, 90, 120, 180, 240, 360, 480];

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/** 'HH:MM:SS' o 'H:MM' → 'HH:MM'; null si no es una hora válida. */
export function toHHMM(value?: string | null): string | null {
  const m = TIME_RE.exec(value ?? '');
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToHHMM(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Etiqueta legible de una duración en minutos: 90 → "1 h 30 min". */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Fecha local del navegador como YYYY-MM-DD. */
export function localISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function preferredSlotsList(slots: ServiceRequest['preferredSlots']): PreferredSlot[] {
  return Array.isArray(slots) ? slots.filter(s => s && typeof s === 'object') : [];
}

/** Franjas preferidas como texto para mostrar. */
export function formatPreferredSlots(slots: ServiceRequest['preferredSlots']): string[] {
  if (typeof slots === 'string') return slots.trim() ? [slots.trim()] : [];
  return preferredSlotsList(slots)
    .map(s => [s.date, toHHMM(s.time)].filter(Boolean).join(' · '))
    .filter(Boolean);
}

/** Propuesta inicial: la del asistente si existe; si no, la primera franja preferida; si no, mañana a las 08:00. */
export function initialProposal(request: ServiceRequest, now: Date): ServiceRequestProposal {
  const first = preferredSlotsList(request.preferredSlots)[0];
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const date =
    (request.proposedDate && DATE_RE.test(request.proposedDate) ? request.proposedDate.slice(0, 10) : null) ??
    (first?.date && DATE_RE.test(first.date) ? first.date.slice(0, 10) : null) ??
    localISODate(tomorrow);
  const time = toHHMM(request.proposedTime) ?? toHHMM(first?.time) ?? '08:00';
  const durationMinutes = request.proposedDurationMinutes && request.proposedDurationMinutes >= 15
    ? request.proposedDurationMinutes
    : 60;
  return { date, time, durationMinutes, technicianId: request.proposedTechnicianId ?? '' };
}

/**
 * Órdenes no cerradas del técnico que se solapan con la propuesta. Mismo criterio
 * que technician_busy_intervals (043) y AvailabilityModal: una orden sin fin válido
 * ocupa una hora.
 */
export function technicianConflicts(orders: ServiceOrder[], p: ServiceRequestProposal): ServiceOrder[] {
  if (!p.technicianId || !DATE_RE.test(p.date) || !toHHMM(p.time)) return [];
  const start = timeToMinutes(toHHMM(p.time)!);
  const end = start + p.durationMinutes;
  return orders.filter(o => {
    if (o.technicianId !== p.technicianId || o.status === 'Cerrado') return false;
    if ((o.scheduledDate ?? '').slice(0, 10) !== p.date) return false;
    const os = toHHMM(o.timeSlot);
    if (!os) return false;
    const oStart = timeToMinutes(os);
    const oe = toHHMM(o.scheduledEndTime);
    const oEnd = oe && timeToMinutes(oe) > oStart ? timeToMinutes(oe) : oStart + 60;
    return oStart < end && start < oEnd;
  });
}

/** Error legible si la propuesta no se puede confirmar; null si está completa. */
export function validateProposal(p: ServiceRequestProposal, now: Date): string | null {
  if (!DATE_RE.test(p.date) || !toHHMM(p.time)) return 'Elige fecha y hora.';
  if (!p.technicianId) return 'Elige el técnico.';
  if (!Number.isFinite(p.durationMinutes) || p.durationMinutes < 15 || p.durationMinutes > 720) {
    return 'La duración debe estar entre 15 minutos y 12 horas.';
  }
  const start = timeToMinutes(toHHMM(p.time)!);
  if (start + p.durationMinutes > 24 * 60 - 1) return 'El servicio debe terminar el mismo día.';
  const today = localISODate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (p.date < today || (p.date === today && start < nowMinutes)) return 'No se puede agendar en el pasado.';
  return null;
}

export type ClientResolution =
  | { kind: 'linked'; client: Client }
  | { kind: 'match'; client: Client }
  | { kind: 'new'; name: string };

/**
 * Anticipa qué cliente usará confirm_service_request (043): el enlazado si sigue
 * existiendo; si no, uno con la misma identificación o correo; si no, uno nuevo
 * (con sufijo si el nombre ya existe).
 */
export function resolveClient(request: ServiceRequest, clients: Client[]): ClientResolution {
  if (request.clientId) {
    const linked = clients.find(c => c.id === request.clientId);
    if (linked) return { kind: 'linked', client: linked };
  }
  const ident = (request.contactIdentification ?? '').trim();
  const email = (request.contactEmail ?? '').trim().toLowerCase();
  const match = clients
    .filter(c => (ident && c.identification === ident) || (email && (c.email ?? '').toLowerCase() === email))
    .sort((a, b) => String((a as { createdAt?: string }).createdAt ?? '').localeCompare(String((b as { createdAt?: string }).createdAt ?? '')))[0];
  if (match) return { kind: 'match', client: match };

  const base = (request.contactName ?? '').trim();
  if (clients.some(c => c.name === base)) {
    const suffix = ident || email || (request.contactPhone ?? '').trim() || request.id.slice(0, 8);
    return { kind: 'new', name: `${base} (${suffix})` };
  }
  return { kind: 'new', name: base };
}

/** Texto visible de un mensaje de la transcripción; null para llamadas/resultados de herramientas. */
export function transcriptText(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object' && typeof (content as { text?: unknown }).text === 'string') {
    return (content as { text: string }).text;
  }
  return null;
}

export function filterRequests(
  requests: ServiceRequest[],
  status: ServiceRequestStatus | 'todas',
  query: string,
): ServiceRequest[] {
  const q = query.trim().toLowerCase();
  return requests.filter(r => {
    if (status !== 'todas' && r.status !== status) return false;
    if (!q) return true;
    return [r.contactName, r.contactPhone, r.contactEmail, r.serviceName, r.description]
      .some(v => (v ?? '').toLowerCase().includes(q));
  });
}
