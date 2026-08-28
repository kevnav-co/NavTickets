import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Plus, Search, Hash, Layers } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import PERMISSIONS, { hasPermission } from '../../permissions';

type StockFilter = 'all' | 'low' | 'ok';

const isLowStock = (item: { quantity: number; lowStockThreshold: number }) =>
  item.lowStockThreshold > 0 && item.quantity <= item.lowStockThreshold;

const InventoryManager: React.FC = () => {
  const { inventoryItems, loadInventory } = useData();
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { loadInventory(); }, [loadInventory]);

  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState<StockFilter>('all');

  const canCreate = useMemo(
    () => hasPermission(currentUser?.role, PERMISSIONS.CREATE_INVENTORY),
    [currentUser]
  );

  const lowCount = useMemo(() => inventoryItems.filter(isLowStock).length, [inventoryItems]);

  const filtered = useMemo(() => {
    let list = [...inventoryItems];
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.sku && i.sku.toLowerCase().includes(q))
      );
    }
    if (filter === 'low') list = list.filter(isLowStock);
    else if (filter === 'ok') list = list.filter(i => !isLowStock(i));
    // Ordenar por stock bajo primero, luego por nombre.
    list.sort((a, b) => {
      const lowA = isLowStock(a) ? 0 : 1;
      const lowB = isLowStock(b) ? 0 : 1;
      if (lowA !== lowB) return lowA - lowB;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [inventoryItems, searchTerm, filter]);

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

  const Card: React.FC<{ item: (typeof filtered)[number]; onClick: () => void }> = React.memo(({ item, onClick }) => {
    const low = isLowStock(item);
    return (
      <div onClick={onClick} className="bg-white rounded-lg shadow-sm cursor-pointer h-full relative overflow-hidden active:scale-[0.98] transition-all hover:shadow-md hover:border-red-100 border border-transparent">
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${low ? 'bg-red-500' : 'bg-emerald-500'}`} />
        <div className="p-4 pl-5 flex flex-col gap-2 h-full">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex-shrink-0 flex items-center justify-center">
              <Package className="text-primary" size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm text-gray-800 leading-snug truncate">{item.name}</h3>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400">
                <Hash size={10} /> {item.sku || 'sin ref'}
              </div>
            </div>
          </div>
          <div className="flex items-end justify-between mt-auto">
            <div>
              <p className={`text-2xl font-black ${low ? 'text-red-600' : 'text-gray-800'}`}>
                {item.quantity}
                <span className="text-[10px] font-bold text-gray-400 ml-1">{item.unit}</span>
              </p>
              <p className="text-[10px] font-bold text-gray-400">Costo {fmtMoney(item.unitCost)}</p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${low ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {low ? 'Stock bajo' : 'OK'}
            </span>
          </div>
        </div>
      </div>
    );
  });

  const Row: React.FC<{ item: (typeof filtered)[number]; onClick: () => void }> = React.memo(({ item, onClick }) => {
    const low = isLowStock(item);
    return (
      <div onClick={onClick} className="bg-white rounded-lg shadow-sm cursor-pointer active:scale-[0.99] transition-all hover:shadow-md border border-transparent p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex-shrink-0 flex items-center justify-center">
          <Package className="text-primary" size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-gray-800 truncate">{item.name}</p>
          <p className="text-[10px] font-bold text-gray-400 font-mono">{item.sku || 'sin ref'} • {item.unit}</p>
        </div>
        <div className={`text-sm font-black shrink-0 ${low ? 'text-red-600' : 'text-gray-800'}`}>{item.quantity}</div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${low ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {low ? 'Bajo' : 'OK'}
        </span>
      </div>
    );
  });

  return (
    <div className="w-full h-full max-w-7xl mx-auto">
      <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm pt-4 pb-3 px-4 md:px-6">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><Search className="text-gray-400" size={18} /></div>
            <input
              type="text"
              placeholder="Buscar repuestos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-12 bg-white border border-gray-200 rounded-xl py-3 pl-12 pr-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
          <button
            onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
            className="h-12 w-12 flex-shrink-0 bg-white border border-gray-200 rounded-xl text-gray-500 shadow-sm flex items-center justify-center hover:bg-gray-100 transition-colors"
            title={viewMode === 'list' ? 'Cuadrícula' : 'Lista'}
          >
            {viewMode === 'list' ? <Layers size={20} /> : <Package size={20} />}
          </button>
        </div>

        {canCreate && (
          <button onClick={() => navigate('/inventory/new')} className="w-full h-12 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform mb-3">
            <Plus size={18} />Nuevo Repuesto
          </button>
        )}

        <div className="flex bg-gray-200/80 p-1 rounded-lg text-center">
          <button onClick={() => setFilter('all')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md transition-all ${filter === 'all' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>Todos ({inventoryItems.length})</button>
          <button onClick={() => setFilter('low')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md transition-all ${filter === 'low' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>Stock bajo ({lowCount})</button>
          <button onClick={() => setFilter('ok')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md transition-all ${filter === 'ok' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500'}`}>OK</button>
        </div>
      </div>

      <div className="p-4 md:p-6 pt-4 pb-24">
        {filtered.length > 0 ? (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(item => <Card key={item.id} item={item} onClick={() => navigate(`/inventory/${item.id}`)} />)}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(item => <Row key={item.id} item={item} onClick={() => navigate(`/inventory/${item.id}`)} />)}
            </div>
          )
        ) : (
          <div className="text-center py-16 text-gray-400">
            <Package size={32} className="mx-auto mb-2 opacity-50" />
            <p className="font-medium">No hay repuestos</p>
            <p className="text-sm text-gray-400">Ajusta la búsqueda o registra el primero.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryManager;