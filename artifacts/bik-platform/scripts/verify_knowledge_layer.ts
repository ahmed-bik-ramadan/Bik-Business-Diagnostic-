import assert from 'node:assert/strict';
import { ACTIVE_KNOWLEDGE_RULES, getActiveKnowledgeTrace } from '../src/data/activeKnowledgeRules';

const marginRule = ACTIVE_KNOWLEDGE_RULES.find(rule => rule.id === 'retail-margin-erosion-path')!;
const conversionRule = ACTIVE_KNOWLEDGE_RULES.find(rule => rule.id === 'retail-conversion-path')!;
assert.equal(marginRule.sourceRecordId, 'RT-MARGIN-EROS');
assert.deepEqual(marginRule.questionIds, ['u05', 'u06', 'u31']);
assert.equal(conversionRule.sourceRecordId, 'RT-CAC-LTV');
assert.deepEqual(conversionRule.questionIds, ['u09', 'u10', 'u12']);

const marginObserved = getActiveKnowledgeTrace('retail', { u06: 5 }, {});
assert.equal(marginObserved.find(rule => rule.id === marginRule.id)?.evidenceStatus, 'OBSERVED');
assert.equal(getActiveKnowledgeTrace('retail', { u06: 25 }, {}).find(rule => rule.id === marginRule.id)?.evidenceStatus, 'HYPOTHESIS');
assert.equal(getActiveKnowledgeTrace('retail', { u06: 25, u05: 'profitable' }, {}).find(rule => rule.id === marginRule.id)?.evidenceStatus, 'HYPOTHESIS');

const conversionObserved = getActiveKnowledgeTrace('retail', { u09: 20 }, {});
assert.equal(conversionObserved.find(rule => rule.id === conversionRule.id)?.evidenceStatus, 'OBSERVED');
assert.equal(getActiveKnowledgeTrace('retail', { u09: 60 }, {}).find(rule => rule.id === conversionRule.id)?.evidenceStatus, 'HYPOTHESIS');

const sameSectorPaths = new Set([...marginObserved, ...conversionObserved].map(rule => rule.id));
assert.deepEqual([...sameSectorPaths].sort(), ['retail-conversion-path', 'retail-margin-erosion-path']);
for (const trace of [...marginObserved, ...conversionObserved]) {
  assert.equal(typeof trace.sourceScope, 'string');
  assert.equal(trace.serviceBoundary.includes('لا'), true);
  assert.equal('numericScore' in trace, false);
  assert.equal('serviceOffer' in trace, false);
}

const blockedArchive = getActiveKnowledgeTrace('retail', {}, {});
assert.equal(blockedArchive.length, 0);
const earlyStage = getActiveKnowledgeTrace('healthcare', {}, { companyAge: 'أقل من سنة', breakEven: 'لا بعد' });
assert.equal(earlyStage.find(rule => rule.id === 'early-stage-separation')?.evidenceStatus, 'OBSERVED');
assert.equal(earlyStage.find(rule => rule.id === 'early-stage-separation')?.serviceBoundary.includes('لا تُستنتج خسائر'), true);

console.log(JSON.stringify({
  suite: 'knowledge_layer',
  passed: 20,
  sameSectorExamples: [
    { activity: 'تجزئة بهامش معلن 5%', rule: marginRule.id, source: marginRule.sourceRecordId, questions: marginRule.questionIds, status: 'OBSERVED', service: marginRule.serviceBoundary },
    { activity: 'تجزئة بنسبة تحويل 20%', rule: conversionRule.id, source: conversionRule.sourceRecordId, questions: conversionRule.questionIds, status: 'OBSERVED', service: conversionRule.serviceBoundary }
  ],
  blockedRecordsBecomeConfirmedNumericJudgments: false
}, null, 2));
