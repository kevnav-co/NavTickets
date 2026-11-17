// src/components/requests/ServiceRequestInbox.tsx
// Bandeja de solicitudes del asistente (fase 2). Lista a la izquierda y detalle a
// la derecha; en móvil, un panel a la vez. La RLS (042) ya limita las filas a los
// gestores de la empresa; la ruta además está gated por isTabVisible('requests').

import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Inbox, Loader2, Plus, Phone, Globe, MessageSquare, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCollection } from '../../hooks/useCollection';
import { useConnectivityStatus } from '../../hooks/useConnectivityStatus';
import type { ServiceRequest, ServiceRequestStatus } from '../../types/serviceRequest';
import { CHANNEL_LABEL, STATUS_META, filterRequests } from '../../utils/serviceRequests';
import { formatDateTime } from '../../utils/chat';
import ServiceRequestDetail from './ServiceRequestDetail';
import ManualRequestModal from './ManualRequestModal';

type Filter = ServiceRequestStatus | 'todas';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'confirmada', label: 'Confirmadas' },
  { id: 'rechazada', label: 'Rechazadas' },
  { id: 'borrador', label: 'En curso' },
  { id: 'todas', label: 'Todas' },
];

const ChannelIcon: React.FC<{ channel: string }> = ({ channel }) => {
  const Icon = channel === 'manual' ? Phone : channel === 'whatsapp' ? MessageSquare : Globe;
  return <Icon size={12} aria-hidden="true" />;
};

const ServiceRequestInbox: React.FC = () => {
  const { id: selectedId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { isOnline } = useConnectivityStatus();
  const companyId = currentUser?.companyId;

  const filters = useMemo(
    () => (companyId ? [{ column: 'company_id', operator: 'eq' as const, value: companyId }] : []),
    [companyId],
  );
  const orderBy = useMemo(() => ({ column: 'created_at', ascending: false }), []);
  const { data: requests, loading, error } = useCollection<ServiceRequest>('service_requests', {
    filters,
    orderBy,
    enabled: !!companyId,
  });

  const [filter, setFilter] = useState<Filter>('pendiente');
  const [search, setSearch] = useState('');
  const [showManual, setShowManual] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of requests ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests]);

  const visible = useMemo(() => filterRequests(requests ?? [], filter, search), [requests, filter, search]);
  const selected = useMemo(() => (requests ?? []).find(r => r.id === selectedId), [requests, selectedId]);

  if (loading && !(requests ?? []).length) {
    return (
      <div className="w-full h-96 flex items-center justify-center gap-3 text-ink-faint">
        <Loader2 className="animate-spin" size={32} /><span className="font-semibold">Cargando solicitudes…</span>
      </div>
    );
  }
  if (error) {
    return <div className="p-10 text-center font-semibold text-red-600">No se pudieron cargar las solicitudes: {error}</div>;
  }

  return (
    <div className="p-4 md:p-6 pb-28 md:pb-6 max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-[minmax(320px,380px)_1fr] gap-5 items-start">
        {/* ─── Lista ─────────────────────────────────────────────────────── */}
        <section className={`card p-4 min-w-0 ${selectedId ? 'hidden lg:block' : ''}`} aria-label="Solicitudes">
          <div className="flex items-center gap-2 mb-3">
            <Inbox size={18} className="text-primary" />
            <h2 className="text-base font-bold text-ink">Solicitudes de servicio</h2>
            <button
              type="button"
              onClick={() => setShowManual(true)}
              disabled={!isOnline}
              title={isOnline ? 'Registrar una solicitud recibida por teléfono' : 'Requiere conexión'}
              className="ml-auto inline-flex items-center gap-1.5 btn-primary !px-3 !py-1.5 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Plus size={14} /> Nueva
            </button>
          </div>

          <label className="relative block mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
            <span className="sr-only">Buscar</span>
            <input
              className="w-full bg-sunken border border-line rounded-lg pl-8 pr-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="Buscar por cliente, teléfono o servicio"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-1.5 mb-3" role="tablist">
            {FILTERS.map(f => {
              const n = f.id === 'todas' ? (requests ?? []).length : counts[f.id] ?? 0;
              return (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                    filter === f.id ? 'bg-primary text-white' : 'bg-sunken text-ink-soft hover:bg-line'
                  }`}
                >
                  {f.label}{n > 0 ? ` · ${n}` : ''}
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <p className="text-center text-sm text-ink-faint py-12">
              {filter === 'pendiente' ? 'No hay solicitudes pendientes.' : 'Sin solicitudes que coincidan.'}
            </p>
          ) : (
            <ul className="space-y-2 max-h-[70vh] overflow-y-auto -mx-1 px-1">
              {visible.map(r => {
                const meta = STATUS_META[r.status];
                const active = r.id === selectedId;
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => navigate(`/requests/${r.id}`)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        active ? 'border-primary bg-primary/5' : 'border-line-soft hover:border-line hover:bg-sunken'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <p className="font-semibold text-sm text-ink truncate min-w-0 flex-1">{r.contactName || 'Sin nombre'}</p>
                        <span className={`badge ${meta.cls}`}>{meta.label}</span>
                      </div>
                      <p className="text-xs text-ink-soft truncate mt-0.5">{r.serviceName || r.orderType}{r.description ? ` — ${r.description}` : ''}</p>
                      <p className="flex items-center gap-1.5 text-[11px] text-ink-faint mt-1.5">
                        <ChannelIcon channel={r.channel} /> {CHANNEL_LABEL[r.channel] ?? r.channel}
                        <span aria-hidden="true">·</span> {formatDateTime(r.submittedAt || r.createdAt)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ─── Detalle ───────────────────────────────────────────────────── */}
        <section className={`min-w-0 ${selectedId ? '' : 'hidden lg:block'}`}>
          {selected ? (
            <ServiceRequestDetail key={selected.id} request={selected} onBack={() => navigate('/requests')} />
          ) : (
            <div className="card p-10 text-center text-ink-faint">
              {selectedId
                ? 'La solicitud no existe o no tienes acceso a ella.'
                : 'Elige una solicitud para ver sus datos, la conversación y confirmarla.'}
            </div>
          )}
        </section>
      </div>

      {showManual && companyId && currentUser && (
        <ManualRequestModal
          companyId={companyId}
          userId={currentUser.id}
          onClose={() => setShowManual(false)}
          onCreated={newId => { setShowManual(false); setFilter('pendiente'); navigate(`/requests/${newId}`); }}
        />
      )}
    </div>
  );
};

export default ServiceRequestInbox;
