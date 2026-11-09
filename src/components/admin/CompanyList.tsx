// src/components/admin/CompanyList.tsx
// Lists all companies with search, filters, create, edit, delete, and user management.

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Building2, Plus, AlertTriangle } from 'lucide-react';
import { CompanyConfig } from '../../types/company';
import * as adminService from '../../services/adminService';
import CompanyCard from './CompanyCard';

interface CompanyListProps {
  onEdit: (companyId: string) => void;
  onCreate: () => void;
  onManageUsers: (companyId: string) => void;
  onPreview: (companyId: string) => void;
}

type StatusFilter = 'all' | 'active' | 'suspended';

const CompanyList: React.FC<CompanyListProps> = ({ onEdit, onCreate, onManageUsers, onPreview }) => {
  const [companies, setCompanies] = useState<(CompanyConfig & { status?: 'active' | 'suspended'; userCount?: number; lastActivityAt?: string })[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadCompanies = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.listCompanies();
      setCompanies(data);
    } catch (err) {
      console.error('[Admin] Error loading companies:', err);
      setError('Error al cargar empresas. Verifica tu conexión e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const filtered = useMemo(() => {
    let result = [...companies];

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.slug?.toLowerCase().includes(q) ||
        c.id?.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(c => c.status === statusFilter);
    }

    return result;
  }, [companies, searchTerm, statusFilter]);

  const handleDelete = async (companyId: string) => {
    try {
      await adminService.deleteCompany(companyId);
      setCompanies(prev => prev.filter(c => c.id !== companyId));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('[Admin] Error deleting company:', err);
      alert('Error al eliminar la empresa.');
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
    <div>
      {/* Search + Filters + Create */}
      <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm pb-4 space-y-3">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle size={16} />
            {error}
            <button onClick={loadCompanies} className="ml-auto text-red-600 underline text-xs font-bold">
              Reintentar
            </button>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <span className="absolute inset-y-0 left-0 pl-4 flex items-center">
            <Search className="text-gray-400" size={18} />
          </span>
          <input
            type="text"
            placeholder="Buscar por nombre, slug o ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-12 bg-white border border-gray-200 rounded-xl pl-12 pr-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Estado:</span>
          <div className="flex gap-2 flex-1">
            {(['all', 'active', 'suspended'] as StatusFilter[]).map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {status === 'all' ? 'Todas' : status === 'active' ? 'Activas' : 'Suspendidas'}
              </button>
            ))}
          </div>
        </div>

        {/* Create Button */}
        <button
          onClick={onCreate}
          className="w-full h-12 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-shadow"
        >
          <Plus size={18} />
          Nueva Empresa
        </button>
      </div>

      {/* Company Cards */}
      <div className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-50" />
            <p className="font-bold">
              {searchTerm || statusFilter !== 'all' ? 'No se encontraron empresas.' : 'No hay empresas registradas.'}
            </p>
            {!searchTerm && statusFilter === 'all' && (
              <p className="text-sm mt-1">Crea la primera empresa para comenzar.</p>
            )}
          </div>
        ) : (
          filtered.map(company => (
            <CompanyCard
              key={company.id}
              company={company}
              onEdit={onEdit}
              onManageUsers={onManageUsers}
              onPreview={onPreview}
              onDelete={handleDelete}
              deleteConfirm={deleteConfirm}
              setDeleteConfirm={setDeleteConfirm}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default CompanyList;