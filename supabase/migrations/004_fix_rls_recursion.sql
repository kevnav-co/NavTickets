-- =============================================================================
-- NavTicket - Fix: RECURSIÓN RLS INFINITA en la policy de 'users'
-- =============================================================================
-- PROBLEMA:
--   users_view_same_company usaba:
--     company_id = (SELECT company_id FROM users WHERE supabase_auth_id = auth.uid() LIMIT 1)
--   Una policy de SELECT sobre 'users' que a su vez hace SELECT sobre 'users'
--   dispara recursión infinita (las policies RLS NO son re-entrantes).
--   Resultado: error 42P17 "infinite recursion detected in policy for relation users".
--   Como TODAS las policies de clients/orders/tasks/equipment/... reusan el mismo
--   subquery sobre 'users', NINGUNA consulta del cliente funcionaba → el dashboard
--   se quedaba cargando para siempre.
--
-- SOLUCIÓN:
--   Un helper SECURITY DEFINER que lee 'users' como propietario (bypassa RLS),
--   evitando la recursión. La policy de 'users' pasa a usar este helper.
--
-- EJECUTAR: copiar este archivo en el SQL Editor de Supabase (o `supabase db push`).
-- =============================================================================

-- 1) Helper: company_id del usuario autenticado, sin disparar RLS sobre 'users'
--    SECURITY DEFINER → se ejecuta como el dueño de la tabla (acceso pleno).
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT company_id FROM public.users
    WHERE supabase_auth_id = auth.uid()
    LIMIT 1
$$;

-- 2) Reemplazar la policy recursiva de 'users'
DROP POLICY IF EXISTS "users_view_same_company" ON users;

CREATE POLICY "users_view_same_company" ON users
    FOR SELECT USING (
        company_id = public.current_company_id()
    );

-- (Opcional) Reemplazar los subqueries inline sobre 'users' en el resto de policies
-- por el helper, para eliminar cualquier patrón propenso a recursión.
-- Nota: si la policy de 'users' ya no recusre, estos subqueries funcionan igual;
--       este paso es solo higiene/consistencia.
ALTER POLICY "users_can_view_own_company"  ON companies   USING (id = public.current_company_id());
ALTER POLICY "clients_view_same_company"   ON clients     USING (company_id = public.current_company_id());
ALTER POLICY "equipment_view_same_company" ON equipment   USING (company_id = public.current_company_id());
ALTER POLICY "orders_view_same_company"    ON orders      USING (company_id = public.current_company_id());
ALTER POLICY "tasks_view_same_company"     ON tasks       USING (company_id = public.current_company_id());