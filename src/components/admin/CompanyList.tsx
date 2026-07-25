// src/components/admin/CompanyList.tsx
// Lists all companies with search, create, edit, delete, and user management.

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Building2, Plus, Edit3, Users, Trash2, Palette, Globe, AlertTriangle } from 'lucide-react';
import { CompanyConfig } from '../../types/company';
import * as adminService from '../../services/adminService';

interface CompanyListProps {
  onEdit: (companyId: string) => void;
  onCreate: () => void;
  onManageUsers: (companyId: string) => void;
}

const CompanyList: React.FC<CompanyListProps> = ({ onEdit, onCreate, onManageUsers }) => {
  const [companies, setCompanies] = useState<CompanyConfig[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
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
    const q = searchTerm.toLowerCase();
    if (!q) return companies;
    return companies.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.slug?.toLowerCase().includes(q) ||
      c.id?.toLowerCase().includes(q)
    );
  }, [companies, searchTerm]);

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
      {/* Search + Create */}
      <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm pb-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle size={16} />
            {error}
            <button onClick={loadCompanies} className="ml-auto text-red-600 underline text-xs font-bold">Reintentar</button>
          </div>
        )}

        <div className="relative mb-3">
          <span className="absolute inset-y-0 left-0 pl-4 flex items-center">
            <Search className="text-gray-400" size={18} />
          </span>
          <input
            type="text"
            placeholder="Buscar empresas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-12 bg-white border border-gray-200 rounded-xl pl-12 pr-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <button
          onClick={onCreate}
          className="w-full h-12 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-primary/20"
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
            <p className="font-bold">{searchTerm ? 'No se encontraron empresas.' : 'No hay empresas registradas.'}</p>
            {!searchTerm && (
              <p className="text-sm mt-1">Crea la primera empresa para comenzar.</p>
            )}
          </div>
        ) : (
          filtered.map(company => (
            <div
              key={company.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                {/* Color indicator */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: company.theme?.primaryColor || '#7b1113' }}
                >
                  {company.name?.charAt(0)?.toUpperCase() || '?'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 truncate">{company.name}</h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Globe size={12} />
                      {company.slug || '—'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Palette size={12} />
                      {company.theme?.primaryColor || '—'}
                    </span>
                    <span className="bg-gray-100 px-2 py-0.5 rounded-full font-mono text-[10px]">
                      {company.id?.substring(0, 8)}...
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => onManageUsers(company.id)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Gestionar Usuarios"
                  >
                    <Users size={18} />
                  </button>
                  <button
                    onClick={() => onEdit(company.id)}
                    className="p-2 text-gray-400 hover:text-primary hover:bg-red-50 rounded-lg transition-colors"
                    title="Editar Empresa"
                  >
                    <Edit3 size={18} />
                  </button>
                  {deleteConfirm === company.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(company.id)}
                        className="p-2 text-white bg-red-600 rounded-lg transition-colors text-xs font-bold"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="p-2 text-gray-500 bg-gray-100 rounded-lg transition-colors text-xs"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(company.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar Empresa"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CompanyList;