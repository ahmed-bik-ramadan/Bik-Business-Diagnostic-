/**
 * BIK — Verification of Fallback Path Safety & Question Ledger Preservation
 * Asserts that createFallbackReport preserves canonical questionHistory (answered & unanswered)
 * in qa_record and does not fall back to legacy reconstruction.
 */

import { computeDeterministicScore } from '../src/services/deterministicScoring';
import { createFallbackReport } from '../src/services/reportFallback';
import { QuestionLedgerEntry } from '../src/types/dualLayer';

console.log('============================================================');
console.log('BIK AUDIT: FALLBACK PATH SAFETY & QA RECORD PRESERVATION');
console.log('============================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${msg}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failCount++;
  }
}

// 1. Construct realistic session answers
const mockUniversalAnswers = {
  u_rev_model: 'retainer',
  u_sales_cycle: '1_to_3_months',
  u_cash_flow_visibility: 'low'
};

const mockIntakeAnswers = {
  company_name: 'شركة تجريبية للسلامة',
  revenue: 300000,
  net_profit: 30000
};

// 2. Construct canonical questionHistory ledger with at least one answered and one unanswered entry
const mockQuestionHistory: QuestionLedgerEntry[] = [
  {
    sequence: 1,
    questionId: 'u_rev_model',
    questionText: 'ما هو نموذج الإيرادات المعتمد في شركتك؟',
    dimension: 'النموذج التجاري',
    diagnosticRole: 'signal',
    shownAt: 1700000000000,
    answeredAt: 1700000005000,
    status: 'answered',
    answerValue: 'retainer',
    answerText: 'عقود مستمرة (Retainers / الاشتراكات)'
  },
  {
    sequence: 2,
    questionId: 'u_sales_cycle',
    questionText: 'كم تستغرق الدورة البيعية المعتادة لإغلاق الصفقة؟',
    dimension: 'المبيعات والتسويق',
    diagnosticRole: 'signal',
    shownAt: 1700000006000,
    answeredAt: 1700000010000,
    status: 'answered',
    answerValue: '1_to_3_months',
    answerText: 'من شهر إلى 3 أشهر'
  },
  {
    sequence: 3,
    questionId: 'u_cash_flow_visibility',
    questionText: 'ما مدى وضوح التدفقات النقدية المتوقعة خلال الـ 6 أشهر القادمة؟',
    dimension: 'العمليات والمالية',
    diagnosticRole: 'signal',
    shownAt: 1700000012000,
    status: 'unanswered', // Presented but unanswered
    answerValue: undefined,
    answerText: undefined
  }
];

// 3. Compute score result
const scoreResult = computeDeterministicScore(mockUniversalAnswers, mockIntakeAnswers);

// 4. Generate report via createFallbackReport passing questionHistory
const fallbackReportDirect = createFallbackReport({
  scoreResult,
  companyData: {
    companyName: 'شركة تجريبية للسلامة',
    sectorL1: 'services',
    sectorL2: 'consulting',
    diagnosticDepth: 'quick'
  },
  answers: { ...mockIntakeAnswers, ...mockUniversalAnswers },
  questionHistory: mockQuestionHistory
});

console.log('[Test 1]: Direct questionHistory property on FallbackReportInput...');
assert(Boolean(fallbackReportDirect.dual_layer), 'dual_layer exists on fallback report');

const qaRecordDirect = fallbackReportDirect.dual_layer?.consultantDossier?.qa_record || [];
assert(qaRecordDirect.length === 3, `qa_record contains exactly 3 entries matching questionHistory (got: ${qaRecordDirect.length})`);

const entry1 = qaRecordDirect[0];
assert(entry1?.question_id === 'u_rev_model', 'First qa entry has question_id "u_rev_model"');
assert(entry1?.answer_text === 'عقود مستمرة (Retainers / الاشتراكات)', `First qa entry preserves human answer text (got: "${entry1?.answer_text}")`);
assert(entry1?.question_number === 1, 'First qa entry preserves sequence 1');

const entry3 = qaRecordDirect[2];
assert(entry3?.question_id === 'u_cash_flow_visibility', 'Third qa entry has question_id "u_cash_flow_visibility"');
assert(entry3?.answer_text === 'لم تتم الإجابة (عُرض ولم يُجب)', `Third qa entry correctly marked as unanswered (got: "${entry3?.answer_text}")`);
assert(entry3?.question_number === 3, 'Third qa entry preserves sequence 3');

console.log('\n[Test 2]: Nested questionHistory inside answers object (graceful fallback check)...');
const fallbackReportNested = createFallbackReport({
  scoreResult,
  companyData: {
    companyName: 'شركة تجريبية للسلامة 2',
    sectorL1: 'services',
    sectorL2: 'consulting'
  },
  answers: {
    ...mockIntakeAnswers,
    ...mockUniversalAnswers,
    questionHistory: mockQuestionHistory
  }
});

const qaRecordNested = fallbackReportNested.dual_layer?.consultantDossier?.qa_record || [];
assert(qaRecordNested.length === 3, `Nested questionHistory in answers produces 3 qa_record entries (got: ${qaRecordNested.length})`);
assert(qaRecordNested[2]?.answer_text === 'لم تتم الإجابة (عُرض ولم يُجب)', 'Nested unanswered entry correctly preserved');

console.log('\n[Test 3]: Contrast with legacy reconstruction (empty questionHistory)...');
const fallbackReportLegacy = createFallbackReport({
  scoreResult,
  companyData: {
    companyName: 'شركة قديمة',
    sectorL1: 'services',
    sectorL2: 'consulting'
  },
  answers: { ...mockIntakeAnswers, ...mockUniversalAnswers }
});

const qaRecordLegacy = fallbackReportLegacy.dual_layer?.consultantDossier?.qa_record || [];
// Legacy reconstruction reconstructs from answer keys, which cannot have an "unanswered" entry with sequence 3
const legacyHasUnansweredShown = qaRecordLegacy.some(q => q.answer_text === 'لم تتم الإجابة (عُرض ولم يُجب)');
assert(!legacyHasUnansweredShown, 'Legacy reconstruction does NOT contain "لم تتم الإجابة (عُرض ولم يُجب)" since it lacks the session ledger');

console.log('\n============================================================');
console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('============================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
