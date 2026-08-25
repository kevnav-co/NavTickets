-- =============================================================================
-- NavTicket - Migración 008: Branding de las empresas ficticias de prueba
-- =============================================================================
-- PROPÓSITO:
--   Da una identidad visual distinta (color + logo + icono/favicon) a las
--   empresas demos, para verificar el theming multi-tenant (título de pestaña,
--   color CSS, logo en header/login, favicon) por empresa.
--   Los assets viven en public/assets/companies/<slug>/ (SVG servidos por la app).
--
-- IDEMPOTENTE: UPDATE por nombre; aplicable con `supabase db push` o SQL Editor.
-- =============================================================================

UPDATE companies SET theme = jsonb_build_object(
    'primaryColor', '#1e3a8a',
    'logoUrl',      '/assets/companies/fabricas-andinas/logo.svg',
    'logoWhiteUrl', '/assets/companies/fabricas-andinas/logo.svg',
    'iconUrl',      '/assets/companies/fabricas-andinas/icon.svg',
    'faviconUrl',   '/assets/companies/fabricas-andinas/icon.svg'
  )
WHERE name = 'Fábricas Andinas S.A.'
  AND (theme IS NULL OR theme = '{}'::jsonb);

UPDATE companies SET theme = jsonb_build_object(
    'primaryColor', '#0e7490',
    'logoUrl',      '/assets/companies/hoteles-caribe/logo.svg',
    'logoWhiteUrl', '/assets/companies/hoteles-caribe/logo.svg',
    'iconUrl',      '/assets/companies/hoteles-caribe/icon.svg',
    'faviconUrl',   '/assets/companies/hoteles-caribe/icon.svg'
  )
WHERE name = 'Hoteles Caribe LTDA'
  AND (theme IS NULL OR theme = '{}'::jsonb);

UPDATE companies SET theme = jsonb_build_object(
    'primaryColor', '#334155',
    'logoUrl',      '/assets/companies/cementos-pacifico/logo.svg',
    'logoWhiteUrl', '/assets/companies/cementos-pacifico/logo.svg',
    'iconUrl',      '/assets/companies/cementos-pacifico/icon.svg',
    'faviconUrl',   '/assets/companies/cementos-pacifico/icon.svg'
  )
WHERE name = 'Cementos Pacífico'
  AND (theme IS NULL OR theme = '{}'::jsonb);

-- REVERT (si hace falta): las tres líneas anteriores solo tocaron empresas cuyo
-- theme estaba vacío, por lo que deshacer = poner theme a '{}':
--   UPDATE companies SET theme = '{}'::jsonb WHERE name IN
--     ('Fábricas Andinas S.A.','Hoteles Caribe LTDA','Cementos Pacífico');