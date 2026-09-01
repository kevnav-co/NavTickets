export enum OrderStatus {
  PENDING = 'Pendiente',
  OPEN = 'En Progreso',
  CLOSED = 'Cerrado'
}

export interface Client {
  id: string;
  companyId: string;      // ← NUEVO
  name: string;
  address: string;
  contact: string;
  identification?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  neighborhood?: string;
  city?: string;
}

// --- TIPO UNIFICADO PARA CLIENTES DE CUENTI ---
export interface CuentiClient {
  id: string;
  name: string;
  identification: string;
  alias?: string | null;
  address?: string; // address es un string simple
  phone?: string;
  email?: string;
  city?: string;
}

export type EquipmentStatus = 'Activa' | 'Inactiva' | 'En Mantenimiento' | 'Retirada';

export interface Equipment {
  id: string;
  companyId: string;      // ← NUEVO
  clientId: string;
  name: string;
  brand?: string;
  description?: string;
  serialNumber: string;
  location: string;
  voltage: '110V' | '220V' | '330V';
  gasType?: 'Natural' | 'Propano' | 'No usa';
  status: EquipmentStatus;
  imageUrl?: string;
  createdAt?: string;
  lastMaintenanceDate?: string;
  maintenanceFrequency?: number;
  nextMaintenanceNotificationSent?: boolean;
}

// ─── Inventario de repuestos (Fase 6) ──────────────────────────────────────
export interface InventoryItem {
  id: string;
  companyId: string;
  sku: string;
  name: string;
  unit: string;              // unidad de medida: 'unidad', 'lt', 'kg', ...
  quantity: number;
  unitCost: number;
  lowStockThreshold: number; // si `quantity <= threshold` → alerta de stock bajo
  createdAt?: string;
  updatedAt?: string;
}

// Línea de repuesto usada en una orden (tabla M:N order_inventory_lines).
export interface OrderInventoryLine {
  id?: string;
  orderId: string;
  inventoryItemId: string;
  quantityOut: number;
  unitCostSnapshot?: number;
}

export interface WarrantyJob {
  reopenedAt: string;
  technicianId?: string; // Estandarizado de userId a technicianId
  startTime?: string;
  endTime?: string | null;
  tasksPerformed?: string[];
  additionalComments?: string;
  evidenceImages?: (string | Blob)[];
  technicianSignature?: string | null;
  clientSignature?: string | null;
  closingDescription?: string;
}

export interface ServiceOrder {
  id:string;
  companyId: string;      // ← NUEVO
  orderNumber: number;
  name: string;
  clientId?: string;
  clientName?: string; // Added for denormalization
  equipmentIds: string[];
  technicianId: string;
  scheduledDate: string;
  timeSlot: string;
  scheduledEndTime?: string;
  actualStartDate?: string;
  description: string;
  status: OrderStatus;
  observations?: string;
  initialPhotos?: (string | Blob)[];
  initialEvidence?: (string | Blob)[]; 
  finalEvidence?: (string | Blob)[];
  currentWarrantyEvidence?: (string | Blob)[];
  procedures: string[];
  startTime?: string;
  endTime?: string;
  orderType: 'Correctivo' | 'Preventivo';
  serviceName: string;
  warrantyPeriod?: number; // In days
  warrantyExpiration?: string | null;
  priority: 'Baja' | 'Media' | 'Alta' | 'Urgente';
  isUnderWarrantyReview?: boolean;
  warrantyJobs?: WarrantyJob[]; // Corregido de 'Jobs' a 'warrantyJobs'
  warrantyStartTime?: string;
  warrantyEndTime?: string;
  closingData?: {
    tasksPerformed?: string[];
    additionalComments?: string;
    approverName?: string;
    approverId?: string;
    technicianSignature?: string | null;
    clientSignature?: string | null;
    generalObservations?: string;
    closingDescription?: string;
    evidenceImages?: (string | Blob)[];
  };
  warrantyNotificationSent?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastUpdatedBy?: string;
}

export interface User {
  id: string;
  companyId: string;      // ← NUEVO
  name: string;
  role: 'admin' | 'technician' | 'supervisor' | 'developer' | 'aux_admin' | 'super_admin';
  username: string;
  /** Correo real de recuperación de contraseña (NO el username@dominio). */
  email?: string;
  identification?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  locationUpdatedAt?: string;
  fcmToken?: string;
  onesignalPlayerId?: string;
  mustResetPassword?: boolean;
  signature?: string;
  /**
   * SOLO campo de formulario/payload (UserForm, CompanyUserManager, create-user).
   * NUNCA se guarda en la tabla `users` (columna eliminada en migración 010);
   * la clave vive en Supabase Auth.
   */
  password?: string;
}

export enum SeguimientoType {
  CREACION = 'creacion',
  ESTADO = 'estado',
  ASIGNACION = 'asignacion',
  CIERRE = 'cierre',
  COMENTARIO = 'comentario',
  REABRIO_GARANTIA = 'reabrio_garantia'
}

// Un registro del historial/actividad de un tiquete (orden), aislado por empresa.
export interface Seguimiento {
  id: string;
  companyId: string;
  orderId: string;
  userId?: string | null;
  type: SeguimientoType;
  action?: string | null;
  description?: string | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  companyId: string;      // ← NUEVO
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  type: 'info' | 'alert' | 'success' | 'reminder' | 'due_date' | 'expiration';
  path?: string;
  text: string;
  timeAgo: string;
}

// Interfaz para cada nota individual en el "chat" de la tarea
export interface TaskNote {
  id: string;      
  userId: string;  
  userName: string;
  text: string;     
  createdAt: string;
}

export interface Task {
  id: string;
  companyId: string;      // ← NUEVO
  title: string;
  completed: boolean;
  important: boolean;
  createdAt: string;
  completedAt?: string;
  dueDate?: string | null;
  reminder?: string | null;
  repeat?: string | null;
  category?: string | null;
  note?: string; 
  files?: string[];
  assignedTo?: string;
  createdBy?: string;
  participants?: string[];
  // Flags para el control de notificaciones
  reminderNotificationSent?: boolean;
  dueDateNotificationSent?: boolean;
}

// ─── Soporte interno (tickets) ───────────────────────────────────────────────
export enum SupportTicketStatus {
  OPEN = 'abierto',
  IN_PROGRESS = 'en_progreso',
  CLOSED = 'cerrado',
}

export interface SupportTicket {
  id: string;
  companyId: string;
  userId?: string | null;      // solicitante
  subject: string;
  message: string;             // mensaje de apertura
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt?: string | null;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  userId?: string | null;      // autor
  role: 'empresa' | 'admin';
  message: string;
  createdAt: string;
}
