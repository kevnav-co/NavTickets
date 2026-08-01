
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { OrderStatus, ServiceOrder } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, User as UserIcon } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useCollection } from '../../hooks/useCollection';
import type { QueryFilter } from '../../hooks/useSupabaseQuery';

const getUserColor = (name: string, isPending: boolean) => {
  const n = name.toLowerCase();
  let baseColor = { bg: 'var(--color-primary)', border: 'var(--color-primary-dark)' };
  if (n.includes('yoel')) baseColor = { bg: '#1e40af', border: '#172554' };
  if (n.includes('gabriel')) baseColor = { bg: '#a16207', border: '#713f12' };
  if (n.includes('jose madera') || n.includes('josé madera')) baseColor = { bg: '#166534', border: '#14532d' };
  if (isPending) return { bg: `${baseColor.bg}15`, border: baseColor.bg, text: baseColor.bg };
  return { bg: baseColor.bg, border: baseColor.border, text: '#FFFFFF' };
};
const formatServiceName = (name: string) => name ? name.replace(/Mtto Preventivo( de)?/gi, 'MP -').replace(/Mtto Correctivo( de)?/gi, 'MC -') : '';
const formatMinutes = (totalMinutes: number) => `${Math.floor(totalMinutes / 60).toString().padStart(2, '0')}:${(totalMinutes % 60).toString().padStart(2, '0')}`;
const getDurationLabel = (mins: number) => { const h = mins / 60; return h >= 1 ? (h % 1 === 0 ? `${h}H` : `${h.toFixed(1)}H`) : `${mins}M`; };

const GlobalCalendar: React.FC = () => {
  const { users } = useData();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const rowHeight = 60;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [draftSlot, setDraftSlot] = useState<{ date: Date, hour: number, minute: number, dayIndex: number, durationMinutes: number } | null>(null);
  const [dragAction, setDragAction] = useState<'move' | 'resize-bottom' | null>(null);
  const dragStartY = useRef<number>(0);
  const initialStartMinutes = useRef<number>(0);
  const initialDuration = useRef<number>(0);
  const canViewAll = currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'supervisor';
  const [filterUserId, setFilterUserId] = useState<string>(() => !canViewAll && currentUser ? currentUser.id : 'all');
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  });

  const newOrderState = useMemo(() => {
    if (!draftSlot) return null;

    const slotStartDate = new Date(draftSlot.date);
    slotStartDate.setHours(draftSlot.hour, draftSlot.minute, 0, 0);

    const duration = formatMinutes(draftSlot.durationMinutes);
    const technicianId = (canViewAll && filterUserId !== 'all') ? filterUserId : '';
    
    return {
      date: slotStartDate.toISOString(),
      duration: duration,
      technicianId: technicianId
    };
  }, [draftSlot, canViewAll, filterUserId]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const weekDays = useMemo(() => {
    const days = [];
    const start = new Date(currentWeekStart);
    for (let i = 0; i < 6; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); }
    return days;
  }, [currentWeekStart]);

  const { pendingFilters, openFilters } = useMemo(() => {
    const p: QueryFilter[] = [];
    const o: QueryFilter[] = [];
    const startOfWeek = weekDays[0]?.toISOString().split('T')[0];
    const endOfWeek = weekDays[weekDays.length - 1]?.toISOString().split('T')[0];

    if (filterUserId !== 'all') {
      const userFilter: QueryFilter = { column: 'technician_id', operator: 'eq', value: filterUserId };
      p.push(userFilter);
      o.push(userFilter);
    }

    if (startOfWeek && endOfWeek) {
      p.push({ column: 'scheduled_date', operator: 'gte', value: startOfWeek });
      p.push({ column: 'scheduled_date', operator: 'lte', value: endOfWeek });
    }

    p.push({ column: 'status', operator: 'eq', value: OrderStatus.PENDING });
    o.push({ column: 'status', operator: 'eq', value: OrderStatus.OPEN });

    return { pendingFilters: p, openFilters: o };
  }, [weekDays, filterUserId]);

  const { data: pendingOrders, loading: loadingPending } = useCollection<ServiceOrder>('orders', { filters: pendingFilters });
  const { data: openOrders, loading: loadingOpen } = useCollection<ServiceOrder>('orders', { filters: openFilters });

  const combinedOrders = useMemo(() => [...pendingOrders, ...openOrders], [pendingOrders, openOrders]);

  const weeklyLayout = useMemo(() => {
    const weekData = weekDays.map(day => {
      const iso = day.toISOString().split('T')[0];
      const dayOrders = combinedOrders.filter(o => {
        const isScheduledToday = o.scheduledDate === iso;
        const isInProgressToday = o.status === OrderStatus.OPEN && o.startTime && o.startTime.startsWith(iso);
        return isScheduledToday || isInProgressToday;
      });

      const withMinutes = dayOrders.map(o => {
          const scheduledTimeParts = (o.timeSlot || '08:00').split(':').map(Number);
          let sh = scheduledTimeParts[0], sm = scheduledTimeParts[1]; if(isNaN(sh) || isNaN(sm)){ sh=8; sm=0; }
          const scheduledEndParts = (o.scheduledEndTime || `${sh + 1}:00`).split(':').map(Number);
          let eh = scheduledEndParts[0], em = scheduledEndParts[1]; if(isNaN(eh) || isNaN(em)){ eh=sh+1; em=0; }
          
          let startMin, endMin;

          if (o.status === OrderStatus.OPEN && o.startTime && o.startTime.startsWith(iso)) {
              const actualStartDate = new Date(o.startTime);
              const actualStartHour = actualStartDate.getHours();
              const actualStartMinute = actualStartDate.getMinutes();
              startMin = actualStartHour * 60 + actualStartMinute;
              endMin = startMin + 60; // Duración fija de 1 hora para órdenes en progreso
          } else {
              startMin = sh * 60 + sm;
              const scheduledDuration = (eh * 60 + em) - startMin;
              endMin = startMin + scheduledDuration;
          }
          return { ...o, startMin, endMin, sh, sm, eh, em };
      }).sort((a,b) => a.startMin - b.startMin);

      if (withMinutes.length === 0) return { events: [], dayMaxCols: 0.5 };

      const processGroup = (group: any[]) => {
          const columns: any[][] = [];
          group.forEach(order => {
              let placed = false;
              for (let i = 0; i < columns.length; i++) {
                  if (order.startMin >= columns[i][columns[i].length - 1].endMin) {
                      columns[i].push(order); placed = true; break;
                  }
              }
              if (!placed) columns.push([order]);
          });
          return columns.map((col, colIndex) => col.map(order => ({ ...order, colIndex, totalCols: columns.length }))).flat();
      };

      let allEventsWithLayout: any[] = [];
      let dayMaxCols = 1;
      let currentGroup: any[] = [];
      let groupEndTime = -1;
      withMinutes.forEach(order => {
          if (currentGroup.length > 0 && order.startMin >= groupEndTime) {
              const processed = processGroup(currentGroup);
              dayMaxCols = Math.max(dayMaxCols, processed[0]?.totalCols || 1);
              allEventsWithLayout.push(...processed);
              currentGroup = [order];
              groupEndTime = order.endMin;
          } else {
              currentGroup.push(order);
              groupEndTime = Math.max(groupEndTime, order.endMin);
          }
      });
      if (currentGroup.length > 0) {
          const processed = processGroup(currentGroup);
          dayMaxCols = Math.max(dayMaxCols, processed[0]?.totalCols || 1);
          allEventsWithLayout.push(...processed);
      }
      return { events: allEventsWithLayout, dayMaxCols };
    });
    const totalFr = weekData.reduce((sum, day) => sum + day.dayMaxCols, 0);
    const gridTemplateColumns = `60px ${weekData.map(d => `${d.dayMaxCols}fr`).join(' ')}`;
    return { weekData, gridTemplateColumns, totalFr };
  }, [combinedOrders, weekDays]);

  const getTechName = useCallback((id: string) => users.find(u => u.id === id)?.name?.split(' ')[0] || 'N/A', [users]);
  const filteredUsersForSelect = useMemo(() => users.filter(u => u.role !== 'developer'), [users]);

    useEffect(() => {
    if (scrollContainerRef.current) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dayIndex = weekDays.findIndex(d => d.toDateString() === today.toDateString());
      
      if (dayIndex !== -1) {
        setTimeout(() => {
            const container = scrollContainerRef.current;
            if (!container) return;

            const timeColWidth = 60;
            const contentWidth = container.scrollWidth - timeColWidth;
            if (contentWidth <= container.clientWidth) return; 

            const totalFr = weeklyLayout.totalFr;
            if (totalFr === 0) return;

            const frWidth = contentWidth / totalFr;
            const frsBefore = weeklyLayout.weekData.slice(0, dayIndex).reduce((sum, day) => sum + day.dayMaxCols, 0);
            const currentDayFr = weeklyLayout.weekData[dayIndex].dayMaxCols;

            const dayStartPos = timeColWidth + (frsBefore * frWidth);
            const dayWidth = currentDayFr * frWidth;
            
            const scrollLeft = dayStartPos + (dayWidth / 2) - (container.clientWidth / 2);

            container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }, 200);
      }
    }
  }, [currentWeekStart, weeklyLayout, weekDays]);

  const hours = Array.from({ length: 13 }, (_, i) => 6 + i); // Horas de 6:00 a 18:00

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, action: 'move' | 'resize-bottom') => {
    e.stopPropagation(); if (!draftSlot) return;
    setDragAction(action);
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartY.current = clientY;
    initialStartMinutes.current = (draftSlot.hour * 60) + draftSlot.minute;
    initialDuration.current = draftSlot.durationMinutes;
  };
  
  useEffect(() => {
    const handleDragMove = (e: MouseEvent | TouchEvent) => {
      if (!dragAction || !draftSlot) return;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaY = clientY - dragStartY.current;
      const minutesPerPixel = 60 / rowHeight;
      const snappedMinutesMoved = Math.round(deltaY * minutesPerPixel / 15) * 15;
      
      if (dragAction === 'move') {
        let newStart = Math.max(6*60, initialStartMinutes.current + snappedMinutesMoved);
        if (newStart + initialDuration.current > 19 * 60) { newStart = (19 * 60) - initialDuration.current; }
        setDraftSlot(prev => prev ? { ...prev, hour: Math.floor(newStart/60), minute: newStart%60 } : null);
      } else if (dragAction === 'resize-bottom') {
        let newDuration = Math.max(15, initialDuration.current + snappedMinutesMoved);
        if (initialStartMinutes.current + newDuration > 19 * 60) { newDuration = (19*60) - initialStartMinutes.current; }
        setDraftSlot(prev => prev ? { ...prev, durationMinutes: newDuration } : null);
      }
    };
    const handleDragEnd = () => setDragAction(null);
    if (dragAction) {
      window.addEventListener('mousemove', handleDragMove); window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove); window.addEventListener('touchend', handleDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleDragMove); window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove); window.removeEventListener('touchend', handleDragEnd);
    };
  }, [dragAction, draftSlot, rowHeight]);

  if (loadingPending || loadingOpen && combinedOrders.length === 0) {
    return <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[80vh]"></div>;
  }
  
  const eventColumnMaxWidth = 288;
  const gridMaxWidth = weeklyLayout.totalFr * eventColumnMaxWidth + 60;

  return (
    <div className="relative z-10 bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
      <header className="p-5 flex items-center justify-between border-b border-gray-50 flex-wrap gap-y-3">
         <div className="flex items-center gap-3">
           <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-primary"><CalendarDays size={22} /></div>
           <div>
             <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Agenda Semanal</h3>
             {canViewAll && (
                <div className="relative mt-1">
                  <select value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)} className="bg-gray-50 text-[9px] font-black text-gray-500 uppercase rounded-lg px-2 py-1 focus:outline-none cursor-pointer border border-gray-100">
                    <option value="all">Todos</option>
                    {filteredUsersForSelect.map(u => (<option key={u.id} value={u.id}>{(u.name || 'Sin Nombre').split(' ')[0]}</option>))}
                  </select>
                </div>
              )}
           </div>
         </div>
         <div className="flex items-center gap-2">
            <button onClick={() => { const d = new Date(currentWeekStart); d.setDate(d.getDate() - 7); setCurrentWeekStart(d); }} className="p-2 hover:bg-gray-50 rounded-full"><ChevronLeft size={20} /></button>
            <button onClick={() => { const d = new Date(currentWeekStart); d.setDate(d.getDate() + 7); setCurrentWeekStart(d); }} className="p-2 hover:bg-gray-50 rounded-full"><ChevronRight size={20} /></button>
         </div>
      </header>
      <div ref={scrollContainerRef} className="overflow-x-auto relative">
        <div className="min-w-[140vw] lg:min-w-[1200px]" style={{ maxWidth: `${gridMaxWidth}px` }}>
           <div className="grid sticky top-0 bg-white z-30 border-b border-gray-300" style={{gridTemplateColumns: weeklyLayout.gridTemplateColumns}}>
              <div className="h-12 bg-white sticky left-0 z-40 border-r border-gray-300"></div>
              {weekDays.map((d, i) => (
                <div key={i} className="flex flex-col items-center justify-center py-2 border-r border-gray-200">
                  <span className="text-[8px] font-black uppercase text-gray-400">{d.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
                  <span className="text-sm font-black text-gray-800">{d.getDate()}</span>
                </div>
              ))}
           </div>
           <div className="relative">
              {(() => {
                const currentDayIndex = weekDays.findIndex(d => d.toDateString() === currentTime.toDateString());
                if (currentDayIndex === -1) return null;
                const h = currentTime.getHours();
                const m = currentTime.getMinutes();
                if (h < 6 || h >= 19) return null;
                const topPos = ((h - 6) * rowHeight) + m * (rowHeight / 60);

                const frsBefore = weeklyLayout.weekData.slice(0, currentDayIndex).reduce((sum, day) => sum + day.dayMaxCols, 0);
                const currentDayFr = weeklyLayout.weekData[currentDayIndex].dayMaxCols;
                const totalFr = weeklyLayout.totalFr;

                return (
                  <div className="absolute h-[2px] bg-red-500/80 pointer-events-none z-40 flex items-center" style={{ top: `${topPos}px`, left: `calc(60px + (100% - 60px) * ${frsBefore} / ${totalFr})`, width: `calc((100% - 60px) * ${currentDayFr} / ${totalFr})` }}>
                      <div className="w-2 h-2 bg-red-500 rounded-full -ml-1"></div>
                  </div>
                );
              })()}

              {hours.map(h => (
                <div key={h} className="grid h-[60px] border-b border-gray-300 group" style={{gridTemplateColumns: weeklyLayout.gridTemplateColumns}}>
                  <div className="text-[11px] text-gray-900 font-bold flex items-start justify-center pt-1 border-r border-gray-300 sticky left-0 bg-white z-30 shadow-[2px_0_4px_rgba(0,0,0,0.02)]">{h.toString().padStart(2, '0')}:00</div>
                    {weeklyLayout.weekData.map((_day, dayIndex) => {
                      const slotDate = new Date(weekDays[dayIndex]);
                      slotDate.setHours(h, 0, 0, 0);
                      const isPastSlot = slotDate < new Date(currentTime.getTime() - (60 * 60 * 1000));
                      const isLunch = h >= 12 && h < 14;
                      const isEarly = h < 8;
                      const isNight = h >= 18;
                      const isSaturdayAfternoon = dayIndex === 5 && h >= 14;
                      const isGraySlot = isPastSlot || isLunch || isEarly || isNight || isSaturdayAfternoon;
                      
                      return (
                        <div key={dayIndex} className={`border-r border-gray-200 last:border-0 relative h-full flex flex-col ${isGraySlot ? 'bg-gray-200/40' : 'bg-white'}`}>
                          {[0, 15, 30, 45].map(m => {
                              const canClick = (currentUser?.role === 'admin' || currentUser?.role === 'developer' || currentUser?.role === 'supervisor') && !isPastSlot;
                              return (
                                <div key={m} 
                                  className={`flex-1 border-b border-dashed border-gray-100 last:border-b-0 ${canClick ? 'hover:bg-red-500/10 cursor-pointer' : ''}`}
                                  onClick={() => canClick && setDraftSlot({ date: weekDays[dayIndex], hour: h, minute: m, dayIndex, durationMinutes: 60 })} />
                              )
                          })}
                        </div>
                      )
                    })}
                </div>
              ))}

              {draftSlot && newOrderState && (
                 <div className="absolute bg-primary/10 border-l-[4px] border-primary rounded-r-lg shadow-xl z-30 flex flex-col justify-center box-border px-1 select-none" 
                    style={{ top: `${((draftSlot.hour - 6) * rowHeight) + draftSlot.minute * (rowHeight/60)}px`, height: `${draftSlot.durationMinutes * (rowHeight / 60)}px`, left: `calc(60px + (100% - 60px) * ${weeklyLayout.weekData.slice(0, draftSlot.dayIndex).reduce((p, c) => p + c.dayMaxCols, 0)} / ${weeklyLayout.totalFr})`, width: `calc((100% - 60px) * ${weeklyLayout.weekData[draftSlot.dayIndex].dayMaxCols} / ${weeklyLayout.totalFr})`}}
                    onMouseDown={(e) => handleDragStart(e, 'move')} onTouchStart={(e) => handleDragStart(e, 'move')}>
                    <div className="flex flex-col items-center justify-center pointer-events-none text-center">
                        <span className="text-[7px] font-black text-primary uppercase leading-none opacity-70">Nueva Orden</span>
                        <span className="text-[9px] font-black text-gray-800 mt-1">{formatMinutes(draftSlot.hour * 60 + draftSlot.minute)} - {formatMinutes((draftSlot.hour * 60 + draftSlot.minute) + draftSlot.durationMinutes)}</span>
                        <span className="text-[8px] font-black text-primary mt-0.5 bg-primary/10 px-1.5 py-0.5 rounded">{getDurationLabel(draftSlot.durationMinutes)}</span>
                    </div>
                    <div className="absolute right-1 top-1/2 -translate-y-1/2">
                      <Link 
                        to="/orders/new" 
                        state={newOrderState}
                        className="bg-primary text-white w-6 h-6 rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform"
                      >
                        <Plus size={14} strokeWidth={3} />
                      </Link>
                    </div>
                    <div className="w-full h-3 absolute bottom-0 cursor-ns-resize flex items-end justify-center pb-0.5" onMouseDown={(e)=>handleDragStart(e,'resize-bottom')} onTouchStart={(e)=>handleDragStart(e,'resize-bottom')}><div className="w-6 h-1 bg-primary/30 rounded-full"></div></div>
                 </div>
              )}
              {weeklyLayout.weekData.map((dayLayout, dayIndex) => (
                <div key={dayIndex} className="absolute top-0 h-full pointer-events-none" style={{left: `calc(60px + (100% - 60px) * ${weeklyLayout.weekData.slice(0, dayIndex).reduce((p, c) => p + c.dayMaxCols, 0)} / ${weeklyLayout.totalFr})`, width: `calc((100% - 60px) * ${dayLayout.dayMaxCols} / ${weeklyLayout.totalFr})`}}>
                  {dayLayout.events.map((o) => {
                      const pixelsPerMinute = rowHeight / 60;
                      const topPx = (o.startMin - 6 * 60) * pixelsPerMinute;
                      const heightPx = Math.max(30, (o.endMin - o.startMin) * pixelsPerMinute);
                      const userColors = getUserColor(users?.find(u => u.id === o.technicianId)?.name || '', o.status === OrderStatus.PENDING);
                      const displayTime = o.status === OrderStatus.OPEN && o.startTime 
                        ? new Date(o.startTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
                        : o.timeSlot;

                      return (
                        <div key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="absolute z-20 rounded-lg border-l-4 px-2 py-1 shadow-sm cursor-pointer overflow-hidden box-border pointer-events-auto" 
                             style={{ top: `${topPx}px`, height: `${heightPx}px`, left: `calc(100% / ${o.totalCols} * ${o.colIndex})`, width: `calc(100% / ${o.totalCols} - 2px)`, backgroundColor: userColors.bg, borderColor: userColors.border, color: userColors.text }}>
                            <div className="flex flex-col h-full overflow-hidden">
                                <span className="text-[9px] font-black uppercase opacity-80">{displayTime}</span>
                                <p className="font-bold text-[9px] leading-tight line-clamp-2">{formatServiceName(o.serviceName)}</p>
                                <div className="mt-auto flex items-center gap-1 text-[7px] font-medium uppercase opacity-70">
                                    <UserIcon size={7} /> {getTechName(o.technicianId)}
                                </div>
                            </div>
                        </div>
                      );
                  })}
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalCalendar;
