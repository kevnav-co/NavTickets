-- =============================================================================
-- 043 — Asistente de ventas y servicio técnico (fase 1): disponibilidad y revisión
-- =============================================================================
--   available_slots(company, desde, hasta, duración[, técnico])
--       Huecos libres: cruza el horario laboral del asistente (042) con las
--       órdenes no cerradas de cada técnico. Devuelve fechas, horas y qué
--       técnicos están libres; nunca datos de las órdenes que ocupan un hueco.
--       La pueden llamar la service role (el asistente) y los gestores de la
--       empresa. La Edge Function del asistente solo reenvía al modelo fecha y
--       hora, no los ids de técnicos.
--
--   confirm_service_request(solicitud, fecha, hora, duración, técnico)
--       Una sola transacción: comprueba rol y empresa, vuelve a verificar que el
--       técnico siga libre (con un candado por técnico contra dos confirmaciones
--       simultáneas), enlaza o crea el cliente, inserta la orden y marca la
--       solicitud como confirmada. Al insertar la orden con técnico, el trigger
--       trg_order_assigned_webhook (029) avisa al técnico. Exige una persona:
--       la service role no puede confirmar.
--
--   reject_service_request(solicitud, motivo)
--       Rechaza con motivo obligatorio. También exige una persona.
--
-- Una orden ocupa al técnico desde time_slot hasta scheduled_end_time, o una
-- hora si no tiene fin o el fin no es válido, igual que AvailabilityModal.
-- Las órdenes con fecha u hora ilegibles se ignoran en vez de romper el cálculo.
-- =============================================================================

-- ─── 1) Helpers internos ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR coalesce(current_setting('role', true), '') = 'service_role'
$$;

CREATE OR REPLACE FUNCTION public.try_parse_date(p text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p IS NULL OR p !~ '^\d{4}-\d{2}-\d{2}' THEN RETURN NULL; END IF;
  RETURN left(p, 10)::date;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.try_parse_time(p text)
RETURNS time
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p IS NULL OR p !~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' THEN RETURN NULL; END IF;
  RETURN p::time;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

-- Intervalos ocupados por técnico entre dos fechas (órdenes no cerradas).
CREATE OR REPLACE FUNCTION public.technician_busy_intervals(p_company uuid, p_from date, p_to date)
RETURNS TABLE (technician_id uuid, busy_start timestamp, busy_end timestamp)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT x.technician_id,
         x.d + x.t_start,
         CASE WHEN x.t_end IS NOT NULL AND x.t_end > x.t_start
              THEN x.d + x.t_end
              ELSE x.d + x.t_start + interval '60 minutes'
         END
  FROM (
    SELECT o.technician_id,
           public.try_parse_date(o.scheduled_date)     AS d,
           public.try_parse_time(o.time_slot)          AS t_start,
           public.try_parse_time(o.scheduled_end_time) AS t_end
    FROM public.orders o
    WHERE o.company_id = p_company
      AND o.technician_id IS NOT NULL
      AND o.status <> 'Cerrado'
      AND left(o.scheduled_date, 10) BETWEEN to_char(p_from, 'YYYY-MM-DD') AND to_char(p_to, 'YYYY-MM-DD')
  ) x
  WHERE x.d IS NOT NULL AND x.t_start IS NOT NULL
$$;

-- Configuración efectiva: si la empresa aún no guardó la suya, se crea la fila
-- con los valores por defecto de la tabla (una sola fuente de valores por defecto).
CREATE OR REPLACE FUNCTION public.assistant_settings_effective(p_company uuid)
RETURNS public.assistant_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.assistant_settings;
BEGIN
  SELECT * INTO s FROM public.assistant_settings WHERE company_id = p_company;
  IF NOT FOUND THEN
    INSERT INTO public.assistant_settings (company_id) VALUES (p_company)
    ON CONFLICT (company_id) DO NOTHING;
    SELECT * INTO s FROM public.assistant_settings WHERE company_id = p_company;
  END IF;
  RETURN s;
END $$;

REVOKE ALL ON FUNCTION public.request_is_service_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.technician_busy_intervals(uuid, date, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assistant_settings_effective(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ─── 2) available_slots ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.available_slots(
  p_company           uuid,
  p_from              date,
  p_to                date,
  p_duration_minutes  integer,
  p_technician        uuid DEFAULT NULL
)
RETURNS TABLE (slot_date date, slot_time time, free_technicians integer, technician_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s           public.assistant_settings;
  v_now       timestamp;
  v_min_start timestamp;
  v_first     date;
  v_last      date;
BEGIN
  IF NOT (public.request_is_service_role() OR public.can_manage_service_requests(p_company)) THEN
    RAISE EXCEPTION 'Sin permiso para consultar la disponibilidad de esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 15 AND 720 THEN
    RAISE EXCEPTION 'La duración debe estar entre 15 y 720 minutos' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 31 THEN
    RAISE EXCEPTION 'Rango de fechas no válido (máximo 31 días)' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company) THEN
    RAISE EXCEPTION 'Empresa no encontrada' USING ERRCODE = 'P0002';
  END IF;

  s           := public.assistant_settings_effective(p_company);
  v_now       := now() AT TIME ZONE s.timezone;
  v_min_start := v_now + make_interval(hours => s.min_lead_hours);
  v_first     := greatest(p_from, v_now::date);
  v_last      := least(p_to, v_now::date + s.max_days_ahead);

  IF v_last < v_first THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH techs AS (
    SELECT u.id
    FROM public.users u
    WHERE u.company_id = p_company
      AND u.role IN ('admin', 'supervisor', 'technician')   -- los asignables de la app (UserSearchModal)
      AND (cardinality(s.technician_ids) = 0 OR u.id = ANY (s.technician_ids))
      AND (p_technician IS NULL OR u.id = p_technician)
  ),
  days AS (
    SELECT g::date AS d
    FROM generate_series(v_first::timestamp, v_last::timestamp, interval '1 day') g
    WHERE NOT (g::date = ANY (s.blocked_dates))
  ),
  ranges AS (
    SELECT dy.d, (r ->> 0)::time AS r_start, (r ->> 1)::time AS r_end
    FROM days dy
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.working_hours -> extract(isodow FROM dy.d)::int::text, '[]'::jsonb)) r
  ),
  starts AS (
    SELECT rg.d, rg.d + rg.r_start + make_interval(mins => m) AS st
    FROM ranges rg
    CROSS JOIN LATERAL generate_series(
      0,
      (extract(epoch FROM (rg.r_end - rg.r_start)) / 60)::int - p_duration_minutes,
      s.slot_step_minutes
    ) m
  ),
  busy AS (
    SELECT b.* FROM public.technician_busy_intervals(p_company, v_first, v_last) b
    WHERE b.technician_id IN (SELECT id FROM techs)
  )
  SELECT st.d,
         st.st::time,
         count(t.id)::int,
         array_agg(t.id ORDER BY t.id)
  FROM starts st
  CROSS JOIN techs t
  WHERE st.st >= v_min_start
    AND NOT EXISTS (
      SELECT 1 FROM busy b
      WHERE b.technician_id = t.id
        AND b.busy_start < st.st + make_interval(mins => p_duration_minutes)
        AND st.st < b.busy_end
    )
  GROUP BY st.d, st.st
  ORDER BY st.d, st.st;
END $$;

REVOKE ALL ON FUNCTION public.available_slots(uuid, date, date, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.available_slots(uuid, date, date, integer, uuid) TO authenticated, service_role;

-- ─── 3) confirm_service_request ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_service_request(
  p_request           uuid,
  p_date              date,
  p_time              time,
  p_duration_minutes  integer,
  p_technician        uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r            public.service_requests;
  v_tz         text;
  v_start      timestamp;
  v_end        timestamp;
  v_client     uuid;
  v_client_name text;
  v_equipment  jsonb;
  v_order      uuid;
  v_me         uuid := public.current_user_id();
  v_me_name    text;
  v_desc       text;
  v_service    text;
BEGIN
  -- Solo una persona con sesión confirma: ni la service role ni anon.
  IF auth.uid() IS NULL OR v_me IS NULL OR public.request_is_service_role() THEN
    RAISE EXCEPTION 'Solo un usuario de la empresa puede confirmar solicitudes' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.service_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_service_requests(r.company_id) THEN
    RAISE EXCEPTION 'Solicitud no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF r.status <> 'pendiente' THEN
    RAISE EXCEPTION 'La solicitud está %, solo se confirman las pendientes', r.status USING ERRCODE = '55000';
  END IF;

  IF p_date IS NULL OR p_time IS NULL THEN
    RAISE EXCEPTION 'Falta la fecha o la hora' USING ERRCODE = '22023';
  END IF;
  IF p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 15 AND 720 THEN
    RAISE EXCEPTION 'La duración debe estar entre 15 y 720 minutos' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_technician AND u.company_id = r.company_id
      AND u.role IN ('admin', 'supervisor', 'technician')
  ) THEN
    RAISE EXCEPTION 'El técnico no pertenece a la empresa o no es asignable' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce((SELECT s.timezone FROM public.assistant_settings s WHERE s.company_id = r.company_id), 'America/Bogota')
    INTO v_tz;
  v_start := p_date + p_time;
  v_end   := v_start + make_interval(mins => p_duration_minutes);
  IF v_start < now() AT TIME ZONE v_tz THEN
    RAISE EXCEPTION 'No se puede agendar en el pasado' USING ERRCODE = '22023';
  END IF;
  IF v_end::date > p_date THEN
    RAISE EXCEPTION 'El servicio debe terminar el mismo día' USING ERRCODE = '22023';
  END IF;

  -- Un candado por técnico: dos confirmaciones simultáneas no pueden ocupar el
  -- mismo hueco; la segunda ve la orden de la primera.
  PERFORM pg_advisory_xact_lock(hashtextextended('service_request_technician:' || p_technician::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.technician_busy_intervals(r.company_id, p_date, p_date) b
    WHERE b.technician_id = p_technician
      AND b.busy_start < v_end
      AND v_start < b.busy_end
  ) THEN
    RAISE EXCEPTION 'El técnico ya tiene una orden en ese horario' USING ERRCODE = '23P01';
  END IF;

  -- Cliente: el de la solicitud si sigue siendo de la empresa; si no, uno
  -- existente con la misma identificación o correo; si no, uno nuevo.
  IF r.client_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = r.client_id AND c.company_id = r.company_id) THEN
    v_client := r.client_id;
  ELSE
    SELECT c.id INTO v_client
    FROM public.clients c
    WHERE c.company_id = r.company_id
      AND (
           (nullif(trim(r.contact_identification), '') IS NOT NULL AND c.identification = trim(r.contact_identification))
        OR (nullif(trim(r.contact_email), '') IS NOT NULL AND lower(c.email) = lower(trim(r.contact_email)))
      )
    ORDER BY c.created_at
    LIMIT 1;

    IF v_client IS NULL THEN
      v_client_name := nullif(trim(r.contact_name), '');
      IF v_client_name IS NULL THEN
        RAISE EXCEPTION 'La solicitud no tiene nombre de cliente' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM public.clients c WHERE c.company_id = r.company_id AND c.name = v_client_name) THEN
        v_client_name := v_client_name || ' (' || coalesce(
          nullif(trim(r.contact_identification), ''),
          nullif(trim(r.contact_email), ''),
          nullif(trim(r.contact_phone), ''),
          left(r.id::text, 8)) || ')';
      END IF;
      INSERT INTO public.clients (company_id, name, address, contact, identification, email, city)
      VALUES (r.company_id, v_client_name, nullif(trim(r.address), ''), nullif(trim(r.contact_phone), ''),
              nullif(trim(r.contact_identification), ''), nullif(lower(trim(r.contact_email)), ''), nullif(trim(r.city), ''))
      RETURNING id INTO v_client;
    END IF;
  END IF;
  SELECT c.name INTO v_client_name FROM public.clients c WHERE c.id = v_client;

  -- Equipos: solo los que de verdad son de ese cliente en esa empresa.
  SELECT coalesce(jsonb_agg(to_jsonb(e.id::text) ORDER BY e.id), '[]'::jsonb) INTO v_equipment
  FROM public.equipment e
  WHERE e.company_id = r.company_id
    AND e.client_id = v_client
    AND e.id::text IN (SELECT jsonb_array_elements_text(r.equipment_ids));

  v_service := upper(coalesce(nullif(trim(r.service_name), ''), r.order_type::text));
  v_desc := coalesce(nullif(trim(r.description), ''), 'Solicitud de servicio');
  IF nullif(trim(r.equipment_description), '') IS NOT NULL THEN
    v_desc := v_desc || E'\n\nEquipo indicado por el cliente: ' || trim(r.equipment_description);
  END IF;
  SELECT u.name INTO v_me_name FROM public.users u WHERE u.id = v_me;

  INSERT INTO public.orders (
    company_id, order_number, name, client_id, client_name, technician_id,
    scheduled_date, time_slot, scheduled_end_time, description, status,
    procedures, order_type, service_name, priority, equipment_ids, last_updated_by
  ) VALUES (
    r.company_id, NULL, v_service, v_client, v_client_name, p_technician,
    to_char(p_date, 'YYYY-MM-DD'), to_char(p_time, 'HH24:MI'), to_char(v_end::time, 'HH24:MI'), v_desc, 'Pendiente',
    '["Inspección Inicial"]'::jsonb, r.order_type, v_service, r.suggested_priority, v_equipment, v_me_name
  )
  RETURNING id INTO v_order;

  PERFORM set_config('app.service_request_review', 'on', true);
  UPDATE public.service_requests
     SET status                    = 'confirmada',
         order_id                  = v_order,
         client_id                 = v_client,
         proposed_date             = p_date,
         proposed_time             = p_time,
         proposed_duration_minutes = p_duration_minutes,
         proposed_technician_id    = p_technician,
         reviewed_by               = v_me,
         reviewed_at               = now()
   WHERE id = p_request;
  PERFORM set_config('app.service_request_review', 'off', true);

  RETURN v_order;
END $$;

-- ─── 4) reject_service_request ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_service_request(p_request uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r    public.service_requests;
  v_me uuid := public.current_user_id();
BEGIN
  IF auth.uid() IS NULL OR v_me IS NULL OR public.request_is_service_role() THEN
    RAISE EXCEPTION 'Solo un usuario de la empresa puede rechazar solicitudes' USING ERRCODE = '42501';
  END IF;
  IF length(trim(coalesce(p_reason, ''))) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'El motivo del rechazo es obligatorio (máximo 1000 caracteres)' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r FROM public.service_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_service_requests(r.company_id) THEN
    RAISE EXCEPTION 'Solicitud no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF r.status <> 'pendiente' THEN
    RAISE EXCEPTION 'La solicitud está %, solo se rechazan las pendientes', r.status USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('app.service_request_review', 'on', true);
  UPDATE public.service_requests
     SET status           = 'rechazada',
         rejection_reason = trim(p_reason),
         reviewed_by      = v_me,
         reviewed_at      = now()
   WHERE id = p_request;
  PERFORM set_config('app.service_request_review', 'off', true);
END $$;

REVOKE ALL ON FUNCTION public.confirm_service_request(uuid, date, time, integer, uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.reject_service_request(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_service_request(uuid, date, time, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_service_request(uuid, text) TO authenticated;
