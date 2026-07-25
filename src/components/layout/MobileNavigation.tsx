import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, Shield, type LucideIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { useConnectivityStatus } from '../../hooks/useConnectivityStatus';
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
}

export const MobileNavigation: React.FC = React.memo(() => {
  const { currentUser } = useAuth();
  const { company } = useCompany();
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

  // Add admin link for super_admin in mobile nav
  const showAdmin = currentUser?.role === 'super_admin';

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
                    ? 'text-primary'
                    : 'text-gray-400 active:text-gray-600'
                }`}
            >
              {/* Active top accent line */}
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2.5px] rounded-full bg-primary" />
              )}

              {/* Icon with active pill */}
              <span className={`flex items-center justify-center w-9 h-7 rounded-full transition-colors duration-200 ${isActive ? 'bg-primary/10' : ''}`}>
                <item.icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
              </span>

              <span className={`text-[9px] tracking-wide leading-none ${isActive ? 'font-extrabold' : 'font-semibold'}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
      {showAdmin && (
        <button
          onClick={() => navigate('/admin')}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 relative transition-all duration-200 ${
            location.pathname.startsWith('/admin') ? 'text-primary' : 'text-gray-400'
          }`}
        >
          {location.pathname.startsWith('/admin') && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2.5px] rounded-full bg-primary" />
          )}
          <span className={`flex items-center justify-center w-9 h-7 rounded-full transition-colors duration-200 ${location.pathname.startsWith('/admin') ? 'bg-primary/10' : ''}`}>
            <Shield size={18} strokeWidth={location.pathname.startsWith('/admin') ? 2.5 : 1.8} />
          </span>
          <span className="text-[9px] tracking-wide leading-none font-semibold">Admin</span>
        </button>
      )}
    </nav>
  );
});