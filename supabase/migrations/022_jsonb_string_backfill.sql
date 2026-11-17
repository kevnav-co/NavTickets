-- Backfill data: columnas JSONB que quedaron guardadas como JSONB *string* por el bug
-- histórico de toSnakeCase (caseConverter.ts stringificaba arrays/objetos antes del insert).
--
-- Afecta a columnas de ORDERS y TASKS (initial_photos/initial_evidence/final_evidence/
-- current_warranty_evidence/procedures/warranty_jobs/closing_data y tasks.files/participants).
-- Hasta que se arregló, `participants: [id]` se guardaba como el string `"[\"uuid\"]"` y los
-- operadores/filtros jsonb (contains, @>) fallaban.
--
-- Genérico e IDEMPOTENTE: barre TODAS las columnas jsonb del schema public y, solo cuando el
-- valor es un string cuyo texto parsea como array [ ] u objeto { } (el artifact exacto de
-- JSON.stringify), lo desenvuelve con (col #>> '{}')::jsonb. Cualquier string que no empiece
-- por [ o { (valor legítimo) NO se toca. Los objetos/arrays reales tampoco (jsonb_typeof <> 'string').
--
-- Aplicar en Supabase Dashboard → SQL editor, o vía `npx supabase db push`.

DO $$
DECLARE
  r record;
  cnt int;
BEGIN
  FOR r IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'jsonb'
    ORDER BY table_name, ordinal_position
  LOOP
    BEGIN
      EXECUTE format(
        'UPDATE %I.%I SET %I = (%I #>> %L)::jsonb
           WHERE jsonb_typeof(%I) = %L
             AND (%I #>> %L) ~ %L',
        r.table_schema, r.table_name, r.column_name,
        r.column_name, '{}', r.column_name, 'string',
        r.column_name, '{}', '^\s*[\[{]'
      );
      GET DIAGNOSTICS cnt = ROW_COUNT;
      IF cnt > 0 THEN
        RAISE NOTICE 'backfilled %.%: % filas', r.table_name, r.column_name, cnt;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE WARNING 'skip %.%: %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;
END $$;