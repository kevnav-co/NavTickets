-- =============================================================================
-- NavTicket - Migración 006: Soporte interno (tickets) multi-empresa
-- =============================================================================
-- PROPÓSITO:
--   Crear un sistema de soporte tipo ticket donde usuarios de cada empresa
--   envían consultas/incidencias al soporte de la app, gestionado por el
--   super_admin (que ve TODAS las empresas en /admin/support).
--   - support_tickets: cabecera del ticket (asunto, mensaje de apertura, estado).
--   - support_messages: hilo/chat (role 'empresa' | 'admin') con realtime.
--   Aislamiento por empresa (company_id) con override del super_admin, espejo
--   de la migración 005 (usa sus helpers SECURITY DEFINER).
--
-- EJECUTAR: pegar en el SQL Editor de Supabase (o vía `supabase db push`).
-- Idempotente: DROP POLICY/TRIGGER IF EXISTS, CREATE TABLE IF NOT EXISTS,
-- DO-block para el enum.
-- =============================================================================

-- =============================================================================
-- 1) ENUM de estado
-- =============================================================================
DO $$ BEGIN
  CREATE TYPE support_status AS ENUM ('abierto', 'en_progreso', 'cerrado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 2) TABLA: support_tickets (cabecera del soporte)
-- =============================================================================
CREATE TABLE IF NOT EXISTS support_tickets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id     uuid REFERENCES users(id) ON DELETE SET NULL,   -- solicitante
    subject     text NOT NULL,
    message     text NOT NULL,                                   -- mensaje de apertura
    status      support_status NOT NULL DEFAULT 'abierto',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_company ON support_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at DESC);

-- =============================================================================
-- 3) TABLA: support_messages (hilo/chat del ticket)
-- =============================================================================
CREATE TABLE IF NOT EXISTS support_messages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id   uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    user_id     uuid REFERENCES users(id) ON DELETE SET NULL,    -- autor
    role        text NOT NULL,                                   -- 'empresa' | 'admin'
    message     text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at ASC);

-- =============================================================================
-- 4) RLS + realtime
-- =============================================================================
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Realtime (chat en vivo + lista de tickets)
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── support_tickets ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "support_tickets_select" ON support_tickets;
CREATE POLICY "support_tickets_select" ON support_tickets
    FOR SELECT USING (
        company_id = public.current_company_id()
        OR public.current_user_role() = 'super_admin'
    );

DROP POLICY IF EXISTS "support_tickets_insert" ON support_tickets;
CREATE POLICY "support_tickets_insert" ON support_tickets
    FOR INSERT WITH CHECK (
        (company_id = public.current_company_id() AND user_id = public.current_user_id())
        OR public.current_user_role() = 'super_admin'
    );

DROP POLICY IF EXISTS "support_tickets_update" ON support_tickets;
CREATE POLICY "support_tickets_update" ON support_tickets
    FOR UPDATE USING (
        company_id = public.current_company_id()
        OR public.current_user_role() = 'super_admin'
    )
    WITH CHECK (
        company_id = public.current_company_id()
        OR public.current_user_role() = 'super_admin'
    );

DROP POLICY IF EXISTS "support_tickets_delete" ON support_tickets;
CREATE POLICY "support_tickets_delete" ON support_tickets
    FOR DELETE USING (
        public.current_user_role() = 'super_admin'
    );

-- ── support_messages ─────────────────────────────────────────────────────────
-- SELECT: el ticket es de la misma empresa del usuario, o es super_admin.
DROP POLICY IF EXISTS "support_messages_select" ON support_messages;
CREATE POLICY "support_messages_select" ON support_messages
    FOR SELECT USING (
        public.current_user_role() = 'super_admin'
        OR EXISTS (
            SELECT 1 FROM support_tickets t
            WHERE t.id = support_messages.ticket_id
              AND t.company_id = public.current_company_id()
        )
    );

-- INSERT: el autor es el solicitante del ticket de su empresa, o super_admin.
DROP POLICY IF EXISTS "support_messages_insert" ON support_messages;
CREATE POLICY "support_messages_insert" ON support_messages
    FOR INSERT WITH CHECK (
        public.current_user_role() = 'super_admin'
        OR EXISTS (
            SELECT 1 FROM support_tickets t
            WHERE t.id = support_messages.ticket_id
              AND t.company_id = public.current_company_id()
              AND t.user_id = public.current_user_id()
        )
    );

-- DELETE: solo super_admin (por seguridad).
DROP POLICY IF EXISTS "support_messages_delete" ON support_messages;
CREATE POLICY "support_messages_delete" ON support_messages
    FOR DELETE USING (
        public.current_user_role() = 'super_admin'
    );

-- =============================================================================
-- 5) GUARD: updated_at automático en support_tickets
-- =============================================================================
CREATE OR REPLACE FUNCTION public.support_tickets_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_support_tickets_touch ON support_tickets;
CREATE TRIGGER trg_support_tickets_touch
    BEFORE UPDATE ON support_tickets
    FOR EACH ROW EXECUTE FUNCTION public.support_tickets_touch();