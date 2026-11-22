import React, { useId, useState } from 'react';
import { Eye, Users, Pencil, Trash2, Lock, CheckCircle, PauseCircle, PlayCircle, Loader2 } from 'lucide-react';
import { CompanyWithStats } from '../../services/adminService';
import { deleteConfirmationMatches } from '../../utils/adminAudit';

interface CompanyCardProps {
  company: CompanyWithStats;
  onEdit: (id: string) => void;
  onManageUsers: (id: string) => void;
  onPreview: (id: string) => void;
  onSetStatus: (id: string, status: 'active' | 'suspended', reason?: string) => Promise<void>;
  onDelete: (id: string, confirmName: string) => Promise<void>;
}

type Panel = null | 'suspend' | 'delete';

const relativeTime = (iso?: string | null) => {
  if (!iso) return 'Sin actividad';
  const date = new Date(iso);
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'hace un momento';
  if (diffMins < 60) return `hace ${diffMins} min`;
  if (diffHours < 24) return `hace ${diffHours} h`;
  if (diffDays < 7) return `hace ${diffDays} d`;
  return date.toLocaleDateString('es-CO', { month: 'short', day: 'numeric', year: 'numeric' });
};

const iconBtn = 'p-2 rounded-lg transition-colors text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

const CompanyCard: React.FC<CompanyCardProps> = ({ company, onEdit, onManageUsers, onPreview, onSetStatus, onDelete }) => {
  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reasonId = useId();
  const confirmId = useId();

  const suspended = company.status === 'suspended';
  const o = company.overview;

  const openPanel = (p: Panel) => {
    setPanel(prev => (prev === p ? null : p));
    setError(null);
    setReason('');
    setConfirmName('');
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setPanel(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`bg-raised rounded-2xl shadow-sm border p-4 transition-shadow hover:shadow-md ${suspended ? 'border-amber-200' : 'border-line-soft'}`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div
            className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-white flex-shrink-0 shadow-sm ${suspended ? 'opacity-50' : ''}`}
            style={{ backgroundColor: company.theme?.primaryColor || '#7b1113' }}
            aria-hidden
          >
            {company.name?.charAt(0)?.toUpperCase() || '?'}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="font-bold text-ink truncate">{company.name}</h3>
              <span
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                  suspended ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {suspended ? <Lock size={13} aria-hidden /> : <CheckCircle size={13} aria-hidden />}
                {suspended ? 'Suspendida' : 'Activa'}
              </span>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-2">
              <div>
                <dt className="text-ink-faint text-[10px] uppercase tracking-wider">Slug</dt>
                <dd className="font-mono text-ink-soft truncate">{company.slug || '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-faint text-[10px] uppercase tracking-wider">Usuarios</dt>
                <dd className="font-semibold text-ink-soft tabular-nums">{o?.usersCount ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-faint text-[10px] uppercase tracking-wider">Órdenes</dt>
                <dd className="text-ink-soft tabular-nums">
                  {o ? <>{o.ordersTotal} <span className="text-ink-faint">({o.pending} pend.)</span></> : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-ink-faint text-[10px] uppercase tracking-wider">Última orden</dt>
                <dd className="text-ink-soft">{relativeTime(o?.lastActivityAt)}</dd>
              </div>
            </dl>

            {suspended && (
              <p className="text-xs text-amber-700">
                Suspendida {company.suspendedAt ? relativeTime(company.suspendedAt) : ''}
                {company.suspendedReason ? ` · ${company.suspendedReason}` : ''}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 self-end sm:self-start">
          <button type="button" onClick={() => onPreview(company.id)} className={`${iconBtn} hover:text-emerald-600 hover:bg-emerald-50`}
            title="Vista previa como admin" aria-label={`Vista previa de ${company.name}`}>
            <Eye size={18} />
          </button>
          <button type="button" onClick={() => onManageUsers(company.id)} className={`${iconBtn} hover:text-blue-600 hover:bg-blue-50`}
            title="Gestionar usuarios" aria-label={`Usuarios de ${company.name}`}>
            <Users size={18} />
          </button>
          <button type="button" onClick={() => onEdit(company.id)} className={`${iconBtn} hover:text-primary hover:bg-sunken`}
            title="Editar empresa" aria-label={`Editar ${company.name}`}>
            <Pencil size={18} />
          </button>
          {suspended ? (
            <button type="button" disabled={busy} onClick={() => run(() => onSetStatus(company.id, 'active'))}
              className={`${iconBtn} hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-50`}
              title="Reactivar" aria-label={`Reactivar ${company.name}`}>
              {busy && panel === null ? <Loader2 size={18} className="animate-spin" /> : <PlayCircle size={18} />}
            </button>
          ) : (
            <button type="button" onClick={() => openPanel('suspend')} aria-expanded={panel === 'suspend'}
              className={`${iconBtn} hover:text-amber-600 hover:bg-amber-50 ${panel === 'suspend' ? 'text-amber-600 bg-amber-50' : ''}`}
              title="Suspender" aria-label={`Suspender ${company.name}`}>
              <PauseCircle size={18} />
            </button>
          )}
          <button type="button" onClick={() => openPanel('delete')} aria-expanded={panel === 'delete'}
            className={`${iconBtn} hover:text-red-600 hover:bg-red-50 ${panel === 'delete' ? 'text-red-600 bg-red-50' : ''}`}
            title="Borrar empresa" aria-label={`Borrar ${company.name}`}>
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {panel === 'suspend' && (
        <form
          className="mt-4 pt-4 border-t border-line-soft space-y-3"
          onSubmit={e => { e.preventDefault(); run(() => onSetStatus(company.id, 'suspended', reason)); }}
        >
          <p className="text-sm text-ink-soft">
            Sus usuarios dejan de ver datos y archivos en cuanto se suspende, y su asistente público se desactiva.
            No se borra nada; puedes reactivarla cuando quieras.
          </p>
          <div>
            <label htmlFor={reasonId} className="block text-xs font-bold text-ink-soft mb-1">Motivo (opcional, solo lo ves tú)</label>
            <input id={reasonId} value={reason} onChange={e => setReason(e.target.value)} maxLength={500}
              placeholder="Ej.: falta de pago de noviembre"
              className="w-full h-10 bg-sunken border border-line rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy}
              className="h-9 px-4 rounded-lg bg-amber-600 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60">
              {busy && <Loader2 size={15} className="animate-spin" />} Suspender {company.name}
            </button>
            <button type="button" onClick={() => setPanel(null)} className="h-9 px-4 rounded-lg bg-sunken text-ink-soft text-sm">Cancelar</button>
          </div>
        </form>
      )}

      {panel === 'delete' && (
        <form
          className="mt-4 pt-4 border-t border-red-100 space-y-3"
          onSubmit={e => { e.preventDefault(); if (deleteConfirmationMatches(confirmName, company.name)) run(() => onDelete(company.id, confirmName.trim())); }}
        >
          <p className="text-sm text-red-700">
            Se borran para siempre sus {o ? `${o.usersCount} usuarios, ${o.ordersTotal} órdenes` : 'usuarios, órdenes'}, clientes, equipos,
            contabilidad, fotos y cuentas de acceso. No se puede deshacer. Si solo quieres cortar el acceso, suspéndela.
          </p>
          <div>
            <label htmlFor={confirmId} className="block text-xs font-bold text-ink-soft mb-1">
              Escribe <span className="font-mono text-ink">{company.name}</span> para confirmar
            </label>
            <input id={confirmId} value={confirmName} onChange={e => setConfirmName(e.target.value)} autoComplete="off"
              className="w-full h-10 bg-sunken border border-line rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !deleteConfirmationMatches(confirmName, company.name)}
              className="h-9 px-4 rounded-lg bg-red-600 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-40">
              {busy && <Loader2 size={15} className="animate-spin" />} Borrar definitivamente
            </button>
            <button type="button" onClick={() => setPanel(null)} className="h-9 px-4 rounded-lg bg-sunken text-ink-soft text-sm">Cancelar</button>
          </div>
        </form>
      )}

      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
};

export default CompanyCard;
