import assert from 'node:assert/strict';
import { buildWhatsAppDossierText } from '../src/services/dualLayerReport';
import { buildWhatsAppReportParts, WHATSAPP_MESSAGE_LIMIT } from '../src/services/reportTextDelivery';
import type { QuestionAnswerRecord } from '../src/types/dualLayer';

const forbidden = /#|\[u|\[md|\b(?:Observed|CALCULATED|baseline|root_cause|epoch)\b|\b\d{10,}\b|BIK_Consultant_Handoff|Session ID|اسم الملف المعتمد|العميل|الشركة/i;
const makeQa = (count: number): QuestionAnswerRecord[] => Array.from({ length: count }, (_, index) => ({
  question_number: index + 1,
  question_id: `u${String(index + 1).padStart(2, '0')}`,
  question_text: ['ما مصدر العملاء الأساسي؟', 'كيف تتابع هامش الربح؟', 'ما القرار الذي يؤخر النمو؟'][index % 3] + ` — الحالة ${index + 1}`,
  answer_text: index === 5 ? '...' : index === 8 ? '' : `إجابة عملية للنشاط حول المؤشر ${index + 1}`,
  answer_value: index === 5 ? '...' : `option_${index + 1}`,
  normalized_answer: null,
  answer_type: 'single_choice',
  dimension: 'التشغيل',
  diagnostic_role: 'signal',
  status: index === 8 ? 'unanswered' : 'answered'
}));

const build = (count: number) => buildWhatsAppDossierText({
  companyName: 'مؤسسة النور للتجارة',
  userName: 'سارة المنصوري',
  sectorL1: 'التجزئة',
  sectorL2: 'الأغذية المتخصصة',
  country: 'مصر',
  city: 'الإسكندرية',
  overallScore: 61,
  healthLabel: 'يحتاج ترتيب الأولويات',
  blindSpots: [{ name: 'تسرب الهامش' }, { name: 'رسالة بيعية غير موحدة' }, { name: 'اعتماد زائد على المؤسس' }],
  qaRecord: makeQa(count),
  priorities: [{ title: 'تثبيت هامش الربح' }, { title: 'توحيد الرسالة البيعية' }, { title: 'تفويض قرار التشغيل' }]
});

const checkSession = (count: number) => {
  const text = build(count);
  const parts = buildWhatsAppReportParts(text);
  assert.equal(parts.every(part => Array.from(part.message).length <= WHATSAPP_MESSAGE_LIMIT), true, `${count}: every message is within the part limit`);
  assert.equal(parts.every((part, index) => part.message.startsWith(`الجزء ${index + 1} من ${parts.length}`)), true, `${count}: simple part headers only`);
  assert.equal(parts.every(part => !forbidden.test(part.message)), true, `${count}: no forbidden strings`);
  assert.equal(text.match(/\*الأسئلة والإجابات\*/g)?.length, 1, `${count}: one QA heading`);
  assert.equal(text.match(/\*الأولويات\*/g)?.length, 1, `${count}: one priorities heading`);
  const qaText = text.slice(text.indexOf('*الأسئلة والإجابات*'), text.indexOf('*الأولويات*'));
  assert.equal((qaText.match(/\n\d+\) /g) || []).length, count, `${count}: every shown question appears once`);
  assert.equal(text.includes('↳ لم يُجب سارة المنصوري عن هذا السؤال'), true, `${count}: unanswered wording`);
  assert.equal(text.includes('↳ (إجابة غير مفهومة)'), true, `${count}: punctuation-only fallback`);
  console.log(JSON.stringify({
    answers: count,
    characters: text.length,
    parts: parts.length,
    maxMessageCharacters: Math.max(...parts.map(part => Array.from(part.message).length)),
    reassemblesExactly: parts.map(part => part.body).join('') === text
  }, null, 2));
};

checkSession(29);
checkSession(42);
console.log('WHATSAPP CONTRACT: 14 PASSED, 0 FAILED');
