
import React, { useState, useMemo } from 'react';
import { Search, UserPlus, Shield, HardHat, ChevronRight, Code } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import PERMISSIONS, { hasPermission } from '../../permissions';

const UserManager: React.FC = () => {
  const navigate = useNavigate();
  const { users } = useData();
  const { currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');

  // REFACTOR: Centralizar cálculo de permisos
  const canCreate = useMemo(() => hasPermission(currentUser?.role, PERMISSIONS.CREATE_USER), [currentUser]);

  const filteredUsers = useMemo(() => {
    const q = searchTerm.toLowerCase();
    if (!q) return users;
    return users.filter(u => 
      u.name?.toLowerCase().includes(q) || 
      u.username?.toLowerCase().includes(q)
    );
  }, [users, searchTerm]);

  const getInitials = (name: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : '??';

  return (
    <div className="w-full h-full max-w-7xl mx-auto">
      <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm pt-4 pb-3 px-4 md:px-6">
        <div className="relative mb-3">
            <span className="absolute inset-y-0 left-0 pl-4 flex items-center"><Search className="text-gray-400" size={18} /></span>
            <input 
                type="text" 
                placeholder="Buscar usuarios..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-12 bg-white border border-gray-200 rounded-xl pl-12 pr-4 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
        </div>

        {canCreate && (
            <button 
                onClick={() => navigate('/users/new')}
                className="w-full h-12 bg-primary text-white rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg shadow-primary/20"
            >
                <UserPlus size={18} />
                Añadir Usuario
            </button>
        )}
      </div>

      <div className="p-4 md:p-6 pt-3">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold">Usuarios del Sistema</h2>
          <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded-lg">{filteredUsers.length}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredUsers.length === 0 ? (
             <div className="col-span-full text-center py-16 text-gray-400">
                <Search size={32} className="mx-auto mb-2"/>
                {searchTerm ? 'No se encontraron usuarios.' : 'No hay usuarios en el equipo.'}
            </div>
          ) : (
            filteredUsers.map(user => (
              <div 
                key={user.id} 
                onClick={() => navigate(`/users/${user.id}`)}
                className="bg-white p-4 rounded-2xl shadow-sm flex items-center gap-4 cursor-pointer group"
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0 bg-red-50 text-primary">
                  {getInitials(user.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold truncate text-sm">{user.name}</h3>
                  <p className="text-xs text-gray-500 truncate">@{user.username}</p>
                </div>
                <div className="flex items-center gap-2 pl-2">
                    {user.role === 'admin' ? <span title="Admin" className="bg-red-100/80 text-primary p-1.5 rounded-full"><Shield size={16} /></span>
                    : user.role === 'supervisor' ? <span title="Supervisor" className="bg-blue-100/80 text-blue-600 p-1.5 rounded-full"><Shield size={16} /></span>
                    : user.role === 'developer' ? <span title="Developer" className="bg-purple-100/80 text-purple-600 p-1.5 rounded-full"><Code size={16} /></span>
                    : <span title="Técnico" className="bg-gray-100 text-gray-600 p-1.5 rounded-full"><HardHat size={16} /></span>}
                    <ChevronRight size={18} className="text-gray-300" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default UserManager;
