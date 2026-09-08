-- =============================================================================
-- NavTicket - Migración 026: notificar al autor cuando cambia el estado del caso
-- =============================================================================
-- CONTEXTO: el super_admin puede cambiar el estado de un caso (abierto -> en
-- progreso -> cerrado) en /admin/support. Este trigger notifica al autor del
-- ticket (support_tickets.user_id) con una fila en `notifications` cada vez que
-- el estado cambia realmente.
--
-- Mismo patrón que 025: SECURITY DEFINER (corre como superuser y omite RLS) y
-- BEGIN/EXCEPTION para que un fallo de notificación jamás rompa el UPDATE del
-- estado.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.support_ticket_status_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  status_label text;
BEGIN
  BEGIN
    -- Solo avisar si el estado cambió de verdad (evita notificar en updates triviales).
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.user_id IS NOT NULL THEN
      status_label := CASE NEW.status
        WHEN 'abierto'      THEN 'Abierto'
        WHEN 'en_progreso'  THEN 'En Progreso'
        WHEN 'cerrado'      THEN 'Cerrado'
        ELSE NEW.status::text
      END;

      INSERT INTO notifications (company_id, user_id, title, body, text, type, path, read)
      VALUES (
        NEW.company_id,
        NEW.user_id,
        'Tu caso de soporte cambió de estado',
        'El estado de tu caso ahora es: ' || status_label,
        'El estado de tu caso ahora es: ' || status_label,
        'info',
        '/admin',  -- ruta neutra: el autor abre el soporte desde el Header
        FALSE
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- una falla de notificación nunca debe romper el cambio de estado
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_support_ticket_status_notify ON support_tickets;
CREATE TRIGGER trg_support_ticket_status_notify
  AFTER UPDATE OF status ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.support_ticket_status_notify();