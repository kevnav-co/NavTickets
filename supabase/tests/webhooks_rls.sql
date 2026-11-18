-- =============================================================================
-- Prueba del secreto de los webhooks pg_net (migración 044), del aviso de
-- solicitudes (046), de las tareas programadas (047) y del aviso al cliente
-- al confirmar o rechazar (051). Requiere
-- supabase_stubs.sql + migraciones.
--   psql -d nt -f supabase/tests/webhooks_rls.sql
-- Sustituye net.http_post por una versión que guarda lo que envían los triggers
-- y lo restaura al final.
-- =============================================================================
\set ON_ERROR_STOP 1
GRANT USAGE ON SCHEMA public TO authenticated;

CREATE TABLE net.captured (url text, headers jsonb, body jsonb, at timestamptz DEFAULT clock_timestamp());
CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 1000)
RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN INSERT INTO net.captured (url, headers, body) VALUES (url, headers, body); RETURN 1; END $$;

INSERT INTO companies (id, name, slug) VALUES ('b6000000-0000-0000-0000-00000000000a', 'Webhooks', 'webhooks');
INSERT INTO users (id, company_id, name, role, username, supabase_auth_id) VALUES
 ('b6000000-0000-0000-0001-000000000001','b6000000-0000-0000-0000-00000000000a','Tec W','technician','wh_tec','b6000000-0000-0000-00a0-000000000001');

CREATE OR REPLACE FUNCTION pg_temp.expect_eq(sql text, expected text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN EXECUTE sql INTO v;
  IF v IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FALLO: % → %, esperado %', label, v, expected; END IF;
  RAISE NOTICE 'OK  % = %', label, v;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_fail(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql; EXCEPTION WHEN others THEN RAISE NOTICE 'OK  bloqueado: % [%]', label, SQLERRM; RETURN; END;
  RAISE EXCEPTION 'FALLO: % debía ser rechazado', label;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, service_role;

-- 1) Nadie de la API puede leer el secreto
SET ROLE authenticated;
SELECT pg_temp.expect_fail($q$select public.webhook_secret()$q$, 'authenticated lee el secreto');
RESET ROLE;
SET ROLE service_role;
SELECT pg_temp.expect_fail($q$select public.webhook_secret()$q$, 'service_role lee el secreto');
RESET ROLE;

-- 2) Ninguna función sigue leyendo el parámetro directamente, y todas fijan search_path
SELECT pg_temp.expect_eq($q$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.proname <> 'webhook_secret'
    and position('current_setting(''app.webhook_secret'', true)' in pg_get_functiondef(p.oid)) > 0$q$, '0', 'funciones que leen el parámetro directamente');
SELECT pg_temp.expect_eq($q$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and position('public.webhook_secret()' in pg_get_functiondef(p.oid)) > 0
    and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=%', false)$q$, '0', 'funciones de webhook sin search_path fijo');

-- 3) Sin Vault, el secreto sale del parámetro (desarrollo local y CI)
SET app.webhook_secret = 'desde-parametro';
INSERT INTO orders (company_id, name, technician_id, scheduled_date, time_slot)
VALUES ('b6000000-0000-0000-0000-00000000000a', 'W1', 'b6000000-0000-0000-0001-000000000001', '2030-01-07', '08:00');
SELECT pg_temp.expect_eq($q$select headers ->> 'Authorization' from net.captured where url like '%/on-order-assigned' order by at desc limit 1$q$,
  'Bearer desde-parametro', 'firma del aviso de asignación sin Vault');

-- 4) Con Vault, manda Vault
CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets (name text, decrypted_secret text, created_at timestamptz DEFAULT now());
INSERT INTO vault.decrypted_secrets (name, decrypted_secret) VALUES ('webhook_secret', 'desde-vault');
INSERT INTO orders (company_id, name, technician_id, scheduled_date, time_slot)
VALUES ('b6000000-0000-0000-0000-00000000000a', 'W2', 'b6000000-0000-0000-0001-000000000001', '2030-01-07', '10:00');
SELECT pg_temp.expect_eq($q$select headers ->> 'Authorization' from net.captured where url like '%/on-order-assigned' order by at desc limit 1$q$,
  'Bearer desde-vault', 'firma del aviso de asignación con Vault');

-- 5) Una solicitud pendiente avisa a service-request-notify con la misma firma (046)
INSERT INTO service_requests (company_id, status, contact_name) VALUES ('b6000000-0000-0000-0000-00000000000a', 'pendiente', 'Webhook');
SELECT pg_temp.expect_eq($q$select headers ->> 'Authorization' from net.captured where url like '%/service-request-notify' order by at desc limit 1$q$,
  'Bearer desde-vault', 'firma del aviso de solicitud pendiente');
SELECT pg_temp.expect_eq($q$select count(*)::text from net.captured where url like '%/service-request-notify'$q$, '1', 'un solo aviso por solicitud');
UPDATE service_requests SET contact_name = 'Webhook editada' WHERE contact_name = 'Webhook';
SELECT pg_temp.expect_eq($q$select count(*)::text from net.captured where url like '%/service-request-notify'$q$, '1', 'editar una pendiente no repite el aviso');

-- 5b) Aviso al cliente al confirmar o rechazar (051): solo esas transiciones, una vez, firmado
SELECT pg_temp.expect_eq($q$select has_function_privilege('authenticated', 'public.webhook_service_request_customer_notify()', 'EXECUTE')::text$q$,
  'false', 'authenticated ejecuta el trigger del aviso al cliente');
UPDATE service_requests SET status = 'borrador' WHERE contact_name = 'Webhook editada';
UPDATE service_requests SET status = 'pendiente' WHERE contact_name = 'Webhook editada';
SELECT pg_temp.expect_eq($q$select count(*)::text from net.captured where url like '%/service-request-customer-notify'$q$, '0', 'volver a borrador o a pendiente no avisa al cliente');
SET app.service_request_review = 'on';
UPDATE service_requests SET status = 'rechazada', rejection_reason = 'Fuera de la zona de servicio', reviewed_at = now()
 WHERE contact_name = 'Webhook editada';
RESET app.service_request_review;
SELECT pg_temp.expect_eq($q$select count(*)::text from net.captured where url like '%/service-request-customer-notify'$q$, '1', 'un aviso al rechazar');
SELECT pg_temp.expect_eq($q$select headers ->> 'Authorization' from net.captured where url like '%/service-request-customer-notify'$q$,
  'Bearer desde-vault', 'firma del aviso al cliente');
SELECT pg_temp.expect_eq($q$select (body -> 'record' ->> 'status') || '/' || (body -> 'record' ?| array['contact_email', 'rejection_reason'])::text
  from net.captured where url like '%/service-request-customer-notify'$q$, 'rechazada/false', 'el webhook solo lleva id, empresa y estado');
INSERT INTO service_requests (company_id, status, contact_name) VALUES ('b6000000-0000-0000-0000-00000000000a', 'borrador', 'Cancelable');
UPDATE service_requests SET status = 'cancelada' WHERE contact_name = 'Cancelable';
SELECT pg_temp.expect_eq($q$select count(*)::text from net.captured where url like '%/service-request-customer-notify'$q$, '1', 'cancelar no avisa al cliente');

-- 6) Tareas programadas (047): firma con el secreto del cron y solo funciones permitidas
SET ROLE authenticated;
SELECT pg_temp.expect_fail($q$select public.invoke_scheduled_function('task-scheduler')$q$, 'authenticated dispara una tarea programada');
SELECT pg_temp.expect_fail($q$select public.cron_secret()$q$, 'authenticated lee el secreto del cron');
RESET ROLE;
SELECT pg_temp.expect_fail($q$select public.invoke_scheduled_function('send-push')$q$, 'invocar una función no programada');
INSERT INTO vault.decrypted_secrets (name, decrypted_secret) VALUES ('cron_secret', 'cron-desde-vault');
SELECT public.invoke_scheduled_function('daily-expiration-check');
SELECT pg_temp.expect_eq($q$select headers ->> 'x-cron-secret' from net.captured where url like '%/daily-expiration-check' order by at desc limit 1$q$,
  'cron-desde-vault', 'firma de la tarea programada');

-- Limpieza: sin Vault falso y con el stub original
DROP SCHEMA vault CASCADE;
RESET app.webhook_secret;
CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 1000)
RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
DROP TABLE net.captured;
