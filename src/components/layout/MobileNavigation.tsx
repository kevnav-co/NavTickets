import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, Shield, BarChart3, LifeBuoy, type LucideIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { useConnectivityStatus } from '../../hooks/useConnectivityStatus';
import { useSupportUnread } from '../../hooks/useSupportUnread';
import PERMISSIONS, { hasPermission } from '../../permissions';

// Dynamic icon resolution
import * as LucideIcons from 'lucide-react';

function resolveIcon(iconName: string): LucideIcon {
  const icons = LucideIcons as unknown as Record<string, LucideIcon>;
  return icons[iconName] || Home;
}

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
  badge?: number; // contador de no-leídos (p.ej. soporte del super_admin)
}

// Barra dedicada del super_admin en móvil: áreas de administración, no las pestañas
// de empresa. Espejo del bloque "admin" del desktop sidebar.
const ADMIN_ITEMS: NavItem[] = [
  { icon: Shield, label: 'Admin', path: '/admin' },
  { icon: BarChart3, label: 'Stats', path: '/admin/stats' },
  { icon: LifeBuoy, label: 'Soporte', path: '/admin/support' },
];

export const MobileNavigation: React.FC = React.memo(() => {
  const { currentUser } = useAuth();
  const { company } = useCompany();
  const { isOffline } = useConnectivityStatus();
  const supportUnread = useSupportUnread();
  const navigate = useNavigate();
  const location = useLocation();

  const showAdmin = currentUser?.role === 'super_admin';

  const navItems = useMemo(() => {
    if (!currentUser) return [];
    const items: NavItem[] = [];

    // Build from company tabs if available
    if (company.tabs && company.tabs.length > 0) {
      const sortedTabs = [...company.tabs]
        .filter(t => t.enabled && t.roles.includes(currentUser.role))
        .sort((a, b) => a.order - b.order);

      for (const tab of sortedTabs) {
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

  // Para el super_admin usamos las áreas de admin (con el conteo de soporte);
  // para el resto, las pestañas de la empresa.
  const items: NavItem[] = useMemo(() => {
    if (showAdmin) {
      return ADMIN_ITEMS.map(it => ({
        ...it,
        badge: it.path === '/admin/support' ? supportUnread : undefined,
      }));
    }
    return navItems;
  }, [showAdmin, navItems, supportUnread]);

  if (items.length === 0) return null;

  const isActiveFor = (item: NavItem): boolean =>
    location.pathname === item.path ||
    (item.path !== '/' && item.path !== '/admin' && location.pathname.startsWith(item.path));

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-gray-200/60 z-50 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}>
      <div className="flex items-stretch">
        {items.map((item) => {
          const isActive = isActiveFor(item);
          const isDisabled = !!item.requiresOnline && isOffline;
          const showingBadge = !!item.badge && item.badge > 0 && !isActive;

          return (
            <button
              key={item.label}
              disabled={isDisabled}
              onClick={() => navigate(item.path)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 relative transition-all duration-200 ${isDisabled
                  ? 'opacity-30 cursor-not-allowed'
                  : isActive
                    ? 'text-primary'
                    : 'text-gray-400 active:text-gray-600'
                }`}
            >
              {/* Active top accent line */}
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-[3px] rounded-full bg-gradient-to-r from-primary to-red-400 shadow-sm" />
              )}

              {/* Icon with badge */}
              <span className={`relative flex items-center justify-center w-10 h-8 rounded-2xl transition-all duration-200 ${isActive ? 'bg-primary/10 scale-105' : ''}`}>
                <item.icon size={19} strokeWidth={isActive ? 2.5 : 1.8} />
                {showingBadge && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-white shadow-sm">
                    {item.badge! > 99 ? '99+' : item.badge}
                  </span>
                )}
              </span>

              <span className={`text-[9px] tracking-wide leading-none ${isActive ? 'font-extrabold' : 'font-semibold'}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});