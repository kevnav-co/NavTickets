-- =============================================================================
-- NavTicket - Migración 005: Escritura multi-tenant + Seguimientos de órdenes
-- =============================================================================
-- PROPÓSITO:
--   1. Habilita la ESCRITURA multi-tenant por empresa que hoy está bloqueada:
--      solo existían políticas RLS FOR SELECT (default-deny en
--      INSERT/UPDATE/DELETE), pero la app escribe con el cliente anon (JWT).
--      Se añaden políticas FOR ALL con override de super_admin.
--   2. Crea la tabla `seguimientos` (historial cronológico de estados de cada
--      tiquete/orden), aislada por `company_id`, poblada por un trigger.
--   3. Additive: NO toca las políticas SELECT existentes (se suman, OR).
--
-- EJECUTAR: pegar en el SQL Editor de Supabase (sin CI). Idempotente:
--   DROP POLICY/TRIGGER IF EXISTS, CREATE OR REPLACE, CREATE TABLE IF NOT EXISTS.
-- =============================================================================

-- =============================================================================
-- 1) HELPERS SECURITY DEFINER (espejo de current_company_id de 004)
--    Se ejecutan como owner → bypasean RLS → NO recursan contra la policy
--    de 'users' (ninguna policy de 'users' los invoca).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.users
    WHERE supabase_auth_id = auth.uid()
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM public.users
    WHERE supabase_auth_id = auth.uid()
    LIMIT 1
$$;

-- =============================================================================
-- 2) TABLA: seguimientos (historial/actividad de cada tiquete)
--    company_id aísla por empresa; order_id apunta al tiquete.
-- =============================================================================
DO $$ BEGIN
  CREATE TYPE seguimiento_type AS ENUM
    ('creacion','estado','asignacion','cierre','comentario','reabrio_garantia');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS seguimientos (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    order_id         uuid NOT NULL REFERENCES orders(id)    ON DELETE CASCADE,
    user_id          uuid REFERENCES users(id) ON DELETE SET NULL,
    type             seguimiento_type NOT NULL,
    action           text,
    description      text,
    previous_status  text,
    new_status       text,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seguimientos_order   ON seguimientos(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seguimientos_company ON seguimientos(company_id);

ALTER TABLE seguimientos ENABLE ROW LEVEL SECURITY;

-- Realtime para el timeline (idempotente si ya está suscrita)
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.seguimientos';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "seguimientos_select" ON seguimientos;
CREATE POLICY "seguimientos_select" ON seguimientos
    FOR SELECT USING (
        company_id = public.current_company_id()
        OR public.current_user_role() = 'super_admin'
    );

DROP POLICY IF EXISTS "seguimientos_insert" ON seguimientos;
CREATE POLICY "seguimientos_insert" ON seguimientos
    FOR INSERT WITH CHECK (
        company_id = public.current_company_id()
        OR public.current_user_role() = 'super_admin'
    );

-- =============================================================================
-- 3) TRIGGER de auditoría: registro automático de creación y cambios de estado
--    en `orders`. SECURITY DEFINER para insertar en seguimientos como dueño
--    (bypasa RLS del cliente). user_id se resuelve por current_user_id()
--    (NULL cuando la escritura es service-role / scheduler / webhook).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_order_seguimiento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user  uuid := public.current_user_id();
    v_type  seguimiento_type;
    v_action text;
    v_prev  text;
    v_new   text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_type   := 'creacion';
        v_action := 'Orden #' || NEW.order_number || ' creada';
        v_prev   := NULL;
        v_new    := NEW.status::text;
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        v_prev := OLD.status::text;
        v_new  := NEW.status::text;
        IF NEW.status = 'En Progreso' THEN
            v_type   := 'estado';
            v_action := 'Orden iniciada';
        ELSIF NEW.status = 'Cerrado' THEN
            v_type   := 'cierre';
            v_action := 'Orden cerrada';
        ELSE
            v_type   := 'estado';
            v_action := 'Cambio de estado: ' || OLD.status || ' → ' || NEW.status;
        END IF;
    ELSE
        RETURN NULL;
    END IF;

    INSERT INTO seguimientos(company_id, order_id, user_id, type, action, description, previous_status, new_status)
    VALUES (NEW.company_id, NEW.id, v_user, v_type, v_action, NEW.description, v_prev, v_new);

    RETURN NULL; -- AFTER ROW: el valor devuelto es ignorado
END $$;

DROP TRIGGER IF EXISTS trg_seguimiento_orders_insert ON orders;
CREATE TRIGGER trg_seguimiento_orders_insert
    AFTER INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION public.log_order_seguimiento();

DROP TRIGGER IF EXISTS trg_seguimiento_orders_status ON orders;
CREATE TRIGGER trg_seguimiento_orders_status
    AFTER UPDATE OF status ON orders
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.log_order_seguimiento();

-- =============================================================================
-- 4) POLÍTICAS RLS DE ESCRITURA (multi-tenant con override de super_admin)
--    `FOR ALL` es aditivo (OR) con las SELECT existentes. Las tablas sin
--    company_id (équipos de unión) validan el tenant por sus FKs.
-- =============================================================================

-- companies: raíz del tenant, sin company_id → solo super_admin
DROP POLICY IF EXISTS "companies_superadmin_all" ON companies;
CREATE POLICY "companies_superadmin_all" ON companies
    FOR ALL
    USING (public.current_user_role() = 'super_admin')
    WITH CHECK (public.current_user_role() = 'super_admin');

-- users: tenant own o super_admin. Guard anti-escalada: un no-super_admin
-- no puede escribir un registro cuyo role sea 'super_admin'.
DROP POLICY IF EXISTS "users_tenant_all" ON users;
CREATE POLICY "users_tenant_all" ON users
    FOR ALL
    USING (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
    WITH CHECK (
        (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR role IS DISTINCT FROM 'super_admin'::user_role)
    );

-- clients / equipment / orders / tasks: tenant own o super_admin
DROP POLICY IF EXISTS "clients_tenant_all" ON clients;
CREATE POLICY "clients_tenant_all" ON clients
    FOR ALL
    USING (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
    WITH CHECK (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "equipment_tenant_all" ON equipment;
CREATE POLICY "equipment_tenant_all" ON equipment
    FOR ALL
    USING (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
    WITH CHECK (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "orders_tenant_all" ON orders;
CREATE POLICY "orders_tenant_all" ON orders
    FOR ALL
    USING (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
    WITH CHECK (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin');

DROP POLICY IF EXISTS "tasks_tenant_all" ON tasks;
CREATE POLICY "tasks_tenant_all" ON tasks
    FOR ALL
    USING (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
    WITH CHECK (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin');

-- equipment_orders: sin company_id → validar order y equipment del mismo tenant
DROP POLICY IF EXISTS "eqorders_tenant_all" ON equipment_orders;
CREATE POLICY "eqorders_tenant_all" ON equipment_orders
    FOR ALL
    USING (
        public.current_user_role() = 'super_admin'
        OR EXISTS (
            SELECT 1 FROM orders o JOIN equipment e ON e.id = equipment_orders.equipment_id
            WHERE o.id = equipment_orders.order_id
              AND o.company_id = public.current_company_id()
              AND e.company_id = public.current_company_id()
        )
    )
    WITH CHECK (
        public.current_user_role() = 'super_admin'
        OR (
            EXISTS (SELECT 1 FROM orders    WHERE id = equipment_orders.order_id      AND company_id = public.current_company_id())
            AND EXISTS (SELECT 1 FROM equipment WHERE id = equipment_orders.equipment_id AND company_id = public.current_company_id())
        )
    );

-- task_participants: sin company_id → validar task y user del mismo tenant
DROP POLICY IF EXISTS "tp_tenant_all" ON task_participants;
CREATE POLICY "tp_tenant_all" ON task_participants
    FOR ALL
    USING (
        public.current_user_role() = 'super_admin'
        OR EXISTS (SELECT 1 FROM tasks WHERE id = task_participants.task_id AND company_id = public.current_company_id())
    )
    WITH CHECK (
        public.current_user_role() = 'super_admin'
        OR (
            EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_participants.task_id AND t.company_id = public.current_company_id())
            AND EXISTS (SELECT 1 FROM users u WHERE u.id = task_participants.user_id AND u.company_id = public.current_company_id())
        )
    );

-- notifications: propio puede marcar como leída; INSERT own/company o super_admin
DROP POLICY IF EXISTS "notif_read_own" ON notifications;
CREATE POLICY "notif_read_own" ON notifications
    FOR UPDATE
    USING (user_id = public.current_user_id())
    WITH CHECK (user_id = public.current_user_id());

DROP POLICY IF EXISTS "notif_insert_company" ON notifications;
CREATE POLICY "notif_insert_company" ON notifications
    FOR INSERT WITH CHECK (
        company_id = public.current_company_id() OR public.current_user_role() = 'super_admin'
    );

-- =============================================================================
-- 5) GUARD (recomendado): order_number auto-incremental por tenant
--    Evita el race de `max(order_number)+1` del cliente contra
--    uq_orders_number_company ahora que los writes reales funcionan.
--    Solo asigna si viene NULL (no interfiere con el flujo actual del cliente).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.orders_set_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.order_number IS NULL THEN
        SELECT COALESCE(MAX(order_number), 0) + 1 INTO NEW.order_number
        FROM orders WHERE company_id = NEW.company_id;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_set_number ON orders;
CREATE TRIGGER trg_orders_set_number
    BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_set_number();