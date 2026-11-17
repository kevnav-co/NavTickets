// Solicitudes del asistente de ventas y servicio (migraciones 042, 043, 045 y 046).
// Las columnas llegan en camelCase vía snakeToCamel.

export type ServiceRequestStatus = 'borrador' | 'pendiente' | 'confirmada' | 'rechazada' | 'cancelada';
export type ServiceRequestChannel = 'web' | 'whatsapp' | 'manual';

export interface PreferredSlot {
  date?: string;   // YYYY-MM-DD
  time?: string;   // HH:MM
}

export interface ServiceRequest {
  id: string;
  companyId: string;
  status: ServiceRequestStatus;
  channel: ServiceRequestChannel;
  conversationId?: string | null;

  clientId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactIdentification?: string | null;
  address?: string | null;
  city?: string | null;

  equipmentIds?: string[];
  equipmentDescription?: string | null;
  serviceTypeId?: string | null;
  serviceName?: string | null;
  orderType: 'Correctivo' | 'Preventivo';
  description: string;
  suggestedPriority: 'Baja' | 'Media' | 'Alta' | 'Urgente';
  preferredSlots?: PreferredSlot[] | string | null;

  proposedDate?: string | null;              // YYYY-MM-DD
  proposedTime?: string | null;              // HH:MM:SS (tipo time de Postgres)
  proposedDurationMinutes?: number | null;
  proposedTechnicianId?: string | null;

  orderId?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;

  createdBy?: string | null;
  submittedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

/** Mensaje de la transcripción (assistant_messages). `content` es texto o JSON de herramienta. */
export interface AssistantMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'tool';
  content: unknown;
  createdAt: string;
}

/** Lo que el gestor confirma: fecha, hora, duración y técnico. */
export interface ServiceRequestProposal {
  date: string;            // YYYY-MM-DD
  time: string;            // HH:MM
  durationMinutes: number;
  technicianId: string;
}

/** Alta manual (llamada telefónica). */
export interface ManualServiceRequestInput {
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  contactIdentification?: string;
  address?: string;
  city?: string;
  serviceName?: string;
  orderType: 'Correctivo' | 'Preventivo';
  suggestedPriority: 'Baja' | 'Media' | 'Alta' | 'Urgente';
  description: string;
  clientId?: string;
}
