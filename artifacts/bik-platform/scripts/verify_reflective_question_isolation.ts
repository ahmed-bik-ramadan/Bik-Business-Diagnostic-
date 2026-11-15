import assert from 'node:assert/strict';
import { universalQuestions } from '../src/data/universalQuestions';
import { DIAGNOSTIC_DIMENSIONS, computeDeterministicScore } from '../src/services/deterministicScoring';
import { calculateDiagnosticCoverage, getNextAdaptiveQuestion } from '../src/services/adaptiveDiagnosticEngine';
import { UNIVERSAL_QUESTION_METADATA } from '../src/data/questionClassification';

const reflectiveQuestion = universalQuestions.find((question) => question.id === 'u30');
assert.ok(reflectiveQuestion, 'u30 remains in the question catalog');
assert.equal(
  Object.values(DIAGNOSTIC_DIMENSIONS).some((questionIds) => questionIds.includes('u30')),
  false,
  'u30 is excluded from diagnostic dimensions'
);
assert.equal(UNIVERSAL_QUESTION_METADATA.u30?.diagnosticRole, 'context', 'u30 is classified as context');
assert.equal(UNIVERSAL_QUESTION_METADATA.u30?.measurable, false, 'u30 is not measurable');
assert.equal(reflectiveQuestion?.options?.some((option) => /%|إيرادات|أرباح/.test(option.label)), false, 'u30 has no financial-loss options');

const baseAnswers = {
  u01: 'always',
  u04: 'expected',
  u06: '10_20',
  u09: 72,
  u10: '40_60',
  u25: 'specific_number',
  u31: 100000,
  u32: 20,
  u33: 50,
  u35: 'EGP'
};

const withoutReflection = computeDeterministicScore(baseAnswers);
const withLowReflection = computeDeterministicScore({ ...baseAnswers, u30: 'profitability_time' });
const withHighReflection = computeDeterministicScore({ ...baseAnswers, u30: 'expansion' });
const withUnknownReflection = computeDeterministicScore({ ...baseAnswers, u30: 'unknown' });
const coverageWithoutReflection = calculateDiagnosticCoverage(universalQuestions as any, baseAnswers);
const coverageWithReflection = calculateDiagnosticCoverage(universalQuestions as any, { ...baseAnswers, u30: 'expansion' });

assert.deepEqual(withLowReflection, withoutReflection, 'u30 low answer does not change score outputs');
assert.deepEqual(withHighReflection, withoutReflection, 'u30 high answer does not change score outputs');
assert.deepEqual(withUnknownReflection, withoutReflection, 'u30 unknown answer does not change score outputs');
assert.equal(withHighReflection.overall, withoutReflection.overall, 'overall score is unchanged');
assert.equal(withHighReflection.overallCoverage, withoutReflection.overallCoverage, 'overall coverage is unchanged');
assert.equal(withHighReflection.overallConfidence, withoutReflection.overallConfidence, 'overall confidence is unchanged');
assert.equal(
  JSON.stringify(withHighReflection.financialImpact),
  JSON.stringify(withoutReflection.financialImpact),
  'financial calculations are unchanged'
);
assert.equal(
  JSON.stringify(withHighReflection.axisDetails),
  JSON.stringify(withoutReflection.axisDetails),
  'axis details and axis evidence are unchanged'
);
assert.equal(
  withHighReflection.dataGaps.some((gap) => gap.questionId === 'u30'),
  false,
  'u30 never becomes a diagnostic data gap'
);
assert.deepEqual(coverageWithReflection, coverageWithoutReflection, 'u30 does not change adaptive coverage');

function answerFor(question: any): unknown {
  if (question.type === 'single_choice' || question.type === 'single') return question.options?.[0]?.value ?? 'unknown';
  if (question.type === 'multi_choice' || question.type === 'multi') return question.options?.[0]?.value ? [question.options[0].value] : ['unknown'];
  if (question.type === 'number' || question.type === 'slider' || question.type === 'percentage') return question.min ?? 0;
  return 'إجابة اختبارية مفهومة';
}

function simulateJourney(diagnosticDepth: 'quick' | 'deep'): string[] {
  const answers: Record<string, unknown> = {};
  const shown: string[] = [];
  for (let step = 0; step < 180; step += 1) {
    const next = getNextAdaptiveQuestion({ diagnosticDepth, sectorL1: '', sectorL2: '', answers });
    if (next.isComplete || !next.question) break;
    assert.equal(shown.includes(next.question.id), false, `${diagnosticDepth}: question is shown once`);
    shown.push(next.question.id);
    answers[next.question.id] = answerFor(next.question);
  }
  return shown;
}

const quickShown = simulateJourney('quick');
const deepShown = simulateJourney('deep');
assert.equal(quickShown.filter((id) => id === 'u30').length, 1, 'quick mode shows u30 exactly once');
assert.equal(deepShown.filter((id) => id === 'u30').length, 1, 'deep mode shows u30 exactly once');
assert.equal(quickShown.indexOf('u30') >= 27, true, 'quick mode places u30 near the end');
assert.equal(deepShown.indexOf('u30') >= deepShown.length - 5, true, 'deep mode places u30 near the end');

console.log('Reflective question isolation: PASS');
console.log(JSON.stringify({ overall: withoutReflection.overall, coverage: withoutReflection.overallCoverage, confidence: withoutReflection.overallConfidence }));
