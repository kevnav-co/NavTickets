-- Backfill de la migración 015: re-normalizar `companies.tabs` para anexar los
-- built-ins nuevos (inventory, reports).
--
-- En 015 el UPDATE de backfill usó `SET updated_at = updated_at`, pero ese
-- trigger está definido como `BEFORE INSERT OR UPDATE OF features, tabs, name,
-- slug` — actualizar `updated_at` NO dispara el trigger, así que las filas
-- existentes quedaron sin los tabs nuevos. Este UPDATE toca `tabs` (columna del
-- trigger), por lo que `normalize_company_config` se ejecuta y anexa los
-- built-ins canónicos faltantes. Idempotente: no duplica built-ins ya presentes.

UPDATE public.companies SET tabs = tabs;