-- Fase 5 — Normalización/validación de `companies.features` y `companies.tabs`.
--
-- La app decide la visibilidad de pestañas en `src/permissions.ts` (única fuente
-- de verdad del lado cliente: TAB_PERMISSION_MAP + TAB_FEATURE_MAP). Este trigger
-- garantiza que la capa de datos SIEMPRE tenga forma válida:
--   - features: los 4 flags como booleans con defaults (accounting=false,
--     maps=true, aiAssistant=false, equipmentManagement=true).
--   - tabs: debe ser un array; cada pestaña con roles acotados al whitelist de
--     roles, type dentro del whitelist, enabled/order tipados.
-- El trigger es idempotente y no rechaza writes: normaliza en vez de fallar.

-- 1) Default de la columna features por si viniera NULL / ausente.
ALTER TABLE public.companies
  ALTER COLUMN features SET DEFAULT '{}'::jsonb;

-- 2) Trigger que normaliza features + tabs en cada INSERT/UPDATE.
CREATE OR REPLACE FUNCTION public.normalize_company_config()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  feature_key text;
  _tab jsonb;
  _tab_roles jsonb;
  _arr jsonb := '[]'::jsonb;
  _idx int := 0;
  allowed_roles CONSTANT text[] := ARRAY['technician','supervisor','admin','aux_admin','developer','super_admin'];
  allowed_types CONSTANT text[] := ARRAY['built-in','iframe','markdown','external'];
BEGIN
  -- ── features: reconstruir con los 4 booleans ──
  IF NEW.features IS NULL OR jsonb_typeof(NEW.features) <> 'object' THEN
    NEW.features := '{}'::jsonb;
  END IF;

  IF NOT NEW.features ? 'accounting' THEN
    NEW.features := jsonb_set(NEW.features, '{accounting}', 'false');
  END IF;
  IF NOT NEW.features ? 'maps' THEN
    NEW.features := jsonb_set(NEW.features, '{maps}', 'true');
  END IF;
  IF NOT NEW.features ? 'aiAssistant' THEN
    NEW.features := jsonb_set(NEW.features, '{aiAssistant}', 'false');
  END IF;
  IF NOT NEW.features ? 'equipmentManagement' THEN
    NEW.features := jsonb_set(NEW.features, '{equipmentManagement}', 'true');
  END IF;

  FOREACH feature_key IN ARRAY ARRAY['accounting','maps','aiAssistant','equipmentManagement'] LOOP
    IF jsonb_typeof(NEW.features -> feature_key) IS DISTINCT FROM 'boolean' THEN
      NEW.features := jsonb_set(NEW.features, ('{' || feature_key || '}')::text[], 'false');
    END IF;
  END LOOP;

  -- ── tabs: debe ser un array de objetos ──
  IF NEW.tabs IS NULL OR jsonb_typeof(NEW.tabs) <> 'array' THEN
    NEW.tabs := '[]'::jsonb;
    RETURN NEW;  -- nothing further to normalize
  END IF;

  _arr := '[]'::jsonb;
  FOR _tab IN SELECT * FROM jsonb_array_elements(NEW.tabs) LOOP
    -- _idx = índice dentro del resultado; se usa como order si falta.
    IF jsonb_typeof(_tab) <> 'object' THEN
      CONTINUE;
    END IF;

    -- roles: array de strings filtrado al whitelist.
    IF (_tab -> 'roles') IS NULL OR jsonb_typeof(_tab -> 'roles') <> 'array' THEN
      _tab_roles := '[]'::jsonb;
    ELSE
      SELECT COALESCE(jsonb_agg(e), '[]'::jsonb) INTO _tab_roles
        FROM jsonb_array_elements_text(_tab -> 'roles') AS e
        WHERE e = ANY(allowed_roles);
    END IF;
    _tab := jsonb_set(_tab, '{roles}', _tab_roles);

    -- type: default 'built-in' si no es uno de los permitidos.
    IF (_tab ->> 'type') IS NULL OR NOT ((_tab ->> 'type') = ANY(allowed_types)) THEN
      _tab := jsonb_set(_tab, '{type}', '"built-in"'::jsonb);
    END IF;

    -- enabled: booleano. Ausente → true; no-booleano → false (dato corrupto).
    IF (_tab -> 'enabled') IS NULL THEN
      _tab := _tab || '{"enabled":true}'::jsonb;
    ELSIF jsonb_typeof(_tab -> 'enabled') IS DISTINCT FROM 'boolean' THEN
      _tab := jsonb_set(_tab, '{enabled}', 'false');
    END IF;

    -- order: número. Ausente → índice de posición.
    IF jsonb_typeof(_tab -> 'order') IS DISTINCT FROM 'number' THEN
      _tab := jsonb_set(_tab, '{order}', to_jsonb(_idx));
    END IF;

    _arr := _arr || jsonb_build_array(_tab);
    _idx := _idx + 1;
  END LOOP;

  NEW.tabs := _arr;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_normalize_company_config ON public.companies;
CREATE TRIGGER trg_normalize_company_config
  BEFORE INSERT OR UPDATE OF features, tabs
  ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_company_config();

-- 3) Backfill: re-normalizar las filas existentes (dispara el trigger).
UPDATE public.companies SET updated_at = updated_at;