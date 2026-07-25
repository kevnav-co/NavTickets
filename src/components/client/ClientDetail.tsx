
import React, { useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Equipment, OrderStatus } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import {
  ChevronLeft, Building2, Phone, MapPin, Mail, Trash2, Edit3, Navigation, Cog,
  Hash, ChevronRight, ClipboardList, Calendar, PlusCircle, Copy, Search, X, Globe, Plus
} from 'lucide-react';
import PERMISSIONS, { hasPermission } from '../../permissions';

const ClientDetail: React.FC = () => {
  const { clients, equipment, orders, deleteItem } = useData();
  const { currentUser } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isCloneMode, setIsCloneMode] = useState(false);
  const [showGlobalCloneModal, setShowGlobalCloneModal] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  const client = useMemo(() => clients.find(c => c.id === id), [clients, id]);

  const permissions = useMemo(() => ({
    canCreateOrder: hasPermission(currentUser?.role, PERMISSIONS.CREATE_ORDER),
    canCreateEquipment: hasPermission(currentUser?.role, PERMISSIONS.CREATE_EQUIPMENT),
    canUpdateClient: hasPermission(currentUser?.role, PERMISSIONS.UPDATE_CLIENT),
    canDeleteClient: hasPermission(currentUser?.role, PERMISSIONS.DELETE_CLIENT),
  }), [currentUser]);

  const getClientName = useCallback((clientId: string) => {
    return clients.find(c => c.id === clientId)?.name || 'Sin Asignar';
  }, [clients]);

  const clientEquipment = useMemo(() => equipment.filter(e => e.clientId === client?.id), [equipment, client]);

  const clientOrders = useMemo(() => {
    const statusOrder: { [key in OrderStatus]: number } = {
      [OrderStatus.OPEN]: 1,
      [OrderStatus.PENDING]: 2,
      [OrderStatus.CLOSED]: 3,
    };

    return (orders || [])
      .filter(o => o.clientId === client?.id)
      .sort((a, b) => {
        const orderA = statusOrder[a.status] || 99;
        const orderB = statusOrder[b.status] || 99;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime();
      });
  }, [orders, client]);

  const filteredGlobalEquipment = useMemo(() => {
    if (!globalSearch) return equipment;
    const q = globalSearch.toLowerCase();
    return equipment.filter(e => 
      (e.name?.toLowerCase() || '').includes(q) || 
      (getClientName(e.clientId)?.toLowerCase() || '').includes(q) ||
      (e.serialNumber?.toLowerCase() || '').includes(q)
    );
  }, [equipment, globalSearch, getClientName]);

  if (!client) return <div className="p-10 text-center">Cliente no encontrado</div>;

  const handleCall = () => { if (client.contact) window.location.href = `tel:${client.contact}`; };
  const handleEmail = () => { if (client.email) window.location.href = `mailto:${client.email}`; };
  const handleNavigate = () => { if (client.address) window.open(`https://maps.google.com/?q=${encodeURIComponent(client.address)}`, '_blank'); };
  
  const handleDelete = async () => {
    if (!permissions.canDeleteClient) return alert('No tienes permiso.');
    if (window.confirm('¿Seguro que quieres eliminar este cliente?')) {
      await deleteItem('clients', client.id);
      navigate('/clients');
    }
  };

  const handleAddEquipment = () => navigate('/equipment/new', { state: { clientId: client.id } });
  const handleCreateOrder = () => navigate('/orders/new', { state: { clientId: client.id } });
  const handleCloneEquipment = (e: React.MouseEvent | null, item: Equipment) => {
    if (e) e.stopPropagation();
    navigate('/equipment/new', { state: { ...item, clientId: client.id, serialNumber: '', id: undefined } });
    setShowGlobalCloneModal(false);
  };
  
  return (
    <div className="bg-gray-50 min-h-screen pb-24 relative">
      <header className="px-5 py-4 flex items-center gap-4 sticky top-0 bg-white/80 backdrop-blur-sm border-b border-gray-100 z-10 shadow-sm"><button onClick={() => navigate('/clients')} className="p-1"><ChevronLeft size={24} /></button><h1 className="text-xl font-bold">Detalle del Cliente</h1></header>
      <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto w-full">
        <section className="bg-white p-6 rounded-3xl shadow-xl border border-gray-200"><div className="flex flex-col items-center text-center mb-6"><div className="bg-blue-100 p-5 rounded-3xl text-blue-600 mb-4"><Building2 size={40} /></div><h2 className="text-2xl font-bold">{client.name}</h2><p className="text-sm font-bold text-blue-500 uppercase mt-1">{client.identification || 'S/ID'}</p></div><div className="space-y-4"><button onClick={handleEmail} disabled={!client.email} className={`w-full flex items-center gap-4 p-3 rounded-2xl text-left ${client.email ? 'bg-gray-50 active:bg-gray-100' : 'bg-gray-50 opacity-60'}`}><Mail className="text-gray-400" size={18} /><div className="flex-1 min-w-0"><p className="text-[10px] font-bold uppercase">Correo</p><p className="text-sm truncate">{client.email || 'N/A'}</p></div>{client.email && <ChevronRight size={14} />}</button><button onClick={handleCall} className="w-full flex items-center gap-4 p-3 bg-blue-50/50 rounded-2xl active:bg-blue-100 text-left"><Phone className="text-blue-500" size={18} /><div className="flex-1 min-w-0"><p className="text-[10px] font-bold text-blue-400 uppercase">Teléfono</p><p className="text-sm font-bold">{client.contact || 'N/A'}</p></div><ChevronRight size={14} /></button><button onClick={handleNavigate} className="w-full flex items-center gap-4 p-3 bg-green-50/50 rounded-2xl active:bg-green-100 text-left"><MapPin className="text-green-600" size={18} /><div className="flex-1 min-w-0"><p className="text-[10px] font-bold text-green-600 uppercase">Dirección</p><p className="text-sm font-bold truncate">{client.address || 'N/A'}</p></div><Navigation size={14} /></button></div></section>

        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-bold flex items-center gap-2"><ClipboardList size={20} className="text-[#7b1113]" />Historial de Servicios</h3>
            {permissions.canCreateOrder && <button onClick={handleCreateOrder} className="bg-[#7b1113] text-white p-2 rounded-xl"><Plus size={20} /></button>}
          </div>
          <div className={`space-y-3 ${clientOrders.length > 5 ? 'max-h-[450px] overflow-y-auto pr-2' : ''}`}>
            {clientOrders.length > 0 ? (clientOrders.map(order => (
              <div key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-3 cursor-pointer relative overflow-hidden">
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${order.status === OrderStatus.PENDING ? 'bg-orange-400' : order.status === OrderStatus.OPEN ? 'bg-red-500' : 'bg-green-500'}`}></div>
                <div className="text-center w-14 flex-shrink-0 pl-2">
                  <p className="text-xs font-black uppercase text-gray-400">{order.orderType === 'Preventivo' ? 'MP' : 'MC'}</p>
                  <p className="text-lg font-black text-[#7b1113]">{order.orderNumber}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-sm text-gray-800 leading-tight mb-1.5">{order.serviceName}</h4>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-gray-500">
                      <Calendar size={12} className="text-gray-400" />
                      {order.scheduledDate}
                    </div>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase ${order.status === OrderStatus.PENDING ? 'bg-orange-50 text-orange-600' : order.status === OrderStatus.OPEN ? 'bg-red-50 text-[#7b1113]' : 'bg-green-50 text-green-600'}`}>
                      {order.status}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-400 flex-shrink-0"/>
              </div>
            )))
            : (<div className="bg-white p-6 rounded-2xl text-center border-dashed border border-gray-200"><p className="text-sm text-gray-400">No hay historial de servicios.</p></div>)}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-bold flex items-center gap-2"><Cog size={20} className="text-blue-600" />Máquinas ({clientEquipment.length})</h3>
            {permissions.canCreateEquipment && <div className="flex gap-2"><button onClick={handleAddEquipment} className="bg-blue-50 text-blue-600 p-2 rounded-xl"><PlusCircle size={20} /></button><button onClick={() => setIsCloneMode(!isCloneMode)} className={`p-2 rounded-xl ${isCloneMode ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}><Copy size={20} /></button></div>}
          </div>
          {isCloneMode && <div className="bg-blue-50 border border-blue-200 p-3 rounded-2xl space-y-2"><div className="flex items-center gap-3 text-blue-700"><div className="bg-blue-100 p-1.5 rounded-lg"><Copy size={14} /></div><p className="text-xs font-bold">Selecciona una máquina para clonarla</p></div><button onClick={() => setShowGlobalCloneModal(true)} className="w-full bg-white text-blue-600 py-2 rounded-xl text-[10px] font-black uppercase shadow-sm flex items-center justify-center gap-2"><Globe size={12} /> Ver Catálogo Global</button></div>}
          <div className={`space-y-3 ${clientEquipment.length > 5 ? 'max-h-[450px] overflow-y-auto pr-2' : ''}`}>
            {clientEquipment.length > 0 ? (clientEquipment.map(item => (<div key={item.id} onClick={() => isCloneMode ? handleCloneEquipment(null, item) : navigate(`/equipment/${item.id}`)} className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex items-center gap-4 cursor-pointer group ${isCloneMode ? 'border-blue-400 ring-1 ring-blue-400' : ''}`}><div className="w-12 h-12 bg-gray-100 rounded-xl flex-shrink-0"><img src={item.imageUrl} className="w-full h-full object-cover rounded-xl" /></div><div className="flex-1 min-w-0"><h4 className="font-bold text-sm truncate">{item.name}</h4><div className="flex items-center gap-2 text-[10px] uppercase"><Hash size={10} /> {item.serialNumber || 'S/N'}</div></div><div className="flex items-center gap-2">{permissions.canCreateEquipment && !isCloneMode && <button onClick={(e) => handleCloneEquipment(e, item)} className="p-2 text-gray-400 hover:text-blue-600 rounded-lg"><Copy size={16} /></button>}<ChevronRight size={16} /></div></div>)))
            : (<div className="bg-white p-6 rounded-2xl text-center border-dashed border border-gray-200"><p className="text-sm text-gray-400 mb-2">No hay máquinas.</p>{permissions.canCreateEquipment && <button onClick={handleAddEquipment} className="text-blue-600 text-xs font-bold uppercase">+ Agregar Máquina</button>}</div>)}
          </div>
        </section>

        {(permissions.canUpdateClient || permissions.canDeleteClient) && <section className="pt-6 grid grid-cols-2 gap-4">{permissions.canUpdateClient && <button onClick={() => navigate(`/clients/${client.id}/edit`)} className="flex items-center justify-center gap-2 bg-white border border-gray-300 py-4 rounded-2xl font-bold"><Edit3 size={18} />Editar</button>}{permissions.canDeleteClient && <button onClick={handleDelete} className="flex items-center justify-center gap-2 bg-red-50 text-red-600 py-4 rounded-2xl font-bold"><Trash2 size={18} />Eliminar</button>}</section>}
      </div>

      {showGlobalCloneModal && <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"><div className="bg-white w-full max-w-md rounded-3xl h-[85vh] sm:h-[70vh] flex flex-col"><div className="p-5 border-b border-gray-200 flex items-center justify-between flex-shrink-0"><div><h3 className="text-lg font-black">Catálogo Global</h3><p className="text-xs text-gray-400">Selecciona una máquina para clonar.</p></div><button onClick={() => { setShowGlobalCloneModal(false); setGlobalSearch(''); }} className="p-2 bg-gray-100 rounded-full"><X size={20} /></button></div><div className="px-5 py-3 border-b border-gray-200 flex-shrink-0"><div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} /><input type="text" autoFocus placeholder="Buscar..." value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 pl-10 pr-4 text-sm" /></div></div><div className="flex-1 overflow-y-auto p-5 space-y-3">{filteredGlobalEquipment.map(item => (<button key={item.id} onClick={() => handleCloneEquipment(null, item)} className="w-full bg-white p-3 rounded-2xl border border-gray-200 flex items-center gap-3 text-left group"><div className="w-10 h-10 bg-gray-50 rounded-lg flex-shrink-0"><Cog size={18} /></div><div className="flex-1 min-w-0"><h4 className="font-bold text-sm truncate">{item.name}</h4><div className="flex items-center gap-2 mt-0.5"><span className="text-[10px] font-black bg-gray-50 px-1.5 py-0.5 rounded uppercase truncate max-w-[120px]">{getClientName(item.clientId)}</span><span className="text-[9px] text-gray-300">|</span><span className="text-[9px] truncate">{item.serialNumber || 'S/N'}</span></div></div><ChevronRight size={16} /></button>))}{filteredGlobalEquipment.length === 0 && <div className="text-center py-10"><p className="text-gray-400 text-sm">No se encontraron equipos.</p></div>}</div></div></div>}
    </div>
  );
};

export default ClientDetail;
