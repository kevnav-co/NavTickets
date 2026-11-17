import React, { useState, useMemo } from 'react';
import { X, Wallet } from 'lucide-react';
import type { Movement } from '../../types/accounting';
import { filterByRange, formatCOP, formatGroupDate, groupByDay, involvesUser, type TimeRange } from '../../utils/accounting';
import { MovementItem } from './MovementItem';

interface UserMovementsModalProps {
  user: { id: string; name: string };
  /** Todos los movimientos visibles; se filtran aquí para que la vista se actualice tras anular. */
  movements: Movement[];
  annulled: Set<string>;
  isAnnullable: (mov: Movement) => boolean;
  onAnnul: (mov: Movement) => void;
  onClose: () => void;
}

const RANGES: { id: TimeRange; label: string }[] = [
  { id: 'all', label: 'Total' },
  { id: 'day', label: 'Día' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
];

export const UserMovementsModal: React.FC<UserMovementsModalProps> = ({ user, movements, annulled, isAnnullable, onAnnul, onClose }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);

  const groups = useMemo(
    () => groupByDay(filterByRange(movements.filter(m => involvesUser(m, user.id)), timeRange), user.id),
    [movements, user.id, timeRange],
  );

  return (
    <div className="fixed inset-0 bg-gray-900/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-fast">
      <div className="bg-sunken rounded-2xl p-6 w-full max-w-2xl h-[90vh] m-auto shadow-2xl relative flex flex-col">
        <div className="flex justify-between items-start mb-4">
            <div>
                <h2 className="text-2xl font-bold text-ink">Movimientos de {user.name}</h2>
                <p className="text-sm text-ink-soft">Historial de todas las transacciones.</p>
            </div>
            <button onClick={onClose} className="text-ink-faint hover:text-ink-soft">
                <X size={24} />
            </button>
        </div>

        <div className="flex justify-center mb-4">
            <div className="flex items-center gap-1 bg-line p-1 rounded-lg">
                {RANGES.map(r => (
                  <button key={r.id} onClick={() => setTimeRange(r.id)} className={`px-4 py-1.5 text-sm font-bold rounded-md ${timeRange === r.id ? 'bg-raised shadow-sm' : 'text-ink-soft'}`}>{r.label}</button>
                ))}
            </div>
        </div>

        <div className="overflow-y-auto flex-grow pr-2 -mr-2 space-y-6">
            {Object.keys(groups).length > 0 ? (
                Object.entries(groups).map(([date, { movements: dayMovements, dailyBalance }]) => (
                    <div key={date}>
                        <div className="flex justify-between items-center mb-3 pb-2 border-b border-line">
                            <h4 className="font-bold text-ink-soft capitalize text-sm">{formatGroupDate(date)}</h4>
                            <p className={`font-bold text-sm ${dailyBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCOP(dailyBalance, 'always')}</p>
                        </div>
                        <div className="space-y-2">
                            {dayMovements.map(mov => {
                                const movementId = `${mov.movementType}-${mov.id}`;
                                return (
                                    <MovementItem
                                        key={movementId}
                                        mov={mov}
                                        viewerId={user.id}
                                        isAnnulled={annulled.has(mov.id)}
                                        canAnnul={isAnnullable(mov)}
                                        onAnnul={(m) => { onAnnul(m); setSelectedMovementId(null); }}
                                        isSelected={selectedMovementId === movementId}
                                        onItemClick={() => setSelectedMovementId(prev => prev === movementId ? null : movementId)}
                                    />
                                );
                            })}
                        </div>
                    </div>
                ))
            ) : (
                <div className="text-center py-10 px-4 bg-raised rounded-2xl shadow-sm mt-10">
                    <Wallet size={40} className="mx-auto text-ink-faint"/>
                    <p className="mt-4 font-bold text-ink-soft">Sin Movimientos</p>
                    <p className="text-sm text-ink-soft">Este usuario no tiene movimientos en el período seleccionado.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
