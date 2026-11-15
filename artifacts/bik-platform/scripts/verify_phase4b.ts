/**
 * BIK PHASE 4B VERIFICATION SUITE
 * Consultant Intelligence + Report Handoff + Consultant Authority
 */

import { computeDeterministicScore } from '../src/services/deterministicScoring';
import { buildDualLayerReport } from '../src/services/dualLayerReport';
import { APP_CONFIG, buildConsultantWhatsAppUrl } from '../src/config/appConfig';

console.log('============================================================');
console.log('BIK PHASE 4B: CONSULTANT INTELLIGENCE & AUTHORITY AUDIT');
console.log('============================================================');

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

// 1. Mock Complete Diagnostic Session
const mockAnswers: Record<string, any> = {
  u01: 'always',
  u02: 'week',
  u03: 'often',
  u04: 'monthly',
  u05: 'yes',
  u06: 'written',
  u07: 'clear',
  u08: 'low',
  u09: 'continuous',
  u10: 'documented',
  u11: 'digital',
  u12: 'clear',
  u13: 'daily',
  u14: 'clear',
  u15: 'formal',
  u16: 'integrated',
  u17: 'kpi',
  u18: 'weekly',
  u19: 'documented',
  u20: 'monthly',
  u21: 'documented',
  u22: 'high',
  u23: 'low',
  u24: 'diversified',
  u25: 'long',
  u26: 'monitored',
  u27: 'integrated',
  u28: 'quarterly',
  u29: 'written',
  u30: 'low',
  u31: 350000,
  u32: 240000,
  u33: 65000,
  u34: 45000,
  u35: 120000
};

const mockIntakeAnswers: Record<string, any> = {
  companyAge: '3_to_5',
  founderExperience: '5_to_10',
  country: 'مصر',
  city: 'القاهرة',
  breakEven: 'achieved',
  roi: 'positive',
  debt: 'manageable'
};

const mockSectorAnswers: Record<string, any> = {
  p01: 'specialized',
  p02: 'contract',
  p03: 'high'
};

const scoreResult = computeDeterministicScore(mockAnswers, mockIntakeAnswers);

const dualLayer = buildDualLayerReport({
  scoreResult,
  companyData: {
    userName: 'كريم الدسوقي',
    companyName: 'شركة النماء للاستشارات والتدريب',
    sectorL1: 'الخدمات المهنية والاستشارية',
    sectorL2: 'الاستشارات والتدريب',
    country: 'مصر',
    city: 'القاهرة',
    whatsapp: '201000000000'
  },
  intakeAnswers: mockIntakeAnswers,
  universalAnswers: mockAnswers,
  sectorAnswers: mockSectorAnswers,
  baseReport: {
    health_label: 'مستقر وواعد',
    headline_diagnosis: 'نموذج أعمال استشاري مستقر مع فرص لأتمتة دورة التحصيل وتوسيع هوامش الربحية',
    one_sentence_explanation: 'أظهر الفحص تمتع الشركة بهيكل حوكمة وتسليم قوي، مع حاجة ملحة لضبط دورة رأس المال العامل والتحصيل.',
    aha_moment: {
      apparent_problem: 'الاعتقاد بأن المشكلة في بطء نمو العقود الجديدة',
      root_cause: 'السبب الحقيقي هو تأخر دورة التحصيل النقدي وتجميد السيولة في عقود طويلة غير ممولة مرحلياً',
      is_supported: true,
      explanation: 'التحليل يثبت أن الأرباح مسجلة دفترياً لكن السيولة النقدية تتأخر 60 يوماً عن الصرف التشغيلي.'
    },
    top_priorities: [
      {
        rank: 1,
        title: 'إعادة جدولة شروط الدفع والتحصيل في العقود',
        why_it_matters: 'تأمين السيولة النقدية قبل بدء التسليم الفعلي للمشاريع الاستشارية',
        evidence: 'u34, u35, intake.debt',
        expected_objective: 'تقليص فجوة التدفق النقدي إلى أقل من 15 يوماً',
        first_action: 'إلزام الدفعة المقدمة بنسبة 40% في جميع العقود الجديدة'
      }
    ],
    direction_90_days: {
      days_0_30: { title: 'المرحلة الأولى', focus: 'ضبط شروط التحصيل والتدفق النقدي', actions: ['تعديل نماذج العقود'] },
      days_31_60: { title: 'المرحلة الثانية', focus: 'ميكنة متابعة الفواتير والذمم', actions: ['نظام متابعة التحصيل'] },
      days_61_90: { title: 'المرحلة الثالثة', focus: 'التوسع في عقود الاحتفاظ السنوية', actions: ['عقود Retainer'] }
    },
    data_gaps: [
      {
        dimension: 'البيئة المالية',
        metric_label: 'متوسط الأيام لتحصيل الذمم (DSO)',
        impact_on_diagnosis: 'تحديد المدة الدقيقة لتأخر التحصيل النقدي بعد تسليم الخدمة',
        credibility_note: 'تم التقدير عبر إجابة السؤال u34 والسؤال u35'
      }
    ]
  }
});

console.log('\n--- 1. CONSULTANT DOSSIER COMPREHENSIVENESS ---');
assert(!!dualLayer.consultantDossier, 'Consultant Dossier exists');
assert(dualLayer.consultantDossier.qa_record.length > 25, `QA Record contains all answered questions (${dualLayer.consultantDossier.qa_record.length})`);
assert(dualLayer.consultantDossier.qa_record.every(q => !!q.question_id && !!q.question_text && !!q.answer_text), 'All QA items have question ID, question text, and answer text');
assert(dualLayer.consultantDossier.qa_record.some(q => q.normalized_answer !== undefined), 'QA record preserves normalized_answer');
assert(dualLayer.consultantDossier.qa_record.some(q => q.evidence_weight !== undefined), 'QA record preserves evidence_weight');

console.log('\n--- 2. RESTORED STRATEGIC SECTIONS ---');
assert(!!dualLayer.consultantDossier.executive_diagnosis, 'Executive diagnosis object exists');
assert(dualLayer.consultantDossier.executive_diagnosis.headline.length > 5, 'Headline diagnosis exists and has descriptive content');
assert(!!dualLayer.consultantDossier.executive_diagnosis.aha_moment, 'Aha moment root-cause revelation is preserved');
assert(dualLayer.consultantDossier.top_priorities.length > 0, 'Top strategic priorities preserved');
assert(!!dualLayer.consultantDossier.direction_90_days?.days_0_30, '90-day direction roadmap preserved');
assert(dualLayer.consultantDossier.data_gaps.length > 0, 'Data gaps and credibility boundaries preserved');

console.log('\n--- 3. FULL DOSSIER EXPORT TEXT (STRATEGIC SECTIONS) ---');
const dossierText = dualLayer.consultantDossier.full_dossier_text;
assert(dossierText.includes('*تشخيص BIK'), 'WhatsApp dossier has the diagnostic summary');
assert(dossierText.includes('*الأسئلة والإجابات*'), 'WhatsApp dossier has the question-and-answer section');
assert(dossierText.includes('*الأولويات*'), 'WhatsApp dossier has the priorities section');
assert(!dossierText.includes('u01') && !dossierText.includes('u31'), 'WhatsApp dossier excludes internal question IDs');
assert(!dossierText.includes('مرجع الجلسة') && !dossierText.includes('اسم الملف المعتمد'), 'WhatsApp dossier excludes session and file metadata');
assert(!dossierText.includes('undefined'), 'Dossier text contains ZERO "undefined" artifacts');

console.log('\n--- 4. CONSULTANT AUTHORITY & PRIVACY INTEGRITY ---');
const waResult = buildConsultantWhatsAppUrl({
  isExecutiveReportCTA: true,
  companyName: 'شركة النماء للاستشارات والتدريب'
});

assert(APP_CONFIG.consultantWhatsApp === '201066966515', 'Public consultant phone is verified (+201066966515)');
assert(waResult.url.includes('201066966515'), 'WhatsApp URL targets the verified consultant phone');
assert(!waResult.url.includes('350000'), 'WhatsApp link does not leak revenue numbers');
assert(!waResult.url.includes('u31'), 'WhatsApp link does not leak question codes');
assert(!waResult.url.includes('swot'), 'WhatsApp link does not leak raw SWOT structures');
assert(waResult.url.startsWith('https://wa.me/201066966515'), 'WhatsApp URL points to verified public consultant phone');

console.log('\n============================================================');
console.log(`PHASE 4B AUDIT COMPLETE: ${passCount} PASSED, ${failCount} FAILED`);
console.log('============================================================');

if (failCount > 0) {
  process.exit(1);
}
