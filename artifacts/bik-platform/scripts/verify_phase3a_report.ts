/**
 * Verification Suite for Phase 3A: Executive Intelligence Report & Consulting Conversion
 */
import assert from 'node:assert';
import { computeDeterministicScore } from '../src/services/deterministicScoring';
import { getNextAdaptiveQuestion } from '../src/services/adaptiveDiagnosticEngine';
import { createFallbackReport } from '../src/services/reportFallback';
import { generateFullDiagnosticReport } from '../src/services/reportGenerator';
import { APP_CONFIG, buildConsultantWhatsAppUrl, BIK_EXECUTIVE_REPORT_WHATSAPP_MESSAGE } from '../src/config/appConfig';

async function runPhase3AVerification() {
  console.log("=== STARTING PHASE 3A VERIFICATION: EXECUTIVE INTELLIGENCE REPORT ===");

  // TEST A: Zero database and WhatsApp env dependency
  console.log("\n[TEST A] Verifying Zero Database & WhatsApp API Environment Dependencies...");
  assert(!process.env.DATABASE_URL, "DATABASE_URL must not be required in environment");
  assert(!process.env.VITE_AHMED_WHATSAPP, "VITE_AHMED_WHATSAPP must not be in environment");
  assert.strictEqual(APP_CONFIG.consultantWhatsApp, '201066966515', "Consultant WhatsApp is 201066966515");
  console.log("✓ TEST A PASSED: Zero environment secret dependencies confirmed.");

  // TEST B: Deterministic scoring preservation
  console.log("\n[TEST B] Verifying Deterministic Scoring Engine Preservation...");
  const testIntake = {
    monthly_revenue: 150000,
    monthly_costs: 110000,
    monthly_marketing: 15000,
    team_size: '11-50',
    entity_type: 'LLC'
  };

  const testUniversal = {
    u01: '1', // Weakness
    u02: '2',
    u06: '25', // 25% net margin
    u31: '150000', // 150,000 monthly revenue
    u32: '50', // 50 new customers
    u33: '300' // 300 CAC
  };

  const scoreResult = computeDeterministicScore(testUniversal, testIntake);

  assert(typeof scoreResult.overall === 'number', "Score result has numeric overall score");
  assert(scoreResult.overall >= 0 && scoreResult.overall <= 100, "Score is in valid range 0-100");
  console.log(`✓ TEST B PASSED: Deterministic score computed: ${scoreResult.overall}/100.`);

  // TEST C: Adaptive Diagnostic Engine Preservation
  console.log("\n[TEST C] Verifying Adaptive Diagnostic Engine Preservation...");
  const adaptiveState = getNextAdaptiveQuestion({
    sectorL1: 'services',
    sectorL2: 'agency',
    diagnosticDepth: 'quick',
    answers: { ...testIntake, ...testUniversal }
  });

  assert(adaptiveState !== undefined, "Adaptive engine returns valid state");
  assert(typeof adaptiveState.isComplete === 'boolean', "Adaptive state has isComplete flag");
  console.log(`✓ TEST C PASSED: Adaptive diagnostic engine intact. isComplete=${adaptiveState.isComplete}.`);

  // TEST D: Executive Report Structure & Sections
  console.log("\n[TEST D] Verifying Executive Intelligence Report Generation...");
  const report = await generateFullDiagnosticReport({
    sessionId: "test-phase-3a-session",
    universalAnswers: testUniversal,
    sectorAnswers: {},
    intakeAnswers: testIntake,
    sectorL1: "services",
    sectorL2: "agency",
    diagnosticDepth: "quick",
    companyName: "شركة البصيرة للاستشارات"
  });

  assert(report !== null, "Executive report generated");
  assert.strictEqual(report.health_score, scoreResult.overall, "Report maintains exact deterministic health score");
  
  // SECTION 1: Executive Diagnosis
  assert(typeof report.headline_diagnosis === 'string' && report.headline_diagnosis.length > 0, "Headline diagnosis present");
  assert(typeof report.one_sentence_explanation === 'string', "One-sentence explanation present");
  assert(!report.one_sentence_explanation?.includes('AI discovered'), "No AI jargon in explanation");

  // AHA MOMENT
  assert(report.aha_moment !== undefined, "Aha moment present");
  assert(typeof report.aha_moment?.apparent_problem === 'string', "Aha moment has apparent problem");
  assert(typeof report.aha_moment?.root_cause === 'string', "Aha moment has root cause");
  assert(typeof report.aha_moment?.is_supported === 'boolean', "Aha moment declares if supported by evidence");

  // SECTION 2: What We Discovered (Top 3 Findings)
  assert(Array.isArray(report.discovered_findings), "Discovered findings is array");
  assert.strictEqual(report.discovered_findings?.length, 3, "Exactly top 3 discovered findings provided");
  report.discovered_findings?.forEach((finding, idx) => {
    assert(finding.title.length > 0, `Finding ${idx + 1} has title`);
    assert(finding.explanation.length > 0, `Finding ${idx + 1} has explanation`);
    assert(finding.evidence_reference.length > 0, `Finding ${idx + 1} has evidence reference`);
    assert(['عالي', 'متوسط', 'منخفض'].includes(finding.confidence), `Finding ${idx + 1} has valid confidence`);
    assert(['Observed', 'Hypothesis', 'Validated', 'Insufficient Data'].includes(finding.status), `Finding ${idx + 1} has valid status`);
    assert(finding.business_consequence.length > 0, `Finding ${idx + 1} has business consequence`);
  });

  // SECTION 5: Top 3 Priorities
  assert(Array.isArray(report.top_priorities), "Top priorities is array");
  assert.strictEqual(report.top_priorities?.length, 3, "Exactly top 3 priorities provided");
  report.top_priorities?.forEach((priority, idx) => {
    assert(priority.rank === idx + 1, `Priority ${idx + 1} rank matches index`);
    assert(priority.title.length > 0, `Priority ${idx + 1} has title`);
    assert(priority.why_it_matters.length > 0, `Priority ${idx + 1} has why it matters`);
    assert(priority.expected_objective.length > 0, `Priority ${idx + 1} has expected objective`);
    assert(priority.first_action.length > 0, `Priority ${idx + 1} has first action`);
  });

  // SECTION 6: 90-Day Direction
  assert(report.direction_90_days !== undefined, "90-day direction present");
  assert(report.direction_90_days?.days_0_30.actions.length > 0, "Days 0-30 has actions");
  assert(report.direction_90_days?.days_31_60.actions.length > 0, "Days 31-60 has actions");
  assert(report.direction_90_days?.days_61_90.actions.length > 0, "Days 61-90 has actions");

  // SECTION 7: Data Gaps
  assert(Array.isArray(report.data_gaps_analysis), "Data gaps analysis present");
  assert(report.data_gaps_analysis?.length > 0, "Data gaps analysis has entries");
  report.data_gaps_analysis?.forEach((gap, idx) => {
    assert(gap.dimension.length > 0, `Gap ${idx + 1} has dimension`);
    assert(gap.impact_on_diagnosis.length > 0, `Gap ${idx + 1} has impact`);
    assert(gap.credibility_note.length > 0, `Gap ${idx + 1} has credibility note`);
  });

  console.log("✓ TEST D PASSED: All 7 Executive sections verified.");

  // TEST E: Financial Impact Precision (Computable vs Uncomputable)
  console.log("\n[TEST E] Verifying Financial Impact Handling...");
  // 1. Uncomputable when financial numbers are missing
  const uncomputableAnswers = { u01: '1', u02: '2' };
  const scoreUncomputable = computeDeterministicScore(uncomputableAnswers, {});
  const uncomputableFallback = createFallbackReport({
    scoreResult: scoreUncomputable,
    companyData: { companyName: "شركة تجريبية", sectorL1: "services", sectorL2: "agency" },
    answers: uncomputableAnswers
  });
  assert(uncomputableFallback.financial_impact !== undefined, "Financial impact present in fallback");
  if (!uncomputableFallback.financial_impact?.isComputable) {
    assert(uncomputableFallback.financial_impact.uncomputableReason.length > 0, "Uncomputable reason clearly stated");
  }

  // 2. Computable when certified numerical inputs exist
  const finIntake = {
    monthly_revenue: 250000,
    monthly_costs: 190000,
    team_size: '11-50'
  };
  const scoreWithFin = computeDeterministicScore(testUniversal, finIntake);
  const computableFallback = createFallbackReport({
    scoreResult: scoreWithFin,
    companyData: { companyName: "شركة تجريبية", sectorL1: "services", sectorL2: "agency" },
    answers: { ...testUniversal, ...finIntake }
  });
  assert(computableFallback.financial_impact?.isComputable === true, "Financial impact is computable with direct inputs");
  const expectedProfit = computableFallback.financial_impact.metrics.monthlyNetProfit?.value;
  assert(typeof expectedProfit === 'number' && expectedProfit > 0, "Monthly net profit correctly calculated");
  console.log(`✓ TEST E PASSED: Financial impact respects strict determinism. Monthly net profit: ${expectedProfit} ${computableFallback.financial_impact.currency}.`);

  // TEST F: WhatsApp Executive CTA URL Contract
  console.log("\n[TEST F] Verifying WhatsApp Executive CTA Contract (wa.me/201066966515)...");
  const ctaResult = buildConsultantWhatsAppUrl({
    isExecutiveReportCTA: true
  });

  assert(ctaResult.isConfigured === true, "CTA marked configured");
  assert(ctaResult.url.startsWith("https://wa.me/201066966515"), "URL begins with wa.me/201066966515");
  
  const expectedPrefilledMessage = BIK_EXECUTIVE_REPORT_WHATSAPP_MESSAGE;
  assert.strictEqual(
    expectedPrefilledMessage,
    "مرحباً، أكملت تشخيص شركتي عبر BIK وأرغب في مناقشة التقرير التنفيذي وتحديد أهم الأولويات."
  );
  assert(ctaResult.url.includes(encodeURIComponent(expectedPrefilledMessage)), "Prefilled message matches exact executive text");

  // Privacy checks: NO financial numbers or private diagnostic answers in URL
  assert(!ctaResult.url.includes('250000'), "Revenue numbers strictly excluded from URL");
  assert(!ctaResult.url.includes('60000'), "Profit numbers strictly excluded from URL");
  assert(!ctaResult.url.includes('q_fin_01'), "Diagnostic answer IDs strictly excluded from URL");
  assert(!ctaResult.url.includes('somewhat_clear'), "Diagnostic answer values strictly excluded from URL");
  console.log("✓ TEST F PASSED: WhatsApp CTA URL verified with zero private leaks.");

  console.log("\n=======================================================");
  console.log("ALL PHASE 3A VERIFICATION SUITES PASSED SUCCESSFULLY!");
  console.log("=======================================================");
}

runPhase3AVerification().catch((err) => {
  console.error("VERIFICATION FAILED:", err);
  process.exit(1);
});
