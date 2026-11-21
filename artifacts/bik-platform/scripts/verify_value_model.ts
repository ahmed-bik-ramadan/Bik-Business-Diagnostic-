import assert from 'node:assert/strict';
import { EXECUTIVE_LOSS_THRESHOLD_USD, FX_RATES_PER_USD } from '../src/config/appConfig';
import { lossSustainsExecutive } from '../src/services/offerRecommendation';
import { calculateDeclaredValueModel } from '../src/services/financialValueModel';

const exact = calculateDeclaredValueModel({
  mode: 'reducible_waste', monthlyReducibleWaste: 3000, reductionLowPct: 20,
  reductionHighPct: 40, implementationCost: 100, evaluationDays: 30,
  currency: 'USD', focusedWeekFee: 272, monthlyRetainerFee: 499
});
assert.deepEqual([exact.grossImpactLow, exact.grossImpactHigh], [600, 1200]);
assert.deepEqual([exact.focusedWeekNetBenefitLow, exact.focusedWeekNetBenefitHigh], [228, 828]);
assert.deepEqual([exact.monthlyRetainerNetBenefitLow, exact.monthlyRetainerNetBenefitHigh], [1, 601]);
assert.deepEqual([exact.focusedWeekNoImprovementNetBenefit, exact.monthlyRetainerNoImprovementNetBenefit], [-372, -599]);

const incomplete = calculateDeclaredValueModel({
  mode: 'reducible_waste', monthlyReducibleWaste: 3000, reductionLowPct: null,
  reductionHighPct: 40, implementationCost: 100, evaluationDays: 30,
  currency: 'USD', focusedWeekFee: 272, monthlyRetainerFee: 499
});
assert.equal(incomplete.isComputable, false);
assert.equal(incomplete.grossImpactLow, null);
assert.equal(incomplete.netBenefitHigh, null);
assert.equal(incomplete.gaps.includes('نسبة التقليل المنخفضة'), true);

const unknownCurrency = calculateDeclaredValueModel({
  mode: 'reducible_waste', monthlyReducibleWaste: 3000, reductionLowPct: 20,
  reductionHighPct: 40, implementationCost: 100, evaluationDays: 30,
  currency: '', focusedWeekFee: 272, monthlyRetainerFee: 499
});
assert.equal(unknownCurrency.isComputable, false);
assert.equal(unknownCurrency.currency, '');
assert.equal(unknownCurrency.grossImpactLow, 600);
assert.equal(unknownCurrency.gaps.includes('عملة نموذج القيمة'), true);

const incremental = calculateDeclaredValueModel({
  mode: 'incremental_sales_contribution', monthlyIncrementalSales: 5000,
  contributionMarginPct: 30, implementationCost: 100, evaluationDays: 30,
  currency: 'USD', focusedWeekFee: 272, monthlyRetainerFee: 499
});
assert.deepEqual([incremental.grossImpactLow, incremental.grossImpactHigh], [1500, 1500]);
assert.equal(incremental.assumptions.some(item => item.includes('ربح مساهمة لا إيراد خام')), true);
assert.equal(incremental.netBenefitLow, 1400);

let currencyChecks = 0;
for (const [currency, rate] of Object.entries(FX_RATES_PER_USD)) {
  const threshold = EXECUTIVE_LOSS_THRESHOLD_USD * rate;
  for (const [amount, expected] of [[threshold - 0.01, false], [threshold, true], [threshold + 0.01, true]] as const) {
    assert.equal(lossSustainsExecutive({amount, currency}), expected, `${currency}: threshold at the published rate`);
    currencyChecks++;
  }
}
for (const loss of [null, undefined, {amount: 1e9, currency: 'EUR'}, {amount: 1e9, currency: ''},
  {amount: 1e9, currency: 'constructor'}, {amount: NaN, currency: 'USD'}, {amount: Infinity, currency: 'EGP'}]) {
  assert.equal(lossSustainsExecutive(loss), false, 'an absent loss or rate cannot support the executive recommendation');
  currencyChecks++;
}
console.log(JSON.stringify({
  suite: 'value_model', passed: 14 + currencyChecks,
  exactCase: { gross: [exact.grossImpactLow, exact.grossImpactHigh], week: [exact.focusedWeekNetBenefitLow, exact.focusedWeekNetBenefitHigh], month: [exact.monthlyRetainerNetBenefitLow, exact.monthlyRetainerNetBenefitHigh], noImprovement: [exact.focusedWeekNoImprovementNetBenefit, exact.monthlyRetainerNoImprovementNetBenefit] },
  incomplete: { computable: incomplete.isComputable, gaps: incomplete.gaps },
  currency: { computable: unknownCurrency.isComputable, currency: unknownCurrency.currency },
  incremental: { gross: [incremental.grossImpactLow, incremental.grossImpactHigh], semantics: incremental.assumptions.at(-1) }
}, null, 2));
