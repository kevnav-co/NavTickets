
import React from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

interface DeleteConfirmationModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  title?: string;
  message?: string;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  onConfirm,
  onCancel,
  isDeleting,
  title,
  message,
}) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
    <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col items-center text-center">
      <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
        {isDeleting ? <Loader2 className="animate-spin" size={32} /> : <AlertTriangle size={32} />}
      </div>
      <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-tight">
        {isDeleting ? 'DESTRUYENDO...' : title || '¿DESTRUIR EXPEDIENTE?'}
      </h3>
      <p className="text-xs text-gray-500 leading-relaxed mb-8 font-medium">
        {isDeleting 
          ? 'Esta acción está eliminando la orden y todos sus archivos asociados. Por favor, espere un momento...'
          : message || <p>Esta acción eliminará <b>permanentemente</b> la orden y todas sus imágenes del almacenamiento.<br/><br/><span className="bg-red-50 text-red-600 px-2 py-1 rounded">Esta acción no se puede deshacer.</span></p>
        }
      </p>
      <div className="w-full space-y-3">
        <button onClick={onConfirm} disabled={isDeleting} className="w-full py-4 bg-[#7b1113] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-red-900/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          {isDeleting ? 'Procesando...' : 'Sí, Destruir'}
        </button>
        <button onClick={onCancel} disabled={isDeleting} className="w-full py-4 bg-gray-50 text-gray-400 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-[0.98] transition-all disabled:opacity-50">
          Cancelar
        </button>
      </div>
    </div>
  </div>
);

export default DeleteConfirmationModal;
