-- =============================================================================
-- 017 — Correcciones detectadas en la auditoría multi-tenant (2026-08-31)
--
--  1) ESCALADA DE PRIVILEGIOS: la política `users_update` (009) permitía que un
--     usuario actualizara SU PROPIA fila y cambiara `role` a 'admin'/'developer'
--     (el único bloqueo era `role IS DISTINCT FROM 'super_admin'`), heredando
--     TODOS los permisos tanto en UI (permissions.ts) como en la DB (user_can()).
--     Las policies RLS no tienen acceso a `OLD`/`NEW`, así que el guard NO puede
--     ir en la policy: se implementa en un TRIGGER BEFORE UPDATE que, cuando el
--     autor de la fila es el propio usuario no-super_admin, prohíbe cambiar su
--     `role` o `company_id`. Los admins/dev siguen gestionando a OTROS usuarios
--     y el super_admin puede cambiar cualquier cosa. (Los escritos con
--     service_role pasan: auth.uid() es NULL → el guard no dispara.)
--
--  2) ENUM DE NOTIFICACIONES: `notification_type` solo admitía 'info'|'alert'|
--     'success', pero task-scheduler inserta 'reminder'/'due_date' y
--     daily-expiration-check 'expiration'. Esos INSERT fallaban con violación
--     de enum (además de omitir company_id/text NOT NULL, corregido en los
--     edge functions). Se extiende el enum con los valores que el código ya usa.
--
--  Idempotente: DROP IF EXISTS + CREATE OR REPLACE / IF NOT EXISTS, para que
--  re-ejecutarla tras el intento fallido converja al estado correcto.
-- =============================================================================

-- ─── 1a) Restaurar la política users_update (009) sin referencia a OLD ───────
DROP POLICY IF EXISTS "users_update" ON users;

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

-- ─── 1b) Guard anti-escalada vía trigger (único lugar con OLD/NEW) ────────────
CREATE OR REPLACE FUNCTION public.prevent_self_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Un usuario no puede auto-cambiarse el rol ni moverse de empresa.
  IF (
    public.current_user_id() = OLD.id
    AND public.current_user_role() IS DISTINCT FROM 'super_admin'
    AND (
      NEW.role IS DISTINCT FROM OLD.role
      OR NEW.company_id IS DISTINCT FROM OLD.company_id
    )
  ) THEN
    RAISE EXCEPTION 'No puedes cambiar tu propio rol o tu empresa';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_no_self_escalation ON users;
CREATE TRIGGER trg_users_no_self_escalation
    BEFORE UPDATE OF role, company_id ON users
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_self_privilege_escalation();

-- ─── 2) Extender el enum de notificaciones con los tipos de los schedulers ───
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'reminder';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'due_date';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'expiration';