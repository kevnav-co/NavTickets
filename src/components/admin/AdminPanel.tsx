// src/components/admin/AdminPanel.tsx
// Panel de administración role-aware (Fase 4 self-serve):
//  - super_admin → gestión multi-tenant (lista de empresas, crear/editar/usuarios)
//  - admin/developer → configuración del branding de SU propia empresa (CompanyForm
//    con su companyId; las secciones de identidad quedan ocultas y el DB bloquea
//    name/slug/auth vía trigger migración 012). Con features.aiAssistant aparece
//    además la pestaña «Asistente» (horario, servicios, enlace y QR), enlazable
//    como /admin?seccion=asistente.

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Shield, ArrowLeft, Building2, Bot, History } from 'lucide-react';
import CompanyList from './CompanyList';
import CompanyForm from './CompanyForm';
import CompanyUserManager from './CompanyUserManager';
import Toast from '../ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';

// Solo lo cargan las empresas con el asistente activado.
const AssistantSettingsSection = lazy(() => import('./assistant/AssistantSettingsSection'));
// Solo el super_admin.
const AuditLog = lazy(() => import('./AuditLog'));

type AdminView = 'list' | 'form' | 'users';
type SelfSection = 'empresa' | 'asistente';
type SuperSection = 'empresas' | 'auditoria';

const AdminPanel: React.FC = () => {
  const { currentUser, startImpersonation } = useAuth();
  const { company } = useCompany();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const ownCompanyId = currentUser?.companyId ?? null;
  // Self-serve: la pestaña «Asistente» aparece solo con features.aiAssistant.
  const assistantEnabled = !isSuperAdmin && !!company?.features?.aiAssistant;
  const selfSection: SelfSection = assistantEnabled && searchParams.get('seccion') === 'asistente' ? 'asistente' : 'empresa';
  const setSelfSection = (s: SelfSection) =>
    setSearchParams(s === 'asistente' ? { seccion: 'asistente' } : {}, { replace: true });
  const [assistantVisited, setAssistantVisited] = useState(false);
  useEffect(() => {
    if (selfSection === 'asistente') setAssistantVisited(true);
  }, [selfSection]);

  // Super_admin: pestañas Empresas / Auditoría (/admin?seccion=auditoria).
  const superSection: SuperSection = isSuperAdmin && searchParams.get('seccion') === 'auditoria' ? 'auditoria' : 'empresas';
  const setSuperSection = (s: SuperSection) =>
    setSearchParams(s === 'auditoria' ? { seccion: 'auditoria' } : {}, { replace: true });

  const [view, setView] = useState<AdminView>('list');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handleEdit = (companyId: string) => {
    setEditingCompanyId(companyId);
    setView('form');
  };

  const handleCreate = () => {
    setEditingCompanyId(null);
    setView('form');
  };

  const handleManageUsers = (companyId: string) => {
    setSelectedCompanyId(companyId);
    setView('users');
  };

  // Vista previa: el super_admin entra a la empresa como un admin de esa empresa.
  // `currentUser` pasa a ser el admin efectivo → DataContext/routing/nav re-escalan
  // al tenant. Se navega a '/' (con rol 'admin' ya no redirige a /admin).
  const handlePreview = async (companyId: string) => {
    const ok = await startImpersonation(companyId);
    if (ok) {
      navigate('/', { replace: true });
    } else {
      setToast('No se pudo iniciar la vista previa. Verifica tu sesión.');
    }
  };

  const handleFormSaved = (message: string) => {
    setView('list');
    setToast(message);
  };

  const handleFormCancel = () => {
    setView('list');
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedCompanyId(null);
    setEditingCompanyId(null);
  };

  if (!currentUser) {
    return <div className="p-6 text-sm text-ink-faint">Cargando sesión...</div>;
  }

  return (
    <div className="w-full h-full max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {isSuperAdmin && view !== 'list' && (
          <button
            onClick={handleBackToList}
            className="p-2 hover:bg-sunken rounded-xl transition-colors"
          >
            <ArrowLeft size={20} className="text-ink-soft" />
          </button>
        )}
        {isSuperAdmin ? <Shield size={28} className="text-primary" /> : <Building2 size={28} className="text-primary" />}
        <div>
          <h1 className="text-xl font-black text-ink">
            {isSuperAdmin ? 'Panel de Administración' : 'Configuración de mi empresa'}
          </h1>
          <p className="text-xs text-ink-soft">
            {isSuperAdmin
              ? 'Gestión multi-tenant del sistema'
              : selfSection === 'asistente'
                ? 'Horario, servicios y enlace del asistente de servicio técnico'
                : 'Personaliza el branding de tu empresa'}
          </p>
        </div>
      </div>

      {assistantEnabled && (
        <div className="max-w-4xl mx-auto mb-5 flex gap-1 p-1 bg-sunken rounded-xl w-fit" role="tablist" aria-label="Secciones de configuración">
          {([
            { id: 'empresa', label: 'Empresa', icon: Building2 },
            { id: 'asistente', label: 'Asistente', icon: Bot },
          ] as const).map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selfSection === t.id}
              onClick={() => setSelfSection(t.id)}
              className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-bold transition-colors ${
                selfSection === t.id ? 'bg-raised text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
              }`}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
      )}

      {isSuperAdmin && view === 'list' && (
        <div className="mb-5 flex gap-1 p-1 bg-sunken rounded-xl w-fit" role="tablist" aria-label="Secciones del panel">
          {([
            { id: 'empresas', label: 'Empresas', icon: Building2 },
            { id: 'auditoria', label: 'Auditoría', icon: History },
          ] as const).map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={superSection === t.id}
              onClick={() => setSuperSection(t.id)}
              className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-lg text-sm font-bold transition-colors ${
                superSection === t.id ? 'bg-raised text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
              }`}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
      )}

      {isSuperAdmin ? (
        <>
          {view === 'list' && superSection === 'empresas' && (
            <CompanyList
              onEdit={handleEdit}
              onCreate={handleCreate}
              onManageUsers={handleManageUsers}
              onPreview={handlePreview}
              onNotify={setToast}
            />
          )}

          {view === 'list' && superSection === 'auditoria' && (
            <Suspense fallback={<div className="py-20 text-center text-sm text-ink-faint">Cargando…</div>}>
              <AuditLog />
            </Suspense>
          )}

          {view === 'form' && (
            <CompanyForm
              companyId={editingCompanyId}
              onSaved={handleFormSaved}
              onCancel={handleFormCancel}
            />
          )}

          {view === 'users' && selectedCompanyId && (
            <CompanyUserManager
              companyId={selectedCompanyId}
              onBack={handleBackToList}
            />
          )}
        </>
      ) : (
        // Self-serve: el admin/developer edita SOLO su propia empresa. Las dos
        // secciones quedan montadas (la inactiva, oculta) para no perder cambios
        // sin guardar al cambiar de pestaña.
        <>
          <div hidden={selfSection !== 'empresa'}>
            <CompanyForm
              key={ownCompanyId ?? 'self'}
              companyId={ownCompanyId}
              onSaved={msg => {
                setToast(msg);
                // Tras guardar la configuración de la propia empresa, volver al
                // inicio de la app (el toast alcanza a mostrarse ~un segundo).
                setTimeout(() => navigate('/'), 900);
              }}
              onCancel={() => navigate('/')}
            />
          </div>
          {assistantEnabled && (selfSection === 'asistente' || assistantVisited) && (
            <div hidden={selfSection !== 'asistente'}>
              <Suspense fallback={<div className="py-20 text-center text-sm text-ink-faint">Cargando…</div>}>
                <AssistantSettingsSection key={ownCompanyId ?? 'self'} onSaved={setToast} />
              </Suspense>
            </div>
          )}
        </>
      )}

      {/* Toast de confirmación */}
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};

export default AdminPanel;