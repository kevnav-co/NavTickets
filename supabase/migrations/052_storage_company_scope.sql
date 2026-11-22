-- =============================================================================
-- 052 — Storage: fotos acotadas a la empresa y sin listado público
-- =============================================================================
-- Problema (comprobado en producción el 22/11/2026): `order-photos` y
-- `equipment-photos` tenían una política SELECT para el rol `public`, así que
-- cualquiera con la clave anónima de la app podía LISTAR y descargar las fotos
-- de todas las empresas. Las de subida solo comprobaban el dueño, no la empresa,
-- y nada impedía subir a la carpeta de otra empresa ni borrar en ella siendo admin.
--
-- Esta migración:
--   1. Crea o ajusta los tres buckets (el repositorio no tenía su migración: la
--      034 solo existió en un equipo local). Fotos: públicas por enlace, hasta
--      10 MB, solo JPEG/PNG/WebP/GIF (sin SVG). Logos (`company-assets`): públicos
--      por enlace (la marca se ve antes de iniciar sesión), hasta 5 MB, sin PDF ni SVG.
--   2. Quita las políticas de lectura pública: un bucket público sirve sus
--      archivos por /object/public/… sin pasar por RLS, pero ya nadie puede
--      listar ni leer por la API objetos de otra empresa.
--   3. Lectura, subida, reemplazo y borrado solo dentro de la carpeta de la
--      propia empresa (`{company_id}/…`, o `companies/{company_id}/…` para logos).
--      Rutas antiguas sin empresa (`orders/{id}/…`, `equipment/{id}/…`,
--      `equipment_photos/{id}/…`): se aceptan si la orden o el equipo es de la
--      empresa de quien llama, para no romper fotos ni subidas pendientes.
--   4. Borrar: el dueño del archivo o un admin/developer/super_admin, siempre
--      dentro de su empresa.
-- La URL pública de un archivo sigue funcionando (paso 1 de 2). El paso 2 es
-- pasar a URLs firmadas. Idempotente.
-- =============================================================================

-- ─── 1) Buckets ──────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('order-photos',     'order-photos',     true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('equipment-photos', 'equipment-photos', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('company-assets',   'company-assets',   true,  5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 2) ¿El objeto está en la carpeta de la empresa de quien llama? ───────────
CREATE OR REPLACE FUNCTION public.storage_object_in_my_company(p_bucket text, p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company uuid := public.current_company_id();
  v_top     text := split_part(coalesce(p_name, ''), '/', 1);
  v_second  text := split_part(coalesce(p_name, ''), '/', 2);
BEGIN
  IF v_company IS NULL OR p_name IS NULL OR p_name ~ '(^|/)\.\.?(/|$)' THEN
    RETURN false;
  END IF;

  IF p_bucket = 'company-assets' THEN
    RETURN v_top = 'companies' AND v_second = v_company::text;
  END IF;

  IF p_bucket NOT IN ('order-photos', 'equipment-photos') THEN
    RETURN false;
  END IF;

  -- Ruta nueva: {company_id}/…
  IF v_top = v_company::text THEN
    RETURN true;
  END IF;

  -- Rutas antiguas sin empresa: valen si la orden o el equipo es de la empresa.
  IF v_second !~ '^[0-9a-fA-F-]{36}$' THEN
    RETURN false;
  END IF;
  IF v_top = 'orders' THEN
    RETURN EXISTS (SELECT 1 FROM public.orders o WHERE o.id::text = v_second AND o.company_id = v_company);
  END IF;
  IF v_top IN ('equipment', 'equipment_photos') THEN
    RETURN EXISTS (SELECT 1 FROM public.equipment e WHERE e.id::text = v_second AND e.company_id = v_company);
  END IF;
  RETURN false;
END $$;

REVOKE ALL ON FUNCTION public.storage_object_in_my_company(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_object_in_my_company(text, text) TO authenticated, service_role;

-- ─── 3) Políticas de storage.objects ─────────────────────────────────────────
-- Las antiguas (creadas por la 034 local, sin versionar).
DROP POLICY IF EXISTS "Public read order photos"              ON storage.objects;
DROP POLICY IF EXISTS "Public read equipment photos"          ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload order photos"     ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload equipment photos" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload company assets"           ON storage.objects;
DROP POLICY IF EXISTS "Owner or admin delete order photos"    ON storage.objects;

DROP POLICY IF EXISTS nt_storage_select ON storage.objects;
CREATE POLICY nt_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('order-photos', 'equipment-photos', 'company-assets')
    AND public.storage_object_in_my_company(bucket_id, name)
  );

DROP POLICY IF EXISTS nt_storage_insert_photos ON storage.objects;
CREATE POLICY nt_storage_insert_photos ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('order-photos', 'equipment-photos')
    AND owner_id = auth.uid()::text
    AND public.storage_object_in_my_company(bucket_id, name)
  );

DROP POLICY IF EXISTS nt_storage_insert_assets ON storage.objects;
CREATE POLICY nt_storage_insert_assets ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-assets'
    AND owner_id = auth.uid()::text
    AND public.current_user_role() IN ('admin', 'developer', 'super_admin')
    AND public.storage_object_in_my_company(bucket_id, name)
  );

-- Reemplazo (upsert): mismo alcance que la subida.
DROP POLICY IF EXISTS nt_storage_update ON storage.objects;
CREATE POLICY nt_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('order-photos', 'equipment-photos', 'company-assets')
    AND public.storage_object_in_my_company(bucket_id, name)
    AND (bucket_id <> 'company-assets' OR public.current_user_role() IN ('admin', 'developer', 'super_admin'))
  )
  WITH CHECK (
    bucket_id IN ('order-photos', 'equipment-photos', 'company-assets')
    AND public.storage_object_in_my_company(bucket_id, name)
    AND (bucket_id <> 'company-assets' OR public.current_user_role() IN ('admin', 'developer', 'super_admin'))
  );

DROP POLICY IF EXISTS nt_storage_delete ON storage.objects;
CREATE POLICY nt_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('order-photos', 'equipment-photos', 'company-assets')
    AND public.storage_object_in_my_company(bucket_id, name)
    AND (owner_id = auth.uid()::text OR public.current_user_role() IN ('admin', 'developer', 'super_admin'))
  );
