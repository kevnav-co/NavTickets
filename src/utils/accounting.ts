import type { Expense, GroupedMovements, Income, Movement, Transaction } from '../types/accounting';

export type AnnulKind = Movement['movementType'];

const MANAGER_ROLES = ['supervisor', 'aux_admin', 'admin', 'developer', 'super_admin'];
const INCOME_ROLES = ['admin', 'developer', 'super_admin'];

/** Espejo de public.is_accounting_manager() (migración 017). */
export const isAccountingManager = (role: string | undefined): boolean => !!role && MANAGER_ROLES.includes(role);

export const canRegisterIncome = (role: string | undefined): boolean => !!role && INCOME_ROLES.includes(role);

// snakeToCamel hace JSON.parse de los strings: un concepto "500" llega como número.
export const toMovements = (transactions: Transaction[], expenses: Expense[], incomes: Income[]): Movement[] => {
  const base = <T extends { amount: unknown; concept: unknown; createdAt: unknown }>(r: T) => ({
    ...r,
    amount: Number(r.amount),
    concept: String(r.concept ?? ''),
    createdAt: new Date(r.createdAt as string).getTime(),
  });
  return [
    ...transactions.map(t => ({ ...base(t), movementType: 'transaction' as const })),
    ...expenses.map(e => ({ ...base(e), movementType: 'expense' as const })),
    ...incomes.map(i => ({ ...base(i), movementType: 'income' as const })),
  ].sort((a, b) => b.createdAt - a.createdAt);
};

export const involvesUser = (mov: Movement, userId: string): boolean =>
  mov.movementType === 'transaction'
    ? mov.senderId === userId || mov.recipientId === userId
    : mov.userId === userId;

/** Efecto del movimiento sobre el saldo de `userId` (positivo = entra dinero). */
export const signedAmount = (mov: Movement, userId: string): number => {
  switch (mov.movementType) {
    case 'transaction':
      if (mov.selfEntry) return mov.senderId === userId ? (mov.selfEntry === 'in' ? mov.amount : -mov.amount) : 0;
      if (mov.recipientId === userId) return mov.amount;
      if (mov.senderId === userId) return -mov.amount;
      return 0;
    case 'expense':
      return mov.userId === userId ? -mov.amount : 0;
    case 'income':
      return mov.userId === userId ? mov.amount : 0;
  }
};

export const accountOf = (mov: Movement): 'cash' | 'transfer' => {
  const account = mov.movementType === 'transaction' ? mov.method : mov.origin;
  return account === 'Efectivo' ? 'cash' : 'transfer';
};

export const computeBalances = (movements: Movement[], userId: string) => {
  const balances = { cash: 0, transfer: 0, total: 0 };
  for (const mov of movements) {
    const delta = signedAmount(mov, userId);
    if (delta === 0) continue;
    balances[accountOf(mov)] += delta;
    balances.total += delta;
  }
  return balances;
};

/** Ids ya anulados. Un movimiento entre cuentas propias cuenta como anulado si lo está cualquiera del par. */
export const annulledIds = (movements: Movement[]): Set<string> => {
  const ids = new Set<string>();
  const groups = new Set<string>();
  for (const mov of movements) {
    if (!mov.isAnnulment || !mov.relatedMovementId) continue;
    ids.add(mov.relatedMovementId);
  }
  for (const mov of movements) {
    if (mov.movementType === 'transaction' && mov.transactionGroupId && ids.has(mov.id)) groups.add(mov.transactionGroupId);
  }
  for (const mov of movements) {
    if (mov.movementType === 'transaction' && mov.transactionGroupId && groups.has(mov.transactionGroupId)) ids.add(mov.id);
  }
  return ids;
};

/** Espejo de los permisos de public.accounting_annul(). */
export const canAnnul = (mov: Movement, actor: { id: string; role: string }, annulled: Set<string>): boolean => {
  if (mov.isAnnulment || annulled.has(mov.id)) return false;
  if (isAccountingManager(actor.role)) return true;
  if (mov.movementType === 'transaction') return mov.senderId === actor.id;
  if (mov.movementType === 'expense') return mov.userId === actor.id;
  return false;
};

// --- Fechas (agrupación por día local del usuario, no UTC) ---

export const localDateKey = (ts: number): string => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const isSameDay = (d1: Date, d2: Date) =>
  d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

export const getStartOfWeek = (date: Date) => {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
};

export const getEndOfWeek = (date: Date) => {
  const end = getStartOfWeek(date);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

export const getStartOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

export type TimeRange = 'all' | 'day' | 'week' | 'month';

export const filterByRange = (movements: Movement[], range: TimeRange, now = new Date()): Movement[] => {
  if (range === 'day') return movements.filter(m => isSameDay(new Date(m.createdAt), now));
  if (range === 'week') return movements.filter(m => m.createdAt >= getStartOfWeek(now).getTime());
  if (range === 'month') return movements.filter(m => m.createdAt >= getStartOfMonth(now).getTime());
  return movements;
};

export const groupByDay = (movements: Movement[], userId: string): GroupedMovements =>
  movements.reduce((groups, mov) => {
    const key = localDateKey(mov.createdAt);
    groups[key] ??= { movements: [], dailyBalance: 0 };
    groups[key].movements.push(mov);
    groups[key].dailyBalance += signedAmount(mov, userId);
    return groups;
  }, {} as GroupedMovements);

export const formatGroupDate = (dateKey: string, today = new Date()) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(date, today)) return 'Hoy';
  if (isSameDay(date, yesterday)) return 'Ayer';
  return new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
};

export const formatWeekRange = (date: Date) => {
  const start = getStartOfWeek(date);
  const end = getEndOfWeek(date);
  const month = (d: Date) => new Intl.DateTimeFormat('es-CO', { month: 'short' }).format(d);
  if (start.getMonth() === end.getMonth()) return `${start.getDate()} - ${end.getDate()} de ${month(start)}`;
  return `${start.getDate()} ${month(start)} - ${end.getDate()} ${month(end)}`;
};

export const formatCOP = (value: number, signDisplay: 'auto' | 'always' = 'auto') =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, signDisplay }).format(value);
