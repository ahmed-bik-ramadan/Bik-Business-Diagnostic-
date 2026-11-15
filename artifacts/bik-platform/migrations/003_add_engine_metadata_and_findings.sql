-- PostgreSQL Migration: 003_add_engine_metadata_and_findings.sql
-- BIK Business Intelligence & Knowledge
-- Adds engine metadata, diagnostic findings, and evidence JSONB columns to diagnostic reports table.

ALTER TABLE diagnostic_reports
    ADD COLUMN IF NOT EXISTS engine_metadata JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS diagnostic_findings JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_reports_engine_version ON diagnostic_reports(diagnostic_engine_version);
