import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Shield, BarChart3, LifeBuoy, Check, Folder, FolderCog, WifiOff, X,
  type LucideIcon
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { useConnectivityStatus } from '../../hooks/useConnectivityStatus';
import { useSupportUnread } from '../../hooks/useSupportUnread';
import PERMISSIONS, { hasPermission, isTabVisible } from '../../permissions';
import { DEFAULT_BUILT_IN_TABS } from '../../types/company';
import { resolveIcon } from '../../utils/iconMap';

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
// Orden fijo: Inicio, Órdenes, Clientes (directos) → Catálogo → Gestión (carpetas).
// Catálogo: Tareas, Máquinas, Mapa. Gestión: Equipo, Inventario, Informes, Config.
const DIRECT_GROUPS: { id: string; want: string }[] = [
  { id: 'inicio', want: 'dashboard' },
  { id: 'orders', want: 'orders' },
  { id: 'clientes', want: 'clients' },
];
const CATALOGO_ITEMS = ['tasks', 'equipment', 'map'];
const GESTION_ITEMS = ['inventory', 'reports', 'users'];

// Mismo matiz de activo por ruta que tenía la barra plana (evita que `/admin`
// marque como activo todo su subárbol).
function isPathActive(item: Pick<NavItem, 'path'>, pathname: string): boolean {
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
}> = ({ title, icon: Icon, items, isOffline, pathname, onSelect, onClose }) => {
  return (
    <div className="fixed inset-0 z-[60]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="absolute bottom-0 inset-x-0 bg-raised rounded-t-2xl pt-2 px-2"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-9 h-1 bg-line rounded-full mb-2" />
        <header className="flex items-center justify-between pl-2 pr-1 pb-1">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon size={15} className="text-primary" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">{title}</span>
          </div>
          <button onClick={onClose} className="p-2 text-ink-faint hover:text-ink-soft" aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>
        <div className="mt-1 max-h-[50vh] overflow-y-auto pb-1">
          {items.map(item => {
            const active = isPathActive(item, pathname);
            const disabled = !!item.requiresOnline && isOffline;
            return (
              <button
                key={item.path}
                disabled={disabled}
                onClick={() => onSelect(item)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors text-left ${
                  disabled
                    ? 'opacity-30 cursor-not-allowed'
                    : active
                      ? 'bg-primary/8 text-primary'
                      : 'text-ink-soft active:bg-sunken'
                }`}
              >
                <span className="relative">
                  <item.icon size={18} strokeWidth={active ? 2.3 : 1.8} className={active ? 'text-primary' : 'text-ink-faint'} />
                  {disabled && <WifiOff size={12} className="absolute -bottom-0.5 -right-1 text-ink-faint" />}
                </span>
                <span className={`text-sm ${active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
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
      <nav className="fixed bottom-0 left-0 right-0 bg-raised/95 backdrop-blur-xl border-t border-line z-50 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}>
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
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 relative transition-colors duration-150 ${
                  isDisabled
                    ? 'opacity-30 cursor-not-allowed'
                    : isActive
                      ? 'text-primary'
                      : 'text-ink-faint active:text-ink-soft'
                }`}
              >
                {/* Icon with badge */}
                <span className={`relative flex items-center justify-center w-11 h-7 rounded-lg transition-colors duration-150 ${isActive ? 'bg-primary/10' : ''}`}>
                  <root.icon size={18} strokeWidth={isActive ? 2.3 : 1.8} />
                  {!isFolder && showingBadge && (
                    <span className="absolute -top-1 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-white flex items-center justify-center text-[9px] font-bold ring-2 ring-white">
                      {root.badge! > 99 ? '99+' : root.badge}
                    </span>
                  )}
                </span>

                <span className={`text-[9px] tracking-wide leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>{root.label}</span>
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