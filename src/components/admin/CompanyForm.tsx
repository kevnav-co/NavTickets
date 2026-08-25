// src/components/admin/CompanyForm.tsx
// Create/Edit company form with full configuration: theme, features, auth, and custom tabs.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Save, X, Layers, Palette, Globe, Shield, Plus, Trash2, MoveUp, MoveDown,
  ExternalLink, FileText, Monitor, AlertTriangle, Building2
} from 'lucide-react';
import { CompanyTheme, CompanyFeatures, CompanyAuth, TabConfig } from '../../types/company';
import { DEFAULT_BUILT_IN_TABS } from '../../types/company';
import * as adminService from '../../services/adminService';
import Toast from '../ui/Toast';
import InfoTip from '../ui/InfoTip';

interface CompanyFormProps {
  companyId: string | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

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

const ALL_ROLES = ['technician', 'supervisor', 'admin', 'aux_admin', 'developer'];

const ROLE_LABELS: Record<string, string> = {
  technician: 'Técnico',
  supervisor: 'Supervisor',
  admin: 'Admin',
  aux_admin: 'Aux. Admin',
  developer: 'Developer',
};

const EMPTY_TAB: TabConfig = {
  id: '',
  label: '',
  icon: 'Home',
  route: '',
  type: 'built-in',
  builtInComponent: 'dashboard',
  content: '',
  enabled: true,
  order: 0,
  roles: ['technician', 'supervisor', 'admin'],
  requiresOnline: false,
};

// Genera un slug seguro a partir de un nombre.
// Se usa para que una empresa editada sin slug (p. ej. las sembradas) pueda
// guardar cambios parciales sin bloquear por un campo "obligatorio" vacío.
function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const CompanyForm: React.FC<CompanyFormProps> = ({ companyId, onSaved, onCancel }) => {
  const isEditMode = !!companyId;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const logoWhiteInputRef = useRef<HTMLInputElement>(null);

  // ─── Form State ───
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null);
  const [theme, setTheme] = useState<CompanyTheme>({
    primaryColor: '#7b1113',
    logoUrl: '',
    iconUrl: '',
  });
  const [features, setFeatures] = useState<CompanyFeatures>({
    accounting: false,
    maps: true,
    aiAssistant: false,
    equipmentManagement: true,
  });
  const [auth, setAuth] = useState<CompanyAuth>({
    emailDomain: '@empresa.com',
    allowedRoles: ['technician', 'supervisor', 'admin'],
  });
  const [tabs, setTabs] = useState<TabConfig[]>([]);
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null); // Errors de carga (banner superior)
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; slug?: string; admin?: string }>({});
  const [saveErrorToast, setSaveErrorToast] = useState<string | null>(null); // Feedback elegante al guardar
  const [uploading, setUploading] = useState<'logo' | 'icon' | 'logoWhite' | null>(null);

  // Refs para enfocar el primer campo con error.
  const nameRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);

  // Load existing company data
  useEffect(() => {
    if (!companyId) {
      setTabs(DEFAULT_BUILT_IN_TABS.map((t, i) => ({ ...t, id: `tab_${i}`, order: i })));
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const company = await adminService.getCompany(companyId);
        if (company) {
          setName(company.name || '');
          setSlug(company.slug || '');
          setTheme(company.theme || theme);
          setFeatures(company.features || features);
          setAuth(company.auth || auth);
          setTabs(company.tabs?.length ? company.tabs : DEFAULT_BUILT_IN_TABS.map((t, i) => ({ ...t, id: `tab_${i}`, order: i })));
        } else {
          setError('Empresa no encontrada.');
        }
      } catch (err) {
        console.error('[AdminForm] Error loading company:', err);
        setError('Error al cargar datos de la empresa.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [companyId]);

  // ─── Tab Management ───
  const addTab = useCallback(() => {
    const newTab: TabConfig = {
      ...EMPTY_TAB,
      id: `tab_${Date.now()}`,
      order: tabs.length,
    };
    setTabs(prev => [...prev, newTab]);
  }, [tabs.length]);

  const removeTab = useCallback((tabId: string) => {
    setTabs(prev => prev.filter(t => t.id !== tabId));
  }, []);

  const moveTab = useCallback((index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tabs.length) return;
    setTabs(prev => {
      const updated = [...prev];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      return updated.map((t, i) => ({ ...t, order: i }));
    });
  }, [tabs.length]);

  const updateTab = useCallback((tabId: string, updates: Partial<TabConfig>) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...updates } : t));
  }, []);

  // ─── Image Upload ───
  const handleImageUpload = async (file: File, type: 'logo' | 'icon' | 'logoWhite') => {
    const targetId = companyId ?? createdCompanyId;
    if (!targetId) {
      // For new companies, save first then upload
      alert('Guarda la empresa primero antes de subir imágenes.');
      return;
    }
    setUploading(type);
    try {
      const url = await adminService.uploadCompanyImage(file, targetId, type);
      setTheme(prev => ({
        ...prev,
        [type === 'logo' ? 'logoUrl' : type === 'icon' ? 'iconUrl' : 'logoWhiteUrl']: url,
      }));
    } catch (err) {
      console.error(`[AdminForm] Error uploading ${type}:`, err);
      alert(`Error al subir la imagen: ${type}`);
    } finally {
      setUploading(null);
    }
  };

  const triggerFileInput = (type: 'logo' | 'icon' | 'logoWhite') => {
    if (type === 'logo') fileInputRef.current?.click();
    else if (type === 'icon') iconInputRef.current?.click();
    else logoWhiteInputRef.current?.click();
  };

  // ─── Slug auto-generation ───
  const handleNameChange = (value: string) => {
    setName(value);
    if (!isEditMode && !slug) {
      setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    }
  };

  // ─── Save ───
  const handleSave = async () => {
    // ── Validación por campo: marca el error en el campo + toast elegante + foco al primero ──
    // Solo el nombre se exige de verdad: el slug, si falta (p. ej. empresas
    // sembradas), se deriva del nombre automáticamente para permitir guardar
    // actualizaciones parciales sin completar toda la información obligatoria.
    const newErrors: typeof fieldErrors = {};
    if (!name.trim()) newErrors.name = 'El nombre de la empresa es obligatorio.';

    // En modo crear, el admin inicial es obligatorio.
    if (!isEditMode && (!adminUsername.trim() || adminPassword.length < 6)) {
      newErrors.admin = 'Crea el administrador inicial: usuario y contraseña (mínimo 6 caracteres).';
    }

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      setSaveErrorToast(Object.values(newErrors)[0]);
      if (newErrors.name) nameRef.current?.focus();
      return;
    }

    setFieldErrors({});
    setSaveErrorToast(null);

    // Slug resuelto: usa el escrito, o si está vacío lo deriva del nombre.
    const resolvedSlug = slug.trim().toLowerCase() || slugify(name.trim());
    setSaving(true);
    setError(null);

    try {
      if (!isEditMode) {
        // Bootstrap completo: empresa + perfil Auth + fila users (service-role).
        const result = await adminService.bootstrapCompany({
          companyName: name.trim(),
          slug: resolvedSlug,
          username: adminUsername.trim().toLowerCase(),
          password: adminPassword,
          displayName: adminDisplayName.trim() || 'Administrador',
          role: 'admin',
        });
        if (!result.ok || !result.companyId) {
          setError(result.error || 'Error al crear la empresa.');
          return;
        }
        setCreatedCompanyId(result.companyId);

        // Persistir el resto de configuración (tema/features/tabs).
        await adminService.updateCompany(result.companyId, {
          theme,
          features,
          auth,
          tabs: tabs.filter(t => t.label.trim()),
        });

        alert(`Empresa creada. El administrador entra con:\n\nUsuario: ${result.email}\nContraseña: (la que definiste)`);
      } else if (companyId) {
        const companyData = {
          name: name.trim(),
          slug: resolvedSlug,
          theme,
          features,
          auth,
          tabs: tabs.filter(t => t.label.trim()), // Only save tabs with a label
        };
        await adminService.updateCompany(companyId, companyData);
      }
      onSaved(isEditMode ? 'Empresa actualizada correctamente.' : 'Empresa creada correctamente.');
    } catch (err) {
      console.error('[AdminForm] Error saving company:', err);
      setSaveErrorToast('No se pudo guardar la empresa. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      {/* Feedback elegante al intentar guardar (validación/error de servidor) */}
      <Toast message={saveErrorToast} variant="error" onDismiss={() => setSaveErrorToast(null)} />

      {/* Error de carga (banner) */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* ─── Basic Info ─── */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Building2 size={18} className="text-primary" /> Información General
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-xs font-bold text-gray-500">Nombre de la Empresa</label>
              <span className="text-[10px] font-bold text-red-500 px-1.5 py-0.5 rounded-full bg-red-50">Obligatorio</span>
              <InfoTip text="Nombre comercial de la empresa, tal como lo verán los usuarios al iniciar sesión y en la barra de navegación." />
            </div>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => { handleNameChange(e.target.value); if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: undefined })); }}
              placeholder="Ej: NavTickets"
              className={`w-full h-11 px-4 border rounded-xl focus:outline-none focus:ring-2 ${
                fieldErrors.name ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-200 focus:ring-primary/20'
              }`}
            />
            {fieldErrors.name && (
              <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-semibold">
                <AlertTriangle size={12} /> {fieldErrors.name}
              </p>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="text-xs font-bold text-gray-500">Slug (URL)</label>
              <span className="text-[10px] font-bold text-sky-500 px-1.5 py-0.5 rounded-full bg-sky-50">Auto</span>
              <InfoTip text="Identificador único de la empresa para la URL. Opcional: si lo dejas vacío se genera solo a partir del nombre. Solo minúsculas, números y guiones." side="top" />
            </div>
            <input
              ref={slugRef}
              type="text"
              value={slug}
              onChange={e => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); if (fieldErrors.slug) setFieldErrors(prev => ({ ...prev, slug: undefined })); }}
              placeholder="Ej: navtickets"
              className={`w-full h-11 px-4 border rounded-xl focus:outline-none focus:ring-2 ${
                fieldErrors.slug ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-200 focus:ring-primary/20'
              }`}
            />
            {fieldErrors.slug && (
              <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-semibold">
                <AlertTriangle size={12} /> {fieldErrors.slug}
              </p>
            )}
            <p className="text-[10px] text-gray-400 mt-1">Identificador único para la URL. Sin espacios.</p>
          </div>
        </div>
      </section>

      {/* ─── Initial Admin (solo en modo crear) ─── */}
      {!isEditMode && (
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Shield size={18} className="text-primary" /> Administrador Inicial
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Se crean la empresa y la cuenta del primer admin. El login usará usuario{'{dominio}'}
            (ej. {adminUsername || 'admin'}@navas.com).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs font-bold text-gray-500">Usuario</label>
                <span className="text-[10px] font-bold text-red-500 px-1.5 py-0.5 rounded-full bg-red-50">Obligatorio</span>
                <InfoTip text="Nombre de usuario con el que el administrador iniciará sesión. Sin espacios; ejemplo: admin. El login se hará como usuario@dominio." side="bottom" />
              </div>
              <input
                type="text"
                value={adminUsername}
                onChange={e => setAdminUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                placeholder="Ej: admin"
                className="w-full h-11 px-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs font-bold text-gray-500">Nombre</label>
                <InfoTip text="Nombre visible del administrador en la app. Si lo dejas vacío se usará 'Administrador'." side="bottom" />
              </div>
              <input
                type="text"
                value={adminDisplayName}
                onChange={e => setAdminDisplayName(e.target.value)}
                placeholder="Ej: Administrador"
                className="w-full h-11 px-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs font-bold text-gray-500">Contraseña (mín. 6)</label>
                <span className="text-[10px] font-bold text-red-500 px-1.5 py-0.5 rounded-full bg-red-50">Obligatorio</span>
                <InfoTip text="La contraseña inicial del administrador. Mínimo 6 caracteres. Se usa junto con el usuario para el primer ingreso." side="bottom" />
              </div>
              <input
                type="password"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-11 px-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          {fieldErrors.admin && (
            <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <AlertTriangle size={16} /> {fieldErrors.admin}
            </div>
          )}
        </section>
      )}

      {/* ─── Theme ─── */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Palette size={18} className="text-primary" /> Tema y Branding
        </h2>
        <div className="space-y-4">
          {/* Primary Color */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">Color Principal</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={theme.primaryColor}
                onChange={e => setTheme(prev => ({ ...prev, primaryColor: e.target.value }))}
                className="w-12 h-12 rounded-xl border border-gray-200 cursor-pointer"
              />
              <span className="text-sm font-mono text-gray-600">{theme.primaryColor}</span>
            </div>
          </div>

          {/* Logo */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">Logo (fondo claro)</label>
            <div className="flex items-center gap-3">
              {theme.logoUrl && (
                <img src={theme.logoUrl} alt="Logo" className="w-16 h-16 object-contain rounded-xl border border-gray-100" />
              )}
              <button
                type="button"
                onClick={() => triggerFileInput('logo')}
                disabled={uploading === 'logo'}
                className="h-11 px-4 bg-gray-100 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {uploading === 'logo' ? 'Subiendo...' : theme.logoUrl ? 'Cambiar' : 'Subir Logo'}
              </button>
              {theme.logoUrl && (
                <button
                  type="button"
                  onClick={() => setTheme(prev => ({ ...prev, logoUrl: '' }))}
                  className="p-2 text-gray-400 hover:text-red-500"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'logo')} />
          </div>

          {/* Logo White */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">Logo (fondo oscuro, opcional)</label>
            <div className="flex items-center gap-3">
              {theme.logoWhiteUrl && (
                <img src={theme.logoWhiteUrl} alt="Logo White" className="w-16 h-16 object-contain rounded-xl border border-gray-800 bg-gray-800" />
              )}
              <button
                type="button"
                onClick={() => triggerFileInput('logoWhite')}
                disabled={uploading === 'logoWhite'}
                className="h-11 px-4 bg-gray-100 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {uploading === 'logoWhite' ? 'Subiendo...' : theme.logoWhiteUrl ? 'Cambiar' : 'Subir'}
              </button>
              {theme.logoWhiteUrl && (
                <button onClick={() => setTheme(prev => ({ ...prev, logoWhiteUrl: '' }))} className="p-2 text-gray-400 hover:text-red-500"><X size={16} /></button>
              )}
            </div>
            <input ref={logoWhiteInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'logoWhite')} />
          </div>

          {/* Icon */}
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">Icono de App</label>
            <div className="flex items-center gap-3">
              {theme.iconUrl && (
                <img src={theme.iconUrl} alt="Icon" className="w-12 h-12 object-contain rounded-xl border border-gray-100" />
              )}
              <button
                type="button"
                onClick={() => triggerFileInput('icon')}
                disabled={uploading === 'icon'}
                className="h-11 px-4 bg-gray-100 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                {uploading === 'icon' ? 'Subiendo...' : theme.iconUrl ? 'Cambiar' : 'Subir Icono'}
              </button>
              {theme.iconUrl && (
                <button onClick={() => setTheme(prev => ({ ...prev, iconUrl: '' }))} className="p-2 text-gray-400 hover:text-red-500"><X size={16} /></button>
              )}
            </div>
            <input ref={iconInputRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'icon')} />
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Layers size={18} className="text-primary" /> Funcionalidades
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            { key: 'accounting' as const, label: 'Contabilidad' },
            { key: 'maps' as const, label: 'Mapas' },
            { key: 'aiAssistant' as const, label: 'Asistente IA' },
            { key: 'equipmentManagement' as const, label: 'Gestión Máquinas' },
          ]).map(feat => (
            <label key={feat.key} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="checkbox"
                checked={features[feat.key]}
                onChange={e => setFeatures(prev => ({ ...prev, [feat.key]: e.target.checked }))}
                className="w-4 h-4 rounded accent-primary"
              />
              <span className="text-sm font-medium text-gray-700">{feat.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* ─── Auth ─── */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Shield size={18} className="text-primary" /> Autenticación
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">Dominio de Email</label>
            <input
              type="text"
              value={auth.emailDomain}
              onChange={e => setAuth(prev => ({ ...prev, emailDomain: e.target.value }))}
              placeholder="@miempresa.com"
              className="w-full h-11 px-4 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-[10px] text-gray-400 mt-1">Ej: @navas.com — el login usará username{'{dominio}'}</p>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 mb-1 block">Roles Permitidos</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ALL_ROLES.map(role => (
                <label key={role} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={auth.allowedRoles.includes(role)}
                    onChange={e => {
                      if (e.target.checked) {
                        setAuth(prev => ({ ...prev, allowedRoles: [...prev.allowedRoles, role] }));
                      } else {
                        setAuth(prev => ({ ...prev, allowedRoles: prev.allowedRoles.filter(r => r !== role) }));
                      }
                    }}
                    className="w-3 h-3 accent-primary"
                  />
                  {ROLE_LABELS[role] || role}
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Tabs Editor ─── */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
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
        <p className="text-xs text-gray-400 mb-4">
          Define las pestañas que verán los usuarios. Pueden ser componentes internos, iframes, contenido markdown o enlaces externos.
        </p>

        {tabs.length === 0 ? (
          <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl">
            <Layers size={24} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm font-bold">Sin pestañas personalizadas</p>
            <p className="text-xs mt-1">Añade la primera pestaña para comenzar.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tabs.map((tab, index) => (
              <div key={tab.id} className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors bg-gray-50/30">
                {/* Tab Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">{index + 1}</span>
                    <input
                      type="text"
                      value={tab.label}
                      onChange={e => updateTab(tab.id, { label: e.target.value })}
                      placeholder="Nombre de la pestaña"
                      className="font-bold text-sm bg-transparent border-b border-transparent focus:border-primary focus:outline-none px-1 py-0.5 min-w-[120px]"
                    />
                    {/* Indicador de obligatoriedad: el título es el campo obligatorio de cada pestaña */}
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
                    <button type="button" onClick={() => moveTab(index, -1)} disabled={index === 0} className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><MoveUp size={14} /></button>
                    <button type="button" onClick={() => moveTab(index, 1)} disabled={index === tabs.length - 1} className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><MoveDown size={14} /></button>
                    <button type="button" onClick={() => removeTab(tab.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
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
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Icono (lucide-react)</span>
                      <span className="text-[9px] font-bold text-gray-300 uppercase">Opcional</span>
                      <InfoTip text="Icono de la pestaña en la barra de navegación, usando un nombre válido de lucide-react (p. ej. Home, Users, Settings2, Map, ClipboardList). Si no lo sabes, déjalo vacío: se usará un icono por defecto." side="top" />
                    </div>
                    <input
                      type="text"
                      value={tab.icon}
                      onChange={e => updateTab(tab.id, { icon: e.target.value })}
                      placeholder="Home, Settings, Users..."
                      className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  {/* Route */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Ruta</span>
                      <span className="text-[9px] font-bold text-gray-300 uppercase">Opcional</span>
                      <InfoTip text="Ruta dentro de la app a la que navega la pestaña (debe empezar con '/'). Para componentes internos (Órdenes, Clientes, etc.) usa la ruta real del proyecto: /, /orders, /clients, /equipment, /users, /map, /tasks. No la cambies por algo que no exista o la pestaña no abrirá." side="top" />
                    </div>
                    <input
                      type="text"
                      value={tab.route}
                      onChange={e => updateTab(tab.id, { route: e.target.value.startsWith('/') ? e.target.value : `/${e.target.value}` })}
                      placeholder="/custom/mi-pagina"
                      className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  {/* Content (for iframe, markdown, external) */}
                  {tab.type !== 'built-in' && (
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                        {tab.type === 'iframe' ? 'URL del Iframe' : tab.type === 'external' ? 'URL Externa' : 'Contenido Markdown'}
                      </label>
                      {tab.type === 'markdown' ? (
                        <textarea
                          value={tab.content || ''}
                          onChange={e => updateTab(tab.id, { content: e.target.value })}
                          placeholder="# Mi contenido en Markdown"
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
                        />
                      ) : (
                        <input
                          type="url"
                          value={tab.content || ''}
                          onChange={e => updateTab(tab.id, { content: e.target.value })}
                          placeholder={tab.type === 'iframe' ? 'https://ejemplo.com/mi-pagina' : 'https://ejemplo.com'}
                          className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      )}
                    </div>
                  )}
                  {/* Built-in component selector */}
                  {tab.type === 'built-in' && (
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Componente</label>
                      <select
                        value={tab.builtInComponent || 'dashboard'}
                        onChange={e => updateTab(tab.id, { builtInComponent: e.target.value })}
                        className="w-full h-9 px-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                      >
                        {BUILT_IN_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {/* Roles */}
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Roles que pueden ver esta pestaña</label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {ALL_ROLES.filter(r => auth.allowedRoles.includes(r)).map(role => (
                        <label key={role} className="flex items-center gap-1 px-2 py-1 rounded-md border border-gray-200 cursor-pointer text-[10px] font-medium">
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
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tab.enabled}
                        onChange={e => updateTab(tab.id, { enabled: e.target.checked })}
                        className="w-3.5 h-3.5 accent-primary"
                      />
                      Habilitado
                    </label>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer">
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

      {/* ─── Action Buttons ─── */}
      {/* z-[60]: por encima de la barra de navegación inferior (z-50) para que el
          botón de guardar siempre sea visible en móvil. — 2026-08-25 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-200 p-4 z-[60]">
        <div className="max-w-4xl mx-auto flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="h-12 px-6 bg-gray-100 rounded-xl font-bold text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="h-12 px-6 bg-primary text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-primary/20 hover:opacity-90 transition-all disabled:opacity-50"
          >
            {saving ? (
              <><div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> Guardando...</>
            ) : (
              <><Save size={18} /> {isEditMode ? 'Actualizar Empresa' : 'Crear Empresa'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompanyForm;