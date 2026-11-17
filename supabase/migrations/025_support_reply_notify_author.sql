-- =============================================================================
-- NavTicket - Migración 025: notificar al autor cuando el super_admin responde
-- =============================================================================
-- CONTEXTO: el super_admin responde un caso en /admin/support insertando una fila
-- en support_messages con role='admin'. Ese mensaje es visible por realtime en el
-- SupportModal del autor (usuario de la empresa), pero el autor NO recibía ninguna
-- notificación en la bandeja de la app. Este trigger crea una fila en `notifications`
-- dirigida al autor del ticket (support_tickets.user_id) cuando llega una respuesta
-- del soporte.
--
-- Nota RLS: notifications.notif_insert_company permite solo company propia o
-- super_admin; por eso la notificación se crea en un trigger SECURITY DEFINER
-- (corre como superuser y omite RLS). Igual que en 024, va en BEGIN/EXCEPTION para
-- que una falla de notificación jamás revierta el INSERT del mensaje.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.support_message_notify_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t_company uuid;
  t_author  uuid;
BEGIN
  BEGIN
    -- Solo las respuestas del soporte (role='admin'): el autor es quien abrió el ticket.
    IF NEW.role = 'admin' THEN
      SELECT company_id, user_id INTO t_company, t_author
      FROM support_tickets WHERE id = NEW.ticket_id;

      IF t_author IS NOT NULL THEN
        INSERT INTO notifications (company_id, user_id, title, body, text, type, path, read)
        VALUES (
          t_company,
          t_author,
          'Nueva respuesta en tu caso de soporte',
          LEFT(NEW.message, 500),
          LEFT(NEW.message, 500),
          'info',
          '/admin',  -- ruta neutra: el autor abre el soporte desde el Header
          FALSE
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- una falla de notificación nunca debe romper el envío del mensaje
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_support_message_notify_author ON support_messages;
CREATE TRIGGER trg_support_message_notify_author
  AFTER INSERT ON support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.support_message_notify_author();