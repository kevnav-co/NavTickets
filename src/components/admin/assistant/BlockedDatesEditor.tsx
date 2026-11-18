import React, { useState } from 'react';
import { CalendarX, X } from 'lucide-react';
import { LIMITS } from '../../../utils/assistantSettings';
import { localISODate } from '../../../utils/serviceRequests';

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

const fmt = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const label = (iso: string) => {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? iso : fmt.format(t);
};

/** Días sin atención (festivos, vacaciones): el asistente no ofrece huecos esos días. */
const BlockedDatesEditor: React.FC<Props> = ({ value, onChange, disabled }) => {
  const [draft, setDraft] = useState('');
  const today = localISODate(new Date());
  const past = value.filter(d => d < today);

  const add = () => {
    if (!draft || value.includes(draft)) return;
    onChange([...value, draft].sort());
    setDraft('');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <label>
          <span className="sr-only">Fecha a bloquear</span>
          <input
            type="date"
            value={draft}
            min={today}
            disabled={disabled}
            onChange={e => setDraft(e.target.value)}
            className="h-10 px-3 bg-raised border border-line rounded-xl text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <button
          type="button"
          onClick={add}
          disabled={disabled || !draft || value.includes(draft) || value.length >= LIMITS.blockedDates}
          className="h-10 px-3 inline-flex items-center gap-1.5 rounded-xl bg-sunken text-sm font-bold text-ink-soft hover:bg-line disabled:opacity-50"
        >
          <CalendarX size={15} /> Bloquear día
        </button>
        {past.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(value.filter(d => d >= today))}
            className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
          >
            Quitar {past.length === 1 ? 'la fecha pasada' : `las ${past.length} fechas pasadas`}
          </button>
        )}
      </div>
      {value.length === 0 ? (
        <p className="text-sm text-ink-faint">Ningún día bloqueado.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {value.map(d => (
            <li
              key={d}
              className={`inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full text-xs font-semibold ${
                d < today ? 'bg-sunken text-ink-faint' : 'bg-red-50 text-red-700'
              }`}
            >
              {label(d)}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter(x => x !== d))}
                className="p-1 rounded-full hover:bg-black/5 disabled:opacity-50"
                aria-label={`Desbloquear ${label(d)}`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BlockedDatesEditor;
