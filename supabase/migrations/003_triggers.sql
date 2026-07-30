-- =============================================================================
-- NavTicket - Triggers + Webhooks para notificaciones en tiempo real
-- =============================================================================
-- Estos triggers reemplazan las Cloud Functions onorderassigned/ontaskassigned
-- de Firebase. Usan pg_net para hacer POST a los endpoints Vercel.
--
-- PRERREQUISITO: Instalar la extensión pg_net en Supabase:
--   CREATE EXTENSION IF NOT EXISTS pg_net;
-- =============================================================================

-- ─── Webhook: Orden asignada ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION webhook_on_order_assigned()
RETURNS TRIGGER AS $$
BEGIN
  -- Llamar al endpoint Vercel mediante pg_net
  PERFORM net.http_post(
    url := current_setting('app.vercel_api_base', true) || '/api/edge/on-order-assigned',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.webhook_secret', true)
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', 'orders',
      'record', row_to_json(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_assigned_webhook
  AFTER INSERT OR UPDATE OF technician_id ON orders
  FOR EACH ROW
  EXECUTE FUNCTION webhook_on_order_assigned();

-- ─── Webhook: Tarea asignada ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION webhook_on_task_assigned()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.vercel_api_base', true) || '/api/edge/on-task-assigned',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.webhook_secret', true)
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', 'tasks',
      'record', row_to_json(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_task_assigned_webhook
  AFTER INSERT OR UPDATE OF assigned_to ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION webhook_on_task_assigned();

-- ─── Configuración de variables de sesión ───────────────────────────────────
-- Estas variables deben configurarse en Supabase Dashboard:
-- Settings → Database → Session settings
--
-- SET app.vercel_api_base = 'https://navticket.vercel.app';
-- SET app.webhook_secret = 'tu-secreto-compartido';