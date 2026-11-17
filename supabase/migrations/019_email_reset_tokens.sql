-- =============================================================================
-- NavTicket - Migración 019: email de recuperación + tokens de reset de clave
-- =============================================================================
-- PROPÓSITO (plan aprobado: login por usuario + recuperación por correo):
--   1. Añade `users.email` — correo REAL de recuperación del usuario. NO es el
--      email sintético de auth (`usuario@navas.com`); es el buzón al que se manda
--      el link de reset cuando el usuario olvida su clave.
--   2. El username de login pasa a ser único GLOBAL (opción A aprobada). La
--      unicidad ya la impone Supabase Auth (el email de sesión es
--      `username@EMAIL_DOMAIN`); este índice deja la tabla de negocio coherente
--      para que el reset por username no sea ambiguo entre empresas.
--   3. Tabla `password_reset_tokens` — tokens de un solo uso para el flujo
--      "olvidé mi contraseña". SIN políticas RLS: solo la escriben/leen los
--      edges con service_role (bypasan RLS). Ningún cliente la consulta.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS / DROP + CREATE / CREATE TABLE IF NOT EXISTS.
-- =============================================================================

-- =============================================================================
-- 1) users.email — correo de recuperación del usuario (nullable hasta que el
--    usuario/admin lo cargue). La RLS de lectura/escritura YA cubre esta columna:
--    la select de 001/004 deja leer a los de la misma empresa, y users_update
--    (009) permite el auto-update (id = current_user_id()) y el de admin/developer
--    de la empresa (company_id = current_company_id() AND user_can('update_user')).
-- =============================================================================
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS email TEXT;

-- Inferior única: dos usuarios no pueden compartir correo de recuperación.
-- Solo afecta a filas CON email (no bloquea a las que aún no lo tienen).
DROP INDEX IF EXISTS uq_users_email_lower;
CREATE UNIQUE INDEX uq_users_email_lower
    ON public.users (lower(email))
    WHERE email IS NOT NULL AND btrim(email) <> '';

-- =============================================================================
-- 2) Username globalmente único (opción A). Auth ya lo fuerza vía el email de
--    sesión; aquí la tabla de negocio exige lo mismo para el reset por username.
--    Si el push falla por duplicados pre-existentes, hay que normalizarlos antes
--    (los demos seed usan usernames distintos por empresa).
-- =============================================================================
DROP INDEX IF EXISTS uq_users_username_global;
CREATE UNIQUE INDEX uq_users_username_global
    ON public.users (lower(username));

-- =============================================================================
-- 3) password_reset_tokens — token de un solo uso para restaurar la clave.
--    user_id → fila `users` destino; token_hash guarda el SHA-256 del token
--    (nunca el token en claro); used=true lo invalida tras un solo uso.
--    Sin RLS: producción lo maneja 100% con service_role desde los edges.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash  text NOT NULL,
    used        boolean NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL
);

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_prt_user ON public.password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_prt_token ON public.password_reset_tokens(token_hash);

-- Revoca cualquier acceso directo por el Data API (anon/authenticated): solo
-- service_role podrá tocar esta tabla (los edges lo usan). Esto es el default
-- deny sobre una tabla sin políticas — lo dejamos explícito.
REVOKE ALL ON public.password_reset_tokens FROM anon, authenticated;
GRANT ALL ON public.password_reset_tokens TO service_role;