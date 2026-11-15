import express from "express";
import path from "path";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import { createServer as createViteServer } from "vite";
import { BLIND_SPOT_FORMULAS, DEEP_TIER_QUESTIONS } from "./src/data/sectorFinancialTaxonomy.ts";
import { universalQuestions } from "./src/data/universalQuestions.ts";
import { sectorQuestions } from "./src/data/sectorQuestions.ts";
import { deltaQuestions } from "./src/data/deltaQuestions.ts";
import { computeDeterministicScore, computeInstantScore } from "./src/services/deterministicScoring.ts";
import { generateFullDiagnosticReport } from "./src/services/reportGenerator.ts";
import { createFallbackReport } from "./src/services/reportFallback.ts";
import { validateQuestionCatalog } from "./src/services/taxonomyValidation.ts";
import { CLIENT_DATA_STORAGE_DISABLED } from "./shared/privacy.ts";
import { handleChat } from "./server/chatHandler.ts";
import { createPublicRateLimiter } from "./server/rateLimit.ts";
import { trustProxyHops } from "./server/runtimeConfig.ts";
import { getNextAdaptiveQuestion } from "./src/services/adaptiveDiagnosticEngine.ts";
import {
  initDatabase,
  getStorageMode,
  getProductionConfigError,
  isProductionStorageBlocked,
  getDatabaseStatus,
  sanitizeDbError,
  createDiagnosticSession,
  getDiagnosticSession,
  updateSessionAnswers,
  saveDiagnosticReport,
  getDiagnosticReportBySession,
  saveLeadRecord,
  hashSecret,
  recordFunnelEvent,
  isAllowedFunnelEvent
} from "./server/db.ts";

// Build lookup mapping every internal question ID to its actual Arabic question text
const questionIdToText: Record<string, string> = {};

if (Array.isArray(universalQuestions)) {
  universalQuestions.forEach(q => {
    if (q && q.id && q.question) {
      questionIdToText[q.id.toLowerCase()] = q.question;
    }
  });
}

if (sectorQuestions) {
  Object.values(sectorQuestions).forEach((qList: any) => {
    if (Array.isArray(qList)) {
      qList.forEach((q: any) => {
        if (q && q.id && q.question) {
          questionIdToText[q.id.toLowerCase()] = q.question;
        }
      });
    }
  });
}

if (deltaQuestions) {
  Object.values(deltaQuestions).forEach((qList: any) => {
    if (Array.isArray(qList)) {
      qList.forEach((q: any) => {
        if (q && q.id && q.question) {
          questionIdToText[q.id.toLowerCase()] = q.question;
        }
      });
    }
  });
}

if (DEEP_TIER_QUESTIONS) {
  Object.values(DEEP_TIER_QUESTIONS).forEach((qList: any) => {
    if (Array.isArray(qList)) {
      qList.forEach((q: any) => {
        if (q && q.id && q.question) {
          questionIdToText[q.id.toLowerCase()] = q.question;
        }
      });
    }
  });
}

function removeFrameworkNames(text: string): string {
  if (typeof text !== "string") return text;
  
  let cleaned = text;
  
  // SWOT
  cleaned = cleaned.replace(/SWOT\s*Analysis/gi, "التحليل الاستراتيجي الرباعي");
  cleaned = cleaned.replace(/SWOT/gi, "التحليل الاستراتيجي الرباعي");
  cleaned = cleaned.replace(/تحليل\s*سوات/gi, "التحليل الاستراتيجي الرباعي");
  cleaned = cleaned.replace(/سوات/gi, "التحليل الاستراتيجي الرباعي");
  
  // Porter
  cleaned = cleaned.replace(/Porter's\s*Five\s*Forces/gi, "القوى التنافسية الخمس للأعمال");
  cleaned = cleaned.replace(/Porter's/gi, "");
  cleaned = cleaned.replace(/Porter/gi, "");
  cleaned = cleaned.replace(/نموذج\s*بوتر/gi, "النموذج الاستراتيجي التنافسي");
  cleaned = cleaned.replace(/بوتر/gi, "");
  
  // Kotler
  cleaned = cleaned.replace(/Kotler/gi, "");
  cleaned = cleaned.replace(/كوتلر/gi, "");
  
  // Hormozi
  cleaned = cleaned.replace(/Hormozi/gi, "");
  cleaned = cleaned.replace(/هرموزي/gi, "");
  
  // McKinsey
  cleaned = cleaned.replace(/McKinsey/gi, "بيت الخبرة الإدارية");
  cleaned = cleaned.replace(/ماكينزي/gi, "الخبراء الاستشاريين الدوليين");

  // Clean up any double spaces or awkward spacing left by removals
  cleaned = cleaned.replace(/\s+/g, " ");
  
  return cleaned;
}

// Recursively sanitize all string fields in an object
function sanitizeReport(obj: any, mapping: Record<string, string>): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    const regex = /[a-z]+\d{2}:/g;
    const replaced = obj.replace(regex, (match) => {
      const id = match.slice(0, -1).toLowerCase();
      const mapped = mapping[id];
      if (mapped) {
        return mapped + ":";
      }
      return "";
    });
    return removeFrameworkNames(replaced);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeReport(item, mapping));
  }

  if (typeof obj === "object") {
    const sanitized: any = {};
    for (const key of Object.keys(obj)) {
      sanitized[key] = sanitizeReport(obj[key], mapping);
    }
    return sanitized;
  }

  return obj;
}

// ----------------- Express Server -----------------

async function startServer() {
  const app = express();
  // Default remains one reverse-proxy hop; deployments can explicitly configure their topology.
  app.set('trust proxy', trustProxyHops(process.env));

  // Route the BIK API through a distinct prefix while restoring its internal
  // /api/v1 paths before privacy guards and route handlers run.
  app.use((req, _res, next) => {
    if (req.url === "/_bik-api") {
      req.url = "/api";
    } else if (req.url.startsWith("/_bik-api/")) {
      req.url = `/api${req.url.slice("/_bik-api".length)}`;
    }
    next();
  });

  // Close retired persistence, analytics, admin, and external-AI APIs before
  // parsing their request bodies. The browser-only diagnostic needs none of them.
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/v1/admin')) {
      return res.status(404).json({ error: 'واجهة الإدارة غير مفعلة في وضع عدم الاحتفاظ بالبيانات.' });
    }
    if (req.method === 'POST' && req.path === '/api/v1/events') {
      return res.status(410).json({ accepted: false, persisted: false, storageMode: 'session_only' });
    }
    if (req.method === 'POST' && req.path === '/api/v1/leads/submit') {
      return res.status(410).json({ success: false, persisted: false, storageMode: 'session_only' });
    }
    if (req.method === 'POST' && [
      '/api/v1/sessions/answers',
      '/api/v1/diagnose/generate',
      '/api/v1/diagnose/instant-score',
      '/api/v1/diagnose/next-question'
    ].includes(req.path)) {
      return res.status(410).json({ persisted: false, storageMode: 'session_only', error: 'يعمل التشخيص داخل المتصفح في هذا الإصدار.' });
    }
    if (req.method === 'POST' && ['/api/diagnose', '/api/proposal', '/api/consult'].includes(req.path)) {
      return res.status(410).json({ error: 'هذا المسار غير مفعّل في الإصدار المحلي عديم الاحتفاظ.' });
    }
    next();
  });

  // Security middlewares
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  const publicRateBuckets = new Map<string, { count: number; resetAt: number }>();
  const publicRateLimiter = createPublicRateLimiter(publicRateBuckets);
  app.use((req, res, next) => {
    const pathName = req.path;
    const isPublicCostRoute =
      pathName.startsWith('/api/v1/diagnose') ||
      pathName.startsWith('/api/v1/sessions') ||
      pathName === '/api/v1/leads/submit' ||
      pathName === '/api/diagnose' ||
      pathName === '/api/proposal' ||
      pathName === '/api/consult' ||
      pathName === '/api/v1/chat' ||
      pathName === '/api/v1/events';
    if (!isPublicCostRoute) return next();
    if (!publicRateLimiter.allow(req.ip || req.socket.remoteAddress || 'unknown')) {
      return res.status(429).json({ error: 'تم تجاوز حد الاستخدام المؤقت. يرجى الانتظار قليلاً ثم المحاولة مجدداً.' });
    }
    return next();
  });

  // Security Headers
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // This release deliberately has no server-side client, report, or admin storage.
  app.use("/api/v1/admin", (_req, res) => {
    res.status(404).json({ error: "واجهة الإدارة غير مفعلة في وضع عدم الاحتفاظ بالبيانات." });
  });

  const PORT = Number(process.env.PORT || 3000);

  // Storage initialization is intentionally stateless; no database is opened.
  await initDatabase();

  // Validate question catalog integrity on startup
  const taxonomyStatus = validateQuestionCatalog({ throwOnError: false });

  // Ephemeral in-memory store for active diagnostic sessions (V1 Ephemeral Launch Mode)
  // Ensures BIK V1 public diagnostic operates with 100% fidelity without requiring DATABASE_URL
  interface EphemeralDiagnosticSession {
    session_id: string;
    ownership_hash: string;
    created_at: string;
    sector_l1?: string;
    sector_l2?: string;
    diagnostic_depth?: string;
    intake_answers?: Record<string, any>;
    universal_answers?: Record<string, any>;
    sector_answers?: Record<string, any>;
    company_name?: string;
  }
  const ephemeralSessions = new Map<string, EphemeralDiagnosticSession>();

  // Helper middleware for user session ownership verification
  async function verifySessionOwnership(req: express.Request, res: express.Response, next: express.NextFunction) {
    const sessionId = req.body?.sessionId || req.query?.sessionId || req.params?.sessionId;
    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ error: "معرف الجلسة مطلوب" });
    }

    if (CLIENT_DATA_STORAGE_DISABLED) {
      (req as any).diagnosticSession = {
        session_id: sessionId,
        intake_answers: {},
        universal_answers: {},
        sector_answers: {},
        question_history: []
      };
      return next();
    }

    const ownershipToken = req.headers["x-session-ownership"] || req.cookies?.bik_session_token;
    
    let session: any = null;
    if (!isProductionStorageBlocked()) {
      try {
        session = await getDiagnosticSession(sessionId);
      } catch {
        session = null;
      }
    }

    // Check ephemeral store if not found in database
    if (!session && ephemeralSessions.has(sessionId)) {
      session = ephemeralSessions.get(sessionId);
    }
    
    // Auto-create session on initial POST request if starting directly with valid token
    if (!session) {
      if (req.method === "GET") {
        return res.status(404).json({ error: "الجلسة التشخيصية غير موجودة" });
      }

      const tokenToUse = (typeof ownershipToken === "string" && ownershipToken.length >= 16)
        ? ownershipToken
        : crypto.randomBytes(24).toString("hex");

      if (!isProductionStorageBlocked()) {
        try {
          session = await createDiagnosticSession(sessionId, tokenToUse);
        } catch (err: any) {
          console.warn("[SESSION INIT DB FALLBACK TO EPHEMERAL]", err?.message || err);
          session = {
            session_id: sessionId,
            ownership_hash: hashSecret(tokenToUse),
            created_at: new Date().toISOString(),
            intake_answers: {},
            universal_answers: {},
            sector_answers: {}
          };
          ephemeralSessions.set(sessionId, session);
        }
      } else {
        session = {
          session_id: sessionId,
          ownership_hash: hashSecret(tokenToUse),
          created_at: new Date().toISOString(),
          intake_answers: {},
          universal_answers: {},
          sector_answers: {}
        };
        ephemeralSessions.set(sessionId, session);
      }

      res.cookie("bik_session_token", tokenToUse, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
      res.setHeader("x-session-ownership", tokenToUse);
    }

    // Strict Ownership Enforcement: Must have valid matching token
    if (!ownershipToken || typeof ownershipToken !== "string") {
      return res.status(401).json({ error: "رمز التحقق من ملكية الجلسة مطلوب للوصول إلى البيانات" });
    }

    const tokenHash = hashSecret(ownershipToken);
    if (session.ownership_hash !== tokenHash) {
      return res.status(403).json({ error: "غير مصرح لك بالوصول إلى بيانات هذه الجلسة التشخيصية" });
    }

    (req as any).diagnosticSession = session;
    next();
  }

  // ==========================================
  // REST API v1 Suite
  // ==========================================

  // 1. Health & Storage Status
  app.get("/api/v1/health", (req, res) => {
    const dbStatus = getDatabaseStatus();
    res.json({
      status: "ok",
      v1LaunchModel: "stateless",
      publicDiagnosticAvailable: true,
      storageMode: "session_only",
      storageWritable: false,
      databaseConfigured: dbStatus.configured,
      databaseReachable: dbStatus.reachable,
      migrationReady: dbStatus.migrated,
      database: {
        configured: dbStatus.configured,
        reachable: dbStatus.reachable,
        migrated: dbStatus.migrated
      },
      timestamp: new Date().toISOString()
    });
  });

  // Privacy-minimized funnel event ingestion. Payloads are allowlisted in db.ts and never include PII.
  app.post('/api/v1/events', async (req, res) => {
    if (CLIENT_DATA_STORAGE_DISABLED) return res.json({ accepted: false, persisted: false, storageMode: 'session_only' });
    try {
      const { sessionId, eventName, eventData, deviceClass } = req.body || {};
      if (typeof sessionId !== 'string' || sessionId.length < 6 || typeof eventName !== 'string' || !isAllowedFunnelEvent(eventName)) {
        return res.status(400).json({ accepted: false, error: 'حدث قياس غير صالح.' });
      }
      const accepted = await recordFunnelEvent(sessionId, eventName, eventData && typeof eventData === 'object' ? eventData : {}, typeof deviceClass === 'string' ? deviceClass : undefined);
      return res.json({ accepted });
    } catch (err: any) {
      console.warn('[Analytics] Event not persisted:', err?.message || err);
      return res.status(202).json({ accepted: false, persisted: false });
    }
  });

  // 2. Start a New Session
  app.post("/api/v1/sessions/start", async (req, res) => {
    const candidate = req.body?.sessionId;
    const sessionId = typeof candidate === "string" && candidate.length > 5 ? candidate : crypto.randomUUID();
    const ownershipToken = crypto.randomBytes(24).toString("hex");
    res.json({ sessionId, ownershipToken, storageMode: "session_only", persisted: false, sessionModel: "browser_tab" });
  });

  // 3. Save Session Answers Incrementally
  app.post("/api/v1/sessions/answers", verifySessionOwnership, async (req, res) => {
    try {
      const { sessionId, sectorL1, sectorL2, diagnosticDepth, intakeAnswers, universalAnswers, sectorAnswers, questionHistory } = req.body;
      
      let persisted = false;
      if (!CLIENT_DATA_STORAGE_DISABLED && !isProductionStorageBlocked()) {
        try {
          persisted = await updateSessionAnswers(sessionId, {
            sectorL1,
            sectorL2,
            diagnosticDepth,
            intakeAnswers,
            universalAnswers,
            sectorAnswers,
            questionHistory
          });
        } catch {
          persisted = false;
        }
      }

      // In privacy mode answers remain only in the browser tab.
      const eph = CLIENT_DATA_STORAGE_DISABLED ? null : (ephemeralSessions.get(sessionId) || (req as any).diagnosticSession);
      if (eph) {
        if (sectorL1) eph.sector_l1 = sectorL1;
        if (sectorL2) eph.sector_l2 = sectorL2;
        if (diagnosticDepth) eph.diagnostic_depth = diagnosticDepth;
        if (intakeAnswers) eph.intake_answers = { ...(eph.intake_answers || {}), ...intakeAnswers };
        if (universalAnswers) eph.universal_answers = { ...(eph.universal_answers || {}), ...universalAnswers };
        if (sectorAnswers) eph.sector_answers = { ...(eph.sector_answers || {}), ...sectorAnswers };
        if (questionHistory) eph.question_history = questionHistory;
        ephemeralSessions.set(sessionId, eph);
      }

      res.json({
        success: true,
        persisted: false,
        storageMode: "session_only",
        sessionModel: "browser_tab"
      });
    } catch (err: any) {
      res.status(500).json({ error: "فشل حفظ الإجابات" });
    }
  });

  // 4. Instant Score Endpoint (Pure Deterministic Calculation)
  app.post("/api/v1/diagnose/instant-score", async (req, res) => {
    try {
      const { universalAnswers = {}, intakeAnswers = {} } = req.body;
      const scoreResult = computeDeterministicScore(universalAnswers, intakeAnswers);
      res.json({
        scoreResult,
        storageMode: getStorageMode()
      });
    } catch (err: any) {
      console.error("[API] /api/v1/diagnose/instant-score error:", err);
      res.status(500).json({ error: "فشل احتساب النتيجة بمعادلة ثابتة" });
    }
  });

  // 4b. Adaptive Next Question Delivery Endpoint
  app.post("/api/v1/diagnose/next-question", async (req, res) => {
    try {
      const { sessionId, sectorId, sectorL1, sectorL2, diagnosticDepth, answers = {} } = req.body;
      const result = getNextAdaptiveQuestion({
        sessionId,
        sectorL1: sectorL1 || sectorId,
        sectorL2,
        diagnosticDepth,
        answers
      });
      res.json(result);
    } catch (err: any) {
      console.error("[API] /api/v1/diagnose/next-question error:", err);
      res.status(500).json({ error: "فشل تحديد السؤال التكيفي التالي" });
    }
  });

  // 5. Generate Diagnostic Report (Grounded, Safe & Resilient)
  app.post("/api/v1/diagnose/generate", verifySessionOwnership, async (req, res) => {
    const endpointStart = Date.now();
    try {
      const session = (req as any).diagnosticSession;
      const sessionId = session.session_id || session.sessionId;

      // Answers from body or session
      const universalAnswers = req.body.universalAnswers || session.universal_answers || {};
      const sectorAnswers = req.body.sectorAnswers || session.sector_answers || {};
      const intakeAnswers = req.body.intakeAnswers || session.intake_answers || {};
      const questionHistory = req.body.questionHistory || session.question_history || [];
      const sectorL1 = req.body.sectorL1 || session.sector_l1 || "";
      const sectorL2 = req.body.sectorL2 || session.sector_l2 || "";
      const diagnosticDepth = req.body.diagnosticDepth || session.diagnostic_depth || "quick";
      const companyName = req.body.companyName || session.company_name || "الشركة";

      // 1. Mandatory Ground Truth generation with deterministic scoring
      const generatedReport = await generateFullDiagnosticReport({
        sessionId,
        universalAnswers,
        sectorAnswers,
        intakeAnswers,
        sectorL1,
        sectorL2,
        diagnosticDepth,
        companyName,
        questionHistory
      });

      // 2. Deterministic baseline details
      const scoreResult = computeDeterministicScore(universalAnswers, intakeAnswers);

      let persisted = false;

      // 3. Save to Database if configured and available (V2 Persistent Mode)
      if (!CLIENT_DATA_STORAGE_DISABLED && !isProductionStorageBlocked()) {
        try {
          const savedRow = await saveDiagnosticReport({
            sessionId,
            overallScore: generatedReport.health_score,
            healthLabel: generatedReport.health_label,
            headlineDiagnosis: generatedReport.headline_diagnosis,
            axisScores: scoreResult.axisScores,
            axisDetails: scoreResult.axisDetails,
            swotMatrix: generatedReport.swot,
            blindSpots: generatedReport.blind_spots,
            priorityActions: generatedReport.priority_actions,
            closingQuestion: generatedReport.closing_question,
            sectorInsight: generatedReport.sector_insight,
            financialImpact: generatedReport.financial_impact,
            confidence: generatedReport.confidence,
            coverage: generatedReport.coverage,
            diagnosticEngineVersion: generatedReport.engine_metadata?.diagnosticEngineVersion || '2.0.0',
            taxonomyVersion: generatedReport.engine_metadata?.taxonomyVersion || '2.0.0',
            scoringVersion: generatedReport.engine_metadata?.scoringVersion || '2.0.0',
            financialModelVersion: generatedReport.engine_metadata?.financialModelVersion || '2.0.0',
            engineMetadata: generatedReport.engine_metadata,
            diagnosticFindings: generatedReport.diagnostic_findings,
            evidence: generatedReport.evidence,
            reportPayload: generatedReport
          });
          void savedRow;
          persisted = true;
        } catch {
          persisted = false;
        }
      }

      const endpointDuration = Date.now() - endpointStart;

      res.json({
        report: generatedReport,
        storageMode: "session_only",
        persisted: false,
        sessionModel: "browser_tab",
        processingDurationMs: endpointDuration
      });

    } catch (err: any) {
      // Emergency resilient fallback
      try {
        const session = (req as any).diagnosticSession || {};
        const universalAnswers = req.body.universalAnswers || session.universal_answers || {};
        const intakeAnswers = req.body.intakeAnswers || session.intake_answers || {};
        const questionHistory = req.body.questionHistory || session.question_history || [];
        const scoreResult = computeDeterministicScore(universalAnswers, intakeAnswers);
        const emergencyReport = createFallbackReport({
          scoreResult,
          companyData: {
            companyName: req.body.companyName || "الشركة",
            sectorL1: req.body.sectorL1 || session.sector_l1,
            sectorL2: req.body.sectorL2 || session.sector_l2
          },
          answers: { ...intakeAnswers, ...universalAnswers },
          questionHistory
        });
        
        let persisted = false;

        if (!CLIENT_DATA_STORAGE_DISABLED && !isProductionStorageBlocked()) {
          try {
            const savedRow = await saveDiagnosticReport({
              sessionId: session.session_id || "emergency",
              overallScore: emergencyReport.health_score,
              healthLabel: emergencyReport.health_label,
              headlineDiagnosis: emergencyReport.headline_diagnosis,
              axisScores: scoreResult.axisScores,
              axisDetails: scoreResult.axisDetails,
              swotMatrix: emergencyReport.swot,
              blindSpots: emergencyReport.blind_spots,
              priorityActions: emergencyReport.priority_actions,
              closingQuestion: emergencyReport.closing_question,
              sectorInsight: emergencyReport.sector_insight,
              financialImpact: emergencyReport.financial_impact,
              confidence: emergencyReport.confidence,
              coverage: emergencyReport.coverage,
              diagnosticEngineVersion: emergencyReport.engine_metadata?.diagnosticEngineVersion || '2.0.0',
              taxonomyVersion: emergencyReport.engine_metadata?.taxonomyVersion || '2.0.0',
              scoringVersion: emergencyReport.engine_metadata?.scoringVersion || '2.0.0',
              financialModelVersion: emergencyReport.engine_metadata?.financialModelVersion || '2.0.0',
              engineMetadata: emergencyReport.engine_metadata,
              diagnosticFindings: emergencyReport.diagnostic_findings,
              evidence: emergencyReport.evidence,
              reportPayload: emergencyReport
            });
            void savedRow;
            persisted = true;
          } catch {
            persisted = false;
          }
        }

        return res.json({
          report: emergencyReport,
          storageMode: "session_only",
          persisted: false,
          sessionModel: "browser_tab"
        });
      } catch (recoveryErr: any) {
        res.status(500).json({ error: "تعذر توليد التقرير التشخيصي حالياً، يرجى إعادة المحاولة." });
      }
    }
  });

  // 6. Get Diagnostic Report by Session ID
  app.get("/api/v1/reports/:sessionId", (_req, res) => {
    return res.status(404).json({ error: "التقرير متاح في علامة التبويب الحالية فقط ولا يحتفظ به الخادم." });
  });

  // 5. Submit Lead (Optional transparent gate)
  app.post("/api/v1/leads/submit", (_req, res) => {
    return res.status(410).json({
      success: false,
      persisted: false,
      storageMode: "session_only",
      error: "تسليم بيانات التواصل يتم مباشرة من جهازك إلى واتساب بعد موافقتك؛ لا يستقبلها الخادم."
    });
  });

  // ==========================================
  // Legacy / Backward Compatible Routes
  // ==========================================

  // Legacy diagnose route (updated to use deterministic ground truth generator)
  app.post("/api/diagnose", async (req, res) => {
    try {
      const store = req.body;
      const {
        sessionId = crypto.randomUUID(),
        sectorL1 = "",
        sectorL2 = "",
        intakeAnswers = {},
        universalAnswers = {},
        sectorAnswers = {},
        diagnosticDepth = "quick",
        companyName = "الشركة"
      } = store;

      const report = await generateFullDiagnosticReport({
        sessionId,
        universalAnswers,
        sectorAnswers,
        intakeAnswers,
        sectorL1,
        sectorL2,
        diagnosticDepth,
        companyName
      });

      res.json(report);
    } catch (err: any) {
      console.error("Legacy /api/diagnose error:", err);
      const isProd = process.env.NODE_ENV === "production";
      res.status(500).json({ error: isProd ? "فشل تشخيص الأداء حالياً، يرجى إعادة المحاولة." : (err.message || String(err)) });
    }
  });

  // Legacy external-model routes are closed. Chat is served only by /api/v1/chat.
  app.post("/api/proposal", (_req, res) => res.status(410).json({ error: "هذا المسار مغلق." }));
  app.post("/api/consult", (_req, res) => res.status(410).json({ error: "هذا المسار مغلق." }));

  // Automated chat after the result. Receives only the whitelisted, non-personal payload
  // (sector label, axis statuses, chat messages). See src/services/chatPolicy.ts.
  const chatRateBuckets = new Map<string, { count: number; resetAt: number }>();
  app.post("/api/v1/chat", async (req, res) => {
    const result = await handleChat(req.body, {
      env: process.env,
      fetchImpl: fetch,
      ip: req.ip || 'unknown',
      buckets: chatRateBuckets
    });
    res.status(result.status).json(result.json);
  });

  // Serve frontend Vite
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      appType: "spa",
      server: { middlewareMode: true, allowedHosts: true }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    void PORT;
  });
}

startServer().catch(err => {
  process.exitCode = 1;
});
