-- =============================================================================
-- NavTicket - Migración 017: Contabilidad (caja menor de campo)
-- =============================================================================
-- El módulo /accounting (src/components/Account/*) usaba tres colecciones
-- heredadas de Firebase que nunca se crearon en Supabase. Esta migración crea:
--   - transactions : transferencias entre usuarios y movimientos entre cuentas
--                    propias (Efectivo ⇄ Transferencia: par de filas con el mismo
--                    transaction_group_id y self_entry 'out' / 'in').
--   - expenses     : gastos de un usuario (opcionalmente ligados a una orden).
--   - incomes      : ingresos registrados por administración.
--
-- LIBRO INMUTABLE: no hay UPDATE ni DELETE vía API. Las correcciones se hacen
-- anulando: un movimiento compensatorio con is_annulment = true y
-- related_movement_id → original (una sola anulación por movimiento).
--
-- Inserción directa (RLS) solo para lo que no puede falsear saldos:
--   transactions : transferencia normal emitida por mí a otro usuario.
--   expenses     : gasto propio, monto positivo.
--   incomes      : ingreso propio de un gestor, monto positivo.
-- Movimientos entre cuentas propias y anulaciones van por RPC SECURITY DEFINER
-- (accounting_self_transfer / accounting_annul), que validan en el servidor.
--
-- Lectura: misma empresa y (gestor o el movimiento es mío).
-- Gestores = supervisor, aux_admin, admin, developer, super_admin.
-- El módulo solo es visible con companies.features.accounting = true.
-- IDEMPOTENTE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_accounting_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.current_user_role()::text IN ('supervisor','aux_admin','admin','developer','super_admin'),
    false
  )
$$;

-- -----------------------------------------------------------------------------
-- 1) Tablas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  sender_name          TEXT NOT NULL DEFAULT '',
  recipient_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  recipient_name       TEXT NOT NULL DEFAULT '',
  amount               NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method               TEXT NOT NULL CHECK (method IN ('Efectivo','Transferencia')),
  concept              TEXT NOT NULL,
  transaction_group_id TEXT,
  self_entry           TEXT CHECK (self_entry IN ('out','in')),
  is_annulment         BOOLEAN NOT NULL DEFAULT false,
  related_movement_id  UUID REFERENCES public.transactions(id) ON DELETE RESTRICT,
  annulment_reason     TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT transactions_self_entry_shape CHECK (
    (self_entry IS NULL) = (transaction_group_id IS NULL)
    AND (self_entry IS NULL OR sender_id = recipient_id)
  ),
  CONSTRAINT transactions_annulment_shape CHECK (is_annulment = (related_movement_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_transactions_company   ON public.transactions(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_sender    ON public.transactions(sender_id);
CREATE INDEX IF NOT EXISTS idx_transactions_recipient ON public.transactions(recipient_id);
CREATE INDEX IF NOT EXISTS idx_transactions_group     ON public.transactions(transaction_group_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_annulment ON public.transactions(related_movement_id) WHERE is_annulment;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.expenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  user_name           TEXT NOT NULL DEFAULT '',
  amount              NUMERIC(14,2) NOT NULL,
  origin              TEXT NOT NULL CHECK (origin IN ('Efectivo','Transferencia')),
  concept             TEXT NOT NULL,
  order_id            UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  is_annulment        BOOLEAN NOT NULL DEFAULT false,
  related_movement_id UUID REFERENCES public.expenses(id) ON DELETE RESTRICT,
  annulment_reason    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT expenses_amount_sign CHECK (CASE WHEN is_annulment THEN amount < 0 ELSE amount > 0 END),
  CONSTRAINT expenses_annulment_shape CHECK (is_annulment = (related_movement_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_expenses_company ON public.expenses(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_user    ON public.expenses(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_annulment ON public.expenses(related_movement_id) WHERE is_annulment;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.incomes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  user_name           TEXT NOT NULL DEFAULT '',
  amount              NUMERIC(14,2) NOT NULL,
  origin              TEXT NOT NULL CHECK (origin IN ('Efectivo','Transferencia')),
  concept             TEXT NOT NULL,
  is_annulment        BOOLEAN NOT NULL DEFAULT false,
  related_movement_id UUID REFERENCES public.incomes(id) ON DELETE RESTRICT,
  annulment_reason    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT incomes_amount_sign CHECK (CASE WHEN is_annulment THEN amount < 0 ELSE amount > 0 END),
  CONSTRAINT incomes_annulment_shape CHECK (is_annulment = (related_movement_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_incomes_company ON public.incomes(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incomes_user    ON public.incomes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_incomes_annulment ON public.incomes(related_movement_id) WHERE is_annulment;
ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2) RLS — sin políticas UPDATE/DELETE: el libro es inmutable vía API.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "transactions_select" ON public.transactions;
CREATE POLICY "transactions_select" ON public.transactions
  FOR SELECT USING (
    company_id = public.current_company_id()
    AND (
      public.is_accounting_manager()
      OR sender_id = public.current_user_id()
      OR recipient_id = public.current_user_id()
    )
  );

DROP POLICY IF EXISTS "transactions_insert" ON public.transactions;
CREATE POLICY "transactions_insert" ON public.transactions
  FOR INSERT WITH CHECK (
    company_id = public.current_company_id()
    AND sender_id = public.current_user_id()
    AND recipient_id <> sender_id
    AND NOT is_annulment
    AND transaction_group_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.users r
      WHERE r.id = transactions.recipient_id AND r.company_id = public.current_company_id()
    )
  );

DROP POLICY IF EXISTS "expenses_select" ON public.expenses;
CREATE POLICY "expenses_select" ON public.expenses
  FOR SELECT USING (
    company_id = public.current_company_id()
    AND (public.is_accounting_manager() OR user_id = public.current_user_id())
  );

DROP POLICY IF EXISTS "expenses_insert" ON public.expenses;
CREATE POLICY "expenses_insert" ON public.expenses
  FOR INSERT WITH CHECK (
    company_id = public.current_company_id()
    AND user_id = public.current_user_id()
    AND NOT is_annulment
  );

DROP POLICY IF EXISTS "incomes_select" ON public.incomes;
CREATE POLICY "incomes_select" ON public.incomes
  FOR SELECT USING (
    company_id = public.current_company_id()
    AND (public.is_accounting_manager() OR user_id = public.current_user_id())
  );

DROP POLICY IF EXISTS "incomes_insert" ON public.incomes;
CREATE POLICY "incomes_insert" ON public.incomes
  FOR INSERT WITH CHECK (
    company_id = public.current_company_id()
    AND user_id = public.current_user_id()
    AND public.is_accounting_manager()
    AND NOT is_annulment
  );

-- -----------------------------------------------------------------------------
-- 3) RPC: movimiento entre cuentas propias (par atómico out/in)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_self_transfer(
  p_amount numeric,
  p_from text,
  p_to text,
  p_created_at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me public.users%ROWTYPE;
  grp text := 'self_' || gen_random_uuid();
BEGIN
  SELECT * INTO me FROM public.users WHERE supabase_auth_id = auth.uid() LIMIT 1;
  IF me.id IS NULL THEN RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;
  IF p_from IS NOT DISTINCT FROM p_to OR p_from NOT IN ('Efectivo','Transferencia') OR p_to NOT IN ('Efectivo','Transferencia') THEN
    RAISE EXCEPTION 'Cuentas de origen/destino inválidas';
  END IF;

  INSERT INTO public.transactions
    (company_id, sender_id, sender_name, recipient_id, recipient_name, amount, method, concept, transaction_group_id, self_entry, created_at)
  VALUES
    (me.company_id, me.id, me.name, me.id, me.name, p_amount, p_from, 'Movimiento a ' || p_to,     grp, 'out', COALESCE(p_created_at, now())),
    (me.company_id, me.id, me.name, me.id, me.name, p_amount, p_to,   'Movimiento desde ' || p_from, grp, 'in',  COALESCE(p_created_at, now()));
  RETURN grp;
END $$;

-- -----------------------------------------------------------------------------
-- 4) RPC: anulación (transacción —incluye su par si es entre cuentas—, gasto o ingreso)
--    Puede anular: un gestor, o el dueño (emisor de la transacción / dueño del gasto).
--    Los ingresos solo los anula un gestor.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_annul(p_kind text, p_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me public.users%ROWTYPE;
  is_manager boolean;
  suffix text := CASE WHEN NULLIF(btrim(p_reason), '') IS NULL THEN '' ELSE ' (Motivo: ' || btrim(p_reason) || ')' END;
  tx public.transactions%ROWTYPE;
  r public.transactions%ROWTYPE;
  ex public.expenses%ROWTYPE;
  inc public.incomes%ROWTYPE;
BEGIN
  SELECT * INTO me FROM public.users WHERE supabase_auth_id = auth.uid() LIMIT 1;
  IF me.id IS NULL THEN RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501'; END IF;
  is_manager := me.role::text IN ('supervisor','aux_admin','admin','developer','super_admin');

  IF p_kind = 'transaction' THEN
    SELECT * INTO tx FROM public.transactions WHERE id = p_id AND company_id = me.company_id;
    IF tx.id IS NULL THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
    IF tx.is_annulment THEN RAISE EXCEPTION 'Una anulación no se puede anular'; END IF;
    IF NOT is_manager AND tx.sender_id <> me.id THEN RAISE EXCEPTION 'Sin permiso para anular' USING ERRCODE = '42501'; END IF;

    FOR r IN
      SELECT * FROM public.transactions t
      WHERE t.company_id = me.company_id AND NOT t.is_annulment
        AND (t.id = tx.id OR (tx.transaction_group_id IS NOT NULL AND t.transaction_group_id = tx.transaction_group_id))
    LOOP
      INSERT INTO public.transactions
        (company_id, sender_id, sender_name, recipient_id, recipient_name, amount, method, concept,
         transaction_group_id, self_entry, is_annulment, related_movement_id, annulment_reason)
      VALUES
        (r.company_id, r.recipient_id, r.recipient_name, r.sender_id, r.sender_name, r.amount, r.method,
         'ANULACIÓN: ' || r.concept || suffix,
         CASE WHEN r.transaction_group_id IS NULL THEN NULL ELSE 'annul_' || r.transaction_group_id END,
         CASE r.self_entry WHEN 'out' THEN 'in' WHEN 'in' THEN 'out' END,
         true, r.id, NULLIF(btrim(p_reason), ''));
    END LOOP;

  ELSIF p_kind = 'expense' THEN
    SELECT * INTO ex FROM public.expenses WHERE id = p_id AND company_id = me.company_id;
    IF ex.id IS NULL THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
    IF ex.is_annulment THEN RAISE EXCEPTION 'Una anulación no se puede anular'; END IF;
    IF NOT is_manager AND ex.user_id <> me.id THEN RAISE EXCEPTION 'Sin permiso para anular' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.expenses
      (company_id, user_id, user_name, amount, origin, concept, order_id, is_annulment, related_movement_id, annulment_reason)
    VALUES
      (ex.company_id, ex.user_id, ex.user_name, -ex.amount, ex.origin, 'ANULACIÓN: ' || ex.concept || suffix,
       ex.order_id, true, ex.id, NULLIF(btrim(p_reason), ''));

  ELSIF p_kind = 'income' THEN
    IF NOT is_manager THEN RAISE EXCEPTION 'Sin permiso para anular' USING ERRCODE = '42501'; END IF;
    SELECT * INTO inc FROM public.incomes WHERE id = p_id AND company_id = me.company_id;
    IF inc.id IS NULL THEN RAISE EXCEPTION 'Movimiento no encontrado'; END IF;
    IF inc.is_annulment THEN RAISE EXCEPTION 'Una anulación no se puede anular'; END IF;
    INSERT INTO public.incomes
      (company_id, user_id, user_name, amount, origin, concept, is_annulment, related_movement_id, annulment_reason)
    VALUES
      (inc.company_id, inc.user_id, inc.user_name, -inc.amount, inc.origin, 'ANULACIÓN: ' || inc.concept || suffix,
       true, inc.id, NULLIF(btrim(p_reason), ''));

  ELSE
    RAISE EXCEPTION 'Tipo de movimiento inválido: %', p_kind;
  END IF;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'El movimiento ya fue anulado';
END $$;

REVOKE ALL ON FUNCTION public.accounting_self_transfer(numeric, text, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accounting_annul(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accounting_self_transfer(numeric, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_annul(text, uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5) Realtime (el módulo se suscribe a cambios)
-- -----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['transactions','expenses','incomes'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 6) Pestaña built-in "Contable" (oculta salvo features.accounting = true)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.default_built_in_tabs()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $fn$
SELECT '[
  {"id":"dashboard","label":"Inicio","icon":"LayoutDashboard","route":"/","type":"built-in","builtInComponent":"dashboard","enabled":true,"order":0,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"tasks","label":"Tareas","icon":"CheckSquare","route":"/tasks","type":"built-in","builtInComponent":"tasks","enabled":true,"order":1,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"orders","label":"Órdenes","icon":"ClipboardList","route":"/orders","type":"built-in","builtInComponent":"orders","enabled":true,"order":2,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"clients","label":"Clientes","icon":"Users","route":"/clients","type":"built-in","builtInComponent":"clients","enabled":true,"order":3,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"equipment","label":"Máquinas","icon":"Settings2","route":"/equipment","type":"built-in","builtInComponent":"equipment","enabled":true,"order":4,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"users","label":"Equipo","icon":"UserCog","route":"/users","type":"built-in","builtInComponent":"users","enabled":true,"order":5,"roles":["admin","developer"]},
  {"id":"map","label":"Mapa","icon":"Map","route":"/map","type":"built-in","builtInComponent":"map","enabled":true,"order":6,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"inventory","label":"Inventario","icon":"Package","route":"/inventory","type":"built-in","builtInComponent":"inventory","enabled":true,"order":7,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"reports","label":"Informes","icon":"BarChart3","route":"/reports","type":"built-in","builtInComponent":"reports","enabled":true,"order":8,"roles":["admin","developer"]},
  {"id":"accounting","label":"Contable","icon":"Wallet","route":"/accounting","type":"built-in","builtInComponent":"accounting","enabled":true,"order":9,"roles":["technician","supervisor","admin","aux_admin","developer"]}
]'::jsonb;
$fn$;

-- Tocar `tabs` dispara normalize_company_config, que anexa los built-ins faltantes (ver 016).
UPDATE public.companies SET tabs = tabs;
