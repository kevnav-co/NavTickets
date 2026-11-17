-- =============================================================================
-- 045 — confirm_service_request independiente del tipo de orders.equipment_ids
-- =============================================================================
-- En producción orders.equipment_ids es text[] (migración 033, aplicada desde un
-- equipo local); en el repo es jsonb (036). La 043 insertaba un jsonb y en
-- producción fallaba con «column "equipment_ids" is of type text[] but
-- expression is of type jsonb» (la transacción se deshacía entera: no quedaba ni
-- orden ni cliente a medias).
--
-- Se redefine la función con la misma lógica; solo cambia la forma de insertar
-- la orden. CREATE OR REPLACE conserva los permisos de la 043 (solo
-- authenticated puede ejecutarla). Idempotente.
-- =============================================================================

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

  -- jsonb_populate_record convierte cada valor al tipo real de su columna: así
  -- equipment_ids vale tanto si es jsonb (036 del repo) como text[] (033 de
  -- producción). order_number queda en NULL para que lo asigne el trigger 005.
  INSERT INTO public.orders (
    company_id, order_number, name, client_id, client_name, technician_id,
    scheduled_date, time_slot, scheduled_end_time, description, status,
    procedures, order_type, service_name, priority, equipment_ids, last_updated_by
  )
  SELECT x.company_id, x.order_number, x.name, x.client_id, x.client_name, x.technician_id,
         x.scheduled_date, x.time_slot, x.scheduled_end_time, x.description, x.status,
         x.procedures, x.order_type, x.service_name, x.priority, x.equipment_ids, x.last_updated_by
  FROM jsonb_populate_record(NULL::public.orders, jsonb_build_object(
    'company_id',         r.company_id,
    'name',               v_service,
    'client_id',          v_client,
    'client_name',        v_client_name,
    'technician_id',      p_technician,
    'scheduled_date',     to_char(p_date, 'YYYY-MM-DD'),
    'time_slot',          to_char(p_time, 'HH24:MI'),
    'scheduled_end_time', to_char(v_end::time, 'HH24:MI'),
    'description',        v_desc,
    'status',             'Pendiente',
    'procedures',         '["Inspección Inicial"]'::jsonb,
    'order_type',         r.order_type,
    'service_name',       v_service,
    'priority',           r.suggested_priority,
    'equipment_ids',      v_equipment,
    'last_updated_by',    v_me_name
  )) x
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
