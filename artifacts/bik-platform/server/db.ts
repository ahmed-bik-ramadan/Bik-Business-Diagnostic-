import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

export interface AdminUser { id: string; username: string; password_hash: string; role: 'superadmin' | 'editor' | 'viewer'; created_at: string; updated_at: string; }
export interface DiagnosticSessionRow { session_id: string; ownership_hash: string; question_history: any[]; sector_l1: string | null; sector_l2: string | null; diagnostic_depth: string; intake_answers: Record<string, any>; universal_answers: Record<string, any>; sector_answers: Record<string, any>; status: 'in_progress' | 'completed'; created_at: string; updated_at: string; }
export interface DiagnosticReportRow { id: string; session_id: string; report_payload?: any; overall_score: number; health_label: string; headline_diagnosis: string; axis_scores: Record<string, any>; axis_details: Record<string, any>; swot_matrix: Record<string, any>; blind_spots: any[]; priority_actions: any[]; closing_question: string | null; sector_insight: string | null; financial_impact?: any; confidence?: string; coverage?: number; diagnostic_engine_version?: string; taxonomy_version?: string; scoring_version?: string; financial_model_version?: string; engine_metadata?: any; diagnostic_findings?: any; evidence?: any[]; created_at: string; }
export interface LeadRow { id: string; session_id: string | null; name: string; company_name: string; whatsapp_number: string; sector_l1: string | null; sector_l2: string | null; country: string | null; city: string | null; status: 'new' | 'contacted' | 'in_progress' | 'closed' | 'archived'; proposal_text: string | null; created_at: string; updated_at: string; report?: DiagnosticReportRow | null; notes?: any[]; status_history?: any[]; }

let pool: Pool | null = null;
let storageMode: 'managed_database' | 'local_fallback' | 'unconfigured_production' | 'session_only' = 'session_only';
let productionConfigError: string | null = null;
let databaseStatus = { configured: false, reachable: false, migrated: false };
const localSessions = new Map<string, DiagnosticSessionRow>();
const localReports = new Map<string, DiagnosticReportRow>();
const localLeads = new Map<string, LeadRow>();
const localAdmins = new Map<string, AdminUser>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
let pendingSetupToken: string | null = null;
const FUNNEL_EVENT_NAMES = new Set([
  'session_started', 'sector_selected', 'question_shown', 'answer_saved',
  'diagnostic_completed', 'report_generated', 'lead_gate_opened',
  'lead_save_succeeded', 'lead_save_temporary', 'report_viewed', 'report_copied',
  'whatsapp_part_opened', 'contact_intent', 'contract_recorded_manually',
  'diagnostic_abandoned', 'abandonment_reason_submitted', 'report_feedback_submitted',
  'page_view', 'search_sector_selected', 'sector_l1_selected', 'sector_l2_selected',
  'diagnostic_depth_selected', 'intake_completed', 'lead_gate_submit', 'consultant_chat_message'
]);
export function isAllowedFunnelEvent(name: string): boolean { return FUNNEL_EVENT_NAMES.has(name); }

const nowIso = () => new Date().toISOString();
const jsonEncode = (value: unknown) => JSON.stringify(value ?? {});
function jsonDecode<T>(value: unknown, fallback: T): T { if (value === null || value === undefined || value === '') return fallback; if (typeof value === 'object') return value as T; try { return JSON.parse(String(value)) as T; } catch { return fallback; } }
function sanitizeDbError(err: any): string { const raw = err?.message || String(err || 'Database operation failed'); return raw.replace(/mysql(?:2)?:\/\/[^@\s]+@[^\s/]+/gi, 'mysql://***:***@***').replace(/password\s*=\s*[^\s;]+/gi, 'password=***'); }
export { sanitizeDbError };
export type StorageMode = 'managed_database' | 'local_fallback' | 'unconfigured_production' | 'session_only';
export function getStorageMode(): StorageMode { return storageMode; }
export function getProductionConfigError(): string | null { return productionConfigError; }
export function isProductionStorageBlocked(): boolean { return storageMode !== 'managed_database'; }
export function getDatabaseStatus() { return { ...databaseStatus }; }
export function hashSecret(secret: string): string { return crypto.createHash('sha256').update(secret).digest('hex'); }

async function exec(sql: string, params: any[] = []) {
  if (!pool) throw new Error('Managed database is not connected');
  return pool.query(pool.format(sql, params));
}

async function ensureSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS bik_diagnostic_sessions (session_id VARCHAR(96) PRIMARY KEY, ownership_hash VARCHAR(128) NOT NULL, question_history LONGTEXT, sector_l1 VARCHAR(255), sector_l2 VARCHAR(255), diagnostic_depth VARCHAR(32) NOT NULL DEFAULT 'quick', intake_answers LONGTEXT, universal_answers LONGTEXT, sector_answers LONGTEXT, status VARCHAR(32) NOT NULL DEFAULT 'in_progress', created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL, INDEX idx_bik_sessions_updated (updated_at))`,
    `CREATE TABLE IF NOT EXISTS bik_diagnostic_reports (id VARCHAR(128) PRIMARY KEY, session_id VARCHAR(96) NOT NULL UNIQUE, overall_score DECIMAL(7,2) NOT NULL, health_label VARCHAR(255) NOT NULL, headline_diagnosis TEXT NOT NULL, axis_scores LONGTEXT, axis_details LONGTEXT, swot_matrix LONGTEXT, blind_spots LONGTEXT, priority_actions LONGTEXT, closing_question TEXT, sector_insight TEXT, financial_impact LONGTEXT, confidence VARCHAR(64), coverage DECIMAL(7,2), diagnostic_engine_version VARCHAR(64), taxonomy_version VARCHAR(64), scoring_version VARCHAR(64), financial_model_version VARCHAR(64), engine_metadata LONGTEXT, diagnostic_findings LONGTEXT, evidence LONGTEXT, report_payload LONGTEXT, created_at DATETIME(3) NOT NULL, INDEX idx_bik_reports_session (session_id))`,
    `CREATE TABLE IF NOT EXISTS bik_leads (id VARCHAR(128) PRIMARY KEY, session_id VARCHAR(96), name VARCHAR(255) NOT NULL, company_name VARCHAR(255) NOT NULL, whatsapp_number VARCHAR(64) NOT NULL, sector_l1 VARCHAR(255), sector_l2 VARCHAR(255), country VARCHAR(128), city VARCHAR(128), status VARCHAR(32) NOT NULL DEFAULT 'new', proposal_text TEXT, created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL, INDEX idx_bik_leads_status (status), INDEX idx_bik_leads_created (created_at))`,
    `CREATE TABLE IF NOT EXISTS bik_admin_users (id VARCHAR(128) PRIMARY KEY, username VARCHAR(64) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, role VARCHAR(32) NOT NULL DEFAULT 'editor', created_at DATETIME(3) NOT NULL, updated_at DATETIME(3) NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS bik_admin_sessions (token_hash VARCHAR(128) PRIMARY KEY, user_id VARCHAR(128) NOT NULL, expires_at DATETIME(3) NOT NULL, created_at DATETIME(3) NOT NULL, INDEX idx_bik_admin_sessions_expiry (expires_at))`,
    `CREATE TABLE IF NOT EXISTS bik_admin_notes (id VARCHAR(128) PRIMARY KEY, lead_id VARCHAR(128) NOT NULL, author_id VARCHAR(128), author_name VARCHAR(255), note_text TEXT NOT NULL, created_at DATETIME(3) NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS bik_admin_audit (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(128), username_attempted VARCHAR(64), ip_address VARCHAR(128), action_type VARCHAR(64), details TEXT, created_at DATETIME(3) NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS bik_funnel_events (id BIGINT AUTO_INCREMENT PRIMARY KEY, session_id VARCHAR(96) NOT NULL, event_name VARCHAR(64) NOT NULL, event_data LONGTEXT, device_class VARCHAR(24), created_at DATETIME(3) NOT NULL, INDEX idx_bik_events_name_created (event_name, created_at), INDEX idx_bik_events_session (session_id))`
  ];
  for (const statement of statements) await exec(statement);
  try { await exec('ALTER TABLE bik_diagnostic_sessions ADD COLUMN question_history LONGTEXT'); } catch { /* column already exists */ }
  try { await exec('ALTER TABLE bik_diagnostic_reports ADD COLUMN report_payload LONGTEXT'); } catch { /* column already exists */ }
}

export async function recordFunnelEvent(sessionId: string, eventName: string, eventData: Record<string, unknown> = {}, deviceClass?: string): Promise<boolean> {
  if (storageMode === 'session_only') return false;
  if (!sessionId || !isAllowedFunnelEvent(eventName)) return false;
  const safeData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(eventData)) {
    if (/name|phone|whatsapp|email|answer|raw|report|message|company/i.test(key)) continue;
    if (typeof value === 'string' && value.length > 120) continue;
    if (['string', 'number', 'boolean'].includes(typeof value) || value === null) safeData[key] = value;
  }
  const row = { session_id: sessionId.slice(0, 96), event_name: eventName, event_data: safeData, device_class: deviceClass?.slice(0, 24) || null, created_at: nowIso() };
  if (storageMode !== 'managed_database') return true;
  await exec('INSERT INTO bik_funnel_events (session_id, event_name, event_data, device_class, created_at) VALUES (?, ?, ?, ?, ?)', [row.session_id, row.event_name, jsonEncode(row.event_data), row.device_class, row.created_at]);
  return true;
}

export async function initDatabase(): Promise<{ mode: StorageMode; error?: string }> {
  pool = null;
  storageMode = 'session_only';
  productionConfigError = null;
  databaseStatus = { configured: false, reachable: false, migrated: false };
  pendingSetupToken = null;
  return { mode: storageMode };
}

function sessionFromRow(row: any): DiagnosticSessionRow { return { ...row, question_history: jsonDecode(row.question_history, []), intake_answers: jsonDecode(row.intake_answers, {}), universal_answers: jsonDecode(row.universal_answers, {}), sector_answers: jsonDecode(row.sector_answers, {}) }; }
function reportFromRow(row: any): DiagnosticReportRow { return { ...row, overall_score: Number(row.overall_score), coverage: row.coverage === null ? undefined : Number(row.coverage), axis_scores: jsonDecode(row.axis_scores, {}), axis_details: jsonDecode(row.axis_details, {}), swot_matrix: jsonDecode(row.swot_matrix, {}), blind_spots: jsonDecode(row.blind_spots, []), priority_actions: jsonDecode(row.priority_actions, []), financial_impact: jsonDecode(row.financial_impact, undefined), report_payload: jsonDecode(row.report_payload, undefined), engine_metadata: jsonDecode(row.engine_metadata, undefined), diagnostic_findings: jsonDecode(row.diagnostic_findings, undefined), evidence: jsonDecode(row.evidence, []) }; }

export async function createDiagnosticSession(sessionId: string, ownershipToken: string): Promise<DiagnosticSessionRow> {
  if (storageMode === 'session_only') throw new Error('Server-side session storage is disabled');
  const row: DiagnosticSessionRow = { session_id: sessionId, ownership_hash: hashSecret(ownershipToken), question_history: [], sector_l1: null, sector_l2: null, diagnostic_depth: 'quick', intake_answers: {}, universal_answers: {}, sector_answers: {}, status: 'in_progress', created_at: nowIso(), updated_at: nowIso() };
  if (storageMode !== 'managed_database') {
    const existing = localSessions.get(sessionId);
    return existing || (localSessions.set(sessionId, row), row);
  }
  const existing = await getDiagnosticSession(sessionId);
  if (existing) return existing;
  await exec(`INSERT INTO bik_diagnostic_sessions (session_id, ownership_hash, question_history, diagnostic_depth, intake_answers, universal_answers, sector_answers, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [row.session_id, row.ownership_hash, jsonEncode(row.question_history), row.diagnostic_depth, jsonEncode(row.intake_answers), jsonEncode(row.universal_answers), jsonEncode(row.sector_answers), row.status, row.created_at, row.updated_at]);
  return row;
}
export async function getDiagnosticSession(sessionId: string): Promise<DiagnosticSessionRow | null> { if (storageMode === 'session_only') return null; if (storageMode !== 'managed_database') return localSessions.get(sessionId) || null; const [rows] = await exec('SELECT * FROM bik_diagnostic_sessions WHERE session_id = ?', [sessionId]) as any; return rows.length ? sessionFromRow(rows[0]) : null; }
export async function updateSessionAnswers(sessionId: string, data: any): Promise<boolean> { if (storageMode === 'session_only') return false; const current = await getDiagnosticSession(sessionId); if (!current) return false; const merged = { ...current, question_history: data.questionHistory !== undefined ? data.questionHistory : current.question_history, sector_l1: data.sectorL1 ?? current.sector_l1, sector_l2: data.sectorL2 ?? current.sector_l2, diagnostic_depth: data.diagnosticDepth ?? current.diagnostic_depth, intake_answers: { ...current.intake_answers, ...(data.intakeAnswers || {}) }, universal_answers: { ...current.universal_answers, ...(data.universalAnswers || {}) }, sector_answers: { ...current.sector_answers, ...(data.sectorAnswers || {}) }, updated_at: nowIso() }; if (storageMode !== 'managed_database') { localSessions.set(sessionId, merged); return true; } await exec('UPDATE bik_diagnostic_sessions SET question_history=?, sector_l1=?, sector_l2=?, diagnostic_depth=?, intake_answers=?, universal_answers=?, sector_answers=?, updated_at=? WHERE session_id=?', [jsonEncode(merged.question_history), merged.sector_l1, merged.sector_l2, merged.diagnostic_depth, jsonEncode(merged.intake_answers), jsonEncode(merged.universal_answers), jsonEncode(merged.sector_answers), merged.updated_at, sessionId]); return true; }

export async function saveDiagnosticReport(data: any): Promise<DiagnosticReportRow> { if (storageMode === 'session_only') throw new Error('Server-side report storage is disabled'); const id = data.id || `report-${data.sessionId}`; const created = nowIso(); const row: DiagnosticReportRow = { id, session_id: data.sessionId ?? '', overall_score: data.overallScore ?? 0, health_label: data.healthLabel ?? '', headline_diagnosis: data.headlineDiagnosis ?? '', axis_scores: data.axisScores || {}, axis_details: data.axisDetails || {}, swot_matrix: data.swotMatrix || {}, blind_spots: data.blindSpots || [], priority_actions: data.priorityActions || [], closing_question: data.closingQuestion || null, sector_insight: data.sectorInsight || null, financial_impact: data.financialImpact, report_payload: data.reportPayload, confidence: data.confidence ?? null, coverage: data.coverage ?? null, diagnostic_engine_version: data.diagnosticEngineVersion ?? null, taxonomy_version: data.taxonomyVersion ?? null, scoring_version: data.scoringVersion ?? null, financial_model_version: data.financialModelVersion ?? null, engine_metadata: data.engineMetadata, diagnostic_findings: data.diagnosticFindings, evidence: data.evidence || [], created_at: created }; if (storageMode !== 'managed_database') { localReports.set(row.session_id, row); return row; } await exec(`INSERT INTO bik_diagnostic_reports (id, session_id, overall_score, health_label, headline_diagnosis, axis_scores, axis_details, swot_matrix, blind_spots, priority_actions, closing_question, sector_insight, financial_impact, confidence, coverage, diagnostic_engine_version, taxonomy_version, scoring_version, financial_model_version, engine_metadata, diagnostic_findings, evidence, report_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE overall_score=VALUES(overall_score), health_label=VALUES(health_label), headline_diagnosis=VALUES(headline_diagnosis), axis_scores=VALUES(axis_scores), axis_details=VALUES(axis_details), swot_matrix=VALUES(swot_matrix), blind_spots=VALUES(blind_spots), priority_actions=VALUES(priority_actions), closing_question=VALUES(closing_question), sector_insight=VALUES(sector_insight), financial_impact=VALUES(financial_impact), confidence=VALUES(confidence), coverage=VALUES(coverage), engine_metadata=VALUES(engine_metadata), diagnostic_findings=VALUES(diagnostic_findings), evidence=VALUES(evidence), report_payload=VALUES(report_payload)`, [row.id, row.session_id, row.overall_score, row.health_label, row.headline_diagnosis, jsonEncode(row.axis_scores), jsonEncode(row.axis_details), jsonEncode(row.swot_matrix), jsonEncode(row.blind_spots), jsonEncode(row.priority_actions), row.closing_question, row.sector_insight, jsonEncode(row.financial_impact), row.confidence || null, row.coverage ?? null, row.diagnostic_engine_version || null, row.taxonomy_version || null, row.scoring_version || null, row.financial_model_version || null, jsonEncode(row.engine_metadata), jsonEncode(row.diagnostic_findings), jsonEncode(row.evidence), jsonEncode(row.report_payload), row.created_at]); return row; }
export async function getDiagnosticReportBySession(sessionId: string): Promise<DiagnosticReportRow | null> { if (storageMode !== 'managed_database') return localReports.get(sessionId) || null; const [rows] = await exec('SELECT * FROM bik_diagnostic_reports WHERE session_id = ?', [sessionId]) as any; return rows.length ? reportFromRow(rows[0]) : null; }

export async function saveLeadRecord(data: any): Promise<LeadRow> { if (storageMode === 'session_only') throw new Error('Server-side lead storage is disabled'); const id = `lead-${crypto.randomUUID()}`; const now = nowIso(); const row: LeadRow = { id, session_id: data.sessionId || null, name: data.name, company_name: data.companyName, whatsapp_number: data.whatsappNumber, sector_l1: data.sectorL1 || null, sector_l2: data.sectorL2 || null, country: data.country || null, city: data.city || null, status: 'new', proposal_text: null, created_at: now, updated_at: now }; if (storageMode !== 'managed_database') { localLeads.set(id, row); return row; } await exec('INSERT INTO bik_leads (id, session_id, name, company_name, whatsapp_number, sector_l1, sector_l2, country, city, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [row.id, row.session_id, row.name, row.company_name, row.whatsapp_number, row.sector_l1, row.sector_l2, row.country, row.city, row.status, now, now]); return row; }

export function isAdminSetupRequired(): boolean { return pendingSetupToken !== null; }
export async function executeFirstRunAdminSetup(setupToken: string, username: string, password: string): Promise<AdminUser> { if (!pendingSetupToken || setupToken !== pendingSetupToken) throw new Error('رمز التهيئة الأولي غير صحيح'); if (!/^[a-zA-Z0-9_-]{4,32}$/.test(username)) throw new Error('اسم المستخدم غير صالح'); if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) throw new Error('كلمة المرور ضعيفة'); const user: AdminUser = { id: crypto.randomUUID(), username, password_hash: await bcrypt.hash(password, 12), role: 'superadmin', created_at: nowIso(), updated_at: nowIso() }; if (storageMode === 'managed_database') await exec('INSERT INTO bik_admin_users (id, username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [user.id, user.username, user.password_hash, user.role, user.created_at, user.updated_at]); else localAdmins.set(username, user); pendingSetupToken = null; return user; }
export function checkLoginRateLimit(key: string) { const item = loginAttempts.get(key); if (!item || item.resetAt < Date.now()) return { allowed: true, waitSeconds: 0 }; return item.count >= 5 ? { allowed: false, waitSeconds: Math.ceil((item.resetAt-Date.now())/1000) } : { allowed: true, waitSeconds: 0 }; }
export function recordFailedLogin(key: string) { const current = loginAttempts.get(key); const next = { count: (current?.count || 0)+1, resetAt: current && current.resetAt > Date.now() ? current.resetAt : Date.now()+15*60*1000 }; loginAttempts.set(key,next); return { locked: next.count >= 5, waitSeconds: Math.ceil((next.resetAt-Date.now())/1000) }; }

// Compatibility exports for the starter WebDev auth layer; BIK uses its own admin/session API.
export async function upsertUser(_user: any): Promise<void> { return; }
export async function getUserByOpenId(_openId: string): Promise<any> { return undefined; }
