
import React, { useState } from 'react';
import { PenTool, X, Maximize2, FileCheck } from 'lucide-react';
import SignatureModal from './SignatureModal';

interface SignatureFieldProps {
  title: string;
  onSave: (data: string | null) => void;
  savedSignature?: string | null;
  disabled?: boolean;
  loadableSignatureUrl?: string | null;
  onLoadSavedSignature?: () => void;
}

const SignatureField: React.FC<SignatureFieldProps> = ({ title, onSave, savedSignature, disabled, loadableSignatureUrl, onLoadSavedSignature }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center px-1">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</label>
        <div className="flex items-center gap-3">
          {!savedSignature && loadableSignatureUrl && onLoadSavedSignature && !disabled && (
            <button type="button" onClick={onLoadSavedSignature} className="text-blue-600 text-[10px] font-bold flex items-center gap-1 active:scale-90">
              <FileCheck size={12} strokeWidth={3} /> Usar mi firma
            </button>
          )}
          {savedSignature && !disabled && ( 
            <button type="button" onClick={() => onSave(null)} className="text-red-500 text-[10px] font-bold flex items-center gap-1 active:scale-90">
              <X size={12} strokeWidth={3} /> Quitar
            </button> 
          )}
        </div>
      </div>
      {!savedSignature ? (
        <button type="button" disabled={disabled} onClick={() => setIsModalOpen(true)} className="w-full h-32 bg-gray-50 border-2 border-dashed border-gray-200 rounded-[1.8rem] flex flex-col items-center justify-center gap-3 text-gray-400 hover:border-primary/40 hover:bg-red-50/20 transition-all active:scale-[0.98] disabled:opacity-50">
          <div className="bg-white p-3 rounded-2xl shadow-sm"><PenTool size={22} className="text-gray-300" /></div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Registrar Firma Digital</span>
        </button>
      ) : (
        <div onClick={() => !disabled && setIsModalOpen(true)} className={`relative h-32 bg-white border border-gray-200 rounded-[1.8rem] overflow-hidden shadow-inner transition-all ${!disabled ? 'cursor-pointer hover:border-primary' : ''}`}>
          <img src={savedSignature} className="w-full h-full object-contain p-2" alt="Firma" />
          {!disabled && (<div className="absolute inset-0 bg-black/0 hover:bg-black/5 flex items-center justify-center opacity-0 hover:opacity-100 transition-all"> <div className="bg-white/90 backdrop-blur-sm p-2 rounded-xl shadow-md text-primary"><Maximize2 size={16} /></div> </div>)}
        </div>
      )}
      <SignatureModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={(data) => { onSave(data); setIsModalOpen(false); }} title={title} />
    </div>
  );
};

export default SignatureField;
