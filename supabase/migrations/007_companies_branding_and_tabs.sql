-- =============================================================================
-- NavTicket - Migración 007: Columnas de configuración en `companies`
-- =============================================================================
-- PROPÓSITO:
--   La app lee/escribe en la tabla `companies` las columnas slug, theme,
--   features, auth y tabs (CompanyConfig), pero el esquema solo tenía
--   id / name / created_at. Por eso al guardar una empresa (p. ej. cambiar
--   los colores) el UPDATE fallaba: "column ... does not exist".
--   Esta migración agrega las columnas faltantes (jsonb p/ la config).
--
-- IDEMPOTENTE: usa ADD COLUMN IF NOT EXISTS. Se puede aplicar con
--   `supabase db push` o pegando en el SQL Editor de Supabase.
-- =============================================================================

ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS slug        text,
    ADD COLUMN IF NOT EXISTS updated_at  timestamptz,
    ADD COLUMN IF NOT EXISTS theme       jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS features    jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS auth        jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS tabs        jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Reindex espinal de escritura (super_admin FOR ALL ya existe en 005, no hace
-- falta tocarlo; este comentario es solo contexto).