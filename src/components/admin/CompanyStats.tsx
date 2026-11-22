// src/components/admin/CompanyStats.tsx
// Estadísticas multi-empresa para super_admin. Los datos salen de las RPC
// `admin_company_overview` y `admin_orders_by_month` (migración 054), que
// cuentan en la base sin abrir la RLS de `orders` al super_admin.

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  Legend, PieChart, Pie, Cell, CartesianGrid, LineChart, Line,
} from 'recharts';
import * as adminService from '../../services/adminService';
import { summarizeOverview } from '../../utils/adminStats';

// ─── Colores por status (consistente con el resto de la app) ────────────────
const STATUS_COLORS: Record<string, string> = {
  Pendiente: '#f59e0b',      // amber-500
  'En Progreso': '#3b82f6',  // blue-500
  Cerrado: '#22c55e',        // green-500
};

const CompanyStats: React.FC = () => {
  const [companies, setCompanies] = useState<adminService.CompanyWithStats[] | null>(null);
  const [monthlyRows, setMonthlyRows] = useState<{ month: string; total: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([adminService.listCompaniesWithStats(), adminService.getOrdersByMonth(6)])
      .then(([c, m]) => { if (alive) { setCompanies(c); setMonthlyRows(m); } })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : String(err)); });
    return () => { alive = false; };
  }, []);

  const stats = useMemo(() => summarizeOverview(companies ?? [], monthlyRows), [companies, monthlyRows]);

  if (error) {
    return <div className="p-10 text-center font-bold text-red-500">Error al cargar estadísticas: {error}</div>;
  }

  if (!companies) {
    return (
      <div className="w-full h-96 flex items-center justify-center gap-3 text-ink-faint">
        <Loader2 className="animate-spin" size={40} /><span className="font-bold">Cargando estadísticas...</span>
      </div>
    );
  }

  const KpiCard: React.FC<{ label: string; value: number; accent?: string }> = ({ label, value, accent }) => (
    <div className="bg-raised rounded-3xl p-5 shadow-sm border border-line-soft">
      <p className="text-xs font-bold text-ink-faint uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-black mt-1 ${accent || 'text-ink'}`}>{value}</p>
    </div>
  );

  const cardCls = "bg-raised rounded-3xl p-6 shadow-sm border border-line-soft";
  const chartTitle = "text-base font-black text-ink mb-4";

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
              <tr className="text-left text-xs text-ink-faint uppercase tracking-wide border-b border-line-soft">
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
                <tr><td colSpan={8} className="py-6 text-center text-ink-faint">Aún no hay tiquetes registrados.</td></tr>
              )}
              {stats.perCompany.map((r) => (
                <tr key={r.companyId} className="border-b border-gray-50 hover:bg-sunken/50">
                  <td className="py-2.5 pr-4 font-bold text-ink">{r.name}</td>
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