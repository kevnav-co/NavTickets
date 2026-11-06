-- =============================================================================
-- NavTicket - Migración 039: search_path fijo en las funciones de webhook
-- =============================================================================
-- webhook_support_notify (011/024 y posteriores), webhook_on_order_assigned y
-- webhook_on_task_assigned (029) son SECURITY DEFINER pero no fijan search_path:
-- una función SECURITY DEFINER sin search_path resuelve nombres con el
-- search_path de quien dispara el trigger, que podría anteponer un esquema
-- propio y suplantar funciones u operadores.
--
-- Se usa ALTER FUNCTION … SET search_path, que NO reemplaza el cuerpo: así se
-- conservan los cambios que migraciones posteriores (p. ej. la 032, aplicada en
-- producción desde un equipo local) hayan hecho sobre estas funciones.
-- También se revoca EXECUTE a los roles de la API (son funciones de trigger;
-- nadie debe invocarlas directamente).
-- IDEMPOTENTE: omite las funciones que no existan.
-- =============================================================================

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.webhook_support_notify()',
    'public.webhook_on_order_assigned()',
    'public.webhook_on_task_assigned()'
  ]
  LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, net, pg_temp', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    END IF;
  END LOOP;
END $$;
