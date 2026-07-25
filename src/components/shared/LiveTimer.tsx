import React, { useState, useEffect } from 'react';
import { ServiceOrder, OrderStatus } from '../../types';
import { format } from 'date-fns';

interface LiveTimerProps {
  order: ServiceOrder;
  isWarranty?: boolean;
}

const LiveTimer: React.FC<LiveTimerProps> = ({ order, isWarranty }) => {
  const relevantStartTime = isWarranty ? order.warrantyStartTime : order.startTime;
  const { status } = order;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!relevantStartTime || status !== OrderStatus.OPEN) {
      setElapsed(0);
      return;
    }

    const calculateElapsed = () => {
      const start = new Date(relevantStartTime).getTime();
      const now = new Date().getTime();
      setElapsed(Math.max(0, now - start));
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 1000);

    return () => clearInterval(interval);
  }, [relevantStartTime, status]);

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };
  
  const getDurationText = () => {
      if (isWarranty) return '01:00'; // Default warranty duration
      
      const { scheduledDate, timeSlot, scheduledEndTime } = order;
      if (!scheduledDate || !timeSlot || !scheduledEndTime) return '--:--';

      // Validate time format HH:mm
      const timeRegex = /^\d{2}:\d{2}$/;
      if (!timeRegex.test(timeSlot) || !timeRegex.test(scheduledEndTime)) {
        return '--:--';
      }

      try {
        const start = new Date(`${scheduledDate}T${timeSlot}`);
        const end = new Date(`${scheduledDate}T${scheduledEndTime}`);
        const diffMs = end.getTime() - start.getTime();
        
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || diffMs <= 0) return '--:--';

        const totalMinutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      } catch (e) {
        return '--:--';
      }
  }

  const getEstimatedEndTime = () => {
    if (isWarranty) {
        if (order.warrantyEndTime) {
            try {
                // Assuming warrantyEndTime is a full ISO string
                return format(new Date(order.warrantyEndTime), 'HH:mm');
            } catch (e) {
                return '--:--';
            }
        }
        return '--:--';
    }

    const { scheduledDate, scheduledEndTime } = order;
    if (!scheduledDate || !scheduledEndTime) {
        return '--:--';
    }
    
    // Validate time format HH:mm
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(scheduledEndTime)) {
      return '--:--';
    }

    try {
        const dateTimeString = `${scheduledDate}T${scheduledEndTime}`;
        const date = new Date(dateTimeString);
        if (isNaN(date.getTime())) return '--:--';
        return format(date, 'HH:mm');
    } catch (e) {
        return '--:--';
    }
  };

  return (
    <div className="w-full">
      <div className="text-center mb-3">
        <p className={`text-4xl font-mono font-black ${isWarranty ? 'text-blue-600' : 'text-[#7b1113]'} tracking-tighter`}>
          {formatDuration(elapsed)}
        </p>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tiempo Transcurrido</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs px-2 py-3 bg-gray-50 rounded-2xl border-t border-gray-100">
        <div>
          <p className="font-black text-gray-800">{(relevantStartTime && format(new Date(relevantStartTime), 'HH:mm')) || '--:--'}</p>
          <p className="text-[8px] font-bold text-gray-400 uppercase">Inicio Real</p>
        </div>
        <div>
          <p className="font-black text-gray-800">{getDurationText()}</p>
          <p className="text-[8px] font-bold text-gray-400 uppercase">Duración</p>
        </div>
        <div>
          <p className="font-black text-gray-800">{getEstimatedEndTime()}</p>
          <p className="text-[8px] font-bold text-gray-400 uppercase">Fin Previsto</p>
        </div>
      </div>
    </div>
  );
};

export default LiveTimer;