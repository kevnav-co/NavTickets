import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X, Pencil, Trash2, Package, Hash, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import PERMISSIONS, { hasPermission } from '../../permissions';

const InventoryDetail: React.FC = () => {
  const { getInventoryItemById, deleteItem } = useData();
  const { currentUser } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const item = id ? getInventoryItemById(id) : undefined;

  const canEdit = hasPermission(currentUser?.role, PERMISSIONS.UPDATE_INVENTORY);
  const canDelete = hasPermission(currentUser?.role, PERMISSIONS.DELETE_INVENTORY);

  if (!item) {
    return (
      <div className="min-h-screen bg-sunken/50 flex flex-col items-center justify-center px-6 text-center">
        <Package size={32} className="text-ink-faint mb-3" />
        <p className="text-sm font-bold text-ink-soft mb-4">Repuesto no encontrado</p>
        <button onClick={() => navigate('/inventory')} className="bg-primary text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 active:scale-95 transition-transform">Volver al inventario</button>
      </div>
    );
  }

  const low = (item.lowStockThreshold ?? 0) > 0 && (item.quantity ?? 0) <= (item.lowStockThreshold ?? 0);
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);

  const handleDelete = async () => {
    if (!item) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setIsDeleting(true);
    try {
      await deleteItem('inventory_items', item);
      alert('Repuesto eliminado');
      navigate('/inventory');
    } catch (err) {
      console.error('Error deleting inventory item:', err);
      alert('No se pudo eliminar el repuesto.');
      setIsDeleting(false);
    }
  };

  const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <div className="flex items-center justify-between py-3 border-b border-line-soft last:border-0">
      <span className="text-xs font-bold text-ink-faint uppercase tracking-wider">{label}</span>
      <span className="text-sm font-black text-ink text-right">{value}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-sunken/50 pb-24">
      <header className="px-5 py-4 flex items-center justify-between border-b border-line-soft sticky top-0 bg-raised/80 backdrop-blur-md z-40 shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 bg-sunken text-ink-faint rounded-full hover:bg-line transition-colors"><X size={20} /></button>
        <h1 className="text-sm font-black text-ink uppercase tracking-[0.2em]">Repuesto</h1>
        <div className="w-10" />
      </header>

      <div className="w-full max-w-2xl mx-auto p-4">
        <div className="bg-raised rounded-[2rem] shadow-sm border border-line-soft overflow-hidden">
          <div className={`p-6 relative ${low ? 'bg-red-50' : 'bg-raised'}`}>
            <div className="absolute left-0 top-0 bottom-0 w-1.5 ${low ? 'bg-red-500' : 'bg-emerald-500'}" />
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <Package className="text-primary" size={26} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-black text-lg text-ink leading-tight">{item.name}</h2>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-ink-faint mt-0.5">
                  <Hash size={11} /> {item.sku || 'sin ref'}
                </div>
              </div>
            </div>
            <div className="flex items-end justify-between mt-5">
              <div>
                <p className={`text-4xl font-black ${low ? 'text-red-600' : 'text-ink'}`}>
                  {item.quantity}
                  <span className="text-sm font-bold text-ink-faint ml-1.5">{item.unit}</span>
                </p>
                <p className="text-[11px] font-bold text-ink-faint mt-0.5">Costo {fmtMoney(item.unitCost)} / {item.unit}</p>
              </div>
              <span className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full ${low ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {low ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                {low ? 'Stock bajo' : 'En stock'}
              </span>
            </div>
          </div>

          <div className="px-6 pb-4">
            <Row label="Referencia" value={<span className="font-mono">{item.sku || '—'}</span>} />
            <Row label="Unidad" value={item.unit} />
            <Row label="Cantidad" value={<span className={low ? 'text-red-600' : ''}>{item.quantity}</span>} />
            <Row label="Costo unitario" value={fmtMoney(item.unitCost)} />
            <Row label="Umbral stock bajo" value={item.lowStockThreshold} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          {canEdit && (
            <button
              onClick={() => navigate(`/inventory/${item.id}/edit`)}
              className="flex-1 bg-primary text-white py-4 rounded-2xl font-black text-sm uppercase tracking-[0.15em] shadow-lg shadow-primary/20 active:scale-95 transition-transform items-center justify-center gap-2 flex"
            >
              <Pencil size={16} /> Editar
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className={`flex-1 py-4 rounded-2xl font-black text-sm uppercase tracking-[0.15em] border-2 active:scale-95 transition-transform flex items-center justify-center gap-2 ${confirmDelete ? 'bg-red-600 text-white border-red-600' : 'text-red-600 border-red-200 bg-red-50'}`}
            >
              <Trash2 size={16} /> {confirmDelete ? 'Confirmar' : 'Eliminar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventoryDetail;