export type AccountType = 'Efectivo' | 'Transferencia';

// Filas tal como llegan de Supabase (tablas transactions / expenses / incomes, migración 017).
interface BaseRecord {
  id: string;
  companyId: string;
  amount: number;
  concept: string;
  createdAt: string;
  isAnnulment?: boolean;
  relatedMovementId?: string | null;
  annulmentReason?: string | null;
}

export type Transaction = BaseRecord & {
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  method: AccountType;
  transactionGroupId?: string | null;
  /** Solo en movimientos entre cuentas propias: 'out' sale de `method`, 'in' entra a `method`. */
  selfEntry?: 'in' | 'out' | null;
};

export type Expense = BaseRecord & {
  userId: string;
  userName: string;
  origin: AccountType;
  orderId?: string | null;
};

export type Income = BaseRecord & {
  userId: string;
  userName: string;
  origin: AccountType;
};

type AsMovement<T, K extends string> = Omit<T, 'createdAt'> & { createdAt: number; movementType: K };

export type TransactionMovement = AsMovement<Transaction, 'transaction'>;
export type ExpenseMovement = AsMovement<Expense, 'expense'>;
export type IncomeMovement = AsMovement<Income, 'income'>;
export type Movement = TransactionMovement | ExpenseMovement | IncomeMovement;

export type GroupedMovements = {
  [dateKey: string]: {
    movements: Movement[];
    dailyBalance: number;
  };
};
