// src/components/admin/AdminPanel.tsx
// Panel de administración role-aware (Fase 4 self-serve):
//  - super_admin → gestión multi-tenant (lista de empresas, crear/editar/usuarios)
//  - admin/developer → configuración del branding de SU propia empresa (CompanyForm
//    con su companyId; las secciones de identidad quedan ocultas y el DB bloquea
//    name/slug/auth vía trigger migración 012).

import React, { useState } from 'react';
import { Shield, ArrowLeft, Building2 } from 'lucide-react';
import CompanyList from './CompanyList';
import CompanyForm from './CompanyForm';
import CompanyUserManager from './CompanyUserManager';
import Toast from '../ui/Toast';
import { useAuth } from '../../context/AuthContext';

type AdminView = 'list' | 'form' | 'users';

const AdminPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const ownCompanyId = currentUser?.companyId ?? null;

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
    return <div className="p-6 text-sm text-gray-400">Cargando sesión...</div>;
  }

  return (
    <div className="w-full h-full max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {isSuperAdmin && view !== 'list' && (
          <button
            onClick={handleBackToList}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-500" />
          </button>
        )}
        {isSuperAdmin ? <Shield size={28} className="text-primary" /> : <Building2 size={28} className="text-primary" />}
        <div>
          <h1 className="text-xl font-black text-gray-900">
            {isSuperAdmin ? 'Panel de Administración' : 'Configuración de mi empresa'}
          </h1>
          <p className="text-xs text-gray-500">
            {isSuperAdmin ? 'Gestión multi-tenant del sistema' : 'Personaliza el branding de tu empresa'}
          </p>
        </div>
      </div>

      {isSuperAdmin ? (
        <>
          {view === 'list' && (
            <CompanyList
              onEdit={handleEdit}
              onCreate={handleCreate}
              onManageUsers={handleManageUsers}
            />
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
        // Self-serve: el admin/developer edita SOLO su propia empresa.
        <CompanyForm
          key={ownCompanyId ?? 'self'}
          companyId={ownCompanyId}
          onSaved={msg => setToast(msg)}
          onCancel={() => {}}
        />
      )}

      {/* Toast de confirmación */}
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};

export default AdminPanel;