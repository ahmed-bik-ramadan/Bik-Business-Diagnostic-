// scripts/verify_phase1_diagnostics.ts
// Verification script for Phase 1 Diagnostic Logic, Polarity, Hypotheses & Financial Calculations

import { evaluateDiagnosticState, extractEvidenceFromAnswer } from '../src/services/adaptiveDiagnosticEngine';
import { getSectorTaxonomy } from '../src/data/sectorRegistry';
import { STRATEGIC_HYPOTHESES } from '../src/data/diagnosticHypotheses';
import {
  parseNetMargin,
  calculateFinancialImpact,
  extractFinancialInputs,
  U06_CATEGORICAL_MAP
} from '../src/services/deterministicScoring';
import { getEnrichedQuestion } from '../src/data/questionClassification';
import { universalQuestions } from '../src/data/universalQuestions';

let passed = 0;
let failed = 0;

function assert(condition: boolean, title: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${title}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${title}${detail ? ` -> ${detail}` : ''}`);
    failed++;
  }
}

async function runPhase1Audits() {
  console.log('============================================================');
  console.log('PHASE 1 DIAGNOSTIC & VERIFICATION AUDIT SUITE');
  console.log('============================================================\n');

  // --- 1. Test h01 (No-Show Rate) Direction & Hypothesis Trigger ---
  console.log('--- 1. Healthcare h01 (No-Show Rate) Direction & Trigger ---');
  const hcTaxonomy = getSectorTaxonomy('healthcare');
  assert(!!hcTaxonomy, 'Healthcare taxonomy exists and is registered');

  const h01Q = hcTaxonomy?.questions.find(q => q.id === 'h01');
  assert(!!h01Q, 'h01 question definition exists in healthcare taxonomy');

  // Evidence extraction polarity for h01 (higher is worse in no-show)
  if (h01Q) {
    const evLow = extractEvidenceFromAnswer(h01Q, 5);
    assert(evLow !== null, 'h01=5 produces evidence');
    assert(evLow?.polarity !== 'negative', 'h01=5 (low no-show) is NOT negative');

    const evHigh = extractEvidenceFromAnswer(h01Q, 35);
    assert(evHigh !== null, 'h01=35 produces evidence');
    assert(evHigh?.polarity === 'negative', 'h01=35 (high no-show > 20%) is correctly classified as negative signal');
  }

  // Hypothesis trigger for hyp_hc_no_show_leak (trigger: h01 > 20)
  const hypStateLow = evaluateDiagnosticState(
    hcTaxonomy?.questions || [],
    hcTaxonomy?.hypotheses || [],
    { h01: 5 }
  );
  const noShowHypLow = hypStateLow.activeHypotheses.find(h => h.id === 'hyp_hc_no_show_leak');
  assert(noShowHypLow === undefined, 'h01=5 does NOT trigger hyp_hc_no_show_leak (healthy rate)');

  const hypStateHigh = evaluateDiagnosticState(
    hcTaxonomy?.questions || [],
    hcTaxonomy?.hypotheses || [],
    { h01: 25 }
  );
  const noShowHypHigh = hypStateHigh.activeHypotheses.find(h => h.id === 'hyp_hc_no_show_leak');
  assert(noShowHypHigh !== undefined, 'h01=25 (>20) DOES trigger hyp_hc_no_show_leak');

  // --- 2. Test u06 (Net Margin) Parsing & Categorical vs Numeric ---
  console.log('\n--- 2. u06 Net Margin Parsing & Categorical Precedence ---');
  // Numeric values
  const parseNum4 = parseNetMargin(4);
  assert(parseNum4.value === 4 && parseNum4.isExact === true && parseNum4.isGap === false, 'parseNetMargin(4) returns exact value 4');

  const parseNum12_7 = parseNetMargin('12.7');
  assert(parseNum12_7.value === 12.7 && parseNum12_7.isExact === true, 'parseNetMargin("12.7") returns exact value 12.7');

  // Categorical keys
  const parseLt5 = parseNetMargin('lt5');
  assert(parseLt5.value === 2.5 && parseLt5.isExact === false && parseLt5.isGap === false, 'parseNetMargin("lt5") returns midpoint 2.5');

  const parse5_10 = parseNetMargin('5_10');
  assert(parse5_10.value === 7.5 && parse5_10.isExact === false, 'parseNetMargin("5_10") returns midpoint 7.5');

  const parse10_20 = parseNetMargin('10_20');
  assert(parse10_20.value === 15 && parse10_20.isExact === false, 'parseNetMargin("10_20") returns midpoint 15');

  const parseGt20 = parseNetMargin('gt20');
  assert(parseGt20.value === 25 && parseGt20.isExact === false, 'parseNetMargin("gt20") returns 25');

  // Unknown / Gap
  const parseUnknown = parseNetMargin('unknown');
  assert(parseUnknown.value === null && parseUnknown.isGap === true, 'parseNetMargin("unknown") marks gap');

  const parseEmpty = parseNetMargin('');
  assert(parseEmpty.value === null && parseEmpty.isGap === false, 'parseNetMargin("") returns null safely');

  // Numeric precedence: If user types "15" instead of "10_20", it is exact
  const parseExact15 = parseNetMargin(15);
  assert(parseExact15.isExact === true && parseExact15.value === 15, 'Numeric 15 is flagged as isExact=true');

  // --- 3. Test u09 Conversion Rate (Slider Polarity) ---
  console.log('\n--- 3. u09 Lead Conversion Rate (Direction & Polarity) ---');
  const u09Def = universalQuestions.find(q => q.id === 'u09');
  assert(!!u09Def, 'u09 question definition exists');
  if (u09Def) {
    const enrichedU09 = getEnrichedQuestion(u09Def);
    const evLowConv = extractEvidenceFromAnswer(enrichedU09, 10);
    assert(evLowConv?.polarity === 'negative', 'u09=10 (low conversion) is negative signal');

    const evHighConv = extractEvidenceFromAnswer(enrichedU09, 75);
    assert(evHighConv?.polarity === 'positive', 'u09=75 (high conversion) is positive signal');
  }

  // --- 4. Healthcare False Negative Inferences Guard (h10 waiting & h07 insurance) ---
  console.log('\n--- 4. Healthcare Inferences Verification (h10 waiting, h07 insurance) ---');
  // Scenario: h01=5 (low cancellation), h04="high_commit" (high patient retention), h10="waiting" (wait time complaint)
  // Ensure NO false hypothesis triggers like hyp_hc_no_show_leak or hyp_hc_retention_gap
  const hcStateGood = evaluateDiagnosticState(
    hcTaxonomy?.questions || [],
    hcTaxonomy?.hypotheses || [],
    {
      h01: 5,
      h04: 'high_commit',
      h10: 'waiting'
    }
  );
  const leakHyp = hcStateGood.activeHypotheses.find(h => h.id === 'hyp_hc_no_show_leak');
  const retentionHyp = hcStateGood.activeHypotheses.find(h => h.id === 'hyp_hc_retention_gap');
  assert(leakHyp === undefined, 'h10="waiting" does NOT trigger no_show_leak when h01 is healthy (5%)');
  assert(retentionHyp === undefined, 'h10="waiting" does NOT trigger retention_gap when h04 is high_commit');

  // Verify h07="mostly_insurance"
  const h07Q = hcTaxonomy?.questions.find(q => q.id === 'h07');
  assert(!!h07Q, 'h07 exists in healthcare questions');
  if (h07Q) {
    const evH07 = extractEvidenceFromAnswer(h07Q, 'mostly_insurance');
    assert(evH07 !== null, 'h07 evidence extracted');
    // mostly_insurance indicates business model dependency, NOT bad collection
    assert(evH07?.polarity !== 'negative', 'h07=mostly_insurance is NOT treated as poor collection defect');
  }

  // --- 5. Financial Math Verification ---
  console.log('\n--- 5. Financial Calculation Math Verification ---');
  // Revenue: 100,000, Margin: 15% -> Monthly Profit: 15,000, Annual: 180,000
  const finInputs = extractFinancialInputs(
    { u31: 100000, u06: 15, u35: 'SAR' },
    {}
  );
  assert(finInputs.monthlyRevenue === 100000, 'Monthly revenue correctly extracted as 100,000');
  assert(finInputs.netMarginPct === 15, 'Net margin correctly extracted as 15%');

  const finImpact = calculateFinancialImpact(finInputs);
  assert(finImpact.metrics.monthlyNetProfit?.value === 15000, 'Monthly net profit is exactly 15,000');
  assert(finImpact.metrics.annualNetProfit?.value === 180000, 'Annual net profit is exactly 180,000');
  assert(finImpact.metrics.annualRevenue?.value === 1200000, 'Annual revenue is exactly 1,200,000');

  // Verify margin improvement scenario (+5% points)
  const marginScenario = finImpact.scenarios.find(s => s.type === 'net_margin_improvement');
  assert(marginScenario !== undefined, 'Net margin improvement scenario generated');
  assert(marginScenario?.currentValue === 15, 'Scenario base margin is 15%');
  assert(marginScenario?.targetValue === 20, 'Scenario target margin is 20% (+5%)');
  assert(marginScenario?.projectedMonthlyGain === 5000, 'Scenario monthly gain is exactly 5,000 (100k * 5%)');
  assert(marginScenario?.projectedAnnualGain === 60000, 'Scenario annual gain is exactly 60,000 (5,000 * 12)');

  // Missing revenue case: 0 hallucination
  const emptyFinInputs = extractFinancialInputs({}, {});
  const emptyFinImpact = calculateFinancialImpact(emptyFinInputs);
  assert(emptyFinImpact.metrics.monthlyNetProfit?.value === null, 'Missing revenue yields NULL profit (zero hallucinated figures)');
  assert(emptyFinImpact.identifiedGaps.length >= 2, 'Identified financial data gaps recorded');

  // Summary
  console.log('\n============================================================');
  console.log(`PHASE 1 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('============================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase1Audits().catch((err) => {
  console.error('Audit run error:', err);
  process.exit(1);
});
