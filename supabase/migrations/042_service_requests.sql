-- =============================================================================
-- 042 — Asistente de ventas y servicio técnico (fase 1): datos y reglas
-- =============================================================================
-- Crea las tablas de las solicitudes de servicio que deja el asistente y la
-- configuración del asistente por empresa:
--
--   service_requests          La solicitud: datos del cliente, servicio pedido y
--                             hueco propuesto. Nunca es una orden: la orden nace
--                             solo cuando una persona la confirma con
--                             confirm_service_request() (migración 043).
--   assistant_conversations   Una conversación del asistente (por canal).
--   assistant_messages        Transcripción, para el contexto del administrador
--                             y para auditoría. Retención limitada.
--   assistant_settings        Horario laboral, servicios y duraciones, días
--                             bloqueados, antelación mínima, técnicos que
--                             atienden solicitudes y retención.
--
-- Reglas de acceso:
--   - Gestores de solicitudes = admin, supervisor, aux_admin, developer y
--     super_admin (este último en vista previa de la empresa). Es el espejo de
--     PERMISSIONS.MANAGE_SERVICE_REQUESTS en src/permissions.ts.
--   - Desde el navegador los gestores leen; crean solo solicitudes manuales
--     (llamada telefónica) en estado 'pendiente'. No hay UPDATE ni DELETE por la
--     API: confirmar y rechazar van por funciones (043).
--   - El asistente (Edge Function con service role) escribe borradores y los
--     pasa a 'pendiente'. El trigger guard impide que nadie, ni la service role,
--     marque una solicitud como confirmada o rechazada fuera de esas funciones.
--   - Las conversaciones y mensajes solo los escribe la service role.
--
-- Idempotente: IF NOT EXISTS, DROP ... IF EXISTS y CREATE OR REPLACE. No
-- redefine ninguna función existente.
-- =============================================================================

-- ─── 1) Tipos ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.service_request_status AS ENUM
    ('borrador', 'pendiente', 'confirmada', 'rechazada', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 2) Helper: ¿quien llama gestiona las solicitudes de esa empresa? ─────────
-- Usa current_company_id()/current_user_role(), que ya respetan la vista previa
-- del super_admin (migración 018). La service role no cuenta como gestor: sus
-- permisos se comprueban aparte donde aplique.
CREATE OR REPLACE FUNCTION public.can_manage_service_requests(p_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_company IS NOT NULL
     AND p_company = public.current_company_id()
     AND public.current_user_role() IN ('admin', 'supervisor', 'aux_admin', 'developer', 'super_admin')
$$;

-- Configuración del asistente: solo admin y developer de la empresa (como la
-- configuración de la empresa en la migración 012), o super_admin en vista previa.
CREATE OR REPLACE FUNCTION public.can_configure_assistant(p_company uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_company IS NOT NULL
     AND p_company = public.current_company_id()
     AND public.current_user_role() IN ('admin', 'developer', 'super_admin')
$$;

REVOKE ALL ON FUNCTION public.can_manage_service_requests(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_configure_assistant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_service_requests(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_configure_assistant(uuid) TO authenticated, service_role;

-- ─── 3) Validadores de la configuración ──────────────────────────────────────
-- Horario: objeto con claves ISO de día ("1" lunes … "7" domingo); cada día es
-- un array de franjas ["HH:MM","HH:MM"] con inicio < fin. Un día ausente o con
-- array vacío no se atiende.
CREATE OR REPLACE FUNCTION public.assistant_working_hours_valid(p jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k text;
  ranges jsonb;
  r jsonb;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN RETURN false; END IF;
  FOR k, ranges IN SELECT * FROM jsonb_each(p) LOOP
    IF k !~ '^[1-7]$' OR jsonb_typeof(ranges) <> 'array' THEN RETURN false; END IF;
    FOR r IN SELECT * FROM jsonb_array_elements(ranges) LOOP
      IF jsonb_typeof(r) <> 'array' OR jsonb_array_length(r) <> 2
         OR (r ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         OR (r ->> 1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$'
         OR (r ->> 0)::time >= (r ->> 1)::time   -- el tipo time de Postgres admite 24:00
      THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END $$;

-- Servicios: array de objetos {id, name, orderType, durationMinutes}.
CREATE OR REPLACE FUNCTION public.assistant_service_types_valid(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p IS NOT NULL
     AND jsonb_typeof(p) = 'array'
     AND jsonb_array_length(p) <= 50
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p) s
       WHERE jsonb_typeof(s) <> 'object'
          OR coalesce(s ->> 'id', '') !~ '^[a-z0-9][a-z0-9-]{0,59}$'
          OR length(coalesce(s ->> 'name', '')) NOT BETWEEN 1 AND 120
          OR coalesce(s ->> 'orderType', '') NOT IN ('Correctivo', 'Preventivo')
          OR jsonb_typeof(s -> 'durationMinutes') IS DISTINCT FROM 'number'
          OR (s ->> 'durationMinutes')::numeric NOT BETWEEN 15 AND 720
     )
$$;

-- ─── 4) assistant_settings ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_settings (
  company_id            uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  timezone              text NOT NULL DEFAULT 'America/Bogota',
  working_hours         jsonb NOT NULL DEFAULT '{
    "1": [["08:00","12:00"],["13:00","17:00"]],
    "2": [["08:00","12:00"],["13:00","17:00"]],
    "3": [["08:00","12:00"],["13:00","17:00"]],
    "4": [["08:00","12:00"],["13:00","17:00"]],
    "5": [["08:00","12:00"],["13:00","17:00"]],
    "6": [["08:00","12:00"]]
  }'::jsonb,
  service_types         jsonb NOT NULL DEFAULT '[
    {"id":"mantenimiento-preventivo","name":"Mantenimiento preventivo","orderType":"Preventivo","durationMinutes":120},
    {"id":"reparacion","name":"Revisión y reparación","orderType":"Correctivo","durationMinutes":120}
  ]'::jsonb,
  blocked_dates         date[] NOT NULL DEFAULT '{}',
  min_lead_hours        integer NOT NULL DEFAULT 24,
  slot_step_minutes     integer NOT NULL DEFAULT 30,
  max_days_ahead        integer NOT NULL DEFAULT 30,
  -- Técnicos que atienden solicitudes; vacío = todos los asignables de la empresa.
  technician_ids        uuid[] NOT NULL DEFAULT '{}',
  welcome_message       text NOT NULL DEFAULT 'Hola, soy el asistente de servicio técnico. ¿En qué te puedo ayudar?',
  retention_days        integer NOT NULL DEFAULT 180,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,

  CONSTRAINT assistant_settings_timezone_chk CHECK (length(timezone) BETWEEN 1 AND 64),
  CONSTRAINT assistant_settings_hours_chk    CHECK (public.assistant_working_hours_valid(working_hours)),
  CONSTRAINT assistant_settings_services_chk CHECK (public.assistant_service_types_valid(service_types)),
  CONSTRAINT assistant_settings_lead_chk     CHECK (min_lead_hours BETWEEN 0 AND 720),
  CONSTRAINT assistant_settings_step_chk     CHECK (slot_step_minutes IN (15, 30, 60)),
  CONSTRAINT assistant_settings_ahead_chk    CHECK (max_days_ahead BETWEEN 1 AND 180),
  CONSTRAINT assistant_settings_welcome_chk  CHECK (length(welcome_message) <= 1000),
  CONSTRAINT assistant_settings_retention_chk CHECK (retention_days BETWEEN 7 AND 730)
);

-- Zona horaria real (pg_timezone_names no es inmutable: se valida por trigger).
CREATE OR REPLACE FUNCTION public.assistant_settings_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'Zona horaria no válida: %', NEW.timezone USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assistant_settings_before_write ON public.assistant_settings;
CREATE TRIGGER trg_assistant_settings_before_write
  BEFORE INSERT OR UPDATE ON public.assistant_settings
  FOR EACH ROW EXECUTE FUNCTION public.assistant_settings_before_write();

ALTER TABLE public.assistant_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_settings_select ON public.assistant_settings;
CREATE POLICY assistant_settings_select ON public.assistant_settings
  FOR SELECT USING (public.can_manage_service_requests(company_id));

DROP POLICY IF EXISTS assistant_settings_insert ON public.assistant_settings;
CREATE POLICY assistant_settings_insert ON public.assistant_settings
  FOR INSERT WITH CHECK (public.can_configure_assistant(company_id));

DROP POLICY IF EXISTS assistant_settings_update ON public.assistant_settings;
CREATE POLICY assistant_settings_update ON public.assistant_settings
  FOR UPDATE USING (public.can_configure_assistant(company_id))
  WITH CHECK (public.can_configure_assistant(company_id));

-- ─── 5) assistant_conversations / assistant_messages ─────────────────────────
CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  channel          text NOT NULL DEFAULT 'web',
  status           text NOT NULL DEFAULT 'abierta',
  client_id        uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  verified_email   text,
  verified_at      timestamptz,
  -- Huella de la IP (hash con sal en la Edge Function), nunca la IP en claro.
  ip_hash          text,
  turn_count       integer NOT NULL DEFAULT 0,
  input_tokens     bigint  NOT NULL DEFAULT 0,
  output_tokens    bigint  NOT NULL DEFAULT 0,
  provider         text,
  model            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_message_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT assistant_conversations_channel_chk CHECK (channel IN ('web', 'whatsapp')),
  CONSTRAINT assistant_conversations_status_chk  CHECK (status IN ('abierta', 'cerrada', 'bloqueada')),
  CONSTRAINT assistant_conversations_counts_chk  CHECK (turn_count >= 0 AND input_tokens >= 0 AND output_tokens >= 0)
);

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_company
  ON public.assistant_conversations (company_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id  uuid NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role             text NOT NULL,
  -- Texto visible, o la llamada/resultado de una herramienta como JSON.
  content          jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT assistant_messages_role_chk CHECK (role IN ('user', 'assistant', 'tool'))
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation
  ON public.assistant_messages (conversation_id, id);

-- El company_id del mensaje debe ser el de su conversación (evita cruzar empresas
-- aunque la escritura sea siempre de la service role).
CREATE OR REPLACE FUNCTION public.assistant_messages_company_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.assistant_conversations c
    WHERE c.id = NEW.conversation_id AND c.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'El mensaje no corresponde a la empresa de la conversación' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assistant_messages_company_check ON public.assistant_messages;
CREATE TRIGGER trg_assistant_messages_company_check
  BEFORE INSERT OR UPDATE ON public.assistant_messages
  FOR EACH ROW EXECUTE FUNCTION public.assistant_messages_company_check();

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_conversations_select ON public.assistant_conversations;
CREATE POLICY assistant_conversations_select ON public.assistant_conversations
  FOR SELECT USING (public.can_manage_service_requests(company_id));

DROP POLICY IF EXISTS assistant_messages_select ON public.assistant_messages;
CREATE POLICY assistant_messages_select ON public.assistant_messages
  FOR SELECT USING (public.can_manage_service_requests(company_id));
-- Sin políticas de escritura: solo la service role (Edge Function) escribe.

-- ─── 6) service_requests ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_requests (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                 uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status                     public.service_request_status NOT NULL DEFAULT 'borrador',
  channel                    text NOT NULL DEFAULT 'web',
  conversation_id            uuid REFERENCES public.assistant_conversations(id) ON DELETE SET NULL,

  -- Cliente: existente (client_id) o los datos de contacto recogidos.
  client_id                  uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  contact_name               text,
  contact_phone              text,
  contact_email              text,
  contact_identification     text,
  address                    text,
  city                       text,

  -- Servicio pedido.
  equipment_ids              jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipment_description      text,
  service_type_id            text,
  service_name               text,
  order_type                 public.order_type NOT NULL DEFAULT 'Correctivo',
  description                text NOT NULL DEFAULT '',
  suggested_priority         public.priority_level NOT NULL DEFAULT 'Media',
  -- Franjas que prefiere el cliente: [{"date":"YYYY-MM-DD","time":"HH:MM"}] o texto.
  preferred_slots            jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Hueco y técnico propuestos (por el asistente o el gestor); al confirmar
  -- guardan los definitivos.
  proposed_date              date,
  proposed_time              time,
  proposed_duration_minutes  integer,
  proposed_technician_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,

  -- Revisión.
  order_id                   uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reviewed_by                uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at                timestamptz,
  rejection_reason           text,

  created_by                 uuid REFERENCES public.users(id) ON DELETE SET NULL,
  submitted_at               timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT service_requests_channel_chk   CHECK (channel IN ('web', 'whatsapp', 'manual')),
  CONSTRAINT service_requests_equipment_chk CHECK (jsonb_typeof(equipment_ids) = 'array'),
  CONSTRAINT service_requests_slots_chk     CHECK (jsonb_typeof(preferred_slots) IN ('array', 'string')),
  CONSTRAINT service_requests_duration_chk  CHECK (proposed_duration_minutes IS NULL OR proposed_duration_minutes BETWEEN 15 AND 720),
  CONSTRAINT service_requests_lengths_chk   CHECK (
        length(coalesce(contact_name, ''))           <= 200
    AND length(coalesce(contact_phone, ''))          <= 40
    AND length(coalesce(contact_email, ''))          <= 254
    AND length(coalesce(contact_identification, '')) <= 40
    AND length(coalesce(address, ''))                <= 300
    AND length(coalesce(city, ''))                   <= 120
    AND length(coalesce(equipment_description, ''))  <= 2000
    AND length(coalesce(service_name, ''))           <= 200
    AND length(description)                          <= 4000
    AND length(coalesce(rejection_reason, ''))       <= 1000
  ),
  CONSTRAINT service_requests_rejection_chk CHECK (status <> 'rechazada' OR length(trim(coalesce(rejection_reason, ''))) > 0)
);

CREATE INDEX IF NOT EXISTS idx_service_requests_company_status
  ON public.service_requests (company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_conversation
  ON public.service_requests (conversation_id);

-- Guard de transiciones. Las funciones de revisión (043) activan
-- app.service_request_review solo dentro de su transacción.
CREATE OR REPLACE FUNCTION public.service_requests_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_reviewing boolean := coalesce(current_setting('app.service_request_review', true), '') = 'on';
  v_fk constant text[] := ARRAY['order_id', 'reviewed_by', 'client_id', 'proposed_technician_id', 'conversation_id', 'created_by'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('borrador', 'pendiente') THEN
      RAISE EXCEPTION 'Una solicitud nueva solo puede quedar en borrador o pendiente' USING ERRCODE = '42501';
    END IF;
    IF NEW.order_id IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Una solicitud nueva no puede traer orden ni revisión' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'No se puede cambiar la empresa ni la fecha de creación de una solicitud' USING ERRCODE = '42501';
    END IF;
    IF OLD.status IN ('confirmada', 'rechazada', 'cancelada') THEN
      -- Cerrada: solo admite que una referencia quede en NULL porque se borró
      -- lo referenciado (ON DELETE SET NULL de orden, cliente, usuario o
      -- conversación purgada).
      IF (to_jsonb(NEW) - v_fk - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - v_fk - 'updated_at')
         OR EXISTS (
           SELECT 1 FROM unnest(v_fk) AS k
           WHERE to_jsonb(NEW) -> k <> 'null'::jsonb
             AND (to_jsonb(NEW) -> k) IS DISTINCT FROM (to_jsonb(OLD) -> k)
         ) THEN
        RAISE EXCEPTION 'La solicitud ya fue cerrada (%) y no admite cambios', OLD.status USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
           (OLD.status = 'borrador'  AND NEW.status IN ('pendiente', 'cancelada'))
        OR (OLD.status = 'pendiente' AND NEW.status IN ('borrador', 'cancelada'))
        OR (OLD.status = 'pendiente' AND NEW.status IN ('confirmada', 'rechazada') AND v_reviewing)
      ) THEN
        RAISE EXCEPTION 'Transición no permitida: % → %', OLD.status, NEW.status USING ERRCODE = '42501';
      END IF;
    END IF;
    IF NOT v_reviewing AND (
         NEW.order_id    IS DISTINCT FROM OLD.order_id AND NEW.order_id IS NOT NULL
      OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    ) THEN
      RAISE EXCEPTION 'La orden y la revisión solo las fija la confirmación o el rechazo' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status = 'pendiente' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pendiente') THEN
    NEW.submitted_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_service_requests_guard ON public.service_requests;
CREATE TRIGGER trg_service_requests_guard
  BEFORE INSERT OR UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.service_requests_guard();

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_requests_select ON public.service_requests;
CREATE POLICY service_requests_select ON public.service_requests
  FOR SELECT USING (public.can_manage_service_requests(company_id));

-- Alta manual (p. ej. una llamada): directamente en 'pendiente', a nombre propio.
DROP POLICY IF EXISTS service_requests_insert_manual ON public.service_requests;
CREATE POLICY service_requests_insert_manual ON public.service_requests
  FOR INSERT WITH CHECK (
        public.can_manage_service_requests(company_id)
    AND channel = 'manual'
    AND status = 'pendiente'
    AND conversation_id IS NULL
    AND created_by = public.current_user_id()
  );
-- Sin UPDATE ni DELETE por la API: confirmar y rechazar van por las funciones de 043.

-- ─── 7) Aviso interno a los gestores cuando una solicitud queda pendiente ────
-- Notificación en la campana (tabla notifications). El push llega en la fase 2
-- con su propia Edge Function, por el mismo patrón de las migraciones 029/039.
CREATE OR REPLACE FUNCTION public.service_requests_notify_pending()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_who text := coalesce(nullif(trim(NEW.contact_name), ''), 'Un cliente');
  v_what text := coalesce(nullif(trim(NEW.service_name), ''), NEW.order_type::text);
BEGIN
  IF NEW.status = 'pendiente' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pendiente') THEN
    INSERT INTO public.notifications (company_id, user_id, title, body, text, type, path)
    SELECT NEW.company_id, u.id,
           'Nueva solicitud de servicio',
           v_who || ' pide: ' || v_what,
           'Solicitud nueva de ' || v_who,
           'info',
           '/requests/' || NEW.id
    FROM public.users u
    WHERE u.company_id = NEW.company_id
      AND u.role IN ('admin', 'supervisor', 'aux_admin')
      AND (NEW.created_by IS NULL OR u.id <> NEW.created_by);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_service_requests_notify_pending ON public.service_requests;
CREATE TRIGGER trg_service_requests_notify_pending
  AFTER INSERT OR UPDATE OF status ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.service_requests_notify_pending();

-- ─── 8) Retención de transcripciones ─────────────────────────────────────────
-- Borra las conversaciones (y sus mensajes, en cascada) más antiguas que el
-- retention_days de su empresa (180 días si no tiene configuración). Las
-- solicitudes se conservan: su conversation_id queda en NULL. Lo invocará el
-- edge programado diario (fase 3); solo la service role puede ejecutarla.
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
  RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.purge_assistant_transcripts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_assistant_transcripts() TO service_role;

-- Los triggers no se llaman por la API.
REVOKE ALL ON FUNCTION public.service_requests_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_requests_notify_pending() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assistant_settings_before_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assistant_messages_company_check() FROM PUBLIC, anon, authenticated;

-- Realtime para la bandeja (como support_tickets en la migración 023).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;
