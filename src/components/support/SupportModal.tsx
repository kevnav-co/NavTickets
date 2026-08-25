// src/components/support/SupportModal.tsx
// Modal de soporte interno de cada empresa: lista los soportes de la empresa,
// permite crear una consulta y hacer chat con el soporte (super_admin).
// Accesible desde el Header y desde la campana de notificaciones.

import React, { useState, useMemo } from 'react';
import { X, LifeBuoy, Plus, ArrowLeft, Loader2, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useCollection } from '../../hooks/useCollection';
import { SupportTicket, SupportMessage, SupportTicketStatus } from '../../types';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_META: Record<SupportTicketStatus, { label: string; cls: string }> = {
  [SupportTicketStatus.OPEN]: { label: 'Abierto', cls: 'bg-amber-100 text-amber-700' },
  [SupportTicketStatus.IN_PROGRESS]: { label: 'En Progreso', cls: 'bg-blue-100 text-blue-700' },
  [SupportTicketStatus.CLOSED]: { label: 'Cerrado', cls: 'bg-green-100 text-green-700' },
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const { addItem } = useData();

  const companyId = currentUser?.companyId;

  // Lista de soportes de la empresa (RLS: company own).
  const { data: tickets, loading: ticketsLoading, error: ticketsError } = useCollection<SupportTicket>('support_tickets', {
    filters: companyId ? [{ column: 'company_id', operator: 'eq', value: companyId }] : [],
    orderBy: { column: 'created_at', ascending: false },
  });

  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => (selectedId ? tickets?.find(t => t.id === selectedId) : undefined),
    [selectedId, tickets]
  );

  // Hilo del ticket seleccionado (chat en vivo).
  const { data: messages } = useCollection<SupportMessage>('support_messages', {
    filters: selectedId ? [{ column: 'ticket_id', operator: 'eq', value: selectedId }] : [],
    orderBy: { column: 'created_at', ascending: true },
    realtime: true,
  });

  if (!isOpen) return null;
  if (!currentUser) return null;

  const goList = () => { setView('list'); setSelectedId(null); setSubject(''); setMessage(''); setReply(''); };

  const handleCreate = async () => {
    if (!subject.trim() || !message.trim()) return;
    setBusy(true);
    const { data, error } = await addItem('support_tickets', {
      companyId: currentUser.companyId,
      userId: currentUser.id,
      subject: subject.trim(),
      message: message.trim(),
    });
    setBusy(false);
    if (error) { alert('No se pudo enviar la consulta: ' + error); return; }
    setSelectedId(data?.id ?? null);
    setSubject(''); setMessage('');
    setView('detail');
    // El aviso al super_admin (push + contador) lo dispara un trigger de la BD
    // (migración 011 → edge `support-notify`); no hace falta fire desde el front.
  };

  const handleReply = async () => {
    if (!selectedId || !reply.trim()) return;
    setBusy(true);
    const { error } = await addItem('support_messages', {
      ticketId: selectedId,
      userId: currentUser.id,
      role: 'empresa',
      message: reply.trim(),
    });
    setBusy(false);
    if (error) { alert('No se pudo enviar el mensaje: ' + error); return; }
    setReply('');
  };

  const btnCls = "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm uppercase tracking-widest transition-colors";
  const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col" style={{ height: 'min(80vh, 640px)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          {view !== 'list' && (
            <button onClick={goList} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500"><ArrowLeft size={18} /></button>
          )}
          <LifeBuoy size={20} className="text-primary" />
          <h2 className="text-lg font-bold text-gray-800 flex-1">Soporte de la app</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {view === 'list' && (
            <>
              <button
                onClick={() => setView('create')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-primary/30 text-sm font-bold text-primary hover:bg-red-50/50 transition-colors"
              >
                <Plus size={18} /> Nueva consulta
              </button>

              {ticketsLoading && (
                <div className="flex items-center justify-center gap-2 text-gray-400 py-8"><Loader2 className="animate-spin" size={22} /><span>Cargando soportes...</span></div>
              )}
              {ticketsError && <p className="text-center text-sm text-red-500 font-bold py-6">Error: {ticketsError.message}</p>}
              {!ticketsLoading && !ticketsError && (tickets || []).length === 0 && (
                <p className="text-center text-sm text-gray-400 py-10">No tienes consultas de soporte aún. Crea una "Nueva consulta".</p>
              )}

              {(tickets || []).map(t => {
                const meta = STATUS_META[t.status] || STATUS_META[SupportTicketStatus.OPEN];
                return (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedId(t.id); setView('detail'); }}
                    className="w-full text-left p-4 rounded-2xl border border-gray-100 hover:border-primary/30 hover:bg-gray-50/60 transition-colors flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{t.subject}</p>
                      <p className="text-xs text-gray-400 font-medium truncate">{t.message}</p>
                      <span className="text-[10px] text-gray-300 font-semibold">{formatDate(t.createdAt)}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${meta.cls} flex-shrink-0`}>{meta.label}</span>
                  </button>
                );
              })}
            </>
          )}

          {view === 'create' && (
            <div className="space-y-3">
              <input className={inputCls} placeholder="Asunto (ej: problemas de conexión)" value={subject} onChange={e => setSubject(e.target.value)} />
              <textarea className={`${inputCls} min-h-[140px] resize-none`} placeholder="Describe tu consulta o incidencia..." value={message} onChange={e => setMessage(e.target.value)} />
              <button
                onClick={handleCreate}
                disabled={busy || !subject.trim() || !message.trim()}
                className={`${btnCls} bg-primary text-white hover:bg-black disabled:opacity-50`}
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Enviar a soporte
              </button>
            </div>
          )}

          {view === 'detail' && selected && (
            <div className="flex flex-col h-full min-h-[300px]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-gray-800 truncate">{selected.subject}</h3>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${(STATUS_META[selected.status] || STATUS_META[SupportTicketStatus.OPEN]).cls}`}>
                  {(STATUS_META[selected.status] || STATUS_META[SupportTicketStatus.OPEN]).label}
                </span>
              </div>

              {/* Hilo */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {/* Mensaje de apertura */}
                <div className="max-w-[85%] p-3 rounded-2xl bg-gray-100 text-sm text-gray-700">
                  <p>{selected.message}</p>
                  <span className="text-[10px] text-gray-400 font-semibold">{formatDate(selected.createdAt)}</span>
                </div>

                {(messages || []).map(m => (
                  <div
                    key={m.id}
                    className={`max-w-[85%] p-3 rounded-2xl text-sm text-gray-700 ${m.role === 'empresa' ? 'bg-gray-100' : 'bg-red-50 border border-red-100'}`}
                  >
                    <p className="whitespace-pre-wrap">{m.message}</p>
                    <span className="text-[10px] text-gray-400 font-semibold">
                      {m.role === 'admin' ? 'Soporte · ' : ''}{formatDate(m.createdAt)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Responder */}
              {selected.status !== SupportTicketStatus.CLOSED && (
                <div className="mt-3 flex items-end gap-2">
                  <input
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-300 focus:outline-none"
                    placeholder="Escribe un mensaje..."
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleReply(); }}
                    disabled={busy}
                  />
                  <button
                    onClick={handleReply}
                    disabled={busy || !reply.trim()}
                    className="p-2.5 bg-primary text-white rounded-xl hover:bg-black disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportModal;