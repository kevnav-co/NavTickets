import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Movement } from '../../types/accounting';
import { formatCOP, getEndOfWeek, getStartOfWeek, signedAmount } from '../../utils/accounting';

interface WeeklyChartProps {
  movements: Movement[];
  currentDate: Date;
  userId: string;
  loading: boolean;
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export const WeeklyChart: React.FC<WeeklyChartProps> = ({ movements, currentDate, userId, loading }) => {
  const chartData = useMemo(() => {
    const start = getStartOfWeek(currentDate).getTime();
    const end = getEndOfWeek(currentDate).getTime();
    const data = DAYS.map(name => ({ name, Ingresos: 0, Egresos: 0 }));
    for (const mov of movements) {
      if (mov.createdAt < start || mov.createdAt > end) continue;
      const delta = signedAmount(mov, userId);
      const day = data[new Date(mov.createdAt).getDay()];
      if (delta > 0) day.Ingresos += delta;
      else day.Egresos -= delta;
    }
    return data;
  }, [movements, currentDate, userId]);

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
          <Tooltip wrapperStyle={{ fontSize: '12px' }} formatter={(value: number) => formatCOP(value)} />
          <Legend wrapperStyle={{ fontSize: '10px' }} iconSize={10} />
          <Bar dataKey="Ingresos" fill="#22c55e" radius={[2, 2, 0, 0]} />
          <Bar dataKey="Egresos" fill="#ef4444" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default WeeklyChart;
