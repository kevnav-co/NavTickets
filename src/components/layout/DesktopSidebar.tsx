
import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Home, ClipboardList, Building2, Map as MapIcon, Cog, 
  WifiOff, Key, LogOut, CheckCircle2, PenLine, Wallet
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useModal } from '../../context/ModalContext';
import { useConnectivityStatus } from '../../hooks/useConnectivityStatus';
import PERMISSIONS, { hasPermission } from '../../permissions';

// Definimos la estructura de un elemento de navegación.
interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  requiresOnline?: boolean;
}

export const DesktopSidebar: React.FC = React.memo(() => {
  const { currentUser, logout } = useAuth();
  const { openModal } = useModal();
  const { isOffline } = useConnectivityStatus();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = useMemo(() => {
    if (!currentUser) return [];

    const items: NavItem[] = [
      { icon: Home, label: 'Panel Principal', path: '/' },
      { icon: CheckCircle2, label: 'Mis Tareas', path: '/tasks' },
    ];

    if (currentUser.role === 'developer') {
      items.push({ icon: Wallet, label: 'Contable', path: '/accounting' });
    }

    if (hasPermission(currentUser.role, PERMISSIONS.VIEW_ALL_ORDERS) || hasPermission(currentUser.role, PERMISSIONS.VIEW_OWN_ORDERS)) {
      items.push({ icon: ClipboardList, label: 'Órdenes de Servicio', path: '/orders' });
    }

    if (hasPermission(currentUser.role, PERMISSIONS.VIEW_CLIENTS)) {
      items.push({ icon: Building2, label: 'Gestión de Clientes', path: '/clients' });
    }

    if (hasPermission(currentUser.role, PERMISSIONS.VIEW_EQUIPMENT)) {
      items.push({ icon: Cog, label: 'Inventario Máquinas', path: '/equipment' });
    }

    if (hasPermission(currentUser.role, PERMISSIONS.VIEW_MAP) || hasPermission(currentUser.role, PERMISSIONS.VIEW_TEAM_LOCATIONS_MAP)) {
      items.push({ icon: MapIcon, label: 'Mapa en Vivo', path: '/map', requiresOnline: true });
    }

    return items;
  }, [currentUser]);

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 h-screen sticky top-0 z-50 shadow-xl">
      <div className="p-6 flex justify-center items-center border-b border-gray-100 min-h-[88px]">
        <img 
          src="https://firebasestorage.googleapis.com/v0/b/navas-33818730-80986.firebasestorage.app/o/Logo-Inicio.png?alt=media&token=b516cd08-2ece-445d-ac69-0b91d444d78f" 
          alt="Navas" 
          className="w-full max-w-[160px] object-contain hover:scale-105 transition-transform duration-300"
        />
      </div>
      <div className="flex-1 py-6 px-3 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
          const isDisabled = item.requiresOnline && isOffline;
          
          return (
            <button 
              key={item.label} 
              disabled={isDisabled}
              onClick={() => navigate(item.path)} 
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all group ${
                isDisabled ? 'opacity-30 grayscale cursor-not-allowed' :
                isActive ? 'bg-red-50 text-[#7b1113] shadow-sm font-bold' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <item.icon size={20} className={isActive && !isDisabled ? 'text-[#7b1113]' : 'text-gray-400'} />
              <span className="text-sm">{item.label}</span>
              {isDisabled && <WifiOff size={12} className="ml-auto opacity-50" />}
            </button>
          );
        })}
      </div>
      <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-3">
        <div className="flex items-center justify-between px-1">
           <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-[#7b1113] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">{currentUser?.name?.charAt(0) || 'U'}</div>
              <div className="min-w-0">
                 <p className="text-xs font-bold text-gray-900 truncate">{currentUser?.name}</p>
                 <p className="text-[9px] text-gray-500 font-medium truncate capitalize">{currentUser?.role}</p>
              </div>
           </div>
           <div className="flex items-center gap-1">
              <button onClick={() => openModal('password')} className="p-1.5 text-gray-400 hover:text-[#7b1113] hover:bg-white rounded-lg transition-colors shadow-sm" title="Cambiar Contraseña"><Key size={16} /></button>
              <button onClick={() => openModal('signature')} className="p-1.5 text-gray-400 hover:text-[#7b1113] hover:bg-white rounded-lg transition-colors shadow-sm" title="Actualizar Firma"><PenLine size={16} /></button>
            </div>
        </div>
        <button onClick={logout} className="w-full flex items-center justify-center gap-2 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 shadow-sm"><LogOut size={14} /> Cerrar Sesión</button>
      </div>
    </aside>
  );
});
