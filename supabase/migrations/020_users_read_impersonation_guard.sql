-- =============================================================================
-- 020 — Blindaje anti-bloqueo de impersonación:
--       el super_admin (y cualquier usuario) SIEMPRE puede leer su propia fila
--       en `users`, aunque un override de vista previa quede estancado.
--
-- PROBLEMA QUE RESUELVE (detectado en producción 2026-09-01):
--   `admin_impersonate_start` (018) escribe imp_company_id/imp_role en
--   `auth.users.raw_app_meta_data`. Como el override persiste entre sesiones,
--   si la vista previa no se cierra, CADA login nuevo re-hereda el override y
--   `current_company_id()`/`current_user_role()` se re-escalan a esa empresa.
--
--   La única política SELECT de `users` (users_view_same_company, 004) filtra
--   `company_id = current_company_id()`. Con el override activo:
--     • el super admin es re-escaleado como 'admin' de otra empresa, así que
--       su propia fila (empresa real …0001) ya no cuadra → el perfil NO carga
--       → el login queda en blanco ("se queda cargando").
--     • Además la migración 009 DROPpó `users_tenant_all` y NO recreó un SELECT
--       con bypass super_admin → ni siquiera sin override puede leer a los
--       usuarios de otras empresas.
--
-- FIX:
--   1. `users` FOR SELECT: el usuario autenticado SIEMPRE puede leer su propia
--      fila por `supabase_auth_id = auth.uid()` (independiente del override),
--      Igual que antes puede leer las de su empresa, y se RESTAURA el acceso
--      de solo lectura del `super_admin` a todos los tenants (gap de 009).
--
-- Idempotente: DROP IF EXISTS + CREATE. Sin cambios en helpers (aunque un
-- override esté activo, la propia fila se lee y la UI muestra el banner de
-- salida de la vista previa → stop() la limpia → self-heal sin SQL manual).
-- =============================================================================

-- users: leer la fila propia SIEMPRE + la del propio tenant + todos los tenants
--        si el rol efectivo es super_admin.
DROP POLICY IF EXISTS "users_view_same_company" ON users;
DROP POLICY IF EXISTS "users_read" ON users;
CREATE POLICY "users_read" ON users
    FOR SELECT USING (
        supabase_auth_id = auth.uid()
        OR company_id = public.current_company_id()
        OR public.current_user_role() = 'super_admin'
    );