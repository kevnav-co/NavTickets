-- =============================================================================
-- NavTicket - Migración 037: endurecimiento de seguridad
-- =============================================================================
-- 1) users: la 017 (trg_users_no_self_escalation) impide que un usuario cambie
--    SU PROPIO role o company_id, pero un admin todavía podía mover usuarios a
--    otra empresa, reasignar `supabase_auth_id` (tomar la cuenta de otro),
--    limpiar `must_reset_password` o nombrar developer/super_admin. Este trigger
--    adicional (no reemplaza al de la 017) protege las columnas de privilegio:
--      - company_id, supabase_auth_id : solo super_admin.
--      - role : quien tenga update_user_role, nunca sobre sí mismo; asignar o
--               quitar developer/super_admin solo super_admin (espejo de la
--               Edge Function create-user).
--      - must_reset_password : solo backend (service_role, p. ej. la Edge
--               Function update-user-password).
--    Las llamadas sin sesión de usuario (service_role, migraciones) no se tocan.
-- 2) companies.tabs: las pestañas iframe/external solo aceptan URLs https://
--    (una URL javascript: se ejecutaba con el origen de la app).
-- IDEMPOTENTE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_user_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  caller_role := public.current_user_role()::text;
  IF caller_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'No autorizado a cambiar la empresa de un usuario' USING ERRCODE = '42501';
  END IF;
  IF NEW.supabase_auth_id IS DISTINCT FROM OLD.supabase_auth_id THEN
    RAISE EXCEPTION 'No autorizado a cambiar la identidad de un usuario' USING ERRCODE = '42501';
  END IF;
  IF NEW.must_reset_password IS DISTINCT FROM OLD.must_reset_password THEN
    RAISE EXCEPTION 'must_reset_password solo se modifica desde el backend' USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF OLD.id = public.current_user_id() THEN
      RAISE EXCEPTION 'Un usuario no puede cambiar su propio rol' USING ERRCODE = '42501';
    END IF;
    IF NOT public.user_can('update_user_role') THEN
      RAISE EXCEPTION 'No autorizado a cambiar roles' USING ERRCODE = '42501';
    END IF;
    IF OLD.role::text IN ('developer','super_admin') OR NEW.role::text IN ('developer','super_admin') THEN
      RAISE EXCEPTION 'Solo super_admin asigna o retira los roles developer/super_admin' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_user_privileged_columns ON public.users;
CREATE TRIGGER trg_guard_user_privileged_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_privileged_columns();

-- -----------------------------------------------------------------------------
-- 2) URLs de pestañas iframe / external
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_company_tab_urls()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tab jsonb;
BEGIN
  IF NEW.tabs IS NULL OR jsonb_typeof(NEW.tabs) <> 'array' THEN
    RETURN NEW;
  END IF;
  FOR tab IN SELECT * FROM jsonb_array_elements(NEW.tabs) LOOP
    IF tab->>'type' IN ('iframe','external')
       AND COALESCE(tab->>'content', '') !~* '^https://[^\s/]+' THEN
      RAISE EXCEPTION 'La pestaña "%" debe usar una URL https:// válida', COALESCE(tab->>'label', tab->>'id')
        USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_company_tab_urls ON public.companies;
CREATE TRIGGER trg_validate_company_tab_urls
  BEFORE INSERT OR UPDATE OF tabs ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.validate_company_tab_urls();
