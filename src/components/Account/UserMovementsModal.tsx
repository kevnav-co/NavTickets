
import React, { useState, useMemo } from 'react';
import { X, Wallet } from 'lucide-react';
import { useModal } from '../../context/ModalContext';
import { Movement, GroupedMovements } from '../../types/accounting';
import { MovementItem } from './MovementItem';

// --- TIPOS ---
interface UserMovementsData {
  userId: string;
  userName: string;
  movements: Movement[];
}

interface UserMovementsModalProps {
    onDelete: (mov: Movement) => void;
}

// --- FUNCIONES DE AYUDA ---
const isSameDay = (d1: Date, d2: Date) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
const getStartOfWeek = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};
const getStartOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const formatGroupDate = (dateString: string) => {
    const date = new Date(`${dateString}T00:00:00`);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (isSameDay(date, today)) return 'Hoy';
    if (isSameDay(date, yesterday)) return 'Ayer';

    return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
};

export const UserMovementsModal: React.FC<UserMovementsModalProps> = ({ onDelete }) => {
  const { isModalOpen, closeModal, getModalData } = useModal();
  const isOpen = isModalOpen('userMovements');
  const data = getModalData<UserMovementsData>('userMovements');

  const [timeRange, setTimeRange] = useState('week');
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);

  const handleMovementClick = (movementId: string) => {
    setSelectedMovementId(prevId => prevId === movementId ? null : movementId);
  };

  const handleDeleteAndDeselect = (mov: Movement) => {
      onDelete(mov);
      setSelectedMovementId(null);
  }

  const filteredMovements = useMemo(() => {
    if (!data?.movements) return [];
    const now = new Date();
    if (timeRange === 'day') return data.movements.filter(mov => isSameDay(mov.createdAt.toDate(), now));
    if (timeRange === 'week') return data.movements.filter(mov => mov.createdAt.toDate() >= getStartOfWeek(now));
    if (timeRange === 'month') return data.movements.filter(mov => mov.createdAt.toDate() >= getStartOfMonth(now));
    return data.movements;
  }, [data, timeRange]);

  const groupedMovements = useMemo((): GroupedMovements => {
    if (!data?.userId) return {};

    return filteredMovements.reduce((groups, mov) => {
      const date = mov.createdAt.toDate().toISOString().split('T')[0];
      if (!groups[date]) {
        groups[date] = { movements: [], dailyBalance: 0 };
      }
      groups[date].movements.push(mov);
      
      let amount = 0;
      switch(mov.movementType) {
        case 'transaction':
          if (mov.recipientId === data.userId) amount = mov.amount;
          else if (mov.senderId === data.userId) amount = -mov.amount;
          break;
        case 'expense':
          amount = -mov.amount;
          break;
        case 'income':
          amount = mov.amount;
          break;
      }
      groups[date].dailyBalance += amount;

      return groups;
    }, {} as GroupedMovements);
  }, [filteredMovements, data?.userId]);

  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-fast">
      <div className="bg-gray-100 rounded-2xl p-6 w-full max-w-2xl h-[90vh] m-auto shadow-2xl relative flex flex-col">
        <div className="flex justify-between items-start mb-4">
            <div>
                <h2 className="text-2xl font-bold text-gray-800">Movimientos de {data.userName}</h2>
                <p className="text-sm text-gray-500">Historial de todas las transacciones.</p>
            </div>
            <button onClick={() => closeModal()} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
            </button>
        </div>

        <div className="flex justify-center mb-4">
            <div className="flex items-center gap-1 bg-gray-200 p-1 rounded-lg">
                <button onClick={() => setTimeRange('all')} className={`px-4 py-1.5 text-sm font-bold rounded-md ${timeRange === 'all' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Total</button>
                <button onClick={() => setTimeRange('day')} className={`px-4 py-1.5 text-sm font-bold rounded-md ${timeRange === 'day' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Día</button>
                <button onClick={() => setTimeRange('week')} className={`px-4 py-1.5 text-sm font-bold rounded-md ${timeRange === 'week' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Semana</button>
                <button onClick={() => setTimeRange('month')} className={`px-4 py-1.5 text-sm font-bold rounded-md ${timeRange === 'month' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Mes</button>
            </div>
        </div>

        <div className="overflow-y-auto flex-grow pr-2 -mr-2 space-y-6">
            {Object.keys(groupedMovements).length > 0 ? (
                Object.entries(groupedMovements).map(([date, { movements, dailyBalance }]) => (
                    <div key={date}>
                        <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-200">
                            <h4 className="font-bold text-gray-600 capitalize text-sm">{formatGroupDate(date)}</h4>
                            <p className={`font-bold text-sm ${dailyBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', signDisplay: 'always', minimumFractionDigits: 0 }).format(dailyBalance)}
                            </p>
                        </div>
                        <div className="space-y-2">
                            {movements.map(mov => {
                                const movementId = `${mov.movementType}-${mov.id}`;
                                return (
                                    <MovementItem 
                                        key={movementId} 
                                        mov={mov} 
                                        currentUserId={data.userId} 
                                        onDelete={handleDeleteAndDeselect} 
                                        isSelected={selectedMovementId === movementId}
                                        onItemClick={() => handleMovementClick(movementId)}
                                    />
                                );
                            })}
                        </div>
                    </div>
                ))
            ) : (
                <div className="text-center py-10 px-4 bg-white rounded-2xl shadow-sm mt-10">
                    <Wallet size={40} className="mx-auto text-gray-300"/>
                    <p className="mt-4 font-bold text-gray-700">Sin Movimientos</p>
                    <p className="text-sm text-gray-500">Este usuario no tiene movimientos en el período seleccionado.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
