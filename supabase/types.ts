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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      seguimientos: {
        Row: {
          id: string;
          company_id: string;
          order_id: string;
          user_id: string | null;
          type: 'creacion' | 'estado' | 'asignacion' | 'cierre' | 'comentario' | 'reabrio_garantia';
          action: string | null;
          description: string | null;
          previous_status: string | null;
          new_status: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          order_id: string;
          user_id?: string | null;
          type: 'creacion' | 'estado' | 'asignacion' | 'cierre' | 'comentario' | 'reabrio_garantia';
          action?: string | null;
          description?: string | null;
          previous_status?: string | null;
          new_status?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          order_id?: string;
          user_id?: string | null;
          type?: 'creacion' | 'estado' | 'asignacion' | 'cierre' | 'comentario' | 'reabrio_garantia';
          action?: string | null;
          description?: string | null;
          previous_status?: string | null;
          new_status?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      support_tickets: {
        Row: {
          id: string;
          company_id: string;
          user_id: string | null;
          subject: string;
          message: string;
          status: 'abierto' | 'en_progreso' | 'cerrado';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id?: string | null;
          subject: string;
          message: string;
          status?: 'abierto' | 'en_progreso' | 'cerrado';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          user_id?: string | null;
          subject?: string;
          message?: string;
          status?: 'abierto' | 'en_progreso' | 'cerrado';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      support_messages: {
        Row: {
          id: string;
          ticket_id: string;
          user_id: string | null;
          role: 'empresa' | 'admin';
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          user_id?: string | null;
          role: 'empresa' | 'admin';
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          ticket_id?: string;
          user_id?: string | null;
          role?: 'empresa' | 'admin';
          message?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      inventory_items: {
        Row: {
          id: string;
          company_id: string;
          sku: string;
          name: string;
          unit: string;
          quantity: number;
          unit_cost: number;
          low_stock_threshold: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          sku?: string;
          name: string;
          unit?: string;
          quantity?: number;
          unit_cost?: number;
          low_stock_threshold?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          sku?: string;
          name?: string;
          unit?: string;
          quantity?: number;
          unit_cost?: number;
          low_stock_threshold?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_inventory_lines: {
        Row: {
          id: string;
          order_id: string;
          inventory_item_id: string;
          quantity_out: number;
          unit_cost_snapshot: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          inventory_item_id: string;
          quantity_out?: number;
          unit_cost_snapshot?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          inventory_item_id?: string;
          quantity_out?: number;
          unit_cost_snapshot?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      password_reset_tokens: {
        Row: {
          id: string;
          user_id: string;
          token_hash: string;
          used: boolean;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token_hash: string;
          used?: boolean;
          created_at?: string;
          expires_at: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          token_hash?: string;
          used?: boolean;
          created_at?: string;
          expires_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          company_id: string;
          sender_id: string;
          sender_name: string;
          recipient_id: string;
          recipient_name: string;
          amount: number;
          method: 'Efectivo' | 'Transferencia';
          concept: string;
          transaction_group_id: string | null;
          self_entry: 'out' | 'in' | null;
          is_annulment: boolean;
          related_movement_id: string | null;
          annulment_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          sender_id: string;
          sender_name?: string;
          recipient_id: string;
          recipient_name?: string;
          amount: number;
          method: 'Efectivo' | 'Transferencia';
          concept: string;
          transaction_group_id?: string | null;
          self_entry?: 'out' | 'in' | null;
          is_annulment?: boolean;
          related_movement_id?: string | null;
          annulment_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          sender_id?: string;
          sender_name?: string;
          recipient_id?: string;
          recipient_name?: string;
          amount?: number;
          method?: 'Efectivo' | 'Transferencia';
          concept?: string;
          transaction_group_id?: string | null;
          self_entry?: 'out' | 'in' | null;
          is_annulment?: boolean;
          related_movement_id?: string | null;
          annulment_reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          user_name: string;
          amount: number;
          origin: 'Efectivo' | 'Transferencia';
          concept: string;
          order_id: string | null;
          is_annulment: boolean;
          related_movement_id: string | null;
          annulment_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          user_name?: string;
          amount: number;
          origin: 'Efectivo' | 'Transferencia';
          concept: string;
          order_id?: string | null;
          is_annulment?: boolean;
          related_movement_id?: string | null;
          annulment_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          user_id?: string;
          user_name?: string;
          amount?: number;
          origin?: 'Efectivo' | 'Transferencia';
          concept?: string;
          order_id?: string | null;
          is_annulment?: boolean;
          related_movement_id?: string | null;
          annulment_reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      incomes: {
        Row: {
          id: string;
          company_id: string;
          user_id: string;
          user_name: string;
          amount: number;
          origin: 'Efectivo' | 'Transferencia';
          concept: string;
          is_annulment: boolean;
          related_movement_id: string | null;
          annulment_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          user_id: string;
          user_name?: string;
          amount: number;
          origin: 'Efectivo' | 'Transferencia';
          concept: string;
          is_annulment?: boolean;
          related_movement_id?: string | null;
          annulment_reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          user_id?: string;
          user_name?: string;
          amount?: number;
          origin?: 'Efectivo' | 'Transferencia';
          concept?: string;
          is_annulment?: boolean;
          related_movement_id?: string | null;
          annulment_reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          company_id: string;
          endpoint: string;
          auth: string;
          p256dh: string;
          user_agent: string | null;
          created_at: string | null;
          last_seen_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_id: string;
          endpoint: string;
          auth: string;
          p256dh: string;
          user_agent?: string | null;
          created_at?: string | null;
          last_seen_at?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      service_requests: {
        Row: {
          id: string;
          company_id: string;
          status: Database['public']['Enums']['service_request_status'];
          channel: 'web' | 'whatsapp' | 'manual';
          conversation_id: string | null;
          client_id: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          contact_email: string | null;
          contact_identification: string | null;
          address: string | null;
          city: string | null;
          equipment_ids: string[];
          equipment_description: string | null;
          service_type_id: string | null;
          service_name: string | null;
          order_type: Database['public']['Enums']['order_type'];
          description: string;
          suggested_priority: Database['public']['Enums']['priority_level'];
          preferred_slots: unknown;
          proposed_date: string | null;
          proposed_time: string | null;
          proposed_duration_minutes: number | null;
          proposed_technician_id: string | null;
          order_id: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          rejection_reason: string | null;
          created_by: string | null;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        // Desde el navegador solo se insertan solicitudes manuales (RLS de la 042).
        Insert: {
          id?: string;
          company_id: string;
          status?: 'borrador' | 'pendiente';
          channel?: 'web' | 'whatsapp' | 'manual';
          conversation_id?: string | null;
          client_id?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          contact_email?: string | null;
          contact_identification?: string | null;
          address?: string | null;
          city?: string | null;
          equipment_ids?: string[];
          equipment_description?: string | null;
          service_type_id?: string | null;
          service_name?: string | null;
          order_type?: Database['public']['Enums']['order_type'];
          description?: string;
          suggested_priority?: Database['public']['Enums']['priority_level'];
          preferred_slots?: unknown;
          created_by?: string | null;
        };
        // Sin UPDATE por la API: confirmar y rechazar van por RPC (043).
        Update: Record<string, never>;
        Relationships: [];
      };
      assistant_conversations: {
        Row: {
          id: string;
          company_id: string;
          channel: 'web' | 'whatsapp';
          status: 'abierta' | 'cerrada' | 'bloqueada';
          client_id: string | null;
          verified_email: string | null;
          verified_at: string | null;
          ip_hash: string | null;
          turn_count: number;
          input_tokens: number;
          output_tokens: number;
          provider: string | null;
          model: string | null;
          created_at: string;
          last_message_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      assistant_messages: {
        Row: {
          id: number;
          conversation_id: string;
          company_id: string;
          role: 'user' | 'assistant' | 'tool';
          content: unknown;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      assistant_settings: {
        Row: {
          company_id: string;
          timezone: string;
          working_hours: Record<string, [string, string][]>;
          service_types: { id: string; name: string; orderType: 'Correctivo' | 'Preventivo'; durationMinutes: number }[];
          blocked_dates: string[];
          min_lead_hours: number;
          slot_step_minutes: number;
          max_days_ahead: number;
          technician_ids: string[];
          welcome_message: string;
          retention_days: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Partial<Database['public']['Tables']['assistant_settings']['Row']> & { company_id: string };
        Update: Partial<Database['public']['Tables']['assistant_settings']['Row']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
      accounting_self_transfer: {
        Args: { p_amount: number; p_from: string; p_to: string; p_created_at?: string };
        Returns: string;
      };
      accounting_annul: {
        Args: { p_kind: 'transaction' | 'expense' | 'income'; p_id: string; p_reason?: string | null };
        Returns: undefined;
      };
      admin_impersonate_start: {
        Args: { target_company: string; target_role: Database['public']['Enums']['user_role'] };
        Returns: undefined;
      };
      admin_impersonate_stop: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      available_slots: {
        Args: { p_company: string; p_from: string; p_to: string; p_duration_minutes: number; p_technician?: string | null };
        Returns: { slot_date: string; slot_time: string; free_technicians: number; technician_ids: string[] }[];
      };
      confirm_service_request: {
        Args: { p_request: string; p_date: string; p_time: string; p_duration_minutes: number; p_technician: string };
        Returns: string;
      };
      reject_service_request: {
        Args: { p_request: string; p_reason: string };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: 'admin' | 'technician' | 'supervisor' | 'developer' | 'aux_admin' | 'super_admin';
      equipment_status: 'Activa' | 'Inactiva' | 'En Mantenimiento' | 'Retirada';
      equipment_voltage: '110V' | '220V' | '330V';
      gas_type: 'Natural' | 'Propano' | 'No usa';
      order_status: 'Pendiente' | 'En Progreso' | 'Cerrado';
      order_type: 'Correctivo' | 'Preventivo';
      priority_level: 'Baja' | 'Media' | 'Alta' | 'Urgente';
      notification_type: 'info' | 'alert' | 'success';
      seguimiento_type: 'creacion' | 'estado' | 'asignacion' | 'cierre' | 'comentario' | 'reabrio_garantia';
      support_status: 'abierto' | 'en_progreso' | 'cerrado';
      service_request_status: 'borrador' | 'pendiente' | 'confirmada' | 'rechazada' | 'cancelada';
    };
  };
}