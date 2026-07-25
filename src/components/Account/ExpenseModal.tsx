
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { db } from '../../services/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { X, Loader, CheckCircle, AlertTriangle } from 'lucide-react';
import CurrencyInput from 'react-currency-input-field';

// --- TIPOS ---
type MovementType = 'expense' | 'income';

// --- FUNCIÓN HELPER ---
const toDateTimeLocal = (date: Date): string => {
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const ExpenseModal: React.FC = () => {
  const { currentUser } = useAuth();
  const { isModalOpen, closeModal, modalData } = useModal();
  const isOpen = isModalOpen('expense');
  const balances = modalData?.balances; // CORRECCIÓN: Acceso directo a los datos del modal

  // --- ESTADOS DEL FORMULARIO ---
  const [movementType, setMovementType] = useState<MovementType>('expense');
  const [concept, setConcept] = useState('');
  const [dateTime, setDateTime] = useState(toDateTimeLocal(new Date()));
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [origin, setOrigin] = useState('Efectivo');

  // --- ESTADOS DE UI ---
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [balanceError, setBalanceError] = useState('');
  
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (isOpen) {
        if (!isAdmin) setMovementType('expense');
        // Resetear errores al abrir
        setError('');
        setBalanceError('');
        setSubmitting(false);
        setSuccess(false);
    } else {
        // Resetear todo el estado al cerrar
        resetState(false);
    }
  }, [isOpen, isAdmin]);

  // Efecto para la validación de saldo en tiempo real
  useEffect(() => {
    if (isOpen && movementType === 'expense' && balances && typeof amount === 'number' && amount > 0) {
      const availableBalance = origin === 'Efectivo' ? balances.cash : balances.transfer;
      if (amount > availableBalance) {
        const formattedBalance = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(availableBalance);
        setBalanceError(`Saldo en ${origin} es insuficiente (${formattedBalance}).`);
      } else {
        setBalanceError('');
      }
    } else {
      setBalanceError(''); // Limpiar error si es un ingreso o no hay monto
    }
  }, [amount, origin, movementType, balances, isOpen]);


  const resetState = (shouldClose = true) => {
    if (shouldClose) closeModal('expense');
    setMovementType('expense');
    setConcept('');
    setDateTime(toDateTimeLocal(new Date()));
    setAmount(undefined);
    setOrigin('Efectivo');
    setError('');
    setBalanceError('');
    setSubmitting(false);
    setSuccess(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (balanceError) return; // No permitir envío si hay error de saldo

    if (!concept || !amount || amount <= 0 || !currentUser) {
      setError('Por favor, completa el concepto y el valor.');
      return;
    }

    setSubmitting(true);
    setError('');

    const collectionName = movementType === 'income' ? 'incomes' : 'expenses';
    const data: any = {
        userId: currentUser.id,
        userName: currentUser.name,
        concept,
        amount,
        origin,
        createdAt: Timestamp.fromDate(new Date(dateTime)),
    };

    try {
      await addDoc(collection(db, collectionName), data);
      setSuccess(true);
      setTimeout(() => resetState(true), 1500);

    } catch (err) {
      console.error(err);
      setError(`Hubo un error al guardar el ${movementType === 'income' ? 'ingreso' : 'gasto'}.`);
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const title = isAdmin ? "Registrar Movimiento" : "Agregar Gasto";
  const buttonLabel = `Guardar ${movementType === 'income' ? 'Ingreso' : 'Gasto'}`;
  const isSaveDisabled = submitting || !!balanceError;

  return (
    <>
      <div className="fixed inset-0 bg-gray-900/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-fast">
        <div className="bg-white rounded-2xl p-6 w-full max-w-md m-auto shadow-2xl relative">
          <button onClick={() => resetState(true)} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
          <h2 className="text-2xl font-bold text-gray-800 mb-6">{title}</h2>

          {success ? (
            <div className="text-center py-8">
              <CheckCircle className="mx-auto text-green-500 w-16 h-16 animate-pulse" />
              <p className="text-lg font-semibold text-gray-700 mt-4">¡Movimiento Guardado!</p>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              {isAdmin && (
                  <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-lg">
                      <button type="button" onClick={() => setMovementType('expense')} className={`py-2 px-4 rounded-md text-sm font-bold transition ${movementType === 'expense' ? 'bg-white shadow' : 'text-gray-500'}`}>Gasto</button>
                      <button type="button" onClick={() => setMovementType('income')} className={`py-2 px-4 rounded-md text-sm font-bold transition ${movementType === 'income' ? 'bg-white shadow' : 'text-gray-500'}`}>Ingreso</button>
                  </div>
              )}

              <div>
                <label htmlFor="concept" className="block text-sm font-bold text-gray-600 mb-2">Concepto</label>
                <input id="concept" type="text" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder={movementType === 'expense' ? "Ej: Repuestos pantalla" : "Ej: Abono inicial"} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg" required />
              </div>

              <div>
                <label htmlFor="datetime" className="block text-sm font-bold text-gray-600 mb-2">Fecha y Hora</label>
                <input id="datetime" type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg" required />
              </div>

              <div>
                <label htmlFor="amount" className="block text-sm font-bold text-gray-600 mb-2">Valor</label>
                <CurrencyInput id="amount" name="amount" placeholder="$ 0" value={amount} decimalsLimit={0} onValueChange={(v) => setAmount(v ? parseFloat(v) : undefined)} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-xl font-bold" intlConfig={{ locale: 'es-CO', currency: 'COP' }} required />
              </div>
              
              {movementType === 'expense' && (
                <div>
                    <label className="block text-sm font-bold text-gray-600 mb-2">Origen del Dinero</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setOrigin('Efectivo')} className={`py-3 px-4 rounded-lg text-sm font-bold transition ${origin === 'Efectivo' ? 'bg-[#7b1113] text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Efectivo</button>
                        <button type="button" onClick={() => setOrigin('Transferencia')} className={`py-3 px-4 rounded-lg text-sm font-bold transition ${origin === 'Transferencia' ? 'bg-[#7b1113] text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Transferencia</button>
                    </div>
                </div>
              )}

              {balanceError && 
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg flex items-center gap-3">
                  <AlertTriangle size={20}/> 
                  <span className="text-sm font-semibold">{balanceError}</span>
                </div>
              }
              {error && <p className="text-red-500 text-sm text-center font-semibold">{error}</p>}

              <div className="pt-4">
                <button type="submit" disabled={isSaveDisabled} className="w-full bg-[#7b1113] text-white font-bold py-4 rounded-lg hover:bg-[#6a0f11] transition-all shadow-lg flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                  {submitting ? <Loader className="animate-spin"/> : buttonLabel}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
};
