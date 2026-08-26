-- =============================================================================
-- NavTicket - Migración 012: Self-serve de branding por empresa (Fase 4)
-- =============================================================================
-- PROPÓSITO:
--   Permitir que el `admin`/`developer` del tenant edite SOLO su propia empresa
--   (filas `theme`, `features`, `tabs` para marcar el branding de su tenant), sin
--   tocar nunca las columnas de identidad (`name`, `slug`, `auth`) ni crear/borrar
--   empresas ni ver las demás. Super_admin conserva acceso total.
--
--   RLS es al nivel de FILA; la restricción de COLUMNAS se implementa con un
--   trigger BEFORE UPDATE que rechaza cualquier cambio a name/slug/auth hecho por
--   un no-super_admin (name/slug pueden cambiar solo por bootstrap/service-role
--   o por super_admin autenticado).
--
-- IDEMPOTENTE: DROP POLICY/TRIGGER IF EXISTS, CREATE OR REPLACE.
-- REGLA DE COEXISTENCIA: los permisos se resuelven desde la DB (users.role
--   vía current_user_role(), SECURITY DEFINER). Admin/developer heredan el acceso
--   self-serve; el helper espeja src/permissions.ts (MANAGE_COMPANIES).
-- =============================================================================

-- =============================================================================
-- 1) companies — super_admin mantiene acceso total (era companies_superadmin_all,
--    005). Se re-crea por idempotencia y por claridad.
-- =============================================================================
DROP POLICY IF EXISTS "companies_superadmin_all" ON companies;
CREATE POLICY "companies_superadmin_all" ON companies
    FOR ALL
    USING (public.current_user_role() = 'super_admin')
    WITH CHECK (public.current_user_role() = 'super_admin');

-- =============================================================================
-- 2) companies — el admin/developer puede actualizar SOLO su propia fila.
--    UPDDad refinada: id = su company_id y rol admin/developer. Ni INSERT (crear
--    empresas) ni DELETE (borrar): siguen siendo exclusivos de super_admin.
-- =============================================================================
DROP POLICY IF EXISTS "companies_self_update_own" ON companies;
CREATE POLICY "companies_self_update_own" ON companies
    FOR UPDATE
    USING (
        id = public.current_company_id()
        AND public.current_user_role() IN ('admin', 'developer')
    )
    WITH CHECK (
        id = public.current_company_id()
        AND public.current_user_role() IN ('admin', 'developer')
    );

-- =============================================================================
-- 3) Trigger de restricción de columnas: un no-super_admin no puede cambiar
--    name / slug / auth de su empresa (solo theme / features / tabs / actualizado).
--    SECURITY DEFINER y BEFORE UPDATE → rechaza el UPDATE completo (RAISE EXCEPTION).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.companies_restrict_identity_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Super_admin (autenticado o service-role) puede cambiarlo todo.
    IF public.current_user_role() = 'super_admin' THEN
        RETURN NEW;
    END IF;
    -- admin/developer: solo config de branding (theme/features/tabs) y updated_at.
    IF NEW.name IS DISTINCT FROM OLD.name
       OR NEW.slug IS DISTINCT FROM OLD.slug
       OR NEW.auth IS DISTINCT FROM OLD.auth
    THEN
        RAISE EXCEPTION 'NO_SE_PUEDE_CAMBIAR_IDENTIDAD_DE_EMPRESA'
            USING HINT = 'Solo un super_admin puede modificar name/slug/auth de una empresa';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_companies_restrict_identity ON companies;
CREATE TRIGGER trg_companies_restrict_identity
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION public.companies_restrict_identity_update();