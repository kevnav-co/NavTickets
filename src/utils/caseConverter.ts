// src/utils/caseConverter.ts
//
// Mapa único de conversión snake_case ⇄ camelCase para la capa de datos
// (Supabase usa snake_case en la BD; el modelo de la app usa camelCase).
//
// Centralizado aquí para que useSupabaseQuery (lectura) y useSyncManager
// (escritura) no mantengan mapas duplicados que se desincronizan. El inverso
// (CAMEL_TO_SNAKE) se deriva automáticamente de SNAKE_TO_CAMEL para
// garantizar consistencia entre lectura y escritura.

export const SNAKE_TO_CAMEL: Record<string, string> = {
  company_id: 'companyId',
  client_id: 'clientId',
  client_name: 'clientName',
  technician_id: 'technicianId',
  equipment_ids: 'equipmentIds',
  scheduled_date: 'scheduledDate',
  time_slot: 'timeSlot',
  scheduled_end_time: 'scheduledEndTime',
  actual_start_date: 'actualStartDate',
  order_type: 'orderType',
  service_name: 'serviceName',
  warranty_period: 'warrantyPeriod',
  warranty_expiration: 'warrantyExpiration',
  is_under_warranty_review: 'isUnderWarrantyReview',
  warranty_jobs: 'warrantyJobs',
  warranty_start_time: 'warrantyStartTime',
  warranty_end_time: 'warrantyEndTime',
  closing_data: 'closingData',
  warranty_notification_sent: 'warrantyNotificationSent',
  last_updated_by: 'lastUpdatedBy',
  serial_number: 'serialNumber',
  gas_type: 'gasType',
  image_url: 'imageUrl',
  last_maintenance_date: 'lastMaintenanceDate',
  maintenance_frequency: 'maintenanceFrequency',
  next_maintenance_notification_sent: 'nextMaintenanceNotificationSent',
  created_at: 'createdAt',
  updated_at: 'updatedAt',
  completed_at: 'completedAt',
  due_date: 'dueDate',
  reminder_notification_sent: 'reminderNotificationSent',
  due_date_notification_sent: 'dueDateNotificationSent',
  assigned_to: 'assignedTo',
  created_by: 'createdBy',
  fcm_token: 'fcmToken',
  onesignal_player_id: 'onesignalPlayerId',
  must_reset_password: 'mustResetPassword',
  location_updated_at: 'locationUpdatedAt',
  supabase_auth_id: 'supabaseAuthId',
  time_ago: 'timeAgo',
  order_number: 'orderNumber',
};

// Inverso derivado automáticamente del mapa de arriba.
export const CAMEL_TO_SNAKE: Record<string, string> = Object.fromEntries(
  Object.entries(SNAKE_TO_CAMEL).map(([snake, camel]) => [camel, snake])
);

export function snakeToCamel(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = SNAKE_TO_CAMEL[key] || key.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
    // Parsear JSONB strings a objetos/arrays
    if (typeof value === 'string') {
      try {
        result[camelKey] = JSON.parse(value);
      } catch {
        result[camelKey] = value;
      }
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}

export function toSnakeCase(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = CAMEL_TO_SNAKE[key] || key.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      result[snakeKey] = JSON.stringify(value);
    } else {
      result[snakeKey] = value;
    }
  }
  return result;
}