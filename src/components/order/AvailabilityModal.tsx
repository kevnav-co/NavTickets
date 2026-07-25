import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ServiceOrder, OrderStatus, User } from '../../types';
import { ChevronLeft, ChevronRight, Check, HardHat, X } from 'lucide-react';

const getUserColor = (name: string, isPending: boolean) => {
  const n = name.toLowerCase();
  let baseColor = { bg: '#7b1113', border: '#5a0c0e' };

  if (n.includes('gerardo navas')) baseColor = { bg: '#7b1113', border: '#5a0c0e' };
  else if (n.includes('yoel')) baseColor = { bg: '#1e40af', border: '#172554' };
  else if (n.includes('gabriel')) baseColor = { bg: '#a16207', border: '#713f12' };
  else if (n.includes('jose madera') || n.includes('josé madera')) baseColor = { bg: '#166534', border: '#14532d' };

  if (isPending) {
    return { bg: `${baseColor.bg}15`, border: baseColor.bg, text: baseColor.bg };
  }
  return { bg: baseColor.bg, border: baseColor.border, text: '#FFFFFF' };
};

interface AvailabilityModalProps {
  technician: User;
  orders: ServiceOrder[];
  onClose: () => void;
  onApplyTime: (date: string, time: string, duration: string) => void;
  initialDate: string;
}

const AvailabilityModal: React.FC<AvailabilityModalProps> = ({ technician, orders, onClose, onApplyTime, initialDate }) => {
  const rowHeight = 60;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [draftSlot, setDraftSlot] = useState<{ date: Date, hour: number, minute: number, dayIndex: number, durationMinutes: number } | null>(null);
  const [dragAction, setDragAction] = useState<'move' | 'resize-bottom' | null>(null);
  const dragStartY = useRef<number>(0);
  const initialStartMinutes = useRef<number>(0);
  const initialDuration = useRef<number>(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollContainerRef.current) {
      const currentHour = new Date().getHours();
      const targetHour = Math.max(6, currentHour - 1);
      const topPosition = (targetHour - 6) * rowHeight;
      
      setTimeout(() => {
        scrollContainerRef.current?.scrollTo({
          top: topPosition,
          behavior: 'smooth',
        });
      }, 150);
    }
  }, []);

  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const d = new Date(initialDate + 'T12:00:00');
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  });

  const weekDays = useMemo(() => {
    const days = [];
    const start = new Date(currentWeekStart);
    for (let i = 0; i < 6; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentWeekStart]);

  const hours = Array.from({ length: 17 }, (_, i) => 6 + i);

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, action: 'move' | 'resize-bottom') => {
    e.stopPropagation();
    if (!draftSlot) return;
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
      const snappedMinutesMoved = Math.round(deltaY / 15) * 15;
      
      if (dragAction === 'move') {
        let newStartTotalMinutes = initialStartMinutes.current + snappedMinutesMoved;
        newStartTotalMinutes = Math.max(6 * 60, Math.min(newStartTotalMinutes, (23 * 60) - draftSlot.durationMinutes));
        setDraftSlot(prev => prev ? { ...prev, hour: Math.floor(newStartTotalMinutes / 60), minute: newStartTotalMinutes % 60 } : null);
      } else if (dragAction === 'resize-bottom') {
        let newDuration = Math.max(15, initialDuration.current + snappedMinutesMoved);
        setDraftSlot(prev => prev ? { ...prev, durationMinutes: newDuration } : null);
      }
    };
    
    const handleDragEnd = () => setDragAction(null);
    
    if (dragAction) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDragMove);
      window.addEventListener('touchend', handleDragEnd);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDragMove);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [dragAction, draftSlot]);

  const getDayOrders = (d: Date) => {
    const iso = d.toISOString().split('T')[0];
    const dayOrders = orders.filter(o => o.technicianId === technician.id && o.scheduledDate === iso && o.status !== OrderStatus.CLOSED);
    
    const withMinutes = dayOrders.map(o => {
      const [sh, sm] = (o.timeSlot || "08:00").split(':').map(Number);
      const [eh, em] = (o.scheduledEndTime || `${sh + 1}:00`).split(':').map(Number);
      return { ...o, startMin: sh * 60 + sm, endMin: eh * 60 + em, sh, sm, eh, em };
    }).sort((a,b) => a.startMin - b.startMin);
    
    const columns: any[][] = [];
    withMinutes.forEach(order => {
      let placed = false;
      for (let i = 0; i < columns.length; i++) {
        const lastInCol = columns[i][columns[i].length - 1];
        if (order.startMin >= lastInCol.endMin) { columns[i].push(order); placed = true; break; }
      }
      if (!placed) columns.push([order]);
    });

    const finalOrders: any[] = [];
    columns.forEach((col, colIndex) => { col.forEach(order => { finalOrders.push({ ...order, colIndex, totalCols: columns.length }); }); });
    return finalOrders;
  };

  const formatMinutes = (totalMinutes: number) => {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const getDurationLabel = (mins: number) => {
    const h = mins / 60;
    if (h >= 1) { return h % 1 === 0 ? `${h}H` : `${h.toFixed(1)}H`; }
    return `${mins}M`;
  };
  
  const currentDayIndex = useMemo(() => {
    return weekDays.findIndex(d => d.toDateString() === currentTime.toDateString());
  }, [weekDays, currentTime]);
  
  // --- FUNCIÓN DE DEBUG PARA EL BOTÓN DE CHECK ---
  const handleCheckClick = () => {
    console.log('[DEBUG] Check icon clicked in AvailabilityModal.');
    if (!draftSlot) {
      console.error('[DEBUG] DraftSlot is null. Cannot apply time.');
      return;
    }
    const date = draftSlot.date.toISOString().split('T')[0];
    const time = formatMinutes(draftSlot.hour * 60 + draftSlot.minute);
    const duration = formatMinutes(draftSlot.durationMinutes);

    console.log('[DEBUG] Calling onApplyTime with:', { date, time, duration });
    onApplyTime(date, time, duration);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white h-full max-h-[90vh] w-full max-w-4xl rounded-3xl shadow-2xl border border-gray-100 flex flex-col">
        <header className="p-4 flex items-center justify-between border-b border-gray-100 flex-wrap gap-y-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500"><HardHat size={22} /></div>
            <div>
              <p className="text-sm font-black text-gray-900 uppercase tracking-tight">Agenda de {technician.name.split(' ')[0]}</p>
              <p className="text-[10px] font-bold text-gray-400 capitalize">{currentWeekStart.toLocaleString('es-ES', { month: 'long' })} {currentWeekStart.getFullYear()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { const d = new Date(currentWeekStart); d.setDate(d.getDate() - 7); setCurrentWeekStart(d); }} className="p-2 hover:bg-gray-100 rounded-full"><ChevronLeft size={20} /></button>
            <button onClick={() => { const d = new Date(currentWeekStart); d.setDate(d.getDate() + 7); setCurrentWeekStart(d); }} className="p-2 hover:bg-gray-100 rounded-full"><ChevronRight size={20} /></button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full ml-4"><X size={20} /></button>
          </div>
        </header>

        <div ref={scrollContainerRef} className="overflow-auto relative flex-1">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-[60px_repeat(6,1fr)] sticky top-0 bg-white z-30 border-b border-gray-200">
              <div className="h-12 bg-white sticky left-0 z-40 border-r border-gray-200"></div>
              {weekDays.map((d, i) => (
                <div key={i} className={`flex flex-col items-center justify-center py-2 border-r border-gray-100 ${i === currentDayIndex ? 'bg-red-50' : ''}`}>
                  <span className="text-[8px] font-black uppercase text-gray-400">{d.toLocaleDateString('es-ES', { weekday: 'short' })}</span>
                  <span className={`text-sm font-black ${i === currentDayIndex ? 'text-[#7b1113]' : 'text-gray-800'}`}>{d.getDate()}</span>
                </div>
              ))}
            </div>
            <div className="relative">
                {currentDayIndex !== -1 && (
                  <div
                      className="absolute h-full bg-red-500/5 pointer-events-none z-0"
                      style={{
                          left: `calc(60px + ((100% - 60px) / 6 * ${currentDayIndex}))`,
                          width: `calc((100% - 60px) / 6)`
                      }}
                  />
                )}
                {(() => {
                  const h = currentTime.getHours();
                  const m = currentTime.getMinutes();
                  if (h >= 6 && h <= 22 && currentDayIndex !== -1) {
                    const topPos = ((h - 6) * rowHeight) + m;
                    return (
                      <div className="absolute h-[2px] bg-red-500 shadow-sm opacity-60 pointer-events-none z-40" style={{ top: `${topPos}px`, left: `calc(60px + ((100% - 60px) / 6 * ${currentDayIndex}))`, width: `calc((100% - 60px) / 6)` }} />
                    );
                  }
                  return null;
                })()}

              {hours.map(h => {
                  const isLunch = h >= 12 && h < 14;
                  return (
                  <div key={h} className="grid grid-cols-[60px_repeat(6,1fr)] h-[60px] border-b border-gray-200/70 group">
                    <div className="text-[10px] text-gray-500 font-bold flex items-start justify-center pt-1 border-r border-gray-200/70 sticky left-0 bg-white z-20 shadow-[2px_0_4px_rgba(0,0,0,0.01)]">{h.toString().padStart(2, '0')}:00</div>
                    {Array.from({ length: 6 }).map((_, i) => {
                      const isPastSlot = (() => {
                        const slotDate = new Date(weekDays[i]);
                        slotDate.setHours(h, 0, 0, 0);
                        return slotDate < new Date(new Date().setDate(new Date().getDate() -1));
                      })();
                      const isSaturdayAfternoon = i === 5 && h >= 14;
                      const isGraySlot = isPastSlot || isLunch || isSaturdayAfternoon;
                      return (
                        <div key={i} className={`border-r border-gray-100 last:border-0 relative h-full flex flex-col ${isGraySlot ? 'bg-gray-100/50' : 'bg-white hover:bg-red-50/50'}`}>
                          {[0, 15, 30, 45].map((m) => (<div key={m} className="flex-1 border-b border-dashed border-gray-100 last:border-b-0" onClick={() => !isGraySlot && setDraftSlot({ date: weekDays[i], hour: h, minute: m, dayIndex: i, durationMinutes: 60 })}></div>))}
                        </div>
                      );
                    })}
                  </div>
                )}
              )}
              
              {draftSlot && (
                 <div className="absolute bg-red-500/10 border-l-[4px] border-red-500 rounded-r-lg shadow-xl z-30 flex flex-col justify-center box-border px-1 select-none" style={{ top: `${((draftSlot.hour - 6) * rowHeight) + draftSlot.minute}px`, left: `calc(60px + ((100% - 60px) / 6 * ${draftSlot.dayIndex}))`, width: `calc((100% - 60px) / 6)`, height: `${draftSlot.durationMinutes}px` }} onMouseDown={(e) => handleDragStart(e, 'move')} onTouchStart={(e) => handleDragStart(e, 'move')}>
                    <div className="flex flex-col items-center justify-center pointer-events-none text-center">
                        <span className="text-[9px] font-black text-gray-800">
                          {formatMinutes(draftSlot.hour * 60 + draftSlot.minute)} - {formatMinutes((draftSlot.hour * 60 + draftSlot.minute) + draftSlot.durationMinutes)}
                        </span>
                        <span className="text-[8px] font-black text-red-600 mt-0.5 bg-red-500/10 px-1.5 py-0.5 rounded">
                          {getDurationLabel(draftSlot.durationMinutes)}
                        </span>
                    </div>
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {/* --- BOTÓN DE CHECK MODIFICADO --- */}
                      <button onClick={handleCheckClick} className="bg-red-600 text-white w-7 h-7 rounded-full flex items-center justify-center shadow-md hover:scale-110 transition-transform"><Check size={16} strokeWidth={3} /></button>
                    </div>
                    <div className="w-full h-3 absolute bottom-0 cursor-ns-resize flex items-end justify-center pb-0.5" onMouseDown={(e)=>handleDragStart(e,'resize-bottom')} onTouchStart={(e)=>handleDragStart(e,'resize-bottom')}><div className="w-6 h-1 bg-red-500/30 rounded-full"></div></div>
                 </div>
              )}

              {weekDays.map((d, dayIndex) => {
                 const dayOrders = getDayOrders(d);
                 return dayOrders.map((o) => {
                    const topPx = (o.sh - 6) * rowHeight + o.sm; 
                    const heightPx = ((o.eh * 60 + o.em) - (o.sh * 60 + o.sm));
                    const userColors = getUserColor(technician.name, o.status === OrderStatus.PENDING);
                    return (
                       <div key={o.id} className="absolute z-20 rounded-lg border-l-4 px-2 py-1 shadow-sm cursor-pointer overflow-hidden box-border" style={{ top: `${topPx}px`, left: `calc(60px + ((100% - 60px) / 6 * ${dayIndex}) + ((100% - 60px) / 6 * ${o.colIndex / o.totalCols}))`, width: `calc(((100% - 60px) / 6) / ${o.totalCols} - 2px)`, height: `${Math.max(heightPx, 30)}px`, backgroundColor: userColors.bg, borderColor: userColors.border, color: userColors.text }}>
                           <p className="font-bold text-[9px] leading-tight line-clamp-2">{o.serviceName}</p>
                           <div className="mt-auto flex items-center gap-1 text-[7px] font-medium uppercase opacity-70">{o.timeSlot}</div>
                       </div>
                    );
                 });
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AvailabilityModal;