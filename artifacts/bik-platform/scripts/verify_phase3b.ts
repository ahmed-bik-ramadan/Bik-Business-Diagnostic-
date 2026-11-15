// scripts/verify_phase3b.ts
// Phase 3B Dual-Layer Report & Consultant Handoff Dossier Audit Suite

import { computeDeterministicScore, calculateFinancialImpact } from '../src/services/deterministicScoring';
import { buildDualLayerReport } from '../src/services/dualLayerReport';
import { buildEvidenceBasedSwot } from '../src/services/evidenceSwot';
import { buildConsultantWhatsAppUrl, BIK_CONSULTANT_PUBLIC_WHATSAPP, BIK_EXECUTIVE_REPORT_WHATSAPP_MESSAGE } from '../src/config/appConfig';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${name}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function runPhase3bAudits() {
  console.log('============================================================');
  console.log('BIK PHASE 3B: DUAL-LAYER REPORT & CONSULTANT DOSSIER AUDIT');
  console.log('============================================================\n');

  // --------------------------------------------------------------------------
  // 1. DATA PREPARATION & DETERMINISTIC BASELINE
  // --------------------------------------------------------------------------
  console.log('--- 1. DETERMINISTIC SOURCE PREPARATION ---');
  const mockIntakeAnswers: Record<string, any> = {
    companyName: 'تقنية الأفق للاستشارات',
    userName: 'سارة المنصوري',
    sectorL1: 'professional',
    sectorL2: 'استشارات مهنية وتقنية',
    country: 'المملكة العربية السعودية',
    city: 'الرياض',
    companyAge: '3-7 سنوات',
    teamSize: '11-25 موظف',
    monthlyRevenue: 350000,
    monthlyCosts: 260000,
    monthlyMarketing: 25000,
    netMarginPct: 25,
    hasDebt: 'لا',
    modelsApplied: ['مصفوفة الأولويات', 'مؤشرات الأداء الرئيسية (KPIs)']
  };

  const mockUniversalAnswers: Record<string, any> = {
    u01: 'always',
    u02: 'delegated',
    u03: 'no', // Critical: owner absence causes shutdown
    u04: 'no_surprises',
    u05: 'profitable',
    u06: 25, // Valid numeric net margin %
    u07: 'continuous',
    u08: 'healthy',
    u09: 'automated',
    u10: 'multi_channel',
    u11: 'tracked',
    u12: 'short',
    u13: 'aligned',
    u14: 'clear',
    u15: 'systematized',
    u31: 350000,
    u32: 260000,
    u33: 25000,
    u34: 60,
    u35: 25
  };

  const mockSectorAnswers: Record<string, any> = {
    p01: 'retainer_projects',
    p02: 'utilization_tracked'
  };

  const scoreResult = computeDeterministicScore(mockUniversalAnswers, mockIntakeAnswers);
  assert(scoreResult.overall > 0, 'Deterministic score successfully calculated');
  assert(scoreResult.overallCoverage > 0, `Coverage accurately calculated (${scoreResult.overallCoverage}%)`);

  // --------------------------------------------------------------------------
  // 2. DUAL-LAYER REPORT GENERATION
  // --------------------------------------------------------------------------
  console.log('\n--- 2. DUAL-LAYER REPORT ARCHITECTURE ---');
  const dualLayer = buildDualLayerReport({
    scoreResult,
    companyData: {
      userName: mockIntakeAnswers.userName,
      companyName: mockIntakeAnswers.companyName,
      sectorL1: mockIntakeAnswers.sectorL1,
      sectorL2: mockIntakeAnswers.sectorL2,
      country: mockIntakeAnswers.country,
      city: mockIntakeAnswers.city,
      whatsapp: '966500000000'
    },
    intakeAnswers: mockIntakeAnswers,
    universalAnswers: mockUniversalAnswers,
    sectorAnswers: mockSectorAnswers
  });

  assert(dualLayer !== null && dualLayer !== undefined, 'DualLayerReport object successfully generated');
  assert(dualLayer.clientReport !== undefined, 'Client Executive Report layer exists');
  assert(dualLayer.consultantDossier !== undefined, 'Consultant Dossier layer exists');
  assert(typeof dualLayer.consultantDossier.full_dossier_text === 'string', 'Consultant Dossier full dossier text generated');

  // --------------------------------------------------------------------------
  // 3. COMPLETE QUESTION -> ANSWER RECORD VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 3. COMPLETE QUESTION -> ANSWER RECORD INTEGRITY ---');
  const qa = dualLayer.consultantDossier.qa_record;
  assert(Array.isArray(qa) && qa.length > 0, `QA record populated with ${qa.length} items`);

  // Verify questions asked are included
  const hasU01 = qa.some(q => q.question_id === 'u01');
  const hasU03 = qa.some(q => q.question_id === 'u03');
  const hasU31 = qa.some(q => q.question_id === 'u31');
  const hasCompanyAge = qa.some(q => q.question_id === 'companyAge');
  const hasP01 = qa.some(q => q.question_id === 'p01');

  assert(hasU01, 'Universal question u01 present in QA record');
  assert(hasU03, 'Universal question u03 present in QA record');
  assert(hasU31, 'Financial question u31 present in QA record');
  assert(hasCompanyAge, 'Intake question companyAge present in QA record');
  assert(hasP01, 'Sector question p01 present in QA record');

  // Verify unasked questions are excluded
  const hasUnaskedSector = qa.some(q => q.question_id === 'hc01' || q.question_id === 'ret01');
  assert(!hasUnaskedSector, 'Unasked sector questions (hc01, ret01) are strictly excluded from QA record');

  // Verify human-readable answer text preservation
  const u03Item = qa.find(q => q.question_id === 'u03');
  assert(u03Item !== undefined && u03Item.answer_text.includes('لا'), 'u03 answer text preserved in human-readable Arabic');
  assert(u03Item?.diagnostic_role === 'signal', 'u03 tagged with diagnostic_role="signal"');
  assert(u03Item?.dimension === 'بنية الشركة وهويتها', 'u03 mapped to correct dimension');

  // Check sequential numbering
  const isSequenced = qa.every((item, idx) => item.question_number === idx + 1);
  assert(isSequenced, 'QA record has strict sequential question_number (1 to N)');

  // --------------------------------------------------------------------------
  // 4. EVIDENCE-BASED SWOT CLASSIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 4. EVIDENCE-BASED SWOT AUDIT ---');
  const swot = dualLayer.consultantDossier.swot;
  assert(swot.strengths.length > 0, `Strengths populated (${swot.strengths.length} items)`);
  assert(swot.weaknesses.length > 0, `Weaknesses populated (${swot.weaknesses.length} items)`);
  assert(swot.opportunities.length > 0, `Opportunities populated (${swot.opportunities.length} items)`);
  assert(swot.threats.length > 0, `Threats populated (${swot.threats.length} items)`);

  // Verify strict internal classification types
  const validClassifications = ['OBSERVED', 'CALCULATED', 'DERIVED', 'SECTOR_CONTEXT'];
  const allItems = [...swot.strengths, ...swot.weaknesses, ...swot.opportunities, ...swot.threats];
  const allValidClassifications = allItems.every(item => validClassifications.includes(item.classification));
  assert(allValidClassifications, '100% of SWOT items have strict classification (OBSERVED | CALCULATED | DERIVED | SECTOR_CONTEXT)');

  // Verify evidence code exists on all items
  const allHaveEvidence = allItems.every(item => typeof item.evidence === 'string' && item.evidence.length > 0);
  assert(allHaveEvidence, '100% of SWOT items contain explicit evidence codes / question IDs');

  // --------------------------------------------------------------------------
  // 5. EVIDENCE MAP VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 5. EVIDENCE MAP AUDIT ---');
  const evidenceMap = dualLayer.consultantDossier.evidence_map;
  assert(evidenceMap.length > 0, `Evidence map populated with ${evidenceMap.length} finding links`);

  const hasFindingWithEvidence = evidenceMap.some(em => 
    em.supporting_question_ids.length > 0 && em.supporting_answers.length > 0
  );
  assert(hasFindingWithEvidence, 'Evidence map successfully links findings to question IDs and client answer quotes');

  // --------------------------------------------------------------------------
  // 6. CONSULTANT BRIEF & CONSULTANT NOTE VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 6. CONSULTANT BRIEF & NOTE AUDIT ---');
  const brief = dualLayer.consultantDossier.consultant_brief;
  assert(typeof brief.health_score === 'number' && brief.health_score > 0, 'Consultant brief contains health score');
  assert(brief.confidence === scoreResult.overallConfidence, 'Consultant brief contains matching confidence level');
  assert(brief.coverage === scoreResult.overallCoverage, 'Consultant brief contains matching coverage level');
  assert(brief.top_3_findings.length > 0, 'Consultant brief contains top findings');
  assert(brief.top_blind_spot.title.length > 0, 'Consultant brief contains top blind spot');
  assert(brief.plain_text.length > 100, 'Consultant brief plain text format generated for copying');
  assert(!brief.plain_text.includes('undefined'), 'Consultant brief plain text contains ZERO "undefined" strings');

  const note = dualLayer.consultantDossier.consultant_note;
  assert(note.strongest_signal.length > 0, 'Consultant note has strongest signal');
  assert(note.highest_risk_issue.length > 0, 'Consultant note has highest risk issue');
  assert(note.biggest_contradiction.length > 0, 'Consultant note has biggest operational contradiction');
  assert(note.most_important_blind_spot.length > 0, 'Consultant note has blind spot summary');
  assert(note.financial_uncertainty.length > 0, 'Consultant note has financial uncertainty analysis');
  assert(note.likely_decision_barrier.length > 0, 'Consultant note has likely decision barrier');
  assert(note.questions_worth_exploring.length >= 3, 'Consultant note has at least 3 exploratory questions');

  // --------------------------------------------------------------------------
  // 7. FINANCIAL ANALYSIS & AUDIT VERIFICATION
  // --------------------------------------------------------------------------
  console.log('\n--- 7. FINANCIAL AUDIT VERIFICATION ---');
  const finCalc = dualLayer.consultantDossier.financial_calculations;
  assert(finCalc.is_computable === true, 'Financial calculations marked computable with valid inputs');
  assert(finCalc.monthly_revenue.value === 350000, 'Monthly revenue correctly extracted (350,000)');
  assert(finCalc.annual_revenue.value === 350000 * 12, 'Annual revenue calculated deterministically (4,200,000)');
  assert(finCalc.monthly_revenue.type === 'INPUT', 'Monthly revenue categorized as INPUT');
  assert(finCalc.annual_revenue.type === 'CALCULATED', 'Annual revenue categorized as CALCULATED');

  // --------------------------------------------------------------------------
  // 8. FULL DOSSIER EXPORT TEXT
  // --------------------------------------------------------------------------
  console.log('\n--- 8. DOSSIER EXPORT TEXT VERIFICATION ---');
  const dossierText = dualLayer.consultantDossier.full_dossier_text;
  assert(dossierText.length > 500, 'Full dossier text generated for markdown download');
  assert(!dossierText.includes('undefined'), 'Full dossier text contains ZERO "undefined" strings');
  assert(dossierText.includes('تقنية الأفق للاستشارات'), 'Full dossier text includes company name');
  assert(dossierText.includes('سارة المنصوري'), 'Full dossier text includes client name');
  assert(dossierText.includes('*الأسئلة والإجابات*'), 'WhatsApp dossier includes the question-and-answer section');
  assert(!dossierText.includes('u01'), 'WhatsApp dossier excludes internal question IDs');

  // --------------------------------------------------------------------------
  // 9. WHATSAPP STRICT PRIVACY & PUBLIC CONSULTANT CONTACT
  // --------------------------------------------------------------------------
  console.log('\n--- 9. WHATSAPP PUBLIC CONTACT & PRIVACY CONTRACT ---');
  assert(BIK_CONSULTANT_PUBLIC_WHATSAPP === '201066966515', 'Public WhatsApp number is exactly 201066966515');

  const waResult = buildConsultantWhatsAppUrl({
    isExecutiveReportCTA: true,
    companyName: 'تقنية الأفق للاستشارات'
  });

  assert(waResult.url.startsWith('https://wa.me/201066966515'), 'WhatsApp URL points to verified public consultant phone');
  assert(!waResult.url.includes('350000'), 'WhatsApp URL contains ZERO financial figures');
  assert(!waResult.url.includes('u01'), 'WhatsApp URL contains ZERO question codes');
  assert(!waResult.url.includes('swot'), 'WhatsApp URL contains ZERO diagnostic internal structures');

  // Verify decoded message text
  const urlObj = new URL(waResult.url);
  const textParam = urlObj.searchParams.get('text') || '';
  assert(textParam === BIK_EXECUTIVE_REPORT_WHATSAPP_MESSAGE, 'WhatsApp message matches exact Phase 3A/3B copy specification');

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n============================================================');
  console.log(`PHASE 3B AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase3bAudits().catch(err => {
  console.error('Fatal error in Phase 3B audits:', err);
  process.exit(1);
});
