-- =============================================================================
-- NavTicket - Migración 009: RLS por rol (control de escritura en la DB)
-- =============================================================================
-- PROPÓSITO:
--   Fase 1 del refactor. Hoy las políticas `*_tenant_all` (migración 005) son
--   `FOR ALL` "misma empresa O super_admin": CUALQUIER usuario autenticado de la
--   empresa puede INSERT/UPDATE/DELETE clientes, equipo, órdenes y tareas.
--   Los roles (technician/supervisor/admin/...) solo se aplican en la UI
--   (src/permissions.ts), no en la capa de datos.
--
--   Esta migración:
--     1. Crea `public.user_can(permission text)` — espejo SQL de ROLES_PERMISSIONS
--        de src/permissions.ts, para evaluar permisos SIN romper la reentrada de
--        RLS (SECURITY DEFINER, igual que current_company_id()/current_user_role()).
--     2. Reemplaza cada `*_tenant_all` (FOR ALL) por políticas granulares
--        INSERT / UPDATE / DELETE que exigen el permiso correspondiente.
--     3. Deja INTACTAS las políticas SELECT de 001/004 (lectura por empresa se
--        mantiene igual); el gap de seguridad a cerrar era la ESCRITURA.
--
-- IDEMPOTENTE: DROP POLICY IF EXISTS / CREATE OR REPLACE.
-- REGLA DE COEXISTENCIA: los permisos se resuelven SIEMPRE desde la DB
--   (users.role vía supabase_auth_id), nunca desde claims JWT → el swap de auth
--   de la Fase 2 no deja varados a admin/developer (heredan TODOS los permisos).
-- =============================================================================

-- =============================================================================
-- 1) Helper: ¿puede el usuario autenticado hacer <permission>?
--    Espeja ROLES_PERMISSIONS de src/permissions.ts.
--    admin / developer / super_admin → TRUE (todas).
--    supervisor / aux_admin        → lista de supervisor.
--    technician                    → su propia lista (sin delete de clientes/
--                                     equipo/órdenes; SIN create_order).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.user_can(p text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE u.role
      WHEN 'admin'        THEN true
      WHEN 'developer'    THEN true
      WHEN 'super_admin'  THEN true
      WHEN 'supervisor' THEN p IN (
        'view_dashboard','view_admin_widgets','create_order','assign_order','update_order',
        'delete_order','view_all_orders','start_finish_order','create_client','update_client',
        'create_equipment','update_equipment','upload_initial_evidence','upload_final_evidence',
        'restart_order','reschedule_order','view_team_locations_map',
        'view_own_tasks','create_task','update_task','delete_task'
      )
      WHEN 'aux_admin' THEN p IN (
        'view_dashboard','view_admin_widgets','create_order','assign_order','update_order',
        'delete_order','view_all_orders','start_finish_order','create_client','update_client',
        'create_equipment','update_equipment','upload_initial_evidence','upload_final_evidence',
        'restart_order','reschedule_order','view_team_locations_map',
        'view_own_tasks','create_task','update_task','delete_task'
      )
      WHEN 'technician' THEN p IN (
        'view_dashboard','view_own_orders','start_finish_order','update_order',
        'view_clients','create_client','update_client','view_equipment','create_equipment',
        'update_equipment','upload_initial_evidence','upload_final_evidence',
        'view_own_tasks','create_task','update_task','delete_task'
      )
      ELSE false
    END
    FROM public.users u
    WHERE u.supabase_auth_id = auth.uid()
    LIMIT 1
  ), false)
$$;

-- =============================================================================
-- 2) clients — tecnico puede C/U (desde 001/005) pero NO eliminar.
--    DELETE queda reservado a quien tenga delete_client (admin/developer).
-- =============================================================================
DROP POLICY IF EXISTS "clients_tenant_all" ON clients;
DROP POLICY IF EXISTS "clients_insert"      ON clients;
DROP POLICY IF EXISTS "clients_update"      ON clients;
DROP POLICY IF EXISTS "clients_delete"      ON clients;

CREATE POLICY "clients_insert" ON clients
    FOR INSERT WITH CHECK (
        company_id = public.current_company_id() OR public.current_user_role() = 'super_admin'
    );

CREATE POLICY "clients_update" ON clients
    FOR UPDATE USING (
        (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR public.user_can('update_client'))
    )
    WITH CHECK (
        (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR public.user_can('update_client'))
    );

CREATE POLICY "clients_delete" ON clients
    FOR DELETE USING (
        (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR public.user_can('delete_client'))
    );

-- =============================================================================
-- 3) equipment — idéntico criterio (C/U abierto al tenant, DELETE solo con permiso).
-- =============================================================================
DROP POLICY IF EXISTS "equipment_tenant_all" ON equipment;
DROP POLICY IF EXISTS "equipment_insert"      ON equipment;
DROP POLICY IF EXISTS "equipment_update"      ON equipment;
DROP POLICY IF EXISTS "equipment_delete"      ON equipment;

CREATE POLICY "equipment_insert" ON equipment
    FOR INSERT WITH CHECK (
        company_id = public.current_company_id() OR public.current_user_role() = 'super_admin'
    );

CREATE POLICY "equipment_update" ON equipment
    FOR UPDATE USING (
        (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR public.user_can('update_equipment'))
    )
    WITH CHECK (
        (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR public.user_can('update_equipment'))
    );

CREATE POLICY "equipment_delete" ON equipment
    FOR DELETE USING (
        (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR public.user_can('delete_equipment'))
    );

-- =============================================================================
-- 4) orders — el técnico NO crea órdenes (solo supervisor+/admin) y solo
--    actualiza las que tiene asignadas (technician_id = su id). Lectura igual.
-- =============================================================================
DROP POLICY IF EXISTS "orders_tenant_all" ON orders;
DROP POLICY IF EXISTS "orders_insert"      ON orders;
DROP POLICY IF EXISTS "orders_update"      ON orders;
DROP POLICY IF EXISTS "orders_delete"      ON orders;

CREATE POLICY "orders_insert" ON orders
    FOR INSERT WITH CHECK (
        (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR public.user_can('create_order'))
    );

CREATE POLICY "orders_update" ON orders
    FOR UPDATE USING (
        company_id = public.current_company_id()
        AND (
            public.current_user_role() = 'super_admin'
            OR public.user_can('view_all_orders')
            OR technician_id = public.current_user_id()
        )
    )
    WITH CHECK (
        company_id = public.current_company_id()
        AND (
            public.current_user_role() = 'super_admin'
            OR public.user_can('view_all_orders')
            OR technician_id = public.current_user_id()
        )
    );

CREATE POLICY "orders_delete" ON orders
    FOR DELETE USING (
        (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR public.user_can('delete_order'))
    );

-- =============================================================================
-- 5) tasks — técnico puede gestionar sus tareas; C/U/D abierto al tenant con su
--    permiso (el técnico tiene create/update/delete_task → sin cambio efectivo,
--    pero queda explícito y consistente). DELETE de tareas solo con permiso.
-- =============================================================================
DROP POLICY IF EXISTS "tasks_tenant_all" ON tasks;
DROP POLICY IF EXISTS "tasks_insert"      ON tasks;
DROP POLICY IF EXISTS "tasks_update"      ON tasks;
DROP POLICY IF EXISTS "tasks_delete"      ON tasks;

CREATE POLICY "tasks_insert" ON tasks
    FOR INSERT WITH CHECK (
        company_id = public.current_company_id() OR public.current_user_role() = 'super_admin'
    );

CREATE POLICY "tasks_update" ON tasks
    FOR UPDATE USING (
        (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR public.user_can('update_task'))
    )
    WITH CHECK (
        (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR public.user_can('update_task'))
    );

CREATE POLICY "tasks_delete" ON tasks
    FOR DELETE USING (
        (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR public.user_can('delete_task'))
    );

-- =============================================================================
-- 6) users — gestión solo con permiso (admin/developer/super). El usuario SIEMPRE
--    puede auto-actualizarse (GPS cada 10 min). Guard anti-escalada: ningún
--    no-super escribe una fila con role 'super_admin'.
-- =============================================================================
DROP POLICY IF EXISTS "users_tenant_all" ON users;
DROP POLICY IF EXISTS "users_insert"      ON users;
DROP POLICY IF EXISTS "users_update"      ON users;
DROP POLICY IF EXISTS "users_delete"      ON users;

CREATE POLICY "users_insert" ON users
    FOR INSERT WITH CHECK (
        (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR public.user_can('create_user'))
        AND (public.current_user_role() = 'super_admin' OR role IS DISTINCT FROM 'super_admin'::user_role)
    );

CREATE POLICY "users_update" ON users
    FOR UPDATE USING (
        (id = public.current_user_id() OR company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (id = public.current_user_id() OR public.current_user_role() = 'super_admin' OR public.user_can('update_user'))
    )
    WITH CHECK (
        (id = public.current_user_id() OR company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR role IS DISTINCT FROM 'super_admin'::user_role)
        AND (id = public.current_user_id() OR public.current_user_role() = 'super_admin' OR public.user_can('update_user'))
    );

CREATE POLICY "users_delete" ON users
    FOR DELETE USING (
        (company_id = public.current_company_id() OR public.current_user_role() = 'super_admin')
        AND (public.current_user_role() = 'super_admin' OR public.user_can('delete_user'))
    );

-- =============================================================================
-- 7) equipment_orders (M:N orden↔equipo) y task_participants (M:N tarea↔usuario)
--    Mantienen la validación de tenant por FKs (005) y exigen permiso de
--    escritura sobre la entidad padre (orden/tarea) para modificar el vínculo.
-- =============================================================================
DROP POLICY IF EXISTS "eqorders_tenant_all" ON equipment_orders;
DROP POLICY IF EXISTS "eqorders_insert"      ON equipment_orders;
DROP POLICY IF EXISTS "eqorders_update"      ON equipment_orders;
DROP POLICY IF EXISTS "eqorders_delete"      ON equipment_orders;

CREATE POLICY "eqorders_insert" ON equipment_orders
    FOR INSERT WITH CHECK (
        public.current_user_role() = 'super_admin'
        OR (
            (public.user_can('create_order') OR public.user_can('update_order'))
            AND EXISTS (SELECT 1 FROM orders    WHERE id = equipment_orders.order_id      AND company_id = public.current_company_id())
            AND EXISTS (SELECT 1 FROM equipment WHERE id = equipment_orders.equipment_id AND company_id = public.current_company_id())
        )
    );

CREATE POLICY "eqorders_update" ON equipment_orders
    FOR UPDATE USING (
        public.current_user_role() = 'super_admin'
        OR (
            public.user_can('update_order')
            AND EXISTS (SELECT 1 FROM orders o JOIN equipment e ON e.id = equipment_orders.equipment_id
                        WHERE o.id = equipment_orders.order_id
                          AND o.company_id = public.current_company_id()
                          AND e.company_id = public.current_company_id())
        )
    )
    WITH CHECK ( public.current_user_role() = 'super_admin'
        OR (
            public.user_can('update_order')
            AND EXISTS (SELECT 1 FROM orders    WHERE id = equipment_orders.order_id      AND company_id = public.current_company_id())
            AND EXISTS (SELECT 1 FROM equipment WHERE id = equipment_orders.equipment_id AND company_id = public.current_company_id())
        )
    );

CREATE POLICY "eqorders_delete" ON equipment_orders
    FOR DELETE USING (
        public.current_user_role() = 'super_admin'
        OR (
            public.user_can('update_order')
            AND EXISTS (SELECT 1 FROM orders o JOIN equipment e ON e.id = equipment_orders.equipment_id
                        WHERE o.id = equipment_orders.order_id
                          AND o.company_id = public.current_company_id()
                          AND e.company_id = public.current_company_id())
        )
    );

DROP POLICY IF EXISTS "tp_tenant_all" ON task_participants;
DROP POLICY IF EXISTS "tp_insert"       ON task_participants;
DROP POLICY IF EXISTS "tp_update"       ON task_participants;
DROP POLICY IF EXISTS "tp_delete"       ON task_participants;

CREATE POLICY "tp_insert" ON task_participants
    FOR INSERT WITH CHECK (
        public.current_user_role() = 'super_admin'
        OR (
            public.user_can('create_task') OR public.user_can('update_task')
        ) AND (
            EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_participants.task_id AND t.company_id = public.current_company_id())
            AND EXISTS (SELECT 1 FROM users u WHERE u.id = task_participants.user_id AND u.company_id = public.current_company_id())
        )
    );

CREATE POLICY "tp_update" ON task_participants
    FOR UPDATE USING (
        public.current_user_role() = 'super_admin'
        OR (
            public.user_can('update_task')
            AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_participants.task_id AND t.company_id = public.current_company_id())
        )
    )
    WITH CHECK (
        public.current_user_role() = 'super_admin'
        OR (
            public.user_can('update_task')
            AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_participants.task_id AND t.company_id = public.current_company_id())
            AND EXISTS (SELECT 1 FROM users u WHERE u.id = task_participants.user_id AND u.company_id = public.current_company_id())
        )
    );

CREATE POLICY "tp_delete" ON task_participants
    FOR DELETE USING (
        public.current_user_role() = 'super_admin'
        OR (
            public.user_can('update_task')
            AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_participants.task_id AND t.company_id = public.current_company_id())
        )
    );

-- =============================================================================
-- NOTAS
-- =============================================================================
-- • notifications / seguimientos / support_* : NO se tocan en esta fase.
--   - notifications: marcar-leída es por user_id (ya correcto); el INSERT es
--     mayormente service-role/scheduler (bypasa RLS). No es el gap a cerrar.
--   - seguimientos: insert-only vía trigger SECURITY DEFINER (service-role).
--   - support_tickets/messages: aislados por tenant desde 006; se revisarán en
--     Fase 1.5 si hace falta role-awareness.
-- • SELECT: las políticas de 001/004 (`*_view_same_company`) siguen vigentes →
--   la lectura por empresa no cambia. Esta fase solo ENDURECE la escritura.
-- • `orders_update`: el técnico solo actualiza órdenes cuyo technician_id es el
--   suyo; supervisor/aux/admin/developer/super_admin actualizan cualquiera de la
--   empresa (tienen view_all_orders). Coherente con view_own_orders de la UI.
-- • REVERT (si hace falta): volver a las políticas FOR ALL de la migración 005
--   — basta re-ejecutar el bloque "4) POLÍTICAS RLS DE ESCRITURA" de 005
--   (DROP IF EXISTS y CREATE *_tenant_all).