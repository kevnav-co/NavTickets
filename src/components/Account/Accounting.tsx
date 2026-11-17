import React, { useState, useMemo, useCallback, Suspense, lazy } from 'react';
import { ChevronLeft, ChevronRight, Plus, Users, ArrowRightLeft, ChevronDown, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { useCollection } from '../../hooks/useCollection';
import type { QueryFilter } from '../../hooks/useSupabaseQuery';
import type { User } from '../../types';
import type { Expense, Income, Movement, Transaction } from '../../types/accounting';
import {
  annulledIds, canAnnul, canRegisterIncome, computeBalances, filterByRange, formatCOP, formatGroupDate,
  formatWeekRange, groupByDay, involvesUser, isAccountingManager, toMovements, type TimeRange,
} from '../../utils/accounting';
import { annulMovement } from '../../services/accounting';
import { MovementItem } from './MovementItem';
import { UserMovementsModal } from './UserMovementsModal';

const WeeklyChart = lazy(() => import('./WeeklyChart'));

const RANGES: { id: TimeRange; label: string }[] = [
  { id: 'all', label: 'Total' },
  { id: 'day', label: 'Día' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
];

const Accounting: React.FC = () => {
  const { currentUser } = useAuth();
  const { openModal } = useModal();
  const companyId = currentUser?.companyId;
  const isManager = isAccountingManager(currentUser?.role);

  // RLS ya limita a la empresa y, para no gestores, a los movimientos propios.
  const filters = useMemo<QueryFilter[]>(() => companyId ? [{ column: 'company_id', operator: 'eq', value: companyId }] : [], [companyId]);

  const { data: transactions, loading: loadingTransactions } = useCollection<Transaction>('transactions', { filters, enabled: !!currentUser });
  const { data: expenses, loading: loadingExpenses } = useCollection<Expense>('expenses', { filters, enabled: !!currentUser });
  const { data: incomes, loading: loadingIncomes } = useCollection<Income>('incomes', { filters, enabled: !!currentUser });
  const { data: users, loading: loadingUsers } = useCollection<User>('users', { filters, enabled: !!currentUser && isManager });

  const loading = loadingTransactions || loadingExpenses || loadingIncomes || (isManager && loadingUsers);

  const [historyTimeRange, setHistoryTimeRange] = useState<TimeRange>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [isChartCollapsed, setIsChartCollapsed] = useState(true);
  const [viewedUser, setViewedUser] = useState<{ id: string; name: string } | null>(null);

  const allMovements = useMemo(
    () => toMovements(transactions || [], expenses || [], incomes || []),
    [transactions, expenses, incomes],
  );
  const annulled = useMemo(() => annulledIds(allMovements), [allMovements]);

  const myId = currentUser?.id ?? '';
  const currentUserMovements = useMemo(() => allMovements.filter(m => involvesUser(m, myId)), [allMovements, myId]);
  const currentUserBalances = useMemo(() => computeBalances(currentUserMovements, myId), [currentUserMovements, myId]);

  const userBalances = useMemo(() => {
    if (!isManager) return [];
    const role = currentUser?.role;
    const targetRoles = role === 'admin' ? ['supervisor'] : role === 'supervisor' ? ['technician'] : ['technician', 'supervisor'];
    return (users || [])
      .filter(u => targetRoles.includes(u.role))
      .map(u => ({ userId: u.id, userName: u.name, balance: computeBalances(allMovements, u.id).total }));
  }, [allMovements, users, currentUser?.role, isManager]);

  const actor = useMemo(() => ({ id: myId, role: currentUser?.role ?? '' }), [myId, currentUser?.role]);
  const isAnnullable = useCallback((mov: Movement) => canAnnul(mov, actor, annulled), [actor, annulled]);

  const handleAnnulMovement = useCallback((mov: Movement) => {
    openModal('annulment-confirm', {
      movement: mov,
      onConfirm: async (reason: string) => {
        await annulMovement(mov.movementType, mov.id, reason);
        setSelectedMovementId(null);
      },
    });
  }, [openModal]);

  const historyGroups = useMemo(
    () => groupByDay(filterByRange(currentUserMovements, historyTimeRange), myId),
    [currentUserMovements, historyTimeRange, myId],
  );

  const canSpend = currentUserBalances.cash > 0 || currentUserBalances.transfer > 0;
  const canAddMovement = canSpend || canRegisterIncome(currentUser?.role);

  return (
    <>
    <div className="p-4 md:p-6 bg-sunken min-h-screen pb-32">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="md:col-span-1">
                <div className="bg-raised p-4 rounded-2xl shadow-sm h-full">
                    <p className="text-xs font-bold text-ink-faint">Mi Balance</p>
                    <p className={`text-3xl font-black tracking-tighter mb-1 ${currentUserBalances.total >= 0 ? 'text-ink' : 'text-red-600'}`}>
                        {formatCOP(currentUserBalances.total)}
                    </p>
                    <div className="border-t border-line-soft pt-2 mt-2 space-y-0.5">
                        <div className="flex justify-between items-center text-xs"><span className="text-ink-soft font-medium">Efectivo</span><span className="font-bold text-ink-soft">{formatCOP(currentUserBalances.cash)}</span></div>
                        <div className="flex justify-between items-center text-xs"><span className="text-ink-soft font-medium">Transferencia</span><span className="font-bold text-ink-soft">{formatCOP(currentUserBalances.transfer)}</span></div>
                    </div>
                </div>
            </div>

            {isManager && (
                <div className="md:col-span-2">
                    <div className="bg-raised p-4 rounded-2xl shadow-sm h-full">
                        <div className="flex items-center gap-3 mb-2">
                            <Users className="text-ink-faint" size={16}/>
                            <h3 className="font-bold text-sm text-ink">Balances por Usuario</h3>
                        </div>
                        <div className="space-y-1">
                            {loading ? <p className="text-xs text-ink-soft">Calculando balances...</p> : userBalances.map(ub => (
                                <button key={ub.userId} onClick={() => setViewedUser({ id: ub.userId, name: ub.userName })} className="w-full flex justify-between items-center px-2 py-1.5 rounded-lg hover:bg-sunken transition-colors text-sm">
                                    <span className="font-semibold text-ink-soft">{ub.userName}</span>
                                    <span className={`font-bold ${ub.balance >= 0 ? 'text-ink' : 'text-red-600'}`}>{formatCOP(ub.balance)}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>

      <div className="bg-raised p-4 rounded-2xl shadow-sm mb-6">
        <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsChartCollapsed(!isChartCollapsed)}>
          <h3 className="font-semibold text-sm text-ink">Resumen Semanal</h3>
           <div className="flex items-center gap-2">
              <button
                  onClick={(e) => { e.stopPropagation(); setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; }); }}
                  className="p-1 rounded-md hover:bg-sunken text-ink-soft"
              >
                  <ChevronLeft size={16}/>
              </button>
              <span className="text-xs font-bold text-ink-soft w-24 text-center">{formatWeekRange(currentDate)}</span>
              <button
                  onClick={(e) => { e.stopPropagation(); setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }); }}
                  className="p-1 rounded-md hover:bg-sunken text-ink-soft"
              >
                  <ChevronRight size={16}/>
              </button>
              <ChevronDown size={20} className={`text-ink-faint transition-transform ${isChartCollapsed ? '' : 'rotate-180'}`} />
            </div>
        </div>
        {!isChartCollapsed && (
            <div className="mt-4 animate-fade-in-fast">
              <Suspense fallback={<div className="h-20 flex items-center justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-700" /></div>}>
                <WeeklyChart movements={currentUserMovements} currentDate={currentDate} userId={myId} loading={loading} />
              </Suspense>
            </div>
        )}
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-ink">Mi Historial de Movimientos</h3>
            <div className="flex items-center gap-1 bg-line p-1 rounded-lg">
                {RANGES.map(r => (
                  <button key={r.id} onClick={() => setHistoryTimeRange(r.id)} className={`px-3 py-1 text-xs font-bold rounded-md ${historyTimeRange === r.id ? 'bg-raised shadow-sm' : 'text-ink-soft'}`}>{r.label}</button>
                ))}
            </div>
        </div>
        {loading ? <p className="text-center text-ink-soft">Cargando historial...</p> : (
            Object.keys(historyGroups).length > 0 ? (
                <div className="space-y-4">
                    {Object.entries(historyGroups).map(([date, { movements, dailyBalance }]) => (
                        <div key={date}>
                            <div className="flex justify-between items-center mb-2 pb-2 border-b border-line">
                                <h4 className="font-semibold text-ink-soft uppercase text-xs">{formatGroupDate(date)}</h4>
                                <p className={`font-bold text-sm ${dailyBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCOP(dailyBalance, 'always')}</p>
                            </div>
                            <div className="space-y-2">
                                {movements.map(mov => {
                                    const movementId = `${mov.movementType}-${mov.id}`;
                                    return (
                                        <MovementItem
                                            key={movementId}
                                            mov={mov}
                                            viewerId={myId}
                                            isAnnulled={annulled.has(mov.id)}
                                            canAnnul={isAnnullable(mov)}
                                            onAnnul={handleAnnulMovement}
                                            isSelected={selectedMovementId === movementId}
                                            onItemClick={() => setSelectedMovementId(prev => prev === movementId ? null : movementId)}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-10 px-4 bg-raised rounded-2xl shadow-sm">
                    <Wallet size={40} className="mx-auto text-ink-faint"/>
                    <p className="mt-4 font-bold text-ink-soft">Sin movimientos</p>
                    <p className="text-sm text-ink-soft">No hay transacciones ni gastos para el período seleccionado.</p>
                </div>
            )
        )}
      </div>

      <div className="fixed bottom-24 right-4 md:right-6 space-y-3 md:bottom-6 z-40">
        <button
            onClick={() => openModal('transfer', { balances: currentUserBalances })}
            disabled={!canSpend}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 transform bg-raised text-primary border border-line hover:bg-sunken focus:ring-4 focus:ring-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
            title={canSpend ? 'Transferir Dinero' : 'No tienes saldo para transferir'}
        >
            <ArrowRightLeft size={24} />
        </button>
        <button
            onClick={() => openModal('expense', { balances: currentUserBalances })}
            disabled={!canAddMovement}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 transform bg-primary text-white hover:bg-primary-dark focus:ring-4 focus:ring-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
            title={canAddMovement ? (canRegisterIncome(currentUser?.role) ? 'Registrar Movimiento' : 'Agregar Gasto') : 'No tienes saldo para registrar gastos'}
        >
            <Plus size={28} strokeWidth={3} />
        </button>
      </div>
    </div>

    {viewedUser && (
      <UserMovementsModal
        user={viewedUser}
        movements={allMovements}
        annulled={annulled}
        isAnnullable={isAnnullable}
        onAnnul={handleAnnulMovement}
        onClose={() => setViewedUser(null)}
      />
    )}
    </>
  );
};

export default Accounting;
