// src/types/company.ts
// Multi-tenant company configuration types

export interface CompanyTheme {
  primaryColor: string;        // "#7b1113"
  accentColor?: string;        // Color de acento (secundario en la UI)
  secondaryColor?: string;     // Color secundario / terciario
  logoUrl: string;
  logoWhiteUrl?: string;       // Logo for dark backgrounds
  iconUrl: string;
  faviconUrl?: string;
  titleSuffix?: string;        // Sufijo del título de la ventana/PWA (default " - Gestión de Mantenimiento")
}

export interface CompanyFeatures {
  accounting: boolean;
  maps: boolean;
  aiAssistant: boolean;
  equipmentManagement: boolean;
  excelUpload: boolean; // "Subida de datos (Excel)" en la sección de inicio (Dashboard)
}

export interface CompanyAuth {
  emailDomain: string;         // "@navas.com" - for login username@domain
  allowedRoles: string[];      // which roles to use (e.g., no "developer")
}

export interface TabConfig {
  id: string;                   // unique identifier
  label: string;                // "Mi Pagina" - custom label
  icon: string;                 // lucide-react icon name
  route: string;                // "/custom/mi-pagina" - custom route path
  type: 'built-in' | 'iframe' | 'markdown' | 'external';
  content?: string;             // URL for iframe/external, markdown for markdown type
  builtInComponent?: string;    // "orders" | "clients" | "equipment" | "map" | "tasks" | "dashboard"
  enabled: boolean;
  order: number;
  roles: string[];
  requiresOnline?: boolean;
}

export interface CompanyConfig {
  id: string;                    // Firestore doc ID = companyId
  name: string;                  // "NavTickets", "Empresa X"
  slug: string;                  // URL-safe identifier
  theme: CompanyTheme;
  features: CompanyFeatures;
  auth: CompanyAuth;
  tabs: TabConfig[];             // All tabs for this company
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Default company config for fallback/offline use
 */
export const DEFAULT_COMPANY_CONFIG: CompanyConfig = {
  id: 'default',
  name: 'NavTickets',
  slug: 'navtickets',
  theme: {
    primaryColor: '#7b1113',
    logoUrl: '/assets/logo-inicio.png',
    iconUrl: '/assets/icon-app.png',
  },
  features: {
    accounting: true,
    maps: true,
    aiAssistant: true,
    equipmentManagement: true,
    excelUpload: true,
  },
  auth: {
    emailDomain: '@navas.com',
    allowedRoles: ['technician', 'supervisor', 'admin', 'aux_admin', 'developer', 'super_admin'],
  },
  tabs: [],
  createdAt: new Date().toISOString(),
};

/**
 * Default tabs that are always available (built-in components).
 * Used as fallback when company has no custom tabs configured.
 */
export const DEFAULT_BUILT_IN_TABS: TabConfig[] = [
  { id: 'dashboard', label: 'Inicio', icon: 'LayoutDashboard', route: '/', type: 'built-in', builtInComponent: 'dashboard', enabled: true, order: 0, roles: ['technician', 'supervisor', 'admin', 'aux_admin', 'developer'] },
  { id: 'tasks', label: 'Tareas', icon: 'CheckSquare', route: '/tasks', type: 'built-in', builtInComponent: 'tasks', enabled: true, order: 1, roles: ['technician', 'supervisor', 'admin', 'aux_admin', 'developer'] },
  { id: 'orders', label: 'Órdenes', icon: 'ClipboardList', route: '/orders', type: 'built-in', builtInComponent: 'orders', enabled: true, order: 2, roles: ['technician', 'supervisor', 'admin', 'aux_admin', 'developer'] },
  { id: 'clients', label: 'Clientes', icon: 'Users', route: '/clients', type: 'built-in', builtInComponent: 'clients', enabled: true, order: 3, roles: ['technician', 'supervisor', 'admin', 'aux_admin', 'developer'] },
  { id: 'equipment', label: 'Máquinas', icon: 'Settings2', route: '/equipment', type: 'built-in', builtInComponent: 'equipment', enabled: true, order: 4, roles: ['technician', 'supervisor', 'admin', 'aux_admin', 'developer'] },
  { id: 'users', label: 'Equipo', icon: 'UserCog', route: '/users', type: 'built-in', builtInComponent: 'users', enabled: true, order: 5, roles: ['admin', 'developer'] },
  { id: 'map', label: 'Mapa', icon: 'Map', route: '/map', type: 'built-in', builtInComponent: 'map', enabled: true, order: 6, roles: ['technician', 'supervisor', 'admin', 'aux_admin', 'developer'] },
  { id: 'inventory', label: 'Inventario', icon: 'Package', route: '/inventory', type: 'built-in', builtInComponent: 'inventory', enabled: true, order: 7, roles: ['technician', 'supervisor', 'admin', 'aux_admin', 'developer'] },
  { id: 'reports', label: 'Informes', icon: 'BarChart3', route: '/reports', type: 'built-in', builtInComponent: 'reports', enabled: true, order: 8, roles: ['admin', 'developer'] },
];