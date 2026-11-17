import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { OrderStatus, ServiceOrder, User } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { getWarrantyInfo } from '../../utils/warranty';
import { Search, Calendar, ChevronRight, Plus, Cog, LayoutGrid, LayoutList, Building2, Filter, HardHat, Clock, TriangleAlert, ShieldCheck } from 'lucide-react';
import PERMISSIONS, { hasPermission, ROLES } from '../../permissions';
import { usePaginatedCollection } from '../../hooks/usePaginatedCollection';
import { QueryFilter } from '../../hooks/useSupabaseQuery';

const LoadingSpinner: React.FC = () => (
  <div className="flex justify-center items-center">
    <div className="animate-spin rounded-full h-7 w-7 border-[3px] border-line-soft border-t-primary"></div>
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

  const filters = useMemo(() => {
    const q: QueryFilter[] = [];
    if (activeTab === 'Warranty') {
      q.push({ column: 'status', operator: 'eq', value: OrderStatus.CLOSED });
    } else if (activeTab !== 'All') {
      q.push({ column: 'status', operator: 'eq', value: activeTab });
    }
    if (currentUser && hasPermission(currentUser.role, PERMISSIONS.VIEW_ALL_ORDERS)) {
      if (filterTechId !== 'all') {
        q.push({ column: 'technician_id', operator: 'eq', value: filterTechId });
      }
    } else if (currentUser) {
      q.push({ column: 'technician_id', operator: 'eq', value: currentUser.id });
    }
    if (dateFilter !== 'all') {
      const today = new Date();
      const currentIsoDate = today.toISOString().split('T')[0];
      if (dateFilter === 'today') {
        q.push({ column: 'scheduled_date', operator: 'eq', value: currentIsoDate });
      } else if (dateFilter === 'month') {
        const startOfMonth = currentIsoDate.substring(0, 7) + '-01';
        const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const startOfNextMonth = nextMonth.toISOString().split('T')[0];
        q.push({ column: 'scheduled_date', operator: 'gte', value: startOfMonth });
        q.push({ column: 'scheduled_date', operator: 'lt', value: startOfNextMonth });
      } else if (dateFilter === 'week') {
        const d = new Date(today);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        q.push({ column: 'scheduled_date', operator: 'gte', value: monday.toISOString().split('T')[0] });
        q.push({ column: 'scheduled_date', operator: 'lte', value: sunday.toISOString().split('T')[0] });
      }
    }
    return q;
  }, [activeTab, filterTechId, dateFilter, currentUser]);

  const { data: orders, loading, loadingMore, hasMore, error, refresh, loadMore } = usePaginatedCollection<ServiceOrder>(
    'orders',
    { filters, orderBy: [{ column: 'priority', ascending: false }, { column: 'scheduled_date', ascending: false }] }
  );

  useEffect(() => { refresh(); }, [filters]);

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
        (o.orderNumber?.toString() || '').includes(q) ||
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
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm pt-4 pb-3 px-4 md:px-6 border-b border-line-soft">
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
              <Search className="text-ink-faint" size={17} />
            </div>
            <input type="text" placeholder="Buscar órdenes…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full h-11 bg-raised border border-line rounded-lg pl-10 pr-4 text-sm focus:outline-none" />
          </div>

          {hasPermission(currentUser?.role, PERMISSIONS.VIEW_ALL_ORDERS) && (
             <div className={`relative h-11 w-11 flex-shrink-0 border rounded-lg flex items-center justify-center transition-colors ${filterTechId !== 'all' ? 'bg-primary text-white border-primary' : 'bg-raised text-ink-faint border-line hover:text-ink-soft'}`} title="Filtrar por técnico">
               <HardHat size={18} />
               <select value={filterTechId} onChange={(e) => setFilterTechId(e.target.value)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                 <option value="all">Todos</option>
                 {users.filter(u => u.role !== ROLES.DEVELOPER).map(u => (<option key={u.id} value={u.id}>{u.name.split(' ')[0]}</option>))}
               </select>
             </div>
          )}

          <div className={`relative h-11 w-11 flex-shrink-0 border rounded-lg flex items-center justify-center transition-colors ${dateFilter !== 'all' ? 'bg-primary text-white border-primary' : 'bg-raised text-ink-faint border-line hover:text-ink-soft'}`} title="Filtrar por fecha">
            <Calendar size={18} />
            <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilterType)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
              <option value="all">Todas</option><option value="today">Hoy</option><option value="week">Semana</option><option value="month">Mes</option>
            </select>
          </div>
          <button onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')} title="Cambiar vista" className="h-11 w-11 flex-shrink-0 bg-raised border border-line rounded-lg text-ink-faint flex items-center justify-center hover:text-ink-soft hover:bg-sunken transition-colors">
            {viewMode === 'list' ? <LayoutGrid size={18} /> : <LayoutList size={18} />}
          </button>

          {hasPermission(currentUser?.role, PERMISSIONS.CREATE_ORDER) && (
            <button onClick={() => navigate('/orders/new')} className="h-11 px-4 bg-primary text-white rounded-lg flex items-center justify-center gap-2 font-semibold text-sm hover:bg-primary-dark transition-colors flex-shrink-0">
              <Plus size={17} /> <span className="hidden sm:inline">Nueva orden</span>
            </button>
          )}
        </div>

        <div className="flex gap-1 bg-sunken p-1 rounded-lg text-center border border-line-soft">
          {['All', OrderStatus.PENDING, OrderStatus.OPEN, OrderStatus.CLOSED, 'Warranty'].map((tab) => (
            <button key={tab} onClick={() => handleTabChange(tab as any)} className={`flex-1 py-1.5 px-2 text-[11px] font-semibold rounded-md transition-colors ${activeTab === tab ? 'bg-raised text-primary shadow-xs' : 'text-ink-faint hover:text-ink-soft'}`}>
              {tab === 'All' ? 'Todos' : tab === 'Warranty' ? 'Garantía' : tab === OrderStatus.OPEN ? 'En Progreso' : tab}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 md:px-6 pt-4 pb-24">
        {loading && finalOrders.length === 0 ? (
          <div className="pt-16"><LoadingSpinner /></div>
        ) : finalOrders.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 rounded-xl bg-sunken border border-line-soft flex items-center justify-center mx-auto mb-3">
              <Filter size={20} className="text-ink-faint"/>
            </div>
            <p className="font-semibold text-ink-soft text-sm">No se encontraron órdenes</p>
            <p className="text-[13px] text-ink-faint mt-0.5">Intenta cambiar los filtros.</p>
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
           <p className="text-center text-[13px] text-ink-faint py-6">Has llegado al final</p>
        )}
        {error && <p className="text-center text-sm text-red-600 py-6">Error al cargar los datos.</p>}
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

  const priorityStyles = { Urgente: { icon: 'text-red-500', text: 'text-red-600' }, Alta: { icon: 'text-orange-500', text: 'text-orange-600' }, Media: { icon: 'text-amber-500', text: 'text-amber-600' }, Baja: { icon: 'text-emerald-500', text: 'text-emerald-600' } };
  const currentPriorityStyle = priorityStyles[priority as keyof typeof priorityStyles] || { icon: 'text-ink-faint', text: 'text-ink-soft' };

  let indicatorColorClass = 'bg-line';
  if (warrantyInfo && !warrantyInfo.expired) indicatorColorClass = 'bg-violet-500';
  else if (status === OrderStatus.PENDING) indicatorColorClass = 'bg-orange-500';
  else if (status === OrderStatus.OPEN) indicatorColorClass = 'bg-blue-500';
  else if (status === OrderStatus.CLOSED) indicatorColorClass = 'bg-emerald-500';

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  const formatScheduledDate = (dateStr: string) => new Date(dateStr + 'T00:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

  return (
    <div onClick={() => navigate(`/orders/${order.id}`)} className={`card card-hover active:scale-[0.99] cursor-pointer flex flex-col relative overflow-hidden ${viewMode === 'grid' ? 'masonry-item' : ''}`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${indicatorColorClass}`}></div>
      <div className="p-4 pl-5 flex flex-col">
        <div className="flex justify-between items-start gap-2 mb-2.5">
          <h4 className={`font-semibold text-ink leading-snug whitespace-normal ${viewMode === 'list' ? 'text-[15px]' : 'text-sm'}`}>{order.serviceName}</h4>
          <span className="text-[11px] text-ink-faint font-semibold tabular-nums flex-shrink-0 mt-0.5">#{order.orderNumber}</span>
        </div>
        <div className={`space-y-1.5 mb-3 ${viewMode === 'list' ? 'text-[13px]' : 'text-xs'}`}>
          <div className="flex items-start gap-2"><Building2 size={14} className="text-ink-faint flex-shrink-0 mt-0.5" /><span className="font-medium text-ink-soft whitespace-normal">{getClientName(order.clientId)}</span></div>
          <div className="flex items-start gap-2"><Cog size={14} className="text-ink-faint flex-shrink-0 mt-0.5" /><span className="font-medium text-ink-soft whitespace-normal">{getEquipmentNames(order.equipmentIds)}</span></div>
        </div>

        <div className={`py-2.5 grid grid-cols-3 gap-2 ${viewMode === 'list' ? 'text-[13px]' : 'text-xs'} ${!isTechnician ? 'border-y border-line-soft' : 'border-t border-line-soft'}`}>
          {isClosed && startTime ? (
            <>
              <div className="flex items-center gap-1.5"><Calendar size={13} className="text-ink-faint shrink-0" /><span className="font-medium text-ink-soft">{formatDate(startTime)}</span></div>
              <div className="flex items-center gap-1.5"><Clock size={13} className="text-ink-faint shrink-0" /><span className="font-medium text-ink-soft truncate">{formatTime(startTime)} - {endTime ? formatTime(endTime) : ''}</span></div>
              {warrantyInfo && <div className="flex items-center gap-1.5 justify-self-end"><ShieldCheck size={13} className={`shrink-0 ${warrantyInfo.expired ? "text-ink-faint" : "text-violet-500"}`} /><span className={`font-medium truncate ${warrantyInfo.expired ? "text-ink-faint" : "text-violet-600"}`}>{warrantyInfo.text}</span></div>}
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5"><Calendar size={13} className="text-ink-faint shrink-0" /><span className="font-medium text-ink-soft">{isInProgress && startTime ? formatDate(startTime) : scheduledDate ? formatScheduledDate(scheduledDate) : 'N/A'}</span></div>
              <div className="flex items-center gap-1.5"><Clock size={13} className="text-ink-faint shrink-0" /><span className="font-medium text-ink-soft truncate">{isInProgress && startTime ? formatTime(startTime) : timeSlot || 'N/A'}</span></div>
              <div className="flex items-center gap-1.5 justify-self-end"><TriangleAlert size={13} className={`shrink-0 ${currentPriorityStyle.icon}`} /><span className={`font-medium capitalize ${currentPriorityStyle.text}`}>{priority}</span></div>
            </>
          )}
        </div>

        {!isTechnician && (
          <div className="flex items-center pt-2.5 mt-auto">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-semibold uppercase ${getTechName(order.technicianId) === 'N/A' ? 'bg-sunken text-ink-faint' : 'bg-primary/10 text-primary'} ${viewMode === 'list' ? 'text-[11px]' : 'text-[10px]'}`}>{getTechName(order.technicianId).substring(0,2)}</div>
              <div className="min-w-0">
                <p className={`font-medium text-ink truncate ${viewMode === 'list' ? 'text-[13px]' : 'text-xs'}`}>{getTechName(order.technicianId)}</p>
                <p className="text-ink-faint text-[10px]">Técnico</p>
              </div>
            </div>
            <div className="flex-grow"></div>
            <ChevronRight size={16} className="text-ink-faint shrink-0" />
          </div>
        )}
      </div>
    </div>
  );
});

export default React.memo(OrderList);