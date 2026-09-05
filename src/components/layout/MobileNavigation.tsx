import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home, Shield, BarChart3, LifeBuoy, Check, Folder, FolderCog, WifiOff, X,
  type LucideIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { useConnectivityStatus } from '../../hooks/useConnectivityStatus';
import { useSupportUnread } from '../../hooks/useSupportUnread';
import PERMISSIONS, { hasPermission, isTabVisible } from '../../permissions';
import { DEFAULT_BUILT_IN_TABS } from '../../types/company';

// Dynamic icon resolution
import * as LucideIcons from 'lucide-react';

function resolveIcon(iconName: string): LucideIcon {
  const icons = LucideIcons as unknown as Record<string, LucideIcon>;
  return icons[iconName] || Home;
}

interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  requiresOnline?: boolean;
  badge?: number; // contador de no-leídos (p.ej. soporte del super_admin)
  builtInComponent?: string; // id semántico del tab (para agrupar)
}

// Fase 8: barra inferior agrupada en ≤5 categorías.
// Raíz directa = navega a `path`; raíz carpeta (`children`) despliega un bottom-sheet.
interface Root {
  id: string;
  label: string;
  icon: LucideIcon;
  path?: string;
  requiresOnline?: boolean;
  badge?: number;
  children?: NavItem[];
}

// Barra dedicada del super_admin en móvil: áreas de administración, no las pestañas
// de empresa. Espejo del bloque "admin" del desktop sidebar.
const ADMIN_ITEMS: NavItem[] = [
  { icon: Shield, label: 'Admin', path: '/admin' },
  { icon: BarChart3, label: 'Stats', path: '/admin/stats' },
  { icon: LifeBuoy, label: 'Soporte', path: '/admin/support' },
];

// ─── Agrupación (3 pilares + 2 carpetas) ───────────────────────────────────────
// Orden fijo: Inicio, Tareas, Órdenes (directos) → Catálogo → Gestión (carpetas).
const DIRECT_GROUPS: { id: string; want: string }[] = [
  { id: 'inicio', want: 'dashboard' },
  { id: 'tareas', want: 'tasks' },
  { id: 'orders', want: 'orders' },
];
const CATALOGO_ITEMS = ['clients', 'equipment', 'map'];
const GESTION_ITEMS = ['inventory', 'reports', 'users'];

// Mismo matiz de activo por ruta que tenía la barra plana (evita que `/admin`
// marque como activo todo su subárbol).
function isPathActive(item: NavItem, pathname: string): boolean {
  return pathname === item.path ||
    (item.path !== '/' && item.path !== '/admin' && pathname.startsWith(item.path));
}

// Panel bottom-sheet que lista los hijos visibles de una carpeta.
const CategorySheet: React.FC<{
  title: string;
  icon: LucideIcon;
  items: NavItem[];
  isOffline: boolean;
  pathname: string;
  onSelect: (item: NavItem) => void;
  onClose: () => void;
}> = ({ title, icon, items, isOffline, pathname, onSelect, onClose }) => {
  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl pt-2 px-2"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-10 h-1.5 bg-gray-300 rounded-full mb-1" />
        <header className="flex items-center justify-between pl-2 pr-1 py-1">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <icon size={16} className="text-primary" />
            </span>
            <span className="text-xs font-black uppercase tracking-widest text-gray-700">{title}</span>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600" aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>
        <div className="mt-1 max-h-[50vh] overflow-y-auto">
          {items.map(item => {
            const active = isPathActive(item, pathname);
            const disabled = !!item.requiresOnline && isOffline;
            return (
              <button
                key={item.path}
                disabled={disabled}
                onClick={() => onSelect(item)}
                className={`w-full flex items-center gap-3 px-3 py-3.5 rounded-2xl transition-all text-left ${
                  disabled
                    ? 'opacity-30 cursor-not-allowed'
                    : active
                      ? 'bg-red-50 text-primary shadow-sm'
                      : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span className="relative">
                  <item.icon size={19} strokeWidth={active ? 2.3 : 1.8} className={active ? 'text-primary' : 'text-gray-400'} />
                  {disabled && <WifiOff size={12} className="absolute -bottom-0.5 -right-1 text-gray-400" />}
                </span>
                <span className={`text-sm ${active ? 'font-bold' : 'font-semibold'}`}>{item.label}</span>
                {active && <Check size={15} className="ml-auto text-primary" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const MobileNavigation: React.FC = React.memo(() => {
  const { currentUser } = useAuth();
  const { company } = useCompany();
  const { isOffline } = useConnectivityStatus();
  const supportUnread = useSupportUnread();
  const navigate = useNavigate();
  const location = useLocation();

  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const canManageOwnCompany = currentUser && hasPermission(currentUser.role, PERMISSIONS.MANAGE_COMPANIES);
  // El super_admin usa una barra dedicada de áreas admin (ADMIN_ITEMS arriba).
  const showAdmin = isSuperAdmin;

  const navItems = useMemo<NavItem[]>(() => {
    if (!currentUser) return [];
    const items: NavItem[] = [];

    // Build from company tabs if available. If the company has none configured
    // (e.g. freshly seeded tenants), fall back to the original default nav.
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
        builtInComponent: tab.builtInComponent,
      });
    }

    // Self-serve (Fase 4): el admin/developer del tenant alcanza /admin
    // (CompanyForm de su empresa) desde la barra, sin la barra del super_admin.
    if (canManageOwnCompany && !isSuperAdmin) {
      items.push({ icon: Shield, label: 'Configuración', path: '/admin' });
    }

    return items;
  }, [currentUser, company.tabs, canManageOwnCompany, isSuperAdmin]);

  // Raíces de la barra: para el super_admin, las áreas admin; para el resto,
  // los tabs de empresa particionados en 5 categorías.
  const roots = useMemo<Root[]>(() => {
    if (showAdmin) {
      return ADMIN_ITEMS.map(it => ({
        id: it.path,
        label: it.label,
        icon: it.icon,
        path: it.path,
        badge: it.path === '/admin/support' ? supportUnread : undefined,
      }));
    }

    const directMap = new Map<string, NavItem>();
    const catalogo: NavItem[] = [];
    const gestion: NavItem[] = [];

    for (const item of navItems) {
      const c = item.builtInComponent;
      const directMatch = DIRECT_GROUPS.find(d => d.want === c);
      if (directMatch) { directMap.set(directMatch.id, item); continue; }
      if (c && CATALOGO_ITEMS.includes(c)) { catalogo.push(item); continue; }
      if (c && GESTION_ITEMS.includes(c)) { gestion.push(item); continue; }
      // ítem /admin (Configuración) o tab custom sin builtInComponent → Gestión.
      gestion.push(item);
    }

    const roots: Root[] = [];
    for (const d of DIRECT_GROUPS) {
      const item = directMap.get(d.id);
      if (!item) continue;
      roots.push({
        id: d.id,
        label: item.label,
        icon: item.icon,
        path: item.path,
        requiresOnline: item.requiresOnline,
      });
    }
    if (catalogo.length) roots.push({ id: 'catalogo', label: 'Catálogo', icon: Folder, children: catalogo });
    if (gestion.length) roots.push({ id: 'gestion', label: 'Gestión', icon: FolderCog, children: gestion });
    return roots;
  }, [showAdmin, navItems, supportUnread]);

  if (roots.length === 0) return null;

  const openRoot = openGroup ? roots.find(r => r.id === openGroup) : undefined;

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-gray-200/60 z-50 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}>
        <div className="flex items-stretch">
          {roots.map((root) => {
            const isActive = root.path !== undefined
              ? isPathActive({ path: root.path }, location.pathname)
              : (root.children ?? []).some(ch => isPathActive(ch, location.pathname));
            const isDisabled = !!root.requiresOnline && isOffline;
            const showingBadge = !!root.badge && root.badge > 0 && !isActive;
            const isFolder = root.children !== undefined;

            return (
              <button
                key={root.id}
                disabled={isDisabled}
                onClick={() => isFolder ? setOpenGroup(root.id) : navigate(root.path!)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 relative transition-all duration-200 ${
                  isDisabled
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
                  <root.icon size={19} strokeWidth={isActive ? 2.5 : 1.8} />
                  {!isFolder && showingBadge && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold ring-2 ring-white shadow-sm">
                      {root.badge! > 99 ? '99+' : root.badge}
                    </span>
                  )}
                </span>

                <span className={`text-[9px] tracking-wide leading-none ${isActive ? 'font-extrabold' : 'font-semibold'}`}>{root.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {openRoot?.children && (
        <CategorySheet
          title={openRoot.label}
          icon={openRoot.icon}
          items={openRoot.children}
          isOffline={isOffline}
          pathname={location.pathname}
          onSelect={(item) => { navigate(item.path); setOpenGroup(null); }}
          onClose={() => setOpenGroup(null)}
        />
      )}
    </>
  );
});