-- =============================================================================
-- NavTicket - Migración 028: push a super_admins cuando la empresa escribe en el chat
-- =============================================================================
-- Contexto: la migración 027 avisa al AUTOR cuando el super_admin responde
-- (support-reply-notify). Falta la dirección inversa: cuando un usuario de la
-- empresa (soporte_messages con role <> 'admin', p.ej. role='empresa' de
-- SupportModal) escribe en el hilo, el super_admin no recibe nada.
--
-- Este trigger dispara la edge `support-chat-notify` (verify_jwt=false) que
-- hace push a todos los super_admins con player id. Mismo patrón que 027:
-- solo mensajes de la empresa (role IS DISTINCT FROM 'admin'), SECURITY DEFINER
-- y BEGIN/EXCEPTION para que un fallo de push jamás revierta el INSERT.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.support_message_notify_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_url text := COALESCE(
    current_setting('app.supabase_base_url', true),
    'https://hvysnxvuyexacktlwsbm.supabase.co'
  );
BEGIN
  BEGIN
    -- Solo mensajes del lado EMPRESA (role <> 'admin'): el super_admin responde
    -- con role='admin' y ya está cubierto por 027.
    IF NEW.role IS DISTINCT FROM 'admin' THEN
      PERFORM net.http_post(
        url := base_url || '/functions/v1/support-chat-notify',
        body := jsonb_build_object(
          'type', TG_OP,
          'table', 'support_messages',
          'message_id', NEW.id,
          'ticket_id',  NEW.ticket_id,
          'message',    NEW.message,
          'sender_role', NEW.role
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-webhook-secret', current_setting('app.webhook_secret', true)
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- una falla de push nunca debe romper el envío del mensaje
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_support_message_notify_staff ON support_messages;
CREATE TRIGGER trg_support_message_notify_staff
  AFTER INSERT ON support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.support_message_notify_staff();