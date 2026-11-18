-- =============================================================================
-- 049 — Retirar tablas ajenas a NavTickets de la base de producción
-- =============================================================================
-- En producción existían expense_vat, invoices, tax_parameters y tax_profiles:
-- vacías, con RLS y sin políticas, columnas en camelCase (userKey, ivaAmount,
-- irpfWithheld, rutLastDigit…) y terminología fiscal de IVA/IRPF/RUT. Ninguna
-- migración ni archivo del repositorio las crea ni las usa, y nada depende de
-- ellas (vistas, funciones, claves foráneas, publicaciones). Parecen de otro
-- proyecto aplicadas aquí por error. Decisión del responsable (18/11/2026):
-- borrarlas.
--
-- Salvaguardas: solo se borra una tabla si existe y sigue vacía (si tiene filas,
-- la migración se detiene sin borrar nada) y sin CASCADE, para que falle si algo
-- llegara a depender de ella. La definición completa (columnas, restricciones e
-- índices) quedó respaldada fuera del repositorio antes de aplicar.
-- En bases donde no existen (repo, CI) no hace nada. Idempotente.
-- =============================================================================

DO $do$
DECLARE
  t text;
  n bigint;
BEGIN
  FOREACH t IN ARRAY ARRAY['expense_vat', 'invoices', 'tax_parameters', 'tax_profiles'] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      IF n > 0 THEN
        RAISE EXCEPTION '049: public.% tiene % filas; no se borra nada', t, n;
      END IF;
      EXECUTE format('DROP TABLE public.%I', t);
      RAISE NOTICE '049: borrada public.%', t;
    END IF;
  END LOOP;
END
$do$;
