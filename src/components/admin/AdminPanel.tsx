// src/components/admin/AdminPanel.tsx
// Main layout for the Super Admin panel with internal navigation.

import React, { useState } from 'react';
import { Shield, ArrowLeft } from 'lucide-react';
import CompanyList from './CompanyList';
import CompanyForm from './CompanyForm';
import CompanyUserManager from './CompanyUserManager';

type AdminView = 'list' | 'form' | 'users';

const AdminPanel: React.FC = () => {
  const [view, setView] = useState<AdminView>('list');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);

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

  const handleFormSaved = () => {
    setView('list');
  };

  const handleFormCancel = () => {
    setView('list');
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedCompanyId(null);
    setEditingCompanyId(null);
  };

  return (
    <div className="w-full h-full max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {view !== 'list' && (
          <button
            onClick={handleBackToList}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-500" />
          </button>
        )}
        <Shield size={28} className="text-primary" />
        <div>
          <h1 className="text-xl font-black text-gray-900">Panel de Administración</h1>
          <p className="text-xs text-gray-500">Gestión multi-tenant del sistema</p>
        </div>
      </div>

      {/* View Router */}
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
    </div>
  );
};

export default AdminPanel;