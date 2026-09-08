-- =============================================================================
-- NavTicket - Migración 027: push OneSignal al autor cuando el super_admin responde
-- =============================================================================
-- Contexto: la migración 025 crea una fila en `notifications` (bandeja de la app)
-- cuando el super_admin responde un caso. Esto suma el push OneSignal en vivo: el
-- mismo trigger dispara un webhook pg_net hacia la edge function `support-reply-notify`
-- (verify_jwt=false) que hace el push al dispositivo del autor.
--
-- Complementan sin duplicar: 025 = fila en `notifications`; 027 = push OneSignal.
-- Misma condición (solo respuestas role='admin') y mismo blindaje BEGIN/EXCEPTION:
-- una falla de push jamás revierte el INSERT del mensaje.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.support_message_notify_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_company uuid;
  t_author  uuid;
  base_url  text := COALESCE(
    current_setting('app.supabase_base_url', true),
    'https://hvysnxvuyexacktlwsbm.supabase.co'
  );
BEGIN
  BEGIN
    -- Solo las respuestas del soporte (role='admin'): el autor es quien abrió el ticket.
    IF NEW.role = 'admin' THEN
      SELECT company_id, user_id INTO t_company, t_author
      FROM support_tickets WHERE id = NEW.ticket_id;

      IF t_author IS NOT NULL THEN
        -- 1) Notificación interna (bandeja de la app), igual que 025.
        INSERT INTO notifications (company_id, user_id, title, body, text, type, path, read)
        VALUES (
          t_company,
          t_author,
          'Nueva respuesta en tu caso de soporte',
          LEFT(NEW.message, 500),
          LEFT(NEW.message, 500),
          'info',
          '/admin',
          FALSE
        );

        -- 2) Push OneSignal en vivo vía edge function (027). Best-effort.
        PERFORM net.http_post(
          url := base_url || '/functions/v1/support-reply-notify',
          body := jsonb_build_object(
            'type', TG_OP,
            'table', 'support_messages',
            'message_id', NEW.id,
            'ticket_id',  NEW.ticket_id,
            'author_id',  t_author,
            'company_id', t_company,
            'message',    NEW.message
          ),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-webhook-secret', current_setting('app.webhook_secret', true)
          )
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- una falla de notificación/push nunca debe romper el envío del mensaje
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_support_message_notify_author ON support_messages;
CREATE TRIGGER trg_support_message_notify_author
  AFTER INSERT ON support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.support_message_notify_author();