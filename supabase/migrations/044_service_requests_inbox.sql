-- =============================================================================
-- 044 — Asistente de ventas y servicio técnico (fase 2): bandeja y push
-- =============================================================================
-- 1) Pestaña built-in «Solicitudes» (/requests) para los gestores. La anexa a
--    cada empresa el trigger normalize_company_config (015/016) al tocar `tabs`.
--    La visibilidad final la decide el cliente: permiso MANAGE_SERVICE_REQUESTS
--    y bandera companies.features.aiAssistant (src/permissions.ts).
-- 2) Push a los gestores cuando una solicitud queda pendiente: trigger pg_net →
--    Edge Function service-request-notify, con el mismo patrón y el mismo
--    secreto que las migraciones 029/039 (app.webhook_secret ↔ WEBHOOK_SECRET).
--    La notificación de la campana ya la crea el trigger de la 042; aquí solo
--    se añade el push. Solo se envía el id: la Edge Function relee la solicitud
--    con la service role y no confía en el contenido del webhook.
--
-- Idempotente. Redefine default_built_in_tabs() (como la 035) añadiendo la
-- entrada nueva al final; no cambia ninguna otra función existente.
-- =============================================================================

-- ─── 1) Pestaña «Solicitudes» ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.default_built_in_tabs()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $fn$
SELECT '[
  {"id":"dashboard","label":"Inicio","icon":"LayoutDashboard","route":"/","type":"built-in","builtInComponent":"dashboard","enabled":true,"order":0,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"tasks","label":"Tareas","icon":"CheckSquare","route":"/tasks","type":"built-in","builtInComponent":"tasks","enabled":true,"order":1,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"orders","label":"Órdenes","icon":"ClipboardList","route":"/orders","type":"built-in","builtInComponent":"orders","enabled":true,"order":2,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"clients","label":"Clientes","icon":"Users","route":"/clients","type":"built-in","builtInComponent":"clients","enabled":true,"order":3,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"equipment","label":"Máquinas","icon":"Settings2","route":"/equipment","type":"built-in","builtInComponent":"equipment","enabled":true,"order":4,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"users","label":"Equipo","icon":"UserCog","route":"/users","type":"built-in","builtInComponent":"users","enabled":true,"order":5,"roles":["admin","developer"]},
  {"id":"map","label":"Mapa","icon":"Map","route":"/map","type":"built-in","builtInComponent":"map","enabled":true,"order":6,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"inventory","label":"Inventario","icon":"Package","route":"/inventory","type":"built-in","builtInComponent":"inventory","enabled":true,"order":7,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"reports","label":"Informes","icon":"BarChart3","route":"/reports","type":"built-in","builtInComponent":"reports","enabled":true,"order":8,"roles":["admin","developer"]},
  {"id":"accounting","label":"Contable","icon":"Wallet","route":"/accounting","type":"built-in","builtInComponent":"accounting","enabled":true,"order":9,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"requests","label":"Solicitudes","icon":"Inbox","route":"/requests","type":"built-in","builtInComponent":"requests","enabled":true,"order":10,"roles":["supervisor","admin","aux_admin","developer"],"requiresOnline":true}
]'::jsonb;
$fn$;

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
          'Authorization', 'Bearer ' || current_setting('app.webhook_secret', true)
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
