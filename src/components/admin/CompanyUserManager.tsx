// src/components/admin/CompanyUserManager.tsx
// CRUD users for a specific company. Super admin can create, edit, and delete users.

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Search, Save, Trash2, AlertTriangle, ArrowLeft,
  UserPlus, Shield, HardHat, Code
} from 'lucide-react';
import { User } from '../../types';
import { CompanyConfig } from '../../types/company';
import * as adminService from '../../services/adminService';

interface CompanyUserManagerProps {
  companyId: string;
  onBack: () => void;
}

const ROLE_OPTIONS: { value: User['role']; label: string; icon: React.ReactNode }[] = [
  { value: 'technician', label: 'Técnico', icon: <HardHat size={14} /> },
  { value: 'supervisor', label: 'Supervisor', icon: <Shield size={14} /> },
  { value: 'admin', label: 'Admin', icon: <Shield size={14} /> },
  { value: 'aux_admin', label: 'Aux. Admin', icon: <Code size={14} /> },
];

const CompanyUserManager: React.FC<CompanyUserManagerProps> = ({ companyId, onBack }) => {
  const [company, setCompany] = useState<CompanyConfig | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New user form
  const [showForm, setShowForm] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', username: '', password: '', role: 'technician' as User['role'] });
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [companyData, userList] = await Promise.all([
        adminService.getCompany(companyId),
        adminService.listUsersByCompany(companyId),
      ]);
      if (companyData) setCompany(companyData);
      setUsers(userList);
    } catch (err) {
      console.error('[AdminUsers] Error loading data:', err);
      setError('Error al cargar datos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [companyId]);

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    if (!q) return users;
    return users.filter(u => u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q));
  }, [users, searchTerm]);

  const handleCreateUser = async () => {
    if (!formData.name.trim() || !formData.username.trim() || !formData.password.trim()) {
      alert('Nombre, usuario y contraseña son obligatorios.');
      return;
    }
    setSaving(true);
    try {
      const id = await adminService.adminCreateUser({
        ...formData,
        companyId,
      });
      setUsers(prev => [...prev, { id, ...formData, companyId } as unknown as User]);
      setShowForm(false);
      setFormData({ name: '', username: '', password: '', role: 'technician' });
    } catch (err) {
      console.error('[AdminUsers] Error creating user:', err);
      alert('Error al crear usuario.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditUser = async () => {
    if (!editUserId || !formData.name.trim() || !formData.username.trim()) return;
    setSaving(true);
    try {
      const updates: Partial<User> = { name: formData.name, username: formData.username, role: formData.role };
      if (formData.password) (updates as any).password = formData.password;
      await adminService.adminUpdateUser(editUserId, updates);
      setUsers(prev => prev.map(u => u.id === editUserId ? { ...u, ...updates } : u));
      setEditUserId(null);
      setShowForm(false);
      setFormData({ name: '', username: '', password: '', role: 'technician' });
    } catch (err) {
      console.error('[AdminUsers] Error updating user:', err);
      alert('Error al actualizar usuario.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!window.confirm(`¿Eliminar al usuario "${userName}"? Esta acción no se puede deshacer.`)) return;
    try {
      await adminService.adminDeleteUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      console.error('[AdminUsers] Error deleting user:', err);
      alert('Error al eliminar usuario.');
    }
  };

  const startEdit = (user: User) => {
    setFormData({ name: user.name, username: user.username, password: '', role: user.role });
    setEditUserId(user.id);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditUserId(null);
    setFormData({ name: '', username: '', password: '', role: 'technician' });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full" /></div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-sm" style={{ backgroundColor: company?.theme?.primaryColor || '#7b1113' }}>
          {company?.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div>
          <h2 className="font-bold text-gray-900">{company?.name || 'Empresa'}</h2>
          <p className="text-xs text-gray-500">{users.length} usuario{users.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
          <AlertTriangle size={16} /> {error}
          <button onClick={loadData} className="ml-auto text-red-600 underline text-xs font-bold">Reintentar</button>
        </div>
      )}

      {/* Search + Add */}
      <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm pb-4">
        <div className="relative mb-3">
          <span className="absolute inset-y-0 left-0 pl-4 flex items-center"><Search className="text-gray-400" size={18} /></span>
          <input type="text" placeholder="Buscar usuarios..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full h-11 bg-white border border-gray-200 rounded-xl pl-12 pr-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="w-full h-11 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-primary/20">
            <UserPlus size={18} /> Añadir Usuario
          </button>
        )}
      </div>

      {/* New/Edit User Form */}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 mb-4 space-y-3">
          <h3 className="font-bold text-sm text-gray-900">{editUserId ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="text" placeholder="Nombre completo" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <input type="text" placeholder="Usuario (username)" value={formData.username} onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))} className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <input type="password" placeholder={editUserId ? 'Nueva contraseña (dejar vacío)' : 'Contraseña'} value={formData.password} onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))} className="h-10 px-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map(ro => (
              <button key={ro.value} type="button" onClick={() => setFormData(prev => ({ ...prev, role: ro.value }))} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${formData.role === ro.value ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {ro.icon} {ro.label}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={cancelForm} className="h-9 px-4 bg-gray-100 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-200">Cancelar</button>
            <button onClick={editUserId ? handleEditUser : handleCreateUser} disabled={saving} className="h-9 px-4 bg-primary text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50">
              {saving ? 'Guardando...' : <><Save size={14} /> {editUserId ? 'Actualizar' : 'Crear'}</>}
            </button>
          </div>
        </div>
      )}

      {/* User List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Users size={32} className="mx-auto mb-2 opacity-50" />
            <p className="font-bold">{searchTerm ? 'No se encontraron usuarios.' : 'No hay usuarios en esta empresa.'}</p>
          </div>
        ) : (
          filtered.map(user => {
            const roleConfig = ROLE_OPTIONS.find(r => r.value === user.role);
            return (
              <div key={user.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-3 hover:shadow-md transition-shadow">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {user.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-gray-900 truncate">{user.name}</p>
                  <p className="text-xs text-gray-500 truncate">@{user.username}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 ${
                  user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                  user.role === 'supervisor' ? 'bg-blue-100 text-blue-700' :
                  user.role === 'technician' ? 'bg-orange-100 text-orange-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {roleConfig?.icon} {roleConfig?.label || user.role}
                </span>
                <button onClick={() => startEdit(user)} className="p-1.5 text-gray-400 hover:text-primary hover:bg-red-50 rounded-lg transition-colors" title="Editar">
                  <Save size={14} />
                </button>
                <button onClick={() => handleDeleteUser(user.id, user.name)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default CompanyUserManager;