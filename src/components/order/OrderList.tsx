
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { OrderStatus, ServiceOrder, User } from '../../types'; 
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { getWarrantyInfo } from '../../utils/warranty';
import { Search, Calendar, ChevronRight, Plus, Cog, LayoutGrid, LayoutList, Building2, Filter, HardHat, Clock, TriangleAlert, ShieldCheck } from 'lucide-react';
import PERMISSIONS, { hasPermission, ROLES } from '../../permissions';
import { usePaginatedCollection } from '../../hooks/usePaginatedCollection';
import { where, orderBy, QueryConstraint } from 'firebase/firestore';

const LoadingSpinner: React.FC = () => (
  <div className="flex justify-center items-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-700"></div>
  </div>
);

type DateFilterType = 'all' | 'today' | 'week' | 'month';

const OrderList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { clients, equipment, users } = useData();
  const { currentUser } = useAuth();

  const [activeTab, setActiveTab] = useState<OrderStatus | 'All' | 'Warranty'>(OrderStatus.PENDING);
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterType>('all');
  const [filterTechId, setFilterTechId] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const statusParam = searchParams.get('status');
    if (statusParam === 'All') setActiveTab('All');
    else if (statusParam === 'Warranty') setActiveTab('Warranty');
    else if (statusParam && Object.values(OrderStatus).includes(statusParam as OrderStatus)) setActiveTab(statusParam as OrderStatus);
    else setActiveTab(OrderStatus.PENDING);
  }, [searchParams]);

  const constraints = useMemo(() => {
    const q: QueryConstraint[] = [];
    if (activeTab === 'Warranty') {
      q.push(where('status', '==', OrderStatus.CLOSED));
    } else if (activeTab !== 'All') {
      q.push(where('status', '==', activeTab));
    }
    if (currentUser && hasPermission(currentUser.role, PERMISSIONS.VIEW_ALL_ORDERS)) {
      if (filterTechId !== 'all') {
        q.push(where('technicianId', '==', filterTechId));
      }
    } else if (currentUser) {
      q.push(where('technicianId', '==', currentUser.id));
    }
    if (dateFilter !== 'all') {
      const today = new Date();
      const currentIsoDate = today.toISOString().split('T')[0];
      if (dateFilter === 'today') {
        q.push(where('scheduledDate', '==', currentIsoDate));
      } else if (dateFilter === 'month') {
        const startOfMonth = currentIsoDate.substring(0, 7) + '-01';
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const startOfNextMonth = nextMonth.toISOString().split('T')[0];
        q.push(where('scheduledDate', '>=', startOfMonth));
        q.push(where('scheduledDate', '<', startOfNextMonth));
      } else if (dateFilter === 'week') {
        const d = new Date(today);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        q.push(where('scheduledDate', '>=', monday.toISOString().split('T')[0]));
        q.push(where('scheduledDate', '<=', sunday.toISOString().split('T')[0]));
      }
    }
    q.push(orderBy('priority', 'desc'));
    q.push(orderBy('scheduledDate', 'desc'));
    return q;
  }, [activeTab, filterTechId, dateFilter, currentUser]);

  const { data: orders, loading, loadingMore, hasMore, error, refresh, loadMore } = usePaginatedCollection<ServiceOrder>(
    'orders',
    { constraints }
  );

  useEffect(() => { refresh(); }, [constraints]);

  const getClientName = useCallback((id: string | undefined) => clients.find(c => c.id === id)?.name || 'N/A', [clients]);
  const getTechName = useCallback((id: string | undefined) => users.find(u => u.id === id)?.name || 'N/A', [users]);

  const finalOrders = useMemo(() => {
    let result: ServiceOrder[] = orders;
    if (activeTab === 'Warranty') {
      result = result.filter(o => {
        const warrantyInfo = getWarrantyInfo(o);
        return warrantyInfo ? !warrantyInfo.expired : false;
      });
    }
    if (query) {
      const q = query.toLowerCase();
      result = result.filter(o =>
        o.orderNumber.toString().includes(q) ||
        getClientName(o.clientId).toLowerCase().includes(q) ||
        getTechName(o.technicianId).toLowerCase().includes(q) ||
        (o.serviceName || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [orders, activeTab, query, getClientName, getTechName]);
  
  const getEquipmentNames = useCallback((ids: string[] | undefined) => {
    if (!ids || ids.length === 0) return 'N/A';
    if (ids.length === 1) return equipment.find(e => e.id === ids[0])?.name || 'N/A';
    return `${ids.length} Máquinas`;
  }, [equipment]);

  const handleTabChange = (tab: OrderStatus | 'All' | 'Warranty') => {
    searchParams.set('status', tab);
    setSearchParams(searchParams, { replace: true });
  };

  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const [target] = entries;
    if (target.isIntersecting && hasMore && !loadingMore && loadMore) {
      loadMore();
    }
  }, [hasMore, loadingMore, loadMore]);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(handleObserver, { rootMargin: '500px' });
    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
    const currentObserver = observerRef.current;
    const currentRef = loadMoreRef.current;
    return () => { if (currentObserver && currentRef) currentObserver.unobserve(currentRef); };
  }, [handleObserver]);

  return (
    <div className="w-full h-full max-w-7xl mx-auto">
      <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm pt-4 pb-3 px-4 md:px-6">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1 h-full">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <Search className="text-gray-400" size={18} />
            </div>
            <input type="text" placeholder="Buscar..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-full h-12 bg-white border border-gray-200 rounded-xl pl-12 pr-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          
          {hasPermission(currentUser?.role, PERMISSIONS.VIEW_ALL_ORDERS) && (
             <div className={`relative h-12 w-12 flex-shrink-0 border rounded-xl shadow-sm flex items-center justify-center ${filterTechId !== 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-500 border-gray-200'}`}>
               <HardHat size={20} />
               <select value={filterTechId} onChange={(e) => setFilterTechId(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                 <option value="all">Todos</option>
                 {users.filter(u => u.role !== ROLES.DEVELOPER).map(u => (<option key={u.id} value={u.id}>{u.name.split(' ')[0]}</option>))}
               </select>
             </div>
          )}

          <div className={`relative h-12 w-12 flex-shrink-0 border rounded-xl shadow-sm flex items-center justify-center ${dateFilter !== 'all' ? 'bg-primary text-white border-primary' : 'bg-white text-green-500 border-gray-200'}`}>
            <Calendar size={20} />
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilterType)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
              <option value="all">Todas</option><option value="today">Hoy</option><option value="week">Semana</option><option value="month">Mes</option>
            </select>
          </div>
          <button onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')} className="h-12 w-12 flex-shrink-0 bg-white border-gray-200 rounded-xl text-gray-500 shadow-sm flex items-center justify-center hover:bg-gray-100">
            {viewMode === 'list' ? <LayoutGrid size={20} /> : <LayoutList size={20} />}
          </button>
        </div>

        {hasPermission(currentUser?.role, PERMISSIONS.CREATE_ORDER) && (
          <button onClick={() => navigate('/orders/new')} className="w-full h-12 mb-4 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-primary/20">
            <Plus size={18} /> Crear Nueva Orden
          </button>
        )}

        <div className="flex bg-gray-200/80 p-1 rounded-lg text-center">
          {['All', OrderStatus.PENDING, OrderStatus.OPEN, OrderStatus.CLOSED, 'Warranty'].map((tab) => (
            <button key={tab} onClick={() => handleTabChange(tab as any)} className={`flex-1 py-2 px-2 text-[10px] font-bold uppercase rounded-md transition-all ${activeTab === tab ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
              {tab === 'All' ? 'Todos' : tab === 'Warranty' ? 'Garantía' : tab === OrderStatus.OPEN ? 'En Progreso' : tab}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 md:px-6 pt-3 pb-24">
        {loading && finalOrders.length === 0 ? (
          <div className="pt-16"><LoadingSpinner /></div>
        ) : finalOrders.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Filter size={32} className="mx-auto mb-2 opacity-50"/><p className="font-medium">No se encontraron órdenes</p><p className="text-sm text-gray-400">Intenta cambiar los filtros.</p>
          </div>
        ) : (
          <div className={`${viewMode === 'grid' ? 'masonry-grid' : 'grid grid-cols-1 gap-3'}`}>
            {finalOrders.map((order) => <OrderCard key={order.id} order={order} viewMode={viewMode} getClientName={getClientName} getEquipmentNames={getEquipmentNames} getTechName={getTechName} userRole={currentUser?.role} />)}
          </div>
        )}

        <div ref={loadMoreRef} className="h-1"></div>
        {loadingMore && (
          <div className="py-6"><LoadingSpinner /></div>
        )}
        {!hasMore && orders.length > 5 && (
           <p className="text-center text-sm text-gray-400 py-6">Has llegado al final</p>
        )}
        {error && <p className="text-center text-red-500 py-6">Error al cargar los datos.</p>}
      </div>
    </div>
  );
};

interface OrderCardProps {
  order: ServiceOrder;
  viewMode: 'list' | 'grid';
  getClientName: (id: string | undefined) => string;
  getEquipmentNames: (ids: string[] | undefined) => string;
  getTechName: (id: string | undefined) => string;
  userRole: User['role'] | undefined;
}

const OrderCard: React.FC<OrderCardProps> = React.memo(({ order, viewMode, getClientName, getEquipmentNames, getTechName, userRole }) => {
  const navigate = useNavigate();
  const warrantyInfo = getWarrantyInfo(order);
  const { priority = 'Baja', status, startTime, endTime, scheduledDate, timeSlot } = order;
  const isClosed = status === OrderStatus.CLOSED;
  const isInProgress = status === OrderStatus.OPEN;
  
  const isTechnician = userRole === ROLES.TECHNICIAN;

  const priorityStyles = { Urgente: { icon: 'text-red-500', text: 'text-red-700' }, Alta: { icon: 'text-orange-500', text: 'text-orange-700' }, Media: { icon: 'text-yellow-500', text: 'text-yellow-700' }, Baja: { icon: 'text-green-500', text: 'text-green-700' } };
  const currentPriorityStyle = priorityStyles[priority as keyof typeof priorityStyles] || { icon: 'text-gray-400', text: 'text-gray-700' };

  let indicatorColorClass = 'bg-gray-300';
  if (warrantyInfo && !warrantyInfo.expired) indicatorColorClass = 'bg-violet-500';
  else if (status === OrderStatus.PENDING) indicatorColorClass = 'bg-orange-500';
  else if (status === OrderStatus.OPEN) indicatorColorClass = 'bg-blue-500';
  else if (status === OrderStatus.CLOSED) indicatorColorClass = 'bg-green-500';

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  const formatScheduledDate = (dateStr: string) => new Date(dateStr + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

  return (
    <div onClick={() => navigate(`/orders/${order.id}`)} className={`bg-white rounded-2xl border border-gray-100 shadow-sm active:scale-[0.98] transition-all cursor-pointer flex flex-col hover:shadow-md hover:border-red-100 relative overflow-hidden ${viewMode === 'grid' ? 'masonry-item' : ''}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${indicatorColorClass}`}></div>
      <div className="p-4 pl-6 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <h4 className={`font-bold text-gray-800 leading-snug whitespace-normal ${viewMode === 'list' ? 'text-base' : 'text-sm'}`}>{order.serviceName}</h4>
          <span className="text-xs text-gray-400 font-bold pl-2 flex-shrink-0">#{order.orderNumber}</span>
        </div>
        <div className={`space-y-1.5 mb-3 ${viewMode === 'list' ? 'text-sm' : 'text-xs'}`}>
          <div className="flex items-start gap-2.5"><Building2 size={14} className="text-blue-500 flex-shrink-0 mt-0.5" /><span className="font-semibold text-gray-700 whitespace-normal">{getClientName(order.clientId)}</span></div>
          <div className="flex items-start gap-2.5"><Cog size={14} className="text-gray-400 flex-shrink-0 mt-0.5" /><span className="font-semibold text-gray-700 whitespace-normal">{getEquipmentNames(order.equipmentIds)}</span></div>
        </div>
        
        <div className={`py-3 grid grid-cols-3 gap-2 ${viewMode === 'list' ? 'text-sm' : 'text-xs'} ${!isTechnician ? 'border-y border-gray-100' : ''}`}>
          {isClosed && startTime ? (
            <>
              <div className="flex items-center gap-1.5"><Calendar size={14} className="text-green-500" /><span className="font-semibold text-gray-600">{formatDate(startTime)}</span></div>
              <div className="flex items-center gap-1.5"><Clock size={14} className="text-red-500" /><span className="font-semibold text-gray-600 truncate">{formatTime(startTime)} - {endTime ? formatTime(endTime) : ''}</span></div>
              {warrantyInfo && <div className="flex items-center gap-1.5 justify-self-end"><ShieldCheck size={14} className={warrantyInfo.expired ? "text-gray-400" : "text-blue-500"} /><span className={`font-semibold truncate ${warrantyInfo.expired ? "text-gray-500" : "text-blue-600"}`}>{warrantyInfo.text}</span></div>}
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5"><Calendar size={14} className="text-green-500" /><span className="font-semibold text-gray-600">{isInProgress && startTime ? formatDate(startTime) : scheduledDate ? formatScheduledDate(scheduledDate) : 'N/A'}</span></div>
              <div className="flex items-center gap-1.5"><Clock size={14} className="text-red-500" /><span className="font-semibold text-gray-600 truncate">{isInProgress && startTime ? formatTime(startTime) : timeSlot || 'N/A'}</span></div>
              <div className="flex items-center gap-1.5 justify-self-end"><TriangleAlert size={14} className={currentPriorityStyle.icon} /><span className={`font-semibold capitalize ${currentPriorityStyle.text}`}>{priority}</span></div>
            </>
          )}
        </div>
        
        {!isTechnician && (
          <div className="flex items-center pt-3 mt-auto">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${getTechName(order.technicianId) === 'N/A' ? 'bg-gray-100 text-gray-400' : 'bg-red-50 text-red-800'} ${viewMode === 'list' ? 'text-sm' : 'text-xs'}`}>{getTechName(order.technicianId).substring(0,2)}</div>
              <div>
                <p className={`font-bold text-gray-800 ${viewMode === 'list' ? 'text-sm' : 'text-xs'}`}>{getTechName(order.technicianId)}</p>
                <p className={`text-gray-500 ${viewMode === 'list' ? 'text-xs' : 'text-[10px]'}`}>Técnico</p>
              </div>
            </div>
            <div className="flex-grow"></div>
            <ChevronRight size={18} className="text-gray-300" />
          </div>
        )}
      </div>
    </div>
  );
});

export default React.memo(OrderList);
