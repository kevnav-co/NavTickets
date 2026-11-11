-- =============================================================================
-- Prueba de RLS de notificaciones (migración 041). Requiere supabase_stubs.sql
-- + migraciones.
--   psql -d nt -f supabase/tests/notifications_rls.sql
-- =============================================================================
\set ON_ERROR_STOP 1
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;

INSERT INTO companies (id, name) VALUES
 ('00000000-0000-0000-0000-000000000009','Otra Empresa N')
 ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, company_id, name, role, username, supabase_auth_id) VALUES
 ('88888888-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Tecnico N','technician','tecn','d0000000-0000-0000-0000-000000000001'),
 ('88888888-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Admin N','admin','admn','d0000000-0000-0000-0000-000000000002'),
 ('88888888-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000009','Ajeno N','technician','ajenon','d0000000-0000-0000-0000-000000000003'),
 ('88888888-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','Super N','super_admin','supern','d0000000-0000-0000-0000-000000000004');

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

SET ROLE authenticated;

-- ── Técnico de la empresa 1 ────────────────────────────────────────────────
SET request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000001';

-- El vector que cierra la 041: fabricar un aviso del sistema para el administrador.
SELECT pg_temp.expect_fail(
  $q$insert into notifications (company_id, user_id, title, body, text, type, path, read)
     values ('00000000-0000-0000-0000-000000000001','88888888-0000-0000-0000-000000000002',
             'Verifica tu acceso','Pulsa aqui','x','info','/admin/users', false)$q$,
  'tecnico notifica al administrador');

-- Tampoco puede dirigirla a un usuario de otra empresa.
SELECT pg_temp.expect_fail(
  $q$insert into notifications (company_id, user_id, title, body, text, type, path, read)
     values ('00000000-0000-0000-0000-000000000009','88888888-0000-0000-0000-000000000003',
             'Cruzada','x','x','info','/', false)$q$,
  'tecnico notifica a otra empresa');

-- Ni colar su propio id bajo la empresa ajena.
SELECT pg_temp.expect_fail(
  $q$insert into notifications (company_id, user_id, title, body, text, type, path, read)
     values ('00000000-0000-0000-0000-000000000009','88888888-0000-0000-0000-000000000001',
             'Empresa falsa','x','x','info','/', false)$q$,
  'tecnico usa empresa ajena');

-- Lo legítimo sigue permitido: una notificación para sí mismo.
SELECT pg_temp.expect_rows(
  $q$insert into notifications (company_id, user_id, title, body, text, type, path, read)
     values ('00000000-0000-0000-0000-000000000001','88888888-0000-0000-0000-000000000001',
             'Propia','x','x','info','/', false)$q$,
  1, 'tecnico se notifica a si mismo');

-- Y marcarla como leída, que es lo que hace la campana.
SELECT pg_temp.expect_rows(
  $q$update notifications set read = true where user_id = '88888888-0000-0000-0000-000000000001'$q$,
  1, 'tecnico marca la suya como leida');

-- ── super_admin: conserva el alta para cualquier destinatario ──────────────
SET request.jwt.claim.sub = 'd0000000-0000-0000-0000-000000000004';
SELECT pg_temp.expect_rows(
  $q$insert into notifications (company_id, user_id, title, body, text, type, path, read)
     values ('00000000-0000-0000-0000-000000000001','88888888-0000-0000-0000-000000000002',
             'Aviso de plataforma','x','x','info','/', false)$q$,
  1, 'super_admin notifica a otro usuario');

RESET ROLE;
