/**
 * BIK V1 LAUNCH ARCHITECTURE VERIFICATION SUITE
 * 
 * Verifies that the complete public-user diagnostic journey runs without DATABASE_URL:
 * - Intake -> Universal Questions -> Sector Questions -> Adaptive Follow-up
 * - Deterministic Scoring -> Financial Calculation
 * - Executive Report Generation & Ephemeral Retrieval
 * - WhatsApp Executive CTA URL format & parameters
 * - Ensures no DATABASE_URL error is thrown, no 500 error, no DB connection blocks user
 */

import { computeDeterministicScore, calculateFinancialImpact, extractFinancialInputs } from '../src/services/deterministicScoring';
import { generateFullDiagnosticReport } from '../src/services/reportGenerator';
import { createFallbackReport } from '../src/services/reportFallback';
import { getNextAdaptiveQuestion } from '../src/services/adaptiveDiagnosticEngine';
import { APP_CONFIG, buildConsultantWhatsAppUrl, SessionHandoffSummary, buildWhatsAppExecutiveMessage } from '../src/config/appConfig';
import { buildDualLayerReport } from '../src/services/dualLayerReport';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function runNoDbVerification() {
  console.log("============================================================");
  console.log("BIK V1 LAUNCH: NO-DATABASE PUBLIC DIAGNOSTIC FLOW AUDIT");
  console.log("============================================================");

  // 1. Verify Environment Baseline
  console.log("\n--- 1. DATABASE-INDEPENDENT CONFIGURATION ---");
  const dbUrl = process.env.DATABASE_URL;
  assert(!dbUrl, "DATABASE_URL is not set in verification environment", `Value: ${dbUrl}`);

  assert(typeof APP_CONFIG.consultantWhatsApp === 'string' && APP_CONFIG.consultantWhatsApp.length >= 10, "APP_CONFIG.consultantWhatsApp is configured without env vars", APP_CONFIG.consultantWhatsApp);
  assert(!('VITE_AHMED_WHATSAPP' in process.env), "VITE_AHMED_WHATSAPP is completely removed from process.env");

  // 2. Test Deterministic Scoring & Financial Engine without DB
  console.log("\n--- 2. CORE ENGINES (SCORING & FINANCIAL IMPACT) ---");
  const testIntake = {
    monthly_revenue: 150000,
    monthly_costs: 110000,
    monthly_marketing: 15000,
    team_size: '11-50',
    entity_type: 'LLC'
  };

  const testUniversal = {
    u01: '1',
    u06: '25', // 25% net margin
    u31: '150000', // 150,000 monthly revenue
    u32: '50', // 50 new customers
    u33: '300' // 300 CAC
  };

  const scoreResult = computeDeterministicScore(testUniversal, testIntake);
  assert(typeof scoreResult.overall === 'number' && scoreResult.overall >= 0 && scoreResult.overall <= 100,
    "Deterministic score computes valid score", `Score: ${scoreResult.overall}`);
  assert(typeof scoreResult.overallConfidence === 'string' && scoreResult.overallConfidence.length > 0, "Health confidence generated", scoreResult.overallConfidence);
  assert(Object.keys(scoreResult.axisScores).length === 6, "All 6 business axes scored");

  const finInputs = extractFinancialInputs(testUniversal, testIntake);
  const financialImpact = calculateFinancialImpact(finInputs);
  assert(financialImpact.isComputable === true, "Financial impact computed deterministically");
  assert(financialImpact.metrics.monthlyRevenue.value === 150000, "Revenue metric captured accurately");
  assert(financialImpact.metrics.monthlyNetProfit.value === 37500, "Net profit calculated correctly (150k * 25% = 37,500)");

  // 3. Test Adaptive Engine Follow-up
  console.log("\n--- 3. ADAPTIVE FOLLOW-UP ENGINE ---");
  const nextQ = getNextAdaptiveQuestion({
    sessionId: "test-session-1234",
    sectorL1: "retail",
    sectorL2: "supermarket",
    diagnosticDepth: "quick",
    answers: { ...testIntake, ...testUniversal }
  });
  assert(nextQ !== undefined, "Adaptive engine returns question or completion state");
  assert(typeof nextQ.isComplete === 'boolean', "Adaptive completion state is boolean");

  // 4. Test Executive Report Generation (No Database Required)
  console.log("\n--- 4. EXECUTIVE REPORT GENERATION ---");
  const report = await generateFullDiagnosticReport({
    sessionId: "test-v1-session-no-db",
    universalAnswers: testUniversal,
    sectorAnswers: { inventory_cycle: '30_days', shrinkage_rate: 'low' },
    intakeAnswers: testIntake,
    sectorL1: "retail",
    sectorL2: "supermarket",
    diagnosticDepth: "quick",
    companyName: "شركة الفرات للتجارة"
  });

  assert(report !== null && typeof report === 'object', "Report generated successfully without DB");
  // This fixture has only 5 answers (one of them not a valid option). Fix B contract: no invented score.
  assert(typeof report.health_score === 'number' && report.health_score_computed === false, "Sparse session: report flags the score as not computed (no invented number)", `Score: ${report.health_score}, computed: ${report.health_score_computed}`);
  assert(typeof report.headline_diagnosis === 'string' && report.headline_diagnosis.length > 0, "Report contains headline diagnosis");
  assert(Array.isArray(report.blind_spots) && report.blind_spots.length > 0, "Report identifies critical blind spots");
  assert(Array.isArray(report.priority_actions) && report.priority_actions.length > 0, "Report provides priority action roadmap");
  assert(report.financial_impact !== undefined, "Report includes deterministic financial impact section");

  // 5. Test Resilient Fallback Report Generation
  console.log("\n--- 5. RESILIENT FALLBACK REPORT ---");
  const fallbackReport = createFallbackReport({
    scoreResult,
    companyData: {
      companyName: "مؤسسة الأمل",
      sectorL1: "services",
      sectorL2: "consulting"
    },
    answers: { ...testIntake, ...testUniversal }
  });
  assert(fallbackReport.health_score === scoreResult.overall, "Fallback report retains deterministic score");
  assert(fallbackReport.blind_spots.length > 0, "Fallback report produces actionable blind spots");

  // 6. Test WhatsApp Executive CTA URL Construction
  console.log("\n--- 6. WHATSAPP EXECUTIVE CTA CONTRACT ---");
  const companyName = "شركة الفرات للتجارة";
  const sessionRef = "test-v1-session-no-db".slice(0, 8);

  const whatsappResult = buildConsultantWhatsAppUrl({
    companyName,
    sessionRef
  });

  assert(whatsappResult.isConfigured === true, "WhatsApp CTA is marked as configured");
  assert(whatsappResult.url.startsWith(`https://wa.me/${APP_CONFIG.consultantWhatsApp}`), "URL begins with wa.me and verified public number");
  assert(whatsappResult.url.includes(encodeURIComponent(companyName)), "Prefilled message includes company name");
  assert(whatsappResult.url.includes(encodeURIComponent(sessionRef)), "Prefilled message includes session reference");
  assert(!whatsappResult.url.includes('150000'), "Financial private data is strictly excluded from WhatsApp URL");
  assert(!whatsappResult.url.includes('110000'), "Cost confidential data is strictly excluded from WhatsApp URL");

  // Test empty configuration safety
  const originalWhatsApp = APP_CONFIG.consultantWhatsApp;
  APP_CONFIG.consultantWhatsApp = '';
  const emptyResult = buildConsultantWhatsAppUrl();
  assert(emptyResult.isConfigured === false, "Empty WhatsApp configuration safely returns isConfigured: false");
  assert(emptyResult.url === '', "Empty WhatsApp configuration does NOT crash and returns empty url");
  APP_CONFIG.consultantWhatsApp = originalWhatsApp;

  // 7. Focused Tests for WhatsApp Handoff (All 11 Requirements)
  console.log("\n--- 7. FOCUSED TESTS FOR WHATSAPP HANDOFF (11 CONTRACT CHECKS) ---");

  // Mock real diagnostic session handoff data
  const mockHandoffData: SessionHandoffSummary = {
    userName: "عبدالله الشمري",
    companyName: "شركة الفرات للتجارة",
    country: "السعودية",
    city: "الرياض",
    sectorL1: "التجارة والتوزيع",
    sectorL2: "تجارة الجملة والتجزئة",
    healthScore: 74,
    coverage: 88,
    confidence: "مرتفع",
    strongestFinding: "خلل في دورة رأس المال العامل وسلاسل التوريد",
    rootCause: "فجوات في المواءمة التشغيلية وشروط الدفع مع الموردين",
    topPriority: "إعادة التفاوض على شروط الائتمان وتقليص المخزون الراكد",
    businessConsequence: "حماية السيولة النقدية وتفادي الاختناقات المالية",
    financialStatus: "مصرّحة وجاهزة للمراجعة التفصيلية"
  };

  // 1. buildConsultantWhatsAppUrl can receive session-derived diagnostic information
  const handoffUrlResult = buildConsultantWhatsAppUrl({
    sessionHandoff: mockHandoffData,
    companyName: mockHandoffData.companyName,
    sessionRef: "sess-8899aabb"
  });
  assert(handoffUrlResult.isConfigured === true, "Check 1: buildConsultantWhatsAppUrl accepts sessionHandoff");

  const decodedUrl = decodeURIComponent(handoffUrlResult.url);
  const msgText = handoffUrlResult.messageText || '';

  // 2. The generated URL contains actual diagnostic fields
  assert(decodedUrl.includes("74/100") && decodedUrl.includes("شركة الفرات للتجارة"),
    "Check 2: Generated URL contains actual diagnostic fields");

  // 3. The URL does NOT contain raw financial inputs
  assert(!decodedUrl.includes("150000") && !decodedUrl.includes("110000") && !decodedUrl.includes("37500"),
    "Check 3: URL strictly excludes raw financial inputs/ledgers");

  // 4. The URL does NOT contain raw question IDs
  assert(!decodedUrl.includes("u01") && !decodedUrl.includes("u06") && !decodedUrl.includes("u31"),
    "Check 4: URL strictly excludes internal question IDs (e.g. u01, u06)");

  // 5. The URL does NOT contain full Q&A or internal structures
  assert(!decodedUrl.includes("swot") && !decodedUrl.includes("universalAnswers") && !decodedUrl.includes("inventory_cycle"),
    "Check 5: URL strictly excludes full QA history and internal SWOT structures");

  // 6. The message is not the old generic static-only message when real diagnostic data exists
  assert(!msgText.includes("أرغب في مناقشة التقرير التنفيذي وحجز استشارة استراتيجية") && msgText.includes("مؤشر التشخيص: 74/100"),
    "Check 6: Message is session-tailored, not the old static placeholder");

  // 7. The message contains the actual company name
  assert(msgText.includes("شركة الفرات للتجارة"), "Check 7: Message contains the actual company name");

  // 8. The message contains the actual score
  assert(msgText.includes("74/100"), "Check 8: Message contains the actual score (74/100)");

  // 9. The message contains the actual top finding when available
  assert(msgText.includes("خلل في دورة رأس المال العامل وسلاسل التوريد"),
    "Check 9: Message contains the actual top finding");

  // 10. The message contains the actual priority when available
  assert(msgText.includes("إعادة التفاوض على شروط الائتمان وتقليص المخزون الراكد"),
    "Check 10: Message contains the actual priority");

  // 11. Empty/missing values are handled without fabricated data
  const sparseHandoffData: SessionHandoffSummary = {
    companyName: "شركة البناء الحديث",
    healthScore: 62
  };
  const sparseMsg = buildWhatsAppExecutiveMessage(sparseHandoffData);
  assert(sparseMsg.includes("شركة البناء الحديث") && sparseMsg.includes("62/100"),
    "Check 11a: Sparse data contains valid provided fields");
  assert(!sparseMsg.includes("غير محدد") && !sparseMsg.includes("تحديات في ضبط كفاءة العمليات"),
    "Check 11b: Missing fields are omitted rather than filled with fabricated text");

  // 12. Integration check with dualLayerReport
  console.log("\n--- 8. DUAL-LAYER REPORT WHATSAPP INTEGRATION CHECK ---");
  const dualLayerResult = buildDualLayerReport({
    baseReport: report,
    scoreResult,
    companyData: {
      companyName: "شركة الفرات للتجارة",
      userName: "عبدالله الشمري",
      sectorL1: "retail",
      sectorL2: "supermarket",
      country: "السعودية",
      city: "الرياض"
    },
    intakeAnswers: testIntake,
    universalAnswers: testUniversal
  });

  const ctaUrl = dualLayerResult.clientReport.consultant_cta.whatsapp_url;
  const ctaMsg = dualLayerResult.clientReport.consultant_cta.message_text;
  const decodedCtaUrl = decodeURIComponent(ctaUrl);

  assert(ctaUrl.startsWith(`https://wa.me/${APP_CONFIG.consultantWhatsApp}`), "Dual layer CTA URL has verified consultant WhatsApp number");
  assert(decodedCtaUrl.includes("شركة الفرات للتجارة"), "Dual layer CTA URL contains real company name");
  assert(decodedCtaUrl.includes(String(report.health_score)), "Dual layer CTA URL contains real diagnostic health score");
  assert(!decodedCtaUrl.includes("150000"), "Dual layer CTA URL does not leak raw financial numbers");
  assert(!decodedCtaUrl.includes("u01"), "Dual layer CTA URL does not leak question codes");
  assert(dualLayerResult.consultantDossier.full_dossier_text.length > 500, "Consultant dossier contains full in-depth text for manual sharing/download");

  console.log("\n============================================================");
  console.log(`V1 NO-DB AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("============================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runNoDbVerification().catch((err) => {
  console.error("FATAL ERROR in No-DB verification:", err);
  process.exit(1);
});
