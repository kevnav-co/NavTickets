import React, { useState } from 'react';
import { useModal } from '../../context/ModalContext';
import { X, Loader, AlertTriangle, CheckCircle } from 'lucide-react';

export const AnnulmentConfirmModal: React.FC = () => {
  const { isModalOpen, closeModal, modalData } = useModal();
  const isOpen = isModalOpen('annulment-confirm');
  
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const movement = modalData?.movement;
  const onConfirm = modalData?.onConfirm;

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(reason);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setReason('');
        closeModal();
      }, 1500);
    } catch (err) {
      console.error(err);
      setError('Error al anular el movimiento.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900/75 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md m-auto shadow-2xl relative animate-in fade-in zoom-in duration-200">
        <button 
          onClick={closeModal} 
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition-colors"
        >
          <X size={24} />
        </button>

        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="text-green-500 w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">¡Anulado con éxito!</h2>
            <p className="text-gray-500 mt-2">El movimiento ha sido invalidado correctamente.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="text-red-600 w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-800">Confirmar Anulación</h2>
                <p className="text-xs text-gray-500">Esta acción no se puede deshacer.</p>
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-6">
              <p className="text-sm text-gray-600 mb-1 font-medium">Concepto:</p>
              <p className="text-sm font-bold text-gray-800 line-through decoration-red-400">
                {movement?.concept || 'Cargando...'}
              </p>
            </div>

            <div className="mb-6">
              <label htmlFor="annulment-reason" className="block text-sm font-bold text-gray-700 mb-2">
                Motivo de la anulación <span className="text-gray-400 font-normal">(Opcional)</span>
              </label>
              <textarea
                id="annulment-reason"
                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all resize-none"
                placeholder="Ej: Error en el monto, duplicado, etc..."
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {error && <p className="text-red-500 text-sm mb-4 font-semibold text-center">{error}</p>}

            <div className="flex gap-3 mt-8">
              <button 
                onClick={closeModal} 
                disabled={submitting}
                className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 px-4 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
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
