-- =============================================================================
-- Prueba de escalada de privilegios en users y URLs de pestañas (migración 037).
-- Requiere: supabase_stubs.sql + migraciones aplicadas sobre una base nueva.
--   psql -d nt -f supabase/tests/users_rls.sql
-- =============================================================================
\set ON_ERROR_STOP 1
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
INSERT INTO companies (id, name, slug) VALUES ('00000000-0000-0000-0000-0000000000d2','Otra U','otra-u');
INSERT INTO users (id, company_id, name, role, username, supabase_auth_id) VALUES
 ('55555555-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Tec U','technician','tecu','b0000000-0000-0000-0000-000000000001'),
 ('55555555-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Admin U','admin','admu','b0000000-0000-0000-0000-000000000002'),
 ('55555555-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Sup U','supervisor','supu','b0000000-0000-0000-0000-000000000003'),
 ('55555555-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','Super U','super_admin','superu','b0000000-0000-0000-0000-000000000004');

CREATE OR REPLACE FUNCTION pg_temp.expect_fail(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql; EXCEPTION WHEN others THEN RAISE NOTICE 'OK  bloqueado: % [%]', label, SQLERRM; RETURN; END;
  RAISE EXCEPTION 'FALLO: % debía ser rechazado', label;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_ok(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE sql; RAISE NOTICE 'OK  permitido: %', label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_role(uid uuid, r text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE cur text;
BEGIN SELECT role::text INTO cur FROM public.users WHERE id = uid;
  IF cur IS DISTINCT FROM r THEN RAISE EXCEPTION 'FALLO: % → rol %, esperado %', label, cur, r; END IF;
  RAISE NOTICE 'OK  % = %', label, cur;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

UPDATE users SET must_reset_password = true WHERE id = '55555555-0000-0000-0000-000000000001';

SET ROLE authenticated;

-- Técnico sobre su propia fila
SET request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_fail($q$update users set role = 'admin' where id = '55555555-0000-0000-0000-000000000001'$q$, 'técnico se sube a admin');
SELECT pg_temp.expect_fail($q$update users set company_id = '00000000-0000-0000-0000-0000000000d2' where id = '55555555-0000-0000-0000-000000000001'$q$, 'técnico se cambia de empresa');
SELECT pg_temp.expect_fail($q$update users set supabase_auth_id = 'b0000000-0000-0000-0000-000000000002' where id = '55555555-0000-0000-0000-000000000001'$q$, 'técnico suplanta otra identidad');
SELECT pg_temp.expect_fail($q$update users set must_reset_password = false where id = '55555555-0000-0000-0000-000000000001'$q$, 'técnico se salta el cambio de clave obligatorio');
SELECT pg_temp.expect_ok($q$update users set name = 'Tec U2', latitude = 4.6, longitude = -74.1 where id = '55555555-0000-0000-0000-000000000001'$q$, 'técnico actualiza su nombre y GPS');
SELECT pg_temp.expect_ok($q$update users set name = 'Tec U3', role = 'technician' where id = '55555555-0000-0000-0000-000000000001'$q$, 'reenviar el mismo rol sin cambiarlo');

-- Supervisor: no tiene update_user_role
SET request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000003';
SELECT pg_temp.expect_fail($q$update users set role = 'admin' where id = '55555555-0000-0000-0000-000000000003'$q$, 'supervisor se sube a admin');

-- Admin de la empresa
SET request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000002';
SELECT pg_temp.expect_ok($q$update users set role = 'supervisor' where id = '55555555-0000-0000-0000-000000000001'$q$, 'admin asciende técnico a supervisor');
SELECT pg_temp.expect_fail($q$update users set role = 'developer' where id = '55555555-0000-0000-0000-000000000001'$q$, 'admin asigna developer');
SELECT pg_temp.expect_fail($q$update users set role = 'super_admin' where id = '55555555-0000-0000-0000-000000000002'$q$, 'admin se sube a super_admin');
SELECT pg_temp.expect_fail($q$update users set role = 'supervisor' where id = '55555555-0000-0000-0000-000000000002'$q$, 'admin cambia su propio rol');
SELECT pg_temp.expect_fail($q$update users set company_id = '00000000-0000-0000-0000-0000000000d2' where id = '55555555-0000-0000-0000-000000000001'$q$, 'admin mueve usuario a otra empresa');

-- super_admin puede asignar roles reservados
SET request.jwt.claim.sub = 'b0000000-0000-0000-0000-000000000004';
SELECT pg_temp.expect_ok($q$update users set role = 'developer' where id = '55555555-0000-0000-0000-000000000001'$q$, 'super_admin asigna developer');

RESET ROLE;
RESET request.jwt.claim.sub;
SELECT pg_temp.expect_role('55555555-0000-0000-0000-000000000002', 'admin', 'Rol final de Admin U');
SELECT pg_temp.expect_role('55555555-0000-0000-0000-000000000003', 'supervisor', 'Rol final de Sup U');
SELECT pg_temp.expect_ok($q$update users set must_reset_password = true where id = '55555555-0000-0000-0000-000000000002'$q$, 'backend (sin sesión) marca must_reset_password');

-- Pestañas: solo https en iframe/external
SELECT pg_temp.expect_fail($q$update companies set tabs = tabs || '[{"id":"x","label":"Malo","icon":"Globe","route":"/custom/x","type":"iframe","content":"javascript:alert(1)","enabled":true,"order":20,"roles":["admin"]}]'::jsonb where id = '00000000-0000-0000-0000-000000000001'$q$, 'pestaña iframe con javascript:');
SELECT pg_temp.expect_fail($q$update companies set tabs = tabs || '[{"id":"y","label":"Http","icon":"Globe","route":"/custom/y","type":"external","content":"http://example.com","enabled":true,"order":21,"roles":["admin"]}]'::jsonb where id = '00000000-0000-0000-0000-000000000001'$q$, 'pestaña external con http:');
SELECT pg_temp.expect_ok($q$update companies set tabs = tabs || '[{"id":"z","label":"Ok","icon":"Globe","route":"/custom/z","type":"iframe","content":"https://example.com/panel","enabled":true,"order":22,"roles":["admin"]}]'::jsonb where id = '00000000-0000-0000-0000-000000000001'$q$, 'pestaña iframe https');
