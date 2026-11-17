import React from 'react';
import {
  Layers, Plus, Trash2, MoveUp, MoveDown,
  ExternalLink, FileText, Monitor, Globe,
} from 'lucide-react';
import { TabConfig } from '../../../types/company';
import InfoTip from '../../ui/InfoTip';

export const ALL_ROLES = ['technician', 'supervisor', 'admin', 'aux_admin', 'developer'];

export const ROLE_LABELS: Record<string, string> = {
  technician: 'Técnico',
  supervisor: 'Supervisor',
  admin: 'Admin',
  aux_admin: 'Aux. Admin',
  developer: 'Developer',
};

const BUILT_IN_OPTIONS = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'orders', label: 'Órdenes' },
  { value: 'clients', label: 'Clientes' },
  { value: 'equipment', label: 'Máquinas' },
  { value: 'users', label: 'Equipo' },
  { value: 'map', label: 'Mapa' },
  { value: 'tasks', label: 'Tareas' },
];

const TAB_TYPES: { value: TabConfig['type']; label: string; icon: React.ReactNode }[] = [
  { value: 'built-in', label: 'Componente Interno', icon: <Monitor size={14} /> },
  { value: 'iframe', label: 'Iframe (URL)', icon: <ExternalLink size={14} /> },
  { value: 'markdown', label: 'Markdown', icon: <FileText size={14} /> },
  { value: 'external', label: 'Enlace Externo', icon: <Globe size={14} /> },
];

interface TabsEditorProps {
  tabs: TabConfig[];
  addTab: () => void;
  removeTab: (tabId: string) => void;
  moveTab: (index: number, direction: -1 | 1) => void;
  updateTab: (tabId: string, updates: Partial<TabConfig>) => void;
  allowedRoles: string[];
}

const TabsEditor: React.FC<TabsEditorProps> = ({
  tabs, addTab, removeTab, moveTab, updateTab, allowedRoles,
}) => (
  <section className="bg-raised rounded-2xl shadow-sm border border-line-soft p-5">
    <div className="flex items-center justify-between mb-4">
      <h2 className="font-bold text-ink flex items-center gap-2">
        <Layers size={18} className="text-primary" /> Pestañas Personalizadas
      </h2>
      <button
        type="button"
        onClick={addTab}
        className="h-9 px-3 bg-primary text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
      >
        <Plus size={14} /> Añadir Pestaña
      </button>
    </div>
    <p className="text-xs text-ink-faint mb-4">
      Define las pestañas que verán los usuarios. Pueden ser componentes internos, iframes, contenido markdown o enlaces externos.
    </p>

    {tabs.length === 0 ? (
      <div className="text-center py-8 text-ink-faint bg-sunken rounded-xl">
        <Layers size={24} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm font-bold">Sin pestañas personalizadas</p>
        <p className="text-xs mt-1">Añade la primera pestaña para comenzar.</p>
      </div>
    ) : (
      <div className="space-y-3">
        {tabs.map((tab, index) => (
          <div key={tab.id} className="border border-line rounded-xl p-4 hover:border-line transition-colors bg-sunken/30">
            {/* Tab Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-ink-faint bg-line px-2 py-0.5 rounded-full">{index + 1}</span>
                <input
                  type="text"
                  value={tab.label}
                  onChange={e => updateTab(tab.id, { label: e.target.value })}
                  placeholder="Nombre de la pestaña"
                  className="font-bold text-sm bg-transparent border-b border-transparent focus:border-primary focus:outline-none px-1 py-0.5 min-w-[120px]"
                />
                <span
                  title="Título obligatorio: sin él la pestaña no se guarda."
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    tab.label.trim() ? 'bg-emerald-50 text-emerald-600' : 'bg-red-100 text-red-600'
                  }`}
                >
                  {tab.label.trim() ? 'Obligatoria ✓' : 'Obligatoria · falta título'}
                </span>
                <InfoTip side="bottom" text={'Nombre de la pestaña que verán los usuarios en la barra de navegación. Es obligatorio: las pestañas sin título se descartan al guardar. Puedes renombrarla como quieras (p. ej. "Órdenes" → "Trabajos"). El resto de campos de esta pestaña (icono, ruta, roles) son opcionales y puedes ignorarlos si no los necesitas.'} />
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveTab(index, -1)} disabled={index === 0} className="p-1.5 text-ink-faint hover:text-ink-soft disabled:opacity-30"><MoveUp size={14} /></button>
                <button type="button" onClick={() => moveTab(index, 1)} disabled={index === tabs.length - 1} className="p-1.5 text-ink-faint hover:text-ink-soft disabled:opacity-30"><MoveDown size={14} /></button>
                <button type="button" onClick={() => removeTab(tab.id)} className="p-1.5 text-ink-faint hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            </div>

            {/* Tab Type */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {TAB_TYPES.map(tt => (
                <button
                  key={tt.value}
                  type="button"
                  onClick={() => updateTab(tab.id, { type: tt.value, content: tt.value !== 'built-in' ? tab.content : undefined })}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                    tab.type === tt.value
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-sunken text-ink-soft hover:bg-line'
                  }`}
                >
                  {tt.icon} {tt.label}
                </button>
              ))}
            </div>

            {/* Tab Fields based on type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Icon Name */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-bold text-ink-faint uppercase tracking-wide">Icono (lucide-react)</span>
                  <span className="text-[9px] font-bold text-ink-faint uppercase">Opcional</span>
                  <InfoTip text="Icono de la pestaña en la barra de navegación, usando un nombre válido de lucide-react (p. ej. Home, Users, Settings2, Map, ClipboardList). Si no lo sabes, déjalo vacío: se usará un icono por defecto." side="top" />
                </div>
                <input
                  type="text"
                  value={tab.icon}
                  onChange={e => updateTab(tab.id, { icon: e.target.value })}
                  placeholder="Home, Settings, Users..."
                  className="w-full h-9 px-3 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {/* Route */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-bold text-ink-faint uppercase tracking-wide">Ruta</span>
                  <span className="text-[9px] font-bold text-ink-faint uppercase">Opcional</span>
                  <InfoTip text="Ruta dentro de la app a la que navega la pestaña (debe empezar con '/'). Para componentes internos (Órdenes, Clientes, etc.) usa la ruta real del proyecto: /, /orders, /clients, /equipment, /users, /map, /tasks. No la cambies por algo que no exista o la pestaña no abrirá." side="top" />
                </div>
                <input
                  type="text"
                  value={tab.route}
                  onChange={e => updateTab(tab.id, { route: e.target.value.startsWith('/') ? e.target.value : `/${e.target.value}` })}
                  placeholder="/custom/mi-pagina"
                  className="w-full h-9 px-3 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {/* Content (for iframe, markdown, external) */}
              {tab.type !== 'built-in' && (
                <div className="md:col-span-2">
                  <label className="text-[10px] font-bold text-ink-faint uppercase tracking-wide">
                    {tab.type === 'iframe' ? 'URL del Iframe' : tab.type === 'external' ? 'URL Externa' : 'Contenido Markdown'}
                  </label>
                  {tab.type === 'markdown' ? (
                    <textarea
                      value={tab.content || ''}
                      onChange={e => updateTab(tab.id, { content: e.target.value })}
                      placeholder="# Mi contenido en Markdown"
                      rows={3}
                      className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                    />
                  ) : (
                    <input
                      type="url"
                      value={tab.content || ''}
                      onChange={e => updateTab(tab.id, { content: e.target.value })}
                      placeholder={tab.type === 'iframe' ? 'https://ejemplo.com/mi-pagina' : 'https://ejemplo.com'}
                      className="w-full h-9 px-3 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  )}
                </div>
              )}
              {/* Built-in component selector */}
              {tab.type === 'built-in' && (
                <div>
                  <label className="text-[10px] font-bold text-ink-faint uppercase tracking-wide">Componente</label>
                  <select
                    value={tab.builtInComponent || 'dashboard'}
                    onChange={e => updateTab(tab.id, { builtInComponent: e.target.value })}
                    className="w-full h-9 px-3 border border-line rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-raised"
                  >
                    {BUILT_IN_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* Roles */}
              <div>
                <label className="text-[10px] font-bold text-ink-faint uppercase tracking-wide">Roles que pueden ver esta pestaña</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {ALL_ROLES.filter(r => allowedRoles.includes(r)).map(role => (
                    <label key={role} className="flex items-center gap-1 px-2 py-1 rounded-md border border-line cursor-pointer text-[10px] font-medium">
                      <input
                        type="checkbox"
                        checked={tab.roles.includes(role)}
                        onChange={e => {
                          const newRoles = e.target.checked
                            ? [...tab.roles, role]
                            : tab.roles.filter(r => r !== role);
                          updateTab(tab.id, { roles: newRoles });
                        }}
                        className="w-3 h-3 accent-primary"
                      />
                      {ROLE_LABELS[role] || role}
                    </label>
                  ))}
                </div>
              </div>
              {/* Toggles */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-medium text-ink-soft cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tab.enabled}
                    onChange={e => updateTab(tab.id, { enabled: e.target.checked })}
                    className="w-3.5 h-3.5 accent-primary"
                  />
                  Habilitado
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-ink-soft cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tab.requiresOnline || false}
                    onChange={e => updateTab(tab.id, { requiresOnline: e.target.checked })}
                    className="w-3.5 h-3.5 accent-primary"
                  />
                  Requiere Internet
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </section>
);

export default TabsEditor;
