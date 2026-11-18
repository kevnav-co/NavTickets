import React from 'react';
import { Copy, Plus, X } from 'lucide-react';
import { DAYS, LIMITS, hhmmToMinutes, type DayKey, type TimeRange, type WorkingHours } from '../../../utils/assistantSettings';

interface Props {
  value: WorkingHours;
  onChange: (next: WorkingHours) => void;
  disabled?: boolean;
}

const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Franja nueva: una hora después de la última, de 3 horas, sin pasar de las 23:00. */
function nextRange(ranges: TimeRange[]): TimeRange {
  if (ranges.length === 0) return ['08:00', '17:00'];
  const lastEnd = Math.max(...ranges.map(r => hhmmToMinutes(r[1]) || 0));
  const start = Math.min(lastEnd + 60, 20 * 60);
  return [toHHMM(start), toHHMM(Math.min(start + 180, 23 * 60))];
}

const timeInput =
  'h-9 w-[7.75rem] px-2 bg-raised border border-line rounded-lg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60';

/** Horario semanal: cada día abierto tiene una o varias franjas de atención. */
const WorkingHoursEditor: React.FC<Props> = ({ value, onChange, disabled }) => {
  const setDay = (key: DayKey, ranges: TimeRange[]) => {
    const next = { ...value };
    if (ranges.length === 0) delete next[key];
    else next[key] = ranges;
    onChange(next);
  };

  const copyMondayToWeekdays = () => {
    const monday = value['1'] ?? [];
    const next = { ...value };
    (['2', '3', '4', '5'] as DayKey[]).forEach(k => {
      if (monday.length) next[k] = monday.map(r => [...r] as TimeRange);
      else delete next[k];
    });
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {DAYS.map(({ key, label }) => {
        const ranges = value[key] ?? [];
        const open = ranges.length > 0;
        return (
          <div key={key} className="flex flex-col sm:flex-row sm:items-start gap-2 py-2 border-b border-line-soft last:border-b-0">
            <label className="flex items-center gap-2 w-32 shrink-0 pt-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={open}
                disabled={disabled}
                onChange={e => setDay(key, e.target.checked ? [nextRange([])] : [])}
                className="w-4 h-4 rounded accent-primary"
              />
              <span className={`text-sm font-semibold ${open ? 'text-ink' : 'text-ink-faint'}`}>{label}</span>
            </label>

            {open ? (
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {ranges.map((r, i) => (
                  <div key={i} className="inline-flex items-center gap-1 bg-sunken rounded-xl px-2 py-1">
                    <input
                      type="time"
                      step={900}
                      value={r[0]}
                      disabled={disabled}
                      aria-label={`${label}, franja ${i + 1}, desde`}
                      onChange={e => setDay(key, ranges.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))}
                      className={timeInput}
                    />
                    <span className="text-ink-faint text-xs">a</span>
                    <input
                      type="time"
                      step={900}
                      value={r[1]}
                      disabled={disabled}
                      aria-label={`${label}, franja ${i + 1}, hasta`}
                      onChange={e => setDay(key, ranges.map((x, j) => (j === i ? [x[0], e.target.value] : x)))}
                      className={timeInput}
                    />
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setDay(key, ranges.filter((_, j) => j !== i))}
                      className="p-1 text-ink-faint hover:text-red-500 disabled:opacity-50"
                      aria-label={`Quitar la franja ${i + 1} del ${label.toLowerCase()}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {ranges.length < LIMITS.rangesPerDay && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setDay(key, [...ranges, nextRange(ranges)])}
                    className="inline-flex items-center gap-1 h-9 px-2.5 rounded-xl text-xs font-bold text-primary hover:bg-sunken disabled:opacity-50"
                  >
                    <Plus size={14} /> Franja
                  </button>
                )}
              </div>
            ) : (
              <span className="text-sm text-ink-faint pt-1.5">Cerrado</span>
            )}
          </div>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        onClick={copyMondayToWeekdays}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline disabled:opacity-50"
      >
        <Copy size={13} /> Copiar el horario del lunes de martes a viernes
      </button>
    </div>
  );
};

export default WorkingHoursEditor;
