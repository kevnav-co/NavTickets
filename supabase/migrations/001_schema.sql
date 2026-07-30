-- =============================================================================
-- NavTicket - Migración 001: Esquema Inicial Completo
-- Firestore → PostgreSQL
-- =============================================================================
-- Este archivo contiene el esquema DDL completo para reemplazar las
-- colecciones de Firestore con tablas PostgreSQL relacionales.
--
-- Convenciones:
--   - Nombres en snake_case
--   - Todas las tablas tienen id (UUID v4) y company_id
--   - Soft-delete NO implementado (se elimina físicamente como en Firestore)
--   - Timestamps con timestamptz (zona horaria explícita)
--   - JSONB para datos semi-estructurados (closingData, warrantyJobs)
-- =============================================================================

-- =============================================================================
-- EXTENSIONES
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- Para gen_random_uuid()

-- =============================================================================
-- TABLA: companies
-- =============================================================================
CREATE TABLE companies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- TABLA: users
-- =============================================================================
CREATE TYPE user_role AS ENUM (
    'admin',
    'technician',
    'supervisor',
    'developer',
    'aux_admin',
    'super_admin'
);

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    role                user_role NOT NULL DEFAULT 'technician',
    username            TEXT NOT NULL,
    password            TEXT,                              -- Solo para migración; Supabase Auth maneja auth
    identification      TEXT,
    address             TEXT,
    latitude            DOUBLE PRECISION,
    longitude           DOUBLE PRECISION,
    location_updated_at TIMESTAMPTZ,
    fcm_token           TEXT,                              -- Se migrará a OneSignal player_id
    signature           TEXT,                              -- URL de la firma
    supabase_auth_id    UUID,                              -- Se vincula tras migrar auth
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_users_username_company UNIQUE (username, company_id)
);

CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_supabase_auth ON users(supabase_auth_id);

-- =============================================================================
-- TABLA: clients
-- =============================================================================
CREATE TABLE clients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    address         TEXT,
    contact         TEXT,
    identification  TEXT,
    email           TEXT,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    neighborhood    TEXT,
    city            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_clients_name_company UNIQUE (name, company_id)
);

CREATE INDEX idx_clients_company ON clients(company_id);

-- =============================================================================
-- TABLA: equipment
-- =============================================================================
CREATE TYPE equipment_status AS ENUM (
    'Activa',
    'Inactiva',
    'En Mantenimiento',
    'Retirada'
);

CREATE TYPE equipment_voltage AS ENUM (
    '110V',
    '220V',
    '330V'
);

CREATE TYPE gas_type AS ENUM (
    'Natural',
    'Propano',
    'No usa'
);

CREATE TABLE equipment (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    client_id                       UUID REFERENCES clients(id) ON DELETE SET NULL,
    name                            TEXT NOT NULL,
    brand                           TEXT,
    description                     TEXT,
    serial_number                   TEXT NOT NULL,
    location                        TEXT DEFAULT '',
    voltage                         equipment_voltage NOT NULL DEFAULT '220V',
    gas_type                        gas_type DEFAULT 'No usa',
    status                          equipment_status NOT NULL DEFAULT 'Activa',
    image_url                       TEXT,
    last_maintenance_date           TEXT,                -- String ISO date (como en Firestore)
    maintenance_frequency           INTEGER DEFAULT 6,   -- En meses
    next_maintenance_notification_sent BOOLEAN DEFAULT FALSE,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_equipment_serial_company UNIQUE (serial_number, company_id)
);

CREATE INDEX idx_equipment_company ON equipment(company_id);
CREATE INDEX idx_equipment_client ON equipment(client_id);
CREATE INDEX idx_equipment_status ON equipment(status);

-- =============================================================================
-- TABLA: orders (Service Orders)
-- =============================================================================
CREATE TYPE order_status AS ENUM (
    'Pendiente',
    'En Progreso',
    'Cerrado'
);

CREATE TYPE order_type AS ENUM (
    'Correctivo',
    'Preventivo'
);

CREATE TYPE priority_level AS ENUM (
    'Baja',
    'Media',
    'Alta',
    'Urgente'
);

CREATE TABLE orders (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    order_number                    INTEGER NOT NULL,
    name                            TEXT NOT NULL,
    client_id                       UUID REFERENCES clients(id) ON DELETE SET NULL,
    client_name                     TEXT,                                -- Desnormalizado
    technician_id                   UUID REFERENCES users(id) ON DELETE SET NULL,
    scheduled_date                  TEXT NOT NULL,                       -- ISO date string
    time_slot                       TEXT NOT NULL,                       -- HH:mm
    scheduled_end_time              TEXT,                                -- HH:mm
    actual_start_date               TEXT,
    description                     TEXT NOT NULL DEFAULT '',
    status                          order_status NOT NULL DEFAULT 'Pendiente',
    observations                    TEXT,
    initial_photos                  JSONB DEFAULT '[]'::jsonb,           -- Array de URLs
    initial_evidence                JSONB DEFAULT '[]'::jsonb,
    final_evidence                  JSONB DEFAULT '[]'::jsonb,
    current_warranty_evidence       JSONB DEFAULT '[]'::jsonb,
    procedures                      JSONB DEFAULT '[]'::jsonb,           -- Array de strings
    start_time                      TEXT,
    end_time                        TEXT,
    order_type                      order_type NOT NULL DEFAULT 'Correctivo',
    service_name                    TEXT NOT NULL DEFAULT '',
    warranty_period                 INTEGER,                             -- En días
    warranty_expiration             TEXT,
    priority                        priority_level NOT NULL DEFAULT 'Media',
    is_under_warranty_review        BOOLEAN DEFAULT FALSE,
    warranty_jobs                   JSONB DEFAULT '[]'::jsonb,           -- Array de WarrantyJob
    warranty_start_time             TEXT,
    warranty_end_time               TEXT,
    closing_data                    JSONB,                               -- Objeto closingData
    warranty_notification_sent      BOOLEAN DEFAULT FALSE,
    last_updated_by                 TEXT,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_orders_number_company UNIQUE (order_number, company_id)
);

CREATE INDEX idx_orders_company ON orders(company_id);
CREATE INDEX idx_orders_client ON orders(client_id);
CREATE INDEX idx_orders_technician ON orders(technician_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_scheduled_date ON orders(scheduled_date);
CREATE INDEX idx_orders_priority ON orders(priority);
CREATE INDEX idx_orders_warranty ON orders(is_under_warranty_review) WHERE is_under_warranty_review = TRUE;

-- =============================================================================
-- TABLA: equipment_orders (relación M:N entre equipment y orders)
-- =============================================================================
CREATE TABLE equipment_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id    UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_equipment_order UNIQUE (equipment_id, order_id)
);

CREATE INDEX idx_equipment_orders_equipment ON equipment_orders(equipment_id);
CREATE INDEX idx_equipment_orders_order ON equipment_orders(order_id);

-- =============================================================================
-- TABLA: tasks
-- =============================================================================
CREATE TABLE tasks (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title                           TEXT NOT NULL,
    completed                       BOOLEAN NOT NULL DEFAULT FALSE,
    important                       BOOLEAN NOT NULL DEFAULT FALSE,
    due_date                        TEXT,                                -- ISO date string
    reminder                        TEXT,
    repeat                          TEXT,
    category                        TEXT,
    note                            TEXT,
    files                           JSONB DEFAULT '[]'::jsonb,           -- Array de URLs
    assigned_to                     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by                      UUID REFERENCES users(id) ON DELETE SET NULL,
    participants                    JSONB DEFAULT '[]'::jsonb,           -- Array de userIds (desnormalizado)
    reminder_notification_sent      BOOLEAN DEFAULT FALSE,
    due_date_notification_sent      BOOLEAN DEFAULT FALSE,
    completed_at                    TEXT,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_company ON tasks(company_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_tasks_completed ON tasks(completed);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);

-- =============================================================================
-- TABLA: task_participants (relación M:N evitando JSONB para queries eficientes)
-- =============================================================================
CREATE TABLE task_participants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_task_participant UNIQUE (task_id, user_id)
);

CREATE INDEX idx_task_participants_task ON task_participants(task_id);
CREATE INDEX idx_task_participants_user ON task_participants(user_id);

-- =============================================================================
-- TABLA: notifications
-- =============================================================================
CREATE TYPE notification_type AS ENUM (
    'info',
    'alert',
    'success'
);

CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    text        TEXT NOT NULL,                            -- Texto corto para UI
    time_ago    TEXT,                                     -- Cache para mostrar en UI
    read        BOOLEAN NOT NULL DEFAULT FALSE,
    type        notification_type NOT NULL DEFAULT 'info',
    path        TEXT,                                     -- Deep-link path
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_company ON notifications(company_id);
CREATE INDEX idx_notifications_read ON notifications(read) WHERE read = FALSE;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- =============================================================================
-- FUNCIÓN: actualizar updated_at automáticamente
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- POLÍTICAS RLS (Row Level Security)
-- =============================================================================
-- NOTA: Las políticas se refinan cuando la migración de Auth esté completa.
-- Por ahora, habilitamos RLS con políticas básicas.

-- Habilitar RLS en todas las tablas
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Políticas base: los usuarios ven solo datos de su compañía
-- El company_id se extrae del JWT (claim de Supabase Auth)

-- companies: cualquiera autenticado puede ver su compañía
CREATE POLICY "users_can_view_own_company" ON companies
    FOR SELECT USING (
        id = (SELECT company_id FROM users WHERE supabase_auth_id = auth.uid() LIMIT 1)
    );

-- users: los usuarios ven usuarios de su compañía
CREATE POLICY "users_view_same_company" ON users
    FOR SELECT USING (
        company_id = (SELECT company_id FROM users WHERE supabase_auth_id = auth.uid() LIMIT 1)
    );

-- clients: misma compañía
CREATE POLICY "clients_view_same_company" ON clients
    FOR SELECT USING (
        company_id = (SELECT company_id FROM users WHERE supabase_auth_id = auth.uid() LIMIT 1)
    );

-- equipment: misma compañía
CREATE POLICY "equipment_view_same_company" ON equipment
    FOR SELECT USING (
        company_id = (SELECT company_id FROM users WHERE supabase_auth_id = auth.uid() LIMIT 1)
    );

-- orders: misma compañía
CREATE POLICY "orders_view_same_company" ON orders
    FOR SELECT USING (
        company_id = (SELECT company_id FROM users WHERE supabase_auth_id = auth.uid() LIMIT 1)
    );

-- tasks: misma compañía
CREATE POLICY "tasks_view_same_company" ON tasks
    FOR SELECT USING (
        company_id = (SELECT company_id FROM users WHERE supabase_auth_id = auth.uid() LIMIT 1)
    );

-- notifications: el usuario solo ve sus propias notificaciones
CREATE POLICY "notifications_view_own" ON notifications
    FOR SELECT USING (
        user_id = (SELECT id FROM users WHERE supabase_auth_id = auth.uid() LIMIT 1)
    );

-- equipment_orders: a través de orders (company_id)
CREATE POLICY "equipment_orders_view_same_company" ON equipment_orders
    FOR SELECT USING (
        order_id IN (SELECT id FROM orders WHERE company_id = (
            SELECT company_id FROM users WHERE supabase_auth_id = auth.uid() LIMIT 1
        ))
    );

-- task_participants: a través de tasks (company_id)
CREATE POLICY "task_participants_view_same_company" ON task_participants
    FOR SELECT USING (
        task_id IN (SELECT id FROM tasks WHERE company_id = (
            SELECT company_id FROM users WHERE supabase_auth_id = auth.uid() LIMIT 1
        ))
    );