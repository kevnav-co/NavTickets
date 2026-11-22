-- =============================================================================
-- Prueba de las políticas de Storage (migración 052). Requiere supabase_stubs.sql
-- + migraciones.
--   psql -d nt -f supabase/tests/storage_rls.sql
-- =============================================================================
\set ON_ERROR_STOP 1
GRANT USAGE ON SCHEMA storage TO authenticated, anon;
GRANT ALL ON storage.objects TO authenticated, anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;

INSERT INTO companies (id, name) VALUES
 ('5a000000-0000-0000-0000-00000000000a','Storage A'),
 ('5a000000-0000-0000-0000-00000000000b','Storage B')
 ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, company_id, name, role, username, supabase_auth_id) VALUES
 ('5a000000-0000-0000-0001-000000000001','5a000000-0000-0000-0000-00000000000a','Tec A','technician','st_teca','5a000000-0000-0000-00a0-000000000001'),
 ('5a000000-0000-0000-0001-000000000002','5a000000-0000-0000-0000-00000000000a','Admin A','admin','st_adma','5a000000-0000-0000-00a0-000000000002'),
 ('5a000000-0000-0000-0001-000000000003','5a000000-0000-0000-0000-00000000000b','Tec B','technician','st_tecb','5a000000-0000-0000-00a0-000000000003');
INSERT INTO orders (id, company_id, name, scheduled_date, time_slot) VALUES
 ('5a000000-0000-0000-0002-00000000000a','5a000000-0000-0000-0000-00000000000a','Orden A','2030-01-07','08:00'),
 ('5a000000-0000-0000-0002-00000000000b','5a000000-0000-0000-0000-00000000000b','Orden B','2030-01-07','08:00');
-- Objetos existentes: uno nuevo y uno con ruta antigua por empresa.
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
 ('order-photos','5a000000-0000-0000-0000-00000000000a/orders/x/a.jpg','5a000000-0000-0000-00a0-000000000001'),
 ('order-photos','orders/5a000000-0000-0000-0002-00000000000a/initialPhotos/antigua.jpg','5a000000-0000-0000-00a0-000000000001'),
 ('order-photos','5a000000-0000-0000-0000-00000000000b/orders/y/b.jpg','5a000000-0000-0000-00a0-000000000003'),
 ('order-photos','orders/5a000000-0000-0000-0002-00000000000b/initialPhotos/antigua-b.jpg','5a000000-0000-0000-00a0-000000000003');

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
CREATE OR REPLACE FUNCTION pg_temp.expect_rows(sql text, n int, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c int;
BEGIN EXECUTE 'with r as (' || sql || ' returning 1) select count(*) from r' INTO c;
  IF c <> n THEN RAISE EXCEPTION 'FALLO: % → % filas, esperado %', label, c, n; END IF;
  RAISE NOTICE 'OK  % = % filas', label, c;
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, anon;

-- 0) Buckets
SELECT pg_temp.expect_eq($q$select string_agg(id || ':' || public::text, ',' order by id) from storage.buckets$q$,
  'company-assets:true,equipment-photos:true,order-photos:true', 'buckets públicos por enlace');
SELECT pg_temp.expect_eq($q$select count(*)::text from storage.buckets where 'image/svg+xml' = any(allowed_mime_types) or 'application/pdf' = any(allowed_mime_types)$q$,
  '0', 'ningún bucket admite SVG ni PDF');
SELECT pg_temp.expect_eq($q$select count(*)::text from pg_policies where schemaname='storage' and tablename='objects' and 'public' = any(roles)$q$,
  '0', 'sin políticas para el rol public');

-- 1) Anónimo: no lista nada
SET ROLE anon;
SELECT pg_temp.expect_eq($q$select count(*)::text from storage.objects$q$, '0', 'anon lista objetos');
RESET ROLE;

-- 2) Técnico de A
SET ROLE authenticated;
SET request.jwt.claim.sub = '5a000000-0000-0000-00a0-000000000001';
SELECT pg_temp.expect_eq($q$select count(*)::text from storage.objects$q$, '2', 'técnico A ve solo los de A (nuevo + antiguo)');
SELECT pg_temp.expect_rows($q$insert into storage.objects (bucket_id, name, owner_id) values ('order-photos','5a000000-0000-0000-0000-00000000000a/orders/z/c.jpg','5a000000-0000-0000-00a0-000000000001')$q$, 1, 'sube en su carpeta');
SELECT pg_temp.expect_rows($q$insert into storage.objects (bucket_id, name, owner_id) values ('order-photos','orders/5a000000-0000-0000-0002-00000000000a/finalPhotos/d.jpg','5a000000-0000-0000-00a0-000000000001')$q$, 1, 'sube en ruta antigua de una orden suya');
SELECT pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name, owner_id) values ('order-photos','5a000000-0000-0000-0000-00000000000b/orders/z/e.jpg','5a000000-0000-0000-00a0-000000000001')$q$, 'sube en la carpeta de B');
SELECT pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name, owner_id) values ('order-photos','orders/5a000000-0000-0000-0002-00000000000b/x/f.jpg','5a000000-0000-0000-00a0-000000000001')$q$, 'sube en ruta antigua de una orden de B');
SELECT pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name, owner_id) values ('order-photos','5a000000-0000-0000-0000-00000000000a/../5a000000-0000-0000-0000-00000000000b/g.jpg','5a000000-0000-0000-00a0-000000000001')$q$, 'ruta con ..');
SELECT pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name, owner_id) values ('order-photos','5a000000-0000-0000-0000-00000000000a/h.jpg','otro-dueño')$q$, 'sube a nombre de otro');
SELECT pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name, owner_id) values ('company-assets','companies/5a000000-0000-0000-0000-00000000000a/logo.png','5a000000-0000-0000-00a0-000000000001')$q$, 'técnico sube el logo');
SELECT pg_temp.expect_rows($q$update storage.objects set name = name where name like '5a000000-0000-0000-0000-00000000000b/%'$q$, 0, 'reemplaza archivos de B');
SELECT pg_temp.expect_rows($q$delete from storage.objects where name like '5a000000-0000-0000-0000-00000000000b/%'$q$, 0, 'borra archivos de B');
SELECT pg_temp.expect_rows($q$delete from storage.objects where name = '5a000000-0000-0000-0000-00000000000a/orders/z/c.jpg'$q$, 1, 'borra su propio archivo');

-- 3) Admin de A: logo de su empresa sí, de B no; borra archivos ajenos solo en A
SET request.jwt.claim.sub = '5a000000-0000-0000-00a0-000000000002';
SELECT pg_temp.expect_rows($q$insert into storage.objects (bucket_id, name, owner_id) values ('company-assets','companies/5a000000-0000-0000-0000-00000000000a/logo.png','5a000000-0000-0000-00a0-000000000002')$q$, 1, 'admin sube el logo de A');
SELECT pg_temp.expect_fail($q$insert into storage.objects (bucket_id, name, owner_id) values ('company-assets','companies/5a000000-0000-0000-0000-00000000000b/logo.png','5a000000-0000-0000-00a0-000000000002')$q$, 'admin sube el logo de B');
SELECT pg_temp.expect_rows($q$delete from storage.objects where name = 'orders/5a000000-0000-0000-0002-00000000000a/initialPhotos/antigua.jpg'$q$, 1, 'admin borra una foto antigua de A');
SELECT pg_temp.expect_rows($q$delete from storage.objects where name like 'orders/5a000000-0000-0000-0002-00000000000b/%'$q$, 0, 'admin borra fotos antiguas de B');

-- 4) Técnico de B no ve nada de A
SET request.jwt.claim.sub = '5a000000-0000-0000-00a0-000000000003';
SELECT pg_temp.expect_eq($q$select count(*)::text from storage.objects where name like '5a000000-0000-0000-0000-00000000000a/%' or name like 'orders/5a000000-0000-0000-0002-00000000000a/%' or name like 'companies/5a000000-0000-0000-0000-00000000000a/%'$q$, '0', 'B ve archivos de A');
RESET ROLE;
