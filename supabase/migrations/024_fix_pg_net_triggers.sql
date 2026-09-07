-- =============================================================================
-- NavTicket - Migración 024: corregir triggers pg_net (firma + blindaje)
-- =============================================================================
-- Contexto: los triggers 003 (orden/tarea asignada → Vercel edge) y 011
-- (soporte → Supabase edge `support-notify`) llamaban
--   net.http_post(url := …, headers := jsonb, body := jsonb…::text)
-- La firma real de la extensión pg_net es
--   net.http_post(url text, body jsonb, params jsonb DEFAULT '{}',
--                 headers jsonb DEFAULT '{"Content-Type":"application/json"}',
--                 timeout_milliseconds integer DEFAULT 5000)
-- así que ese `headers` como 2º argumento (que la firma interpreta como `body`)
-- y el `body::text` no matchean ningún overload → el INSERT falla con
-- "function net.http_post(url => text, headers => jsonb, body => text) does not exist"
-- (antes de instalar pg_net, el error era "schema net does not exist").
--
-- Fix: pasar `body` como jsonb (sin ::text) y `headers` como parámetro correcto.
-- Además se BLINDA cada trigger (BEGIN/EXCEPTION) para que una falla de
-- notificación nunca revierta la escritura de negocio (orden/tarea/soporte).
-- =============================================================================

-- Asegurar que pg_net esté instalada (prerequisito de 003/011 ausente en remoto).
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── Soporte (011): corregir firma + blindar ──────────────────────────────
CREATE OR REPLACE FUNCTION public.webhook_support_notify()
RETURNS TRIGGER AS $$
DECLARE
  base_url text := COALESCE(
    current_setting('app.supabase_base_url', true),
    'https://hvysnxvuyexacktlwsbm.supabase.co'
  );
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := base_url || '/functions/v1/support-notify',
      body := jsonb_build_object(
        'type', TG_OP,
        'table', 'support_tickets',
        'record', row_to_json(NEW)
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', current_setting('app.webhook_secret', true)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- best-effort: el push jamás debe bloquear el ticket de soporte
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Orden asignada (003): corregir firma + blindar + (re)crear trigger ─────
CREATE OR REPLACE FUNCTION public.webhook_on_order_assigned()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      base_url := COALESCE(current_setting('app.vercel_api_base', true), current_setting('app.supabase_base_url', true), 'https://navtickets.vercel.app') || '/api/edge/on-order-assigned',
      body := jsonb_build_object(
        'type', TG_OP,
        'table', 'orders',
        'record', row_to_json(NEW),
        'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.webhook_secret', true)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_order_assigned_webhook ON orders;
CREATE TRIGGER trg_order_assigned_webhook
  AFTER INSERT OR UPDATE OF technician_id ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.webhook_on_order_assigned();

-- ─── Tarea asignada (003): corregir firma + blindar + (re)crear trigger ─────
CREATE OR REPLACE FUNCTION public.webhook_on_task_assigned()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      base_url := COALESCE(current_setting('app.vercel_api_base', true), current_setting('app.supabase_base_url', true), 'https://navtickets.vercel.app') || '/api/edge/on-task-assigned',
      body := jsonb_build_object(
        'type', TG_OP,
        'table', 'tasks',
        'record', row_to_json(NEW),
        'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.webhook_secret', true)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_task_assigned_webhook ON tasks;
CREATE TRIGGER trg_task_assigned_webhook
  AFTER INSERT OR UPDATE OF assigned_to ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.webhook_on_task_assigned();