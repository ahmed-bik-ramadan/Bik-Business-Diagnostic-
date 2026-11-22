/**
 * Deep diagnostics contract (batch 3): sector deep tiers, universal fallback,
 * blind-spot computation from declared figures only, and the pipeline wiring.
 * Run: npx tsx scripts/verify_deep_diagnostics.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportPreview } from '../src/components/report/ReportPreview';
import { DEEP_TIER_QUESTIONS, UNIVERSAL_DEEP_QUESTIONS, BLIND_SPOT_FORMULAS } from '../src/data/sectorFinancialTaxonomy.ts';
import { computeSectorBlindSpots, declaredSectorRows, legacySectorLossTotal } from '../src/services/blindSpotCalculator';
import { computeDeterministicScore } from '../src/services/deterministicScoring';
import { createFallbackReport } from '../src/services/reportFallback';
import { computeCostOfProblem } from '../src/services/valueModule/compute';

// 1. Nine sectors carry their own deep tier.
const expectedSectors = ['healthcare', 'automotive', 'retail', 'fnb', 'realestate', 'professional', 'import', 'tech', 'construction'];
for (const sector of expectedSectors) {
  assert.ok(DEEP_TIER_QUESTIONS[sector]?.length > 0, `${sector} has its own deep questions`);
}
assert.ok(DEEP_TIER_QUESTIONS.healthcare[0].question.includes('بعملة نشاطك'), 'deep questions are currency-neutral, no fixed currency');

// 2. Every other sector still gets a universal deep tier.
assert.ok(UNIVERSAL_DEEP_QUESTIONS.length >= 2, 'universal deep tier exists (revenue + receivables)');
assert.ok(UNIVERSAL_DEEP_QUESTIONS.some(q => q.id === 'ud02' && q.question.includes('ذمم مدينة')), 'universal receivables question present');

// 3. Formulas cover the nine sectors plus the universal fallback.
for (const sector of expectedSectors) {
  assert.ok(BLIND_SPOT_FORMULAS[sector]?.length > 0, `${sector} has blind-spot formulas`);
}
assert.ok(BLIND_SPOT_FORMULAS.universal?.length > 0, 'universal fallback formulas exist');

// 4. Check two independent arithmetic examples for every formula.
type Answers = Record<string, string | number>;
type Example = [answers: Answers, expected: number | null];
const lossExamples: Record<string, [Example, Example]> = {
  hc_noshow: [[{hd01: 350, hd02: 400, h01: 20}, 28000], [{hd01: 22, hd02: 15, h01: 25}, 83]],
  fnb_food_waste: [[{fd02: 60000, f04: 12}, 7200], [{fd02: 12500, f04: 7.5}, 938]],
  re_cancellation_leak: [[{red01: 100, red02: 5000, re01: 10, re06: 20}, 10000], [{red01: 75, red02: 1200, re01: 20, re06: 40}, 7200]],
  tech_churn_leak: [[{ted01: 20000, t02: 5}, 1000], [{ted01: 12345, t02: 4}, 494]]
};
const sensitivityExamples: Record<string, [Example, Example]> = {
  hc_followup_gap: [[{hd01: 350, hd02: 400, h04: 'high_commit'}, 1400], [{hd01: 25, hd02: 51, h04: 'high_low'}, 12.75]],
  auto_rework: [[{ad01: 120, a03: 10, a09: '500_1500'}, null], [{ad01: 313, a03: 5, a09: 'gt3000', u34: 3485}, null]],
  auto_idle_capacity: [[{ad02: 4, ad03: 60, a04: '60_80'}, null], [{ad02: 3, ad03: 95, a04: 'lt60'}, null]],
  retail_dead_stock: [[{rd01: 800000, rt03: 'discount'}, 8000], [{rd01: '٢٬٣١٢٫٥', rt03: 'proactive'}, 23.125]],
  retail_conversion_gap: [[{rd02: 2000, rd03: 450, rt01: 'lt10'}, 9000], [{rd02: 25, rd03: 50, rt01: 'gt30'}, 12.5]],
  fnb_menu_engineering_gap: [[{fd01: 5000, u31: 22000, f05: 'no', f08: 'no_data'}, 220], [{fd01: 3200, u31: 12780, f05: 'yes_reactive'}, 127.8]],
  re_conversion_gap: [[{red01: 100, red02: 5000, re01: 10}, 5000], [{red01: 75, red02: 1200, re01: 3}, 900]],
  prof_scope_creep_leak: [[{prd01: 80000, p06: 'contract'}, 800], [{prd01: 18375, p06: 'verbal'}, 183.75]],
  prof_automation_leak: [[{prd01: 80000, p04: 30}, null], [{prd01: 18375, p04: 75}, null]],
  import_dead_stock_capital: [[{imd01: 1200000, im01: 'medium'}, 12000], [{imd01: 23156, im01: 'low_turnover'}, 231.56]],
  import_forex_leak: [[{imd02: 200000, im04: 'hedging'}, 2000], [{imd02: 67890, im04: 'absorb'}, 678.9]],
  tech_infra_excess: [[{u31: 50000, ted01: 40000, t12: 35}, 500], [{u31: 10000, ted01: 8000, t12: 20}, 100]],
  const_cost_overrun: [[{cod01: 500000, cod02: 3, c02: 25}, null], [{cod01: 175000, cod02: 8, c02: 50}, null]],
  const_change_order_leak: [[{cod01: 500000, cod02: 3, c08: 'verbal'}, null], [{cod01: 175000, cod02: 8, c08: 'documented'}, null]],
  univ_collection_leak: [[{ud02: 50000}, 500], [{ud02: 3237}, 32.37]]
};
const formulas = Object.values(BLIND_SPOT_FORMULAS).flat();
assert.deepEqual(formulas.map(formula => formula.id).sort(), [...Object.keys(lossExamples), ...Object.keys(sensitivityExamples)].sort());
for (const formula of formulas) {
  const declared = Object.hasOwn(lossExamples, formula.id);
  assert.equal(formula.kind, declared ? 'declaredLoss' : 'sensitivity', formula.id);
  const examples = declared ? lossExamples[formula.id] : sensitivityExamples[formula.id];
  for (const [answers, expected] of examples) {
    assert.equal(formula.compute(answers, answers), expected, formula.id);
    const fields = [...formula.requiredDeepFields, ...formula.requiredAnswerIds];
    for (const field of fields) {
      for (const value of [undefined, '', 0, '٠', -1, 'unknown', Infinity]) {
        const incomplete = { ...answers, [field]: value };
        assert.equal(formula.compute(incomplete, incomplete), null, `${formula.id}: invalid or absent ${field} ${value}`);
      }
    }
  }
  assert.equal(formula.compute({}, {}), null, `${formula.id}: no default amount`);
}
const taxonomySource = fs.readFileSync('src/data/sectorFinancialTaxonomy.ts', 'utf8');
assert.doesNotMatch(taxonomySource, /\b(?:\w*factorMap|ticketMidpoint|GAP_ASSUMPTION|BENCHMARK_PCT|RECOVERABLE_SHARE|HEALTHY_CAP_PCT|OVERRUN_DEPTH|CHANGE_ORDER_LEAK|WORKING_HOURS_PER_MONTH|UNHEDGED_FX_FACTOR|UNIV_RECEIVABLES_CARRY_FACTOR)\b/i);
assert.doesNotMatch(taxonomySource.slice(taxonomySource.indexOf('type Answers')), /\b0?\.\d+|\?\?\s*\d|\|\|\s*0\b/, 'compute code has no fixed fractions or numeric defaults');

const mixed = computeSectorBlindSpots('healthcare', { hd01: 350, hd02: 400, h01: 20, h04: 'high_commit' });
assert.deepEqual(mixed.spots.map(row => [row.id, row.monthlyAmount]), [['hc_noshow', 28000]]);
assert.deepEqual(mixed.sensitivities.map(row => [row.id, row.monthlyAmount]), [['hc_followup_gap', 1400]]);
assert.equal(mixed.monthlyTotal, 28000, 'only the declared loss enters the sector total');
const universal = computeSectorBlindSpots('logistics', { ud02: 50000 });
assert.equal(universal.sensitivities[0]?.monthlyAmount, 500);
assert.equal(universal.monthlyTotal, null, 'a standalone receivables sensitivity creates no loss total');
assert.equal(computeSectorBlindSpots('healthcare', { h01: 50 }).monthlyTotal, null);
assert.equal(computeSectorBlindSpots(undefined, {}).monthlyTotal, null);

// 5. Follow the public fallback into its real preview and check missed and older session data.
function reportFor(sectorL1: string, answers: Answers) {
  return createFallbackReport({
    companyData: { sectorL1, diagnosticDepth: 'deep' },
    scoreResult: computeDeterministicScore(answers),
    answers
  }).dual_layer!.clientReport;
}
const previewOf = (clientReport: ReturnType<typeof reportFor>) => renderToStaticMarkup(createElement(ReportPreview, {clientReport}));
const healthcare = reportFor('healthcare', {u31: 100000, u35: 'EGP', hd01: 350, hd02: 400, h01: 20, h04: 'high_commit'});
assert.equal(healthcare.financial_impact?.declaredValueModel?.computedMonthlyWaste, 28000);
assert.deepEqual(healthcare.financial_impact?.sector_blind_spots?.map(row => row.monthly_amount), [28000]);
assert.match(previewOf(healthcare), /كل نقطة مئوية من فجوة متابعة المرضى تساوي بحسب أرقامك: 1,400 EGP شهرياً \(تقدير استرشادي\)/u);
const separateCalculator = { monthlyRevenue: 100000, monthlyWaste: 4000, ...healthcare.financial_impact,
  sector_sensitivities: healthcare.sector_sensitivities };
assert.equal(computeCostOfProblem(separateCalculator, ['W']).total, 4000, 'the public calculator uses its own waste input');

const stock = reportFor('retail', {u31: 100000, u35: 'USD', rd01: 2500, rt03: 'no_plan'});
assert.match(previewOf(stock), /كل نقطة مئوية من رأس المال المجمَّد في المخزون الراكد تساوي بحسب أرقامك: \$25 شهرياً \(تقدير استرشادي\)/u);
assert.equal(stock.financial_impact?.declaredValueModel?.computedMonthlyWaste, undefined);
assert.doesNotMatch(previewOf(stock), /data-testid="preview-blind-spots"/u);

const professional = reportFor('professional', {prd01: 80000, u35: 'EGP', p06: 'verbal'});
assert.match(previewOf(professional), /كل نقطة مئوية من تسرُّب إيراد بفعل نطاق عمل غير موثَّق تساوي بحسب أرقامك: 800 EGP/u);
const noBase = reportFor('fnb', {u31: '', u35: 'EGP', fd01: 5000, f05: 'no'});
const zeroRevenue = reportFor('professional', {u31: 0, prd01: 80000, u35: 'EGP', p06: 'verbal'});
const noMonthlyBase = reportFor('automotive', {u31: 100000, u35: 'EGP', ad02: 4, ad03: 60, a04: 'lt60'});
for (const report of [noBase, zeroRevenue, noMonthlyBase]) {
  const preview = previewOf(report);
  assert.match(preview, /data-testid="preview-priority"/u);
  assert.deepEqual(report.sector_sensitivities, []);
  assert.doesNotMatch(preview, /كل نقطة مئوية من (الطاقة الفنية الضائعة|تآكل هامش الربح|تسرُّب إيراد)|data-testid="preview-blind-spots"/u);
}
assert.doesNotMatch(previewOf(noBase), /كل نقطة مئوية/u);
assert.doesNotMatch(previewOf(zeroRevenue), /كل نقطة مئوية/u);

const legacyRows = [
  {name: mixed.spots[0].name, monthly_amount: 28000},
  {name: mixed.sensitivities[0].name, monthly_amount: 21000}
];
assert.deepEqual(declaredSectorRows(legacyRows), [legacyRows[0]]);
assert.equal(legacySectorLossTotal(legacyRows), 28000);
const legacy = {...healthcare, sector_sensitivities: undefined,
  financial_impact: {...healthcare.financial_impact!, sector_blind_spots: legacyRows}};
assert.doesNotMatch(previewOf(legacy), /فجوة متابعة المرضى/u);

// 6. Pipeline wiring.
const dualSource = fs.readFileSync('src/services/dualLayerReport.ts', 'utf8');
assert.ok(dualSource.includes('computeSectorBlindSpots'), 'dual-layer report computes sector blind spots');
assert.ok(dualSource.includes('sector_blind_spots'), 'blind spots travel on the client report');
assert.ok(dualSource.includes('computedMonthlyWaste: sectorBlindSpots.monthlyTotal'), 'the derived monthly total feeds the value model');
assert.ok(dualSource.includes('مشتقة من أرقام العميل المصرَّح بها'), 'the dossier grounds blind spots in declared figures');
const registrySource = fs.readFileSync('src/data/sectorRegistry.ts', 'utf8');
assert.ok(registrySource.includes('?? UNIVERSAL_DEEP_QUESTIONS'), 'sectors without their own tier fall back to the universal deep questions');
const modelSource = fs.readFileSync('src/services/financialValueModel.ts', 'utf8');
assert.ok(modelSource.includes('computedMonthlyWaste?: number | null'), 'the value model carries the derived total beside the declared one');
const reportSource = fs.readFileSync('src/pages/Report.tsx', 'utf8');
assert.ok(reportSource.includes('model.computedMonthlyWaste'), 'the report falls back to the derived total only when nothing was declared directly');
const previewSource = fs.readFileSync('src/components/report/ReportPreview.tsx', 'utf8');
assert.ok(previewSource.includes('preview-blind-spots') && previewSource.includes('مشتقة من إجاباتك'), 'the client sees blind spots framed as derived from his own answers');

// 7. The real-loss executive rule stays USD-declared-only: derived totals in other
// currencies can never silently cross into a USD threshold comparison.
const recSource = fs.readFileSync('src/services/offerRecommendation.ts', 'utf8');
assert.ok(recSource.includes("currency !== 'USD'"), 'executive real-loss rule still guards the currency');

console.log('DEEP DIAGNOSTICS CONTRACT: PASSED, 0 FAILED');
