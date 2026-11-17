
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User } from '../../types';
import { X, Search, User as UserIcon, ChevronRight } from 'lucide-react';
import { ROLES } from '../../permissions';

interface UserSearchModalProps {
  users: User[];
  onSelect: (user: User) => void;
  onClose: () => void;
}

const UserSearchModal: React.FC<UserSearchModalProps> = ({ users, onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const assignableRoles: User['role'][] = [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.TECHNICIAN];

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const assignableUsers = users.filter(u => u.role && (assignableRoles as readonly string[]).includes(u.role));
    if (!q) return assignableUsers;
    return assignableUsers.filter(u => 
      u.name.toLowerCase().includes(q) || 
      (u.username && u.username.toLowerCase().includes(q))
    );
  }, [users, query]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
      <div className="bg-raised w-full h-full md:h-[80vh] md:max-w-lg md:mx-auto md:mt-20 md:rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-10">
        <header className="p-4 border-b border-line-soft flex items-center justify-between bg-raised">
          <div>
            <h3 className="text-sm font-black text-ink uppercase tracking-tight">Buscar Usuario</h3>
            <p className="text-[10px] text-ink-faint font-bold uppercase">Sistema</p>
          </div>
          <button onClick={onClose} className="p-2 bg-sunken text-ink-faint rounded-full hover:bg-line transition-colors"><X size={18} /></button>
        </header>

        <div className="p-4 bg-sunken/50 border-b border-line-soft">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="text-ink-faint" size={18} />
            </div>
            <input
              ref={inputRef}
              type="text"
              placeholder="Nombre o usuario..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-raised border border-line rounded-2xl py-3.5 pl-10 pr-4 text-sm font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
          {filtered.length > 0 ? (
            filtered.map(user => (
              <button
                key={user.id}
                onClick={() => onSelect(user)}
                className="w-full flex items-center gap-3 p-4 hover:bg-red-50 rounded-2xl transition-all text-left group border border-transparent hover:border-red-100"
              >
                <div className="w-10 h-10 bg-sunken rounded-xl flex items-center justify-center text-ink-faint group-hover:bg-raised group-hover:text-primary transition-colors">
                  <UserIcon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-ink text-sm truncate">{user.name}</p>
                  <p className="text-[10px] font-bold text-ink-faint uppercase">{user.username || 'Sin Usuario'}</p>
                </div>
                <ChevronRight size={18} className="text-ink-faint group-hover:text-primary" />
              </button>
            ))
          ) : (
            <div className="py-12 text-center flex flex-col items-center gap-3">
              <div className="w-16 h-16 bg-sunken rounded-full flex items-center justify-center text-gray-200">
                <Search size={32} />
              </div>
              <p className="text-sm font-bold text-ink-faint italic">No se encontraron usuarios.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserSearchModal;
