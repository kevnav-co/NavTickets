-- =====================================================================
-- Simular CONSUMO de inventario: crea líneas order_inventory_lines por
-- cada orden existente (hasta 3 repuestos de la MISMA empresa, con
-- quantity_out > 0 y unit_cost_snapshot del costo actual del ítem).
-- Idempotente: salta órdenes que ya tengan líneas.
-- Uso: npx supabase db query --linked --file scripts/seed-order-inventory.sql
-- =====================================================================

DO $$
DECLARE
  oid uuid;
  item_row record;
  cnt int;
BEGIN
  FOR oid IN
    SELECT o.id FROM orders o
    WHERE NOT EXISTS (SELECT 1 FROM order_inventory_lines l WHERE l.order_id = o.id)
  LOOP
    cnt := 0;
    FOR item_row IN
      SELECT i.id, i.unit_cost, i.rn
      FROM (
        SELECT i.id, i.unit_cost, row_number() OVER (ORDER BY i.sku) AS rn
        FROM inventory_items i
        WHERE i.company_id = (SELECT company_id FROM orders WHERE id = oid)
          AND i.quantity > 0
      ) i
      WHERE i.rn BETWEEN 1 AND 3
    LOOP
      INSERT INTO order_inventory_lines (order_id, inventory_item_id, quantity_out, unit_cost_snapshot)
      VALUES (oid, item_row.id, 1 + (item_row.rn % 2), item_row.unit_cost);
      cnt := cnt + 1;
    END LOOP;
    RAISE NOTICE 'order % items %', oid, cnt;
  END LOOP;
END $$;