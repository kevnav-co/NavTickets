
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useModal } from '../../context/ModalContext';
import { X, Loader, CheckCircle, Trash2, AlertTriangle, ArrowRight } from 'lucide-react';
import CurrencyInput from 'react-currency-input-field';

// --- TIPOS ---
type User = { id: string; name: string; role: string; };
type TransactionData = { id: string; recipientId: string; amount: number; method: string; createdAt: string; transactionGroupId?: string; };
type AccountType = 'Efectivo' | 'Transferencia';

const SELF_TRANSFER_ID = '__SELF__';

// --- FUNCIÓN HELPER ---
const toDateTimeLocal = (date: Date): string => {
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const TransferModal: React.FC = () => {
  const { currentUser } = useAuth();
  const { addItem, updateItem, deleteItem, users: appUsers } = useData();
  const { isModalOpen, closeModal, modalData } = useModal();
  const isOpen = isModalOpen('transfer');
  const editingTransaction = modalData?.editingTransaction as TransactionData | undefined;
  const balances = modalData?.balances;

  // --- Estados del Formulario ---
  const [users, setUsers] = useState<User[]>([]);
  const [recipientId, setRecipientId] = useState('');
  const [method, setMethod] = useState<AccountType>('Efectivo');
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [transferDateTime, setTransferDateTime] = useState(toDateTimeLocal(new Date()));
  const [fromAccount, setFromAccount] = useState<AccountType>('Efectivo');
  const [toAccount, setToAccount] = useState<AccountType>('Transferencia');

  // --- Estados de UI ---
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  
  const isEditMode = !!editingTransaction;
  const isSelfTransfer = recipientId === SELF_TRANSFER_ID;

  // Carga inicial y de usuarios
  useEffect(() => {
    if (isOpen) {
        if (isEditMode && editingTransaction) {
            setRecipientId(editingTransaction.recipientId);
            setAmount(editingTransaction.amount);
            setMethod(editingTransaction.method as AccountType);
            setTransferDateTime(toDateTimeLocal(new Date(editingTransaction.createdAt)));
        } else {
            resetState(false);
        }

        // Usar usuarios del DataContext (ya cargados desde Supabase)
        setLoadingUsers(true);
        const allUsers = (appUsers || []).map(u => ({ id: u.id, name: u.name, role: u.role }) as User);
        const filteredUsers = allUsers.filter(user => user.id !== currentUser?.id && user.role !== 'developer');
        setUsers(filteredUsers);
        setLoadingUsers(false);
    } else {
        resetState(false);
    }
}, [isOpen, currentUser, isEditMode, appUsers]);

// Validación de saldo en tiempo real
useEffect(() => {
    if (!isOpen || isEditMode || !balances || typeof amount !== 'number' || amount <= 0) {
        setBalanceError('');
        return;
    }

    const originAccount = isSelfTransfer ? fromAccount : method;
    const availableBalance = originAccount === 'Efectivo' ? balances.cash : balances.transfer;

    if (amount > availableBalance) {
        const formattedBalance = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(availableBalance);
        setBalanceError(`Saldo en ${originAccount} es insuficiente (${formattedBalance}).`);
    } else {
        setBalanceError('');
    }

}, [amount, fromAccount, method, recipientId, isEditMode, balances, isOpen, isSelfTransfer]);


  // Validación para transferencia a sí mismo
  useEffect(() => {
    if (isSelfTransfer && fromAccount === toAccount) {
      setError('La cuenta de origen y destino no pueden ser la misma.');
    } else if (error === 'La cuenta de origen y destino no pueden ser la misma.') {
      setError('');
    }
  }, [isSelfTransfer, fromAccount, toAccount]);

  const resetState = (shouldClose = true) => {
    setRecipientId('');
    setMethod('Efectivo');
    setAmount(undefined);
    setTransferDateTime(toDateTimeLocal(new Date()));
    setFromAccount('Efectivo');
    setToAccount('Transferencia');
    setError('');
    setBalanceError('');
    setSubmitting(false);
    setSuccess(false);
    setSuccessMessage('');
    setIsConfirmingDelete(false);
    if (shouldClose) closeModal();
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (balanceError) return;

    if (!recipientId || !amount || amount <= 0 || !currentUser || (isSelfTransfer && fromAccount === toAccount)) {
      setError('Por favor, completa todos los campos correctamente.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
        const now = new Date(transferDateTime).toISOString();

        if (isSelfTransfer) {
            const groupId = crypto.randomUUID();
            const baseData = { senderId: currentUser.id, senderName: currentUser.name, recipientId: currentUser.id, recipientName: currentUser.name, amount };

            await addItem('accounting_transactions', {
                ...baseData,
                method: fromAccount,
                concept: `Movimiento a ${toAccount}`,
                createdAt: now,
                transactionGroupId: groupId,
            });

            await addItem('accounting_transactions', {
                ...baseData,
                method: toAccount,
                concept: `Movimiento desde ${fromAccount}`,
                createdAt: now,
                transactionGroupId: groupId,
            });

            setSuccessMessage('¡Movimiento exitoso!');
        } else {
            const recipient = users.find(u => u.id === recipientId);
            if (!recipient) throw new Error('Destinatario no válido');

            const transactionData = {
                senderId: currentUser.id,
                senderName: currentUser.name,
                recipientId: recipient.id,
                recipientName: recipient.name,
                amount,
                method,
                concept: `Transferencia a ${recipient.name}`,
                createdAt: now,
            };

            if (isEditMode && editingTransaction) {
                await updateItem('accounting_transactions', editingTransaction.id, transactionData);
                setSuccessMessage('¡Transferencia Actualizada!');
            } else {
                await addItem('accounting_transactions', transactionData);
                setSuccessMessage('¡Transferencia Exitosa!');
            }
        }

        setSuccess(true);
        setTimeout(() => resetState(), 1500);

    } catch (err) {
        console.error(err);
        setError(`Hubo un error al registrar el movimiento.`);
        setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!isEditMode || !editingTransaction) return;

    setSubmitting(true);
    setError('');

    try {
        await deleteItem('accounting_transactions', editingTransaction.id);

        setSuccessMessage('¡Movimiento Eliminado!');
        setSuccess(true);
        setTimeout(() => resetState(), 1500);

    } catch (err) {
        console.error("Error deleting transaction:", err);
        setError('No se pudo eliminar el movimiento.');
        setSubmitting(false);
        setIsConfirmingDelete(false);
    }
  }

  if (!isOpen) return null;

  const renderFormContent = () => {
    const canSubmit = amount && amount > 0 && recipientId && (!isSelfTransfer || fromAccount !== toAccount);
    const isSaveDisabled = !canSubmit || submitting || !!balanceError;
    const isSelfTransferInEdit = isEditMode && !!editingTransaction?.transactionGroupId;

    return (
        <form onSubmit={handleFormSubmit} className="space-y-5">
            <div>
                <label htmlFor="transfer-datetime" className="block text-sm font-bold text-gray-600 mb-2">Fecha y Hora</label>
                <input id="transfer-datetime" type="datetime-local" value={transferDateTime} onChange={(e) => setTransferDateTime(e.target.value)} className="w-full p-3 bg-gray-50 rounded-lg" required disabled={isSelfTransferInEdit} />
            </div>

            <div>
                <label htmlFor="recipient" className="block text-sm font-bold text-gray-600 mb-2">Enviar a</label>
                {loadingUsers ? <div className="w-full p-3 bg-gray-50 rounded-lg flex items-center gap-2"><Loader size={16} className="animate-spin"/> Cargando usuarios...</div> : (
                    <select id="recipient" value={recipientId} onChange={(e) => setRecipientId(e.target.value)} className="w-full p-3 bg-gray-50 rounded-lg" required disabled={isEditMode}>
                        <option value="" disabled>Selecciona un destinatario...</option>
                        {!isEditMode && <option value={SELF_TRANSFER_ID}>A mí mismo (Mover entre cuentas)</option>}
                        {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </select>
                )}
            </div>

            {isSelfTransfer && !isEditMode ? (
                <div className="bg-gray-50 p-4 rounded-lg space-y-4 border border-gray-200">
                    <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-2 text-center">
                        <div>
                           <label className="block text-sm font-bold text-gray-600 mb-2">Origen</label>
                           <select value={fromAccount} onChange={e => setFromAccount(e.target.value as AccountType)} className="w-full p-2 text-center bg-white rounded-md"> 
                               <option value="Efectivo">Efectivo</option>
                               <option value="Transferencia">Transferencia</option>
                           </select>
                        </div>
                         <ArrowRight className="hidden md:block mx-auto text-gray-400 mt-6" />
                        <div>
                           <label className="block text-sm font-bold text-gray-600 mb-2">Destino</label>
                           <select value={toAccount} onChange={e => setToAccount(e.target.value as AccountType)} className="w-full p-2 text-center bg-white rounded-md">
                               <option value="Efectivo">Efectivo</option>
                               <option value="Transferencia">Transferencia</option>
                           </select>
                        </div>
                    </div>
                </div>
            ) : !isSelfTransferInEdit ? (
                <div>
                    <label className="block text-sm font-bold text-gray-600 mb-2">Método</label>
                    <div className="flex gap-2">{
                        (['Efectivo', 'Transferencia'] as AccountType[]).map(m => 
                            <button type="button" key={m} onClick={() => setMethod(m)} className={`flex-1 py-3 rounded-lg font-bold ${method === m ? 'bg-primary text-white' : 'bg-gray-100'}`}>{m}</button>
                        )
                    }</div>
                </div>
            ) : null}

            <div>
                <label htmlFor="amount" className="block text-sm font-bold text-gray-600 mb-2">Valor</label>
                <CurrencyInput id="amount" name="amount" placeholder="$ 0" value={amount} onValueChange={(v) => setAmount(v ? parseFloat(v) : undefined)} className="w-full p-3 bg-gray-50 rounded-lg text-xl font-bold" intlConfig={{ locale: 'es-CO', currency: 'COP' }} required disabled={isSelfTransferInEdit} />
            </div>

            {balanceError && !isEditMode &&
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-center gap-3">
                    <AlertTriangle size={20}/> 
                    <span className="text-sm font-semibold">{balanceError}</span>
                </div>
            }
            {error && <p className="text-red-500 text-sm text-center font-semibold">{error}</p>}
            
            <div className="pt-4 flex items-center gap-3">
                 {!isSelfTransferInEdit && (
                    <button type="submit" disabled={isSaveDisabled} className="flex-grow bg-primary text-white font-bold py-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                        {submitting ? <Loader className="animate-spin"/> : (isEditMode ? 'Actualizar' : 'Confirmar')}
                    </button>
                 )}
                {isEditMode && (
                    <button type="button" onClick={() => setIsConfirmingDelete(true)} disabled={submitting} className={`p-4 bg-gray-100 rounded-lg hover:bg-red-100 hover:text-red-600 ${isSelfTransferInEdit ? 'w-full' : ''}`}>
                         {isSelfTransferInEdit ? 'Eliminar Movimiento' : <Trash2 size={24} />}
                    </button>
                )}
            </div>
        </form>
    );
  }

  const renderStateContent = () => {
      if (success) return <div className="text-center py-8"><CheckCircle className="mx-auto text-green-500 w-16 h-16" /><p className="text-lg font-semibold mt-4">{successMessage}</p></div>;
      if (isConfirmingDelete) return (
          <div className="text-center py-8">
              <AlertTriangle className="mx-auto text-yellow-500 w-16 h-16" />
              <p className="text-lg font-semibold mt-4">¿Eliminar este movimiento?</p>
              <p className="text-sm text-gray-500 mt-2">Esta acción eliminará tanto el ingreso como el egreso asociados a esta transferencia interna.</p>
              <div className="flex gap-4 mt-8">
                  <button onClick={() => setIsConfirmingDelete(false)} disabled={submitting} className="w-full bg-gray-200 py-3 rounded-lg">Cancelar</button>
                  <button onClick={handleDelete} disabled={submitting} className="w-full bg-red-600 text-white py-3 rounded-lg flex items-center justify-center">
                      {submitting ? <Loader className="animate-spin"/> : 'Confirmar Eliminación'}
                  </button>
              </div>
          </div>
      );
      return renderFormContent();
  }

  return (
    <div className="fixed inset-0 bg-gray-900/75 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md m-auto shadow-2xl relative">
        <button onClick={() => resetState()} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"><X size={24} /></button>
        <h2 className="text-2xl font-bold text-gray-800 mb-6">{isEditMode ? 'Detalles del Movimiento' : 'Registrar Transferencia'}</h2>
        {renderStateContent()}
      </div>
    </div>
  );
};
