-- =============================================================================
-- Prueba del panel del super_admin (migración 054): suspensión de empresas,
-- auditoría, estadísticas y borrado completo. Requiere supabase_stubs.sql +
-- migraciones.
--   psql -d nt -f supabase/tests/companies_admin_rls.sql
-- =============================================================================
\set ON_ERROR_STOP 1
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT USAGE ON SCHEMA storage TO authenticated, anon;
GRANT ALL ON storage.objects TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- La 054 quita escritura sobre el registro; la línea anterior la vuelve a dar en la prueba.
REVOKE ALL ON public.admin_audit_log FROM authenticated;
GRANT SELECT ON public.admin_audit_log TO authenticated;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_app_meta_data jsonb;

INSERT INTO companies (id, name) VALUES
 ('5c000000-0000-0000-0000-00000000000a','Panel A'),
 ('5c000000-0000-0000-0000-00000000000b','Panel B'),
 ('5c000000-0000-0000-0000-00000000000c','Panel Raíz')
 ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, company_id, name, role, username, supabase_auth_id) VALUES
 ('5c000000-0000-0000-0001-000000000001','5c000000-0000-0000-0000-00000000000a','Admin A','admin','pn_adma','5c000000-0000-0000-00a0-000000000001'),
 ('5c000000-0000-0000-0001-000000000002','5c000000-0000-0000-0000-00000000000a','Tec A','technician','pn_teca','5c000000-0000-0000-00a0-000000000002'),
 ('5c000000-0000-0000-0001-000000000003','5c000000-0000-0000-0000-00000000000b','Admin B','admin','pn_admb','5c000000-0000-0000-00a0-000000000003'),
 ('5c000000-0000-0000-0001-000000000009','5c000000-0000-0000-0000-00000000000c','Raíz','super_admin','pn_root','5c000000-0000-0000-00a0-000000000009');
INSERT INTO auth.users (id, email) VALUES ('5c000000-0000-0000-00a0-000000000009','pn_root@navas.com') ON CONFLICT DO NOTHING;
INSERT INTO orders (id, company_id, name, scheduled_date, time_slot, status, order_type) VALUES
 ('5c000000-0000-0000-0002-00000000000a','5c000000-0000-0000-0000-00000000000a','Orden A1','2030-01-07','08:00','Pendiente','Correctivo'),
 ('5c000000-0000-0000-0002-00000000000b','5c000000-0000-0000-0000-00000000000a','Orden A2','2030-01-07','08:00','Cerrado','Preventivo'),
 ('5c000000-0000-0000-0002-00000000000c','5c000000-0000-0000-0000-00000000000b','Orden B1','2030-01-07','08:00','En Progreso','Correctivo');
INSERT INTO inventory_items (id, company_id, name) VALUES
 ('5c000000-0000-0000-0003-00000000000a','5c000000-0000-0000-0000-00000000000a','Filtro A');
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES
 ('order-photos','5c000000-0000-0000-0000-00000000000a/orders/x/a.jpg','5c000000-0000-0000-00a0-000000000002'),
 ('order-photos','orders/5c000000-0000-0000-0002-00000000000a/initialPhotos/antigua.jpg','5c000000-0000-0000-00a0-000000000002'),
 ('company-assets','companies/5c000000-0000-0000-0000-00000000000a/logo.png','5c000000-0000-0000-00a0-000000000001'),
 ('order-photos','5c000000-0000-0000-0000-00000000000b/orders/y/b.jpg','5c000000-0000-0000-00a0-000000000003');

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

SELECT pg_temp.expect_eq($q$select string_agg(distinct status, ',') from companies where id::text like '5c000000%'$q$,
  'active', 'empresas nuevas quedan activas');

-- 1) Un admin no puede suspender ni ver estadísticas ni auditoría
SET ROLE authenticated;
SET request.jwt.claim.sub = '5c000000-0000-0000-00a0-000000000001';
SELECT pg_temp.expect_fail($q$select public.admin_set_company_status('5c000000-0000-0000-0000-00000000000b','suspended','x')$q$, 'admin suspende otra empresa');
SELECT pg_temp.expect_fail($q$update companies set status = 'suspended' where id = '5c000000-0000-0000-0000-00000000000a'$q$, 'admin cambia el estado de su empresa');
SELECT pg_temp.expect_fail($q$select count(*) from public.admin_company_overview()$q$, 'admin pide estadísticas globales');
SELECT pg_temp.expect_eq($q$select count(*)::text from admin_audit_log$q$, '0', 'admin lee auditoría');
SELECT pg_temp.expect_fail($q$insert into admin_audit_log (action) values ('company_created')$q$, 'admin escribe en auditoría');
SELECT pg_temp.expect_fail($q$select public.admin_log_action(null, 'company_created', null, '{}')$q$, 'admin llama a admin_log_action');
SELECT pg_temp.expect_fail($q$select public.admin_company_purge_plan('5c000000-0000-0000-0000-00000000000b')$q$, 'admin pide el plan de borrado');
SELECT pg_temp.expect_fail($q$select public.admin_delete_company_rows('5c000000-0000-0000-0000-00000000000b', null)$q$, 'admin borra filas de otra empresa');
SELECT pg_temp.expect_eq($q$select public.my_company_status()$q$, 'active', 'admin A ve su empresa activa');
SELECT pg_temp.expect_eq($q$select count(*)::text from orders$q$, '2', 'admin A ve sus órdenes');

-- 2) El super_admin real: estadísticas, suspende A, no puede suspender su propia empresa
SET request.jwt.claim.sub = '5c000000-0000-0000-00a0-000000000009';
SELECT pg_temp.expect_eq($q$select orders_total || '/' || pending || '/' || closed || '/' || corrective || '/' || preventive || '/' || users_count
                          from public.admin_company_overview() where company_id = '5c000000-0000-0000-0000-00000000000a'$q$,
  '2/1/1/1/1/2', 'estadísticas de A (total/pend/cerr/corr/prev/usuarios)');
SELECT pg_temp.expect_eq($q$select count(*)::text from public.admin_orders_by_month(6)$q$, '6', 'serie de 6 meses');
SELECT pg_temp.expect_fail($q$select public.admin_set_company_status('5c000000-0000-0000-0000-00000000000c','suspended',null)$q$, 'suspender la empresa del super_admin');
SELECT pg_temp.expect_fail($q$select public.admin_set_company_status('5c000000-0000-0000-0000-00000000000a','borrada',null)$q$, 'estado no válido');
SELECT public.admin_set_company_status('5c000000-0000-0000-0000-00000000000a', 'suspended', 'Falta de pago');
SELECT pg_temp.expect_eq($q$select status || ':' || suspended_reason || ':' || (suspended_at is not null)::text from companies where id = '5c000000-0000-0000-0000-00000000000a'$q$,
  'suspended:Falta de pago:true', 'A suspendida con motivo');
SELECT pg_temp.expect_eq($q$select action || ':' || company_name || ':' || actor_name || ':' || (details->>'reason') from admin_audit_log order by id desc limit 1$q$,
  'company_suspended:Panel A:Raíz:Falta de pago', 'auditoría de la suspensión');
SELECT pg_temp.expect_eq($q$select count(*)::text from orders where company_id = '5c000000-0000-0000-0000-00000000000a'$q$, '0',
  'super_admin sin vista previa no lee órdenes de A (RLS de orders sin cambios)');

-- 3) Usuarios de la empresa suspendida: sin acceso a datos ni archivos; B sigue igual
SET request.jwt.claim.sub = '5c000000-0000-0000-00a0-000000000001';
SELECT pg_temp.expect_eq($q$select public.my_company_status()$q$, 'suspended', 'admin A ve «suspended»');
SELECT pg_temp.expect_eq($q$select coalesce(public.current_company_id()::text, 'null')$q$, 'null', 'current_company_id() es NULL');
SELECT pg_temp.expect_eq($q$select count(*)::text from orders$q$, '0', 'admin A no ve órdenes');
SELECT pg_temp.expect_eq($q$select count(*)::text from companies$q$, '0', 'admin A no ve su empresa');
SELECT pg_temp.expect_eq($q$select count(*)::text from users$q$, '1', 'admin A solo lee su propia fila');
SELECT pg_temp.expect_eq($q$select count(*)::text from storage.objects$q$, '0', 'admin A no ve archivos');
SELECT pg_temp.expect_rows($q$update companies set status = 'active' where id = '5c000000-0000-0000-0000-00000000000a'$q$, 0, 'admin A se reactiva solo');
SELECT pg_temp.expect_fail($q$insert into orders (company_id, name, scheduled_date, time_slot) values ('5c000000-0000-0000-0000-00000000000a','Nueva','2030-01-08','08:00')$q$, 'admin A crea una orden');
SET request.jwt.claim.sub = '5c000000-0000-0000-00a0-000000000003';
SELECT pg_temp.expect_eq($q$select count(*)::text from orders$q$, '1', 'admin B sigue viendo sus órdenes');

-- 4) Reactivar
SET request.jwt.claim.sub = '5c000000-0000-0000-00a0-000000000009';
SELECT public.admin_set_company_status('5c000000-0000-0000-0000-00000000000a', 'active', NULL);
SELECT pg_temp.expect_eq($q$select status || ':' || coalesce(suspended_reason, '-') || ':' || (suspended_at is null)::text from companies where id = '5c000000-0000-0000-0000-00000000000a'$q$,
  'active:-:true', 'A reactivada y sin motivo');
SELECT pg_temp.expect_eq($q$select action from admin_audit_log order by id desc limit 1$q$, 'company_reactivated', 'auditoría de la reactivación');
SET request.jwt.claim.sub = '5c000000-0000-0000-00a0-000000000001';
SELECT pg_temp.expect_eq($q$select count(*)::text from orders$q$, '2', 'admin A vuelve a ver sus órdenes');

-- 5) Vista previa: queda en la auditoría
SET request.jwt.claim.sub = '5c000000-0000-0000-00a0-000000000009';
SELECT public.admin_impersonate_start('5c000000-0000-0000-0000-00000000000b', 'admin');
SELECT pg_temp.expect_eq($q$select action || ':' || company_name || ':' || (details->>'role') from admin_audit_log order by id desc limit 1$q$,
  'preview_started:Panel B:admin', 'auditoría de la vista previa');

-- 6) El borrado directo desde el cliente ya no está permitido
SELECT pg_temp.expect_rows($q$delete from companies where id = '5c000000-0000-0000-0000-00000000000b'$q$, 0, 'super_admin borra con DELETE directo');
RESET ROLE;

-- 7) Borrado completo (service role, como la Edge Function)
SET ROLE service_role;
SELECT pg_temp.expect_eq($q$select jsonb_array_length(p->'auth_ids') || '/' || jsonb_array_length(p->'objects') || '/' || (p->>'has_super_admin')
                          from (select public.admin_company_purge_plan('5c000000-0000-0000-0000-00000000000a') p) s$q$,
  '2/3/false', 'plan de borrado de A (cuentas/archivos/super_admin)');
SELECT pg_temp.expect_fail($q$select public.admin_delete_company_rows('5c000000-0000-0000-0000-00000000000c', null)$q$, 'borrar la empresa del super_admin');
RESET ROLE;
-- Contabilidad con RESTRICT hacia users: el borrado debe resolverla.
INSERT INTO incomes (company_id, user_id, amount, origin, concept) VALUES
  ('5c000000-0000-0000-0000-00000000000a', '5c000000-0000-0000-0001-000000000001', 1000, 'Efectivo', 'Prueba');
SET ROLE service_role;
SELECT public.admin_delete_company_rows('5c000000-0000-0000-0000-00000000000a', '5c000000-0000-0000-00a0-000000000009', '{"files": 3}');
RESET ROLE;
SELECT pg_temp.expect_eq($q$select (select count(*) from companies where id = '5c000000-0000-0000-0000-00000000000a')
                          + (select count(*) from users where company_id = '5c000000-0000-0000-0000-00000000000a')
                          + (select count(*) from orders where company_id = '5c000000-0000-0000-0000-00000000000a')
                          + (select count(*) from inventory_items where company_id = '5c000000-0000-0000-0000-00000000000a')
                          + (select count(*) from incomes where company_id = '5c000000-0000-0000-0000-00000000000a')$q$,
  '0', 'A borrada sin restos en la base');
SELECT pg_temp.expect_eq($q$select action || ':' || company_name || ':' || (details->>'files') from admin_audit_log order by id desc limit 1$q$,
  'company_deleted:Panel A:3', 'auditoría del borrado conserva el nombre');
SELECT pg_temp.expect_eq($q$select count(*)::text from orders where company_id = '5c000000-0000-0000-0000-00000000000b'$q$, '1', 'B intacta');
