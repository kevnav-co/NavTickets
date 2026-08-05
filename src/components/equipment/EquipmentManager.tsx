import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { OrderStatus, Equipment } from '../../types';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import {
  Search, Plus, Copy, LayoutGrid, LayoutList,
  X, Settings, Building2, Hash, Clock
} from 'lucide-react';
import { addMonths, differenceInCalendarDays } from 'date-fns';
import PERMISSIONS, { hasPermission } from '../../permissions';
import { useVirtualizer } from '@tanstack/react-virtual';

type EnrichedEquipment = Equipment & {
  clientName: string;
  orderCount: number;
  activeOrderCount: number;
  nextMaintenance?: string;
};

const EquipmentCloneModal: React.FC<{
  equipment: EnrichedEquipment[];
  onSelect: (equipment: EnrichedEquipment) => void;
  onClose: () => void;
}> = ({ equipment, onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return equipment;
    return equipment.filter(e =>
      e.name.toLowerCase().includes(q) ||
      (e.serialNumber && e.serialNumber.toLowerCase().includes(q)) ||
      e.clientName.toLowerCase().includes(q)
    );
  }, [equipment, query]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full h-full md:h-auto md:max-h-[80vh] max-w-lg rounded-3xl flex flex-col shadow-2xl">
        <header className="p-4 border-b flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-black uppercase tracking-wider">Clonar Máquina</h3>
          <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"><X size={18} /></button>
        </header>
        <div className="p-4 bg-gray-50/50 border-b flex-shrink-0">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><Search className="text-gray-400" size={18} /></div>
            <input ref={inputRef} type="text" placeholder="Buscar máquina para clonar..." value={query} onChange={e => setQuery(e.target.value)} className="w-full bg-white border border-gray-200 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-red-300" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.length > 0 ? filtered.map(equip => (
            <button key={equip.id} onClick={() => onSelect(equip)} className="w-full flex items-center gap-3 p-3 hover:bg-red-50 rounded-2xl text-left group border border-transparent transition-colors">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center font-black text-xl text-white bg-red-800 flex-shrink-0">{equip.name.charAt(0)}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{equip.name}</p>
                <p className="text-[10px] font-bold uppercase text-gray-500">{equip.serialNumber || 'S/N'} • {equip.clientName}</p>
              </div>
            </button>
          )) : <div className="py-12 text-center"><p className="text-sm font-bold italic text-gray-400">No se encontraron máquinas.</p></div>}
        </div>
      </div>
    </div>
  );
};

const EquipmentManager: React.FC = () => {
  const { equipment, clients, orders } = useData();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [filter, setFilter] = useState<'all' | 'operational' | 'review' | 'expired'>('all');
  const [showCloneModal, setShowCloneModal] = useState(false);

  const canCreate = useMemo(() => hasPermission(currentUser?.role, PERMISSIONS.CREATE_EQUIPMENT), [currentUser]);

  const getClientName = useCallback((clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'N/A';
  }, [clients]);

  const enrichedEquipment = useMemo<EnrichedEquipment[]>(() => {
    return equipment.map(e => {
      const nextMaintDate = e.lastMaintenanceDate && e.maintenanceFrequency ? addMonths(new Date(e.lastMaintenanceDate), e.maintenanceFrequency) : undefined;

      const associatedOrders = orders.filter(o => Array.isArray(o.equipmentIds) && o.equipmentIds.includes(e.id));

      return {
        ...e,
        clientName: getClientName(e.clientId),
        orderCount: associatedOrders.length,
        activeOrderCount: associatedOrders.filter(o => o.status !== OrderStatus.CLOSED).length,
        nextMaintenance: nextMaintDate ? nextMaintDate.toISOString().split('T')[0] : undefined
      };
    });
  }, [equipment, orders, getClientName]);

  const getMaintenanceInfo = useCallback((dateString: string | undefined) => {
    if (!dateString) {
      return { colorClass: 'text-gray-400', statusBarColor: 'bg-gray-400', days: null };
    }

    const today = new Date();
    today.setHours(0,0,0,0);
    const nextDate = new Date(dateString + 'T00:00:00');
    const days = differenceInCalendarDays(nextDate, today);

    if (days < 0) return { colorClass: 'text-red-500', statusBarColor: 'bg-red-500', days };
    if (days <= 30) return { colorClass: 'text-orange-500', statusBarColor: 'bg-orange-500', days };
    return { colorClass: 'text-green-500', statusBarColor: 'bg-green-500', days };
  }, []);

  const filteredEquipment = useMemo(() => {
    let prefiltered = [...enrichedEquipment];

    if (searchTerm) {
      const lowercasedTerm = searchTerm.toLowerCase();
      prefiltered = prefiltered.filter(e => e.name.toLowerCase().includes(lowercasedTerm) || (e.serialNumber || '').toLowerCase().includes(lowercasedTerm) || e.clientName.toLowerCase().includes(lowercasedTerm));
    }

    let filtered;
    if (filter === 'expired') {
        const today = new Date();
        today.setHours(0,0,0,0);
        filtered = prefiltered.filter(e => {
            if (!e.nextMaintenance) return false;
            const nextDate = new Date(e.nextMaintenance + 'T00:00:00');
            const days = differenceInCalendarDays(nextDate, today);
            return days < 0 && e.activeOrderCount === 0;
        });
    } else if (filter === 'operational' || filter === 'review') {
        const today = new Date();
        today.setHours(0,0,0,0);
        filtered = prefiltered.filter(e => {
            if (!e.nextMaintenance) return false;
            const nextDate = new Date(e.nextMaintenance + 'T00:00:00');
            const days = differenceInCalendarDays(nextDate, today);

            if (filter === 'operational') return days > 30;
            if (filter === 'review') return days <= 30;
            return false;
        });
    } else {
        filtered = prefiltered;
    }

    const getSortGroup = (e: EnrichedEquipment) => {
        const maint = getMaintenanceInfo(e.nextMaintenance);
        const isOperational = maint.days !== null && maint.days > 30;

        if (isOperational && e.activeOrderCount > 0) return 1;
        if (!e.nextMaintenance && e.activeOrderCount === 0) return 3;
        return 2;
    };

    filtered.sort((a, b) => {
        const groupA = getSortGroup(a);
        const groupB = getSortGroup(b);

        if (groupA !== groupB) {
            return groupA - groupB;
        }

        if (groupA === 1) {
            return b.activeOrderCount - a.activeOrderCount;
        }

        if (groupA === 2) {
            const maintA = getMaintenanceInfo(a.nextMaintenance);
            const maintB = getMaintenanceInfo(b.nextMaintenance);
            const daysA = maintA.days === null ? Infinity : maintA.days;
            const daysB = maintB.days === null ? Infinity : maintB.days;

            if (daysA !== daysB) {
                return daysA - daysB;
            }
            if (a.activeOrderCount !== b.activeOrderCount) {
                return b.activeOrderCount - a.activeOrderCount;
            }
        }

        return a.name.localeCompare(b.name);
    });

    return filtered;
  }, [enrichedEquipment, searchTerm, filter, getMaintenanceInfo]);

  const handleSelectToClone = (equipmentToClone: EnrichedEquipment) => {
    const { id, serialNumber, clientName, orderCount, activeOrderCount, nextMaintenance, ...cloneData } = equipmentToClone;
    navigate('/equipment/new', { state: { ...cloneData, serialNumber: '' } });
  };

  const handleItemClick = (item: Equipment) => {
    navigate(`/equipment/${item.id}`);
  };

  const handleRegisterNew = () => {
    // 1. Extraer los números de los seriales existentes que siguen el formato SN-XXXX
    const usedSerialNumbers = new Set(
      equipment
        .map(e => e.serialNumber)
        .filter(s => s && /^SN-\d{4}$/.test(s)) // Filtrar solo los que cumplen el formato
        .map(s => parseInt(s.substring(3), 10)) // Extraer y convertir el número
    );

    // 2. Encontrar el número más bajo disponible, comenzando desde 1
    let nextNumber = 1;
    while (usedSerialNumbers.has(nextNumber)) {
      nextNumber++;
    }

    // 3. Formatear el número a 4 dígitos con ceros a la izquierda (ej: 1 -> "0001")
    const newSerialNumber = `SN-${String(nextNumber).padStart(4, '0')}`;

    // 4. Navegar a la página del formulario con el nuevo serial
    navigate('/equipment/new', { state: { serialNumber: newSerialNumber } });
  };

  // Virtualized list setup
  const parentRef = useRef<HTMLDivElement>(null);
  const ITEM_HEIGHT = viewMode === 'list' ? 140 : 50; // Estimate for equipment cards

  const virtualizer = useVirtualizer({
    count: filteredEquipment.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  // Card components
  const EquipmentCardGrid: React.FC<{ item: EnrichedEquipment; onClick: () => void }> = React.memo(({ item, onClick }) => {
    const maintenance = getMaintenanceInfo(item.nextMaintenance);
    return (
      <div onClick={onClick} className="bg-white rounded-lg shadow-sm cursor-pointer h-full relative overflow-hidden active:scale-[0.98] transition-all hover:shadow-md hover:border-red-100 border border-transparent">
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${maintenance.statusBarColor}`} />
        <div className="p-3 pl-4 flex-grow flex flex-col">
          <div className="flex items-start gap-3 mb-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex-shrink-0 flex items-center justify-center">
              <Settings className="text-primary" size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm text-gray-800 uppercase leading-snug truncate">{item.name}</h3>
              <div className="flex items-center gap-1.5">
                {maintenance.days !== null ? (
                  <div className={`flex items-center gap-1 text-[10px] font-bold ${maintenance.colorClass}`}>
                    <Clock size={10} />
                    <span>
                      {maintenance.days > 0
                        ? `Vence en ${maintenance.days}d`
                        : (maintenance.days === 0 ? 'Vence Hoy' : `Venció hace ${-maintenance.days}d`)
                      }
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                    <Clock size={10} />
                    <span>Sin fecha</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pl-10 text-xs text-gray-600 space-y-1 mb-2">
            <div className="flex items-center gap-2">
              <Hash size={11} className="text-gray-400" />
              <span className="font-mono">{item.serialNumber || 'S/N'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 size={11} className="text-gray-400" />
              <span className="leading-snug truncate font-semibold">{item.clientName}</span>
            </div>
          </div>

          <div className="border-t border-gray-100 mt-auto pt-2 flex justify-between items-center">
            <span className="text-[10px] font-bold uppercase text-gray-400">Servicios</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${item.activeOrderCount > 0 ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'}`}>
              {item.activeOrderCount > 0 ? `${item.activeOrderCount} Activo(s)` : `${item.orderCount} Total`}
            </span>
          </div>
        </div>
      </div>
    );
  });

  const EquipmentCardList: React.FC<{ item: EnrichedEquipment; onClick: () => void }> = React.memo(({ item, onClick }) => {
    const maintenance = getMaintenanceInfo(item.nextMaintenance);
    return (
      <div onClick={onClick} className="bg-white rounded-lg shadow-sm cursor-pointer h-full relative overflow-hidden active:scale-[0.98] transition-all hover:shadow-md hover:border-red-100 border border-transparent p-4 pl-5 flex items-center gap-4">
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${maintenance.statusBarColor}`} />
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex-shrink-0 flex items-center justify-center">
          <Settings className="text-primary" size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-base text-gray-800 uppercase leading-snug truncate">{item.name}</h3>
          <div className="flex items-center gap-2 text-sm">
            {maintenance.days !== null ? (
              <span className={`flex items-center gap-1 font-bold ${maintenance.colorClass}`}>
                <Clock size={14} />
                {maintenance.days > 0
                  ? `Vence en ${maintenance.days}d`
                  : (maintenance.days === 0 ? 'Vence Hoy' : `Venció hace ${-maintenance.days}d`)
                }
              </span>
            ) : (
              <span className="flex items-center gap-1 font-bold text-gray-400"><Clock size={14} />Sin fecha</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 shrink-0">
          <span className="flex items-center gap-1"><Hash size={14} className="text-gray-400" />{item.serialNumber || 'S/N'}</span>
          <span className="flex items-center gap-1"><Building2 size={14} className="text-gray-400" />{item.clientName}</span>
        </div>
        <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${item.activeOrderCount > 0 ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'}`}>
          {item.activeOrderCount > 0 ? `${item.activeOrderCount} Activo(s)` : `${item.orderCount} Total`}
        </div>
      </div>
    );
  });

  return (
    <div className="w-full h-full max-w-7xl mx-auto">
      {showCloneModal && <EquipmentCloneModal equipment={enrichedEquipment} onClose={() => setShowCloneModal(false)} onSelect={handleSelectToClone} />}
      <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm pt-4 pb-3 px-4 md:px-6">
        <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><Search className="text-gray-400" size={18} /></div>
                <input
                    type="text"
                    placeholder="Buscar máquinas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-12 bg-white border border-gray-200 rounded-xl py-3 pl-12 pr-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
            </div>
            <button
                onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
                className="h-12 w-12 flex-shrink-0 bg-white border border-gray-200 rounded-xl text-gray-500 shadow-sm flex items-center justify-center hover:bg-gray-100 transition-colors"
                title={viewMode === 'list' ? "Cambiar a Cuadrícula" : "Cambiar a Lista"}
            >
                {viewMode === 'list' ? <LayoutGrid size={20} /> : <LayoutList size={20} />}
            </button>
        </div>

        {canCreate && (
            <div className="flex gap-2 mb-3">
                <button onClick={handleRegisterNew} className="flex-1 h-12 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform">
                    <Plus size={18} />Registrar
                </button>
                <button onClick={() => setShowCloneModal(true)} disabled={equipment.length === 0} className="flex-1 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-blue-600/20 active:scale-95 transition-transform">
                    <Copy size={16} />Clonar
                </button>
            </div>
        )}
        <div className="flex bg-gray-200/80 p-1 rounded-lg text-center">
          <button onClick={() => setFilter('all')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md transition-all ${filter === 'all' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>Todas</button>
          <button onClick={() => setFilter('operational')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md transition-all ${filter === 'operational' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500'}`}>Operativas</button>
          <button onClick={() => setFilter('review')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md transition-all ${filter === 'review' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-500'}`}>Revisión</button>
          <button onClick={() => setFilter('expired')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md transition-all ${filter === 'expired' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500'}`}>Vencidas</button>
        </div>
      </div>
      <div className="p-4 md:p-6 pt-3 pb-24">
        <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-gray-800">Parque de Máquinas</h2>
            <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded-lg">{filteredEquipment.length}</span>
        </div>

        {filteredEquipment.length > 0 ? (
             <div
              ref={parentRef}
              className="relative"
              style={{
                height: '600px',
                width: '100%',
              }}
            >
              {viewMode === 'grid' ? (
                <div
                  className="relative"
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualRow) => (
                    <div
                      key={virtualRow.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4 md:p-6 pt-3 h-full">
                        {virtualRow.index < filteredEquipment.length && (
                          <EquipmentCardGrid item={filteredEquipment[virtualRow.index]} onClick={() => handleItemClick(filteredEquipment[virtualRow.index])} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="relative"
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  {virtualizer.getVirtualItems().map((virtualRow) => (
                    <div
                      key={virtualRow.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="grid grid-cols-1 gap-3 p-4 md:p-6 pt-3 h-full">
                        {virtualRow.index < filteredEquipment.length && (
                          <EquipmentCardList item={filteredEquipment[virtualRow.index]} onClick={() => handleItemClick(filteredEquipment[virtualRow.index])} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
        ) : (
            <div className="text-center py-16 text-gray-400">
                <Search size={32} className="mx-auto mb-2 opacity-50"/>
                <p className="font-medium">No se encontraron máquinas</p>
                <p className="text-sm text-gray-400">Intenta cambiar los filtros o el término de búsqueda.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default EquipmentManager;