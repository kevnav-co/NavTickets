-- =============================================================================
-- 018 — Vista previa de empresa como admin (impersonación controlada de tenant)
--
-- Permite que un `super_admin` navegue la app de OTRA empresa "como si fuera un
-- admin de esa empresa": tanto el scope de datos (RLS) como la UI (rol efectivo)
-- se re-escalan al tenant de destino. Nada cambia de identidad: el usuario sigue
-- siendo la misma persona (current_user_id() intacto); solo se sobreescribe
-- `company_id` y `role` efectivos.
--
-- ¿CÓMO FUNCIONA?
--   Los helpers RLS que usan TODAS las policies (current_company_id() y
--   current_user_role()) estaban fijos a la fila del usuario en la tabla
--   `users`. Esta migración hace que lean PRIMERO un override de impersonación
--   dentro de `app_metadata` del JWT de sesión (`imp_company_id` / `imp_role`),
--   y si no está presente, cae al valor real de la fila.
--
--   Como además TODAS las policies de negocio hacen `company_id = current_company_id()
--   OR current_user_role() = 'super_admin'`, al impersonar el rol efectivo deja de
--   ser 'super_admin' → el bypass multi-tenant se apaga y el scope queda limitado a
--   la empresa de destino, con permisos de `admin`. Con una sola palanca se re-escala
--   TODO (RLS + UI), porque el frontend también deriva rol/empresa de currentUser.
--
--   Flujo (frontend):
--     1. supabase.rpc('admin_impersonate_start', { target_company, target_role })
--        → escribe imp_company_id/imp_role en app_metadata del super_admin.
--     2. supabase.auth.refreshSession() → nuevo JWT lleva el override.
--     3. A partir de ahí, las queries se re-escalan al tenant de destino.
--   Para salir:
--     1. supabase.rpc('admin_impersonate_stop') → elimina las claves.
--     2. supabase.auth.refreshSession() → vuelve el rol/empresa reales.
--
-- CONSIDERACIONES DE SEGURIDAD
--   - Solo un `super_admin` (rol real en la fila `users`) puede llamar a start.
--   - Está PROHIBIDO impersonar como 'super_admin' (sin escalada de privilegios).
--   - La empresa de destino debe existir.
--   - stop() simplemente remueve las claves propias; es inofensivo para quien no
--     tiene override (no-op).
--
-- Idempotente: CREATE OR REPLACE.
-- =============================================================================

-- ─── 1) Helpers RLS: leer override de impersonación antes que la fila real ────
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        NULLIF(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata, imp_company_id}', ''),
        (SELECT company_id::text FROM public.users WHERE supabase_auth_id = auth.uid() LIMIT 1)
    )::uuid
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        NULLIF(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata, imp_role}', '')::user_role,
        (SELECT role FROM public.users WHERE supabase_auth_id = auth.uid() LIMIT 1)
    )
$$;

-- NOTA: `current_user_id()` se deja INTACTO (identity real; lee la fila por
-- auth.uid()). Es correcto: la vista previa cambia el scope, no la identidad.

-- ─── 2) Iniciar vista previa (super_admin únicamente) ────────────────────────
CREATE OR REPLACE FUNCTION public.admin_impersonate_start(target_company uuid, target_role user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_real_role user_role;
BEGIN
    -- Rol REAL (filtrar siempre por la fila, no por helpers que podrían estar
    -- ya sobreescritos si estuviera impersonando).
    SELECT role INTO v_real_role FROM public.users WHERE supabase_auth_id = auth.uid() LIMIT 1;

    IF v_real_role IS DISTINCT FROM 'super_admin' THEN
        RAISE EXCEPTION 'Solo super_admin puede iniciar una vista previa';
    END IF;
    IF target_role = 'super_admin' THEN
        RAISE EXCEPTION 'No se puede impersonar a super_admin';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = target_company) THEN
        RAISE EXCEPTION 'La empresa de destino no existe';
    END IF;

    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb)::jsonb || jsonb_build_object(
        'imp_company_id', target_company::text,
        'imp_role', target_role::text
    )
    WHERE id = auth.uid();
END;
$$;

-- ─── 3) Salir de la vista previa (remueve las claves propias) ────────────────
CREATE OR REPLACE FUNCTION public.admin_impersonate_stop()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE auth.users
    SET raw_app_meta_data = (COALESCE(raw_app_meta_data, '{}'::jsonb)::jsonb - 'imp_company_id' - 'imp_role')
    WHERE id = auth.uid();
END;
$$;

-- ─── 4) Habilitar la llamada vía RPC (sesión autenticada) ────────────────────
GRANT EXECUTE ON FUNCTION public.admin_impersonate_start(uuid, user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_impersonate_stop() TO authenticated;