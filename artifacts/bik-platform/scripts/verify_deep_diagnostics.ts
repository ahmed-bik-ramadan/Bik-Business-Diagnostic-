/**
 * Deep diagnostics contract (batch 3): sector deep tiers, universal fallback,
 * blind-spot computation from declared figures only, and the pipeline wiring.
 * Run: npx tsx scripts/verify_deep_diagnostics.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEEP_TIER_QUESTIONS, UNIVERSAL_DEEP_QUESTIONS, BLIND_SPOT_FORMULAS } from '../src/data/sectorFinancialTaxonomy.ts';
import { computeSectorBlindSpots } from '../src/services/blindSpotCalculator.ts';

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

// 4. Functional checks: every formula computes from declared figures, never invented.
const hc = computeSectorBlindSpots('healthcare', { hd01: 350, hd02: 400, h01: 20, h04: 'high_commit' });
assert.equal(hc.spots.find(s => s.id === 'hc_noshow')?.monthlyAmount, 28000, 'healthcare no-show formula: 350 x 400 x 20%');
const fnb = computeSectorBlindSpots('fnb', { fd02: 60000, f04: 12, fd01: 5000, f05: 'no', f08: 'no_data' });
assert.equal(fnb.spots.find(s => s.id === 'fnb_food_waste')?.monthlyAmount, 7200, 'fnb food waste: 60000 x 12%');
assert.equal(fnb.spots.find(s => s.id === 'fnb_menu_engineering_gap')?.monthlyAmount, 7500, 'fnb menu gap: 5000 x 30 x 5%');
const tech = computeSectorBlindSpots('tech', { ted01: 20000, t02: 5 });
assert.equal(tech.spots.find(s => s.id === 'tech_churn_leak')?.monthlyAmount, 1000, 'tech churn is a pure accounting identity: MRR x churn%');
const re = computeSectorBlindSpots('realestate', { red01: 100, red02: 5000, re01: 10, re06: 20 });
assert.equal(re.spots.find(s => s.id === 're_cancellation_leak')?.monthlyAmount, 10000, 'realestate cancellation: 100 x 10% x 20% x 5000');
assert.equal(re.spots.find(s => s.id === 're_conversion_gap'), undefined, 'no conversion gap when the declared rate meets the benchmark');
const universal = computeSectorBlindSpots('logistics', { ud02: 50000 });
assert.equal(universal.spots.find(s => s.id === 'univ_collection_leak')?.monthlyAmount, 5000, 'universal fallback: receivables x 10% carrying factor');

// 5. Missing deep fields must yield zero spots, never a guess.
const incomplete = computeSectorBlindSpots('healthcare', { h01: 50 });
assert.equal(incomplete.monthlyTotal, 0, 'no blind spot without the declared deep numbers');
const empty = computeSectorBlindSpots(undefined, {});
assert.equal(empty.monthlyTotal, 0, 'no sector and no answers produce no spots');

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
