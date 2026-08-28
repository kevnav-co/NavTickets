-- Fase 6 — Inventario de repuestos.
--
-- Nuevas tablas + RLS:
--   inventory_items:         catálogo de repuestos/insumos por empresa (tenant).
--   order_inventory_lines:   M:N repuesto↔orden con cantidad (usage), tenant vía
--                            FKs padres (espejo de equipment_orders, 009).
--
-- Permisos (gate de escritura de stock):
--   - SELECT:   cualquier usuario del tenant (y super_admin).
--   - INSERT/UPDATE/DELETE stock: solo admin/developer/super_admin.
--   - Líneas de orden: quien pueda update_order + ambos padres del tenant.
-- El `quantity` de un ítem se gestiona manualmente; las líneas SOLO registran uso
-- (no hay trigger de auto-descuento aún).

-- ── inventory_items ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL,
  sku                 TEXT NOT NULL DEFAULT '',
  name                TEXT NOT NULL,
  unit                TEXT NOT NULL DEFAULT 'unidad',   -- unidad de medida
  quantity            NUMERIC NOT NULL DEFAULT 0,
  unit_cost           NUMERIC NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_items_company ON public.inventory_items(company_id);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_select_tenant" ON public.inventory_items;
CREATE POLICY "inventory_select_tenant" ON public.inventory_items
  FOR SELECT USING (
    company_id = public.current_company_id() OR public.current_user_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "inventory_insert" ON public.inventory_items;
CREATE POLICY "inventory_insert" ON public.inventory_items
  FOR INSERT WITH CHECK (
    (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
    AND (public.current_user_role() = 'super_admin' OR public.current_user_role() IN ('admin','developer'))
  );

DROP POLICY IF EXISTS "inventory_update" ON public.inventory_items;
CREATE POLICY "inventory_update" ON public.inventory_items
  FOR UPDATE USING (
    (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
    AND (public.current_user_role() = 'super_admin' OR public.current_user_role() IN ('admin','developer'))
  )
  WITH CHECK (
    (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
    AND (public.current_user_role() = 'super_admin' OR public.current_user_role() IN ('admin','developer'))
  );

DROP POLICY IF EXISTS "inventory_delete" ON public.inventory_items;
CREATE POLICY "inventory_delete" ON public.inventory_items
  FOR DELETE USING (
    (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
    AND (public.current_user_role() = 'super_admin' OR public.current_user_role() IN ('admin','developer'))
  );

-- ── order_inventory_lines (M:N, sin company_id; tenant vía padres) ────────────
CREATE TABLE IF NOT EXISTS public.order_inventory_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  inventory_item_id  UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity_out       NUMERIC NOT NULL DEFAULT 1,
  unit_cost_snapshot NUMERIC NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_order_inventory UNIQUE (order_id, inventory_item_id)
);
CREATE INDEX IF NOT EXISTS idx_oinv_order ON public.order_inventory_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_oinv_item ON public.order_inventory_lines(inventory_item_id);
ALTER TABLE public.order_inventory_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oinv_select_tenant" ON public.order_inventory_lines;
CREATE POLICY "oinv_select_tenant" ON public.order_inventory_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_inventory_lines.order_id
        AND o.company_id = public.current_company_id()
    ) OR public.current_user_role() = 'super_admin'
  );

DROP POLICY IF EXISTS "oinv_insert" ON public.order_inventory_lines;
CREATE POLICY "oinv_insert" ON public.order_inventory_lines
  FOR INSERT WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (
      public.user_can('update_order')
      AND EXISTS (SELECT 1 FROM public.orders o            WHERE o.id = order_inventory_lines.order_id             AND o.company_id = public.current_company_id())
      AND EXISTS (SELECT 1 FROM public.inventory_items it  WHERE it.id = order_inventory_lines.inventory_item_id   AND it.company_id = public.current_company_id())
    )
  );

DROP POLICY IF EXISTS "oinv_update" ON public.order_inventory_lines;
CREATE POLICY "oinv_update" ON public.order_inventory_lines
  FOR UPDATE USING (
    public.current_user_role() = 'super_admin'
    OR (
      public.user_can('update_order')
      AND EXISTS (SELECT 1 FROM public.orders o            WHERE o.id = order_inventory_lines.order_id             AND o.company_id = public.current_company_id())
      AND EXISTS (SELECT 1 FROM public.inventory_items it  WHERE it.id = order_inventory_lines.inventory_item_id   AND it.company_id = public.current_company_id())
    )
  )
  WITH CHECK (
    public.current_user_role() = 'super_admin'
    OR (
      public.user_can('update_order')
      AND EXISTS (SELECT 1 FROM public.orders o            WHERE o.id = order_inventory_lines.order_id             AND o.company_id = public.current_company_id())
      AND EXISTS (SELECT 1 FROM public.inventory_items it  WHERE it.id = order_inventory_lines.inventory_item_id   AND it.company_id = public.current_company_id())
    )
  );

DROP POLICY IF EXISTS "oinv_delete" ON public.order_inventory_lines;
CREATE POLICY "oinv_delete" ON public.order_inventory_lines
  FOR DELETE USING (
    public.current_user_role() = 'super_admin'
    OR (
      public.user_can('update_order')
      AND EXISTS (SELECT 1 FROM public.orders o            WHERE o.id = order_inventory_lines.order_id             AND o.company_id = public.current_company_id())
    )
  );

-- ── Realtime ───────────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_inventory_lines;