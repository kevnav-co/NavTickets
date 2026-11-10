import React from 'react';
import { ArrowUp, ArrowDown, ShoppingCart, DollarSign, Repeat, RotateCcw } from 'lucide-react';
import type { Movement } from '../../types/accounting';
import { formatCOP, signedAmount } from '../../utils/accounting';

interface MovementItemProps {
  mov: Movement;
  /** Usuario desde cuya perspectiva se muestra el signo (el que inició sesión o el que revisa un gestor). */
  viewerId: string;
  isAnnulled: boolean;
  canAnnul: boolean;
  onAnnul: (mov: Movement) => void;
  isSelected: boolean;
  onItemClick: () => void;
}

const abbreviateConcept = (concept: string) =>
  concept
    .replace(/Transferencia/g, 'Transf.')
    .replace(/Movimiento/g, 'Mov.')
    .replace(/Efectivo/g, 'Efect.')
    .replace(/ANULACIÓN:/g, '🚫 ANUL:');

export const MovementItem: React.FC<MovementItemProps> = ({ mov, viewerId, isAnnulled, canAnnul, onAnnul, isSelected, onItemClick }) => {
  const delta = signedAmount(mov, viewerId);
  const incoming = delta >= 0;

  const icon = (() => {
    switch (mov.movementType) {
      case 'transaction':
        if (mov.selfEntry) return <Repeat className="w-4 h-4 text-blue-500" />;
        return incoming ? <ArrowDown className="w-4 h-4 text-blue-500" /> : <ArrowUp className="w-4 h-4 text-red-500" />;
      case 'expense':
        return <ShoppingCart className="w-4 h-4 text-yellow-600" />;
      case 'income':
        return <DollarSign className="w-4 h-4 text-green-600" />;
    }
  })();

  const iconBg = mov.movementType === 'expense' ? 'bg-yellow-100'
    : mov.movementType === 'income' ? 'bg-green-100'
    : incoming ? 'bg-blue-100' : 'bg-red-100';

  const amountColor = !incoming ? 'text-red-600'
    : mov.movementType === 'transaction' ? 'text-blue-600' : 'text-green-600';

  const subtitle = mov.movementType === 'transaction'
    ? (mov.selfEntry ? `Cuenta: ${mov.method}` : mov.recipientId === viewerId ? `De: ${mov.senderName}` : `Para: ${mov.recipientName}`)
    : `Origen: ${mov.origin}`;

  const struck = mov.isAnnulment || isAnnulled;

  return (
    <div
      className={`flex items-center justify-between p-2 bg-white rounded-lg w-full text-left cursor-pointer transition-shadow duration-200 ${isSelected ? 'shadow-lg' : 'hover:shadow-md'} ${struck ? 'opacity-60 grayscale-[0.5]' : ''}`}
      onClick={onItemClick}
    >
      <div className="flex items-center gap-2 flex-grow min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>{icon}</div>
        <div className="flex-grow min-w-0">
          <p className="text-xs text-gray-800">
            <span className={`font-semibold ${struck ? 'line-through' : ''}`}>{abbreviateConcept(mov.concept)}</span>
            <span className="text-gray-500"> ・ {subtitle}</span>
            {isAnnulled && <span className="ml-1 text-[10px] font-bold text-red-500">ANULADO</span>}
          </p>
        </div>
      </div>

      <div className="flex items-center flex-shrink-0 ml-4">
        <div className={`text-sm font-bold text-right ${amountColor} ${struck ? 'line-through' : ''}`}>
          {`${incoming ? '+' : '-'} ${formatCOP(Math.abs(delta))}`}
        </div>
        {isSelected && canAnnul && (
          <button
            onClick={(e) => { e.stopPropagation(); onAnnul(mov); }}
            className="ml-2 text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-gray-100 animate-fade-in-fast"
            title="Anular movimiento"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>
    </div>
  );
};
