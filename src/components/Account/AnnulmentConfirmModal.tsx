import React, { useState } from 'react';
import { useModal } from '../../context/ModalContext';
import { X, Loader, AlertTriangle, CheckCircle } from 'lucide-react';

export const AnnulmentConfirmModal: React.FC = () => {
  const { isModalOpen, closeModal, getModalData } = useModal();
  const isOpen = isModalOpen('annulment-confirm');
  
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const data = getModalData<{ movement: { concept: string }; onConfirm: (reason: string) => Promise<void> }>('annulment-confirm');
  const movement = data?.movement;
  const onConfirm = data?.onConfirm;

  const close = () => {
    setReason('');
    setError('');
    setSuccess(false);
    closeModal('annulment-confirm');
  };

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(reason);
      setSuccess(true);
      setTimeout(close, 1500);
    } catch (err: any) {
      console.error(err);
      setError(err?.message ? `No se pudo anular: ${err.message}` : 'Error al anular el movimiento.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/75 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-raised rounded-2xl p-6 w-full max-w-md m-auto shadow-2xl relative animate-in fade-in zoom-in duration-200">
        <button 
          onClick={close} 
          className="absolute top-3 right-3 text-ink-faint hover:text-ink-soft p-2 rounded-full hover:bg-sunken transition-colors"
        >
          <X size={24} />
        </button>

        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="text-green-500 w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold text-ink">¡Anulado con éxito!</h2>
            <p className="text-ink-soft mt-2">El movimiento ha sido invalidado correctamente.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="text-red-600 w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-ink">Confirmar Anulación</h2>
                <p className="text-xs text-ink-soft">Esta acción no se puede deshacer.</p>
              </div>
            </div>

            <div className="bg-sunken p-4 rounded-xl border border-line-soft mb-6">
              <p className="text-sm text-ink-soft mb-1 font-medium">Concepto:</p>
              <p className="text-sm font-bold text-ink line-through decoration-red-400">
                {movement?.concept || 'Cargando...'}
              </p>
            </div>

            <div className="mb-6">
              <label htmlFor="annulment-reason" className="block text-sm font-bold text-ink-soft mb-2">
                Motivo de la anulación <span className="text-ink-faint font-normal">(Opcional)</span>
              </label>
              <textarea
                id="annulment-reason"
                className="w-full p-4 bg-sunken border border-line rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all resize-none"
                placeholder="Ej: Error en el monto, duplicado, etc..."
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {error && <p className="text-red-500 text-sm mb-4 font-semibold text-center">{error}</p>}

            <div className="flex gap-3 mt-8">
              <button 
                onClick={close} 
                disabled={submitting}
                className="flex-1 bg-sunken text-ink-soft font-bold py-3 px-4 rounded-xl hover:bg-line transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirm} 
                disabled={submitting}
                className="flex-[2] bg-red-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? <Loader className="animate-spin" size={20} /> : 'Anular Movimiento'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
