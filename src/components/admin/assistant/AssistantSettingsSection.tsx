// Sección «Asistente» de la configuración de la empresa (fase 4). Edita
// assistant_settings, que leen tanto available_slots como la Edge Function
// assistant-chat en cada mensaje: guardar cambia de inmediato lo que el chat
// ofrece. La RLS (042) solo deja escribir a admin y developer de la empresa (o al
// super_admin en vista previa).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CalendarDays, Clock, Eye, Loader2, MessageSquareText,
  RotateCcw, Save, ShieldCheck, Users, Wrench,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useCompany } from '../../../context/CompanyContext';
import { useData } from '../../../context/DataContext';
import { useConnectivityStatus } from '../../../hooks/useConnectivityStatus';
import {
  LIMITS, SLOT_STEPS, assistantPublicUrl, settingsToRow, summarizeWorkingHours, validateAssistantSettings,
  type AssistantSettingsForm, type SlotStep,
} from '../../../utils/assistantSettings';
import { ASSIGNABLE_ROLES, durationLabel, localISODate } from '../../../utils/serviceRequests';
import {
  fetchAssistantSettings, previewAvailableSlots, saveAssistantSettings, type PreviewSlot,
} from '../../../services/assistantSettings';
import AssistantLinkCard from './AssistantLinkCard';
import WorkingHoursEditor from './WorkingHoursEditor';
import ServiceTypesEditor from './ServiceTypesEditor';
import BlockedDatesEditor from './BlockedDatesEditor';

interface Props {
  onSaved?: (message: string) => void;
}

const TIMEZONES = [
  'America/Bogota', 'America/Lima', 'America/Guayaquil', 'America/Panama', 'America/Mexico_City',
  'America/Caracas', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo', 'Europe/Madrid',
];

const field =
  'h-10 px-3 bg-raised border border-line rounded-xl text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

const Card: React.FC<{ icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }> = ({ icon, title, hint, children }) => (
  <section className="card p-5">
    <h2 className="font-bold text-ink mb-1 flex items-center gap-2">{icon} {title}</h2>
    {hint && <p className="text-xs text-ink-faint mb-4">{hint}</p>}
    {!hint && <div className="mb-3" />}
    {children}
  </section>
);

const NumberField: React.FC<{
  label: string; value: number; min: number; max: number; suffix: string; disabled?: boolean;
  onChange: (n: number) => void; help?: string;
}> = ({ label, value, min, max, suffix, disabled, onChange, help }) => (
  <label className="block">
    <span className="text-xs font-bold text-ink-soft mb-1 block">{label}</span>
    <span className="flex items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={Number.isNaN(value) ? '' : value}
        disabled={disabled}
        onChange={e => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
        className={`${field} w-28`}
      />
      <span className="text-sm text-ink-soft">{suffix}</span>
    </span>
    {help && <span className="text-[11px] text-ink-faint mt-1 block">{help}</span>}
  </label>
);

const dayFmt = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

const AssistantSettingsSection: React.FC<Props> = ({ onSaved }) => {
  const { currentUser } = useAuth();
  const { company } = useCompany();
  const { users } = useData();
  const { isOnline } = useConnectivityStatus();
  const companyId = currentUser?.companyId ?? null;

  const [loaded, setLoaded] = useState<AssistantSettingsForm | null>(null);
  const [form, setForm] = useState<AssistantSettingsForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetchAssistantSettings(companyId);
      setLoaded(r.settings);
      setForm(structuredClone(r.settings));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'No se pudo cargar la configuración.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const savedIds = useMemo(() => new Set((loaded?.serviceTypes ?? []).map(s => s.id)), [loaded]);
  const validation = useMemo(() => (form ? validateAssistantSettings(form) : { errors: [], warnings: [] }), [form]);
  const dirty = useMemo(() => {
    if (!form || !loaded || !companyId) return false;
    return JSON.stringify(settingsToRow(form, companyId, null)) !== JSON.stringify(settingsToRow(loaded, companyId, null));
  }, [form, loaded, companyId]);

  const technicians = useMemo(
    () => (users ?? [])
      .filter(u => u.companyId === companyId && (ASSIGNABLE_ROLES as readonly string[]).includes(u.role))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [users, companyId],
  );

  const set = <K extends keyof AssistantSettingsForm>(key: K, v: AssistantSettingsForm[K]) =>
    setForm(prev => (prev ? { ...prev, [key]: v } : prev));

  const save = async () => {
    if (!form || !companyId) return;
    setShowErrors(true);
    setSaveError(null);
    if (validation.errors.length > 0) return;
    setSaving(true);
    try {
      const r = await saveAssistantSettings(companyId, currentUser?.id ?? null, form);
      setLoaded(r.settings);
      setForm(structuredClone(r.settings));
      setShowErrors(false);
      onSaved?.('Configuración del asistente guardada. El chat ya usa los cambios.');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Vista previa de huecos (con la configuración guardada) ────────────────
  const [previewService, setPreviewService] = useState<string>('');
  const [preview, setPreview] = useState<PreviewSlot[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const previewServiceType = useMemo(() => {
    const list = loaded?.serviceTypes ?? [];
    return list.find(s => s.id === previewService) ?? list[0] ?? null;
  }, [loaded, previewService]);
  const previewDuration = previewServiceType?.durationMinutes ?? 60;

  const runPreview = async () => {
    if (!companyId || !loaded) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const from = new Date();
      const to = new Date(from);
      to.setDate(to.getDate() + Math.min(loaded.maxDaysAhead, 14));
      setPreview(await previewAvailableSlots(companyId, localISODate(from), localISODate(to), previewDuration));
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'No se pudo calcular la disponibilidad.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const previewByDay = useMemo(() => {
    const map = new Map<string, PreviewSlot[]>();
    for (const s of preview ?? []) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return [...map.entries()].slice(0, 6);
  }, [preview]);

  if (!companyId) return null;

  if (loading && !form) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-ink-faint">
        <Loader2 className="animate-spin" size={28} /> <span className="font-semibold">Cargando la configuración del asistente…</span>
      </div>
    );
  }
  if (loadError || !form) {
    return (
      <div className="card p-6 text-center space-y-3">
        <p className="font-semibold text-red-600">No se pudo cargar la configuración del asistente: {loadError}</p>
        <button type="button" onClick={() => void load()} className="btn-primary">Reintentar</button>
      </div>
    );
  }

  const disabled = saving;
  const url = assistantPublicUrl(window.location.origin, company?.slug);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-32">
      <AssistantLinkCard url={url} slug={company?.slug ?? 'empresa'} />

      <Card icon={<MessageSquareText size={18} className="text-primary" />} title="Mensaje de bienvenida"
        hint="Es lo primero que lee el cliente al abrir el chat.">
        <textarea
          value={form.welcomeMessage}
          maxLength={LIMITS.welcome}
          rows={3}
          disabled={disabled}
          onChange={e => set('welcomeMessage', e.target.value)}
          className="w-full px-3 py-2 bg-raised border border-line rounded-xl text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="text-[11px] text-ink-faint text-right">{form.welcomeMessage.length} / {LIMITS.welcome}</p>
      </Card>

      <Card icon={<Clock size={18} className="text-primary" />} title="Horario de atención"
        hint={`El asistente solo ofrece citas dentro de estas franjas. Ahora: ${summarizeWorkingHours(form.workingHours)}.`}>
        <WorkingHoursEditor value={form.workingHours} onChange={v => set('workingHours', v)} disabled={disabled} />
        <label className="block mt-4 max-w-xs">
          <span className="text-xs font-bold text-ink-soft mb-1 block">Zona horaria</span>
          <input
            list="assistant-timezones"
            value={form.timezone}
            disabled={disabled}
            onChange={e => set('timezone', e.target.value)}
            className={`${field} w-full`}
          />
          <datalist id="assistant-timezones">
            {TIMEZONES.map(z => <option key={z} value={z} />)}
          </datalist>
        </label>
      </Card>

      <Card icon={<Wrench size={18} className="text-primary" />} title="Servicios que ofrece el asistente"
        hint="La duración es el tiempo que se reserva en la agenda del técnico. El tipo define la orden que se crea al confirmar.">
        <ServiceTypesEditor value={form.serviceTypes} onChange={v => set('serviceTypes', v)} savedIds={savedIds} disabled={disabled} />
      </Card>

      <Card icon={<CalendarClock size={18} className="text-primary" />} title="Reglas de la agenda">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <NumberField label="Antelación mínima" suffix="horas" min={0} max={LIMITS.leadHoursMax}
            value={form.minLeadHours} disabled={disabled} onChange={n => set('minLeadHours', n)}
            help="Tiempo mínimo entre el mensaje y la cita." />
          <label className="block">
            <span className="text-xs font-bold text-ink-soft mb-1 block">Intervalo entre huecos</span>
            <select
              value={form.slotStepMinutes}
              disabled={disabled}
              onChange={e => set('slotStepMinutes', Number(e.target.value) as SlotStep)}
              className={`${field} w-28`}
            >
              {SLOT_STEPS.map(s => <option key={s} value={s}>{s} min</option>)}
            </select>
            <span className="text-[11px] text-ink-faint mt-1 block">Cada cuánto puede empezar una cita.</span>
          </label>
          <NumberField label="Agenda hasta" suffix="días" min={1} max={LIMITS.daysAheadMax}
            value={form.maxDaysAhead} disabled={disabled} onChange={n => set('maxDaysAhead', n)}
            help="Cuántos días hacia adelante se ofrecen." />
        </div>
        <h3 className="text-xs font-bold text-ink-soft mb-2 flex items-center gap-1.5">
          <CalendarDays size={14} /> Días bloqueados (festivos, vacaciones)
        </h3>
        <BlockedDatesEditor value={form.blockedDates} onChange={v => set('blockedDates', v)} disabled={disabled} />
      </Card>

      <Card icon={<Users size={18} className="text-primary" />} title="Técnicos que atienden solicitudes"
        hint="Sin ninguno marcado, el asistente cuenta con todos los asignables (técnicos, supervisores y administradores).">
        {technicians.length === 0 ? (
          <p className="text-sm text-ink-faint">No hay técnicos en la empresa.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {technicians.map(t => (
              <label key={t.id} className="flex items-center gap-3 p-3 rounded-xl border border-line-soft cursor-pointer hover:bg-sunken transition-colors">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-primary"
                  disabled={disabled}
                  checked={form.technicianIds.includes(t.id)}
                  onChange={e => set('technicianIds', e.target.checked
                    ? [...form.technicianIds, t.id]
                    : form.technicianIds.filter(id => id !== t.id))}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink truncate">{t.name}</span>
                  <span className="block text-[11px] text-ink-faint capitalize">{t.role === 'technician' ? 'técnico' : t.role}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {form.technicianIds.some(id => !technicians.some(t => t.id === id)) && (
          <p className="text-[11px] text-ink-faint mt-2">
            Hay técnicos marcados que ya no están en la empresa; se ignoran al calcular la disponibilidad.
          </p>
        )}
      </Card>

      <Card icon={<ShieldCheck size={18} className="text-primary" />} title="Privacidad"
        hint="Las conversaciones se borran solas pasado este plazo (las solicitudes se conservan). Ese plazo aparece en el aviso de datos que acepta el cliente.">
        <NumberField label="Conservar conversaciones" suffix="días" min={LIMITS.retentionMin} max={LIMITS.retentionMax}
          value={form.retentionDays} disabled={disabled} onChange={n => set('retentionDays', n)} />
      </Card>

      <Card icon={<Eye size={18} className="text-primary" />} title="Vista previa de la disponibilidad"
        hint="Los huecos que ofrecería hoy el asistente, con la configuración guardada y las órdenes ya agendadas.">
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <label className="block">
            <span className="text-xs font-bold text-ink-soft mb-1 block">Servicio</span>
            <select
              value={previewServiceType?.id ?? ''}
              onChange={e => { setPreviewService(e.target.value); setPreview(null); }}
              className={`${field} min-w-[14rem]`}
            >
              {(loaded?.serviceTypes ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.name} · {durationLabel(s.durationMinutes)}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={!isOnline || previewLoading}
            className="h-10 px-4 inline-flex items-center gap-1.5 rounded-xl bg-sunken text-sm font-bold text-ink-soft hover:bg-line disabled:opacity-50"
          >
            {previewLoading ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Ver huecos
          </button>
        </div>
        {dirty && <p className="text-[11px] font-semibold text-amber-700 mb-3">Tienes cambios sin guardar: la vista previa usa la configuración guardada.</p>}
        {previewError && <p className="text-sm font-semibold text-red-600">{previewError}</p>}
        {preview && !previewError && (
          preview.length === 0 ? (
            <p className="text-sm font-semibold text-amber-700">No hay huecos libres en los próximos días con esta configuración.</p>
          ) : (
            <div className="space-y-3">
              {previewByDay.map(([date, slots]) => (
                <div key={date}>
                  <p className="text-xs font-bold text-ink-soft first-letter:uppercase mb-1">{dayFmt.format(Date.parse(`${date}T00:00:00Z`))}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {slots.slice(0, 12).map(s => (
                      <span key={s.time} className="px-2 py-1 rounded-lg bg-sunken text-xs font-mono text-ink" title={`${s.freeTechnicians} técnico(s) libre(s)`}>
                        {s.time}
                      </span>
                    ))}
                    {slots.length > 12 && <span className="px-2 py-1 text-xs text-ink-faint">+{slots.length - 12} más</span>}
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-ink-faint">{preview.length} huecos en total. El chat muestra al cliente solo algunos cada vez.</p>
            </div>
          )
        )}
      </Card>

      {/* Barra de guardado */}
      <div className="sticky bottom-20 md:bottom-4 z-10">
        <div className="card p-3 flex flex-col sm:flex-row sm:items-center gap-3 shadow-lg">
          <div className="flex-1 min-w-0 text-sm">
            {showErrors && validation.errors.length > 0 ? (
              <ul className="text-red-700 font-semibold space-y-0.5" role="alert">
                {validation.errors.slice(0, 4).map(e => <li key={e} className="flex gap-1.5"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{e}</li>)}
                {validation.errors.length > 4 && <li>…y {validation.errors.length - 4} más.</li>}
              </ul>
            ) : saveError ? (
              <p className="text-red-700 font-semibold" role="alert">{saveError}</p>
            ) : validation.warnings.length > 0 ? (
              <p className="text-amber-700 font-semibold flex gap-1.5"><AlertTriangle size={14} className="shrink-0 mt-0.5" />{validation.warnings[0]}</p>
            ) : (
              <p className="text-ink-faint">{dirty ? 'Cambios sin guardar.' : 'Todo guardado.'}{!isOnline && ' Sin conexión: no se puede guardar.'}</p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => { setForm(loaded ? structuredClone(loaded) : form); setShowErrors(false); setSaveError(null); }}
              className="h-10 px-3 inline-flex items-center gap-1.5 rounded-xl bg-sunken text-sm font-bold text-ink-soft hover:bg-line disabled:opacity-50"
            >
              <RotateCcw size={15} /> Descartar
            </button>
            <button
              type="button"
              disabled={!dirty || saving || !isOnline}
              onClick={() => void save()}
              className="btn-primary h-10 inline-flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssistantSettingsSection;
