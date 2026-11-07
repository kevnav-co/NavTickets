-- =============================================================================
-- NavTicket - Migración 038: tareas solo editables por sus participantes
-- =============================================================================
-- Hasta ahora (009) cualquier usuario de la empresa con update_task/delete_task
-- (todos los roles, incluido técnico) podía modificar o borrar CUALQUIER tarea
-- de la empresa, y crear tareas a nombre de otro (created_by arbitrario).
-- Regla nueva:
--   - UPDATE/DELETE: la tarea es "mía" (created_by, assigned_to o participants
--     me incluyen) o soy admin/developer/super_admin de la empresa.
--   - INSERT: created_by debe ser el propio usuario (o vacío), salvo admin/developer/super_admin.
-- La lectura no cambia (misma empresa). Las Edge Functions (service_role) no se ven afectadas.
-- IDEMPOTENTE.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_task_member(t public.tasks)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_id() IS NOT NULL AND (
    t.created_by = public.current_user_id()
    OR t.assigned_to = public.current_user_id()
    OR COALESCE(t.participants, '[]'::jsonb) ? public.current_user_id()::text
  )
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role()::text IN ('admin','developer','super_admin'), false)
$$;

DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
CREATE POLICY "tasks_insert" ON public.tasks
  FOR INSERT WITH CHECK (
    company_id = public.current_company_id()
    AND (created_by IS NULL OR created_by = public.current_user_id() OR public.is_company_admin())
  );

DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
CREATE POLICY "tasks_update" ON public.tasks
  FOR UPDATE USING (
    company_id = public.current_company_id()
    AND public.user_can('update_task')
    AND (public.is_task_member(tasks) OR public.is_company_admin())
  )
  WITH CHECK (
    company_id = public.current_company_id()
    AND (public.is_task_member(tasks) OR public.is_company_admin())
  );

DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE USING (
    company_id = public.current_company_id()
    AND public.user_can('delete_task')
    AND (public.is_task_member(tasks) OR public.is_company_admin())
  );
