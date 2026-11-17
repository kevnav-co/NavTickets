-- =============================================================================
-- Prueba del asistente de servicio, fase 1 (migraciones 042 y 043):
-- RLS de solicitudes, conversaciones y configuración; guard de transiciones;
-- available_slots (solapamientos, horario, días bloqueados, antelación) y
-- confirm/reject_service_request. Requiere supabase_stubs.sql + migraciones.
--   psql -d nt -f supabase/tests/service_requests_rls.sql
-- =============================================================================
\set ON_ERROR_STOP 1
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- ─── Datos ───────────────────────────────────────────────────────────────────
INSERT INTO companies (id, name, slug, features) VALUES
 ('a5000000-0000-0000-0000-00000000000a', 'Servicio A', 'servicio-a', '{"aiAssistant": true}'),
 ('a5000000-0000-0000-0000-00000000000b', 'Servicio B', 'servicio-b', '{}');

INSERT INTO users (id, company_id, name, role, username, supabase_auth_id) VALUES
 ('a5000000-0000-0000-0001-000000000001','a5000000-0000-0000-0000-00000000000a','Admin A','admin','sr_admin_a','a5000000-0000-0000-00a0-000000000001'),
 ('a5000000-0000-0000-0001-000000000002','a5000000-0000-0000-0000-00000000000a','Super A','supervisor','sr_sup_a','a5000000-0000-0000-00a0-000000000002'),
 ('a5000000-0000-0000-0001-000000000003','a5000000-0000-0000-0000-00000000000a','Tec Uno','technician','sr_tec1','a5000000-0000-0000-00a0-000000000003'),
 ('a5000000-0000-0000-0001-000000000004','a5000000-0000-0000-0000-00000000000a','Tec Dos','technician','sr_tec2','a5000000-0000-0000-00a0-000000000004'),
 ('a5000000-0000-0000-0001-000000000005','a5000000-0000-0000-0000-00000000000b','Admin B','admin','sr_admin_b','a5000000-0000-0000-00a0-000000000005'),
 ('a5000000-0000-0000-0001-000000000006','a5000000-0000-0000-0000-00000000000b','Tec B','technician','sr_tec_b','a5000000-0000-0000-00a0-000000000006');

INSERT INTO clients (id, company_id, name, email, identification) VALUES
 ('a5000000-0000-0000-0002-000000000001','a5000000-0000-0000-0000-00000000000a','Cliente Existente','existente@cliente.co','900123'),
 ('a5000000-0000-0000-0002-000000000002','a5000000-0000-0000-0000-00000000000a','Otro Cliente',NULL,NULL);

INSERT INTO equipment (id, company_id, client_id, name, serial_number) VALUES
 ('a5000000-0000-0000-0003-000000000001','a5000000-0000-0000-0000-00000000000a','a5000000-0000-0000-0002-000000000001','Nevera','SR-1'),
 ('a5000000-0000-0000-0003-000000000002','a5000000-0000-0000-0000-00000000000a','a5000000-0000-0000-0002-000000000002','Horno','SR-2');

-- Fechas relativas a hoy: el lunes de dentro de dos semanas (entre 8 y 14 días).
CREATE OR REPLACE FUNCTION pg_temp.mon() RETURNS date LANGUAGE sql STABLE AS $$ SELECT date_trunc('week', current_date + 14)::date $$;

-- Solo lunes 08:00–12:00, pasos de 60 min, sin antelación mínima; atienden Tec Uno y Tec Dos;
-- el lunes siguiente está bloqueado.
INSERT INTO assistant_settings (company_id, working_hours, slot_step_minutes, min_lead_hours, technician_ids, blocked_dates)
VALUES ('a5000000-0000-0000-0000-00000000000a', '{"1": [["08:00","12:00"]]}', 60, 0,
        ARRAY['a5000000-0000-0000-0001-000000000003','a5000000-0000-0000-0001-000000000004']::uuid[],
        ARRAY[pg_temp.mon() + 7]);

-- Ocupación del lunes: Tec Uno 08:00–10:00; Tec Uno 11:00 cerrada (no cuenta);
-- Tec Dos 09:00 sin fin (una hora); una orden con fecha ilegible no debe romper nada.
INSERT INTO orders (company_id, name, technician_id, scheduled_date, time_slot, scheduled_end_time, status) VALUES
 ('a5000000-0000-0000-0000-00000000000a','OCUPADA 1','a5000000-0000-0000-0001-000000000003', to_char(pg_temp.mon(),'YYYY-MM-DD'),'08:00','10:00','Pendiente'),
 ('a5000000-0000-0000-0000-00000000000a','CERRADA','a5000000-0000-0000-0001-000000000003', to_char(pg_temp.mon(),'YYYY-MM-DD'),'11:00','12:00','Cerrado'),
 ('a5000000-0000-0000-0000-00000000000a','OCUPADA 2','a5000000-0000-0000-0001-000000000004', to_char(pg_temp.mon(),'YYYY-MM-DD'),'09:00',NULL,'En Progreso'),
 ('a5000000-0000-0000-0000-00000000000a','ILEGIBLE','a5000000-0000-0000-0001-000000000004', 'mañana','a las 3',NULL,'Pendiente');

-- ─── Helpers ─────────────────────────────────────────────────────────────────
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
CREATE OR REPLACE FUNCTION pg_temp.expect_eq(sql text, expected text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN EXECUTE sql INTO v;
  IF v IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FALLO: % → %, esperado %', label, v, expected; END IF;
  RAISE NOTICE 'OK  % = %', label, v;
END $$;
-- Huecos del lunes como texto "HH:MM/n" separados por coma.
CREATE OR REPLACE FUNCTION pg_temp.slots(p_day date, p_dur int, p_tech uuid DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(to_char(slot_time, 'HH24:MI') || '/' || free_technicians, ',' ORDER BY slot_time), '')
  FROM public.available_slots('a5000000-0000-0000-0000-00000000000a', p_day, p_day, p_dur, p_tech)
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, service_role, anon;

-- Cambiar de identidad: service role (el asistente) o un usuario con sesión.
CREATE OR REPLACE FUNCTION pg_temp.as_service() RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.role', 'service_role', false);
      PERFORM set_config('request.jwt.claim.sub', '', false); END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_user(auth_id text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN PERFORM set_config('request.jwt.claim.role', 'authenticated', false);
      PERFORM set_config('request.jwt.claim.sub', auth_id, false); END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated, service_role, anon;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1) available_slots (como el asistente, con la service role)
-- ═════════════════════════════════════════════════════════════════════════════
SET ROLE service_role;
SELECT pg_temp.as_service();

-- 08: solo Tec Dos · 09: nadie · 10 y 11: los dos (la orden cerrada de las 11 no ocupa)
SELECT pg_temp.expect_eq($q$select pg_temp.slots(pg_temp.mon(), 60)$q$, '08:00/1,10:00/2,11:00/2', 'lunes, 60 min');
-- 120 min: solo cabe 10:00–12:00
SELECT pg_temp.expect_eq($q$select pg_temp.slots(pg_temp.mon(), 120)$q$, '10:00/2', 'lunes, 120 min');
-- Filtrado por técnico
SELECT pg_temp.expect_eq($q$select pg_temp.slots(pg_temp.mon(), 60, 'a5000000-0000-0000-0001-000000000003')$q$, '10:00/1,11:00/1', 'lunes, Tec Uno');
SELECT pg_temp.expect_eq($q$select pg_temp.slots(pg_temp.mon(), 60, 'a5000000-0000-0000-0001-000000000004')$q$, '08:00/1,10:00/1,11:00/1', 'lunes, Tec Dos');
-- Un técnico fuera de la lista del asistente no aparece aunque esté libre
SELECT pg_temp.expect_eq($q$select pg_temp.slots(pg_temp.mon(), 60, 'a5000000-0000-0000-0001-000000000001')$q$, '', 'lunes, admin fuera de la lista');
-- Horario y días bloqueados
SELECT pg_temp.expect_eq($q$select pg_temp.slots(pg_temp.mon() + 1, 60)$q$, '', 'martes no laboral');
SELECT pg_temp.expect_eq($q$select pg_temp.slots(pg_temp.mon() + 7, 60)$q$, '', 'lunes bloqueado');
-- Los ids de los técnicos libres corresponden al hueco
SELECT pg_temp.expect_eq($q$select technician_ids::text from available_slots('a5000000-0000-0000-0000-00000000000a', pg_temp.mon(), pg_temp.mon(), 60) where slot_time = '08:00'$q$,
  '{a5000000-0000-0000-0001-000000000004}', 'técnico libre a las 08:00');
-- Validaciones
SELECT pg_temp.expect_fail($q$select * from available_slots('a5000000-0000-0000-0000-00000000000a', pg_temp.mon(), pg_temp.mon() + 40, 60)$q$, 'rango de más de 31 días');
SELECT pg_temp.expect_fail($q$select * from available_slots('a5000000-0000-0000-0000-00000000000a', pg_temp.mon(), pg_temp.mon(), 10)$q$, 'duración de 10 minutos');
SELECT pg_temp.expect_fail($q$select * from available_slots('a5000000-0000-0000-0000-00000000000a', pg_temp.mon(), pg_temp.mon() - 1, 60)$q$, 'rango invertido');
RESET ROLE;

-- Antelación mínima: con 30 días de antelación el lunes queda fuera.
UPDATE assistant_settings SET min_lead_hours = 720 WHERE company_id = 'a5000000-0000-0000-0000-00000000000a';
SET ROLE service_role;
SELECT pg_temp.expect_eq($q$select pg_temp.slots(pg_temp.mon(), 60)$q$, '', 'antelación mínima de 30 días');
RESET ROLE;
UPDATE assistant_settings SET min_lead_hours = 0 WHERE company_id = 'a5000000-0000-0000-0000-00000000000a';

-- Quién puede consultarla
SET ROLE anon;
SELECT pg_temp.expect_fail($q$select * from available_slots('a5000000-0000-0000-0000-00000000000a', pg_temp.mon(), pg_temp.mon(), 60)$q$, 'anon consulta disponibilidad');
RESET ROLE;
SET ROLE authenticated;
SELECT pg_temp.as_user('a5000000-0000-0000-00a0-000000000003');
SELECT pg_temp.expect_fail($q$select * from available_slots('a5000000-0000-0000-0000-00000000000a', pg_temp.mon(), pg_temp.mon(), 60)$q$, 'técnico consulta disponibilidad');
SELECT pg_temp.as_user('a5000000-0000-0000-00a0-000000000005');
SELECT pg_temp.expect_fail($q$select * from available_slots('a5000000-0000-0000-0000-00000000000a', pg_temp.mon(), pg_temp.mon(), 60)$q$, 'admin de otra empresa consulta disponibilidad');
SELECT pg_temp.as_user('a5000000-0000-0000-00a0-000000000002');
SELECT pg_temp.expect_eq($q$select pg_temp.slots(pg_temp.mon(), 60)$q$, '08:00/1,10:00/2,11:00/2', 'supervisor consulta disponibilidad');
-- Una empresa sin configuración usa los valores por defecto (lunes a viernes 8–12 y 13–17)
SELECT pg_temp.as_user('a5000000-0000-0000-00a0-000000000005');
SELECT pg_temp.expect_eq($q$select count(*)::text from available_slots('a5000000-0000-0000-0000-00000000000b', pg_temp.mon(), pg_temp.mon(), 60)$q$, '14', 'empresa B con horario por defecto');
RESET ROLE;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2) Solicitudes: escritura del asistente y guard de transiciones
-- ═════════════════════════════════════════════════════════════════════════════
SET ROLE service_role;
SELECT pg_temp.as_service();
INSERT INTO assistant_conversations (id, company_id) VALUES
 ('a5000000-0000-0000-0004-000000000001','a5000000-0000-0000-0000-00000000000a');
SELECT pg_temp.expect_rows($q$insert into assistant_messages (conversation_id, company_id, role, content) values ('a5000000-0000-0000-0004-000000000001','a5000000-0000-0000-0000-00000000000a','user','"Hola"')$q$, 1, 'asistente guarda mensaje');
SELECT pg_temp.expect_fail($q$insert into assistant_messages (conversation_id, company_id, role, content) values ('a5000000-0000-0000-0004-000000000001','a5000000-0000-0000-0000-00000000000b','user','"cruzado"')$q$, 'mensaje con empresa distinta a la de la conversación');

-- R1: cliente nuevo. R2: cliente existente por correo, con un equipo propio y uno ajeno.
-- R3: mismo nombre que un cliente existente, sin correo ni identificación. R4: para rechazar.
INSERT INTO service_requests (id, company_id, conversation_id, contact_name, contact_phone, contact_email, address, service_name, order_type, description, equipment_description) VALUES
 ('a5000000-0000-0000-0005-000000000001','a5000000-0000-0000-0000-00000000000a','a5000000-0000-0000-0004-000000000001','Nuevo Cliente','3001112222','nuevo@cliente.co','Calle 1','Mantenimiento preventivo','Preventivo','Mantenimiento anual','Nevera industrial');
INSERT INTO service_requests (id, company_id, contact_name, contact_email, equipment_ids, description) VALUES
 ('a5000000-0000-0000-0005-000000000002','a5000000-0000-0000-0000-00000000000a','Cliente Existente','EXISTENTE@cliente.co','["a5000000-0000-0000-0003-000000000001","a5000000-0000-0000-0003-000000000002"]','No enfría');
INSERT INTO service_requests (id, company_id, contact_name, contact_phone, description) VALUES
 ('a5000000-0000-0000-0005-000000000003','a5000000-0000-0000-0000-00000000000a','Cliente Existente','3009998888','Homónimo');
INSERT INTO service_requests (id, company_id, contact_name, description) VALUES
 ('a5000000-0000-0000-0005-000000000004','a5000000-0000-0000-0000-00000000000a','Spam','Promoción');

SELECT pg_temp.expect_fail($q$insert into service_requests (company_id, status) values ('a5000000-0000-0000-0000-00000000000a','confirmada')$q$, 'asistente crea solicitud ya confirmada');
SELECT pg_temp.expect_fail($q$insert into service_requests (company_id, status, reviewed_at) values ('a5000000-0000-0000-0000-00000000000a','pendiente', now())$q$, 'asistente crea solicitud con revisión');

SELECT pg_temp.expect_rows($q$update service_requests set status = 'pendiente' where id in ('a5000000-0000-0000-0005-000000000001','a5000000-0000-0000-0005-000000000002','a5000000-0000-0000-0005-000000000003','a5000000-0000-0000-0005-000000000004')$q$, 4, 'asistente deja solicitudes pendientes');
SELECT pg_temp.expect_fail($q$update service_requests set status = 'confirmada' where id = 'a5000000-0000-0000-0005-000000000001'$q$, 'asistente confirma por su cuenta');
SELECT pg_temp.expect_fail($q$update service_requests set status = 'rechazada', rejection_reason = 'x' where id = 'a5000000-0000-0000-0005-000000000001'$q$, 'asistente rechaza por su cuenta');
SELECT pg_temp.expect_fail($q$update service_requests set reviewed_by = 'a5000000-0000-0000-0001-000000000001' where id = 'a5000000-0000-0000-0005-000000000001'$q$, 'asistente fija el revisor');
SELECT pg_temp.expect_fail($q$update service_requests set company_id = 'a5000000-0000-0000-0000-00000000000b' where id = 'a5000000-0000-0000-0005-000000000001'$q$, 'asistente cambia la empresa');
-- La service role no puede confirmar ni rechazar (sin permiso de ejecución)
SELECT pg_temp.expect_fail($q$select confirm_service_request('a5000000-0000-0000-0005-000000000001', pg_temp.mon(), '10:00', 60, 'a5000000-0000-0000-0001-000000000003')$q$, 'service role confirma');
SELECT pg_temp.expect_fail($q$select reject_service_request('a5000000-0000-0000-0005-000000000004', 'no')$q$, 'service role rechaza');
RESET ROLE;

-- Aviso interno: admin y supervisor de A reciben una notificación por cada solicitud pendiente
SELECT pg_temp.expect_eq($q$select count(*)::text from notifications where path = '/requests/a5000000-0000-0000-0005-000000000001'$q$, '2', 'avisos de la solicitud pendiente');
SELECT pg_temp.expect_eq($q$select count(*)::text from notifications where path like '/requests/%' and user_id in ('a5000000-0000-0000-0001-000000000003','a5000000-0000-0000-0001-000000000005')$q$, '0', 'ni técnicos ni otra empresa reciben avisos');

-- ═════════════════════════════════════════════════════════════════════════════
-- 3) RLS desde el navegador
-- ═════════════════════════════════════════════════════════════════════════════
SET ROLE authenticated;
SELECT pg_temp.as_user('a5000000-0000-0000-00a0-000000000003');   -- Tec Uno
SELECT pg_temp.expect_eq($q$select count(*)::text from service_requests$q$, '0', 'técnico ve solicitudes');
SELECT pg_temp.expect_eq($q$select count(*)::text from assistant_messages$q$, '0', 'técnico ve transcripciones');
SELECT pg_temp.expect_fail($q$insert into service_requests (company_id, channel, status, created_by) values ('a5000000-0000-0000-0000-00000000000a','manual','pendiente','a5000000-0000-0000-0001-000000000003')$q$, 'técnico crea solicitud manual');

SELECT pg_temp.as_user('a5000000-0000-0000-00a0-000000000005');   -- Admin B
SELECT pg_temp.expect_eq($q$select count(*)::text from service_requests$q$, '0', 'admin de otra empresa ve solicitudes');
SELECT pg_temp.expect_eq($q$select count(*)::text from assistant_conversations$q$, '0', 'admin de otra empresa ve conversaciones');

SELECT pg_temp.as_user('a5000000-0000-0000-00a0-000000000002');   -- Supervisor A
SELECT pg_temp.expect_eq($q$select count(*)::text from service_requests$q$, '4', 'supervisor ve las solicitudes de su empresa');
SELECT pg_temp.expect_eq($q$select count(*)::text from assistant_messages$q$, '1', 'supervisor ve la transcripción');
SELECT pg_temp.expect_rows($q$update assistant_settings set welcome_message = 'hola'$q$, 0, 'supervisor cambia la configuración');

SELECT pg_temp.as_user('a5000000-0000-0000-00a0-000000000001');   -- Admin A
SELECT pg_temp.expect_rows($q$update service_requests set description = 'editada' where id = 'a5000000-0000-0000-0005-000000000001'$q$, 0, 'admin edita la solicitud directamente');
SELECT pg_temp.expect_rows($q$delete from service_requests where id = 'a5000000-0000-0000-0005-000000000004'$q$, 0, 'admin borra una solicitud');
SELECT pg_temp.expect_fail($q$insert into assistant_conversations (company_id) values ('a5000000-0000-0000-0000-00000000000a')$q$, 'admin crea conversación');
SELECT pg_temp.expect_fail($q$insert into service_requests (company_id, channel, status, created_by) values ('a5000000-0000-0000-0000-00000000000a','web','pendiente','a5000000-0000-0000-0001-000000000001')$q$, 'admin crea solicitud por el canal web');
SELECT pg_temp.expect_fail($q$insert into service_requests (company_id, channel, status, created_by) values ('a5000000-0000-0000-0000-00000000000a','manual','pendiente','a5000000-0000-0000-0001-000000000002')$q$, 'admin crea solicitud a nombre de otro');
SELECT pg_temp.expect_rows($q$insert into service_requests (company_id, channel, status, created_by, contact_name, description) values ('a5000000-0000-0000-0000-00000000000a','manual','pendiente','a5000000-0000-0000-0001-000000000001','Llamada','Por teléfono')$q$, 1, 'admin registra una llamada');
SELECT pg_temp.expect_rows($q$update assistant_settings set welcome_message = 'Bienvenido'$q$, 1, 'admin cambia la configuración');
SELECT pg_temp.expect_fail($q$update assistant_settings set working_hours = '{"8": [["08:00","12:00"]]}'$q$, 'horario con día inexistente');
SELECT pg_temp.expect_fail($q$update assistant_settings set working_hours = '{"1": [["12:00","08:00"]]}'$q$, 'franja con inicio después del fin');
SELECT pg_temp.expect_fail($q$update assistant_settings set timezone = 'Marte/Olympus'$q$, 'zona horaria inexistente');
SELECT pg_temp.expect_fail($q$update assistant_settings set service_types = '[{"id":"x","name":"X","orderType":"Otro","durationMinutes":60}]'$q$, 'servicio con tipo de orden inválido');

-- ═════════════════════════════════════════════════════════════════════════════
-- 4) Confirmar y rechazar
-- ═════════════════════════════════════════════════════════════════════════════
SELECT pg_temp.as_user('a5000000-0000-0000-00a0-000000000003');   -- Tec Uno
SELECT pg_temp.expect_fail($q$select confirm_service_request('a5000000-0000-0000-0005-000000000001', pg_temp.mon(), '10:00', 60, 'a5000000-0000-0000-0001-000000000003')$q$, 'técnico confirma');
SELECT pg_temp.as_user('a5000000-0000-0000-00a0-000000000005');   -- Admin B
SELECT pg_temp.expect_fail($q$select confirm_service_request('a5000000-0000-0000-0005-000000000001', pg_temp.mon(), '10:00', 60, 'a5000000-0000-0000-0001-000000000006')$q$, 'admin de otra empresa confirma');

SELECT pg_temp.as_user('a5000000-0000-0000-00a0-000000000001');   -- Admin A
SELECT pg_temp.expect_fail($q$select confirm_service_request('a5000000-0000-0000-0005-000000000001', pg_temp.mon(), '09:00', 60, 'a5000000-0000-0000-0001-000000000003')$q$, 'confirmar sobre una orden existente');
SELECT pg_temp.expect_fail($q$select confirm_service_request('a5000000-0000-0000-0005-000000000001', pg_temp.mon(), '10:00', 60, 'a5000000-0000-0000-0001-000000000006')$q$, 'confirmar con técnico de otra empresa');
SELECT pg_temp.expect_fail($q$select confirm_service_request('a5000000-0000-0000-0005-000000000001', current_date - 1, '10:00', 60, 'a5000000-0000-0000-0001-000000000003')$q$, 'confirmar en el pasado');
SELECT pg_temp.expect_fail($q$select confirm_service_request('a5000000-0000-0000-0005-000000000001', pg_temp.mon(), '23:30', 60, 'a5000000-0000-0000-0001-000000000003')$q$, 'confirmar pasando la medianoche');

-- R1 → Tec Uno, lunes 10:00–12:00, cliente nuevo
SELECT pg_temp.expect_eq($q$select (confirm_service_request('a5000000-0000-0000-0005-000000000001', pg_temp.mon(), '10:00', 120, 'a5000000-0000-0000-0001-000000000003') is not null)::text$q$, 'true', 'admin confirma R1');
SELECT pg_temp.expect_eq($q$select status::text from service_requests where id = 'a5000000-0000-0000-0005-000000000001'$q$, 'confirmada', 'R1 queda confirmada');
SELECT pg_temp.expect_eq($q$select o.time_slot || '-' || o.scheduled_end_time || ' ' || o.status || ' ' || (o.order_number is not null) || ' ' || o.client_name || ' ' || o.name
  from orders o join service_requests r on r.order_id = o.id where r.id = 'a5000000-0000-0000-0005-000000000001'$q$,
  '10:00-12:00 Pendiente true Nuevo Cliente MANTENIMIENTO PREVENTIVO', 'orden de R1');
SELECT pg_temp.expect_eq($q$select (o.technician_id = 'a5000000-0000-0000-0001-000000000003' and o.scheduled_date = to_char(pg_temp.mon(),'YYYY-MM-DD') and o.description like '%Nevera industrial%')::text
  from orders o join service_requests r on r.order_id = o.id where r.id = 'a5000000-0000-0000-0005-000000000001'$q$, 'true', 'técnico, fecha y equipo indicado en la orden de R1');
SELECT pg_temp.expect_eq($q$select c.contact || ' ' || c.email from clients c join service_requests r on r.client_id = c.id where r.id = 'a5000000-0000-0000-0005-000000000001'$q$, '3001112222 nuevo@cliente.co', 'cliente creado para R1');
SELECT pg_temp.expect_fail($q$select confirm_service_request('a5000000-0000-0000-0005-000000000001', pg_temp.mon(), '10:00', 60, 'a5000000-0000-0000-0001-000000000004')$q$, 'confirmar dos veces');
-- El hueco ya no aparece libre para Tec Uno
SELECT pg_temp.expect_eq($q$select pg_temp.slots(pg_temp.mon(), 60, 'a5000000-0000-0000-0001-000000000003')$q$, '', 'Tec Uno sin huecos tras confirmar');

-- R2 → cliente existente por correo; solo conserva el equipo de ese cliente
SELECT pg_temp.expect_fail($q$select confirm_service_request('a5000000-0000-0000-0005-000000000002', pg_temp.mon(), '11:00', 60, 'a5000000-0000-0000-0001-000000000003')$q$, 'confirmar R2 sobre la orden recién creada');
SELECT pg_temp.expect_eq($q$select (confirm_service_request('a5000000-0000-0000-0005-000000000002', pg_temp.mon(), '11:00', 60, 'a5000000-0000-0000-0001-000000000004') is not null)::text$q$, 'true', 'admin confirma R2');
SELECT pg_temp.expect_eq($q$select o.client_id::text || ' ' || o.equipment_ids::text from orders o join service_requests r on r.order_id = o.id where r.id = 'a5000000-0000-0000-0005-000000000002'$q$,
  'a5000000-0000-0000-0002-000000000001 ["a5000000-0000-0000-0003-000000000001"]', 'R2 enlazada al cliente existente con su equipo');

-- R3 → homónimo sin datos que lo identifiquen: cliente nuevo con sufijo
SELECT pg_temp.expect_eq($q$select (confirm_service_request('a5000000-0000-0000-0005-000000000003', pg_temp.mon(), '08:00', 60, 'a5000000-0000-0000-0001-000000000004') is not null)::text$q$, 'true', 'admin confirma R3');
SELECT pg_temp.expect_eq($q$select c.name from clients c join service_requests r on r.client_id = c.id where r.id = 'a5000000-0000-0000-0005-000000000003'$q$, 'Cliente Existente (3009998888)', 'cliente homónimo con sufijo');

-- R4 → rechazo
SELECT pg_temp.expect_fail($q$select reject_service_request('a5000000-0000-0000-0005-000000000004', '   ')$q$, 'rechazar sin motivo');
SELECT pg_temp.expect_eq($q$select reject_service_request('a5000000-0000-0000-0005-000000000004', 'No es un servicio')::text$q$, '', 'admin rechaza R4');
SELECT pg_temp.expect_eq($q$select status || ' / ' || rejection_reason from service_requests where id = 'a5000000-0000-0000-0005-000000000004'$q$, 'rechazada / No es un servicio', 'R4 queda rechazada');
SELECT pg_temp.expect_fail($q$select confirm_service_request('a5000000-0000-0000-0005-000000000004', pg_temp.mon(), '08:00', 60, 'a5000000-0000-0000-0001-000000000003')$q$, 'confirmar una rechazada');
RESET ROLE;

-- Una solicitud cerrada no se reabre, ni con la service role
SET ROLE service_role;
SELECT pg_temp.as_service();
SELECT pg_temp.expect_fail($q$update service_requests set status = 'pendiente' where id = 'a5000000-0000-0000-0005-000000000004'$q$, 'reabrir una rechazada');
SELECT pg_temp.expect_fail($q$update service_requests set description = 'cambio' where id = 'a5000000-0000-0000-0005-000000000001'$q$, 'editar una confirmada');
RESET ROLE;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5) Borrados en cascada y retención
-- ═════════════════════════════════════════════════════════════════════════════
-- Borrar la orden deja la solicitud confirmada con order_id en NULL, sin error.
DELETE FROM orders WHERE id = (SELECT order_id FROM service_requests WHERE id = 'a5000000-0000-0000-0005-000000000001');
SELECT pg_temp.expect_eq($q$select (order_id is null)::text || ' ' || status from service_requests where id = 'a5000000-0000-0000-0005-000000000001'$q$, 'true confirmada', 'orden borrada');

-- La retención borra la conversación vieja y su transcripción; la solicitud se conserva.
UPDATE assistant_conversations SET last_message_at = now() - interval '200 days' WHERE id = 'a5000000-0000-0000-0004-000000000001';
SET ROLE authenticated;
SELECT pg_temp.as_user('a5000000-0000-0000-00a0-000000000001');
SELECT pg_temp.expect_fail($q$select purge_assistant_transcripts()$q$, 'admin ejecuta la purga');
RESET ROLE;
SET ROLE service_role;
SELECT pg_temp.expect_eq($q$select purge_assistant_transcripts()::text$q$, '1', 'purga de transcripciones');
RESET ROLE;
SELECT pg_temp.expect_eq($q$select (conversation_id is null)::text || ' ' || status from service_requests where id = 'a5000000-0000-0000-0005-000000000001'$q$, 'true confirmada', 'solicitud conservada tras la purga');
SELECT pg_temp.expect_eq($q$select count(*)::text from assistant_messages where conversation_id = 'a5000000-0000-0000-0004-000000000001'$q$, '0', 'mensajes purgados');

-- ═════════════════════════════════════════════════════════════════════════════
-- 6) Fase 2 (migración 046): pestaña y push
-- ═════════════════════════════════════════════════════════════════════════════
SELECT pg_temp.expect_eq($q$select count(*)::text from companies c, jsonb_array_elements(c.tabs) t
  where c.id = 'a5000000-0000-0000-0000-00000000000a' and t ->> 'builtInComponent' = 'requests'$q$, '1', 'pestaña Solicitudes en la empresa');
SELECT pg_temp.expect_eq($q$select has_function_privilege('authenticated', 'public.webhook_service_request_notify()', 'execute')::text$q$, 'false', 'la función del webhook no se invoca por la API');
-- El webhook se dispara al quedar pendiente y nunca bloquea la escritura.
SET app.supabase_base_url = 'https://example.invalid';
SET ROLE service_role;
SELECT pg_temp.as_service();
SELECT pg_temp.expect_rows($q$insert into service_requests (company_id, status, contact_name) values ('a5000000-0000-0000-0000-00000000000a', 'pendiente', 'Con push')$q$, 1, 'solicitud pendiente con webhook');
RESET ROLE;
RESET app.supabase_base_url;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7) Variante de producción: orders.equipment_ids como text[] (033) en vez de
--    jsonb (036). La confirmación debe funcionar con las dos (migración 045).
--    Todo dentro de una transacción que se deshace.
-- ═════════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE FUNCTION pg_temp.j2a(jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT coalesce(array(SELECT jsonb_array_elements_text($1)), '{}') $$;
ALTER TABLE orders ALTER COLUMN equipment_ids DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN equipment_ids TYPE text[] USING pg_temp.j2a(equipment_ids);
INSERT INTO service_requests (id, company_id, status, contact_name, contact_email, equipment_ids, description) VALUES
 ('a5000000-0000-0000-0005-000000000009','a5000000-0000-0000-0000-00000000000a','pendiente','Cliente Existente','existente@cliente.co','["a5000000-0000-0000-0003-000000000001","a5000000-0000-0000-0003-000000000002"]','Con text[]');
SET ROLE authenticated;
SELECT pg_temp.as_user('a5000000-0000-0000-00a0-000000000001');
SELECT pg_temp.expect_eq($q$select (confirm_service_request('a5000000-0000-0000-0005-000000000009', pg_temp.mon() + 2, '10:00', 60, 'a5000000-0000-0000-0001-000000000004') is not null)::text$q$, 'true', 'confirmar con equipment_ids text[]');
RESET ROLE;
SELECT pg_temp.expect_eq($q$select o.equipment_ids::text from orders o join service_requests r on r.order_id = o.id where r.id = 'a5000000-0000-0000-0005-000000000009'$q$,
  '{a5000000-0000-0000-0003-000000000001}', 'equipos guardados como text[]');
ROLLBACK;

RESET request.jwt.claim.sub;
RESET request.jwt.claim.role;
