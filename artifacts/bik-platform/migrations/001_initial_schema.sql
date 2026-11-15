-- PostgreSQL Migration: 001_initial_schema.sql
-- BIK Business Intelligence & Knowledge Self-Hosted Schema
-- Enables pgcrypto for UUID generation if needed

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 0. Schema Migrations Table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT,
    executed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations(version);

-- 1. Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('superadmin', 'editor', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Diagnostic Sessions Table (Primary session entity)
CREATE TABLE IF NOT EXISTS diagnostic_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ownership_hash VARCHAR(128) NOT NULL,
    sector_l1 VARCHAR(100),
    sector_l2 VARCHAR(100),
    diagnostic_depth VARCHAR(20) DEFAULT 'quick',
    intake_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    universal_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    sector_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Diagnostic Reports Table (Direct 1-to-1 relationship with diagnostic_sessions)
CREATE TABLE IF NOT EXISTS diagnostic_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID UNIQUE NOT NULL,
    overall_score INT NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
    health_label VARCHAR(50) NOT NULL,
    headline_diagnosis TEXT NOT NULL,
    axis_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
    axis_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    swot_matrix JSONB NOT NULL DEFAULT '{"strengths":[],"weaknesses":[],"opportunities":[],"threats":[]}'::jsonb,
    blind_spots JSONB NOT NULL DEFAULT '[]'::jsonb,
    priority_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    closing_question TEXT,
    sector_insight TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_report_session FOREIGN KEY (session_id) 
        REFERENCES diagnostic_sessions(session_id) ON DELETE CASCADE
);

-- 4. Leads Table (Optional relationship with diagnostic_sessions)
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID UNIQUE,
    name VARCHAR(150) NOT NULL,
    company_name VARCHAR(150) NOT NULL,
    whatsapp_number VARCHAR(30) NOT NULL,
    sector_l1 VARCHAR(100),
    sector_l2 VARCHAR(100),
    country VARCHAR(100),
    city VARCHAR(100),
    status VARCHAR(30) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'in_progress', 'closed', 'archived')),
    proposal_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lead_session FOREIGN KEY (session_id) 
        REFERENCES diagnostic_sessions(session_id) ON DELETE SET NULL
);

-- 5. Privacy Consents Table
CREATE TABLE IF NOT EXISTS privacy_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL,
    consented BOOLEAN NOT NULL DEFAULT TRUE CHECK (consented = TRUE),
    purpose TEXT NOT NULL,
    ip_address VARCHAR(45),
    consented_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_consent_lead FOREIGN KEY (lead_id) 
        REFERENCES leads(id) ON DELETE CASCADE
);

-- 6. Admin Sessions Table (Cookie-backed HttpOnly session store)
CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash VARCHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL
);

-- 7. Admin Notes Table
CREATE TABLE IF NOT EXISTS admin_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL,
    author_id UUID,
    author_name VARCHAR(100),
    note_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_note_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    CONSTRAINT fk_note_author FOREIGN KEY (author_id) REFERENCES admin_users(id) ON DELETE SET NULL
);

-- 8. Lead Status Change History
CREATE TABLE IF NOT EXISTS lead_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL,
    changed_by UUID,
    changed_by_name VARCHAR(100),
    old_status VARCHAR(30),
    new_status VARCHAR(30) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_history_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
    CONSTRAINT fk_history_author FOREIGN KEY (changed_by) REFERENCES admin_users(id) ON DELETE SET NULL
);

-- 9. Admin Audit Logs (Security events, logins, deletions)
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID,
    username_attempted VARCHAR(50),
    ip_address VARCHAR(45),
    action_type VARCHAR(50) NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_status ON diagnostic_sessions(status);
CREATE INDEX IF NOT EXISTS idx_reports_session ON diagnostic_reports(session_id);
CREATE INDEX IF NOT EXISTS idx_leads_session ON leads(session_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_notes_lead ON admin_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_history_lead ON lead_status_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON admin_audit_logs(created_at);
