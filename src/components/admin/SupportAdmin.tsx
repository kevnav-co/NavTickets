// src/components/admin/SupportAdmin.tsx
// Panel del super_admin: soportes de TODAS las empresas, con chat (respuesta) y
// control de estado. RLS de la migración 006 le da acceso a todas las empresas
// (useCollection sin filtro). Gated a super_admin.

import React, { useState, useMemo } from 'react';
import { Loader2, Send, LifeBuoy } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useCollection } from '../../hooks/useCollection';
import { SupportTicket, SupportMessage, SupportTicketStatus } from '../../types';
import { CompanyConfig } from '../../types/company';

const STATUS_META: Record<SupportTicketStatus, { label: string; cls: string }> = {
  [SupportTicketStatus.OPEN]: { label: 'Abierto', cls: 'bg-amber-100 text-amber-700' },
  [SupportTicketStatus.IN_PROGRESS]: { label: 'En Progreso', cls: 'bg-blue-100 text-blue-700' },
  [SupportTicketStatus.CLOSED]: { label: 'Cerrado', cls: 'bg-green-100 text-green-700' },
};
const STATUS_ORDER: SupportTicketStatus[] = [
  SupportTicketStatus.OPEN,
  SupportTicketStatus.IN_PROGRESS,
  SupportTicketStatus.CLOSED,
];

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const SupportAdmin: React.FC = () => {
  const { currentUser } = useAuth();
  const { addItem, updateItem } = useData();

  const { data: tickets, loading, error } = useCollection<SupportTicket>('support_tickets', {
    orderBy: { column: 'created_at', ascending: false },
  });
  const { data: companies } = useCollection<CompanyConfig>('companies');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<SupportTicketStatus | 'todos'>('todos');
  const [search, setSearch] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const companyName = (id: string) => companies?.find(c => c.id === id)?.name || '—';

  const selected = useMemo(
    () => (selectedId ? tickets?.find(t => t.id === selectedId) : undefined),
    [selectedId, tickets]
  );

  const { data: messages } = useCollection<SupportMessage>('support_messages', {
    filters: selectedId ? [{ column: 'ticket_id', operator: 'eq', value: selectedId }] : [],
    orderBy: { column: 'created_at', ascending: true },
    realtime: true,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (tickets || []).filter(t => {
      if (filterStatus !== 'todos' && t.status !== filterStatus) return false;
      if (q && !companyName(t.companyId).toLowerCase().includes(q) && !t.subject.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tickets, filterStatus, search, companies]);

  const handleReply = async () => {
    if (!selectedId || !reply.trim() || !currentUser) return;
    setBusy(true);
    try {
      await addItem('support_messages', {
        ticketId: selectedId,
        userId: currentUser.id,
        role: 'admin',
        message: reply.trim(),
      });
      setReply('');
    } catch (e) {
      alert('No se pudo enviar la respuesta: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = async (status: SupportTicketStatus) => {
    if (!selectedId) return;
    await updateItem('support_tickets', selectedId, { status });
  };

  if (loading) {
    return <div className="w-full h-96 flex items-center justify-center gap-3 text-gray-400"><Loader2 className="animate-spin" size={40} /><span className="font-bold">Cargando soportes...</span></div>;
  }
  if (error) {
    return <div className="p-10 text-center font-bold text-red-500">Error al cargar soportes: {error.message}</div>;
  }

  return (
    <div className="grid lg:grid-cols-[360px,1fr] gap-6">
      {/* ─── Lista de soportes ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center gap-2 mb-3">
          <LifeBuoy size={18} className="text-primary" />
          <h2 className="text-base font-black text-gray-800">Soportes de las empresas</h2>
          <span className="ml-auto text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{(tickets || []).length}</span>
        </div>

        {/* Búsqueda + filtro */}
        <input
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 mb-2 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none"
          placeholder="Buscar por empresa o asunto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-1.5 mb-3">
          {(['todos', ...STATUS_ORDER] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                filterStatus === s ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {s === 'todos' ? 'Todos' : STATUS_META[s].label}
            </button>
          ))}
        </div>

        {filtered.length === 0 && <p className="text-center text-sm text-gray-400 py-10">Sin soportes que coincidan.</p>}

        <div className="space-y-2">
          {filtered.map(t => {
            const meta = STATUS_META[t.status] || STATUS_META[SupportTicketStatus.OPEN];
            const active = t.id === selectedId;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left p-3 rounded-2xl border transition-colors ${
                  active ? 'border-primary/40 bg-red-50/40' : 'border-gray-100 hover:bg-gray-50/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-gray-500 truncate">{companyName(t.companyId)}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${meta.cls}`}>{meta.label}</span>
                </div>
                <p className="text-sm font-bold text-gray-800 truncate mt-0.5">{t.subject}</p>
                <p className="text-xs text-gray-400 truncate">{t.message}</p>
                <span className="text-[10px] text-gray-300 font-semibold">{formatDate(t.createdAt)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Detalle / chat ────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5 flex flex-col min-h-[60vh]">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400">
            <LifeBuoy size={44} className="mb-3 opacity-50" />
            <p className="font-bold text-gray-500">Selecciona un soporte</p>
            <p className="text-sm">Elige una consulta de la lista para ver el hilo y responder.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-4 border-b border-gray-100 pb-4">
              <div className="min-w-0">
                <h3 className="font-black text-gray-800 truncate">{selected.subject}</h3>
                <p className="text-xs font-bold text-gray-400">{companyName(selected.companyId)} · {formatDate(selected.createdAt)}</p>
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${(STATUS_META[selected.status] || STATUS_META[SupportTicketStatus.OPEN]).cls}`}>
                {(STATUS_META[selected.status] || STATUS_META[SupportTicketStatus.OPEN]).label}
              </span>
            </div>

            {/* Mensaje de apertura */}
            <div className="max-w-[85%] p-3 rounded-2xl bg-gray-100 text-sm text-gray-700 self-start mb-2">
              <p className="whitespace-pre-wrap">{selected.message}</p>
              <span className="text-[10px] text-gray-400 font-semibold">{formatDate(selected.createdAt)}</span>
            </div>

            {/* Hilo */}
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {(messages || []).map(m => (
                <div
                  key={m.id}
                  className={`max-w-[85%] p-3 rounded-2xl text-sm text-gray-700 ${m.role === 'admin' ? 'bg-red-50 border border-red-100 self-end' : 'bg-gray-100 self-start'}`}
                >
                  <p className="whitespace-pre-wrap">{m.message}</p>
                  <span className="text-[10px] text-gray-400 font-semibold">{m.role === 'admin' ? 'Soporte · ' : ''}{formatDate(m.createdAt)}</span>
                </div>
              ))}
            </div>

            {/* Controles de estado */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Estado:</span>
              {STATUS_ORDER.map(s => {
                const active = selected.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => handleStatus(s)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${STATUS_META[s].cls} ${
                      active ? 'ring-2 ring-offset-1 ring-primary/40' : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    {STATUS_META[s].label}
                  </button>
                );
              })}
            </div>

            {/* Responder */}
            {selected.status !== SupportTicketStatus.CLOSED && (
              <div className="flex items-end gap-2">
                <input
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none"
                  placeholder="Escribe tu respuesta como soporte..."
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleReply(); }}
                  disabled={busy}
                />
                <button onClick={handleReply} disabled={busy || !reply.trim()} className="p-2.5 bg-primary text-white rounded-xl hover:bg-black disabled:opacity-50">
                  <Send size={16} />
                </button>
              </div>
            )}
            {selected.status === SupportTicketStatus.CLOSED && (
              <p className="text-center text-xs font-bold text-green-600">Este soporte está cerrado. Si la empresa escribe de nuevo, volverá a aparecer abierto.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SupportAdmin;