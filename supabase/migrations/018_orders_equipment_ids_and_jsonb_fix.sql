-- =============================================================================
-- NavTicket - Migración 018: orders.equipment_ids + normalizar JSONB
-- =============================================================================
-- 1) La app escribe y lee `equipmentIds` en cada orden, pero `orders` nunca tuvo
--    esa columna (001 modeló la relación con la tabla `equipment_orders`, que la
--    app no usa) → todo INSERT/UPDATE de órdenes con equipos fallaba con
--    "Could not find the 'equipment_ids' column". Se agrega como JSONB (igual que
--    procedures/initial_evidence) y se rellena desde equipment_orders.
-- 2) El cliente serializaba arrays/objetos con JSON.stringify antes de enviarlos
--    (src/utils/caseConverter.ts), así que las columnas JSONB quedaron con
--    strings JSON ("[\"a\"]") en vez de arrays/objetos. Se convierten a JSON real;
--    los valores que no son JSON válido se dejan intactos.
-- IDEMPOTENTE.
-- =============================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS equipment_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.orders o
SET equipment_ids = eo.ids
FROM (
  SELECT order_id, jsonb_agg(equipment_id ORDER BY equipment_id) AS ids
  FROM public.equipment_orders
  GROUP BY order_id
) eo
WHERE eo.order_id = o.id AND o.equipment_ids = '[]'::jsonb;

CREATE OR REPLACE FUNCTION pg_temp.unwrap_jsonb_string(v jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF v IS NULL OR jsonb_typeof(v) <> 'string' THEN RETURN v; END IF;
  RETURN (v #>> '{}')::jsonb;
EXCEPTION WHEN others THEN
  RETURN v;
END $$;

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('orders', 'equipment_ids'), ('orders', 'initial_photos'), ('orders', 'initial_evidence'),
      ('orders', 'final_evidence'), ('orders', 'current_warranty_evidence'), ('orders', 'procedures'),
      ('orders', 'warranty_jobs'), ('orders', 'closing_data'),
      ('tasks', 'files'), ('tasks', 'participants')
    ) AS t(tbl, col)
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = pg_temp.unwrap_jsonb_string(%I) WHERE jsonb_typeof(%I) = ''string''',
      target.tbl, target.col, target.col, target.col
    );
  END LOOP;
END $$;
