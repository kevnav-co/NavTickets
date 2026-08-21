// src/components/order/SeguimientoTimeline.tsx
// Timeline/actividad de un tiquete (seguimientos), aislado por empresa.

import React, { useMemo } from 'react';
import { Seguimiento, SeguimientoType, User } from '../../types';
import {
  FilePlus2, PlayCircle, CheckCircle2, UserCheck, MessageSquare, RefreshCcw, Clock
} from 'lucide-react';
import { timeSince } from '../../utils/date';

interface Props {
  seguimientos: Seguimiento[];
  users: User[];
}

const TYPE_META: Record<SeguimientoType, { label: string; icon: React.ReactNode; color: string }> = {
  [SeguimientoType.CREACION]: { label: 'Creado', icon: <FilePlus2 size={16} />, color: 'bg-blue-50 text-blue-600' },
  [SeguimientoType.ESTADO]: { label: 'Estado', icon: <PlayCircle size={16} />, color: 'bg-amber-50 text-amber-600' },
  [SeguimientoType.ASIGNACION]: { label: 'Asignación', icon: <UserCheck size={16} />, color: 'bg-purple-50 text-purple-600' },
  [SeguimientoType.CIERRE]: { label: 'Cierre', icon: <CheckCircle2 size={16} />, color: 'bg-green-50 text-green-600' },
  [SeguimientoType.COMENTARIO]: { label: 'Comentario', icon: <MessageSquare size={16} />, color: 'bg-gray-100 text-gray-600' },
  [SeguimientoType.REABRIO_GARANTIA]: { label: 'Garantía', icon: <RefreshCcw size={16} />, color: 'bg-red-50 text-red-500' },
};

const SeguimientoTimeline: React.FC<Props> = ({ seguimientos, users }) => {
  const sorted = useMemo(
    () => [...(seguimientos || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [seguimientos]
  );

  if (!sorted.length) {
    return (
      <div className="text-center py-10 text-gray-400">
        <Clock size={28} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm font-bold">Sin seguimientos todavía</p>
        <p className="text-xs mt-1">La actividad de este tiquete aparecerá aquí.</p>
      </div>
    );
  }

  const userName = (id?: string | null) =>
    id ? (users.find(u => u.id === id)?.name ?? null) : null;

  return (
    <div className="relative">
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200" />
      <ul className="space-y-4">
        {sorted.map(s => {
          const meta = TYPE_META[s.type] || TYPE_META[SeguimientoType.ESTADO];
          const name = userName(s.userId);
          return (
            <li key={s.id} className="relative pl-10">
              <span className={`absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center ring-4 ring-white ${meta.color}`}>
                {meta.icon}
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{meta.label}</span>
                  <span className="text-[10px] text-gray-400">• {timeSince(new Date(s.createdAt))}</span>
                </div>
                <p className="text-sm font-bold text-gray-800 leading-snug">{s.action}</p>
                {(s.previousStatus && s.newStatus) && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {s.previousStatus} <span className="text-gray-400">→</span> {s.newStatus}
                  </p>
                )}
                {name && <p className="text-[11px] text-gray-400 mt-0.5">por {name}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default SeguimientoTimeline;