import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { useData } from '../../context/DataContext';
import { useCollection } from '../../hooks/useCollection';
import type { QueryFilter } from '../../hooks/useSupabaseQuery';
import type { User } from '../../types';
import type { AccountType } from '../../types/accounting';
import { formatCOP } from '../../utils/accounting';
import { transferBetweenOwnAccounts } from '../../services/accounting';
import { X, Loader, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import CurrencyInput from 'react-currency-input-field';

const SELF_TRANSFER_ID = '__SELF__';
const ACCOUNTS: AccountType[] = ['Efectivo', 'Transferencia'];

const toDateTimeLocal = (date: Date): string => {
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const TransferModal: React.FC = () => {
  const { currentUser } = useAuth();
  const { isModalOpen, closeModal, getModalData } = useModal();
  const { addItem } = useData();
  const isOpen = isModalOpen('transfer');
  const balances = getModalData<{ balances: { cash: number; transfer: number } }>('transfer')?.balances;

  const [recipientId, setRecipientId] = useState('');
  const [method, setMethod] = useState<AccountType>('Efectivo');
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [transferDateTime, setTransferDateTime] = useState(toDateTimeLocal(new Date()));
  const [fromAccount, setFromAccount] = useState<AccountType>('Efectivo');
  const [toAccount, setToAccount] = useState<AccountType>('Transferencia');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const filters = useMemo<QueryFilter[]>(
    () => currentUser ? [{ column: 'company_id', operator: 'eq', value: currentUser.companyId }] : [],
    [currentUser],
  );
  const { data: usersData, loading: loadingUsers } = useCollection<User>('users', { filters, enabled: isOpen && !!currentUser });
  const recipients = useMemo(
    () => (usersData || []).filter(u => u.id !== currentUser?.id && u.role !== 'developer' && u.role !== 'super_admin'),
    [usersData, currentUser],
  );

  const isSelfTransfer = recipientId === SELF_TRANSFER_ID;
  const originAccount = isSelfTransfer ? fromAccount : method;
  const available = balances ? (originAccount === 'Efectivo' ? balances.cash : balances.transfer) : Infinity;
  const balanceError = amount && amount > available ? `Saldo en ${originAccount} es insuficiente (${formatCOP(available)}).` : '';
  const sameAccountError = isSelfTransfer && fromAccount === toAccount ? 'La cuenta de origen y destino no pueden ser la misma.' : '';

  useEffect(() => {
    if (isOpen) return;
    setRecipientId('');
    setMethod('Efectivo');
    setAmount(undefined);
    setTransferDateTime(toDateTimeLocal(new Date()));
    setFromAccount('Efectivo');
    setToAccount('Transferencia');
    setSubmitting(false);
    setSuccess('');
    setError('');
  }, [isOpen]);

  const close = () => closeModal('transfer');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !recipientId || !amount || amount <= 0 || balanceError || sameAccountError) return;

    setSubmitting(true);
    setError('');
    try {
      const createdAt = new Date(transferDateTime).toISOString();
      if (isSelfTransfer) {
        await transferBetweenOwnAccounts(amount, fromAccount, toAccount, createdAt);
        setSuccess('¡Movimiento exitoso!');
      } else {
        const recipient = recipients.find(u => u.id === recipientId);
        if (!recipient) throw new Error('Destinatario no válido');
        await addItem('transactions', {
          companyId: currentUser.companyId,
          senderId: currentUser.id,
          senderName: currentUser.name,
          recipientId: recipient.id,
          recipientName: recipient.name,
          amount,
          method,
          concept: `Transferencia a ${recipient.name}`,
          createdAt,
        });
        setSuccess('¡Transferencia Exitosa!');
      }
      setTimeout(close, 1500);
    } catch (err: any) {
      console.error(err);
      setError(err?.message ? `No se pudo registrar el movimiento: ${err.message}` : 'Hubo un error al registrar el movimiento.');
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const canSubmit = !!amount && amount > 0 && !!recipientId && !balanceError && !sameAccountError && !submitting;

  return (
    <div className="fixed inset-0 bg-gray-900/75 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md m-auto shadow-2xl relative">
        <button onClick={close} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"><X size={24} /></button>
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Registrar Transferencia</h2>

        {success ? (
          <div className="text-center py-8"><CheckCircle className="mx-auto text-green-500 w-16 h-16" /><p className="text-lg font-semibold mt-4">{success}</p></div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="transfer-datetime" className="block text-sm font-bold text-gray-600 mb-2">Fecha y Hora</label>
              <input id="transfer-datetime" type="datetime-local" value={transferDateTime} onChange={(e) => setTransferDateTime(e.target.value)} className="w-full p-3 bg-gray-50 rounded-lg" required />
            </div>

            <div>
              <label htmlFor="recipient" className="block text-sm font-bold text-gray-600 mb-2">Enviar a</label>
              {loadingUsers ? (
                <div className="w-full p-3 bg-gray-50 rounded-lg flex items-center gap-2"><Loader size={16} className="animate-spin"/> Cargando usuarios...</div>
              ) : (
                <select id="recipient" value={recipientId} onChange={(e) => setRecipientId(e.target.value)} className="w-full p-3 bg-gray-50 rounded-lg" required>
                  <option value="" disabled>Selecciona un destinatario...</option>
                  <option value={SELF_TRANSFER_ID}>A mí mismo (Mover entre cuentas)</option>
                  {recipients.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              )}
            </div>

            {isSelfTransfer ? (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-2 text-center">
                  <div>
                    <label className="block text-sm font-bold text-gray-600 mb-2">Origen</label>
                    <select value={fromAccount} onChange={e => setFromAccount(e.target.value as AccountType)} className="w-full p-2 text-center bg-white rounded-md">
                      {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <ArrowRight className="hidden md:block mx-auto text-gray-400 mt-6" />
                  <div>
                    <label className="block text-sm font-bold text-gray-600 mb-2">Destino</label>
                    <select value={toAccount} onChange={e => setToAccount(e.target.value as AccountType)} className="w-full p-2 text-center bg-white rounded-md">
                      {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-bold text-gray-600 mb-2">Método</label>
                <div className="flex gap-2">
                  {ACCOUNTS.map(m => (
                    <button type="button" key={m} onClick={() => setMethod(m)} className={`flex-1 py-3 rounded-lg font-bold ${method === m ? 'bg-primary text-white' : 'bg-gray-100'}`}>{m}</button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="amount" className="block text-sm font-bold text-gray-600 mb-2">Valor</label>
              <CurrencyInput id="amount" name="amount" placeholder="$ 0" value={amount} decimalsLimit={0} onValueChange={(v) => setAmount(v ? parseFloat(v) : undefined)} className="w-full p-3 bg-gray-50 rounded-lg text-xl font-bold" intlConfig={{ locale: 'es-CO', currency: 'COP' }} required />
            </div>

            {(balanceError || sameAccountError) && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-center gap-3">
                <AlertTriangle size={20}/>
                <span className="text-sm font-semibold">{balanceError || sameAccountError}</span>
              </div>
            )}
            {error && <p className="text-red-500 text-sm text-center font-semibold">{error}</p>}

            <div className="pt-4">
              <button type="submit" disabled={!canSubmit} className="w-full bg-primary text-white font-bold py-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center">
                {submitting ? <Loader className="animate-spin"/> : 'Confirmar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
