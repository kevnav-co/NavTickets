import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { LIMITS, serviceIdFromName, type AssistantServiceType } from '../../../utils/assistantSettings';
import { durationLabel } from '../../../utils/serviceRequests';

interface Props {
  value: AssistantServiceType[];
  onChange: (next: AssistantServiceType[]) => void;
  /** Ids ya guardados: conservan su id al renombrarlos (las solicitudes lo referencian). */
  savedIds: ReadonlySet<string>;
  disabled?: boolean;
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480, 600, 720];

const field =
  'h-10 px-3 bg-raised border border-line rounded-xl text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

/** Servicios que ofrece el asistente, con su tipo de orden y la duración que reserva en la agenda. */
const ServiceTypesEditor: React.FC<Props> = ({ value, onChange, savedIds, disabled }) => {
  const update = (i: number, patch: Partial<AssistantServiceType>) => {
    onChange(
      value.map((s, j) => {
        if (j !== i) return s;
        const next = { ...s, ...patch };
        // Un servicio nuevo (aún sin guardar) toma su id del nombre.
        if (patch.name !== undefined && !savedIds.has(s.id)) {
          next.id = serviceIdFromName(patch.name, value.filter((_, k) => k !== i).map(x => x.id));
        }
        return next;
      }),
    );
  };

  const add = () => {
    const name = 'Nuevo servicio';
    onChange([
      ...value,
      { id: serviceIdFromName(name, value.map(s => s.id)), name, orderType: 'Correctivo', durationMinutes: 60 },
    ]);
  };

  return (
    <div className="space-y-3">
      {value.map((s, i) => {
        const durations = DURATIONS.includes(s.durationMinutes) ? DURATIONS : [...DURATIONS, s.durationMinutes].sort((a, b) => a - b);
        return (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_9rem_9rem_auto] gap-2 items-center p-3 rounded-xl border border-line-soft">
            <label className="min-w-0">
              <span className="sr-only">Nombre del servicio {i + 1}</span>
              <input
                value={s.name}
                maxLength={LIMITS.serviceName}
                disabled={disabled}
                placeholder="Nombre del servicio"
                onChange={e => update(i, { name: e.target.value })}
                className={`${field} w-full`}
              />
            </label>
            <label>
              <span className="sr-only">Tipo de orden de {s.name || `servicio ${i + 1}`}</span>
              <select
                value={s.orderType}
                disabled={disabled}
                onChange={e => update(i, { orderType: e.target.value as AssistantServiceType['orderType'] })}
                className={`${field} w-full`}
              >
                <option value="Correctivo">Correctivo</option>
                <option value="Preventivo">Preventivo</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Duración de {s.name || `servicio ${i + 1}`}</span>
              <select
                value={s.durationMinutes}
                disabled={disabled}
                onChange={e => update(i, { durationMinutes: Number(e.target.value) })}
                className={`${field} w-full`}
              >
                {durations.map(d => (
                  <option key={d} value={d}>{durationLabel(d)}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={disabled || value.length <= 1}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="justify-self-end p-2 text-ink-faint hover:text-red-500 disabled:opacity-40"
              aria-label={`Quitar ${s.name || `servicio ${i + 1}`}`}
              title={value.length <= 1 ? 'Debe quedar al menos un servicio' : 'Quitar servicio'}
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
      {value.length < LIMITS.services && (
        <button
          type="button"
          disabled={disabled}
          onClick={add}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-sunken text-xs font-bold text-ink-soft hover:bg-line disabled:opacity-50"
        >
          <Plus size={14} /> Añadir servicio
        </button>
      )}
    </div>
  );
};

export default ServiceTypesEditor;
