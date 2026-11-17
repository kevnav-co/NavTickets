-- =============================================================================
-- 046 — Asistente de ventas y servicio técnico (fase 2): bandeja y push
-- =============================================================================
-- 1) Pestaña built-in «Solicitudes» (/requests) para los gestores. La anexa a
--    cada empresa el trigger normalize_company_config (015/016) al tocar `tabs`.
--    La visibilidad final la decide el cliente: permiso MANAGE_SERVICE_REQUESTS
--    y bandera companies.features.aiAssistant (src/permissions.ts).
-- 2) Push a los gestores cuando una solicitud queda pendiente: trigger pg_net →
--    Edge Function service-request-notify, con el mismo patrón que las
--    migraciones 029/039 y el secreto de public.webhook_secret() (044, Vault).
--    La notificación de la campana ya la crea el trigger de la 042; aquí solo
--    se añade el push. Solo se envía el id: la Edge Function relee la solicitud
--    con la service role y no confía en el contenido del webhook.
--
-- Idempotente. Redefine default_built_in_tabs() solo para añadir la entrada
-- nueva al final de la lista existente; no cambia ninguna otra función.
-- =============================================================================

-- ─── 1) Pestaña «Solicitudes» ────────────────────────────────────────────────
-- Se AÑADE la entrada a la lista canónica que ya tenga esta base, en vez de
-- reescribirla entera: producción no tiene la entrada «accounting» de la 035 del
-- repo, y copiar la lista del repo habría añadido «Contable» a todas las
-- empresas como efecto secundario. Si la entrada ya existe, no hace nada.
DO $do$
DECLARE
  canon jsonb := public.default_built_in_tabs();
  tab   jsonb := '{"id":"requests","label":"Solicitudes","icon":"Inbox","route":"/requests","type":"built-in","builtInComponent":"requests","enabled":true,"order":10,"roles":["supervisor","admin","aux_admin","developer"],"requiresOnline":true}';
BEGIN
  IF NOT canon @> '[{"builtInComponent":"requests"}]'::jsonb THEN
    canon := canon || jsonb_build_array(tab);
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.default_built_in_tabs() RETURNS jsonb LANGUAGE sql IMMUTABLE AS %L',
      'SELECT ' || quote_literal(canon::text) || '::jsonb'
    );
  END IF;
END
$do$;

-- Tocar `tabs` dispara normalize_company_config, que anexa los built-ins faltantes.
UPDATE public.companies SET tabs = tabs;

-- ─── 2) Push a los gestores ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.webhook_service_request_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_temp
AS $$
BEGIN
  IF NEW.status = 'pendiente' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pendiente') THEN
    BEGIN
      PERFORM net.http_post(
        url := COALESCE(
          current_setting('app.supabase_base_url', true),
          'https://hvysnxvuyexacktlwsbm.supabase.co'
        ) || '/functions/v1/service-request-notify',
        body := jsonb_build_object(
          'type', TG_OP,
          'table', 'service_requests',
          'record', jsonb_build_object('id', NEW.id, 'company_id', NEW.company_id)
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || public.webhook_secret()
        )
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- best-effort: el aviso nunca debe bloquear la solicitud
    END;
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.webhook_service_request_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_service_request_notify_webhook ON public.service_requests;
CREATE TRIGGER trg_service_request_notify_webhook
  AFTER INSERT OR UPDATE OF status ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.webhook_service_request_notify();
