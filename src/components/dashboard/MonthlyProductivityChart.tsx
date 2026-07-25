
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LabelList, Tooltip } from 'recharts';
import { ServiceOrder, OrderStatus, User } from '../../types';
import { ROLES } from '../../permissions';

const CustomTick = (props: any) => {
  const { x, y, payload } = props;
  const monthName = payload.value || 'MES ?';
  
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fill="#4B5563" fontSize={10} fontWeight="900" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {monthName}
      </text>
    </g>
  );
};

interface MonthlyProductivityChartProps {
  orders: ServiceOrder[] | null;
  users: User[] | null;
}

const ChartSkeleton: React.FC = () => (
  <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 animate-pulse">
    <div className="h-6 w-3/4 bg-gray-200 rounded mb-6"></div>
    <div className="h-56 md:h-80 w-full bg-gray-100 rounded-xl"></div>
  </div>
);

interface MonthData {
  name: string;
  start: Date;
  end: Date;
  [OrderStatus.PENDING]: number;
  [OrderStatus.OPEN]: number;
  [OrderStatus.CLOSED]: number;
  total: number;
}

const MonthlyProductivityChart: React.FC<MonthlyProductivityChartProps> = ({ orders, users }) => {

  const includedUserIds = useMemo(() => {
    if (!users) return [];
    return users
      .filter(u => u.role !== ROLES.DEVELOPER)
      .map(u => u.id);
  }, [users]);

  const monthlyData = useMemo(() => {
    if (!orders) return [];

    const months: MonthData[] = [];
    const today = new Date();
    
    for (let i = 0; i < 4; i++) {
      const monthStart = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);
      
      const monthName = monthStart.toLocaleString('es-ES', { month: 'short' });

      months.unshift({
        name: monthName,
        start: monthStart,
        end: monthEnd,
        [OrderStatus.PENDING]: 0,
        [OrderStatus.OPEN]: 0,
        [OrderStatus.CLOSED]: 0,
        total: 0
      });
    }

    orders.forEach(order => {
      if (!includedUserIds.includes(order.technicianId)) return;
      if (!order.scheduledDate) return;
      
      const orderDate = new Date(order.scheduledDate);
      const month = months.find(m => orderDate >= m.start && orderDate <= m.end);
      
      if (month && month[order.status] !== undefined) {
        month[order.status] += 1;
        month.total += 1;
      }
    });

    return months;
  }, [orders, includedUserIds]);

  if (!orders || !users || !monthlyData.some(d => d.total > 0)) {
    return <ChartSkeleton />;
  }

  return (
    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
      <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
        Productividad Mensual
        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-lg capitalize">Últimos 4 meses</span>
      </h3>
      <div className="h-56 md:h-80 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyData} margin={{ top: 15, right: 0, left: -20, bottom: 20 }}>
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={CustomTick} interval={0} />
            <YAxis hide />
            <Tooltip cursor={{ fill: 'transparent' }} />
            <Bar dataKey={OrderStatus.CLOSED} stackId="a" fill="#22c55e" radius={[0,0,4,4]} />
            <Bar dataKey={OrderStatus.OPEN} stackId="a" fill="#3b82f6" />
            <Bar dataKey={OrderStatus.PENDING} stackId="a" fill="#fb923c" radius={[4, 4, 0, 0]}>
               <LabelList dataKey="total" position="top" style={{ fill: '#6B7280', fontSize: 12, fontWeight: 900 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MonthlyProductivityChart;
