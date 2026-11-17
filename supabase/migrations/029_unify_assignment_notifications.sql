-- =============================================================================
-- Migración 029: Unificar notificaciones de asignación en Supabase Edge
--
-- Contexto: Los webhooks 003 (orders/tasks) apuntaban a endpoints de Vercel
-- (api/edge/on-order-assigned.ts, api/edge/on-task-assigned.ts) y tienen bugs
-- (variable `title` no definida en on-order-assigned.ts, falta el push OneSignal
-- en on-task-assigned.ts). Esta migración los redirige a las nuevas Supabase
-- Edge Functions que sí notifican correctamente a los técnicos/admins con
-- notificación interna + OneSignal push.
--
-- Se reutiliza el patrón existente: pg_net → Edge Function (verify_jwt=false,
-- acceso por x-webhook-secret o Authorization Bearer).
-- Los webhooks de Vercel (api/edge/*) quedan muertos en el deploy.
-- =============================================================================

-- ─── Trigger: Orden asignada (redirigir a Supabase Edge Function) ───

CREATE OR REPLACE FUNCTION public.webhook_on_order_assigned()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := COALESCE(
        current_setting('app.supabase_base_url', true),
        'https://hvysnxvuyexacktlwsbm.supabase.co'
      ) || '/functions/v1/on-order-assigned',
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
    NULL; -- best-effort: la notificación jamás debe bloquear la asignación
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_order_assigned_webhook ON orders;
CREATE TRIGGER trg_order_assigned_webhook
  AFTER INSERT OR UPDATE OF technician_id ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.webhook_on_order_assigned();

-- ─── Trigger: Tarea asignada (redirigir a Supabase Edge Function) ───

CREATE OR REPLACE FUNCTION public.webhook_on_task_assigned()
RETURNS TRIGGER AS $$
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := COALESCE(
        current_setting('app.supabase_base_url', true),
        'https://hvysnxvuyexacktlwsbm.supabase.co'
      ) || '/functions/v1/on-task-assigned',
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
