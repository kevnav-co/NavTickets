import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X, Save, Loader2, Hash, Package, Coins, AlertTriangle, Ruler } from 'lucide-react';
import { InventoryItem } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useValidatedActions } from '../../hooks/useValidatedActions';
import { InventoryItemSchema } from '../../schemas/inventory.schema';
import PERMISSIONS, { hasPermission } from '../../permissions';

type FormState = Partial<InventoryItem>;

const initialFormData: FormState = {
  sku: '',
  name: '',
  unit: 'unidad',
  quantity: 0,
  unitCost: 0,
  lowStockThreshold: 0,
};

const UNITS = ['unidad', 'lt', 'kg', 'gl', 'mt', 'par'];

const InventoryForm: React.FC = () => {
  const { inventoryItems } = useData();
  const { addValidated, updateValidated } = useValidatedActions();
  const { currentUser } = useAuth();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const [formData, setFormData] = useState<FormState>(initialFormData);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const canEdit = hasPermission(currentUser?.role, PERMISSIONS.UPDATE_INVENTORY);
  const canCreate = hasPermission(currentUser?.role, PERMISSIONS.CREATE_INVENTORY);
  const canDelete = hasPermission(currentUser?.role, PERMISSIONS.DELETE_INVENTORY);
  const permissionOk = isEditMode ? canEdit : canCreate;

  const lowStock = (formData.lowStockThreshold ?? 0) > 0 && (formData.quantity ?? 0) <= (formData.lowStockThreshold ?? 0);

  useEffect(() => {
    if (!isEditMode) { setLoaded(true); return; }
    if (!inventoryItems) return;
    const item = inventoryItems.find(i => i.id === id);
    if (item) {
      setFormData({
        sku: item.sku ?? '',
        name: item.name,
        unit: item.unit ?? 'unidad',
        quantity: Number(item.quantity) || 0,
        unitCost: Number(item.unitCost) || 0,
        lowStockThreshold: Number(item.lowStockThreshold) || 0,
      });
      setLoaded(true);
    } else {
      navigate('/inventory');
    }
  }, [id, inventoryItems, isEditMode, navigate]);

  const handleChange = (field: keyof FormState, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!permissionOk) {
      alert('No tienes permiso para realizar esta acción.');
      return;
    }
    if (!formData.name || !formData.name.trim()) {
      setValidationErrors({ name: 'El nombre del repuesto es obligatorio.' });
      return;
    }

    setIsSubmitting(true);
    try {
      const dataToSave = {
        sku: formData.sku ?? '',
        name: formData.name.trim(),
        unit: formData.unit ?? 'unidad',
        quantity: Number(formData.quantity) || 0,
        unitCost: Number(formData.unitCost) || 0,
        lowStockThreshold: Number(formData.lowStockThreshold) || 0,
      };

      if (isEditMode && id) {
        await updateValidated('inventory_items', id, dataToSave, InventoryItemSchema);
        alert('Repuesto actualizado');
        navigate(`/inventory/${id}`);
      } else {
        if (!currentUser?.companyId) {
          alert('No se pudo determinar la empresa del usuario.');
          return;
        }
        // OJO RLS: addItem NO inyecta companyId; el INSERT exige
        // company_id = current_company_id(), así que va en el payload.
        await addValidated('inventory_items', { ...dataToSave, companyId: currentUser.companyId }, InventoryItemSchema.omit({ id: true }));
        alert('Repuesto registrado');
        navigate('/inventory');
      }
    } catch (err) {
      console.error('Error saving inventory item:', err);
      alert('No se pudo guardar el repuesto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!loaded || !inventoryItems) {
    return <div className="w-full h-screen flex items-center justify-center"><Loader2 className="animate-spin text-gray-300" size={40} /></div>;
  }

  if (!permissionOk) {
    return (
      <div className="min-h-screen bg-gray-50/50 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4"><AlertTriangle className="text-primary" size={26} /></div>
        <h1 className="text-sm font-black text-gray-800 uppercase tracking-[0.2em] mb-1">Sin permisos</h1>
        <p className="text-sm text-gray-500 max-w-xs">No tienes permisos para {isEditMode ? 'editar' : 'crear'} repuestos.</p>
        <button onClick={() => navigate('/inventory')} className="mt-5 bg-primary text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 active:scale-95 transition-transform">Volver al inventario</button>
      </div>
    );
  }

  const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 block">{children}</label>
  );

  return (
    <div className="min-h-screen bg-gray-50/50">
      <header className="px-5 py-4 flex items-center justify-between border-b border-gray-100 sticky top-0 bg-white/80 backdrop-blur-md z-40 shadow-sm">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 bg-gray-100 text-gray-400 rounded-full hover:bg-gray-200 transition-colors"><X size={20} /></button>
        <h1 className="text-sm font-black text-gray-800 uppercase tracking-[0.2em]">{isEditMode ? 'Editar Repuesto' : 'Nuevo Repuesto'}</h1>
        <div className="w-10" />
      </header>

      <div className="w-full max-w-2xl mx-auto p-4 pb-24">
        <form onSubmit={handleSubmit} className="w-full space-y-6">
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
            <div className="flex items-center mb-5">
              <div className="w-1 h-5 bg-red-500 rounded-full mr-3" />
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Identificación</h2>
            </div>
            <div className="space-y-4">
              <div>
                <Label>Nombre del Repuesto *</Label>
                <div className="relative mt-1">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><Package className="text-gray-400" size={16} /></div>
                  <input
                    type="text"
                    value={formData.name ?? ''}
                    onChange={(e) => handleChange('name', e.target.value.toUpperCase())}
                    placeholder="Ej: FILTRO HIDRÁULICO 20μ"
                    className={`w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl border ${validationErrors.name ? 'border-red-500' : 'border-gray-200'} outline-none font-bold text-sm focus:ring-2 focus:ring-primary/20 uppercase`}
                  />
                </div>
                {validationErrors.name && <p className="text-xs text-red-500 ml-4 mt-1">{validationErrors.name}</p>}
              </div>

              <div>
                <Label>Referencia (SKU)</Label>
                <div className="relative mt-1">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><Hash className="text-gray-400" size={16} /></div>
                  <input
                    type="text"
                    value={formData.sku ?? ''}
                    onChange={(e) => handleChange('sku', e.target.value.toUpperCase())}
                    placeholder="Ej: REF-0001"
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl border border-gray-200 outline-none font-bold text-sm focus:ring-2 focus:ring-primary/20 uppercase font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
            <div className="flex items-center mb-5">
              <div className="w-1 h-5 bg-blue-500 rounded-full mr-3" />
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Stock</h2>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cantidad</Label>
                  <div className="relative mt-1">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={formData.quantity ?? 0}
                      onChange={(e) => handleChange('quantity', parseFloat(e.target.value) || 0)}
                      className={`w-full pl-4 pr-4 py-4 bg-gray-50 rounded-2xl border ${lowStock ? 'border-red-400' : 'border-gray-200'} outline-none font-black text-sm focus:ring-2 focus:ring-blue-400/20`}
                    />
                  </div>
                </div>
                <div>
                  <Label>Unidad de Medida</Label>
                  <div className="relative mt-1">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><Ruler className="text-gray-400" size={16} /></div>
                    <select
                      value={formData.unit ?? 'unidad'}
                      onChange={(e) => handleChange('unit', e.target.value)}
                      className="w-full pl-12 pr-8 py-4 bg-gray-50 rounded-2xl border border-gray-200 appearance-none outline-none font-black text-sm focus:ring-2 focus:ring-blue-400/20"
                    >
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Costo Unitario</Label>
                  <div className="relative mt-1">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none"><Coins className="text-gray-400" size={16} /></div>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={formData.unitCost ?? 0}
                      onChange={(e) => handleChange('unitCost', parseFloat(e.target.value) || 0)}
                      className="w-full pl-10 pr-4 py-4 bg-gray-50 rounded-2xl border border-gray-200 outline-none font-black text-sm focus:ring-2 focus:ring-blue-400/20"
                    />
                  </div>
                </div>
                <div>
                  <Label>Umbral Stock Bajo</Label>
                  <div className="relative mt-1">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={formData.lowStockThreshold ?? 0}
                      onChange={(e) => handleChange('lowStockThreshold', parseFloat(e.target.value) || 0)}
                      className="w-full pl-4 pr-4 py-4 bg-gray-50 rounded-2xl border border-gray-200 outline-none font-black text-sm focus:ring-2 focus:ring-blue-400/20"
                    />
                  </div>
                </div>
              </div>

              {lowStock && (
                <div className="rounded-2xl p-3.5 bg-red-50 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-600 shrink-0" />
                  <p className="text-xs font-bold text-red-700">El stock actual está por debajo o igual al umbral. Este repuesto se marca como "Stock bajo".</p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-6">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary text-white py-5 rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-red-900/30 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-3"
            >
              {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <>
                <Save size={20} />
                <span>{isEditMode ? 'Actualizar Repuesto' : 'Registrar Repuesto'}</span>
              </>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InventoryForm;