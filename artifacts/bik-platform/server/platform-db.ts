import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';

// This legacy file-backed store is disabled: it can load or write client records.
throw new Error('Legacy file-backed storage is disabled; use the stateless server.ts entry point.');

const { Pool } = pg;

export interface AdminUser {
  id: string;
  username: string;
  password_hash: string;
  role: 'superadmin' | 'editor' | 'viewer';
  created_at: string;
  updated_at: string;
}

export interface DiagnosticSessionRow {
  session_id: string;
  ownership_hash: string;
  sector_l1: string | null;
  sector_l2: string | null;
  diagnostic_depth: string;
  intake_answers: Record<string, any>;
  universal_answers: Record<string, any>;
  sector_answers: Record<string, any>;
  status: 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface DiagnosticReportRow {
  id: string;
  session_id: string;
  overall_score: number;
  health_label: string;
  headline_diagnosis: string;
  axis_scores: Record<string, any>;
  axis_details: Record<string, any>;
  swot_matrix: Record<string, any>;
  blind_spots: any[];
  priority_actions: any[];
  closing_question: string | null;
  sector_insight: string | null;
  financial_impact?: any;
  confidence?: string;
  coverage?: number;
  diagnostic_engine_version?: string;
  taxonomy_version?: string;
  scoring_version?: string;
  financial_model_version?: string;
  engine_metadata?: any;
  diagnostic_findings?: any;
  evidence?: any[];
  created_at: string;
}

export interface LeadRow {
  id: string;
  session_id: string | null;
  name: string;
  company_name: string;
  whatsapp_number: string;
  sector_l1: string | null;
  sector_l2: string | null;
  country: string | null;
  city: string | null;
  status: 'new' | 'contacted' | 'in_progress' | 'closed' | 'archived';
  proposal_text: string | null;
  created_at: string;
  updated_at: string;
  report?: DiagnosticReportRow | null;
  notes?: any[];
  status_history?: any[];
}

let pool: pg.Pool | null = null;
let useLocalFallback = false;
let productionStorageBlocked = false;
let productionConfigError: string | null = null;

export function getProductionConfigError(): string | null {
  return productionConfigError;
}

export function isProductionStorageBlocked(): boolean {
  return productionStorageBlocked;
}

function checkStorageWritable() {
  if (productionStorageBlocked) {
    throw new Error(
      `[Production Storage Error] ${productionConfigError || 'Persistent PostgreSQL database required in production.'}`
    );
  }
}

// Local persistent file store for fallback
const LOCAL_DB_PATH = path.join(process.cwd(), 'data', 'local_db.json');

interface LocalDbSchema {
  admin_users: AdminUser[];
  admin_sessions: Array<{ token_hash: string; user_id: string; expires_at: string; created_at: string }>;
  diagnostic_sessions: DiagnosticSessionRow[];
  diagnostic_reports: DiagnosticReportRow[];
  leads: LeadRow[];
  privacy_consents: Array<{ id: string; lead_id: string; consented: boolean; purpose: string; ip_address: string | null; consented_at: string }>;
  admin_notes: Array<{ id: string; lead_id: string; author_id: string | null; author_name: string | null; note_text: string; created_at: string }>;
  lead_status_history: Array<{ id: string; lead_id: string; changed_by: string | null; changed_by_name: string | null; old_status: string | null; new_status: string; changed_at: string }>;
  admin_audit_logs: Array<{ id: number; user_id: string | null; username_attempted: string | null; ip_address: string | null; action_type: string; details: string | null; created_at: string }>;
}

let memoryDb: LocalDbSchema = {
  admin_users: [],
  admin_sessions: [],
  diagnostic_sessions: [],
  diagnostic_reports: [],
  leads: [],
  privacy_consents: [],
  admin_notes: [],
  lead_status_history: [],
  admin_audit_logs: []
};

function saveLocalDb() {
  try {
    const dir = path.dirname(LOCAL_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(memoryDb, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write local database file:', err);
  }
}

function loadLocalDb() {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
      memoryDb = JSON.parse(raw);
    }
  } catch (err) {
    console.error('Failed to load local database file, using clean state:', err);
  }
}

export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

export function sanitizeDbError(err: any): string {
  if (!err) return 'Database operation failed';
  let msg = typeof err === 'string' ? err : err.message || String(err);
  msg = msg.replace(/postgres(?:ql)?:\/\/[^@\s]+@[^\s/]+/gi, 'postgresql://***:***@***');
  msg = msg.replace(/password\s*=\s*['"]?[^'"\s;]+['"]?/gi, 'password=***');
  msg = msg.replace(/user(?:name)?\s*=\s*['"]?[^'"\s;]+['"]?/gi, 'username=***');
  msg = msg.replace(/token\s*=\s*['"]?[^'"\s;]+['"]?/gi, 'token=***');
  return msg;
}

export type StorageMode = 'postgresql' | 'local_fallback' | 'unconfigured_production';

export interface DatabaseStatus {
  configured: boolean;
  reachable: boolean;
  migrated: boolean;
}

let databaseStatus: DatabaseStatus = {
  configured: false,
  reachable: false,
  migrated: false
};

export function getDatabaseStatus(): DatabaseStatus {
  return { ...databaseStatus };
}

export function setTestPool(
  testPool: pg.Pool | null,
  useFallback = false,
  statusOverride?: Partial<DatabaseStatus>
) {
  pool = testPool;
  useLocalFallback = useFallback;
  productionStorageBlocked = false;
  productionConfigError = null;
  databaseStatus = {
    configured: Boolean(testPool || (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('placeholder'))),
    reachable: Boolean(testPool),
    migrated: Boolean(testPool),
    ...statusOverride
  };
}

export function getPostgresSslConfig(databaseUrl: string): boolean | { rejectUnauthorized: boolean } | undefined {
  const sslMode = (process.env.PGSSLMODE || '').toLowerCase();
  const urlLower = databaseUrl.toLowerCase();

  if (sslMode === 'disable' || urlLower.includes('sslmode=disable')) {
    return false;
  }

  if (
    sslMode === 'require' ||
    sslMode === 'no-verify' ||
    sslMode === 'prefer' ||
    urlLower.includes('sslmode=require') ||
    urlLower.includes('sslmode=no-verify') ||
    urlLower.includes('ssl=true')
  ) {
    return { rejectUnauthorized: false };
  }

  // In production outside localhost, default to secure SSL
  if (process.env.NODE_ENV === 'production') {
    const isLocal = urlLower.includes('localhost') || urlLower.includes('127.0.0.1');
    if (!isLocal) {
      return { rejectUnauthorized: false };
    }
  }

  return undefined;
}

export async function verifyMigrationState(clientOrPool: pg.Pool | pg.PoolClient): Promise<{
  allApplied: boolean;
  pendingCount: number;
  pendingFiles: string[];
}> {
  try {
    await clientOrPool.query('SELECT 1 FROM schema_migrations LIMIT 1');
  } catch {
    return { allApplied: false, pendingCount: -1, pendingFiles: ['schema_migrations_not_initialized'] };
  }

  const migrationsDir = path.join(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return { allApplied: true, pendingCount: 0, pendingFiles: [] };
  }

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const pendingFiles: string[] = [];
  for (const m of migrationFiles) {
    const checkRes = await clientOrPool.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      [m]
    );

    if (checkRes.rowCount === 0) {
      pendingFiles.push(m);
    }
  }

  return {
    allApplied: pendingFiles.length === 0,
    pendingCount: pendingFiles.length,
    pendingFiles
  };
}

export async function runMigrations(clientOrPool: pg.Pool | pg.PoolClient): Promise<string[]> {
  const executed: string[] = [];
  
  // 1. Ensure schema_migrations table exists
  try {
    await clientOrPool.query('SELECT 1 FROM schema_migrations LIMIT 1');
  } catch {
    await clientOrPool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT,
        executed_at TIMESTAMPTZ
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_schema_migrations_version ON schema_migrations (version);
    `);
  }

  const migrationsDir = path.join(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return executed;
  }

  // 2. Discover and sort migration files sequentially
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const m of migrationFiles) {
    const checkRes = await clientOrPool.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      [m]
    );

    if (checkRes.rowCount === 0) {
      const migrationPath = path.join(migrationsDir, m);
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      
      // Execute within transaction for transactional DDL
      try {
        await clientOrPool.query('BEGIN');
        await clientOrPool.query(sql);
        await clientOrPool.query(
          'INSERT INTO schema_migrations (version, executed_at) VALUES ($1, CURRENT_TIMESTAMP)',
          [m]
        );
        await clientOrPool.query('COMMIT');
        executed.push(m);
        console.log(`[DB MIGRATION] Executed ${m} migration successfully.`);
      } catch (migrationErr) {
        try {
          await clientOrPool.query('ROLLBACK');
        } catch {
          // ignore rollback failure
        }
        throw migrationErr;
      }
    }
  }

  return executed;
}

export async function initDatabase(): Promise<{ mode: StorageMode; error?: string }> {
  loadLocalDb();

  const isProduction = process.env.NODE_ENV === 'production';
  const databaseUrl = process.env.DATABASE_URL;

  const isConfigured = Boolean(databaseUrl && !databaseUrl.includes('placeholder') && databaseUrl.trim().length > 0);
  databaseStatus.configured = isConfigured;

  if (isConfigured && databaseUrl) {
    try {
      pool = new Pool({
        connectionString: databaseUrl,
        ssl: getPostgresSslConfig(databaseUrl),
        max: parseInt(process.env.PG_POOL_MAX || '10', 10),
        min: parseInt(process.env.PG_POOL_MIN || '2', 10),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        maxUses: 7500
      });

      // Handle background idle client errors gracefully to avoid node crash
      pool.on('error', (err: any) => {
        console.error('[DB POOL CLIENT ERROR]', sanitizeDbError(err));
      });

      // Test connection, verify reachability and run migrations
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        databaseStatus.reachable = true;
        console.log('[DB] Connected to PostgreSQL successfully.');

        // Verify and run migrations
        await runMigrations(client);
        
        const migrationState = await verifyMigrationState(client);
        if (!migrationState.allApplied) {
          throw new Error(`Migration verification failed. Pending migrations: ${migrationState.pendingFiles.join(', ')}`);
        }
        databaseStatus.migrated = true;
      } finally {
        client.release();
      }

      useLocalFallback = false;
      productionStorageBlocked = false;
      productionConfigError = null;
      await ensureDefaultAdmin();
      return { mode: 'postgresql' };
    } catch (err) {
      const sanitizedMsg = sanitizeDbError(err);
      databaseStatus.reachable = false;
      databaseStatus.migrated = false;

      if (isProduction) {
        productionStorageBlocked = true;
        productionConfigError = `Production PostgreSQL connection failed: ${sanitizedMsg}. Ephemeral local storage is disabled in production to prevent customer data loss.`;
        console.error(`[DB CRITICAL ERROR] ${productionConfigError}`);
        return { mode: 'unconfigured_production', error: productionConfigError };
      }

      console.warn('[DB] Could not connect to PostgreSQL in development. Falling back to local store. Error:', sanitizedMsg);
      useLocalFallback = true;
      await ensureDefaultAdmin();
      return { mode: 'local_fallback' };
    }
  } else {
    databaseStatus.reachable = false;
    databaseStatus.migrated = false;

    if (isProduction) {
      productionStorageBlocked = true;
      productionConfigError = 'DATABASE_URL environment variable is missing or unconfigured in production environment. A persistent PostgreSQL database is required in production to ensure customer data durability and multi-instance concurrency.';
      console.error(`[DB CONFIGURATION REQUIRED] ${productionConfigError}`);
      return { mode: 'unconfigured_production', error: productionConfigError };
    }

    console.log('[DB] No DATABASE_URL provided in development. Initialized with local persistent file store.');
    useLocalFallback = true;
    await ensureDefaultAdmin();
    return { mode: 'local_fallback' };
  }
}

export function getStorageMode(): StorageMode {
  if (productionStorageBlocked) {
    return 'unconfigured_production';
  }
  return useLocalFallback ? 'local_fallback' : 'postgresql';
}

let pendingSetupToken: string | null = null;

export function isAdminSetupRequired(): boolean {
  return pendingSetupToken !== null;
}

async function ensureDefaultAdmin() {
  // Check if any admin user exists
  let adminCount = 0;
  if (!useLocalFallback && pool) {
    try {
      const res = await pool.query(`SELECT COUNT(*)::int as count FROM admin_users`);
      adminCount = res.rows[0]?.count || 0;
    } catch (err) {
      console.warn('[DB] Could not query admin count:', err);
    }
  } else {
    adminCount = memoryDb.admin_users.length;
  }

  if (adminCount > 0) {
    pendingSetupToken = null;
    return; // Admin accounts already exist
  }

  // Generate cryptographically secure one-time setup token
  pendingSetupToken = crypto.randomBytes(32).toString('hex');
  console.warn('================================================================================');
  console.warn('[ADMIN SECURITY SETUP] First-run setup required: Zero admin accounts exist.');
  console.warn(`[ADMIN SECURITY SETUP] Secure One-Time Setup Token: ${pendingSetupToken}`);
  console.warn('[ADMIN SECURITY SETUP] Visit /admin in your browser to complete administrator setup.');
  console.warn('[ADMIN SECURITY SETUP] No default credentials exist. You must configure your credentials now.');
  console.warn('================================================================================');
}

export async function executeFirstRunAdminSetup(
  setupToken: string,
  newUsername: string,
  newPassword: string
): Promise<AdminUser> {
  checkStorageWritable();
  if (!pendingSetupToken) {
    throw new Error('التهيئة الأولية غير متاحة أو تم إنجازها بالفعل');
  }

  // Constant-time token verification
  const tokenBuf = Buffer.from(setupToken.trim());
  const expectedBuf = Buffer.from(pendingSetupToken);
  if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    throw new Error('رمز التهيئة الأولي غير صحيح');
  }

  // Validate username
  const trimmedUser = newUsername.trim();
  if (!/^[a-zA-Z0-9_-]{4,32}$/.test(trimmedUser)) {
    throw new Error('اسم المستخدم يجب أن يتكون من 4 إلى 32 حرفاً أو رقماً باللغة الإنجليزية');
  }

  const forbiddenNames = ['admin', 'administrator', 'root', 'bik2026', 'bik_admin'];
  if (forbiddenNames.includes(trimmedUser.toLowerCase())) {
    throw new Error('لا يمكن استخدام أسماء مستخدمين عامة أو افتراضية شائعة لأسباب أمنية');
  }

  // Validate password strength
  if (newPassword.length < 10) {
    throw new Error('كلمة المرور يجب ألا تقل عن 10 خانات');
  }
  if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    throw new Error('كلمة المرور يجب أن تحتوي على أحرف كبيرة وصغيرة وأرقام');
  }

  const saltRounds = 12;
  const passwordHash = await bcrypt.hash(newPassword, saltRounds);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();

  let createdUser: AdminUser;

  if (!useLocalFallback && pool) {
    const res = await pool.query(
      `INSERT INTO admin_users (id, username, password_hash, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING *`,
      [userId, trimmedUser, passwordHash, 'superadmin', now]
    );
    createdUser = res.rows[0];
  } else {
    createdUser = {
      id: userId,
      username: trimmedUser,
      password_hash: passwordHash,
      role: 'superadmin',
      created_at: now,
      updated_at: now
    };
    memoryDb.admin_users.push(createdUser);
    saveLocalDb();
  }

  // Invalidate setup token immediately
  pendingSetupToken = null;

  await logAdminAudit({
    userId,
    username: trimmedUser,
    action: 'FIRST_RUN_ADMIN_SETUP_COMPLETED',
    details: `Admin superuser created via secure one-time setup token.`
  });

  console.log(`[ADMIN SECURITY SETUP] First-run setup completed for superadmin: ${trimmedUser}`);
  return createdUser;
}

// ----------------- Session Methods -----------------

export async function createDiagnosticSession(sessionId: string, ownershipSecret: string): Promise<DiagnosticSessionRow> {
  checkStorageWritable();
  const ownershipHash = hashSecret(ownershipSecret);
  const now = new Date().toISOString();

  if (!useLocalFallback && pool) {
    const res = await pool.query(
      `INSERT INTO diagnostic_sessions (session_id, ownership_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $3)
       RETURNING *`,
      [sessionId, ownershipHash, now]
    );
    return res.rows[0];
  } else {
    const row: DiagnosticSessionRow = {
      session_id: sessionId,
      ownership_hash: ownershipHash,
      sector_l1: null,
      sector_l2: null,
      diagnostic_depth: 'quick',
      intake_answers: {},
      universal_answers: {},
      sector_answers: {},
      status: 'in_progress',
      created_at: now,
      updated_at: now
    };
    memoryDb.diagnostic_sessions = memoryDb.diagnostic_sessions.filter(s => s.session_id !== sessionId);
    memoryDb.diagnostic_sessions.push(row);
    saveLocalDb();
    return row;
  }
}

export async function getDiagnosticSession(sessionId: string): Promise<DiagnosticSessionRow | null> {
  if (!useLocalFallback && pool) {
    const res = await pool.query(`SELECT * FROM diagnostic_sessions WHERE session_id = $1`, [sessionId]);
    return res.rows[0] || null;
  } else {
    return memoryDb.diagnostic_sessions.find(s => s.session_id === sessionId) || null;
  }
}

export async function updateSessionAnswers(
  sessionId: string,
  data: {
    sectorL1?: string;
    sectorL2?: string;
    diagnosticDepth?: string;
    intakeAnswers?: Record<string, any>;
    universalAnswers?: Record<string, any>;
    sectorAnswers?: Record<string, any>;
  }
): Promise<boolean> {
  checkStorageWritable();
  const now = new Date().toISOString();

  if (!useLocalFallback && pool) {
    const existing = await getDiagnosticSession(sessionId);
    if (!existing) return false;

    const sectorL1 = data.sectorL1 !== undefined ? data.sectorL1 : existing.sector_l1;
    const sectorL2 = data.sectorL2 !== undefined ? data.sectorL2 : existing.sector_l2;
    const depth = data.diagnosticDepth !== undefined ? data.diagnosticDepth : existing.diagnostic_depth;
    const intake = data.intakeAnswers !== undefined ? { ...existing.intake_answers, ...data.intakeAnswers } : existing.intake_answers;
    const universal = data.universalAnswers !== undefined ? { ...existing.universal_answers, ...data.universalAnswers } : existing.universal_answers;
    const sector = data.sectorAnswers !== undefined ? { ...existing.sector_answers, ...data.sectorAnswers } : existing.sector_answers;

    await pool.query(
      `UPDATE diagnostic_sessions
       SET sector_l1 = $1, sector_l2 = $2, diagnostic_depth = $3, intake_answers = $4, universal_answers = $5, sector_answers = $6, updated_at = $7
       WHERE session_id = $8`,
      [sectorL1, sectorL2, depth, JSON.stringify(intake), JSON.stringify(universal), JSON.stringify(sector), now, sessionId]
    );
    return true;
  } else {
    const s = memoryDb.diagnostic_sessions.find(item => item.session_id === sessionId);
    if (!s) return false;

    if (data.sectorL1 !== undefined) s.sector_l1 = data.sectorL1;
    if (data.sectorL2 !== undefined) s.sector_l2 = data.sectorL2;
    if (data.diagnosticDepth !== undefined) s.diagnostic_depth = data.diagnosticDepth;
    if (data.intakeAnswers !== undefined) s.intake_answers = { ...s.intake_answers, ...data.intakeAnswers };
    if (data.universalAnswers !== undefined) s.universal_answers = { ...s.universal_answers, ...data.universalAnswers };
    if (data.sectorAnswers !== undefined) s.sector_answers = { ...s.sector_answers, ...data.sectorAnswers };
    s.updated_at = now;
    saveLocalDb();
    return true;
  }
}

// ----------------- Reports Methods -----------------

export async function saveDiagnosticReport(reportData: {
  sessionId: string;
  overallScore: number;
  healthLabel: string;
  headlineDiagnosis: string;
  axisScores: Record<string, any>;
  axisDetails: Record<string, any>;
  swotMatrix: Record<string, any>;
  blindSpots: any[];
  priorityActions: any[];
  closingQuestion?: string;
  sectorInsight?: string;
  financialImpact?: any;
  confidence?: string;
  coverage?: number;
  diagnosticEngineVersion?: string;
  taxonomyVersion?: string;
  scoringVersion?: string;
  financialModelVersion?: string;
  engineMetadata?: any;
  diagnosticFindings?: any;
  evidence?: any[];
}): Promise<DiagnosticReportRow> {
  checkStorageWritable();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const financialImpactJson = reportData.financialImpact ? JSON.stringify(reportData.financialImpact) : null;
  const confidence = reportData.confidence || 'متوسط';
  const coverage = reportData.coverage !== undefined ? reportData.coverage : 0;
  const engineVersion = reportData.diagnosticEngineVersion || '2.0.0';
  const taxonomyVersion = reportData.taxonomyVersion || '2.0.0';
  const scoringVersion = reportData.scoringVersion || '2.0.0';
  const financialModelVersion = reportData.financialModelVersion || '2.0.0';
  const engineMetadata = reportData.engineMetadata || {
    diagnosticEngineVersion: engineVersion,
    taxonomyVersion,
    scoringVersion,
    financialModelVersion
  };
  const diagnosticFindings = reportData.diagnosticFindings || null;
  const evidence = reportData.evidence || [];

  if (!useLocalFallback && pool) {
    const res = await pool.query(
      `INSERT INTO diagnostic_reports (
        id, session_id, overall_score, health_label, headline_diagnosis,
        axis_scores, axis_details, swot_matrix, blind_spots, priority_actions,
        closing_question, sector_insight, financial_impact, confidence, coverage,
        diagnostic_engine_version, taxonomy_version, scoring_version, financial_model_version,
        engine_metadata, diagnostic_findings, evidence,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      ON CONFLICT (session_id) DO UPDATE SET
        overall_score = EXCLUDED.overall_score,
        health_label = EXCLUDED.health_label,
        headline_diagnosis = EXCLUDED.headline_diagnosis,
        axis_scores = EXCLUDED.axis_scores,
        axis_details = EXCLUDED.axis_details,
        swot_matrix = EXCLUDED.swot_matrix,
        blind_spots = EXCLUDED.blind_spots,
        priority_actions = EXCLUDED.priority_actions,
        closing_question = EXCLUDED.closing_question,
        sector_insight = EXCLUDED.sector_insight,
        financial_impact = EXCLUDED.financial_impact,
        confidence = EXCLUDED.confidence,
        coverage = EXCLUDED.coverage,
        diagnostic_engine_version = EXCLUDED.diagnostic_engine_version,
        taxonomy_version = EXCLUDED.taxonomy_version,
        scoring_version = EXCLUDED.scoring_version,
        financial_model_version = EXCLUDED.financial_model_version,
        engine_metadata = EXCLUDED.engine_metadata,
        diagnostic_findings = EXCLUDED.diagnostic_findings,
        evidence = EXCLUDED.evidence
      RETURNING *`,
      [
        id,
        reportData.sessionId,
        reportData.overallScore,
        reportData.healthLabel,
        reportData.headlineDiagnosis,
        JSON.stringify(reportData.axisScores),
        JSON.stringify(reportData.axisDetails),
        JSON.stringify(reportData.swotMatrix),
        JSON.stringify(reportData.blindSpots),
        JSON.stringify(reportData.priorityActions),
        reportData.closingQuestion || null,
        reportData.sectorInsight || null,
        financialImpactJson,
        confidence,
        coverage,
        engineVersion,
        taxonomyVersion,
        scoringVersion,
        financialModelVersion,
        JSON.stringify(engineMetadata),
        diagnosticFindings ? JSON.stringify(diagnosticFindings) : null,
        JSON.stringify(evidence),
        now
      ]
    );

    await pool.query(
      `UPDATE diagnostic_sessions SET status = 'completed', updated_at = $1 WHERE session_id = $2`,
      [now, reportData.sessionId]
    );

    const saved = res.rows[0];
    if (saved && !saved.engine_metadata) {
      saved.engine_metadata = engineMetadata;
    }
    return saved;
  } else {
    const row: DiagnosticReportRow = {
      id,
      session_id: reportData.sessionId,
      overall_score: reportData.overallScore,
      health_label: reportData.healthLabel,
      headline_diagnosis: reportData.headlineDiagnosis,
      axis_scores: reportData.axisScores,
      axis_details: reportData.axisDetails,
      swot_matrix: reportData.swotMatrix,
      blind_spots: reportData.blindSpots,
      priority_actions: reportData.priorityActions,
      closing_question: reportData.closingQuestion || null,
      sector_insight: reportData.sectorInsight || null,
      financial_impact: reportData.financialImpact || null,
      confidence,
      coverage,
      diagnostic_engine_version: engineVersion,
      taxonomy_version: taxonomyVersion,
      scoring_version: scoringVersion,
      financial_model_version: financialModelVersion,
      engine_metadata: engineMetadata,
      diagnostic_findings: diagnosticFindings,
      evidence,
      created_at: now
    };

    memoryDb.diagnostic_reports = memoryDb.diagnostic_reports.filter(r => r.session_id !== reportData.sessionId);
    memoryDb.diagnostic_reports.push(row);

    const s = memoryDb.diagnostic_sessions.find(item => item.session_id === reportData.sessionId);
    if (s) {
      s.status = 'completed';
      s.updated_at = now;
    }

    saveLocalDb();
    return row;
  }
}

export async function getDiagnosticReportBySession(sessionId: string): Promise<DiagnosticReportRow | null> {
  if (!useLocalFallback && pool) {
    const res = await pool.query(`SELECT * FROM diagnostic_reports WHERE session_id = $1`, [sessionId]);
    const row = res.rows[0] || null;
    if (row && (!row.engine_metadata || Object.keys(row.engine_metadata).length === 0)) {
      row.engine_metadata = {
        diagnosticEngineVersion: row.diagnostic_engine_version || '2.0.0',
        taxonomyVersion: row.taxonomy_version || '2.0.0',
        scoringVersion: row.scoring_version || '2.0.0',
        financialModelVersion: row.financial_model_version || '2.0.0'
      };
    }
    return row;
  } else {
    const row = memoryDb.diagnostic_reports.find(r => r.session_id === sessionId) || null;
    if (row && (!row.engine_metadata || Object.keys(row.engine_metadata).length === 0)) {
      row.engine_metadata = {
        diagnosticEngineVersion: row.diagnostic_engine_version || '2.0.0',
        taxonomyVersion: row.taxonomy_version || '2.0.0',
        scoringVersion: row.scoring_version || '2.0.0',
        financialModelVersion: row.financial_model_version || '2.0.0'
      };
    }
    return row;
  }
}

// ----------------- Leads Methods -----------------

export async function saveLeadRecord(data: {
  sessionId?: string | null;
  name: string;
  companyName: string;
  whatsappNumber: string;
  sectorL1?: string | null;
  sectorL2?: string | null;
  country?: string | null;
  city?: string | null;
  privacyConsent: boolean;
  ipAddress?: string | null;
}): Promise<LeadRow> {
  checkStorageWritable();
  const leadId = crypto.randomUUID();
  const consentId = crypto.randomUUID();
  const now = new Date().toISOString();

  if (!useLocalFallback && pool) {
    const res = await pool.query(
      `INSERT INTO leads (
        id, session_id, name, company_name, whatsapp_number, sector_l1, sector_l2, country, city, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', $10, $10)
      ON CONFLICT (session_id) DO UPDATE SET
        name = EXCLUDED.name,
        company_name = EXCLUDED.company_name,
        whatsapp_number = EXCLUDED.whatsapp_number,
        sector_l1 = EXCLUDED.sector_l1,
        sector_l2 = EXCLUDED.sector_l2,
        country = EXCLUDED.country,
        city = EXCLUDED.city,
        updated_at = EXCLUDED.updated_at
      RETURNING *`,
      [
        leadId,
        data.sessionId || null,
        data.name,
        data.companyName,
        data.whatsappNumber,
        data.sectorL1 || null,
        data.sectorL2 || null,
        data.country || null,
        data.city || null,
        now
      ]
    );

    const createdLead = res.rows[0];

    await pool.query(
      `INSERT INTO privacy_consents (id, lead_id, consented, purpose, ip_address, consented_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        consentId,
        createdLead.id,
        data.privacyConsent,
        'Diagnostic report generation and optional advisory consultation',
        data.ipAddress || null,
        now
      ]
    );

    return createdLead;
  } else {
    const existingIndex = memoryDb.leads.findIndex(l => data.sessionId && l.session_id === data.sessionId);
    const row: LeadRow = {
      id: existingIndex >= 0 ? memoryDb.leads[existingIndex].id : leadId,
      session_id: data.sessionId || null,
      name: data.name,
      company_name: data.companyName,
      whatsapp_number: data.whatsappNumber,
      sector_l1: data.sectorL1 || null,
      sector_l2: data.sectorL2 || null,
      country: data.country || null,
      city: data.city || null,
      status: existingIndex >= 0 ? memoryDb.leads[existingIndex].status : 'new',
      proposal_text: existingIndex >= 0 ? memoryDb.leads[existingIndex].proposal_text : null,
      created_at: existingIndex >= 0 ? memoryDb.leads[existingIndex].created_at : now,
      updated_at: now
    };

    if (existingIndex >= 0) {
      memoryDb.leads[existingIndex] = row;
    } else {
      memoryDb.leads.push(row);
    }

    memoryDb.privacy_consents.push({
      id: consentId,
      lead_id: row.id,
      consented: data.privacyConsent,
      purpose: 'Diagnostic report generation and optional advisory consultation',
      ip_address: data.ipAddress || null,
      consented_at: now
    });

    saveLocalDb();
    return row;
  }
}

export async function getAllLeadsAdmin(filters: {
  search?: string;
  status?: string;
  sector?: string;
  page?: number;
  limit?: number;
}): Promise<{ leads: LeadRow[]; total: number }> {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 50));
  const offset = (page - 1) * limit;

  if (!useLocalFallback && pool) {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let pIdx = 1;

    if (filters.status && filters.status !== 'الكل') {
      whereClause += ` AND l.status = $${pIdx++}`;
      params.push(filters.status);
    }

    if (filters.sector && filters.sector !== 'الكل') {
      whereClause += ` AND l.sector_l2 = $${pIdx++}`;
      params.push(filters.sector);
    }

    if (filters.search) {
      whereClause += ` AND (l.name ILIKE $${pIdx} OR l.company_name ILIKE $${pIdx} OR l.whatsapp_number ILIKE $${pIdx})`;
      params.push(`%${filters.search}%`);
      pIdx++;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM leads l ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const query = `
      SELECT l.*,
             row_to_json(r.*) as report
      FROM leads l
      LEFT JOIN diagnostic_reports r ON l.session_id = r.session_id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;
    params.push(limit, offset);

    const res = await pool.query(query, params);
    return { leads: res.rows, total };
  } else {
    let filtered = [...memoryDb.leads];

    if (filters.status && filters.status !== 'الكل') {
      filtered = filtered.filter(l => l.status === filters.status);
    }
    if (filters.sector && filters.sector !== 'الكل') {
      filtered = filtered.filter(l => l.sector_l2 === filters.sector);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      filtered = filtered.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.company_name.toLowerCase().includes(q) ||
        l.whatsapp_number.includes(q)
      );
    }

    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit).map(l => {
      const report = memoryDb.diagnostic_reports.find(r => r.session_id === l.session_id) || null;
      return { ...l, report };
    });

    return { leads: paginated, total };
  }
}

export async function getLeadDetailsById(id: string): Promise<LeadRow | null> {
  if (!useLocalFallback && pool) {
    const res = await pool.query(
      `SELECT l.*, row_to_json(r.*) as report
       FROM leads l
       LEFT JOIN diagnostic_reports r ON l.session_id = r.session_id
       WHERE l.id = $1`,
      [id]
    );
    if (!res.rows[0]) return null;
    const lead = res.rows[0];

    const notesRes = await pool.query(
      `SELECT * FROM admin_notes WHERE lead_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    lead.notes = notesRes.rows;

    const historyRes = await pool.query(
      `SELECT * FROM lead_status_history WHERE lead_id = $1 ORDER BY changed_at DESC`,
      [id]
    );
    lead.status_history = historyRes.rows;

    return lead;
  } else {
    const lead = memoryDb.leads.find(l => l.id === id);
    if (!lead) return null;

    const report = memoryDb.diagnostic_reports.find(r => r.session_id === lead.session_id) || null;
    const notes = memoryDb.admin_notes.filter(n => n.lead_id === id).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const history = memoryDb.lead_status_history.filter(h => h.lead_id === id).sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());

    return {
      ...lead,
      report,
      notes,
      status_history: history
    };
  }
}

export async function updateLeadStatusAdmin(
  id: string,
  newStatus: LeadRow['status'],
  adminUser: { id: string; username: string }
): Promise<boolean> {
  const now = new Date().toISOString();

  if (!useLocalFallback && pool) {
    const current = await pool.query(`SELECT status FROM leads WHERE id = $1`, [id]);
    if (!current.rows[0]) return false;
    const oldStatus = current.rows[0].status;

    await pool.query(
      `UPDATE leads SET status = $1, updated_at = $2 WHERE id = $3`,
      [newStatus, now, id]
    );

    await pool.query(
      `INSERT INTO lead_status_history (id, lead_id, changed_by, changed_by_name, old_status, new_status, changed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [crypto.randomUUID(), id, adminUser.id, adminUser.username, oldStatus, newStatus, now]
    );

    return true;
  } else {
    const lead = memoryDb.leads.find(l => l.id === id);
    if (!lead) return false;
    const oldStatus = lead.status;
    lead.status = newStatus;
    lead.updated_at = now;

    memoryDb.lead_status_history.push({
      id: crypto.randomUUID(),
      lead_id: id,
      changed_by: adminUser.id,
      changed_by_name: adminUser.username,
      old_status: oldStatus,
      new_status: newStatus,
      changed_at: now
    });

    saveLocalDb();
    return true;
  }
}

export async function saveLeadProposalAdmin(id: string, proposalText: string): Promise<boolean> {
  const now = new Date().toISOString();
  if (!useLocalFallback && pool) {
    await pool.query(`UPDATE leads SET proposal_text = $1, updated_at = $2 WHERE id = $3`, [proposalText, now, id]);
    return true;
  } else {
    const lead = memoryDb.leads.find(l => l.id === id);
    if (!lead) return false;
    lead.proposal_text = proposalText;
    lead.updated_at = now;
    saveLocalDb();
    return true;
  }
}

export async function addLeadNoteAdmin(
  id: string,
  noteText: string,
  adminUser: { id: string; username: string }
): Promise<any> {
  const noteId = crypto.randomUUID();
  const now = new Date().toISOString();

  if (!useLocalFallback && pool) {
    const res = await pool.query(
      `INSERT INTO admin_notes (id, lead_id, author_id, author_name, note_text, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [noteId, id, adminUser.id, adminUser.username, noteText, now]
    );
    return res.rows[0];
  } else {
    const note = {
      id: noteId,
      lead_id: id,
      author_id: adminUser.id,
      author_name: adminUser.username,
      note_text: noteText,
      created_at: now
    };
    memoryDb.admin_notes.push(note);
    saveLocalDb();
    return note;
  }
}

export async function deleteLeadAdmin(id: string, adminUser: { id: string; username: string }): Promise<boolean> {
  if (!useLocalFallback && pool) {
    const leadRes = await pool.query(`SELECT * FROM leads WHERE id = $1`, [id]);
    if (!leadRes.rows[0]) return false;

    await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);

    await logAdminAudit({
      userId: adminUser.id,
      username: adminUser.username,
      action: 'LEAD_DELETE',
      details: `Deleted lead ID ${id} (${leadRes.rows[0].name} - ${leadRes.rows[0].company_name})`
    });

    return true;
  } else {
    const idx = memoryDb.leads.findIndex(l => l.id === id);
    if (idx < 0) return false;

    const [deleted] = memoryDb.leads.splice(idx, 1);
    memoryDb.admin_notes = memoryDb.admin_notes.filter(n => n.lead_id !== id);
    memoryDb.lead_status_history = memoryDb.lead_status_history.filter(h => h.lead_id !== id);
    memoryDb.privacy_consents = memoryDb.privacy_consents.filter(c => c.lead_id !== id);

    await logAdminAudit({
      userId: adminUser.id,
      username: adminUser.username,
      action: 'LEAD_DELETE',
      details: `Deleted lead ID ${id} (${deleted.name} - ${deleted.company_name})`
    });

    saveLocalDb();
    return true;
  }
}

// ----------------- Admin Auth & Sessions -----------------

export async function getAdminUserByUsername(username: string): Promise<AdminUser | null> {
  if (!useLocalFallback && pool) {
    const res = await pool.query(`SELECT * FROM admin_users WHERE username = $1`, [username]);
    return res.rows[0] || null;
  } else {
    return memoryDb.admin_users.find(u => u.username === username) || null;
  }
}

export async function createAdminSession(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  checkStorageWritable();
  const now = new Date().toISOString();
  const exp = expiresAt.toISOString();

  if (!useLocalFallback && pool) {
    await pool.query(
      `INSERT INTO admin_sessions (token_hash, user_id, created_at, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token_hash) DO NOTHING`,
      [tokenHash, userId, now, exp]
    );
  } else {
    memoryDb.admin_sessions.push({
      token_hash: tokenHash,
      user_id: userId,
      created_at: now,
      expires_at: exp
    });
    saveLocalDb();
  }
}

export async function getAdminUserBySessionToken(tokenHash: string): Promise<AdminUser | null> {
  const now = new Date().toISOString();

  if (!useLocalFallback && pool) {
    const res = await pool.query(
      `SELECT u.* FROM admin_users u
       JOIN admin_sessions s ON s.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > $2`,
      [tokenHash, now]
    );
    return res.rows[0] || null;
  } else {
    const sess = memoryDb.admin_sessions.find(s => s.token_hash === tokenHash && s.expires_at > now);
    if (!sess) return null;
    return memoryDb.admin_users.find(u => u.id === sess.user_id) || null;
  }
}

export async function deleteAdminSession(tokenHash: string): Promise<void> {
  if (!useLocalFallback && pool) {
    await pool.query(`DELETE FROM admin_sessions WHERE token_hash = $1`, [tokenHash]);
  } else {
    memoryDb.admin_sessions = memoryDb.admin_sessions.filter(s => s.token_hash !== tokenHash);
    saveLocalDb();
  }
}

// ----------------- Audit Logs & Rate Limiting -----------------

export async function logAdminAudit(entry: {
  userId?: string | null;
  username?: string | null;
  username_attempted?: string | null;
  ip?: string | null;
  action: string;
  details?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const uname = entry.username || entry.username_attempted || null;

  if (!useLocalFallback && pool) {
    await pool.query(
      `INSERT INTO admin_audit_logs (user_id, username_attempted, ip_address, action_type, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.userId || null, uname, entry.ip || null, entry.action, entry.details || null, now]
    );
  } else {
    const id = memoryDb.admin_audit_logs.length + 1;
    memoryDb.admin_audit_logs.push({
      id,
      user_id: entry.userId || null,
      username_attempted: uname,
      ip_address: entry.ip || null,
      action_type: entry.action,
      details: entry.details || null,
      created_at: now
    });
    saveLocalDb();
  }
}

// In-memory rate limiting map
const loginAttempts = new Map<string, { attempts: number; lockoutUntil: number }>();

export function checkLoginRateLimit(key: string): { allowed: boolean; waitSeconds?: number } {
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (record) {
    if (record.lockoutUntil > now) {
      return { allowed: false, waitSeconds: Math.ceil((record.lockoutUntil - now) / 1000) };
    }
    // reset if past lockout
    if (record.lockoutUntil > 0 && record.lockoutUntil <= now) {
      loginAttempts.delete(key);
    }
  }

  return { allowed: true };
}

export function recordFailedLogin(key: string): { locked: boolean } {
  const now = Date.now();
  const record = loginAttempts.get(key) || { attempts: 0, lockoutUntil: 0 };
  record.attempts += 1;

  if (record.attempts >= 5) {
    record.lockoutUntil = now + 15 * 60 * 1000; // 15 minutes lockout
    loginAttempts.set(key, record);
    return { locked: true };
  }

  loginAttempts.set(key, record);
  return { locked: false };
}

export function resetLoginAttempts(key: string): void {
  loginAttempts.delete(key);
}
