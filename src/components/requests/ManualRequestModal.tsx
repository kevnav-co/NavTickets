// src/components/requests/ManualRequestModal.tsx
// Alta manual de una solicitud recibida por teléfono. Queda directamente en
// 'pendiente' (RLS de la 042: canal 'manual' y created_by propio) y se confirma
// en la bandeja como cualquier otra.

import React, { useEffect, useState } from 'react';
import { Loader2, Phone, X } from 'lucide-react';
import type { ManualServiceRequestInput } from '../../types/serviceRequest';
import { createManualServiceRequest } from '../../services/serviceRequests';

const inputCls =
  'w-full bg-sunken border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-primary/20';

const EMPTY: ManualServiceRequestInput = {
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  contactIdentification: '',
  address: '',
  city: '',
  serviceName: '',
  orderType: 'Correctivo',
  suggestedPriority: 'Media',
  description: '',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  companyId: string;
  userId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}

const ManualRequestModal: React.FC<Props> = ({ companyId, userId, onClose, onCreated }) => {
  const [form, setForm] = useState<ManualServiceRequestInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const set = (patch: Partial<ManualServiceRequestInput>) => { setError(null); setForm(f => ({ ...f, ...patch })); };

  const problem =
    !form.contactName.trim() ? 'Escribe el nombre del cliente.' :
    !form.contactPhone?.trim() && !form.contactEmail?.trim() ? 'Escribe un teléfono o un correo de contacto.' :
    form.contactEmail?.trim() && !EMAIL_RE.test(form.contactEmail.trim()) ? 'El correo no es válido.' :
    !form.description.trim() ? 'Describe el servicio que pide.' :
    null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem || busy) { setError(problem); return; }
    setBusy(true);
    try {
      const id = await createManualServiceRequest(form, companyId, userId);
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-6" onClick={() => !busy && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-request-title"
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="bg-raised w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Phone size={18} className="text-primary" aria-hidden="true" />
          <h2 id="manual-request-title" className="text-base font-bold text-ink">Registrar una llamada</h2>
          <button type="button" onClick={onClose} disabled={busy} className="ml-auto p-1.5 rounded-full text-ink-faint hover:bg-sunken" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-ink-soft">
          La solicitud queda pendiente en la bandeja; la orden se crea al confirmarla con fecha, hora y técnico.
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold text-ink-soft">Nombre del cliente *</span>
            <input className={`${inputCls} mt-1`} maxLength={200} value={form.contactName} onChange={e => set({ contactName: e.target.value })} autoFocus />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Teléfono</span>
            <input className={`${inputCls} mt-1`} inputMode="tel" maxLength={40} value={form.contactPhone} onChange={e => set({ contactPhone: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Correo</span>
            <input className={`${inputCls} mt-1`} type="email" maxLength={254} value={form.contactEmail} onChange={e => set({ contactEmail: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">NIT o cédula</span>
            <input className={`${inputCls} mt-1`} maxLength={40} value={form.contactIdentification} onChange={e => set({ contactIdentification: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Ciudad</span>
            <input className={`${inputCls} mt-1`} maxLength={120} value={form.city} onChange={e => set({ city: e.target.value })} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold text-ink-soft">Dirección</span>
            <input className={`${inputCls} mt-1`} maxLength={300} value={form.address} onChange={e => set({ address: e.target.value })} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold text-ink-soft">Servicio</span>
            <input className={`${inputCls} mt-1`} maxLength={200} placeholder="Ej.: mantenimiento de nevera industrial" value={form.serviceName} onChange={e => set({ serviceName: e.target.value })} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Tipo</span>
            <select className={`${inputCls} mt-1`} value={form.orderType} onChange={e => set({ orderType: e.target.value as ManualServiceRequestInput['orderType'] })}>
              <option value="Correctivo">Correctivo</option>
              <option value="Preventivo">Preventivo</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Prioridad</span>
            <select className={`${inputCls} mt-1`} value={form.suggestedPriority} onChange={e => set({ suggestedPriority: e.target.value as ManualServiceRequestInput['suggestedPriority'] })}>
              <option value="Baja">Baja</option>
              <option value="Media">Media</option>
              <option value="Alta">Alta</option>
              <option value="Urgente">Urgente</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold text-ink-soft">Qué necesita *</span>
            <textarea className={`${inputCls} mt-1 min-h-24`} maxLength={4000} value={form.description} onChange={e => set({ description: e.target.value })} />
          </label>
        </div>

        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold text-ink-soft bg-sunken">Cancelar</button>
          <button type="submit" disabled={busy} className="btn-primary inline-flex items-center gap-2 disabled:opacity-60">
            {busy && <Loader2 size={16} className="animate-spin" />} Guardar solicitud
          </button>
        </div>
      </form>
    </div>
  );
};

export default ManualRequestModal;
