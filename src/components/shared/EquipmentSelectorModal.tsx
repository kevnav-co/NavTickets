
import React, { useState, useEffect } from 'react';
import { Equipment } from '../../types';
import { X, Search, Plus, Cog } from 'lucide-react';

interface EquipmentSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (ids: string[]) => void;
  onAddNew: () => void;
  availableEquipment: Equipment[];
  currentEquipmentIds: string[];
}

const EquipmentSelectorModal: React.FC<EquipmentSelectorModalProps> = ({ 
  isOpen, 
  onClose, 
  onSelect, 
  onAddNew,
  availableEquipment, 
  currentEquipmentIds 
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(currentEquipmentIds);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) setSelectedIds(currentEquipmentIds);
  }, [isOpen, currentEquipmentIds]);

  if (!isOpen) return null;

  const filtered = availableEquipment.filter(e => 
    e.name.toLowerCase().includes(query.toLowerCase()) || 
    e.serialNumber.toLowerCase().includes(query.toLowerCase())
  );

  const toggle = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-300 h-auto max-h-[85vh]">
        <header className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
          <div>
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Vincular Equipos</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Activos del Cliente</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-50 rounded-full transition-colors text-gray-400"><X size={20} /></button>
        </header>

        <div className="p-4 bg-gray-50 border-b border-gray-100">
            <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                    type="text" 
                    placeholder="Buscar por nombre o serial..." 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full bg-white border border-gray-200 rounded-2xl py-3.5 pl-11 pr-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#7b1113]/10 transition-all"
                />
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
          {filtered.length > 0 ? (
            filtered.map(eq => {
              const isSelected = selectedIds.includes(eq.id);
              return (
                <div
                  key={eq.id}
                  onClick={() => toggle(eq.id)}
                  className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left group cursor-pointer ${
                    isSelected ? 'bg-red-50 border-[#7b1113] shadow-md' : 'bg-white border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-[#7b1113] text-white' : 'bg-gray-100 text-gray-400'}`}>
                    {eq.imageUrl ? <img src={eq.imageUrl} className="w-full h-full object-cover rounded-xl" /> : <Cog size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm truncate ${isSelected ? 'text-[#7b1113]' : 'text-gray-900'}`}>{eq.name}</p>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">S/N: {eq.serialNumber}</p>
                  </div>
                  <input 
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}} // La lógica ya está en el div contenedor
                    className="form-checkbox h-5 w-5 text-[#7b1113] rounded border-gray-300 focus:ring-0 cursor-pointer"
                  />
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-gray-400">
               <Search size={32} className="mx-auto mb-2 opacity-20" />
               <p className="text-sm italic">No se encontraron equipos.</p>
            </div>
          )}
        </div>

        <footer className="p-6 bg-white border-t border-gray-100 flex gap-3">
          <button 
            onClick={onAddNew}
            className="px-5 py-4 bg-blue-50 text-blue-600 border border-blue-100 rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Plus size={18} /> <span className="hidden sm:inline">Agregar</span>
          </button>
          <button 
            onClick={() => onSelect(selectedIds)}
            className="flex-1 bg-[#7b1113] text-white py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-red-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            Actualizar Selección
          </button>
        </footer>
      </div>
    </div>
  );
};

export default EquipmentSelectorModal;
