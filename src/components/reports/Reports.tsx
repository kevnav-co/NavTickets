import React, { useMemo, useState } from 'react';
import { Download, BarChart3, ShieldCheck, Wrench, Loader2, ClipboardList } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useCompany } from '../../context/CompanyContext';
import { OrderStatus } from '../../types';
import { getWarrantyInfo } from '../../utils/warranty';
import { exportCsv } from '../../utils/csv';
import { exportReportPdf } from '../../utils/reportPdf';

type ReportView = 'orders' | 'warranties' | 'maintenance';

const Views: { id: ReportView; label: string; icon: React.ElementType }[] = [
  { id: 'orders', label: 'Órdenes por Técnico', icon: ClipboardList },
  { id: 'warranties', label: 'Garantías Activas', icon: ShieldCheck },
  { id: 'maintenance', label: 'Alertas Mantenimiento', icon: Wrench },
];

// ─── Fechas (Colombia) ────────────────────────────────────────────────
const todayColombia = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const nextMaintenanceDate = (e: { lastMaintenanceDate?: string; maintenanceFrequency?: number }): Date | null => {
  if (!e.lastMaintenanceDate || !e.maintenanceFrequency) return null;
  const d = new Date(e.lastMaintenanceDate + 'T12:00:00');
  d.setMonth(d.getMonth() + e.maintenanceFrequency);
  return d;
};

const diffsDays = (date: Date): number => {
  const today = new Date(todayColombia() + 'T12:00:00');
  return Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const fmtDate = (ymd?: string) => (ymd ? new Date(ymd + 'T12:00:00').toLocaleDateString('es-CO') : '—');

const Reports: React.FC = () => {
  const { orders, users, equipment, clients } = useData();
  const { company } = useCompany();
  const [view, setView] = useState<ReportView>('orders');
  const [busy, setBusy] = useState<'csv' | 'pdf' | null>(null);

  const companyName = company?.name || 'Mi Empresa';
  const todayStr = todayColombia();

  const techName = (id?: string) => users.find(u => u.id === id)?.name || 'Sin técnico';

  // ─── 1. Órdenes por técnico ─────────────────────────────────────────
  const ordersByTech = useMemo(() => {
    const map = new Map<string, { technician: string; total: number; pending: number; inProgress: number; closed: number }>();
    for (const o of orders) {
      const key = o.technicianId || 'sin-tecnico';
      const entry = map.get(key) || { technician: techName(o.technicianId), total: 0, pending: 0, inProgress: 0, closed: 0 };
      entry.total++;
      if (o.status === OrderStatus.PENDING) entry.pending++;
      else if (o.status === OrderStatus.OPEN) entry.inProgress++;
      else if (o.status === OrderStatus.CLOSED) entry.closed++;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [orders]);

  // ─── 2. Garantías activas ───────────────────────────────────────────
  const activeWarranties = useMemo(() => {
    return orders
      .filter(o => o.status === OrderStatus.CLOSED && o.warrantyPeriod && o.warrantyPeriod > 0)
      .map(o => ({ order: o, info: getWarrantyInfo(o) }))
      .filter(x => x.info && !x.info.expired)
      .sort((a, b) => (a.info!.text < b.info!.text ? -1 : 1));
  }, [orders]);

  // ─── 3. Alertas de mantenimiento ────────────────────────────────────
  const maintenanceAlerts = useMemo(() => {
    return equipment
      .map(e => {
        const next = nextMaintenanceDate(e);
        if (!next) return null;
        const days = diffsDays(next);
        const client = clients.find(c => c.id === e.clientId);
        const status = days < 0 ? 'Vencido' : days <= 30 ? 'Próximo' : 'OK';
        return { ...e, nextDate: next, days, clientName: client?.name || '—', status };
      })
      .filter((x): x is NonNullable<typeof x> => !!x && x.status !== 'OK')
      .sort((a, b) => a.days - b.days);
  }, [equipment, clients]);

  const activeWarrantyData = activeWarranties.map(x => ({
    orderNumber: x.order.orderNumber,
    client: x.order.clientName || '—',
    warrantyExpiration: x.order.warrantyExpiration || '—',
    remaining: x.info!.text,
    technician: techName(x.order.technicianId),
  }));

  // ─── Export handlers ────────────────────────────────────────────────
  const handleExport = async (kind: 'csv' | 'pdf') => {
    setBusy(kind);
    try {
      const stamp = todayStr.replace(/-/g, '');
      if (view === 'orders') {
        const headers = ['Técnico', 'Total', 'Pendiente', 'En Progreso', 'Cerrado'];
        const rows = ordersByTech.map(r => [r.technician, r.total, r.pending, r.inProgress, r.closed]);
        if (kind === 'csv') exportCsv(`informe-ordenes-${stamp}`, headers, rows);
        else await exportReportPdf(`informe-ordenes-${stamp}`, `Órdenes por Técnico — ${companyName}`, todayStr, headers, rows);
      } else if (view === 'warranties') {
        const headers = ['N° Orden', 'Cliente', 'Vence', 'Tiempo restante', 'Técnico'];
        const rows = activeWarrantyData.map(w => [w.orderNumber, w.client, w.warrantyExpiration, w.remaining, w.technician]);
        if (kind === 'csv') exportCsv(`informe-garantias-${stamp}`, headers, rows);
        else await exportReportPdf(`informe-garantias-${stamp}`, `Garantías Activas — ${companyName}`, todayStr, headers, rows);
      } else {
        const headers = ['Equipo', 'Cliente', 'S/N', 'Próximo Mant.', 'Estado'];
        const rows = maintenanceAlerts.map(a => [a.name, a.clientName, a.serialNumber, fmtDate(a.nextDate.toISOString().slice(0, 10)), `${a.status} (${a.days < 0 ? -a.days : a.days}d)`]);
        if (kind === 'csv') exportCsv(`informe-mantenimiento-${stamp}`, headers, rows);
        else await exportReportPdf(`informe-mantenimiento-${stamp}`, `Alertas de Mantenimiento — ${companyName}`, todayStr, headers, rows);
      }
    } catch (err) {
      console.error('Error exportando informe:', err);
      alert('No se pudo generar el archivo.');
    } finally {
      setBusy(null);
    }
  };

  // ─── Render helpers ─────────────────────────────────────────────────
  const SectionHeader: React.FC<{ title: string; count: string }> = ({ title, count }) => (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-black text-gray-800 uppercase tracking-wider">
        {title} <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary ml-1">{count}</span>
      </h2>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => handleExport('csv')}
          disabled={!!busy}
          className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 shadow-sm hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          <Download size={14} /> CSV
        </button>
        <button
          onClick={() => handleExport('pdf')}
          disabled={!!busy}
          className="h-9 px-3 bg-primary text-white rounded-lg text-xs font-bold shadow-sm shadow-primary/20 hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          {busy === 'pdf' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="px-4 md:px-6 pt-4 pb-2">
        <div className="grid grid-cols-3 bg-gray-200/80 p-1 rounded-2xl text-center">
          {Views.map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex flex-col items-center gap-1 py-3 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all ${view === v.id ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}
            >
              <v.icon size={16} />
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-6 pt-2 pb-24">
        {view === 'orders' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <SectionHeader title="Órdenes por Técnico" count={`${ordersByTech.length}`} />
            <div className="space-y-2">
              {ordersByTech.map((r, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-gray-100 last:border-0 py-2.5">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <ClipboardList className="text-primary" size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-800 truncate">{r.technician}</p>
                    <p className="text-[10px] font-bold text-gray-400">{r.pending} pendientes · {r.inProgress} en curso · {r.closed} cerradas</p>
                  </div>
                  <span className="text-lg font-black text-gray-800 shrink-0">{r.total}</span>
                </div>
              ))}
              {ordersByTech.length === 0 && <Empty msg="No hay órdenes registradas." />}
            </div>
          </div>
        )}

        {view === 'warranties' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <SectionHeader title="Garantías Activas" count={`${activeWarranties.length}`} />
            <div className="space-y-2">
              {activeWarranties.map(({ order, info }) => (
                <div key={order.id} className="flex items-center gap-3 border-b border-gray-100 last:border-0 py-2.5">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="text-emerald-600" size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-800 truncate">
                      {order.orderType === 'Preventivo' ? 'MP' : 'MC'}-{order.orderNumber} · {order.clientName || '—'}
                    </p>
                    <p className="text-[10px] font-bold text-gray-400">
                      Vence {order.warrantyExpiration ? fmtDate(order.warrantyExpiration) : '—'} · {techName(order.technicianId)}
                    </p>
                  </div>
                  <span className="text-[10px] font-black px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 shrink-0">{info!.text}</span>
                </div>
              ))}
              {activeWarranties.length === 0 && <Empty msg="No hay garantías activas." />}
            </div>
          </div>
        )}

        {view === 'maintenance' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-5">
            <SectionHeader title="Alertas de Mantenimiento" count={`${maintenanceAlerts.length}`} />
            <div className="space-y-2">
              {maintenanceAlerts.map(a => (
                <div key={a.id} className="flex items-center gap-3 border-b border-gray-100 last:border-0 py-2.5">
                  <div className={`w-9 h-9 rounded-lg ${a.days < 0 ? 'bg-red-50' : 'bg-amber-50'} flex items-center justify-center flex-shrink-0`}>
                    <Wrench className={a.days < 0 ? 'text-red-600' : 'text-amber-600'} size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-800 truncate">{a.name}</p>
                    <p className="text-[10px] font-bold text-gray-400">{a.clientName} · {a.serialNumber}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-gray-800">{fmtDate(a.nextDate.toISOString().slice(0, 10))}</p>
                    <span className={`text-[10px] font-black ${a.days < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                      {a.days < 0 ? `Vencido hace ${-a.days}d` : `en ${a.days}d`}
                    </span>
                  </div>
                </div>
              ))}
              {maintenanceAlerts.length === 0 && <Empty msg="Ningún equipo requiere mantenimiento urgente." />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Empty: React.FC<{ msg: string }> = ({ msg }) => (
  <div className="text-center py-8 text-gray-400">
    <BarChart3 size={28} className="mx-auto mb-2 opacity-40" />
    <p className="text-sm font-medium">{msg}</p>
  </div>
);

export default Reports;