-- =============================================================================
-- NavTicket - Migración 036: orders.equipment_ids
-- =============================================================================
-- La app escribe y lee `equipmentIds` en cada orden, pero en el repositorio
-- `orders` nunca tuvo esa columna (001 modeló la relación con la tabla
-- `equipment_orders`, que la app no usa). En producción ya la creó la 033
-- (aplicada desde un equipo local, aún no publicada): aquí se agrega solo si
-- falta, para que CI y entornos nuevos tengan el mismo esquema. Se rellena desde
-- `equipment_orders` únicamente en órdenes sin equipos.
-- La normalización de strings JSON en columnas JSONB ya la hizo la 022.
-- IDEMPOTENTE: en producción no cambia nada si la 033 ya creó la columna.
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
