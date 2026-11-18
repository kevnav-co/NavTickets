// src/components/requests/ServiceRequestDetail.tsx
// Detalle de una solicitud: datos recogidos, conversación y, si está pendiente,
// confirmación (fecha, hora, duración y técnico) o rechazo con motivo.
// La validación definitiva la hace confirm_service_request (043); aquí solo se
// anticipan los errores para que el gestor los vea antes de enviar.

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CalendarSearch, CheckCircle2, Loader2, Mail, MapPin, Phone, IdCard,
  AlertTriangle, XCircle, Wrench, MessageSquare, UserCheck,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useCollection } from '../../hooks/useCollection';
import { useConnectivityStatus } from '../../hooks/useConnectivityStatus';
import type { AssistantMessage, ServiceRequest, ServiceRequestProposal } from '../../types/serviceRequest';
import {
  ASSIGNABLE_ROLES, CHANNEL_LABEL, DURATION_OPTIONS, STATUS_META, durationLabel, formatPreferredSlots,
  initialProposal, resolveClient, technicianConflicts, timeToMinutes, transcriptText,
  validateProposal,
} from '../../utils/serviceRequests';
import { formatDateTime } from '../../utils/chat';
import { confirmServiceRequest, rejectServiceRequest } from '../../services/serviceRequests';
import AvailabilityModal from '../order/AvailabilityModal';

const inputCls =
  'w-full bg-sunken border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/20';

const Field: React.FC<{ icon: React.ElementType; label: string; value?: React.ReactNode }> = ({ icon: Icon, label, value }) =>
  value ? (
    <div className="flex items-start gap-2.5 min-w-0">
      <Icon size={15} className="text-ink-faint mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{label}</p>
        <p className="text-sm text-ink break-words">{value}</p>
      </div>
    </div>
  ) : null;

const ServiceRequestDetail: React.FC<{ request: ServiceRequest; onBack: () => void }> = ({ request, onBack }) => {
  const navigate = useNavigate();
  const { users, orders, clients, equipment, isEquipmentLoaded, loadEquipment } = useData();
  const { isOnline } = useConnectivityStatus();

  const [proposal, setProposal] = useState<ServiceRequestProposal>(() => initialProposal(request, new Date()));
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAvailability, setShowAvailability] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  // Los equipos se cargan bajo demanda en la app; solo hacen falta si la solicitud trae alguno.
  const hasEquipment = (request.equipmentIds ?? []).length > 0;
  useEffect(() => {
    if (hasEquipment && !isEquipmentLoaded) loadEquipment().catch(console.error);
  }, [hasEquipment, isEquipmentLoaded, loadEquipment]);

  const isPending = request.status === 'pendiente';
  const meta = STATUS_META[request.status];

  const technicians = useMemo(
    () => users
      .filter(u => (ASSIGNABLE_ROLES as readonly string[]).includes(u.role))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );
  const selectedTech = technicians.find(t => t.id === proposal.technicianId);
  const conflicts = useMemo(() => technicianConflicts(orders, proposal), [orders, proposal]);
  const validation = validateProposal(proposal, new Date());
  const clientPlan = useMemo(() => resolveClient(request, clients), [request, clients]);
  const linkedClient = request.clientId ? clients.find(c => c.id === request.clientId) : undefined;
  const hasContact = [request.contactPhone, request.contactEmail, request.contactIdentification, request.address, request.city]
    .some(v => (v ?? '').trim() !== '');
  const preferred = formatPreferredSlots(request.preferredSlots);
  const equipmentNames = (request.equipmentIds ?? [])
    .map(id => equipment.find(e => e.id === id)?.name)
    .filter(Boolean) as string[];
  const reviewer = users.find(u => u.id === request.reviewedBy)?.name;

  const msgFilters = useMemo(
    () => [{ column: 'conversation_id', operator: 'eq' as const, value: request.conversationId ?? '' }],
    [request.conversationId],
  );
  const msgOrder = useMemo(() => ({ column: 'id', ascending: true }), []);
  const { data: messages } = useCollection<AssistantMessage>('assistant_messages', {
    filters: msgFilters,
    orderBy: msgOrder,
    realtime: false,
    enabled: !!request.conversationId,
  });
  const transcript = (messages ?? [])
    .map(m => ({ id: String(m.id), role: m.role, text: transcriptText(m.content), at: m.createdAt }))
    .filter(m => m.role !== 'tool' && m.text);

  const set = (patch: Partial<ServiceRequestProposal>) => { setError(null); setProposal(p => ({ ...p, ...patch })); };

  const handleConfirm = async () => {
    if (validation || busy) return;
    setBusy('confirm');
    setError(null);
    try {
      const orderId = await confirmServiceRequest(request.id, proposal);
      navigate(`/orders/${orderId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    if (!reason.trim() || busy) return;
    setBusy('reject');
    setError(null);
    try {
      await rejectServiceRequest(request.id, reason.trim());
      setRejecting(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="space-y-4">
      {/* Encabezado */}
      <div className="card p-5">
        <button onClick={onBack} className="lg:hidden inline-flex items-center gap-1 text-sm font-semibold text-ink-soft mb-3">
          <ArrowLeft size={16} /> Solicitudes
        </button>
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-ink break-words">{request.contactName || 'Sin nombre'}</h2>
            <p className="text-sm text-ink-soft">
              {request.serviceName || request.orderType} · {request.orderType} · prioridad {request.suggestedPriority.toLowerCase()}
            </p>
          </div>
          <span className={`badge ${meta.cls}`}>{meta.label}</span>
        </div>
        <p className="text-xs text-ink-faint mt-2">
          {CHANNEL_LABEL[request.channel] ?? request.channel} · recibida {formatDateTime(request.submittedAt || request.createdAt)}
        </p>
      </div>

      {/* Datos recogidos */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-bold text-ink">Datos del cliente</h3>
        {!hasContact && <p className="text-sm text-ink-faint">Sin datos de contacto.</p>}
        <div className={`grid sm:grid-cols-2 gap-4 ${hasContact ? '' : 'hidden'}`}>
          <Field icon={Phone} label="Teléfono" value={request.contactPhone} />
          <Field icon={Mail} label="Correo" value={request.contactEmail} />
          <Field icon={IdCard} label="Identificación" value={request.contactIdentification} />
          <Field icon={MapPin} label="Dirección" value={[request.address, request.city].filter(Boolean).join(', ')} />
        </div>
        {(isPending || linkedClient) && (
          <p className="text-xs text-ink-soft bg-sunken rounded-lg px-3 py-2 flex items-start gap-2">
            <UserCheck size={14} className="shrink-0 mt-px" aria-hidden="true" />
            <span className="min-w-0">
              {!isPending && linkedClient
                ? <>Cliente: <Link className="font-semibold text-primary" to={`/clients/${linkedClient.id}`}>{linkedClient.name}</Link></>
                : clientPlan.kind === 'new'
                  ? <>Al confirmar se creará el cliente «{clientPlan.name}».</>
                  : <>Se usará el cliente registrado <Link className="font-semibold text-primary" to={`/clients/${clientPlan.client.id}`}>{clientPlan.client.name}</Link>{clientPlan.kind === 'match' ? ' (coincide el correo o la identificación).' : '.'}</>}
            </span>
          </p>
        )}

        <h3 className="text-sm font-bold text-ink pt-2">Servicio pedido</h3>
        <p className="text-sm text-ink whitespace-pre-wrap break-words">{request.description || 'Sin descripción.'}</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field icon={Wrench} label="Equipos registrados" value={equipmentNames.join(', ')} />
          <Field icon={Wrench} label="Equipo indicado por el cliente" value={request.equipmentDescription} />
          <Field icon={CalendarSearch} label="Prefiere" value={preferred.join(' / ')} />
        </div>
      </div>

      {/* Conversación */}
      {request.conversationId && (
        <details className="card p-5 group">
          <summary className="cursor-pointer text-sm font-bold text-ink flex items-center gap-2 list-none">
            <MessageSquare size={15} aria-hidden="true" /> Conversación con el asistente
            <span className="ml-auto text-xs font-semibold text-ink-faint">{transcript.length} mensajes</span>
          </summary>
          <div className="flex flex-col gap-2 mt-4 max-h-96 overflow-y-auto">
            {transcript.length === 0 && <p className="text-sm text-ink-faint">La transcripción ya no está disponible.</p>}
            {transcript.map(m => (
              <div
                key={m.id}
                className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                  m.role === 'user' ? 'self-start bg-sunken text-ink' : 'self-end bg-primary/10 text-ink'
                }`}
              >
                <p className="text-[10px] font-semibold text-ink-faint mb-0.5">{m.role === 'user' ? 'Cliente' : 'Asistente'}</p>
                {m.text}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Resultado de una solicitud cerrada */}
      {request.status === 'confirmada' && (
        <div className="card p-5 flex flex-wrap items-center gap-3">
          <CheckCircle2 className="text-green-600" size={20} aria-hidden="true" />
          <p className="text-sm text-ink flex-1 min-w-0">
            Confirmada{reviewer ? ` por ${reviewer}` : ''}{request.reviewedAt ? ` el ${formatDateTime(request.reviewedAt)}` : ''}.
          </p>
          {request.orderId
            ? <Link to={`/orders/${request.orderId}`} className="btn-primary">Ver la orden</Link>
            : <span className="text-xs text-ink-faint">La orden fue eliminada.</span>}
        </div>
      )}
      {request.status === 'rechazada' && (
        <div className="card p-5">
          <p className="text-sm text-ink flex items-center gap-2">
            <XCircle className="text-red-600" size={18} aria-hidden="true" />
            Rechazada{reviewer ? ` por ${reviewer}` : ''}{request.reviewedAt ? ` el ${formatDateTime(request.reviewedAt)}` : ''}.
          </p>
          <p className="text-sm text-ink-soft mt-2 whitespace-pre-wrap break-words">Motivo: {request.rejectionReason}</p>
        </div>
      )}
      {request.status === 'borrador' && (
        <div className="card p-5 text-sm text-ink-soft">El asistente todavía está recogiendo datos; se podrá confirmar cuando quede pendiente.</div>
      )}

      {/* Confirmar o rechazar */}
      {isPending && (
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-bold text-ink">Agendar y crear la orden</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className="text-xs font-semibold text-ink-soft">Técnico</span>
              <select className={`${inputCls} mt-1`} value={proposal.technicianId} onChange={e => set({ technicianId: e.target.value })}>
                <option value="">Elige un técnico…</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="text-xs font-semibold text-ink-soft">Duración</span>
              <select className={`${inputCls} mt-1`} value={proposal.durationMinutes} onChange={e => set({ durationMinutes: Number(e.target.value) })}>
                {Array.from(new Set([...DURATION_OPTIONS, proposal.durationMinutes])).sort((a, b) => a - b)
                  .map(m => <option key={m} value={m}>{durationLabel(m)}</option>)}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="text-xs font-semibold text-ink-soft">Fecha</span>
              <input type="date" className={`${inputCls} mt-1`} value={proposal.date} onChange={e => set({ date: e.target.value })} />
            </label>
            <label className="block min-w-0">
              <span className="text-xs font-semibold text-ink-soft">Hora</span>
              <input type="time" step={900} className={`${inputCls} mt-1`} value={proposal.time} onChange={e => set({ time: e.target.value })} />
            </label>
          </div>

          <button
            type="button"
            disabled={!selectedTech}
            onClick={() => setShowAvailability(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary disabled:text-ink-faint"
          >
            <CalendarSearch size={15} /> Ver la agenda de {selectedTech ? selectedTech.name.split(' ')[0] : 'un técnico'}
          </button>

          {conflicts.length > 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {selectedTech?.name} ya tiene {conflicts.length === 1 ? 'una orden' : `${conflicts.length} órdenes`} en ese horario
                ({conflicts.map(o => `#${o.orderNumber ?? '—'} ${o.timeSlot}`).join(', ')}). Elige otra hora o técnico.
              </span>
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          {!isOnline && <p className="text-xs text-ink-faint">Confirmar y rechazar requieren conexión.</p>}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!!validation || conflicts.length > 0 || !!busy || !isOnline}
              title={validation ?? undefined}
              className="btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy === 'confirm' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Confirmar y crear la orden
            </button>
            {!rejecting && (
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={!!busy || !isOnline}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
              >
                Rechazar
              </button>
            )}
          </div>
          {validation && !conflicts.length && <p className="text-xs text-ink-faint">{validation}</p>}
          <p className="text-xs text-ink-faint">
            Al confirmar o rechazar, el cliente recibe la cita o el motivo en su correo, si dejó uno. Si no se le puede
            enviar, te llega un aviso en la campana para que lo llames.
          </p>

          {rejecting && (
            <div className="border-t border-line-soft pt-4 space-y-2">
              <label className="block">
                <span className="text-xs font-semibold text-ink-soft">Motivo del rechazo (se envía al cliente por correo; escríbelo para él)</span>
                <textarea className={`${inputCls} mt-1 min-h-20`} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={!reason.trim() || !!busy || !isOnline}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {busy === 'reject' && <Loader2 size={16} className="animate-spin" />} Rechazar solicitud
                </button>
                <button type="button" onClick={() => { setRejecting(false); setReason(''); }} className="px-4 py-2 rounded-lg text-sm font-semibold text-ink-soft bg-sunken">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showAvailability && selectedTech && (
        <AvailabilityModal
          technician={selectedTech}
          orders={orders}
          initialDate={proposal.date}
          onClose={() => setShowAvailability(false)}
          onApplyTime={(date, time, duration) => {
            const minutes = timeToMinutes(duration);
            set({ date, time, durationMinutes: minutes >= 15 ? minutes : proposal.durationMinutes });
            setShowAvailability(false);
          }}
        />
      )}
    </article>
  );
};

export default ServiceRequestDetail;
