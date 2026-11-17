-- 023 — Habilitar Realtime para las tablas de negocio que la app suscribe.
--
-- PROBLEMA: la app pide `realtime: true` en useCollection/useSupabaseQuery para
-- tasks/orders/clients/users/companies/notifications/equipment, pero la publicación
-- `supabase_realtime` del remoto solo contenía inventory_items/order_inventory_lines/
-- seguimientos/support_messages/support_tickets. Sin estar la tabla en la publicación,
-- NO se emiten eventos `postgres_changes` → la UI nunca refleja inserts/updates en vivo
-- (p.ej. una tarea recién creada no aparecía hasta recargar).
--
-- FIX: añadir a la publicación las tablas de negocio existentes que la app suscribe.
-- Idempotente: `ALTER PUBLICATION ... ADD TABLE` solo si la tabla aún no es miembro.
-- NOTA: transactions/expenses/incomes (módulo accounting) no existen aún en este
-- remoto; cuando se creen, añadirlas aquí para que su realtime funcione.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tasks','clients','orders','users','companies','notifications','equipment']
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;