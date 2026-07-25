import React, { useState, useMemo } from 'react';
import { OrderStatus, CuentiClient } from '../../types';
import { Search, Building2, UserPlus, Phone, MapPin, LayoutGrid, LayoutList, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import PERMISSIONS, { hasPermission } from '../../permissions';
import { CuentiClientModal } from '../shared/CuentiClientModal';

const ClientManager: React.FC = () => {
  const navigate = useNavigate();
  const { clients, orders, equipment } = useData();
  const { currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'active' | 'inactive'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isCuentiModalOpen, setIsCuentiModalOpen] = useState(false);

  const canCreate = useMemo(() => hasPermission(currentUser?.role, PERMISSIONS.CREATE_CLIENT), [currentUser]);
  const canImportFromCuenti = useMemo(() => currentUser?.role && ['developer', 'admin'].includes(currentUser.role), [currentUser]);

  const processedClients = useMemo(() => {
    let enrichedClients = clients.map(client => ({
      ...client,
      activeOrdersCount: orders.filter(o => o.clientId === client.id && o.status !== OrderStatus.CLOSED).length,
      equipmentCount: equipment.filter(e => e.clientId === client.id).length,
    }));
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      enrichedClients = enrichedClients.filter(c => 
          c.name?.toLowerCase().includes(q) || 
          c.identification?.toLowerCase().includes(q) ||
          c.contact?.toLowerCase().includes(q)
      );
    }
    if (filterType !== 'all') {
      enrichedClients = enrichedClients.filter(client => filterType === 'active' ? client.activeOrdersCount > 0 : client.activeOrdersCount === 0);
    }
    enrichedClients.sort((a, b) => {
      if (a.activeOrdersCount !== b.activeOrdersCount) return b.activeOrdersCount - a.activeOrdersCount;
      if (a.equipmentCount !== b.equipmentCount) return b.equipmentCount - a.equipmentCount;
      return a.name.localeCompare(b.name);
    });
    return enrichedClients;
  }, [clients, orders, equipment, searchTerm, filterType]);

  const handleSelectClientToImport = (clientToImport: CuentiClient) => {
    setIsCuentiModalOpen(false);
    navigate('/clients/new', { state: { clientToImport } });
  };

  return (
    <>
      <CuentiClientModal 
        isOpen={isCuentiModalOpen}
        onClose={() => setIsCuentiModalOpen(false)}
        onImportClient={handleSelectClientToImport}
        existingClients={clients}
      />
      
      <div className="w-full h-full max-w-7xl mx-auto">
        <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm pt-4 pb-3 px-4 md:px-6">
          <div className="flex flex-wrap gap-2 mb-3">
            <div className="relative flex-1 min-w-[200px]">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4"><Search className="text-gray-400" size={18} /></span>
              <input 
                type="text" 
                placeholder="Buscar clientes..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-12 bg-white border border-gray-200 rounded-xl pl-12 pr-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <button 
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
              className="h-12 w-12 flex-shrink-0 bg-white border border-gray-200 rounded-xl text-gray-500 shadow-sm flex items-center justify-center"
              title={viewMode === 'list' ? "Cuadrícula" : "Lista"}
            >
              {viewMode === 'list' ? <LayoutGrid size={20} /> : <LayoutList size={20} />}
            </button>
          </div>
          <div className="flex w-full items-center gap-2 mb-3">
            {canCreate && (
              <button 
                onClick={() => navigate('/clients/new')}
                className="flex-grow h-12 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-primary/20"
              >
                <UserPlus size={18} />
                Añadir Cliente
              </button>
            )}
            {canImportFromCuenti && (
              <button
                onClick={() => setIsCuentiModalOpen(true)}
                className="flex-shrink-0 h-12 px-5 bg-yellow-400 text-yellow-900 rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-yellow-400/20 hover:bg-yellow-500 transition-colors"
              >
                <RefreshCw size={16} />
                Cuenti
              </button>
            )}
          </div>
          <div className="flex bg-gray-200/80 p-1 rounded-lg">
            <button onClick={() => setFilterType('all')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md ${filterType === 'all' ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
              Todos
            </button>
            <button onClick={() => setFilterType('active')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md ${filterType === 'active' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500'}`}>
              Con Servicio
            </button>
            <button onClick={() => setFilterType('inactive')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md ${filterType === 'inactive' ? 'bg-white text-gray-600 shadow-sm' : 'text-gray-500'}`}>
              Sin Servicio
            </button>
          </div>
        </div>

        <div className="p-4 md:p-6 pt-3">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold">Lista de Clientes</h2>
            <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded-lg">{processedClients.length}</span>
          </div>
          {processedClients.length === 0 ? (
            <div className="text-center py-16 text-gray-400"><Search size={32} className="mx-auto mb-2"/><p className="font-medium">No se encontraron clientes.</p></div>
          ) : (
            <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" : "grid grid-cols-1 gap-3"}>
              {processedClients.map(client => (
                <div key={client.id} onClick={() => navigate(`/clients/${client.id}`)} className="bg-white rounded-lg shadow-sm cursor-pointer h-full relative overflow-hidden active:scale-[0.98] transition-all hover:shadow-md hover:border-red-100 border border-transparent">
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${client.activeOrdersCount > 0 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                  <div className="p-3 pl-4 flex-grow flex flex-col">
                    <div className="flex items-start gap-3 mb-2">
                      <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center ${client.activeOrdersCount > 0 ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <Building2 className={`${client.activeOrdersCount > 0 ? 'text-green-600' : 'text-gray-500'}`} size={16} />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-bold text-sm text-gray-800 uppercase leading-snug">{client.name}</h3>
                        <p className="text-xs text-gray-500 font-mono">{client.identification || 'Sin ID'}</p>
                      </div>
                    </div>
                    <div className="pl-10 text-xs text-gray-600 space-y-1 mb-2">
                      {client.contact && (
                        <div className="flex items-center gap-2">
                          <Phone size={11} className="text-gray-400" />
                          <span>{client.contact}</span>
                        </div>
                      )}
                      {client.address && (
                        <div className="flex items-center gap-2">
                          <MapPin size={11} className="text-gray-400" />
                          <span className="leading-snug truncate">{client.address}</span>
                        </div>
                      )}
                    </div>
                    <div className="border-t border-gray-100 mt-auto pt-2 flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase text-gray-400">Máquinas</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${client.equipmentCount > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                        {client.equipmentCount}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ClientManager;
