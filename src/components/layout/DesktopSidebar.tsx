
import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, WifiOff, Key, LogOut, PenLine, Shield,
  type LucideIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { useModal } from '../../context/ModalContext';
import { useConnectivityStatus } from '../../hooks/useConnectivityStatus';
import CompanyLogo from '../shared/CompanyLogo';
import PERMISSIONS, { hasPermission } from '../../permissions';

// Dynamic icon resolution
import * as LucideIcons from 'lucide-react';

function resolveIcon(iconName: string): LucideIcon {
  const icons = LucideIcons as unknown as Record<string, LucideIcon>;
  return icons[iconName] || Home;
}

// Built-in tab permission mapping
const TAB_PERMISSION_MAP: Record<string, string> = {
  orders: PERMISSIONS.VIEW_ALL_ORDERS,
  clients: PERMISSIONS.VIEW_CLIENTS,
  equipment: PERMISSIONS.VIEW_EQUIPMENT,
  users: PERMISSIONS.VIEW_USERS,
  map: PERMISSIONS.VIEW_MAP,
  accounting: PERMISSIONS.VIEW_REPORTS,
};

interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  requiresOnline?: boolean;
}

export const DesktopSidebar: React.FC = React.memo(() => {
  const { currentUser, logout } = useAuth();
  const { company } = useCompany();
  const { openModal } = useModal();
  const { isOffline } = useConnectivityStatus();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = useMemo(() => {
    if (!currentUser) return [];
    const items: NavItem[] = [];

    // Build from company tabs if available
    if (company.tabs && company.tabs.length > 0) {
      const sortedTabs = [...company.tabs]
        .filter(t => t.enabled && t.roles.includes(currentUser.role))
        .sort((a, b) => a.order - b.order);

      for (const tab of sortedTabs) {
        // For built-in tabs, check permission if mapped
        if (tab.type === 'built-in' && tab.builtInComponent) {
          const requiredPerm = TAB_PERMISSION_MAP[tab.builtInComponent];
          if (requiredPerm && !hasPermission(currentUser.role, requiredPerm)) {
            continue;
          }
        }
        items.push({
          icon: resolveIcon(tab.icon),
          label: tab.label,
          path: tab.route,
          requiresOnline: tab.requiresOnline,
        });
      }
    }

    return items;
  }, [currentUser, company.tabs]);

  // Add admin link for super_admin
  const showAdmin = currentUser?.role === 'super_admin';

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 h-screen sticky top-0 z-50 shadow-xl">
      <div className="p-6 flex justify-center items-center border-b border-gray-100 min-h-[88px]">
        <CompanyLogo className="w-full max-w-[160px] object-contain hover:scale-105 transition-transform duration-300" />
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
                isActive ? 'bg-red-50 text-primary shadow-sm font-bold' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <item.icon size={20} className={isActive && !isDisabled ? 'text-primary' : 'text-gray-400'} />
              <span className="text-sm">{item.label}</span>
              {isDisabled && <WifiOff size={12} className="ml-auto opacity-50" />}
            </button>
          );
        })}
      </div>
      {showAdmin && (
        <div className="px-3 py-2 border-t border-gray-100">
          <button
            onClick={() => navigate('/admin')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
              location.pathname.startsWith('/admin') ? 'bg-red-50 text-primary shadow-sm font-bold' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Shield size={20} className={location.pathname.startsWith('/admin') ? 'text-primary' : 'text-gray-400'} />
            <span className="text-sm">Panel Admin</span>
          </button>
        </div>
      )}
      <div className="p-4 border-t border-gray-100 bg-gray-50/50 space-y-3">
        <div className="flex items-center justify-between px-1">
           <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-bold text-xs flex-shrink-0">{currentUser?.name?.charAt(0) || 'U'}</div>
              <div className="min-w-0">
                 <p className="text-xs font-bold text-gray-900 truncate">{currentUser?.name}</p>
                 <p className="text-[9px] text-gray-500 font-medium truncate capitalize">{currentUser?.role}</p>
              </div>
           </div>
           <div className="flex items-center gap-1">
              <button onClick={() => openModal('password')} className="p-1.5 text-gray-400 hover:text-primary hover:bg-white rounded-lg transition-colors shadow-sm" title="Cambiar Contraseña"><Key size={16} /></button>
              <button onClick={() => openModal('signature')} className="p-1.5 text-gray-400 hover:text-primary hover:bg-white rounded-lg transition-colors shadow-sm" title="Actualizar Firma"><PenLine size={16} /></button>
            </div>
        </div>
        <button onClick={logout} className="w-full flex items-center justify-center gap-2 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 shadow-sm"><LogOut size={14} /> Cerrar Sesión</button>
      </div>
    </aside>
  );
});
