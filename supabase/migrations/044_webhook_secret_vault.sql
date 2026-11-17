-- =============================================================================
-- 044 — Secreto de los webhooks pg_net desde Supabase Vault
-- =============================================================================
-- Los triggers que llaman a las Edge Functions (024–029: avisos de asignación y
-- de soporte) firman la petición con current_setting('app.webhook_secret'). En
-- Supabase ese parámetro no se puede fijar a nivel de base:
--   ALTER DATABASE postgres SET app.webhook_secret = …
--   → ERROR 42501: permission denied to set parameter "app.webhook_secret"
-- así que en producción llegaba vacío y las Edge Functions, que son fail-closed,
-- respondían 401: no llegaba ningún aviso que saliera de un trigger.
--
-- Esta migración:
--   1) Crea public.webhook_secret(): devuelve el secreto 'webhook_secret' de
--      Vault y, si no existe, el parámetro app.webhook_secret (útil en local y
--      en el CI, donde no hay Vault). Es SECURITY DEFINER y nadie de la API puede
--      ejecutarla: solo la usan las funciones de trigger, que también son
--      SECURITY DEFINER.
--   2) En cada función de public que lea current_setting('app.webhook_secret',
--      true), sustituye solo esa expresión por public.webhook_secret() y vuelve a
--      crear la función con el resto de su cuerpo tal cual está en esta base.
--      Así se conservan los cambios que equipos locales hayan aplicado a esas
--      funciones (ver la nota de la 039).
--   3) Les fija search_path y revoca EXECUTE a los roles de la API, como la 039.
--
-- El valor se guarda aparte, nunca en una migración:
--   select vault.create_secret('<valor>', 'webhook_secret', 'Firma de los webhooks pg_net');
-- y el mismo valor en el secreto WEBHOOK_SECRET de las Edge Functions.
--
-- Idempotente: una segunda ejecución no encuentra nada que sustituir.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.webhook_secret()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v text;
BEGIN
  -- Vault puede no existir (Postgres local, CI): se consulta de forma dinámica.
  IF to_regclass('vault.decrypted_secrets') IS NOT NULL THEN
    EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = $1 ORDER BY created_at DESC LIMIT 1'
      INTO v USING 'webhook_secret';
  END IF;
  RETURN coalesce(nullif(v, ''), nullif(current_setting('app.webhook_secret', true), ''));
END $$;

-- Devuelve un secreto: nadie fuera de las funciones de trigger debe poder leerlo.
REVOKE ALL ON FUNCTION public.webhook_secret() FROM PUBLIC, anon, authenticated, service_role;

DO $do$
DECLARE
  r      record;
  needle constant text := 'current_setting(''app.webhook_secret'', true)';
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname <> 'webhook_secret'
      AND position(needle IN pg_get_functiondef(p.oid)) > 0
  LOOP
    EXECUTE replace(pg_get_functiondef(r.oid), needle, 'public.webhook_secret()');
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, net, pg_temp', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    RAISE NOTICE 'webhook_secret(): actualizada %', r.sig;
  END LOOP;
END
$do$;
