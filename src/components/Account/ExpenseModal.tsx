import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { useData } from '../../context/DataContext';
import type { AccountType } from '../../types/accounting';
import { canRegisterIncome, formatCOP } from '../../utils/accounting';
import { X, Loader, CheckCircle, AlertTriangle } from 'lucide-react';
import CurrencyInput from 'react-currency-input-field';

type MovementType = 'expense' | 'income';

const toDateTimeLocal = (date: Date): string => {
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const ExpenseModal: React.FC = () => {
  const { currentUser } = useAuth();
  const { isModalOpen, closeModal, getModalData } = useModal();
  const { addItem } = useData();
  const isOpen = isModalOpen('expense');
  const balances = getModalData<{ balances: { cash: number; transfer: number } }>('expense')?.balances;
  const allowIncome = canRegisterIncome(currentUser?.role);

  const [movementType, setMovementType] = useState<MovementType>('expense');
  const [concept, setConcept] = useState('');
  const [dateTime, setDateTime] = useState(toDateTimeLocal(new Date()));
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [origin, setOrigin] = useState<AccountType>('Efectivo');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) return;
    setMovementType('expense');
    setConcept('');
    setDateTime(toDateTimeLocal(new Date()));
    setAmount(undefined);
    setOrigin('Efectivo');
    setSubmitting(false);
    setSuccess(false);
    setError('');
  }, [isOpen]);

  const available = balances ? (origin === 'Efectivo' ? balances.cash : balances.transfer) : Infinity;
  const balanceError = movementType === 'expense' && amount && amount > available
    ? `Saldo en ${origin} es insuficiente (${formatCOP(available)}).`
    : '';

  const close = () => closeModal('expense');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (balanceError || !currentUser) return;
    if (!concept.trim() || !amount || amount <= 0) {
      setError('Por favor, completa el concepto y el valor.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await addItem(movementType === 'income' ? 'incomes' : 'expenses', {
        companyId: currentUser.companyId,
        userId: currentUser.id,
        userName: currentUser.name,
        concept: concept.trim(),
        amount,
        origin,
        createdAt: new Date(dateTime).toISOString(),
      });
      setSuccess(true);
      setTimeout(close, 1500);
    } catch (err) {
      console.error(err);
      setError(`Hubo un error al guardar el ${movementType === 'income' ? 'ingreso' : 'gasto'}.`);
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-fast">
      <div className="bg-raised rounded-2xl p-6 w-full max-w-md m-auto shadow-2xl relative">
        <button onClick={close} className="absolute top-3 right-3 text-ink-faint hover:text-ink-soft">
          <X size={24} />
        </button>
        <h2 className="text-2xl font-bold text-ink mb-6">{allowIncome ? 'Registrar Movimiento' : 'Agregar Gasto'}</h2>

        {success ? (
          <div className="text-center py-8">
            <CheckCircle className="mx-auto text-green-500 w-16 h-16 animate-pulse" />
            <p className="text-lg font-semibold text-ink-soft mt-4">¡Movimiento Guardado!</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            {allowIncome && (
              <div className="grid grid-cols-2 gap-2 p-1 bg-sunken rounded-lg">
                <button type="button" onClick={() => setMovementType('expense')} className={`py-2 px-4 rounded-md text-sm font-bold transition ${movementType === 'expense' ? 'bg-raised shadow' : 'text-ink-soft'}`}>Gasto</button>
                <button type="button" onClick={() => setMovementType('income')} className={`py-2 px-4 rounded-md text-sm font-bold transition ${movementType === 'income' ? 'bg-raised shadow' : 'text-ink-soft'}`}>Ingreso</button>
              </div>
            )}

            <div>
              <label htmlFor="concept" className="block text-sm font-bold text-ink-soft mb-2">Concepto</label>
              <input id="concept" type="text" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder={movementType === 'expense' ? 'Ej: Repuestos pantalla' : 'Ej: Abono inicial'} className="w-full p-3 bg-sunken border border-line rounded-lg" required />
            </div>

            <div>
              <label htmlFor="datetime" className="block text-sm font-bold text-ink-soft mb-2">Fecha y Hora</label>
              <input id="datetime" type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} className="w-full p-3 bg-sunken border border-line rounded-lg" required />
            </div>

            <div>
              <label htmlFor="amount" className="block text-sm font-bold text-ink-soft mb-2">Valor</label>
              <CurrencyInput id="amount" name="amount" placeholder="$ 0" value={amount} decimalsLimit={0} onValueChange={(v) => setAmount(v ? parseFloat(v) : undefined)} className="w-full p-3 bg-sunken border border-line rounded-lg text-xl font-bold" intlConfig={{ locale: 'es-CO', currency: 'COP' }} required />
            </div>

            <div>
              <label className="block text-sm font-bold text-ink-soft mb-2">{movementType === 'expense' ? 'Origen del Dinero' : 'Cuenta de Destino'}</label>
              <div className="grid grid-cols-2 gap-2">
                {(['Efectivo', 'Transferencia'] as AccountType[]).map(a => (
                  <button key={a} type="button" onClick={() => setOrigin(a)} className={`py-3 px-4 rounded-lg text-sm font-bold transition ${origin === a ? 'bg-primary text-white shadow-md' : 'bg-sunken text-ink-soft hover:bg-line'}`}>{a}</button>
                ))}
              </div>
            </div>

            {balanceError && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-center gap-3">
                <AlertTriangle size={20}/>
                <span className="text-sm font-semibold">{balanceError}</span>
              </div>
            )}
            {error && <p className="text-red-500 text-sm text-center font-semibold">{error}</p>}

            <div className="pt-4">
              <button type="submit" disabled={submitting || !!balanceError} className="w-full bg-primary text-white font-bold py-4 rounded-lg hover:bg-primary-dark transition-all shadow-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? <Loader className="animate-spin"/> : `Guardar ${movementType === 'income' ? 'Ingreso' : 'Gasto'}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
