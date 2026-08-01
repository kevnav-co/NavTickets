
// Base type for user information
export type User = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'developer' | 'supervisor' | 'technician';
};

// Financial Movement Base Types
interface BaseMovement {
    id: string;
    amount: number;
    concept: string;
    createdAt: string;
    isAnnulment?: boolean;
    relatedMovementId?: string;
    annulmentReason?: string;
}

// Specific Movement Types
export type Transaction = BaseMovement & {
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  method: 'Efectivo' | 'Transferencia';
  transactionGroupId?: string;
};

export type Expense = BaseMovement & {
  userId: string;
  userName: string;
  origin: 'Efectivo' | 'Transferencia';
  orderId?: string;
};

export type Income = BaseMovement & {
  userId: string;
  userName: string;
  origin: 'Efectivo' | 'Transferencia';
};

// Union type with a discriminator ('movementType')
export type TransactionMovement = Transaction & { movementType: 'transaction' };
export type ExpenseMovement = Expense & { movementType: 'expense' };
export type IncomeMovement = Income & { movementType: 'income' };
export type Movement = TransactionMovement | ExpenseMovement | IncomeMovement;

// Type for grouping movements by date
export type GroupedMovements = {
    [key: string]: {
        movements: Movement[];
        dailyBalance: number;
    };
};
