-- =============================================================================
-- 047 — Tareas programadas con pg_cron (task-scheduler y daily-expiration-check)
-- =============================================================================
-- Hasta ahora las Edge Functions programadas nunca se ejecutaban en producción:
-- pg_cron no estaba instalado y la clave `schedule` de supabase/config.toml no
-- la aplica la CLI. Esta migración:
--
--   1) public.cron_secret(): el secreto 'cron_secret' de Vault o, si no existe,
--      el parámetro app.cron_secret (local y CI). Nadie de la API la ejecuta.
--   2) public.invoke_scheduled_function(nombre): llama vía pg_net a una de las
--      dos funciones permitidas con la cabecera x-cron-secret, que las funciones
--      validan contra su secreto CRON_SECRET (_shared/cron-auth.ts).
--   3) Si pg_cron está disponible, lo instala y programa:
--        task-scheduler          */5 * * * *   (recordatorios, vencimientos del día, recurrentes)
--        daily-expiration-check  0 13 * * *    (08:00 en Colombia: mantenimientos y garantías)
--      En Postgres sin pg_cron (CI) solo crea las funciones.
--
-- El valor del secreto se guarda aparte, nunca en una migración:
--   select vault.create_secret('<valor>', 'cron_secret', 'Firma de los jobs de pg_cron');
-- y el mismo valor en el secreto CRON_SECRET de las Edge Functions.
--
-- Idempotente: cron.schedule con el mismo nombre actualiza el job existente.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cron_secret()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 ORDER BY created_at DESC LIMIT 1'
      INTO v USING 'cron_secret';
  END IF;
  RETURN coalesce(nullif(v, ''), nullif(current_setting('app.cron_secret', true), ''));
END $$;

REVOKE ALL ON FUNCTION public.cron_secret() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.invoke_scheduled_function(p_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_temp
AS $$
BEGIN
  -- Solo las funciones programadas: esto no es un proxy genérico a las Edge Functions.
  IF p_name NOT IN ('task-scheduler', 'daily-expiration-check') THEN
    RAISE EXCEPTION 'Función programada no permitida: %', p_name USING ERRCODE = '22023';
  END IF;
  RETURN net.http_post(
    url := coalesce(current_setting('app.supabase_base_url', true), 'https://hvysnxvuyexacktlwsbm.supabase.co')
           || '/functions/v1/' || p_name,
    body := jsonb_build_object('source', 'pg_cron', 'job', p_name),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', coalesce(public.cron_secret(), '')
    ),
    timeout_milliseconds := 60000
  );
END $$;

REVOKE ALL ON FUNCTION public.invoke_scheduled_function(text) FROM PUBLIC, anon, authenticated, service_role;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    RAISE NOTICE '047: pg_cron no está disponible; no se programan los jobs';
    RETURN;
  END IF;

  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog';

  EXECUTE $q$SELECT cron.schedule('task-scheduler', '*/5 * * * *',
    'SELECT public.invoke_scheduled_function(''task-scheduler'')')$q$;
  EXECUTE $q$SELECT cron.schedule('daily-expiration-check', '0 13 * * *',
    'SELECT public.invoke_scheduled_function(''daily-expiration-check'')')$q$;
  RAISE NOTICE '047: jobs programados';
END
$do$;
