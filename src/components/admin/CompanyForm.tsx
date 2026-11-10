import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Save, Shield, AlertTriangle, Building2 } from 'lucide-react';
import { CompanyTheme, CompanyFeatures, CompanyAuth, TabConfig } from '../../types/company';
import { DEFAULT_BUILT_IN_TABS } from '../../types/company';
import * as adminService from '../../services/adminService';
import { useAuth } from '../../context/AuthContext';
import Toast from '../ui/Toast';
import InfoTip from '../ui/InfoTip';
import { safeUrl } from '../../utils/html';
import ThemeSection from './company/ThemeSection';
import FeaturesSection from './company/FeaturesSection';
import TabsEditor, { ALL_ROLES, ROLE_LABELS } from './company/TabsEditor';

interface CompanyFormProps {
  companyId: string | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}

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

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const CompanyForm: React.FC<CompanyFormProps> = ({ companyId, onSaved, onCancel }) => {
  const isEditMode = !!companyId;
  const { currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'super_admin';

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
    excelUpload: true,
    cuenti: true,
  });
  const [auth, setAuth] = useState<CompanyAuth>({
    emailDomain: '@empresa.com',
    allowedRoles: ['technician', 'supervisor', 'admin'],
  });
  const [tabs, setTabs] = useState<TabConfig[]>([]);
  const [loading, setLoading] = useState(isEditMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; slug?: string; admin?: string; tabs?: string }>({});
  const [saveErrorToast, setSaveErrorToast] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'logo' | 'icon' | 'logoWhite' | 'favicon' | null>(null);

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
          setTheme(prev => ({ ...prev, ...(company.theme || {}) }));
          setFeatures(prev => ({ ...prev, ...(company.features || {}) }));
          setAuth(prev => ({ ...prev, ...(company.auth || {}) }));
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
  const handleImageUpload = async (file: File, type: 'logo' | 'icon' | 'logoWhite' | 'favicon') => {
    const targetId = companyId ?? createdCompanyId;
    if (!targetId) {
      alert('Guarda la empresa primero antes de subir imágenes.');
      return;
    }
    setUploading(type);
    try {
      const url = await adminService.uploadCompanyImage(file, targetId, type);
      const field = type === 'logo' ? 'logoUrl' : type === 'icon' ? 'iconUrl' : type === 'logoWhite' ? 'logoWhiteUrl' : 'faviconUrl';
      setTheme(prev => ({ ...prev, [field]: url }));
    } catch (err) {
      console.error(`[AdminForm] Error uploading ${type}:`, err);
      alert(`Error al subir la imagen: ${type}`);
    } finally {
      setUploading(null);
    }
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
    const newErrors: typeof fieldErrors = {};
    if (!name.trim()) newErrors.name = 'El nombre de la empresa es obligatorio.';

    if (!isEditMode && (!adminUsername.trim() || adminPassword.length < 6)) {
      newErrors.admin = 'Crea el administrador inicial: usuario y contraseña (mínimo 6 caracteres).';
    }

    const badTab = tabs.find(t => (t.type === 'iframe' || t.type === 'external') && !safeUrl(t.content || '', ['https:']));
    if (badTab) newErrors.tabs = `La pestaña "${badTab.label || badTab.id}" debe usar una URL https:// válida.`;

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      setSaveErrorToast(Object.values(newErrors)[0]);
      if (newErrors.name) nameRef.current?.focus();
      return;
    }

    setFieldErrors({});
    setSaveErrorToast(null);

    const resolvedSlug = slug.trim().toLowerCase() || slugify(name.trim());
    setSaving(true);
    setError(null);

    try {
      if (!isEditMode) {
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

        await adminService.updateCompany(result.companyId, {
          theme,
          features,
          auth,
          tabs: tabs.filter(t => t.label.trim()),
        });

        alert(`Empresa creada. El administrador entra con:\n\nUsuario: ${result.email}\nContraseña: (la que definiste)`);
      } else if (companyId) {
        const companyData = isSuperAdmin
          ? { name: name.trim(), slug: resolvedSlug, theme, features, auth, tabs: tabs.filter(t => t.label.trim()) }
          : { theme, features, tabs: tabs.filter(t => t.label.trim()) };
        await adminService.updateCompany(companyId, companyData);
      }
      onSaved(isEditMode ? 'Empresa actualizada correctamente.' : 'Empresa creada correctamente.');
    } catch (err) {
      console.error('[AdminForm] Error saving company:', err);
      const detail = err instanceof Error ? err.message : 'error desconocido';
      setSaveErrorToast(`No se pudo guardar la empresa: ${detail}`);
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
      <Toast message={saveErrorToast} variant="error" onDismiss={() => setSaveErrorToast(null)} />

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* ─── Basic Info (solo super_admin) ─── */}
      {isSuperAdmin && (
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
      )}

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
      <ThemeSection
        theme={theme}
        setTheme={setTheme}
        companyId={companyId}
        createdCompanyId={createdCompanyId}
        uploading={uploading}
        onImageUpload={handleImageUpload}
      />

      {/* ─── Features ─── */}
      <FeaturesSection features={features} setFeatures={setFeatures} />

      {/* ─── Auth (solo super_admin) ─── */}
      {isSuperAdmin && (
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
      )}

      {/* ─── Tabs Editor ─── */}
      <TabsEditor
        tabs={tabs}
        addTab={addTab}
        removeTab={removeTab}
        moveTab={moveTab}
        updateTab={updateTab}
        allowedRoles={auth.allowedRoles}
      />

      {/* ─── Action Buttons ─── */}
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
