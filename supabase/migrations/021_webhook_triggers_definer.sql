-- =============================================================================
-- NavTicket - Migración 021: triggers de webhook robustos
-- =============================================================================
-- Las funciones de 003 (webhook_on_order_assigned / webhook_on_task_assigned):
--   1) Corrían con el rol del usuario que inserta (no SECURITY DEFINER). Si
--      `authenticated` no tiene USAGE sobre el schema `net` (lo normal: abrirlo
--      permitiría SSRF desde cualquier sesión), crear o reasignar órdenes y
--      tareas desde la app fallaba con "permission denied for schema net".
--      Ahora son SECURITY DEFINER con search_path fijo (mismo patrón que 011).
--   2) Si `app.vercel_api_base` no estaba configurado, la URL era NULL y
--      net.http_post abortaba el INSERT/UPDATE. Ahora se omite el aviso.
--   3) El trigger de tareas solo escuchaba `assigned_to`, así que el aviso de
--      "tarea completada" de api/edge/on-task-assigned.ts nunca se enviaba.
--      Ahora también escucha `completed`.
-- IDEMPOTENTE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.webhook_on_order_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  base_url text := NULLIF(current_setting('app.vercel_api_base', true), '');
BEGIN
  IF base_url IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := base_url || '/api/edge/on-order-assigned',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(current_setting('app.webhook_secret', true), '')
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', 'orders',
      'record', row_to_json(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
    )::text
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.webhook_on_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  base_url text := NULLIF(current_setting('app.vercel_api_base', true), '');
BEGIN
  IF base_url IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := base_url || '/api/edge/on-task-assigned',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(current_setting('app.webhook_secret', true), '')
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', 'tasks',
      'record', row_to_json(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
    )::text
  );
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.webhook_on_order_assigned() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.webhook_on_task_assigned() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_task_assigned_webhook ON public.tasks;
CREATE TRIGGER trg_task_assigned_webhook
  AFTER INSERT OR UPDATE OF assigned_to, completed ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.webhook_on_task_assigned();
