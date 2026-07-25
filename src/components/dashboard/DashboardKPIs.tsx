
import React, { useMemo } from 'react';
import { OrderStatus } from '../../types';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import PERMISSIONS, { hasPermission } from '../../permissions'; // <-- Importar permisos

const KPIPlaceholder: React.FC<{ title: string }> = ({ title }) => (
  <div className="bg-gray-100 p-2 md:p-5 rounded-xl md:rounded-2xl animate-pulse">
    <p className="text-[7px] md:text-xs font-bold text-gray-500 mb-0.5 uppercase">{title}</p>
    <p className="text-xl md:text-3xl font-black text-gray-400">-</p>
  </div>
);

const DashboardKPIs: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { orders } = useData();

  const kpis = useMemo(() => {
    if (!orders || !currentUser) return null;

    const canViewGlobalKPIs = hasPermission(currentUser.role, PERMISSIONS.VIEW_GLOBAL_KPIS);

    const userOrders = canViewGlobalKPIs
      ? orders
      : orders.filter(o => o.technicianId === currentUser.id);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return {
      pending: userOrders.filter(o => o.status === OrderStatus.PENDING).length,
      open: userOrders.filter(o => o.status === OrderStatus.OPEN).length,
      closed: userOrders.filter(o => o.status === OrderStatus.CLOSED).length,
      warranty: userOrders.filter(o => {
        if (o.status !== OrderStatus.CLOSED || !o.warrantyExpiration) {
          return false;
        }
        return new Date(o.warrantyExpiration + 'T00:00:00') >= today;
      }).length
    };
  }, [orders, currentUser]);

  if (!kpis) {
    return (
      <div className="grid grid-cols-4 gap-1.5 md:gap-4 pt-2">
        <KPIPlaceholder title="Pendientes" />
        <KPIPlaceholder title="En Progreso" />
        <KPIPlaceholder title="Cerrados" />
        <KPIPlaceholder title="Garantía" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-1.5 md:gap-4 pt-2">
      <button onClick={() => navigate(`/orders?status=${OrderStatus.PENDING}`)} className="bg-orange-50 p-2 md:p-5 rounded-xl md:rounded-2xl text-left border border-orange-100 hover:bg-orange-100 transition-colors"><p className="text-[7px] md:text-xs font-bold text-orange-600 mb-0.5 uppercase">Pendientes</p><p className="text-xl md:text-3xl font-black text-gray-900">{kpis.pending}</p></button>
      <button onClick={() => navigate(`/orders?status=${OrderStatus.OPEN}`)} className="bg-blue-50 p-2 md:p-5 rounded-xl md:rounded-2xl text-left border border-blue-100 hover:bg-blue-100 transition-colors"><p className="text-[7px] md:text-xs font-bold text-blue-700 mb-0.5 uppercase">En Progreso</p><p className="text-xl md:text-3xl font-black text-gray-900">{kpis.open}</p></button>
      <button onClick={() => navigate(`/orders?status=${OrderStatus.CLOSED}`)} className="bg-green-50 p-2 md:p-5 rounded-xl md:rounded-2xl text-left border border-green-100 hover:bg-green-100 transition-colors"><p className="text-[7px] md:text-xs font-bold text-green-600 mb-0.5 uppercase">Cerrados</p><p className="text-xl md:text-3xl font-black text-gray-900">{kpis.closed}</p></button>
      <button onClick={() => navigate(`/orders?status=Warranty`)} className="bg-indigo-50 p-2 md:p-5 rounded-xl md:rounded-2xl text-left border border-indigo-100 hover:bg-indigo-100 transition-colors"><p className="text-[7px] md:text-xs font-bold text-indigo-600 mb-0.5 uppercase">Garantía</p><p className="text-xl md:text-3xl font-black text-gray-900">{kpis.warranty}</p></button>
    </div>
  );
};

export default DashboardKPIs;
