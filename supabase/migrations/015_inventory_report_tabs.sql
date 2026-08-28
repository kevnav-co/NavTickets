-- Fase 6 — Merge de tabs built-in nuevos (inventory, reports) en `companies.tabs`.
--
-- El trigger 013 solo VALIDA los tabs existentes; nunca añade built-ins que la
-- app haya introducido después. Las empresas que ya traían su array de `tabs`
-- (sembradas/customizadas antes de Fase 6) quedarían sin "Inventario" ni
-- "Informes" aunque el rol tenga permiso para verlos.
--
-- Aquí:
--   1) Definimos el canon de tabs built-in (espejo de DEFAULT_BUILT_IN_TABS en
--      `src/types/company.ts`: dashboard, tasks, orders, clients, equipment,
--      users, map + los nuevos inventory y reports).
--   2) Extendemos `normalize_company_config` para que en cada INSERT/UPDATE
--      anexe cualquier built-in canónico que falte (idempotente: solo añade si
--      `builtInComponent` no está presente).
--   3) Backfill de las filas existentes (dispara el trigger).
--
-- La visibilidad final la decide el cliente (TAB_PERMISSION_MAP en
-- `src/permissions.ts`); aquí solo garantizamos que la entrada exista en la DB.

-- 1) Canon de tabs built-in, como jsonb.
CREATE OR REPLACE FUNCTION public.default_built_in_tabs()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $fn$
SELECT '[
  {"id":"dashboard","label":"Inicio","icon":"LayoutDashboard","route":"/","type":"built-in","builtInComponent":"dashboard","enabled":true,"order":0,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"tasks","label":"Tareas","icon":"CheckSquare","route":"/tasks","type":"built-in","builtInComponent":"tasks","enabled":true,"order":1,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"orders","label":"Órdenes","icon":"ClipboardList","route":"/orders","type":"built-in","builtInComponent":"orders","enabled":true,"order":2,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"clients","label":"Clientes","icon":"Users","route":"/clients","type":"built-in","builtInComponent":"clients","enabled":true,"order":3,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"equipment","label":"Máquinas","icon":"Settings2","route":"/equipment","type":"built-in","builtInComponent":"equipment","enabled":true,"order":4,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"users","label":"Equipo","icon":"UserCog","route":"/users","type":"built-in","builtInComponent":"users","enabled":true,"order":5,"roles":["admin","developer"]},
  {"id":"map","label":"Mapa","icon":"Map","route":"/map","type":"built-in","builtInComponent":"map","enabled":true,"order":6,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"inventory","label":"Inventario","icon":"Package","route":"/inventory","type":"built-in","builtInComponent":"inventory","enabled":true,"order":7,"roles":["technician","supervisor","admin","aux_admin","developer"]},
  {"id":"reports","label":"Informes","icon":"BarChart3","route":"/reports","type":"built-in","builtInComponent":"reports","enabled":true,"order":8,"roles":["admin","developer"]}
]'::jsonb;
$fn$;

-- 2) Trigger con merge de built-ins faltantes.
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
  existing_components text[] := '{}'::text[];
  _canon jsonb := public.default_built_in_tabs();
  _ct jsonb;
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
  ELSE
    _arr := '[]'::jsonb;
    existing_components := '{}'::text[];
    FOR _tab IN SELECT * FROM jsonb_array_elements(NEW.tabs) LOOP
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
      existing_components := existing_components || (_tab ->> 'builtInComponent');
      _idx := _idx + 1;
    END LOOP;

    -- Fase 6: anexar built-ins canónicos que falten (inventory, reports, o
    -- cualquiera que la app haya ido introduciendo). No duplica: solo si el
    -- `builtInComponent` no está ya en la lista.
    FOR _ct IN SELECT * FROM jsonb_array_elements(_canon) LOOP
      IF NOT ((_ct ->> 'builtInComponent') = ANY(existing_components)) THEN
        _arr := _arr || jsonb_build_array(_ct);
        _idx := _idx + 1;
      END IF;
    END LOOP;
  END IF;

  NEW.tabs := _arr;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_normalize_company_config ON public.companies;
CREATE TRIGGER trg_normalize_company_config
  BEFORE INSERT OR UPDATE OF features, tabs, name, slug
  ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_company_config();

-- 3) Backfill: re-normalizar las filas existentes (dispara el trigger y anexa
--    los built-ins nuevos a empresas que ya tenían tabs).
UPDATE public.companies SET updated_at = updated_at;