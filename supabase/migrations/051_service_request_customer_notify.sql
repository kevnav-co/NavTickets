-- =============================================================================
-- 051 — Asistente (fase 4): aviso al cliente cuando su solicitud se confirma o
-- se rechaza
-- =============================================================================
-- Cuando una solicitud pasa a 'confirmada' o 'rechazada' (solo lo hacen
-- confirm_service_request y reject_service_request, migraciones 043/045), un
-- trigger llama por pg_net a la Edge Function service-request-customer-notify.
-- La función relee la solicitud con la service role, busca el correo del
-- cliente (el de la solicitud o el del cliente registrado) y le envía el aviso.
-- Si no hay correo o no hay credenciales de Gmail, no envía nada.
--
-- Mismo patrón que la 046: el webhook solo lleva el id, firma con el secreto de
-- Vault (public.webhook_secret(), migración 044) y es best-effort: un fallo de
-- red nunca bloquea la confirmación ni el rechazo.
-- Idempotente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.webhook_service_request_customer_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('confirmada', 'rechazada') AND OLD.status IS DISTINCT FROM NEW.status THEN
    BEGIN
      PERFORM net.http_post(
        url := COALESCE(
          current_setting('app.supabase_base_url', true),
          'https://hvysnxvuyexacktlwsbm.supabase.co'
        ) || '/functions/v1/service-request-customer-notify',
        body := jsonb_build_object(
          'type', TG_OP,
          'table', 'service_requests',
          'record', jsonb_build_object('id', NEW.id, 'company_id', NEW.company_id, 'status', NEW.status)
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || public.webhook_secret()
        )
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- best-effort: el aviso nunca debe bloquear la revisión
    END;
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.webhook_service_request_customer_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_service_request_customer_notify_webhook ON public.service_requests;
CREATE TRIGGER trg_service_request_customer_notify_webhook
  AFTER UPDATE OF status ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.webhook_service_request_customer_notify();
