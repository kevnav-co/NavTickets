
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { ChevronLeft, ChevronRight, Plus, Wallet, Users, ArrowRightLeft, ChevronDown, RotateCcw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { useData } from '../../context/DataContext';
import { useCollection } from '../../hooks/useCollection';

import { Movement, User, Transaction, Expense, Income, GroupedMovements } from '../../types/accounting';
import { MovementItem } from './MovementItem';
import { UserMovementsModal } from './UserMovementsModal';

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
const getEndOfWeek = (date: Date) => {
    const start = getStartOfWeek(date);
    start.setDate(start.getDate() + 6);
    start.setHours(23, 59, 59, 999);
    return start;
}
const getStartOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const formatGroupDate = (dateString: string) => {
    const date = new Date(`${dateString}T12:00:00Z`);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    if (isSameDay(date, today)) return 'Hoy';
    if (isSameDay(date, yesterday)) return 'Ayer';
    
    return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
};

const formatWeekRange = (date: Date) => {
    const start = getStartOfWeek(date);
    const end = getEndOfWeek(date);
    const startMonth = new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(start);
    const endMonth = new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(end);
    if (start.getMonth() === end.getMonth()) {
        return `${start.getDate()} - ${end.getDate()} de ${startMonth}`;
    }
    return `${start.getDate()} ${startMonth} - ${end.getDate()} ${endMonth}`;
}

// --- COMPONENTE PRINCIPAL ---
const Accounting: React.FC = () => {
  const { currentUser } = useAuth();
  const { openModal } = useModal();
  const { addItem, updateItem, deleteItem } = useData();
  const companyId = currentUser?.companyId;

  // --- DATOS REACTIVOS CON useCollection ---
  const canViewUserBalances = currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'supervisor';

  const filters = useMemo(() => companyId ? [{ column: 'company_id', operator: 'eq', value: companyId }] : [], [companyId]);

  const { data: transactions, loading: loadingTransactions } = useCollection<Transaction>('transactions', {
    filters,
    realtime: true,
    enabled: !!currentUser,
  });
  const { data: expenses, loading: loadingExpenses } = useCollection<Expense>('expenses', {
    filters,
    realtime: true,
    enabled: !!currentUser,
  });
  const { data: incomes, loading: loadingIncomes } = useCollection<Income>('incomes', {
    filters,
    realtime: true,
    enabled: !!currentUser && canViewUserBalances,
  });
  const { data: users, loading: loadingUsers } = useCollection<User>('users', {
    filters,
    realtime: true,
    enabled: !!currentUser && canViewUserBalances,
  });

  const loading = loadingTransactions || loadingExpenses || loadingIncomes || loadingUsers;

  // --- ESTADOS DE UI ---
  const [historyTimeRange, setHistoryTimeRange] = useState('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [isChartCollapsed, setIsChartCollapsed] = useState(true);

  const handleMovementClick = (movementId: string) => {
    setSelectedMovementId(prevId => prevId === movementId ? null : movementId);
  };

  const allMovements = useMemo((): Movement[] => {
    const combined: Movement[] = [
      ...(transactions || []).map(tx => ({ ...tx, movementType: 'transaction' as const, createdAt: new Date(tx.createdAt).getTime() })),
      ...(expenses || []).map(ex => ({ ...ex, movementType: 'expense' as const, createdAt: new Date(ex.createdAt).getTime() })),
      ...(canViewUserBalances ? (incomes || []).map(inc => ({ ...inc, movementType: 'income' as const, createdAt: new Date(inc.createdAt).getTime() })) : []),
    ];
    return combined.sort((a, b) => b.createdAt - a.createdAt);
  }, [transactions, expenses, incomes, canViewUserBalances]);

  const currentUserMovements = useMemo(() => {
      if (!currentUser?.id) return [];
      return allMovements.filter(mov => {
          if (mov.movementType === 'transaction') return mov.senderId === currentUser.id || mov.recipientId === currentUser.id;
          if (mov.movementType === 'expense' || mov.movementType === 'income') return mov.userId === currentUser.id;
          return false;
      });
  }, [allMovements, currentUser?.id]);

  const currentUserBalances = useMemo(() => {
    const newBalances = { cash: 0, transfer: 0, total: 0 };
    if (!currentUser?.id) return newBalances;

    currentUserMovements.forEach(mov => {
      const amount = mov.amount;
      let key: 'cash' | 'transfer' = 'transfer';
      if (mov.movementType === 'transaction') {
        key = mov.method === 'Efectivo' ? 'cash' : 'transfer';
      } else if (mov.movementType === 'expense' || mov.movementType === 'income') {
        key = mov.origin === 'Efectivo' ? 'cash' : 'transfer';
      }

      switch(mov.movementType) {
        case 'transaction':
          if (mov.transactionGroupId) {
            if (mov.concept.startsWith('Mov. desde')) newBalances[key] += amount;
            else newBalances[key] -= amount;
          } else {
            if (mov.recipientId === currentUser.id) newBalances[key] += amount;
            else if (mov.senderId === currentUser.id) newBalances[key] -= amount;
          }
          break;
        case 'expense': newBalances[key] -= amount; break;
        case 'income': newBalances[key] += amount; break;
      }
    });
    return { ...newBalances, total: newBalances.cash + newBalances.transfer };
  }, [currentUserMovements, currentUser?.id]);

  const userBalances = useMemo(() => {
    const role = currentUser?.role;
    if (!canViewUserBalances) return [];

    let targetUsers;
    if (role === 'admin') {
      targetUsers = users.filter(u => u.role === 'supervisor');
    } else if (role === 'supervisor') {
      targetUsers = users.filter(u => u.role === 'technician');
    } else { // for developer and any other case
      targetUsers = users.filter(u => u.role === 'technician' || u.role === 'supervisor');
    }

    return targetUsers.map(user => {
      let balance = 0;
      allMovements.forEach(mov => {
        if ((mov.movementType === 'expense' || mov.movementType === 'income') && mov.userId === user.id) {
          balance += mov.movementType === 'income' ? mov.amount : -mov.amount;
        } else if (mov.movementType === 'transaction') {
          if (mov.senderId === user.id) balance -= mov.amount;
          if (mov.recipientId === user.id) balance += mov.amount;
        }
      });
      return { userId: user.id, userName: user.name, balance };
    });
  }, [allMovements, users, currentUser?.role, canViewUserBalances]);

  const handleOpenUserMovements = (userId: string, userName: string) => {
    const movementsForUser = allMovements.filter(mov => 
        (mov.movementType === 'expense' || mov.movementType === 'income') 
            ? mov.userId === userId 
            : (mov.movementType === 'transaction' && (mov.senderId === userId || mov.recipientId === userId))
    );
    openModal('userMovements', { userId, userName, movements: movementsForUser });
  }

  // --- MANEJADOR DE ANULACIÓN ---
  const handleAnnulMovement = useCallback(async (mov: Movement) => {
    openModal('annulment-confirm', {
      movement: mov,
      onConfirm: async (reason: string) => {
        try {
          const now = new Date().toISOString();

          if (mov.movementType === 'transaction' && mov.transactionGroupId) {
            // Find all transactions in the same group from local data
            const groupTransactions = (transactions || []).filter(t => t.transactionGroupId === mov.transactionGroupId);
            const newGroupId = `annul_${Date.now()}`;

            for (const groupTx of groupTransactions) {
              await addItem('transactions', {
                ...groupTx,
                amount: groupTx.amount,
                concept: `ANULACIÓN: ${groupTx.concept}${reason ? ` (Motivo: ${reason})` : ''}`,
                createdAt: now,
                isAnnulment: true,
                relatedMovementId: groupTx.id,
                transactionGroupId: newGroupId,
                senderId: groupTx.recipientId,
                senderName: groupTx.recipientName,
                recipientId: groupTx.senderId,
                recipientName: groupTx.senderName
              });
            }
          } else if (mov.movementType === 'transaction') {
            await addItem('transactions', {
              ...mov,
              concept: `ANULACIÓN: ${mov.concept}${reason ? ` (Motivo: ${reason})` : ''}`,
              createdAt: now,
              isAnnulment: true,
              relatedMovementId: mov.id,
              senderId: mov.recipientId,
              senderName: mov.recipientName,
              recipientId: mov.senderId,
              recipientName: mov.senderName
            });
          } else {
            const collectionName = mov.movementType === 'expense' ? 'expenses' : 'incomes';
            const { id, movementType, ...rest } = mov as any;
            await addItem(collectionName, {
              ...rest,
              amount: -mov.amount,
              concept: `ANULACIÓN: ${mov.concept}${reason ? ` (Motivo: ${reason})` : ''}`,
              createdAt: now,
              isAnnulment: true,
              relatedMovementId: mov.id
            });
          }
          setSelectedMovementId(null);
        } catch (error) {
          console.error("Error al anular el movimiento: ", error);
          throw error;
        }
      }
    });
  }, [transactions, addItem]);

  // --- MANEJADORES DE MODALES CON RESTRICCIÓN DE SALDO ---
  const handleOpenTransferModal = () => {
    openModal('transfer', { balances: currentUserBalances });
  };

  const handleOpenExpenseModal = () => {
    openModal('expense', { balances: currentUserBalances });
  };

  const canSpend = currentUserBalances.cash > 0 || currentUserBalances.transfer > 0;
  const isAdminOrDev = currentUser?.role === 'admin' || currentUser?.role === 'developer';

  const historyFilteredMovements = useMemo(() => {
    const source = currentUserMovements;
    const now = new Date();
    if (historyTimeRange === 'day') return source.filter(mov => isSameDay(new Date(mov.createdAt), now));
    if (historyTimeRange === 'week') return source.filter(mov => new Date(mov.createdAt) >= getStartOfWeek(now));
    if (historyTimeRange === 'month') return source.filter(mov => new Date(mov.createdAt) >= getStartOfMonth(now));
    return source;
  }, [currentUserMovements, historyTimeRange]);

  const groupedMovements = useMemo((): GroupedMovements => {
    if (!currentUser?.id) return {};
    return historyFilteredMovements.reduce((groups, mov) => {
      const jsDate = new Date(mov.createdAt);
      const date = jsDate.toISOString().split('T')[0];

      if (!groups[date]) groups[date] = { movements: [], dailyBalance: 0 };
      groups[date].movements.push(mov);

      let amountChange = 0;
      switch(mov.movementType) {
        case 'transaction':
          if (mov.transactionGroupId) { // Movimiento interno
              amountChange = mov.concept.startsWith('Mov. desde') ? mov.amount : -mov.amount;
          } else { // Transferencia normal
            amountChange = mov.recipientId === currentUser.id ? mov.amount : -mov.amount;
          }
          break;
        case 'expense': amountChange = -mov.amount; break;
        case 'income': amountChange = mov.amount; break;
      }
      groups[date].dailyBalance += amountChange;

      return groups;
    }, {} as GroupedMovements);
  }, [historyFilteredMovements, currentUser?.id]);

  const chartData = useMemo(() => {
    const startOfWeek = getStartOfWeek(currentDate);
    const endOfWeek = getEndOfWeek(currentDate);
    const weekMovements = currentUserMovements.filter(mov => {
        const movDate = new Date(mov.createdAt);
        return movDate >= startOfWeek && movDate <= endOfWeek;
    });
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const data = days.map(name => ({ name, Ingresos: 0, Egresos: 0 }));
    weekMovements.forEach(mov => {
        const dayIndex = new Date(mov.createdAt).getDay();
        const amount = mov.amount;
        switch(mov.movementType) {
            case 'income': data[dayIndex].Ingresos += amount; break;
            case 'expense': data[dayIndex].Egresos += amount; break;
            case 'transaction':
                 if (mov.transactionGroupId) {
                    if(mov.concept.startsWith('Mov. desde')) {
                        data[dayIndex].Ingresos += amount;
                    } else {
                        data[dayIndex].Egresos += amount;
                    }
                 } else if (mov.recipientId === currentUser?.id) {
                    data[dayIndex].Ingresos += amount;
                 } else if (mov.senderId === currentUser?.id) {
                    data[dayIndex].Egresos += amount;
                 }
                 break;
        }
    });
    return data;
  }, [currentUserMovements, currentDate, currentUser?.id]);

  return (
    <>
    <div className="p-4 md:p-6 bg-gray-100 min-h-screen pb-32">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="md:col-span-1">
                <div className="bg-white p-4 rounded-2xl shadow-sm h-full">
                    <p className="text-xs font-bold text-gray-400">Mi Balance</p>
                    <p className={`text-3xl font-black tracking-tighter mb-1 ${currentUserBalances.total >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                        {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(currentUserBalances.total)}
                    </p>
                    <div className="border-t border-gray-100 pt-2 mt-2 space-y-0.5">
                        <div className="flex justify-between items-center text-xs"><span className="text-gray-500 font-medium">Efectivo</span><span className="font-bold text-gray-600">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(currentUserBalances.cash)}</span></div>
                        <div className="flex justify-between items-center text-xs"><span className="text-gray-500 font-medium">Transferencia</span><span className="font-bold text-gray-600">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(currentUserBalances.transfer)}</span></div>
                    </div>
                </div>
            </div>

            {canViewUserBalances && (
                <div className="md:col-span-2">
                    <div className="bg-white p-4 rounded-2xl shadow-sm h-full">
                        <div className="flex items-center gap-3 mb-2">
                            <Users className="text-gray-400" size={16}/>
                            <h3 className="font-bold text-sm text-gray-800">Balances por Usuario</h3>
                        </div>
                        <div className="space-y-1">
                            {loading ? <p className="text-xs text-gray-500">Calculando balances...</p> : userBalances.map(ub => (
                                <button key={ub.userId} onClick={() => handleOpenUserMovements(ub.userId, ub.userName)} className="w-full flex justify-between items-center px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors text-sm">
                                    <span className="font-semibold text-gray-600">{ub.userName}</span>
                                    <span className={`font-bold ${ub.balance >= 0 ? 'text-gray-800' : 'text-red-600'}`}>{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(ub.balance)}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm mb-6">
        <div 
            className="flex justify-between items-center cursor-pointer"
            onClick={() => setIsChartCollapsed(!isChartCollapsed)}
        >
          <h3 className="font-semibold text-sm text-gray-800">Resumen Semanal</h3>
           <div className="flex items-center gap-2">
              <button 
                  onClick={(e) => {
                      e.stopPropagation();
                      setCurrentDate(d => new Date(d.setDate(d.getDate() - 7)))
                  }} 
                  className="p-1 rounded-md hover:bg-gray-100 text-gray-500"
              >
                  <ChevronLeft size={16}/>
              </button>
              <span className="text-xs font-bold text-gray-500 w-24 text-center">{formatWeekRange(currentDate)}</span>
              <button 
                  onClick={(e) => {
                      e.stopPropagation();
                      setCurrentDate(d => new Date(d.setDate(d.getDate() + 7)))
                  }} 
                  className="p-1 rounded-md hover:bg-gray-100 text-gray-500"
              >
                  <ChevronRight size={16}/>
              </button>
              <ChevronDown size={20} className={`text-gray-400 transition-transform ${isChartCollapsed ? '' : 'rotate-180'}`} />
            </div>
        </div>
        {!isChartCollapsed && (
            <div className="mt-4 animate-fade-in-fast" style={{ width: '100%', height: 200 }}>
              {loading ? <p className="text-center text-gray-500 text-sm">Cargando datos...</p> : (
                <ResponsiveContainer>
                    <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: -5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${Number(value) / 1000}k`} />
                        <Tooltip 
                            wrapperStyle={{ fontSize: '12px' }} 
                            formatter={(value: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)} 
                        />
                        <Legend wrapperStyle={{ fontSize: '10px' }} iconSize={10} />
                        <Bar dataKey="Ingresos" fill="#22c55e" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="Egresos" fill="#ef4444" radius={[2, 2, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
              )}
            </div>
        )}
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-800">Mi Historial de Movimientos</h3>
            <div className="flex items-center gap-1 bg-gray-200 p-1 rounded-lg">
                <button onClick={() => setHistoryTimeRange('all')} className={`px-3 py-1 text-xs font-bold rounded-md ${historyTimeRange === 'all' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Total</button>
                <button onClick={() => setHistoryTimeRange('day')} className={`px-3 py-1 text-xs font-bold rounded-md ${historyTimeRange === 'day' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Día</button>
                <button onClick={() => setHistoryTimeRange('week')} className={`px-3 py-1 text-xs font-bold rounded-md ${historyTimeRange === 'week' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Semana</button>
                <button onClick={() => setHistoryTimeRange('month')} className={`px-3 py-1 text-xs font-bold rounded-md ${historyTimeRange === 'month' ? 'bg-white shadow-sm' : 'text-gray-500'}`}>Mes</button>
            </div>
        </div>
        {loading ? <p className="text-center text-gray-500">Cargando historial...</p> : (
            Object.keys(groupedMovements).length > 0 ? (
                <div className="space-y-4">
                    {Object.entries(groupedMovements).map(([date, { movements, dailyBalance }]) => (
                        <div key={date}>
                            <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200">
                                <h4 className="font-semibold text-gray-500 uppercase text-xs">{formatGroupDate(date)}</h4>
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
                                            currentUserId={currentUser?.id || ''} 
                                            onDelete={handleAnnulMovement} 
                                            isSelected={selectedMovementId === movementId}
                                            onItemClick={() => handleMovementClick(movementId)}
                                        />
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-10 px-4 bg-white rounded-2xl shadow-sm">
                    <Wallet size={40} className="mx-auto text-gray-300"/>
                    <p className="mt-4 font-bold text-gray-700">Sin movimientos</p>
                    <p className="text-sm text-gray-500">No hay transacciones ni gastos para el período seleccionado.</p>
                </div>
            )
        )}
      </div>

      <div className="fixed bottom-24 right-4 md:right-6 space-y-3 md:bottom-6 z-40">
        <button 
            onClick={handleOpenTransferModal} 
            disabled={!canSpend}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 transform bg-white text-primary border border-gray-200 hover:bg-gray-50 focus:ring-4 focus:ring-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title={canSpend ? "Transferir Dinero" : "No tienes saldo para transferir"}
        >
            <ArrowRightLeft size={24} />
        </button>
        <button 
            onClick={handleOpenExpenseModal} 
            disabled={!isAdminOrDev && !canSpend}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 transform bg-primary text-white hover:bg-primary-dark focus:ring-4 focus:ring-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title={isAdminOrDev || canSpend ? (isAdminOrDev ? 'Registrar Movimiento' : 'Agregar Gasto') : "No tienes saldo para registrar gastos"}
        >
            <Plus size={28} strokeWidth={3} />
        </button>
      </div>
    </div>

    <UserMovementsModal onDelete={handleAnnulMovement} />
    </>
  );
};

export default Accounting;
