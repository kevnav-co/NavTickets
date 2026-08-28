import React, { useState, useEffect } from 'react';
import { InventoryItem, OrderInventoryLine } from '../../types';
import { X, Search, Package, Check, Minus, Plus, AlertTriangle } from 'lucide-react';

interface InventorySelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventoryItems: InventoryItem[];
  initialLines: OrderInventoryLine[];
  onSave: (lines: OrderInventoryLine[]) => void;
}

/** Modal para seleccionar repuestos de una orden, con cantidad por línea. */
const InventorySelectorModal: React.FC<InventorySelectorModalProps> = ({
  isOpen,
  onClose,
  inventoryItems,
  initialLines,
  onSave,
}) => {
  // quantityOut keyed por inventoryItemId.
  const [lines, setLines] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      const init: Record<string, number> = {};
      for (const l of initialLines) init[l.inventoryItemId] = l.quantityOut;
      setLines(init);
      setQuery('');
    }
  }, [isOpen, initialLines]);

  if (!isOpen) return null;

  const filtered = inventoryItems.filter(i =>
    i.name.toLowerCase().includes(query.toLowerCase()) ||
    (i.sku || '').toLowerCase().includes(query.toLowerCase())
  );

  const selectedIds = new Set(Object.keys(lines).filter(id => (lines[id] || 0) > 0));
  const addQty = (id: string, delta: number) =>
    setLines(prev => ({ ...prev, [id]: Math.max(0, (prev[id] || 0) + delta) }));

  const isLow = (item: InventoryItem) => item.lowStockThreshold > 0 && (item.quantity ?? 0) <= (item.lowStockThreshold ?? 0);

  const handleSave = () => {
    const result: OrderInventoryLine[] = Object.entries(lines)
      .filter(([, qty]) => qty > 0)
      .map(([inventoryItemId, quantityOut]) => {
        const item = inventoryItems.find(i => i.id === inventoryItemId);
        return { inventoryItemId, quantityOut, unitCostSnapshot: item?.unitCost ?? 0 };
      });
    onSave(result);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 duration-300 h-auto max-h-[85vh]">
        <header className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
          <div>
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Repuestos Usados</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Selecciona y define cantidad</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-50 rounded-full transition-colors text-gray-400"><X size={20} /></button>
        </header>

        <div className="p-4 bg-gray-50 border-b border-gray-100">
          <div className="relative">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar repuesto..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-2xl py-3.5 pl-11 pr-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar">
          {filtered.length > 0 ? (
            filtered.map(item => {
              const qty = lines[item.id] || 0;
              const selected = qty > 0;
              const low = isLow(item);
              return (
                <div
                  key={item.id}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all ${
                    selected ? 'bg-red-50 border-primary' : 'bg-white border-gray-100'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${selected ? 'bg-primary text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <Package size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-bold text-sm truncate ${selected ? 'text-primary' : 'text-gray-900'}`}>{item.name}</p>
                    <p className={`text-[10px] font-black text-gray-400 uppercase tracking-tighter ${low ? '!text-red-500' : ''}`}>
                      {low && <AlertTriangle size={10} className="inline -mt-0.5 mr-0.5" />}
                      Stock: {item.quantity} {item.unit}
                    </p>
                  </div>

                  {selected ? (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => addQty(item.id, -1)} className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center active:scale-90 transition-transform"><Minus size={16} /></button>
                      <span className="w-7 text-center font-black text-sm">{qty}</span>
                      <button onClick={() => addQty(item.id, 1)} className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center active:scale-90 transition-transform"><Plus size={16} /></button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addQty(item.id, 1)}
                      className="flex-shrink-0 w-8 h-8 rounded-lg border border-primary/40 text-primary flex items-center justify-center hover:bg-primary hover:text-white active:scale-90 transition-all"
                    >
                      <Check size={16} />
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-gray-400">
              <Search size={32} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm italic">No se encontraron repuestos.</p>
            </div>
          )}
        </div>

        <footer className="p-6 bg-white border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="px-5 py-4 bg-gray-100 text-gray-500 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-[0.98] transition-all">Cancelar</button>
          <button
            onClick={handleSave}
            className="flex-1 bg-primary text-white py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-red-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            disabled={selectedIds.size === 0}
          >
            Guardar ({selectedIds.size})
          </button>
        </footer>
      </div>
    </div>
  );
};

export default InventorySelectorModal;