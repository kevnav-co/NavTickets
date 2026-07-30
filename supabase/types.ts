// =============================================================================
// NavTicket - Tipos generados para Supabase Database
// =============================================================================
// Estos tipos se pueden generar automáticamente con:
//   supabase gen types typescript --linked > supabase/types.ts
//
// Por ahora se definen manualmente para coincidir con el esquema SQL.
// =============================================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          role: 'admin' | 'technician' | 'supervisor' | 'developer' | 'aux_admin' | 'super_admin';
          username: string;
          password: string | null;
          identification: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          location_updated_at: string | null;
          fcm_token: string | null;
          signature: string | null;
          supabase_auth_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          role: 'admin' | 'technician' | 'supervisor' | 'developer' | 'aux_admin' | 'super_admin';
          username: string;
          password?: string | null;
          identification?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          location_updated_at?: string | null;
          fcm_token?: string | null;
          signature?: string | null;
          supabase_auth_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          role?: 'admin' | 'technician' | 'supervisor' | 'developer' | 'aux_admin' | 'super_admin';
          username?: string;
          password?: string | null;
          identification?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          location_updated_at?: string | null;
          fcm_token?: string | null;
          signature?: string | null;
          supabase_auth_id?: string | null;
          created_at?: string;
        };
      };
      clients: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          address: string | null;
          contact: string | null;
          identification: string | null;
          email: string | null;
          latitude: number | null;
          longitude: number | null;
          neighborhood: string | null;
          city: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          address?: string | null;
          contact?: string | null;
          identification?: string | null;
          email?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          neighborhood?: string | null;
          city?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          address?: string | null;
          contact?: string | null;
          identification?: string | null;
          email?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          neighborhood?: string | null;
          city?: string | null;
          created_at?: string;
        };
      };
      equipment: {
        Row: {
          id: string;
          company_id: string;
          client_id: string | null;
          name: string;
          brand: string | null;
          description: string | null;
          serial_number: string;
          location: string;
          voltage: '110V' | '220V' | '330V';
          gas_type: 'Natural' | 'Propano' | 'No usa' | null;
          status: 'Activa' | 'Inactiva' | 'En Mantenimiento' | 'Retirada';
          image_url: string | null;
          last_maintenance_date: string | null;
          maintenance_frequency: number;
          next_maintenance_notification_sent: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          client_id?: string | null;
          name: string;
          brand?: string | null;
          description?: string | null;
          serial_number: string;
          location?: string;
          voltage?: '110V' | '220V' | '330V';
          gas_type?: 'Natural' | 'Propano' | 'No usa' | null;
          status?: 'Activa' | 'Inactiva' | 'En Mantenimiento' | 'Retirada';
          image_url?: string | null;
          last_maintenance_date?: string | null;
          maintenance_frequency?: number;
          next_maintenance_notification_sent?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          client_id?: string | null;
          name?: string;
          brand?: string | null;
          description?: string | null;
          serial_number?: string;
          location?: string;
          voltage?: '110V' | '220V' | '330V';
          gas_type?: 'Natural' | 'Propano' | 'No usa' | null;
          status?: 'Activa' | 'Inactiva' | 'En Mantenimiento' | 'Retirada';
          image_url?: string | null;
          last_maintenance_date?: string | null;
          maintenance_frequency?: number;
          next_maintenance_notification_sent?: boolean;
          created_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          company_id: string;
          order_number: number;
          name: string;
          client_id: string | null;
          client_name: string | null;
          technician_id: string | null;
          scheduled_date: string;
          time_slot: string;
          scheduled_end_time: string | null;
          actual_start_date: string | null;
          description: string;
          status: 'Pendiente' | 'En Progreso' | 'Cerrado';
          observations: string | null;
          initial_photos: Json;
          initial_evidence: Json;
          final_evidence: Json;
          current_warranty_evidence: Json;
          procedures: Json;
          start_time: string | null;
          end_time: string | null;
          order_type: 'Correctivo' | 'Preventivo';
          service_name: string;
          warranty_period: number | null;
          warranty_expiration: string | null;
          priority: 'Baja' | 'Media' | 'Alta' | 'Urgente';
          is_under_warranty_review: boolean;
          warranty_jobs: Json;
          warranty_start_time: string | null;
          warranty_end_time: string | null;
          closing_data: Json | null;
          warranty_notification_sent: boolean;
          last_updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          order_number: number;
          name: string;
          client_id?: string | null;
          client_name?: string | null;
          technician_id?: string | null;
          scheduled_date: string;
          time_slot: string;
          scheduled_end_time?: string | null;
          actual_start_date?: string | null;
          description?: string;
          status?: 'Pendiente' | 'En Progreso' | 'Cerrado';
          observations?: string | null;
          initial_photos?: Json;
          initial_evidence?: Json;
          final_evidence?: Json;
          current_warranty_evidence?: Json;
          procedures?: Json;
          start_time?: string | null;
          end_time?: string | null;
          order_type?: 'Correctivo' | 'Preventivo';
          service_name?: string;
          warranty_period?: number | null;
          warranty_expiration?: string | null;
          priority?: 'Baja' | 'Media' | 'Alta' | 'Urgente';
          is_under_warranty_review?: boolean;
          warranty_jobs?: Json;
          warranty_start_time?: string | null;
          warranty_end_time?: string | null;
          closing_data?: Json | null;
          warranty_notification_sent?: boolean;
          last_updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          order_number?: number;
          name?: string;
          client_id?: string | null;
          client_name?: string | null;
          technician_id?: string | null;
          scheduled_date?: string;
          time_slot?: string;
          scheduled_end_time?: string | null;
          actual_start_date?: string | null;
          description?: string;
          status?: 'Pendiente' | 'En Progreso' | 'Cerrado';
          observations?: string | null;
          initial_photos?: Json;
          initial_evidence?: Json;
          final_evidence?: Json;
          current_warranty_evidence?: Json;
          procedures?: Json;
          start_time?: string | null;
          end_time?: string | null;
          order_type?: 'Correctivo' | 'Preventivo';
          service_name?: string;
          warranty_period?: number | null;
          warranty_expiration?: string | null;
          priority?: 'Baja' | 'Media' | 'Alta' | 'Urgente';
          is_under_warranty_review?: boolean;
          warranty_jobs?: Json;
          warranty_start_time?: string | null;
          warranty_end_time?: string | null;
          closing_data?: Json | null;
          warranty_notification_sent?: boolean;
          last_updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      equipment_orders: {
        Row: {
          id: string;
          equipment_id: string;
          order_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          equipment_id: string;
          order_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          equipment_id?: string;
          order_id?: string;
          created_at?: string;
        };
      };
      tasks: {
        Row: {
          id: string;
          company_id: string;
          title: string;
          completed: boolean;
          important: boolean;
          due_date: string | null;
          reminder: string | null;
          repeat: string | null;
          category: string | null;
          note: string | null;
          files: Json;
          assigned_to: string | null;
          created_by: string | null;
          participants: Json;
          reminder_notification_sent: boolean;
          due_date_notification_sent: boolean;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          title: string;
          completed?: boolean;
          important?: boolean;
          due_date?: string | null;
          reminder?: string | null;
          repeat?: string | null;
          category?: string | null;
          note?: string | null;
          files?: Json;
          assigned_to?: string | null;
          created_by?: string | null;
          participants?: Json;
          reminder_notification_sent?: boolean;
          due_date_notification_sent?: boolean;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          title?: string;
          completed?: boolean;
          important?: boolean;
          due_date?: string | null;
          reminder?: string | null;
          repeat?: string | null;
          category?: string | null;
          note?: string | null;
          files?: Json;
          assigned_to?: string | null;
          created_by?: string | null;
          participants?: Json;
          reminder_notification_sent?: boolean;
          due_date_notification_sent?: boolean;
          completed_at?: string | null;
          created_at?: string;
        };
      };
      task_participants: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          user_id?: string;
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          title: string;
          body: string;
          text: string;
          time_ago: string | null;
          read: boolean;
          type: 'info' | 'alert' | 'success';
          path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          title: string;
          body: string;
          text: string;
          time_ago?: string | null;
          read?: boolean;
          type?: 'info' | 'alert' | 'success';
          path?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          user_id?: string;
          title?: string;
          body?: string;
          text?: string;
          time_ago?: string | null;
          read?: boolean;
          type?: 'info' | 'alert' | 'success';
          path?: string | null;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role: 'admin' | 'technician' | 'supervisor' | 'developer' | 'aux_admin' | 'super_admin';
      equipment_status: 'Activa' | 'Inactiva' | 'En Mantenimiento' | 'Retirada';
      equipment_voltage: '110V' | '220V' | '330V';
      gas_type: 'Natural' | 'Propano' | 'No usa';
      order_status: 'Pendiente' | 'En Progreso' | 'Cerrado';
      order_type: 'Correctivo' | 'Preventivo';
      priority_level: 'Baja' | 'Media' | 'Alta' | 'Urgente';
      notification_type: 'info' | 'alert' | 'success';
    };
  };
}