
import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, ClipboardList, Building2, Map as MapIcon, Cog,
  CheckCircle2, Wallet
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useConnectivityStatus } from '../../hooks/useConnectivityStatus';
import PERMISSIONS, { hasPermission } from '../../permissions';

// Definimos la estructura de un elemento de navegación.
interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  requiresOnline?: boolean;
}

export const MobileNavigation: React.FC = React.memo(() => {
  const { currentUser } = useAuth();
  const { isOffline } = useConnectivityStatus();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = useMemo(() => {
    if (!currentUser) return [];

    const items: NavItem[] = [
      { icon: Home, label: 'Inicio', path: '/' },
      { icon: CheckCircle2, label: 'Tareas', path: '/tasks' },
    ];

    if (currentUser.role === 'developer') {
      items.push({ icon: Wallet, label: 'Contable', path: '/accounting' });
    }

    if (hasPermission(currentUser.role, PERMISSIONS.VIEW_ALL_ORDERS) || hasPermission(currentUser.role, PERMISSIONS.VIEW_OWN_ORDERS)) {
      items.push({ icon: ClipboardList, label: 'Órdenes', path: '/orders' });
    }

    if (hasPermission(currentUser.role, PERMISSIONS.VIEW_CLIENTS)) {
      items.push({ icon: Building2, label: 'Clientes', path: '/clients' });
    }

    if (hasPermission(currentUser.role, PERMISSIONS.VIEW_EQUIPMENT)) {
      items.push({ icon: Cog, label: 'Máquinas', path: '/equipment' });
    }

    if (hasPermission(currentUser.role, PERMISSIONS.VIEW_MAP) || hasPermission(currentUser.role, PERMISSIONS.VIEW_TEAM_LOCATIONS_MAP)) {
      items.push({ icon: MapIcon, label: 'Mapa', path: '/map', requiresOnline: true });
    }

    return items;
  }, [currentUser]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-gray-200/60 z-50 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}>
      <div className="flex items-stretch">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
          const isDisabled = item.requiresOnline && isOffline;

          return (
            <button
              key={item.label}
              disabled={isDisabled}
              onClick={() => navigate(item.path)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative transition-all duration-200 ${isDisabled
                  ? 'opacity-30 cursor-not-allowed'
                  : isActive
                    ? 'text-[#7b1113]'
                    : 'text-gray-400 active:text-gray-600'
                }`}
            >
              {/* Active top accent line */}
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2.5px] rounded-full bg-[#7b1113]" />
              )}

              {/* Icon with active pill */}
              <span className={`flex items-center justify-center w-9 h-7 rounded-full transition-colors duration-200 ${isActive ? 'bg-[#7b1113]/10' : ''}`}>
                <item.icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
              </span>

              <span className={`text-[9px] tracking-wide leading-none ${isActive ? 'font-extrabold' : 'font-semibold'}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});
