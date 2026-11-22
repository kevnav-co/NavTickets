// Registro de auditoría del super_admin (admin_audit_log, migración 054): altas,
// suspensiones, reactivaciones, borrados y vistas previas. Solo lectura.
import React, { useEffect, useMemo, useState } from 'react';
import { History, Loader2, RefreshCw } from 'lucide-react';
import { AuditEntry, listAuditLog } from '../../services/adminService';
import { AUDIT_ACTION_LABELS, auditActionLabel, auditDetailText } from '../../utils/adminAudit';

const ACTION_TONE: Record<string, string> = {
  company_created: 'bg-emerald-50 text-emerald-700',
  company_reactivated: 'bg-emerald-50 text-emerald-700',
  company_suspended: 'bg-amber-50 text-amber-700',
  company_deleted: 'bg-red-50 text-red-700',
  company_delete_cleanup: 'bg-red-50 text-red-700',
  preview_started: 'bg-sunken text-ink-soft',
};

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

const AuditLog: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await listAuditLog(200));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el registro');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => (action === 'all' ? entries : entries.filter(e => e.action === action)), [entries, action]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="audit-action" className="text-xs font-bold text-ink-soft uppercase tracking-wider">Acción</label>
        <select id="audit-action" value={action} onChange={e => setAction(e.target.value)}
          className="h-9 bg-raised border border-line rounded-lg px-2 text-sm">
          <option value="all">Todas</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <button type="button" onClick={load} disabled={loading}
          className="ml-auto h-9 px-3 rounded-lg bg-raised border border-line text-sm text-ink-soft inline-flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden /> Actualizar
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {loading && entries.length === 0 ? (
        <div className="py-16 flex justify-center text-ink-faint"><Loader2 className="animate-spin" size={28} aria-label="Cargando" /></div>
      ) : visible.length === 0 ? (
        <div className="py-16 text-center text-ink-faint">
          <History size={36} className="mx-auto mb-3 opacity-50" aria-hidden />
          <p className="font-bold">Sin registros{action !== 'all' ? ' de esta acción' : ''}.</p>
          <p className="text-sm mt-1">Aquí quedan las altas, suspensiones, borrados y vistas previas de empresas.</p>
        </div>
      ) : (
        <ol className="bg-raised rounded-2xl border border-line-soft divide-y divide-line-soft">
          {visible.map(e => {
            const detail = auditDetailText(e.action, e.details);
            return (
              <li key={e.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <time dateTime={e.createdAt} className="text-xs text-ink-faint tabular-nums sm:w-44 flex-shrink-0">{formatWhen(e.createdAt)}</time>
                <span className={`self-start sm:self-auto px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${ACTION_TONE[e.action] ?? 'bg-sunken text-ink-soft'}`}>
                  {auditActionLabel(e.action)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    <span className="font-bold">{e.companyName ?? 'Empresa sin nombre'}</span>
                    {e.actorName && <span className="text-ink-soft"> · por {e.actorName}</span>}
                  </p>
                  {detail && <p className="text-xs text-ink-soft break-words">{detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

export default AuditLog;
