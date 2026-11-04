-- =============================================================================
-- Prueba de RLS de tareas (migración 020). Requiere supabase_stubs.sql + migraciones.
--   psql -d nt -f supabase/tests/tasks_rls.sql
-- =============================================================================
\set ON_ERROR_STOP 1
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
INSERT INTO users (id, company_id, name, role, username, supabase_auth_id) VALUES
 ('66666666-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Tec T1','technician','tect1','c0000000-0000-0000-0000-000000000001'),
 ('66666666-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Tec T2','technician','tect2','c0000000-0000-0000-0000-000000000002'),
 ('66666666-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Admin T','admin','admt','c0000000-0000-0000-0000-000000000003');
INSERT INTO tasks (id, company_id, title, created_by, assigned_to, participants) VALUES
 ('77777777-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','De T1', '66666666-0000-0000-0000-000000000001','66666666-0000-0000-0000-000000000001','["66666666-0000-0000-0000-000000000001"]'),
 ('77777777-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Compartida', '66666666-0000-0000-0000-000000000003','66666666-0000-0000-0000-000000000003','["66666666-0000-0000-0000-000000000003","66666666-0000-0000-0000-000000000002"]');

CREATE OR REPLACE FUNCTION pg_temp.expect_fail(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql; EXCEPTION WHEN others THEN RAISE NOTICE 'OK  bloqueado: % [%]', label, SQLERRM; RETURN; END;
  RAISE EXCEPTION 'FALLO: % debía ser rechazado', label;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_rows(sql text, n int, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c int;
BEGIN EXECUTE 'with r as (' || sql || ' returning 1) select count(*) from r' INTO c;
  IF c <> n THEN RAISE EXCEPTION 'FALLO: % → % filas, esperado %', label, c, n; END IF;
  RAISE NOTICE 'OK  % = % filas', label, c;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

-- Con la URL configurada el trigger de asignación llama a net.http_post como el usuario que inserta.
SET app.vercel_api_base = 'https://example.invalid';
SET ROLE authenticated;

-- Tec T2: no participa en "De T1"
SET request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000002';
SELECT pg_temp.expect_rows($q$update tasks set title = 'hackeada' where id = '77777777-0000-0000-0000-000000000001'$q$, 0, 'T2 edita tarea ajena');
SELECT pg_temp.expect_rows($q$delete from tasks where id = '77777777-0000-0000-0000-000000000001'$q$, 0, 'T2 borra tarea ajena');
SELECT pg_temp.expect_rows($q$update tasks set completed = true where id = '77777777-0000-0000-0000-000000000002'$q$, 1, 'T2 completa tarea compartida con él');
SELECT pg_temp.expect_fail($q$insert into tasks (company_id, title, created_by) values ('00000000-0000-0000-0000-000000000001','falsa','66666666-0000-0000-0000-000000000001')$q$, 'T2 crea tarea a nombre de T1');
SELECT pg_temp.expect_rows($q$insert into tasks (company_id, title, created_by, participants) values ('00000000-0000-0000-0000-000000000001','propia','66666666-0000-0000-0000-000000000002','["66666666-0000-0000-0000-000000000002"]')$q$, 1, 'T2 crea su propia tarea');

-- Tec T1: dueño de "De T1"
SET request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000001';
SELECT pg_temp.expect_rows($q$update tasks set title = 'De T1 (editada)' where id = '77777777-0000-0000-0000-000000000001'$q$, 1, 'T1 edita su tarea');

-- Admin: cualquiera de la empresa
SET request.jwt.claim.sub = 'c0000000-0000-0000-0000-000000000003';
SELECT pg_temp.expect_rows($q$update tasks set title = 'revisada' where id = '77777777-0000-0000-0000-000000000001'$q$, 1, 'admin edita tarea de T1');
SELECT pg_temp.expect_rows($q$delete from tasks where title = 'propia'$q$, 1, 'admin borra tarea de T2');
