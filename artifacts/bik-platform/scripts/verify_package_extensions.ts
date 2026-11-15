import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateDeclaredValueModel } from '../src/services/financialValueModel';
import { getActiveKnowledgeTrace } from '../src/data/activeKnowledgeRules';

const value = calculateDeclaredValueModel({
  mode: 'reducible_waste',
  monthlyReducibleWaste: 3000,
  reductionLowPct: 20,
  reductionHighPct: 40,
  implementationCost: 100,
  evaluationDays: 30,
  currency: 'USD',
  focusedWeekFee: 272,
  monthlyRetainerFee: 499
});
assert.deepEqual(
  [value.grossImpactLow, value.grossImpactHigh, value.netBenefitLow, value.netBenefitHigh],
  [600, 1200, 500, 1100]
);
assert.deepEqual(
  [value.focusedWeekNetBenefitLow, value.focusedWeekNetBenefitHigh, value.monthlyRetainerNetBenefitLow, value.monthlyRetainerNetBenefitHigh],
  [228, 828, 1, 601]
);
assert.deepEqual(
  [value.focusedWeekNoImprovementNetBenefit, value.monthlyRetainerNoImprovementNetBenefit],
  [-372, -599]
);
assert.equal(value.disclaimer.includes('لا يعادل الخسارة التاريخية'), true);

const retailMargin = getActiveKnowledgeTrace('retail', { u06: 5 }, {});
assert.equal(retailMargin.some(rule => rule.id === 'retail-margin-erosion-path' && rule.evidenceStatus === 'OBSERVED'), true);
const retailConversion = getActiveKnowledgeTrace('retail', { u09: 20 }, {});
assert.equal(retailConversion.some(rule => rule.id === 'retail-conversion-path' && rule.evidenceStatus === 'OBSERVED'), true);
const earlyStage = getActiveKnowledgeTrace('healthcare', { }, { companyAge: 'أقل من سنة', breakEven: 'لا بعد' });
assert.equal(earlyStage.some(rule => rule.id === 'early-stage-separation' && rule.evidenceStatus === 'OBSERVED'), true);
const noRuleWithoutEvidence = getActiveKnowledgeTrace('retail', {}, {});
assert.equal(noRuleWithoutEvidence.length, 0);

const db = fs.readFileSync('server/db.ts', 'utf8');
assert.equal(db.includes("= 'session_only'"), true);
assert.equal(db.includes('loadLocalDb'), false);
assert.equal(db.includes("storageMode: 'postgresql'"), false);
const api = fs.readFileSync('src/services/api.ts', 'utf8');
assert.equal(api.includes("storageMode: 'session_only'"), true);
assert.equal(api.includes('persisted: false'), true);
const leadGate = fs.readFileSync('src/pages/LeadGate.tsx', 'utf8');
assert.equal(leadGate.includes('bik-sharing-consent:'), true);
assert.equal(leadGate.includes('submitLeadApi'), false);
const consultant = fs.readFileSync('src/pages/consultant/ConsultantPage.jsx', 'utf8');
assert.equal(consultant.includes('wa.me'), true);

console.log('PACKAGE EXTENSIONS: 15 PASSED, 0 FAILED');
