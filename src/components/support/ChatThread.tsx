// src/components/support/ChatThread.tsx
// Hilo de chat estilo WhatsApp: alineación izquierda/derecha, agrupación por día, scroll automático.

import React, { useRef, useEffect } from 'react';
import { SupportMessage, SupportTicket } from '../../types';
import { isOwnMessage, groupByDay, formatTime } from '../../utils/chat';

interface ChatThreadProps {
  ticket: SupportTicket;
  messages?: SupportMessage[];
  viewerId?: string;
  viewerRole?: 'admin' | 'empresa';
}

const ChatThread: React.FC<ChatThreadProps> = ({ ticket, messages = [], viewerId, viewerRole }) => {
  const endRef = useRef<HTMLDivElement>(null);

  // Scroll al final cuando cambien los mensajes
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const grouped = groupByDay(messages);

  // El mensaje inicial del ticket es siempre de la empresa
  const isInitialFromSelf = viewerRole === 'empresa';

  return (
    <div className="flex flex-col gap-2">
      {/* Mensaje de apertura (ticket inicial) */}
      <div
        className={`max-w-[85%] p-3 rounded-2xl text-sm text-ink-soft whitespace-pre-wrap ${
          isInitialFromSelf
            ? 'self-end bg-blue-50 border border-blue-100'
            : 'self-start bg-sunken'
        }`}
      >
        <p>{ticket.message}</p>
        <span className="text-[10px] text-ink-faint font-semibold block mt-1">
          {isInitialFromSelf ? '' : 'Consulta'} {formatTime(ticket.createdAt)}
        </span>
      </div>

      {/* Separador + agrupación por día */}
      {grouped.length > 0 && (
        <>
          <div className="flex items-center gap-2 my-2">
            <div className="flex-1 h-px bg-line" />
            <span className="text-[10px] font-bold text-ink-faint uppercase tracking-wider">
              {grouped[0]?.date}
            </span>
            <div className="flex-1 h-px bg-line" />
          </div>

          {/* Hilos por día */}
          {grouped.map((group, dayIdx) => (
            <div key={dayIdx} className="flex flex-col gap-2">
              {/* Separador para días posteriores */}
              {dayIdx > 0 && (
                <div className="flex items-center gap-2 my-2">
                  <div className="flex-1 h-px bg-line" />
                  <span className="text-[10px] font-bold text-ink-faint uppercase tracking-wider">
                    {group.date}
                  </span>
                  <div className="flex-1 h-px bg-line" />
                </div>
              )}

              {/* Mensajes del día */}
              {group.messages.map(m => {
                const isOwn = isOwnMessage(m, viewerId, viewerRole);
                return (
                  <div
                    key={m.id}
                    className={`max-w-[85%] p-3 rounded-2xl text-sm text-ink-soft whitespace-pre-wrap ${
                      isOwn
                        ? 'self-end bg-blue-50 border border-blue-100'
                        : 'self-start bg-sunken'
                    }`}
                  >
                    <p>{m.message}</p>
                    <span className="text-[10px] text-ink-faint font-semibold block mt-1">
                      {isOwn ? '' : m.role === 'admin' ? 'Soporte ' : ''}
                      {formatTime(m.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}

      {/* Anclaje para scroll automático */}
      <div ref={endRef} />
    </div>
  );
};

export default ChatThread;
