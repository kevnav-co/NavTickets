
import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  WifiOff, Key, LogOut, PenLine, Shield, BarChart3, LifeBuoy,
  type LucideIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { useModal } from '../../context/ModalContext';
import { useConnectivityStatus } from '../../hooks/useConnectivityStatus';
import { useSupportUnread } from '../../hooks/useSupportUnread';
import CompanyLogo from '../shared/CompanyLogo';
import PERMISSIONS, { hasPermission, isTabVisible } from '../../permissions';
import { DEFAULT_BUILT_IN_TABS } from '../../types/company';
import { resolveIcon } from '../../utils/iconMap';

interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  requiresOnline?: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  developer: 'Desarrollador',
  admin: 'Administrador',
  supervisor: 'Supervisor',
  aux_admin: 'Auxiliar Admin',
  technician: 'Técnico',
};

export const DesktopSidebar: React.FC = React.memo(() => {
  const { currentUser, logout } = useAuth();
  const { company } = useCompany();
  const { openModal } = useModal();
  const { isOffline } = useConnectivityStatus();
  const navigate = useNavigate();
  const location = useLocation();
  const supportUnread = useSupportUnread();

  const navItems = useMemo(() => {
    if (!currentUser) return [];
    const items: NavItem[] = [];

    // Build from company tabs if available. If the company has none configured
    // (e.g. freshly seeded tenants), fall back to the original default nav:
    // Inicio, Tareas, Órdenes, Clientes, Máquinas, Mapa.
    const sourceTabs = company.tabs && company.tabs.length > 0 ? company.tabs : DEFAULT_BUILT_IN_TABS;
    const sortedTabs = [...sourceTabs]
      .filter(t => t.enabled && t.roles.includes(currentUser.role))
      .sort((a, b) => a.order - b.order);

    for (const tab of sortedTabs) {
      // Fase 5: visibilidad centralizada en permissions.ts — oculta la pestaña si
      // el rol no tiene permiso O si la empresa apagó su flag de feature.
      if (tab.type === 'built-in' && tab.builtInComponent
          && !isTabVisible(tab.builtInComponent, currentUser.role, company.features).visible) {
        continue;
      }
      items.push({
        icon: resolveIcon(tab.icon),
        label: tab.label,
        path: tab.route,
        requiresOnline: tab.requiresOnline,
      });
    }

    return items;
  }, [currentUser, company.tabs]);

  // Admin areas: /admin es role-aware (Fase 4) — super_admin gestiona multi-tenant,
  // admin/developer hacen self-serve de SU propia empresa. Soporte/Estadísticas
  // son exclusivos del super_admin.
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const canManageOwnCompany = hasPermission(currentUser?.role, PERMISSIONS.MANAGE_COMPANIES);

  const isAdminRootActive = location.pathname.startsWith('/admin')
    && !location.pathname.startsWith('/admin/stats')
    && !location.pathname.startsWith('/admin/support');

  return (
    <aside className="hidden md:flex flex-col w-60 bg-raised border-r border-line h-screen sticky top-0 z-50">
      <div className="px-5 py-5 flex justify-center items-center border-b border-line-soft">
        <CompanyLogo className="max-h-[42px] max-w-[132px] object-contain" />
      </div>

      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">Operación</p>
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            const isDisabled = item.requiresOnline && isOffline;

            return (
              <button
                key={item.label}
                disabled={isDisabled}
                onClick={() => navigate(item.path)}
                className={`sidebar-nav-item w-full ${isActive ? 'active' : ''} ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <item.icon size={17} strokeWidth={isActive ? 2.2 : 1.8} className={isActive && !isDisabled ? 'text-primary' : 'text-ink-faint'} />
                <span>{item.label}</span>
                {isDisabled && <WifiOff size={12} className="ml-auto opacity-50" />}
              </button>
            );
          })}
        </div>

        {(isSuperAdmin || canManageOwnCompany) && (
          <>
            <p className="px-3 pt-5 pb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-faint">
              {isSuperAdmin ? 'Administración' : 'Ajustes'}
            </p>
            <div className="space-y-0.5">
              <button
                onClick={() => navigate('/admin')}
                className={`sidebar-nav-item w-full ${isAdminRootActive ? 'active' : ''}`}
              >
                <Shield size={17} strokeWidth={isAdminRootActive ? 2.2 : 1.8} className={isAdminRootActive ? 'text-primary' : 'text-ink-faint'} />
                <span>{isSuperAdmin ? 'Panel Admin' : 'Configuración'}</span>
              </button>
              {isSuperAdmin && (
                <>
                  <button
                    onClick={() => navigate('/admin/support')}
                    className={`sidebar-nav-item w-full ${location.pathname.startsWith('/admin/support') ? 'active' : ''}`}
                  >
                    <LifeBuoy size={17} strokeWidth={location.pathname.startsWith('/admin/support') ? 2.2 : 1.8} className={location.pathname.startsWith('/admin/support') ? 'text-primary' : 'text-ink-faint'} />
                    <span>Soporte</span>
                    {(!location.pathname.startsWith('/admin/support') && supportUnread > 0) && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold">
                        {supportUnread > 99 ? '99+' : supportUnread}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => navigate('/admin/stats')}
                    className={`sidebar-nav-item w-full ${location.pathname.startsWith('/admin/stats') ? 'active' : ''}`}
                  >
                    <BarChart3 size={17} strokeWidth={location.pathname.startsWith('/admin/stats') ? 2.2 : 1.8} className={location.pathname.startsWith('/admin/stats') ? 'text-primary' : 'text-ink-faint'} />
                    <span>Estadísticas</span>
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-line-soft">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
          <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center font-semibold text-xs flex-shrink-0">{currentUser?.name?.charAt(0) || 'U'}</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink truncate">{currentUser?.name}</p>
            <p className="text-[10px] text-ink-faint truncate">{ROLE_LABELS[currentUser?.role ?? ''] || currentUser?.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 mt-1">
          <button onClick={() => openModal('password')} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-ink-faint hover:text-primary hover:bg-sunken rounded-lg transition-colors text-[11px] font-medium" title="Cambiar Contraseña"><Key size={14} /> Clave</button>
          <button onClick={() => openModal('signature')} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-ink-faint hover:text-primary hover:bg-sunken rounded-lg transition-colors text-[11px] font-medium" title="Actualizar Firma"><PenLine size={14} /> Firma</button>
          <button onClick={logout} className="flex-1 flex items-center justify-center gap-1.5 py-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors text-[11px] font-medium" title="Cerrar Sesión"><LogOut size={14} /> Salir</button>
        </div>
      </div>
    </aside>
  );
});
