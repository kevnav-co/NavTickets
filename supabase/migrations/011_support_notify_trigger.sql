-- =============================================================================
-- NavTicket - Migración 011: soporte notificado por trigger de la BD
-- =============================================================================
-- Reemplaza el flujo frontend→Vercel (`src/services/supportNotify.ts` →
-- `api/edge/support-notify.ts`) por un trigger de Postgres que, al INSERTAR
-- una fila en `support_tickets`, dispara la Supabase Edge Function
-- `support-notify` (push OneSignal a los super_admin).
--
-- Patrón idéntico a la migración 003 (pg_net → webhook). Reutiliza la sesión
-- setting `app.webhook_secret` (ya usada por on-order/on-task-assigned) y la
-- nueva `app.supabase_base_url` con fallback al ref del proyecto.
--
-- PRERREQUISITO: `CREATE EXTENSION IF NOT EXISTS pg_net;` (ya instalada por 003).
-- =============================================================================

-- ─── Trigger: notificar al super_admin de una consulta nueva ────────────────

CREATE OR REPLACE FUNCTION public.webhook_support_notify()
RETURNS TRIGGER AS $$
DECLARE
  base_url text := COALESCE(
    current_setting('app.supabase_base_url', true),
    'https://hvysnxvuyexacktlwsbm.supabase.co'
  );
BEGIN
  PERFORM net.http_post(
    url := base_url || '/functions/v1/support-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', current_setting('app.webhook_secret', true)
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', 'support_tickets',
      'record', row_to_json(NEW)
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_support_notify_webhook ON support_tickets;
CREATE TRIGGER trg_support_notify_webhook
  AFTER INSERT ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.webhook_support_notify();

-- ─── Config para caer bien por defecto ───────────────────────────────────────
-- Opcional: setear en Settings → Database → Session settings:
--   SET app.supabase_base_url = 'https://hvysnxvuyexacktlwsbm.supabase.co';
--   SET app.webhook_secret = '<mismo secreto que on-order/on-task-assigned>';
-- Si app.webhook_secret ya está configurado y se define el secret
-- `WEBHOOK_SECRET` en la edge `support-notify`, se exige la cabecera
-- correspondiente (defensa anti-spam de push).