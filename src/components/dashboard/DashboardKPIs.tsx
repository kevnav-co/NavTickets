
import React, { useMemo } from 'react';
import { OrderStatus } from '../../types';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { Clock, Loader, CircleCheck, ShieldCheck } from 'lucide-react';
import PERMISSIONS, { hasPermission } from '../../permissions'; // <-- Importar permisos

const KPIPlaceholder: React.FC<{ title: string }> = ({ title }) => (
  <div className="bg-sunken p-3 md:p-5 rounded-xl border border-line-soft">
    <div className="skeleton h-3 w-10 mb-2" />
    <p className="text-[9px] md:text-[11px] font-semibold text-ink-faint uppercase tracking-wide">{title}</p>
  </div>
);

// Tono por estado: fondo muy claro, texto e icono saturados. `color` alimenta
// el `currentColor` del halo decorativo de `.kpi-tile`.
const KPI_STYLES = {
  pending: { bg: 'bg-orange-50/70 border-orange-100 hover:border-orange-200', text: 'text-orange-600', icon: Clock },
  open: { bg: 'bg-blue-50/70 border-blue-100 hover:border-blue-200', text: 'text-blue-600', icon: Loader },
  closed: { bg: 'bg-emerald-50/70 border-emerald-100 hover:border-emerald-200', text: 'text-emerald-600', icon: CircleCheck },
  warranty: { bg: 'bg-indigo-50/70 border-indigo-100 hover:border-indigo-200', text: 'text-indigo-600', icon: ShieldCheck },
} as const;

const KPITile: React.FC<{
  label: string;
  value: number;
  kind: keyof typeof KPI_STYLES;
  onClick: () => void;
}> = ({ label, value, kind, onClick }) => {
  const style = KPI_STYLES[kind];
  const Icon = style.icon;
  return (
    <button onClick={onClick} className={`kpi-tile border text-left ${style.bg} ${style.text}`}>
      <div className="relative flex items-start justify-between gap-1">
        <p className={`text-[9px] md:text-[11px] font-semibold uppercase tracking-wide ${style.text}`}>{label}</p>
        <Icon size={14} className={`shrink-0 opacity-50 ${style.text}`} />
      </div>
      <p className="relative text-2xl md:text-4xl font-bold text-ink mt-1 tabular-nums tracking-tight">{value}</p>
    </button>
  );
};

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        <KPIPlaceholder title="Pendientes" />
        <KPIPlaceholder title="En Progreso" />
        <KPIPlaceholder title="Cerrados" />
        <KPIPlaceholder title="Garantía" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
      <KPITile label="Pendientes" value={kpis.pending} kind="pending" onClick={() => navigate(`/orders?status=${OrderStatus.PENDING}`)} />
      <KPITile label="En Progreso" value={kpis.open} kind="open" onClick={() => navigate(`/orders?status=${OrderStatus.OPEN}`)} />
      <KPITile label="Cerrados" value={kpis.closed} kind="closed" onClick={() => navigate(`/orders?status=${OrderStatus.CLOSED}`)} />
      <KPITile label="Garantía" value={kpis.warranty} kind="warranty" onClick={() => navigate('/orders?status=Warranty')} />
    </div>
  );
};

export default DashboardKPIs;
