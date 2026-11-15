-- PostgreSQL Migration: 002_add_financial_impact_and_versions.sql
-- BIK Business Intelligence & Knowledge
-- Adds financial impact metrics, confidence, data coverage, and engine version metadata to diagnostic reports.

ALTER TABLE diagnostic_reports
    ADD COLUMN IF NOT EXISTS financial_impact JSONB,
    ADD COLUMN IF NOT EXISTS confidence VARCHAR(20) DEFAULT 'متوسط',
    ADD COLUMN IF NOT EXISTS coverage NUMERIC(5,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS diagnostic_engine_version VARCHAR(20) DEFAULT '2.0.0',
    ADD COLUMN IF NOT EXISTS taxonomy_version VARCHAR(20) DEFAULT '2.0.0',
    ADD COLUMN IF NOT EXISTS scoring_version VARCHAR(20) DEFAULT '2.0.0',
    ADD COLUMN IF NOT EXISTS financial_model_version VARCHAR(20) DEFAULT '2.0.0';

CREATE INDEX IF NOT EXISTS idx_reports_confidence ON diagnostic_reports(confidence);
