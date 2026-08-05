import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getStartOfWeek, getEndOfWeek } from './Accounting'; // Reuse date helpers

interface WeeklyChartProps {
  currentUserMovements: any[];
  currentDate: Date;
  currentUserId: string | undefined;
  loading: boolean;
}

export const WeeklyChart: React.FC<WeeklyChartProps> = ({
  currentUserMovements,
  currentDate,
  currentUserId,
  loading
}) => {
  const chartData = useMemo(() => {
    const startOfWeek = getStartOfWeek(currentDate);
    const endOfWeek = getEndOfWeek(currentDate);
    const weekMovements = currentUserMovements.filter(mov => {
        const movDate = new Date(mov.createdAt);
        return movDate >= startOfWeek && movDate <= endOfWeek;
    });
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const data = days.map(name => ({ name, Ingresos: 0, Egresos: 0 }));
    weekMovements.forEach(mov => {
        const dayIndex = new Date(mov.createdAt).getDay();
        const amount = mov.amount;
        switch(mov.movementType) {
            case 'income': data[dayIndex].Ingresos += amount; break;
            case 'expense': data[dayIndex].Egresos += amount; break;
            case 'transaction':
                 if (mov.transactionGroupId) {
                    if(mov.concept.startsWith('Mov. desde')) {
                        data[dayIndex].Ingresos += amount;
                    } else {
                        data[dayIndex].Egresos += amount;
                    }
                 } else if (mov.recipientId === currentUserId) {
                    data[dayIndex].Ingresos += amount;
                 } else if (mov.senderId === currentUserId) {
                    data[dayIndex].Egresos += amount;
                 }
                 break;
        }
    });
    return data;
  }, [currentUserMovements, currentDate, currentUserId]);

  if (loading) {
    return <div className="h-20 flex items-center justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-700" /></div>;
  }

  return (
    <div style={{ width: '100%', height: 200 }}>
      <ResponsiveContainer>
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: -5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => `${Number(value) / 1000}k`} />
          <Tooltip
            wrapperStyle={{ fontSize: '12px' }}
            formatter={(value: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value)}
          />
          <Legend wrapperStyle={{ fontSize: '10px' }} iconSize={10} />
          <Bar dataKey="Ingresos" fill="#22c55e" radius={[2, 2, 0, 0]} />
          <Bar dataKey="Egresos" fill="#ef4444" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};