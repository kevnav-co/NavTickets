import { describe, it, expect } from 'vitest';
import { summarizeOverview } from './adminStats';
import type { CompanyWithStats, CompanyOverview } from '../services/adminService';

const overview = (companyId: string, o: Partial<CompanyOverview>): CompanyOverview => ({
  companyId, usersCount: 0, ordersTotal: 0, pending: 0, inProgress: 0, closed: 0, corrective: 0,
  preventive: 0, ordersThisMonth: 0, closedThisMonth: 0, lastActivityAt: null, ...o,
});
const company = (id: string, name: string, o?: Partial<CompanyOverview>): CompanyWithStats =>
  ({ id, name, slug: id, theme: {}, features: {}, auth: {}, tabs: [], overview: o ? overview(id, o) : undefined } as unknown as CompanyWithStats);

describe('summarizeOverview', () => {
  const companies = [
    company('a', 'Alfa', { ordersTotal: 3, pending: 1, inProgress: 1, closed: 1, corrective: 2, preventive: 1, ordersThisMonth: 2, closedThisMonth: 1 }),
    company('b', 'Beta', { ordersTotal: 5, pending: 0, inProgress: 2, closed: 3, corrective: 5, closedThisMonth: 2 }),
    company('c', 'Sin órdenes', { ordersTotal: 0 }),
    company('d', 'Sin estadísticas'),
  ];

  it('suma los totales de todas las empresas', () => {
    const s = summarizeOverview(companies, []);
    expect(s.empresas).toBe(4);
    expect(s.total).toBe(8);
    expect(s.enProgreso).toBe(3);
    expect(s.cerradoEsteMes).toBe(3);
    expect(s.statusData).toEqual([
      { name: 'Pendiente', value: 1 },
      { name: 'En Progreso', value: 3 },
      { name: 'Cerrado', value: 4 },
    ]);
  });

  it('lista por empresa solo las que tienen órdenes, de mayor a menor', () => {
    const s = summarizeOverview(companies, []);
    expect(s.perCompany.map(r => r.name)).toEqual(['Beta', 'Alfa']);
    expect(s.perCompany[1]).toMatchObject({ pendiente: 1, correctivo: 2, preventivo: 1, esteMes: 2 });
  });

  it('nombra los meses sin correrse por la zona horaria', () => {
    const s = summarizeOverview([], [{ month: '2026-11-01', total: 4 }, { month: '2026-12-01', total: 0 }]);
    expect(s.monthly).toHaveLength(2);
    expect(s.monthly[0].tiquetes).toBe(4);
    expect(s.monthly[0].mes.toLowerCase()).toContain('nov');
    expect(s.monthly[1].mes.toLowerCase()).toContain('dic');
  });
});
