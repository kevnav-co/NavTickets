-- =============================================================================
-- Prueba de RLS + RPC de Contabilidad (migración 017) contra Postgres local.
--
--   createdb nt
--   psql -d nt -f supabase/tests/supabase_stubs.sql
--   for f in supabase/migrations/0*.sql; do psql -v ON_ERROR_STOP=1 -d nt -f "$f"; done
--   psql -d nt -f supabase/tests/accounting_rls.sql     # cada caso imprime "OK ..."; un fallo aborta
--
-- Simula sesiones con SET ROLE authenticated + request.jwt.claim.sub (= auth.uid()).
-- =============================================================================
\set ON_ERROR_STOP 1
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
INSERT INTO companies (id, name, slug) VALUES ('00000000-0000-0000-0000-0000000000c2','Otra','otra');
INSERT INTO users (id, company_id, name, role, username, supabase_auth_id) VALUES
 ('11111111-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Tec A','technician','teca','a0000000-0000-0000-0000-000000000001'),
 ('11111111-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Tec B','technician','tecb','a0000000-0000-0000-0000-000000000002'),
 ('11111111-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Sup','supervisor','sup','a0000000-0000-0000-0000-000000000003'),
 ('11111111-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000c2','Tec Otra','technician','teco','a0000000-0000-0000-0000-000000000004');

CREATE OR REPLACE FUNCTION pg_temp.expect_fail(sql text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE sql; EXCEPTION WHEN others THEN RAISE NOTICE 'OK  bloqueado: % [%]', label, SQLERRM; RETURN; END;
  RAISE EXCEPTION 'FALLO: % debía ser rechazado', label;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.expect_num(sql text, n numeric, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c numeric;
BEGIN EXECUTE sql INTO c;
  IF c IS DISTINCT FROM n THEN RAISE EXCEPTION 'FALLO: % → %, esperado %', label, c, n; END IF;
  RAISE NOTICE 'OK  % = %', label, c;
END $$;
-- saldo de un usuario = recibido - enviado (transferencias) + ingresos - gastos; entre cuentas propias: in - out
CREATE OR REPLACE FUNCTION pg_temp.balance(u uuid) RETURNS numeric LANGUAGE sql AS $$
  SELECT COALESCE((SELECT sum(CASE WHEN self_entry='in' THEN amount WHEN self_entry='out' THEN -amount
                                   WHEN recipient_id=u THEN amount ELSE -amount END)
                   FROM public.transactions WHERE sender_id=u OR recipient_id=u),0)
       + COALESCE((SELECT sum(amount) FROM public.incomes WHERE user_id=u),0)
       - COALESCE((SELECT sum(amount) FROM public.expenses WHERE user_id=u),0)
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pg_temp TO authenticated;

SET ROLE authenticated;
\set A '''11111111-0000-0000-0000-000000000001'''
\set B '''11111111-0000-0000-0000-000000000002'''
\set S '''11111111-0000-0000-0000-000000000003'''
\set C1 '''00000000-0000-0000-0000-000000000001'''

-- Supervisor: ingreso propio + transfiere 100.000 a Tec A
SET request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003';
INSERT INTO incomes (company_id, user_id, amount, origin, concept) VALUES (:C1, :S, 500000, 'Transferencia', 'Abono');
INSERT INTO transactions (company_id, sender_id, recipient_id, amount, method, concept) VALUES (:C1, :S, :A, 100000, 'Efectivo', 'Transferencia a Tec A');

-- Tec A
SET request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000001';
INSERT INTO expenses (company_id, user_id, amount, origin, concept) VALUES (:C1, :A, 20000, 'Efectivo', 'Repuesto');
SELECT pg_temp.expect_num('select pg_temp.balance(''11111111-0000-0000-0000-000000000001'')', 80000, 'Saldo Tec A tras recibir 100k y gastar 20k');
SELECT pg_temp.expect_num('select count(*) from incomes', 0, 'Tec A no ve ingresos ajenos');

-- Intentos de falsear saldo
SELECT pg_temp.expect_fail($q$insert into expenses (company_id,user_id,amount,origin,concept,is_annulment,related_movement_id) select company_id,user_id,-1000000,origin,'x',true,id from expenses limit 1$q$, 'anulación de gasto directa con monto inflado');
SELECT pg_temp.expect_fail($q$insert into expenses (company_id,user_id,amount,origin,concept) values ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001',-5,'Efectivo','x')$q$, 'gasto negativo');
SELECT pg_temp.expect_fail($q$insert into transactions (company_id,sender_id,recipient_id,amount,method,concept,transaction_group_id,self_entry) values ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001',999999,'Efectivo','Movimiento desde X','g','in')$q$, 'media entrada de movimiento propio (crear dinero)');
SELECT pg_temp.expect_fail($q$insert into transactions (company_id,sender_id,recipient_id,amount,method,concept) values ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001',999,'Efectivo','x')$q$, 'transferencia a mi favor a nombre de Tec B');
SELECT pg_temp.expect_fail($q$insert into transactions (company_id,sender_id,recipient_id,amount,method,concept) values ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000004',5,'Efectivo','x')$q$, 'transferir a usuario de otra empresa');
SELECT pg_temp.expect_fail($q$insert into incomes (company_id,user_id,amount,origin,concept) values ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001',1,'Efectivo','x')$q$, 'técnico registra ingreso');
SELECT pg_temp.expect_num($q$with u as (update transactions set amount = 1 returning 1) select count(*) from u$q$, 0, 'UPDATE no afecta filas (libro inmutable)');
SELECT pg_temp.expect_num($q$with d as (delete from expenses returning 1) select count(*) from d$q$, 0, 'DELETE no afecta filas (libro inmutable)');

-- RPC movimiento entre cuentas: saldo total no cambia
SELECT public.accounting_self_transfer(30000, 'Efectivo', 'Transferencia');
SELECT pg_temp.expect_num('select pg_temp.balance(''11111111-0000-0000-0000-000000000001'')', 80000, 'Saldo Tec A igual tras mover entre cuentas');
SELECT pg_temp.expect_num($q$select sum(case self_entry when 'in' then amount else -amount end) from transactions where method='Transferencia' and self_entry is not null$q$, 30000, 'Cuenta Transferencia +30k');
SELECT pg_temp.expect_fail($q$select public.accounting_self_transfer(5, 'Efectivo', 'Efectivo')$q$, 'origen = destino');

-- RPC anulación
SELECT public.accounting_annul('expense', (select id from expenses where concept='Repuesto'), 'duplicado');
SELECT pg_temp.expect_num('select pg_temp.balance(''11111111-0000-0000-0000-000000000001'')', 100000, 'Saldo Tec A tras anular el gasto');
SELECT pg_temp.expect_fail($q$select public.accounting_annul('expense', (select id from expenses where concept='Repuesto'), null)$q$, 'anular dos veces');
SELECT pg_temp.expect_fail($q$select public.accounting_annul('expense', (select id from expenses where is_annulment), null)$q$, 'anular una anulación');
SELECT pg_temp.expect_fail($q$select public.accounting_annul('transaction', (select id from transactions where concept='Transferencia a Tec A'), null)$q$, 'Tec A anula transferencia que envió el supervisor');
SELECT public.accounting_annul('transaction', (select id from transactions where self_entry='out' and not is_annulment), null);
SELECT pg_temp.expect_num($q$select count(*) from transactions where is_annulment and self_entry is not null$q$, 2, 'Anular movimiento propio anula el par');
SELECT pg_temp.expect_num('select pg_temp.balance(''11111111-0000-0000-0000-000000000001'')', 100000, 'Saldo Tec A intacto tras anular el par');

-- Tec A transfiere 40k a Tec B
INSERT INTO transactions (company_id, sender_id, recipient_id, amount, method, concept) VALUES (:C1, :A, :B, 40000, 'Efectivo', 'Transferencia a Tec B');
SET request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000002';
SELECT pg_temp.expect_fail($q$select public.accounting_annul('transaction', (select id from transactions where concept='Transferencia a Tec B'), null)$q$, 'Tec B (receptor) anula la transferencia');
SELECT pg_temp.expect_num('select count(*) from transactions', 1, 'Tec B ve solo su transacción');
SELECT pg_temp.expect_num('select count(*) from expenses', 0, 'Tec B no ve gastos de Tec A');

-- Supervisor: ve todo y puede anular la transferencia de Tec A
SET request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000003';
SELECT pg_temp.expect_num('select count(*) from expenses', 2, 'Supervisor ve los gastos del equipo');
SELECT public.accounting_annul('transaction', (select id from transactions where concept='Transferencia a Tec B'), 'error');
SELECT pg_temp.expect_num('select pg_temp.balance(''11111111-0000-0000-0000-000000000002'')', 0, 'Saldo Tec B tras anulación del supervisor');
SELECT pg_temp.expect_num('select pg_temp.balance(''11111111-0000-0000-0000-000000000001'')', 100000, 'Saldo Tec A recupera los 40k');
SELECT pg_temp.expect_num($q$select count(*) from transactions where annulment_reason='error'$q$, 1, 'Motivo de anulación registrado');

-- Otra empresa / anónimo
SET request.jwt.claim.sub = 'a0000000-0000-0000-0000-000000000004';
SELECT pg_temp.expect_num('select count(*) from transactions', 0, 'Otra empresa: 0 transacciones');
SELECT pg_temp.expect_fail($q$select public.accounting_annul('expense', (select id from public.expenses limit 1), null)$q$, 'Otra empresa anula movimiento ajeno');
RESET request.jwt.claim.sub;
SELECT pg_temp.expect_num('select count(*) from transactions', 0, 'Anónimo: 0 transacciones');
SELECT pg_temp.expect_fail($q$select public.accounting_self_transfer(5,'Efectivo','Transferencia')$q$, 'Anónimo usa la RPC');
