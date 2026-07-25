
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LabelList, Tooltip } from 'recharts';
import { ServiceOrder, OrderStatus, User } from '../../types';
import { ROLES } from '../../permissions';

const UserTick = (props: any) => {
  const { x, y, payload } = props;
  const name = payload.value || '';
  const [firstName, ...rest] = name.split(' ');
  const lastName = rest.join(' ');
  
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fill="#4B5563" fontSize={9} fontWeight="900" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {firstName}
      </text>
      <text x={0} y={0} dy={24} textAnchor="middle" fill="#6B7280" fontSize={8} fontWeight="600" style={{ opacity: 0.8 }}>
        {lastName}
      </text>
    </g>
  );
};

interface UserActivityChartProps {
  orders: ServiceOrder[] | null;
  users: User[] | null;
}

const ChartSkeleton: React.FC = () => (
  <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 animate-pulse">
    <div className="h-6 w-3/4 bg-gray-200 rounded mb-6"></div>
    <div className="h-64 w-full bg-gray-100 rounded-xl"></div>
  </div>
);

const UserActivityChart: React.FC<UserActivityChartProps> = ({ orders, users }) => {

  const { data, label } = useMemo(() => {
    if (!orders || !users) return { data: [], label: '' };

    const calculateData = (orderSet: ServiceOrder[]) => {
      return users
        .filter(u => u.role !== ROLES.DEVELOPER)
        .map(user => {
          const uo = orderSet.filter(o => o.technicianId === user.id);
          const p = uo.filter(o => o.status === OrderStatus.PENDING).length;
          const o = uo.filter(o => o.status === OrderStatus.OPEN).length;
          const c = uo.filter(o => o.status === OrderStatus.CLOSED).length;
          return { name: user.name, [OrderStatus.PENDING]: p, [OrderStatus.OPEN]: o, [OrderStatus.CLOSED]: c, total: p + o + c };
        })
        .sort((a, b) => b.total - a.total);
    };

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyOrders = orders.filter(o => {
      if (!o.scheduledDate) return false;
      const d = new Date(o.scheduledDate);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const monthlyData = calculateData(monthlyOrders);

    if (monthlyData.some(d => d.total > 0)) {
      return {
        data: monthlyData,
        label: new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
      };
    }

    return {
      data: calculateData(orders),
      label: 'Histórico'
    };

  }, [orders, users]);

  if (!orders || !users || !data.some(d => d.total > 0)) {
    return <ChartSkeleton />;
  }

  const maxVal = Math.max(...data.map(d => d.total));
  const yAxisDomain = [0, maxVal < 5 ? 5 : Math.ceil((maxVal + 1) / 5) * 5];

  return (
    <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
      <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
        Ordenes por Usuario
        <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-lg capitalize">{label}</span>
      </h3>
      <div className="w-full relative">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 20, right: 0, left: -20, bottom: 20 }}>
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={UserTick} interval={0} />
            <YAxis hide domain={yAxisDomain} />
            <Tooltip cursor={{ fill: 'transparent' }} />
            <Bar dataKey={OrderStatus.CLOSED} stackId="a" fill="#22c55e" radius={[0,0,4,4]} />
            <Bar dataKey={OrderStatus.OPEN} stackId="a" fill="#3b82f6" />
            <Bar dataKey={OrderStatus.PENDING} stackId="a" fill="#fb923c" radius={[4, 4, 0, 0]}>
               <LabelList dataKey="total" position="top" style={{ fill: '#1F2937', fontSize: 13, fontWeight: 900 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default UserActivityChart;
