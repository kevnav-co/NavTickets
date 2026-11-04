-- =============================================================================
-- NavTicket - Migración 022: aviso de soporte sin proyecto fijo
-- =============================================================================
-- 011 usaba como respaldo la URL de un proyecto concreto
-- (https://hvysnxvuyexacktlwsbm.supabase.co) cuando `app.supabase_base_url` no
-- estaba definido: en cualquier otro proyecto (producción incluida) los avisos de
-- soporte se enviaban a la Edge Function de otro proyecto. Ahora:
--   - la URL sale solo de `app.supabase_base_url`; si falta, se omite el aviso
--     (mismo criterio que los triggers de 021) y el INSERT del ticket nunca falla;
--   - search_path fijo, como corresponde a una función SECURITY DEFINER.
-- IDEMPOTENTE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.webhook_support_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  base_url text := NULLIF(current_setting('app.supabase_base_url', true), '');
BEGIN
  IF base_url IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := base_url || '/functions/v1/support-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', COALESCE(current_setting('app.webhook_secret', true), '')
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', 'support_tickets',
      'record', row_to_json(NEW)
    )::text
  );
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.webhook_support_notify() FROM PUBLIC, anon, authenticated;
