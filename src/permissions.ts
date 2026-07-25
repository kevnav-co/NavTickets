
import { User } from './types';

// 1. Definir los roles de la aplicación
export const ROLES = {
  TECHNICIAN: 'technician' as const,
  SUPERVISOR: 'supervisor' as const,
  ADMIN: 'admin' as const,
  AUX_ADMIN: 'aux_admin' as const, // AÑADIDO
  DEVELOPER: 'developer' as const,
  SUPER_ADMIN: 'super_admin' as const,
};

// 2. Definir los permisos de la aplicación
const PERMISSIONS = {
  // Permisos de Dashboard
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_ADMIN_WIDGETS: 'view_admin_widgets',
  VIEW_REPORTS: 'view_reports',
  VIEW_GLOBAL_KPIS: 'view_global_kpis',

  // Permisos de Órdenes de Servicio
  CREATE_ORDER: 'create_order',
  ASSIGN_ORDER: 'assign_order',
  UPDATE_ORDER: 'update_order',
  DELETE_ORDER: 'delete_order',
  VIEW_ALL_ORDERS: 'view_all_orders',
  VIEW_OWN_ORDERS: 'view_own_orders',
  START_FINISH_ORDER: 'start_finish_order',
  RESTART_ORDER: 'restart_order', 
  RESCHEDULE_ORDER: 'reschedule_order',
  UPLOAD_INITIAL_EVIDENCE: 'upload_initial_evidence',
  UPLOAD_FINAL_EVIDENCE: 'upload_final_evidence',
  REOPEN_WARRANTY_ORDER: 'reopen_warranty_order',
  UPDATE_CLOSED_ORDER: 'update_closed_order',

  // Permisos de Tareas Personales (NUEVO)
  VIEW_OWN_TASKS: 'view_own_tasks',
  CREATE_TASK: 'create_task',
  UPDATE_TASK: 'update_task',
  DELETE_TASK: 'delete_task',
  
  // Permisos de Clientes
  CREATE_CLIENT: 'create_client',
  UPDATE_CLIENT: 'update_client',
  DELETE_CLIENT: 'delete_client',
  VIEW_CLIENTS: 'view_clients',

  // Permisos de Equipos
  CREATE_EQUIPMENT: 'create_equipment',
  UPDATE_EQUIPMENT: 'update_equipment',
  DELETE_EQUIPMENT: 'delete_equipment',
  VIEW_EQUIPMENT: 'view_equipment',

  // Permisos de Usuarios
  CREATE_USER: 'create_user',
  UPDATE_USER: 'update_user',
  DELETE_USER: 'delete_user',
  VIEW_USERS: 'view_users',
  UPDATE_USER_ROLE: 'update_user_role',
  UPDATE_USER_SIGNATURE: 'update_user_signature',

  // Permisos de Mapa
  VIEW_MAP: 'view_map',
  VIEW_TEAM_LOCATIONS_MAP: 'view_team_locations_map',
  VIEW_ALL_LOCATIONS_MAP: 'view_all_locations_map',

  // Permisos de Admin (Super Admin)
  VIEW_ADMIN_PANEL: 'view_admin_panel',
  MANAGE_COMPANIES: 'manage_companies',
  MANAGE_ALL_USERS: 'manage_all_users',
};

// 3. Asignar permisos a cada rol
const supervisorPermissions = [
  PERMISSIONS.VIEW_DASHBOARD,
  PERMISSIONS.VIEW_ADMIN_WIDGETS,
  PERMISSIONS.CREATE_ORDER,
  PERMISSIONS.ASSIGN_ORDER,
  PERMISSIONS.UPDATE_ORDER,
  PERMISSIONS.DELETE_ORDER,
  PERMISSIONS.VIEW_ALL_ORDERS,
  PERMISSIONS.START_FINISH_ORDER,
  PERMISSIONS.CREATE_CLIENT,
  PERMISSIONS.UPDATE_CLIENT,
  PERMISSIONS.VIEW_CLIENTS,
  PERMISSIONS.CREATE_EQUIPMENT,
  PERMISSIONS.UPDATE_EQUIPMENT,
  PERMISSIONS.VIEW_EQUIPMENT,
  PERMISSIONS.UPLOAD_INITIAL_EVIDENCE,
  PERMISSIONS.UPLOAD_FINAL_EVIDENCE,
  PERMISSIONS.RESTART_ORDER,
  PERMISSIONS.RESCHEDULE_ORDER,
  PERMISSIONS.VIEW_TEAM_LOCATIONS_MAP,
  PERMISSIONS.VIEW_OWN_TASKS,
  PERMISSIONS.CREATE_TASK,
  PERMISSIONS.UPDATE_TASK,
  PERMISSIONS.DELETE_TASK,
];

const ROLES_PERMISSIONS: Record<User['role'], string[]> = {
  technician: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_OWN_ORDERS,
    PERMISSIONS.START_FINISH_ORDER,
    PERMISSIONS.UPDATE_ORDER, // Restaurado
    PERMISSIONS.VIEW_CLIENTS,
    PERMISSIONS.CREATE_CLIENT,
    PERMISSIONS.UPDATE_CLIENT,
    PERMISSIONS.VIEW_EQUIPMENT,
    PERMISSIONS.CREATE_EQUIPMENT,
    PERMISSIONS.UPDATE_EQUIPMENT,
    PERMISSIONS.UPLOAD_INITIAL_EVIDENCE, // Restaurado
    PERMISSIONS.UPLOAD_FINAL_EVIDENCE,
    PERMISSIONS.VIEW_OWN_TASKS,
    PERMISSIONS.CREATE_TASK,
    PERMISSIONS.UPDATE_TASK,
    PERMISSIONS.DELETE_TASK,
  ],
  supervisor: supervisorPermissions,
  aux_admin: supervisorPermissions, // AÑADIDO
  admin: Object.values(PERMISSIONS),
  developer: Object.values(PERMISSIONS),
  super_admin: Object.values(PERMISSIONS),
};

// 4. Función para verificar permisos
export const hasPermission = (userRole: User['role'] | undefined, permission: string): boolean => {
  if (!userRole) return false;

  const userPermissions = ROLES_PERMISSIONS[userRole];
  if (!userPermissions) return false;

  return userPermissions.includes(permission);
};

// 5. Función para obtener un objeto de permisos para el usuario
export const getUserPermissions = (user: User | null) => {
  const role = user?.role;
  return {
    canUpdate: hasPermission(role, PERMISSIONS.UPDATE_ORDER),
    canDelete: hasPermission(role, PERMISSIONS.DELETE_ORDER),
    canAssign: hasPermission(role, PERMISSIONS.ASSIGN_ORDER),
    canStart: hasPermission(role, PERMISSIONS.START_FINISH_ORDER),
    canRestart: hasPermission(role, PERMISSIONS.RESTART_ORDER),
    canReschedule: hasPermission(role, PERMISSIONS.RESCHEDULE_ORDER),
    canUploadInitialEvidence: hasPermission(role, PERMISSIONS.UPLOAD_INITIAL_EVIDENCE),
    canUploadFinalEvidence: hasPermission(role, PERMISSIONS.UPLOAD_FINAL_EVIDENCE),
    canManageWarranty: hasPermission(role, PERMISSIONS.REOPEN_WARRANTY_ORDER),
    canUpdateClosedOrder: hasPermission(role, PERMISSIONS.UPDATE_CLOSED_ORDER),
  };
};

// Exportar los permisos para usarlos en los componentes
export default PERMISSIONS;
