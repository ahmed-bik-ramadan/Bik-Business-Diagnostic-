import assert from 'node:assert/strict';
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

console.log(JSON.stringify({
  suite: 'value_model', passed: 14,
  exactCase: { gross: [exact.grossImpactLow, exact.grossImpactHigh], week: [exact.focusedWeekNetBenefitLow, exact.focusedWeekNetBenefitHigh], month: [exact.monthlyRetainerNetBenefitLow, exact.monthlyRetainerNetBenefitHigh], noImprovement: [exact.focusedWeekNoImprovementNetBenefit, exact.monthlyRetainerNoImprovementNetBenefit] },
  incomplete: { computable: incomplete.isComputable, gaps: incomplete.gaps },
  currency: { computable: unknownCurrency.isComputable, currency: unknownCurrency.currency },
  incremental: { gross: [incremental.grossImpactLow, incremental.grossImpactHigh], semantics: incremental.assumptions.at(-1) }
}, null, 2));
