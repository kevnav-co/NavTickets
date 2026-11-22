// Agregados del panel de estadísticas del super_admin a partir de las RPC
// `admin_company_overview` y `admin_orders_by_month` (migración 054).
import type { CompanyWithStats } from '../services/adminService';

export interface PerCompanyStats {
  companyId: string;
  name: string;
  total: number;
  pendiente: number;
  enProgreso: number;
  cerrado: number;
  correctivo: number;
  preventivo: number;
  esteMes: number;
}

export interface StatsSummary {
  empresas: number;
  total: number;
  enProgreso: number;
  cerradoEsteMes: number;
  perCompany: PerCompanyStats[];
  statusData: { name: string; value: number }[];
  monthly: { mes: string; tiquetes: number }[];
}

/** `month` llega como 'YYYY-MM-DD' (primer día del mes, hora de Colombia). */
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es', { month: 'short', timeZone: 'UTC' });
}

export function summarizeOverview(
  companies: CompanyWithStats[],
  monthlyRows: { month: string; total: number }[],
): StatsSummary {
  const perCompany: PerCompanyStats[] = companies
    .filter(c => c.overview && c.overview.ordersTotal > 0)
    .map(c => ({
      companyId: c.id,
      name: c.name || 'Sin nombre',
      total: c.overview!.ordersTotal,
      pendiente: c.overview!.pending,
      enProgreso: c.overview!.inProgress,
      cerrado: c.overview!.closed,
      correctivo: c.overview!.corrective,
      preventivo: c.overview!.preventive,
      esteMes: c.overview!.ordersThisMonth,
    }))
    .sort((a, b) => b.total - a.total);

  const sum = (f: (c: NonNullable<CompanyWithStats['overview']>) => number) =>
    companies.reduce((acc, c) => acc + (c.overview ? f(c.overview) : 0), 0);

  return {
    empresas: companies.length,
    total: sum(o => o.ordersTotal),
    enProgreso: sum(o => o.inProgress),
    cerradoEsteMes: sum(o => o.closedThisMonth),
    perCompany,
    statusData: [
      { name: 'Pendiente', value: sum(o => o.pending) },
      { name: 'En Progreso', value: sum(o => o.inProgress) },
      { name: 'Cerrado', value: sum(o => o.closed) },
    ],
    monthly: monthlyRows.map(r => ({ mes: monthLabel(r.month), tiquetes: r.total })),
  };
}
