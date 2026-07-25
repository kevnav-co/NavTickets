
import React from 'react';
import { ArrowUp, ArrowDown, ShoppingCart, DollarSign, Repeat, Trash2, Pencil } from 'lucide-react';
import { useModal } from '../../context/ModalContext';
import { Movement } from '../../types/accounting';
import { useAuth } from '../../context/AuthContext';

interface MovementItemProps {
  mov: Movement;
  currentUserId: string;
  onDelete: (mov: Movement) => void;
  isSelected: boolean;
  onItemClick: () => void;
}

export const MovementItem: React.FC<MovementItemProps> = ({ mov, currentUserId, onDelete, isSelected, onItemClick }) => {
  const { openModal } = useModal();
  const { currentUser } = useAuth();

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(mov);
  };

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mov.movementType === 'transaction') {
      openModal('transfer', { editingTransaction: mov });
    }
  }

  const renderIcon = () => {
    switch (mov.movementType) {
      case 'transaction':
        if (mov.transactionGroupId) return <Repeat className="w-4 h-4 text-blue-500" />;
        return mov.recipientId === currentUserId ? <ArrowDown className="w-4 h-4 text-blue-500" /> : <ArrowUp className="w-4 h-4 text-red-500" />;
      case 'expense':
        return <ShoppingCart className="w-4 h-4 text-yellow-600" />;
      case 'income':
        return <DollarSign className="w-4 h-4 text-green-600" />;
      default: return null;
    }
  };

  const getIconBgColor = () => {
     switch (mov.movementType) {
      case 'transaction':
        if (mov.transactionGroupId) {
            const isInternalIncome = mov.concept.startsWith('Movimiento desde');
            return isInternalIncome ? 'bg-blue-100' : 'bg-red-100';
        }
        return mov.recipientId === currentUserId ? 'bg-blue-100' : 'bg-red-100';
      case 'expense': return 'bg-yellow-100';
      case 'income': return 'bg-green-100';
      default: return 'bg-gray-100';
    }
  }

  const getAmountDetails = () => {
    let sign = '';
    let color = 'text-gray-800';
    const absAmount = Math.abs(mov.amount);

    const isInternalIncome = mov.movementType === 'transaction' && mov.transactionGroupId && mov.concept.includes('desde');

    switch (mov.movementType) {
        case 'transaction':
            if (mov.transactionGroupId) {
                if (isInternalIncome) {
                    sign = mov.amount >= 0 ? '+' : '-';
                    color = mov.amount >= 0 ? 'text-blue-600' : 'text-red-600';
                } else {
                    sign = mov.amount >= 0 ? '-' : '+';
                    color = mov.amount >= 0 ? 'text-red-600' : 'text-blue-600';
                }
            } else if (mov.recipientId === currentUserId) {
                sign = mov.amount >= 0 ? '+' : '-';
                color = mov.amount >= 0 ? 'text-blue-600' : 'text-red-600';
            } else {
                sign = mov.amount >= 0 ? '-' : '+';
                color = mov.amount >= 0 ? 'text-red-600' : 'text-blue-600';
            }
            break;
        case 'expense':
            sign = mov.amount >= 0 ? '-' : '+';
            color = mov.amount >= 0 ? 'text-red-600' : 'text-green-600';
            break;
        case 'income':
            sign = mov.amount >= 0 ? '+' : '-';
            color = mov.amount >= 0 ? 'text-green-600' : 'text-red-600';
            break;
    }
    
    const formattedAmount = `${sign} ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(absAmount)}`;
    return { color, formattedAmount };
  }

  const renderSubtitle = () => {
      switch(mov.movementType) {
          case 'transaction':
              return mov.recipientId === currentUserId ? `De: ${mov.senderName}` : `Para: ${mov.recipientName}`;
          case 'expense':
          case 'income':
              return `Origen: ${mov.origin}`;
          default: 
              return null;
      }
  }

  const canBeModified = (() => {
    if (mov.isAnnulment) return false; // Las anulaciones no se pueden anular
    
    switch (mov.movementType) {
        case 'transaction':
            return mov.senderId === currentUserId;
        case 'expense':
            return mov.userId === currentUserId;
        case 'income':
            return currentUser?.role === 'admin';
        default:
            return false;
    }
  })();

  const abbreviateConcept = (concept: string): string => {
    return concept
      .replace(/Transferencia/g, 'Transf.')
      .replace(/Movimiento/g, 'Mov.')
      .replace(/Efectivo/g, 'Efect.')
      .replace(/ANULACIÓN:/g, '🚫 ANUL:');
  };

  const { color, formattedAmount } = getAmountDetails();
  const subtitleText = renderSubtitle();
  const abbreviatedConcept = abbreviateConcept(mov.concept);

  return (
    <div 
      className={`flex items-center justify-between p-2 bg-white rounded-lg w-full text-left cursor-pointer transition-shadow duration-200 ${isSelected ? 'shadow-lg' : 'hover:shadow-md'} ${mov.isAnnulment ? 'opacity-60 grayscale-[0.5]' : ''}`}
      onClick={onItemClick}
    >
      {/* Left side: Icon, Concept, Subtitle */}
      <div className="flex items-center gap-2 flex-grow min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${getIconBgColor()}`}>
          {renderIcon()}
        </div>
        <div className="flex-grow min-w-0">
          <p className="text-xs text-gray-800">
            <span className={`font-semibold ${mov.isAnnulment ? 'line-through' : ''}`}>{abbreviatedConcept}</span>
            {subtitleText && <span className="text-gray-500"> ・ {subtitleText}</span>}
          </p>
        </div>
      </div>
      
      {/* Right side: Amount and Actions */}
      <div className="flex items-center flex-shrink-0 ml-4">
        <div className={`text-sm font-bold text-right ${color} ${mov.isAnnulment ? 'line-through' : ''}`}>
          {formattedAmount}
        </div>
        
        {isSelected && canBeModified && (
          <div className="flex items-center animate-fade-in-fast ml-2">
            {mov.movementType === 'transaction' && 
              <button onClick={handleEditClick} className="text-gray-400 hover:text-blue-500 p-2 rounded-full hover:bg-gray-100">
                <Pencil size={14} />
              </button>
            }
            <button 
                onClick={handleDeleteClick} 
                className="text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-gray-100"
                title="Anular movimiento"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
