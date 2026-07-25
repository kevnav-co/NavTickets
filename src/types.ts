export enum OrderStatus {
  PENDING = 'Pendiente',
  OPEN = 'En Progreso',
  CLOSED = 'Cerrado'
}

export interface Client {
  id: string;
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
  name: string;
  role: 'admin' | 'technician' | 'supervisor' | 'developer' | 'aux_admin';
  username: string;
  password?: string;
  identification?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  locationUpdatedAt?: string;
  fcmToken?: string;
  signature?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  type: 'info' | 'alert' | 'success';
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
