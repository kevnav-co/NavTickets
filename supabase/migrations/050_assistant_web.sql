-- =============================================================================
-- 050 — Asistente de ventas y servicio técnico (fase 3): chat web público
-- =============================================================================
-- 1) assistant_verification_codes: códigos de un solo uso con los que el cliente
--    verifica su correo en el chat para que el asistente pueda ver sus datos de
--    cliente registrado. Se guarda solo el hash (SHA-256 con sal), nunca el
--    código. Sin políticas: solo la Edge Function assistant-chat (service role)
--    los lee y escribe.
-- 2) Índices para los límites por IP y por empresa (conversaciones en 24 h).
-- 3) purge_assistant_transcripts() también borra los códigos vencidos hace más
--    de un día, y pg_cron la ejecuta a diario (09:00 UTC, 04:00 en Colombia).
--    En Postgres sin pg_cron (CI) solo se crea la función.
-- Idempotente.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.assistant_verification_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  email            text NOT NULL,
  code_hash        text NOT NULL,
  attempts         integer NOT NULL DEFAULT 0,
  expires_at       timestamptz NOT NULL,
  consumed_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT assistant_codes_email_chk    CHECK (length(email) BETWEEN 3 AND 254),
  CONSTRAINT assistant_codes_hash_chk     CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT assistant_codes_attempts_chk CHECK (attempts >= 0)
);

CREATE INDEX IF NOT EXISTS idx_assistant_codes_conversation
  ON public.assistant_verification_codes (conversation_id, created_at DESC);

ALTER TABLE public.assistant_verification_codes ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito: ni anon ni authenticated pueden leerla ni escribirla.

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_ip
  ON public.assistant_conversations (ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_company_created
  ON public.assistant_conversations (company_id, created_at DESC);

-- Misma lógica que la 042, más la limpieza de códigos vencidos.
CREATE OR REPLACE FUNCTION public.purge_assistant_transcripts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.assistant_conversations c
  WHERE c.last_message_at < now() - make_interval(days => coalesce(
          (SELECT s.retention_days FROM public.assistant_settings s WHERE s.company_id = c.company_id), 180));
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.assistant_verification_codes WHERE expires_at < now() - interval '1 day';

  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.purge_assistant_transcripts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_assistant_transcripts() TO service_role;

DO $do$
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE '050: pg_cron no está instalado; no se programa la purga';
    RETURN;
  END IF;
  EXECUTE $q$SELECT cron.schedule('assistant-purge', '0 9 * * *', 'SELECT public.purge_assistant_transcripts()')$q$;
  RAISE NOTICE '050: purga diaria programada';
END
$do$;
