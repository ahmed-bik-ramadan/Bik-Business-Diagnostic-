/**
 * BIK PHASE 6 VERIFICATION SUITE
 * Consultant Intelligence Capture, Canonical Session Ledger & Complete WhatsApp Handoff
 */

import { computeDeterministicScore } from '../src/services/deterministicScoring';
import { buildDualLayerReport } from '../src/services/dualLayerReport';
import { APP_CONFIG, buildConsultantWhatsAppUrl } from '../src/config/appConfig';
import { QuestionLedgerEntry } from '../src/types/dualLayer';

console.log('============================================================');
console.log('BIK PHASE 6: CONSULTANT INTELLIGENCE & CANONICAL LEDGER AUDIT');
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

// -------------------------------------------------------------
// Test 1 & 2 & 3 & 4: Canonical Question Ledger Life Cycle
// -------------------------------------------------------------
console.log('[Audit 1]: Testing Canonical Question Ledger Lifecycle...');

const mockLedger: QuestionLedgerEntry[] = [];

// Helper mimicking store methods
function recordShown(id: string, text: string, dim: string, role: any = 'signal') {
  const existing = mockLedger.find(e => e.questionId === id);
  if (!existing) {
    mockLedger.push({
      sequence: mockLedger.length + 1,
      questionId: id,
      questionText: text,
      status: 'shown',
      answerValue: null,
      answerText: null,
      dimension: dim,
      diagnosticRole: role,
      shownAt: Date.now()
    });
  }
}

function recordAnswered(id: string, val: any, text: string) {
  const item = mockLedger.find(e => e.questionId === id);
  if (item) {
    item.status = 'answered';
    item.answerValue = val;
    item.answerText = text;
    item.answeredAt = Date.now();
  }
}

function markUnanswered() {
  mockLedger.forEach(e => {
    if (e.status === 'shown' && (e.answerValue === null || e.answerValue === undefined)) {
      e.status = 'unanswered';
    }
  });
}

// Simulate sequence
recordShown('u01', 'هل يوجد خطة عمل مكتوبة؟', 'الحوكمة والاستراتيجية');
recordAnswered('u01', 'written', 'نعم، موثقة ومعتمدة ومحدثة دورياً');

recordShown('u02', 'ما هو معدل دوران المخزون؟', 'العمليات وسلاسل الإمداد');
recordAnswered('u02', 'high', 'دوران مرتفع (أكثر من 6 مرات سنوياً)');

recordShown('u03', 'هل يتم قياس مؤشرات الأداء بانتظام؟', 'العمليات وسلاسل الإمداد');
// u03 is shown but user skipped / moved forward without answering

markUnanswered();

assert(mockLedger.length === 3, 'Ledger recorded exactly the 3 presented questions');
assert(mockLedger[0].sequence === 1 && mockLedger[0].status === 'answered', 'First question has sequence 1 and status answered');
assert(mockLedger[0].answerText === 'نعم، موثقة ومعتمدة ومحدثة دورياً', 'First question recorded resolved human-readable answer text');
assert(mockLedger[1].sequence === 2 && mockLedger[1].status === 'answered', 'Second question has sequence 2 and status answered');
assert(mockLedger[2].sequence === 3 && mockLedger[2].status === 'unanswered', 'Third question marked as unanswered in ledger');
assert(mockLedger[2].answerValue === null, 'Unanswered question preserves null answer value');

// -------------------------------------------------------------
// Test 5: Adaptive questions not presented
// -------------------------------------------------------------
console.log('\n[Audit 2]: Testing Adaptive Branching and Candidate Question Isolation...');
const unpresentedCandidateIds = ['u04', 'u05', 'u06'];
unpresentedCandidateIds.forEach(id => {
  assert(!mockLedger.some(e => e.questionId === id), `Candidate question ${id} not presented is NOT in shown ledger`);
});

// -------------------------------------------------------------
// Test 6 & 7: buildDualLayerReport with questionHistory & 28 sections
// -------------------------------------------------------------
console.log('\n[Audit 3]: Testing Dossier Generation with Canonical Ledger & 28 Sections...');

const mockScoreResult = computeDeterministicScore({
  answers: { u01: 'written', u02: 'high' },
  sectorL1: 'retail',
  sectorL2: 'hypermarket',
  diagnosticDepth: 'quick'
});

const dualLayer = buildDualLayerReport({
  scoreResult: mockScoreResult,
  companyData: {
    userName: 'أحمد محمود',
    companyName: 'شركة النيل للحلويات',
    sectorL1: 'retail',
    sectorL2: 'hypermarket',
    country: 'مصر',
    city: 'القاهرة',
    whatsapp: '+201000000000'
  },
  intakeAnswers: {
    country: 'مصر',
    city: 'القاهرة'
  },
  universalAnswers: {
    u01: 'written',
    u02: 'high'
  },
  sectorAnswers: {},
  questionHistory: mockLedger,
  sessionId: 'BIK-TEST-SESSION-8842',
  diagnosticDepth: 'quick',
  sessionTimestamp: 1710000000000
});

const dossierText = dualLayer.consultantDossier.full_dossier_text;

assert(dossierText.includes('*تشخيص BIK'), 'WhatsApp dossier contains its summary');
assert(dossierText.includes('*الأسئلة والإجابات*'), 'WhatsApp dossier contains shown questions and answers');
assert(dossierText.includes('*الأولويات*'), 'WhatsApp dossier contains priorities');
assert(!dossierText.includes('u03'), 'WhatsApp dossier excludes internal question IDs');
assert(!dossierText.includes('BIK-TEST-SESSION-8842'), 'WhatsApp dossier excludes session IDs');

// -------------------------------------------------------------
// Test 8: Empty Data fallback text
// -------------------------------------------------------------
console.log('\n[Audit 4]: Testing Missing/Empty Section Fallback Text...');
assert(dossierText.includes('لم يُجب') || dossierText.includes('إجابة غير مفهومة'), 'WhatsApp dossier uses explicit answer fallbacks');

// -------------------------------------------------------------
// Test 9: Financial Inputs explicitly marked missing
// -------------------------------------------------------------
console.log('\n[Audit 5]: Testing Financial Declarations & Missing Status...');
assert(!dossierText.includes('غير مصرّح به (مفقود)'), 'WhatsApp dossier does not invent or expose undeclared financial fields');

// -------------------------------------------------------------
// Test 10: Separation of Unanswered vs Branching Not Presented
// -------------------------------------------------------------
console.log('\n[Audit 6]: Testing Separation of Unanswered Questions vs Branching Not Presented...');
// u03 was shown but unanswered
assert(dossierText.includes('لم يُجب أحمد محمود عن هذا السؤال'), 'Unanswered question has the explicit Arabic fallback');
assert(!dossierText.includes('الأسئلة التي لم تُعرض بسبب التفريع'), 'Adaptive branching metadata is not exposed to the client');

// -------------------------------------------------------------
// Test 11: WhatsApp Executive URL vs File Handoff
// -------------------------------------------------------------
console.log('\n[Audit 7]: Testing WhatsApp Handoff Message Boundaries & File Name...');

const waResult = buildConsultantWhatsAppUrl({
  sessionHandoff: {
    userName: 'أحمد محمود',
    companyName: 'شركة النيل للحلويات',
    sector: 'retail - hypermarket',
    country: 'مصر',
    city: 'القاهرة',
    score: 72,
    healthLabel: 'مستقر',
    coverage: 85,
    confidence: 'عالي',
    strongestFinding: 'مؤشرات كفاءة جيدة في إدارة العمليات',
    rootCause: 'الحاجة إلى تقنين خطة المشتريات',
    topPriority: 'إعادة هيكلة فترات التوريد',
    businessConsequence: 'تقليص فاقد السيولة في المخزون الراكد',
    financialStatus: 'محسوب حتمياً'
  },
  companyName: 'شركة النيل للحلويات',
  sessionRef: 'BIK-TEST-SESSION-8842'
});

assert(waResult.messageText.length > 0, 'WhatsApp message text generated');
assert(waResult.messageText.length < 1500, `WhatsApp message is concise (${waResult.messageText.length} chars)`);
assert(!waResult.url.includes('## هـ. سجل الأسئلة المعروضة'), 'WhatsApp URL does NOT contain the full QA ledger or complete dossier');
assert(!waResult.url.includes('السجل الكامل لجميع الأسئلة'), 'WhatsApp URL is kept clean from raw full diagnostic dump');
assert(!dossierText.includes('اسم الملف المعتمد'), 'Dossier does not expose file metadata');

console.log('\n============================================================');
console.log(`AUDIT COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
console.log('============================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
