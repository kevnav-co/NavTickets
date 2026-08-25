-- =============================================================================
-- NavTicket - Migración 010: eliminar password en texto plano + auth real
-- =============================================================================
-- PROPÓSITO (Fase 2 del refactor):
--   El login ya va por Supabase Auth real (AuthProvider → signInWithPassword
--   con email `username@<dominio>`), pero la tabla `users` aún guardaba
--   `password` como TEXTO EN PLANO (legado 001). Nadie la escribe ni la lee
--   (authService.ts, único lector, se elimina en esta fase). Esta migración:
--
--     1. ADD `must_reset_password`  → flujo de reseteo forzado (primer login
--        tras un reset de admin, o al desacoplar una cuenta sin password Auth).
--     2. ADD `onesignal_player_id`  → desacopla el push del legado `fcm_token`
--        (backfill one-shot desde fcm_token; el nuevo camino es player_id).
--     3. DROP `password`            → borra la columna plantext de una vez.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS / DROP COLUMN IF EXISTS.
--
-- BACK-OUT:
--   - Re-crear la columna password si hiciera falta (no recomendado):
--       ALTER TABLE users ADD COLUMN password TEXT;
--   - Este cambio NO toca políticas RLS (009) ni el mapeo de login; solo
--     elimina el almacén de credenciales legado.
-- =============================================================================

-- 1) Reseteo forzado de contraseña (flag por usuario).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT false;

-- 2) Player id de OneSignal (nuevo hogar del push; desacopla de fcm_token).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS onesignal_player_id TEXT;

-- Backfill one-shot desde el legado fcm_token (solo si no hay player_id aún).
UPDATE users
   SET onesignal_player_id = fcm_token
 WHERE onesignal_player_id IS NULL AND fcm_token IS NOT NULL;

-- 3) ELIMINA la contraseña en texto plano. La autenticación vive 100% en
--    auth.users (Supabase Auth); `users` solo guarda el vínculo supabase_auth_id.
ALTER TABLE users
    DROP COLUMN IF EXISTS password;