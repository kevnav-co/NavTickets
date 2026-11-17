-- Fase: corrección de datos — `tasks.participants` / `tasks.files` guardados como JSONB *string*.
--
-- toSnakeCase (caseConverter.ts) stringificaba arrays/objetos antes del insert, así que
-- `participants: [userId]` se guardaba como el JSONB *string* `"[\"uuid\"]"` en vez de un
-- array JSONB real. El filtro de lectura `participants contains <uuid>` (jsonb) no matcheaba
-- contra esa forma → la lista de tareas salía vacía y la tarea recién creada "desaparecía".
--
-- Este backfill convierte los JSONB-string que en realidad contienen un JSON array en
-- arrays JSONB reales, para que `contains`/operadores jsonb funcionen (idempotente: si el
-- valor ya es array u otro tipo, no se toca).
--
-- Aplicar: via Supabase Dashboard (SQL) o `npx supabase db push`.

-- participants: si es un string cuyo texto es un array, convertir a array real.
UPDATE public.tasks
SET participants = (participants #>> '{}')::jsonb
WHERE jsonb_typeof(participants) = 'string'
  AND (participants #>> '{}') ~ '^\s*\[';

-- files: idem (array de URLs).
UPDATE public.tasks
SET files = (files #>> '{}')::jsonb
WHERE jsonb_typeof(files) = 'string'
  AND (files #>> '{}') ~ '^\s*\[';

-- NOTA: orders.evidence/closing_data/warranty_jobs también pudieron quedar como JSONB
-- string por el mismo bug; los READS los normalizan vía snakeToCamel, así que no rompen.
-- El fix de toSnakeCase ya evita el problema en writes nuevos. Si se detectan filtros
-- jsonb rotos en orders/equipment, extender este patrón a esas columnas.