-- =============================================================================
-- NavTicket - Migración 005: Módulo de Contabilidad
-- =============================================================================
-- Tablas para el módulo Accounting (reemplaza colecciones de Firestore:
-- transactions, expenses, incomes)
-- =============================================================================

-- =============================================================================
-- TABLA: accounting_transactions
-- =============================================================================
CREATE TABLE accounting_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sender_id           TEXT NOT NULL,
    sender_name         TEXT NOT NULL,
    recipient_id        TEXT NOT NULL,
    recipient_name      TEXT NOT NULL,
    amount              DOUBLE PRECISION NOT NULL,
    concept             TEXT NOT NULL,
    method              TEXT NOT NULL DEFAULT 'Efectivo' CHECK (method IN ('Efectivo', 'Transferencia')),
    transaction_group_id TEXT,
    is_annulment        BOOLEAN DEFAULT FALSE,
    related_movement_id TEXT,
    annulment_reason    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_positive_amount CHECK (amount > 0)
);

CREATE INDEX idx_accounting_trans_company ON accounting_transactions(company_id);
CREATE INDEX idx_accounting_trans_sender ON accounting_transactions(sender_id);
CREATE INDEX idx_accounting_trans_recipient ON accounting_transactions(recipient_id);

-- =============================================================================
-- TABLA: accounting_expenses
-- =============================================================================
CREATE TABLE accounting_expenses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id             TEXT NOT NULL,
    user_name           TEXT NOT NULL,
    concept             TEXT NOT NULL,
    amount              DOUBLE PRECISION NOT NULL,
    origin              TEXT NOT NULL DEFAULT 'Efectivo' CHECK (origin IN ('Efectivo', 'Transferencia')),
    order_id            TEXT,
    is_annulment        BOOLEAN DEFAULT FALSE,
    related_movement_id TEXT,
    annulment_reason    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_positive_expense CHECK (amount > 0)
);

CREATE INDEX idx_accounting_exp_company ON accounting_expenses(company_id);
CREATE INDEX idx_accounting_exp_user ON accounting_expenses(user_id);

-- =============================================================================
-- TABLA: accounting_incomes
-- =============================================================================
CREATE TABLE accounting_incomes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id             TEXT NOT NULL,
    user_name           TEXT NOT NULL,
    concept             TEXT NOT NULL,
    amount              DOUBLE PRECISION NOT NULL,
    origin              TEXT NOT NULL DEFAULT 'Efectivo' CHECK (origin IN ('Efectivo', 'Transferencia')),
    is_annulment        BOOLEAN DEFAULT FALSE,
    related_movement_id TEXT,
    annulment_reason    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_positive_income CHECK (amount > 0)
);

CREATE INDEX idx_accounting_inc_company ON accounting_incomes(company_id);
CREATE INDEX idx_accounting_inc_user ON accounting_incomes(user_id);