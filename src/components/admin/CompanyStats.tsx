// src/components/admin/CompanyStats.tsx
// Estadísticas multi-empresa para super_admin: gráficas de tiquetes/órdenes
// de servicio agregadas por empresa (todas las empresas, sin filtro de company).
// Los datos se derivan de `orders` (real); RLS `FOR ALL` de la migración 005
// cubre SELECT, así que super_admin lee todo con el cliente anon.

import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  Legend, PieChart, Pie, Cell, CartesianGrid, LineChart, Line,
} from 'recharts';
import { useCollection } from '../../hooks/useCollection';
import { ServiceOrder, OrderStatus } from '../../types';
import { CompanyConfig } from '../../types/company';

// ─── Colores por status (consistente con el resto de la app) ────────────────
const STATUS_COLORS: Record<string, string> = {
  Pendiente: '#f59e0b',      // amber-500
  'En Progreso': '#3b82f6',  // blue-500
  Cerrado: '#22c55e',        // green-500
};

interface PerCompanyStats {
  companyId: string;
  name: string;
  total: number;
  pendiente: number;
  enProgreso: number;
  cerrado: number;
  correctivo: number;
  preventivo: number;
  esteMes: number;
  ultimos30d: number;
}

interface StatusDatum { name: string; value: number; }

const statusLabel = (s: OrderStatus): string =>
  s === OrderStatus.PENDING ? 'Pendiente' : s === OrderStatus.OPEN ? 'En Progreso' : 'Cerrado';

const companyName = (id: string, companies: CompanyConfig[]): string =>
  companies.find(c => c.id === id)?.name || 'Sin nombre';

const CompanyStats: React.FC = () => {
  const { data: orders, loading: ordersLoading, error: ordersError } = useCollection<ServiceOrder>('orders');
  const { data: companies, loading: companiesLoading, error: companiesError } =
    useCollection<CompanyConfig>('companies');

  const stats = useMemo(() => {
    const list = orders || [];
    const now = new Date();
    const isThisMonth = (iso?: string) => {
      if (!iso) return false;
      const d = new Date(iso);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    };
    const isLast30Days = (iso?: string) => {
      if (!iso) return false;
      return now.getTime() - new Date(iso).getTime() <= 30 * 24 * 60 * 60 * 1000;
    };

    // ── Por empresa ──────────────────────────────────────────────────────────
    const byCompany = new Map<string, PerCompanyStats>();
    let total = 0, enProgreso = 0, cerradoEsteMes = 0;
    const statusCount: Record<string, number> = { Pendiente: 0, 'En Progreso': 0, Cerrado: 0 };

    for (const o of list) {
      const room = byCompany.get(o.companyId) || {
        companyId: o.companyId, name: '', total: 0, pendiente: 0, enProgreso: 0,
        cerrado: 0, correctivo: 0, preventivo: 0, esteMes: 0, ultimos30d: 0,
      };
      room.total++;
      const st = statusLabel(o.status);
      if (st === 'Pendiente') room.pendiente++;
      else if (st === 'En Progreso') room.enProgreso++;
      else room.cerrado++;

      if (o.orderType === 'Correctivo') room.correctivo++;
      else if (o.orderType === 'Preventivo') room.preventivo++;
      if (isThisMonth(o.createdAt)) room.esteMes++;
      if (isLast30Days(o.createdAt)) room.ultimos30d++;

      byCompany.set(o.companyId, room);

      total++;
      if (st === 'En Progreso') enProgreso++;
      if (st === 'Cerrado' && isThisMonth(o.createdAt)) cerradoEsteMes++;
      statusCount[st]++;
    }

    const perCompany = Array.from(byCompany.values())
      .map(r => ({ ...r, name: companyName(r.companyId, companies || []) }))
      .sort((a, b) => b.total - a.total);

    // ── Mensual (últimos 6 meses) ────────────────────────────────────────────
    const monthlyLabels: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthlyLabels.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString('es', { month: 'short' }),
      });
    }
    const monthly = monthlyLabels.map(m => {
      let value = 0;
      for (const o of list) {
        if (!o.createdAt) continue;
        const d = new Date(o.createdAt);
        if (`${d.getFullYear()}-${d.getMonth()}` === m.key) value++;
      }
      return { mes: m.label, tiquetes: value };
    });

    const statusData: StatusDatum[] = (Object.entries(statusCount) as [string, number][])
      .map(([name, value]) => ({ name, value }));

    return { perCompany, statusData, monthly, total, enProgreso, cerradoEsteMes, empresas: (companies || []).length };
  }, [orders, companies]);

  if (ordersLoading || companiesLoading) {
    return (
      <div className="w-full h-96 flex items-center justify-center gap-3 text-gray-400">
        <Loader2 className="animate-spin" size={40} /><span className="font-bold">Cargando estadísticas...</span>
      </div>
    );
  }

  const error = ordersError || companiesError;
  if (error) {
    return <div className="p-10 text-center font-bold text-red-500">Error al cargar estadísticas: {error.message}</div>;
  }

  const KpiCard: React.FC<{ label: string; value: number; accent?: string }> = ({ label, value, accent }) => (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-black mt-1 ${accent || 'text-gray-900'}`}>{value}</p>
    </div>
  );

  const cardCls = "bg-white rounded-3xl p-6 shadow-sm border border-gray-100";
  const chartTitle = "text-base font-black text-gray-800 mb-4";

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Empresas" value={stats.empresas} />
        <KpiCard label="Tiquetes totales" value={stats.total} />
        <KpiCard label="En progreso" value={stats.enProgreso} accent="text-blue-500" />
        <KpiCard label="Cerrados este mes" value={stats.cerradoEsteMes} accent="text-green-500" />
      </div>

      {/* Barra: tiquetes por empresa (apilado por status) */}
      <div className={cardCls}>
        <h3 className={chartTitle}>Tiquetes por empresa</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stats.perCompany} barCategoryGap="18%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
            <Legend />
            <Bar dataKey="pendiente" name="Pendiente" stackId="s" fill={STATUS_COLORS.Pendiente} />
            <Bar dataKey="enProgreso" name="En Progreso" stackId="s" fill={STATUS_COLORS['En Progreso']} />
            <Bar dataKey="cerrado" name="Cerrado" stackId="s" fill={STATUS_COLORS.Cerrado} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Torta: distribución global por status */}
        <div className={cardCls}>
          <h3 className={chartTitle}>Distribución por estado</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={stats.statusData} dataKey="value" nameKey="name"
                innerRadius={55} outerRadius={90} paddingAngle={3}
              >
                {stats.statusData.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#9ca3af'} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Línea: tiquetes creados por mes (últimos 6 meses) */}
        <div className={cardCls}>
          <h3 className={chartTitle}>Tiquetes creados por mes (6 meses)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={stats.monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip />
              <Line type="monotone" dataKey="tiquetes" stroke="#7b1113" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabla desglose por empresa */}
      <div className={cardCls}>
        <h3 className={chartTitle}>Desglose por empresa</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 pr-4 font-bold">Empresa</th>
                <th className="py-2 px-2 font-bold">Total</th>
                <th className="py-2 px-2 font-bold text-amber-500">Pendiente</th>
                <th className="py-2 px-2 font-bold text-blue-500">En Progreso</th>
                <th className="py-2 px-2 font-bold text-green-500">Cerrado</th>
                <th className="py-2 px-2 font-bold">Correctivo</th>
                <th className="py-2 px-2 font-bold">Preventivo</th>
                <th className="py-2 px-2 font-bold">Este mes</th>
              </tr>
            </thead>
            <tbody>
              {stats.perCompany.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-gray-400">Aún no hay tiquetes registrados.</td></tr>
              )}
              {stats.perCompany.map((r) => (
                <tr key={r.companyId} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 pr-4 font-bold text-gray-800">{r.name}</td>
                  <td className="py-2.5 px-2 font-black">{r.total}</td>
                  <td className="py-2.5 px-2 text-amber-500">{r.pendiente}</td>
                  <td className="py-2.5 px-2 text-blue-500">{r.enProgreso}</td>
                  <td className="py-2.5 px-2 text-green-500">{r.cerrado}</td>
                  <td className="py-2.5 px-2">{r.correctivo}</td>
                  <td className="py-2.5 px-2">{r.preventivo}</td>
                  <td className="py-2.5 px-2 font-semibold">{r.esteMes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CompanyStats;