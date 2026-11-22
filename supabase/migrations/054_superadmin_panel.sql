-- =============================================================================
-- 054 — Panel del super_admin: suspender empresas, estadísticas reales,
--       registro de auditoría y borrado completo de una empresa
-- =============================================================================
-- 1. `companies.status` ('active' | 'suspended'), `suspended_at` y
--    `suspended_reason`. Con la empresa suspendida, `current_company_id()`
--    devuelve NULL para sus usuarios: toda política RLS por empresa (datos y
--    Storage) deja de darles acceso de una vez. El super_admin real conserva el
--    acceso (puede abrir la vista previa de una empresa suspendida).
--    `my_company_status()` le dice a la app que muestre «Empresa suspendida».
-- 2. Solo el super_admin real (por su fila en `users`, no por el rol de la
--    vista previa) cambia el estado, y lo hace con `admin_set_company_status`,
--    que deja constancia en el registro de auditoría.
-- 3. `admin_audit_log`: altas, suspensiones, reactivaciones, borrados y vistas
--    previas. Solo lectura para el super_admin; se escribe solo desde funciones
--    SECURITY DEFINER o la service role. No tiene FK a `companies` para que el
--    registro de un borrado sobreviva a la empresa.
-- 4. `admin_company_overview()` / `admin_orders_by_month()`: estadísticas por
--    empresa sin abrir la RLS de `orders` al super_admin.
-- 5. Índice único de `slug` (identifica el chat público del asistente).
-- 6. `admin_company_purge_plan()` / `admin_delete_company_rows()`: los usa la
--    Edge Function `delete-company` (service role) para borrar una empresa con
--    sus usuarios de Auth y sus archivos de Storage.
--
-- `current_company_id()`, `companies_restrict_identity_update()` y
-- `admin_impersonate_start()` se redefinen a partir de las versiones de las
-- migraciones 018 y 012, comprobadas iguales a las de producción el 22/11/2026.
-- Idempotente.
-- =============================================================================

-- ─── 1) Estado de la empresa ─────────────────────────────────────────────────
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS suspended_reason text;

DO $$ BEGIN
  ALTER TABLE public.companies ADD CONSTRAINT companies_status_check CHECK (status IN ('active', 'suspended'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.companies ADD CONSTRAINT companies_suspended_reason_len CHECK (char_length(suspended_reason) <= 500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- El slug identifica el chat público del asistente (/#/asistente/<slug>): único.
-- Comprobado el 22/11/2026: no hay slugs repetidos en producción.
CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_unique
  ON public.companies (lower(slug)) WHERE slug IS NOT NULL AND slug <> '';

-- ─── 2) ¿Quien llama es super_admin de verdad? (ignora la vista previa) ──────
CREATE OR REPLACE FUNCTION public.is_real_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE supabase_auth_id = auth.uid() AND role = 'super_admin'
  )
$$;
REVOKE ALL ON FUNCTION public.is_real_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_real_super_admin() TO authenticated, service_role;

-- ─── 3) current_company_id(): NULL si la empresa está suspendida ─────────────
-- Igual que la 018 (vista previa por `imp_company_id`), más el filtro de estado.
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    SELECT COALESCE(
      NULLIF(current_setting('request.jwt.claims', true)::jsonb #>> '{app_metadata, imp_company_id}', ''),
      (SELECT company_id::text FROM public.users WHERE supabase_auth_id = auth.uid() LIMIT 1)
    )::uuid AS id
  )
  SELECT t.id FROM target t
  WHERE NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = t.id AND c.status = 'suspended')
     OR public.is_real_super_admin()
$$;

-- Estado de la empresa REAL de quien llama (no la de la vista previa).
CREATE OR REPLACE FUNCTION public.my_company_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN u.role = 'super_admin' THEN 'active' ELSE c.status END
  FROM public.users u
  JOIN public.companies c ON c.id = u.company_id
  WHERE u.supabase_auth_id = auth.uid()
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.my_company_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_company_status() TO authenticated;

-- ─── 4) El estado solo lo cambia el super_admin real ─────────────────────────
-- Igual que la 012, más las columnas de estado.
CREATE OR REPLACE FUNCTION public.companies_restrict_identity_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (NEW.status IS DISTINCT FROM OLD.status
        OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
        OR NEW.suspended_reason IS DISTINCT FROM OLD.suspended_reason)
       AND auth.uid() IS NOT NULL
       AND NOT public.is_real_super_admin()
    THEN
        RAISE EXCEPTION 'NO_SE_PUEDE_CAMBIAR_ESTADO_DE_EMPRESA'
            USING HINT = 'Solo un super_admin puede suspender o reactivar una empresa';
    END IF;
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

-- ─── 5) Registro de auditoría ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  actor_auth_id uuid,
  actor_name    text,
  action        text NOT NULL CHECK (action IN (
                  'company_created', 'company_suspended', 'company_reactivated',
                  'company_deleted', 'company_delete_cleanup', 'preview_started')),
  company_id    uuid,
  company_name  text,
  details       jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_company_idx ON public.admin_audit_log (company_id, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_log FROM anon, authenticated;
GRANT SELECT ON public.admin_audit_log TO authenticated;

DROP POLICY IF EXISTS admin_audit_log_read ON public.admin_audit_log;
CREATE POLICY admin_audit_log_read ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.is_real_super_admin());

-- Escritura: solo desde aquí (SECURITY DEFINER) o la service role.
CREATE OR REPLACE FUNCTION public.admin_log_action(
  p_actor_auth_id uuid, p_action text, p_company uuid, p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.admin_audit_log (actor_auth_id, actor_name, action, company_id, company_name, details)
  VALUES (
    p_actor_auth_id,
    (SELECT coalesce(nullif(name, ''), username) FROM public.users WHERE supabase_auth_id = p_actor_auth_id LIMIT 1),
    p_action,
    p_company,
    coalesce((SELECT name FROM public.companies WHERE id = p_company), p_details ->> 'company_name'),
    coalesce(p_details, '{}'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.admin_log_action(uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_action(uuid, text, uuid, jsonb) TO service_role;

-- ─── 6) Suspender / reactivar ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_company_status(p_company uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_old    text;
BEGIN
  IF NOT public.is_real_super_admin() THEN
    RAISE EXCEPTION 'Solo super_admin puede cambiar el estado de una empresa' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'Estado no válido: %', p_status USING ERRCODE = '22023';
  END IF;
  IF p_status = 'suspended' AND EXISTS (
       SELECT 1 FROM public.users WHERE company_id = p_company AND role = 'super_admin') THEN
    RAISE EXCEPTION 'No se puede suspender una empresa con un super_admin' USING ERRCODE = '22023';
  END IF;

  SELECT status INTO v_old FROM public.companies WHERE id = p_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La empresa no existe' USING ERRCODE = 'P0002';
  END IF;
  IF v_old = p_status THEN
    RETURN;
  END IF;

  UPDATE public.companies SET
    status           = p_status,
    suspended_at     = CASE WHEN p_status = 'suspended' THEN now() END,
    suspended_reason = CASE WHEN p_status = 'suspended' THEN left(v_reason, 500) END,
    updated_at       = now()
  WHERE id = p_company;

  PERFORM public.admin_log_action(
    auth.uid(),
    CASE WHEN p_status = 'suspended' THEN 'company_suspended' ELSE 'company_reactivated' END,
    p_company,
    CASE WHEN v_reason IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('reason', left(v_reason, 500)) END
  );
END $$;
REVOKE ALL ON FUNCTION public.admin_set_company_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_company_status(uuid, text, text) TO authenticated;

-- ─── 7) Vista previa: igual que la 018, más el registro ──────────────────────
CREATE OR REPLACE FUNCTION public.admin_impersonate_start(target_company uuid, target_role user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_real_role user_role;
BEGIN
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

    PERFORM public.admin_log_action(auth.uid(), 'preview_started', target_company,
                                    jsonb_build_object('role', target_role::text));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_impersonate_start(uuid, user_role) TO authenticated;

-- ─── 8) Estadísticas por empresa ─────────────────────────────────────────────
-- "Este mes" en hora de Colombia, donde operan las empresas.
CREATE OR REPLACE FUNCTION public.admin_company_overview()
RETURNS TABLE (
  company_id        uuid,
  users_count       integer,
  orders_total      integer,
  pending           integer,
  in_progress       integer,
  closed            integer,
  corrective        integer,
  preventive        integer,
  orders_this_month integer,
  closed_this_month integer,
  last_activity_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota';
BEGIN
  IF NOT public.is_real_super_admin() THEN
    RAISE EXCEPTION 'Solo super_admin' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    (SELECT count(*)::int FROM public.users u WHERE u.company_id = c.id),
    count(o.id)::int,
    (count(o.id) FILTER (WHERE o.status::text = 'Pendiente'))::int,
    (count(o.id) FILTER (WHERE o.status::text = 'En Progreso'))::int,
    (count(o.id) FILTER (WHERE o.status::text = 'Cerrado'))::int,
    (count(o.id) FILTER (WHERE o.order_type::text = 'Correctivo'))::int,
    (count(o.id) FILTER (WHERE o.order_type::text = 'Preventivo'))::int,
    (count(o.id) FILTER (WHERE o.created_at >= v_month_start))::int,
    (count(o.id) FILTER (WHERE o.status::text = 'Cerrado' AND coalesce(o.updated_at, o.created_at) >= v_month_start))::int,
    max(coalesce(o.updated_at, o.created_at))
  FROM public.companies c
  LEFT JOIN public.orders o ON o.company_id = c.id
  GROUP BY c.id;
END $$;
REVOKE ALL ON FUNCTION public.admin_company_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_company_overview() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_orders_by_month(p_months integer DEFAULT 6)
RETURNS TABLE (month date, total integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_months integer := least(greatest(coalesce(p_months, 6), 1), 24);
  v_first  date := (date_trunc('month', now() AT TIME ZONE 'America/Bogota') - make_interval(months => v_months - 1))::date;
BEGIN
  IF NOT public.is_real_super_admin() THEN
    RAISE EXCEPTION 'Solo super_admin' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT m.month::date, count(o.id)::int
  FROM generate_series(v_first, v_first + make_interval(months => v_months - 1), interval '1 month') AS m(month)
  LEFT JOIN public.orders o
    ON date_trunc('month', o.created_at AT TIME ZONE 'America/Bogota')::date = m.month::date
  GROUP BY m.month
  ORDER BY m.month;
END $$;
REVOKE ALL ON FUNCTION public.admin_orders_by_month(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_orders_by_month(integer) TO authenticated;

-- ─── 9) Borrado completo (solo service role, desde la Edge Function) ─────────
-- Qué hay que borrar fuera de la base: cuentas de Auth y archivos de Storage
-- (en la carpeta de la empresa o en rutas antiguas de sus órdenes y equipos).
CREATE OR REPLACE FUNCTION public.admin_company_purge_plan(p_company uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'company_name', c.name,
    'has_super_admin', EXISTS (SELECT 1 FROM public.users u WHERE u.company_id = c.id AND u.role = 'super_admin'),
    'auth_ids', coalesce((
      SELECT jsonb_agg(u.supabase_auth_id) FROM public.users u
      WHERE u.company_id = c.id AND u.supabase_auth_id IS NOT NULL), '[]'::jsonb),
    'objects', coalesce((
      SELECT jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name))
      FROM storage.objects o
      WHERE (o.bucket_id = 'company-assets' AND split_part(o.name, '/', 1) = 'companies'
                                            AND split_part(o.name, '/', 2) = c.id::text)
         OR (o.bucket_id IN ('order-photos', 'equipment-photos') AND (
               split_part(o.name, '/', 1) = c.id::text
            OR (split_part(o.name, '/', 1) = 'orders' AND EXISTS (
                  SELECT 1 FROM public.orders od WHERE od.company_id = c.id AND od.id::text = split_part(o.name, '/', 2)))
            OR (split_part(o.name, '/', 1) IN ('equipment', 'equipment_photos') AND EXISTS (
                  SELECT 1 FROM public.equipment e WHERE e.company_id = c.id AND e.id::text = split_part(o.name, '/', 2)))
         ))), '[]'::jsonb)
  )
  FROM public.companies c
  WHERE c.id = p_company
$$;
REVOKE ALL ON FUNCTION public.admin_company_purge_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_company_purge_plan(uuid) TO service_role;

-- Borra las filas. La contabilidad referencia a `users` con RESTRICT, así que va
-- primero; `inventory_items` no tiene FK a `companies`. El resto cae en cascada.
CREATE OR REPLACE FUNCTION public.admin_delete_company_rows(p_company uuid, p_actor uuid, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text;
BEGIN
  SELECT name INTO v_name FROM public.companies WHERE id = p_company FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La empresa no existe' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE company_id = p_company AND role = 'super_admin') THEN
    RAISE EXCEPTION 'No se puede borrar una empresa con un super_admin' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.transactions WHERE company_id = p_company;
  DELETE FROM public.expenses     WHERE company_id = p_company;
  DELETE FROM public.incomes      WHERE company_id = p_company;
  DELETE FROM public.orders       WHERE company_id = p_company;
  DELETE FROM public.inventory_items WHERE company_id = p_company;
  DELETE FROM public.companies    WHERE id = p_company;

  PERFORM public.admin_log_action(p_actor, 'company_deleted', p_company,
    coalesce(p_details, '{}'::jsonb) || jsonb_build_object('company_name', v_name));
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_company_rows(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_company_rows(uuid, uuid, jsonb) TO service_role;

-- El DELETE directo desde el cliente deja cuentas de Auth y archivos huérfanos:
-- se quita del alcance de la política, que sigue cubriendo SELECT/INSERT/UPDATE.
DROP POLICY IF EXISTS "companies_superadmin_all" ON public.companies;
DROP POLICY IF EXISTS companies_superadmin_select ON public.companies;
DROP POLICY IF EXISTS companies_superadmin_insert ON public.companies;
DROP POLICY IF EXISTS companies_superadmin_update ON public.companies;
CREATE POLICY companies_superadmin_select ON public.companies
  FOR SELECT USING (public.current_user_role() = 'super_admin');
CREATE POLICY companies_superadmin_insert ON public.companies
  FOR INSERT WITH CHECK (public.current_user_role() = 'super_admin');
CREATE POLICY companies_superadmin_update ON public.companies
  FOR UPDATE USING (public.current_user_role() = 'super_admin')
  WITH CHECK (public.current_user_role() = 'super_admin');
