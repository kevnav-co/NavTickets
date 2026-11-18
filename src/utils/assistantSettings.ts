// Configuración del asistente por empresa (tabla assistant_settings, migración
// 042). Lógica pura: conversión fila ↔ formulario, valores por defecto y la misma
// validación que hacen los CHECK de la base (assistant_working_hours_valid y
// assistant_service_types_valid), para avisar al administrador antes de guardar.
// La base sigue siendo la que decide: si algo se escapa, el upsert falla.

export type DayKey = '1' | '2' | '3' | '4' | '5' | '6' | '7';
export type TimeRange = [string, string];
export type WorkingHours = Partial<Record<DayKey, TimeRange[]>>;
export type OrderType = 'Correctivo' | 'Preventivo';
export type SlotStep = 15 | 30 | 60;

export interface AssistantServiceType {
  id: string;
  name: string;
  orderType: OrderType;
  durationMinutes: number;
}

export interface AssistantSettingsForm {
  timezone: string;
  workingHours: WorkingHours;
  serviceTypes: AssistantServiceType[];
  blockedDates: string[];
  minLeadHours: number;
  slotStepMinutes: SlotStep;
  maxDaysAhead: number;
  technicianIds: string[];
  welcomeMessage: string;
  retentionDays: number;
}

/** Días en orden ISO (1 = lunes), como las claves de working_hours. */
export const DAYS: { key: DayKey; label: string; short: string }[] = [
  { key: '1', label: 'Lunes', short: 'Lun' },
  { key: '2', label: 'Martes', short: 'Mar' },
  { key: '3', label: 'Miércoles', short: 'Mié' },
  { key: '4', label: 'Jueves', short: 'Jue' },
  { key: '5', label: 'Viernes', short: 'Vie' },
  { key: '6', label: 'Sábado', short: 'Sáb' },
  { key: '7', label: 'Domingo', short: 'Dom' },
];

export const SLOT_STEPS: SlotStep[] = [15, 30, 60];

export const LIMITS = {
  services: 50,
  serviceName: 120,
  durationMin: 15,
  durationMax: 720,
  leadHoursMax: 720,
  daysAheadMax: 180,
  retentionMin: 7,
  retentionMax: 730,
  welcome: 1000,
  blockedDates: 366,
  rangesPerDay: 6,
} as const;

/** Los mismos valores por defecto que las columnas de la migración 042. */
export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettingsForm = {
  timezone: 'America/Bogota',
  workingHours: {
    '1': [['08:00', '12:00'], ['13:00', '17:00']],
    '2': [['08:00', '12:00'], ['13:00', '17:00']],
    '3': [['08:00', '12:00'], ['13:00', '17:00']],
    '4': [['08:00', '12:00'], ['13:00', '17:00']],
    '5': [['08:00', '12:00'], ['13:00', '17:00']],
    '6': [['08:00', '12:00']],
  },
  serviceTypes: [
    { id: 'mantenimiento-preventivo', name: 'Mantenimiento preventivo', orderType: 'Preventivo', durationMinutes: 120 },
    { id: 'reparacion', name: 'Revisión y reparación', orderType: 'Correctivo', durationMinutes: 120 },
  ],
  blockedDates: [],
  minLeadHours: 24,
  slotStepMinutes: 30,
  maxDaysAhead: 30,
  technicianIds: [],
  welcomeMessage: 'Hola, soy el asistente de servicio técnico. ¿En qué te puedo ayudar?',
  retentionDays: 180,
};

const START_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const END_RE = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SERVICE_ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

/** 'HH:MM' → minutos desde medianoche (24:00 = 1440). */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const isDayKey = (k: string): k is DayKey => /^[1-7]$/.test(k);

const asNumber = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback;

function parseWorkingHours(v: unknown): WorkingHours {
  const raw = typeof v === 'string' ? safeJson(v) : v;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: WorkingHours = {};
  for (const [k, ranges] of Object.entries(raw as Record<string, unknown>)) {
    if (!isDayKey(k) || !Array.isArray(ranges)) continue;
    out[k] = ranges
      .filter((r): r is [unknown, unknown] => Array.isArray(r) && r.length === 2)
      .map(([a, b]) => [String(a), String(b)] as TimeRange);
  }
  return out;
}

function parseServiceTypes(v: unknown): AssistantServiceType[] {
  const raw = typeof v === 'string' ? safeJson(v) : v;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .map(s => ({
      id: String(s.id ?? ''),
      name: String(s.name ?? ''),
      orderType: s.orderType === 'Preventivo' ? 'Preventivo' : 'Correctivo',
      durationMinutes: asNumber(s.durationMinutes, 60),
    }));
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Fila de assistant_settings (snake_case, tal como la devuelve PostgREST) →
 * formulario. Sin fila, los valores por defecto de la 042.
 */
export function settingsFromRow(row: Record<string, unknown> | null | undefined): AssistantSettingsForm {
  if (!row) return structuredClone(DEFAULT_ASSISTANT_SETTINGS);
  const d = DEFAULT_ASSISTANT_SETTINGS;
  const step = asNumber(row.slot_step_minutes, d.slotStepMinutes);
  return {
    timezone: typeof row.timezone === 'string' && row.timezone ? row.timezone : d.timezone,
    workingHours: parseWorkingHours(row.working_hours),
    serviceTypes: parseServiceTypes(row.service_types),
    blockedDates: Array.isArray(row.blocked_dates) ? row.blocked_dates.map(String).sort() : [],
    minLeadHours: asNumber(row.min_lead_hours, d.minLeadHours),
    slotStepMinutes: (SLOT_STEPS as number[]).includes(step) ? (step as SlotStep) : d.slotStepMinutes,
    maxDaysAhead: asNumber(row.max_days_ahead, d.maxDaysAhead),
    technicianIds: Array.isArray(row.technician_ids) ? row.technician_ids.map(String) : [],
    welcomeMessage: typeof row.welcome_message === 'string' ? row.welcome_message : d.welcomeMessage,
    retentionDays: asNumber(row.retention_days, d.retentionDays),
  };
}

/** Formulario → columnas de assistant_settings para el upsert. Quita días sin franjas. */
export function settingsToRow(s: AssistantSettingsForm, companyId: string, updatedBy: string | null) {
  const workingHours: WorkingHours = {};
  for (const { key } of DAYS) {
    const ranges = s.workingHours[key];
    if (ranges && ranges.length > 0) {
      workingHours[key] = [...ranges].sort((a, b) => hhmmToMinutes(a[0]) - hhmmToMinutes(b[0]));
    }
  }
  return {
    company_id: companyId,
    timezone: s.timezone.trim(),
    working_hours: workingHours,
    service_types: s.serviceTypes.map(t => ({
      id: t.id,
      name: t.name.trim(),
      orderType: t.orderType,
      durationMinutes: Math.round(t.durationMinutes),
    })),
    blocked_dates: [...new Set(s.blockedDates)].sort(),
    min_lead_hours: Math.round(s.minLeadHours),
    slot_step_minutes: s.slotStepMinutes,
    max_days_ahead: Math.round(s.maxDaysAhead),
    technician_ids: [...new Set(s.technicianIds)],
    welcome_message: s.welcomeMessage.trim(),
    retention_days: Math.round(s.retentionDays),
    updated_by: updatedBy,
  };
}

/**
 * Id estable de un servicio nuevo a partir de su nombre ("Revisión de bomba" →
 * "revision-de-bomba"), único entre los existentes. Los servicios ya guardados
 * conservan su id al renombrarlos: las solicitudes lo referencian.
 */
export function serviceIdFromName(name: string, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  let base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  if (!base) base = 'servicio';
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface SettingsValidation {
  errors: string[];
  warnings: string[];
}

const dayLabel = (k: DayKey) => DAYS.find(d => d.key === k)!.label;

/**
 * Valida el formulario con las mismas reglas que la base (más algunas que la base
 * no comprueba pero que dejarían al asistente sin huecos). `errors` impide
 * guardar; `warnings` solo avisa.
 */
export function validateAssistantSettings(s: AssistantSettingsForm): SettingsValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Horario
  let longestRange = 0;
  let openDays = 0;
  for (const { key } of DAYS) {
    const ranges = s.workingHours[key] ?? [];
    if (ranges.length === 0) continue;
    openDays++;
    if (ranges.length > LIMITS.rangesPerDay) {
      errors.push(`${dayLabel(key)}: máximo ${LIMITS.rangesPerDay} franjas.`);
    }
    const parsed: [number, number][] = [];
    for (const [start, end] of ranges) {
      if (!START_RE.test(start) || !END_RE.test(end)) {
        errors.push(`${dayLabel(key)}: la franja ${start || '—'}–${end || '—'} no tiene horas válidas (HH:MM).`);
        continue;
      }
      const a = hhmmToMinutes(start);
      const b = hhmmToMinutes(end);
      if (a >= b) {
        errors.push(`${dayLabel(key)}: la franja ${start}–${end} debe terminar después de empezar.`);
        continue;
      }
      parsed.push([a, b]);
      longestRange = Math.max(longestRange, b - a);
    }
    parsed.sort((x, y) => x[0] - y[0]);
    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i][0] < parsed[i - 1][1]) {
        errors.push(`${dayLabel(key)}: hay franjas que se cruzan.`);
        break;
      }
    }
  }
  if (openDays === 0) {
    errors.push('Define al menos un día de atención: sin horario el asistente no ofrece citas.');
  }

  // Servicios
  if (s.serviceTypes.length === 0) {
    errors.push('Añade al menos un servicio.');
  } else if (s.serviceTypes.length > LIMITS.services) {
    errors.push(`Máximo ${LIMITS.services} servicios.`);
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  s.serviceTypes.forEach((t, i) => {
    const label = t.name.trim() || `Servicio ${i + 1}`;
    if (!SERVICE_ID_RE.test(t.id)) errors.push(`${label}: identificador interno no válido.`);
    if (ids.has(t.id)) errors.push(`${label}: identificador interno repetido.`);
    ids.add(t.id);
    const name = t.name.trim();
    if (name.length < 1 || name.length > LIMITS.serviceName) {
      errors.push(`Servicio ${i + 1}: el nombre debe tener entre 1 y ${LIMITS.serviceName} caracteres.`);
    }
    const key = name.toLocaleLowerCase('es');
    if (name && names.has(key)) errors.push(`${label}: hay dos servicios con el mismo nombre.`);
    names.add(key);
    if (t.orderType !== 'Correctivo' && t.orderType !== 'Preventivo') {
      errors.push(`${label}: el tipo debe ser Correctivo o Preventivo.`);
    }
    if (!Number.isInteger(t.durationMinutes) || t.durationMinutes < LIMITS.durationMin || t.durationMinutes > LIMITS.durationMax) {
      errors.push(`${label}: la duración debe estar entre ${LIMITS.durationMin} y ${LIMITS.durationMax} minutos.`);
    } else if (openDays > 0 && longestRange > 0 && t.durationMinutes > longestRange) {
      warnings.push(`${label} dura más que la franja más larga del horario: el asistente no ofrecerá huecos para ese servicio.`);
    }
  });

  // Días bloqueados
  if (s.blockedDates.length > LIMITS.blockedDates) {
    errors.push(`Máximo ${LIMITS.blockedDates} días bloqueados.`);
  }
  for (const d of s.blockedDates) {
    if (!DATE_RE.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) errors.push(`Fecha bloqueada no válida: ${d}.`);
  }

  // Números
  if (!Number.isInteger(s.minLeadHours) || s.minLeadHours < 0 || s.minLeadHours > LIMITS.leadHoursMax) {
    errors.push(`La antelación mínima debe estar entre 0 y ${LIMITS.leadHoursMax} horas.`);
  }
  if (!SLOT_STEPS.includes(s.slotStepMinutes)) {
    errors.push('El intervalo entre huecos debe ser de 15, 30 o 60 minutos.');
  }
  if (!Number.isInteger(s.maxDaysAhead) || s.maxDaysAhead < 1 || s.maxDaysAhead > LIMITS.daysAheadMax) {
    errors.push(`Los días hacia adelante deben estar entre 1 y ${LIMITS.daysAheadMax}.`);
  }
  if (!Number.isInteger(s.retentionDays) || s.retentionDays < LIMITS.retentionMin || s.retentionDays > LIMITS.retentionMax) {
    errors.push(`La retención debe estar entre ${LIMITS.retentionMin} y ${LIMITS.retentionMax} días.`);
  }
  // available_slots llega hasta hoy + max_days_ahead (ese día incluido).
  if (Number.isInteger(s.minLeadHours) && Number.isInteger(s.maxDaysAhead) && s.minLeadHours >= (s.maxDaysAhead + 1) * 24) {
    warnings.push('La antelación mínima cubre todos los días hacia adelante: el asistente no ofrecerá huecos.');
  }

  // Textos
  const welcome = s.welcomeMessage.trim();
  if (welcome.length === 0) errors.push('Escribe el mensaje de bienvenida.');
  if (welcome.length > LIMITS.welcome) errors.push(`El mensaje de bienvenida admite hasta ${LIMITS.welcome} caracteres.`);
  if (s.timezone.trim().length === 0 || s.timezone.length > 64) errors.push('Indica la zona horaria.');

  return { errors, warnings };
}

/** Enlace público del chat (ruta anónima de src/index.tsx). null si el slug no es válido. */
export function assistantPublicUrl(origin: string, slug: string | null | undefined): string | null {
  if (!slug || !SLUG_RE.test(slug)) return null;
  return `${origin.replace(/\/+$/, '')}/#/asistente/${slug}`;
}

/** Resumen de una semana para la vista compacta: "Lun–Vie 08:00–12:00, 13:00–17:00 · Sáb 08:00–12:00". */
export function summarizeWorkingHours(wh: WorkingHours): string {
  const parts: string[] = [];
  let i = 0;
  while (i < DAYS.length) {
    const ranges = wh[DAYS[i].key] ?? [];
    const sig = ranges.map(r => `${r[0]}–${r[1]}`).join(', ');
    let j = i;
    while (j + 1 < DAYS.length && (wh[DAYS[j + 1].key] ?? []).map(r => `${r[0]}–${r[1]}`).join(', ') === sig) j++;
    if (sig) parts.push(`${j > i ? `${DAYS[i].short}–${DAYS[j].short}` : DAYS[i].short} ${sig}`);
    i = j + 1;
  }
  return parts.length ? parts.join(' · ') : 'Sin horario de atención';
}
