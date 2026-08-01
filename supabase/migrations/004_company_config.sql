-- =============================================================================
-- NavTicket - Migración 004: Añadir columnas de configuración a companies
-- =============================================================================
-- La tabla companies solo tenía id, name, created_at.
-- Necesitamos añadir las columnas que CompanyConfig espera (theme, features,
-- auth, tabs, slug) que antes vivían en Firestore como campos del documento.
-- =============================================================================

-- Añadir columnas faltantes (NULL inicialmente, luego se migran datos)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS slug         TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS theme        JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS features     JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS auth         JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tabs         JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT now();

-- Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_companies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION update_companies_updated_at();

-- Asignar slug por defecto basado en el nombre si está vacío
UPDATE companies SET slug = lower(regexp_replace(coalesce(slug, name), '[^a-zA-Z0-9]+', '-', 'g')) WHERE slug IS NULL;