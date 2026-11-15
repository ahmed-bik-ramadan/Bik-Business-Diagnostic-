import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildWhatsAppDossierText } from '../src/services/dualLayerReport';
import { buildWhatsAppReportParts, WHATSAPP_MESSAGE_LIMIT } from '../src/services/reportTextDelivery';
import type { QuestionAnswerRecord } from '../src/types/dualLayer';

// Owner (consultant) WhatsApp message: client text is never altered, a question is never separated
// from its answer, the sector is printed in Arabic, a missing score/name is stated, not invented.
// Fixtures are SYNTHETIC sessions produced by an auditor, not real clients.

let passed = 0;
let failed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); passed += 1; } catch (error) { failed += 1; console.error(`FAIL: ${name}\n  ${(error as Error).message.split('\n').slice(0, 6).join('\n  ')}`); }
};

const load = (file: string) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'));
const toRecords = (qa: Array<{ question: string; answer: string | null }>): QuestionAnswerRecord[] => qa.map((item, index) => ({
  question_number: index + 1,
  question_id: `q${index + 1}`,
  question_text: item.question,
  answer_text: item.answer ?? '',
  answer_value: item.answer ?? '',
  normalized_answer: null,
  answer_type: 'single_choice',
  dimension: 'التشغيل',
  diagnostic_role: 'signal',
  status: item.answer === null ? 'unanswered' : 'answered'
}) as QuestionAnswerRecord);

const baseInput = {
  companyName: 'شركة', userName: 'منى', sectorL1: 'retail', sectorL2: 'متجر متعدد التخصصات', country: 'مصر', city: 'القاهرة',
  overallScore: 64 as number | null, healthLabel: 'متوسط', blindSpots: [{ name: 'أ' }, { name: 'ب' }], priorities: [{ title: 'ج' }]
};
const sessionInput = (file: string, sectorL1: string, sectorL2: string) => {
  const j = load(file);
  return { j, input: { ...baseInput, companyName: j.company, userName: j.name, sectorL1, sectorL2, country: j.country, city: j.city, overallScore: j.score, healthLabel: j.scoreLabel,
    blindSpots: j.blindSpots.map((name: string) => ({ name })), priorities: j.priorities.map((title: string) => ({ title })), qaRecord: toRecords(j.qa) } };
};

const everyAnswerFollowsItsQuestion = (messages: string[]) => {
  for (const message of messages) {
    const lines = message.split('\n');
    lines.forEach((line, i) => { if (line.startsWith('↳')) assert.match(lines[i - 1] ?? '', /^\d+\) /, `answer without its question: ${line.slice(0, 40)}`); });
  }
};

for (const [file, l1, l2, expectSectorText] of [
  ['owner_message_session29.json', 'retail', 'متجر متعدد التخصصات', 'تجزئة وبيع مباشر / متجر متعدد التخصصات'],
  ['owner_message_session42.json', 'sports', 'وكالة رياضية وتسويق رياضي', 'الرياضة والتأهيل البدني / وكالة رياضية وتسويق رياضي']
] as const) {
  const { j, input } = sessionInput(file, l1, l2);
  const text = buildWhatsAppDossierText(input);
  const parts = buildWhatsAppReportParts(text);
  console.log(JSON.stringify({ session: file, answers: j.qa.length, characters: text.length, parts: parts.length, sizes: parts.map(p => Array.from(p.message).length) }));
  check(`${file}: parts reassemble the exact text`, () => assert.equal(parts.map(p => p.body).join(''), text));
  check(`${file}: every message within the limit and simple numbered header`, () => parts.forEach((p, i) => {
    assert.ok(Array.from(p.message).length <= WHATSAPP_MESSAGE_LIMIT);
    assert.ok(p.message.startsWith(`الجزء ${i + 1} من ${parts.length}\n\n`));
  }));
  check(`${file}: no part starts with an answer; every answer follows its question`, () => {
    parts.forEach(p => assert.ok(!p.body.trimStart().startsWith('↳'), 'part starts with an answer'));
    everyAnswerFollowsItsQuestion(parts.map(p => p.body));
  });
  check(`${file}: no heading is left as the last block of a part`, () => parts.forEach(p => assert.ok(!/\*[^*\n]+\*\s*$/u.test(p.body) || /\n\d+\) /.test(p.body.slice(-120)) )));
  check(`${file}: each shown question appears once, with its answer`, () => {
    for (const item of j.qa) assert.equal(text.split(`) ${item.question}\n`).length - 1, 1, item.question);
  });
  check(`${file}: unanswered wording is exact and counted`, () => {
    const n = j.qa.filter((x: { answer: string | null }) => x.answer === null).length;
    assert.equal(text.split(`↳ لم يُجب ${j.name} عن هذا السؤال`).length - 1, n);
  });
  check(`${file}: sector printed in Arabic, no internal id`, () => {
    assert.ok(text.includes(`النشاط: ${expectSectorText}`));
    assert.ok(!/\b(?:retail|sports|supermarket)\b/.test(text));
  });
}

check('client text is kept verbatim (10+ digits, #, Latin words, empty parentheses)', () => {
  const answers = ['الإيراد 1200000000 جنيه', 'نحن #1 في المنطقة', 'نستخدم diagnostic dashboard و baseline شهري', 'Observed growth of 20% (financial)', 'a1b2c3d4e5f6a7b8c9d0', 'واتساب 01066966515 للتواصل'];
  const text = buildWhatsAppDossierText({ ...baseInput, qaRecord: toRecords(answers.map((answer, i) => ({ question: `سؤال ${i + 1}؟`, answer }))) });
  for (const answer of answers) assert.ok(text.includes(`↳ ${answer}`), `changed: ${answer}`);
});

check('missing name and company give a clean sentence, not a broken one', () => {
  for (const name of [undefined, '', '   ', 'العميل']) {
    const text = buildWhatsAppDossierText({ ...baseInput, userName: name, companyName: undefined, qaRecord: toRecords([{ question: 'س؟', answer: null }]) });
    assert.ok(text.includes('↳ لم يُجب (الاسم غير مُدخل) عن هذا السؤال'));
    assert.ok(!text.includes('لم يُجب لم يُدخل'));
    // The sector here is valid, so it prints in Arabic; the missing-sector fallback is covered separately below.
    assert.ok(text.includes('النشاط: تجزئة وبيع مباشر / متجر متعدد التخصصات'));
    assert.ok(!text.includes('لم يُدخل'));
  }
});

check('a 520-character company name keeps name, sector, score and blind-spot lines', () => {
  const text = buildWhatsAppDossierText({ ...baseInput, companyName: 'ش'.repeat(520), qaRecord: toRecords([{ question: 'س؟', answer: 'ج' }]) });
  for (const needle of ['الاسم: منى', 'النشاط: تجزئة وبيع مباشر / متجر متعدد التخصصات', 'النتيجة 64/100 (متوسط)', 'النقاط العمياء: أ؛ ب', '*الأولويات*']) assert.ok(text.includes(needle), needle);
  assert.ok(text.includes('…'));
});

check('a score that is not computed is never printed as a number', () => {
  for (const score of [null, NaN, Infinity]) {
    const text = buildWhatsAppDossierText({ ...baseInput, overallScore: score as number | null, qaRecord: [] });
    assert.ok(text.includes('النتيجة: غير محسوبة (بيانات غير كافية)'));
    assert.ok(!/undefined|NaN|null/.test(text));
  }
  assert.ok(buildWhatsAppDossierText({ ...baseInput, overallScore: 0, qaRecord: [] }).includes('النتيجة 0/100'));
});

check('an unknown internal sector id is not printed (F5: the fallback is «الأعمال والخدمات»)', () => {
  const text = buildWhatsAppDossierText({ ...baseInput, sectorL1: 'unknown_sector', sectorL2: 'some-id', qaRecord: [] });
  assert.ok(text.includes('النشاط: الأعمال والخدمات'));
  assert.ok(!text.includes('(اسم النشاط غير مُدخل)'));
});

check('stress: blocks stay whole for several message budgets (answers with blank lines included)', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const budget of [400, 700, 1200, 2800]) {
    for (let round = 0; round < 40; round += 1) {
      const qa = Array.from({ length: 12 + Math.floor(rnd() * 40) }, (_, i) => ({
        question: `سؤال رقم ${i + 1} ${'ك'.repeat(Math.floor(rnd() * 80))}؟`,
        answer: rnd() < 0.15 ? null : `${'ج'.repeat(1 + Math.floor(rnd() * 60))}${rnd() < 0.3 ? '\n\nفقرة ثانية' : ''}`
      }));
      const text = buildWhatsAppDossierText({ ...baseInput, qaRecord: toRecords(qa) });
      const parts = buildWhatsAppReportParts(text, '', budget);
      assert.equal(parts.map(p => p.body).join(''), text);
      assert.ok(parts.every(p => Array.from(p.message).length <= budget));
      everyAnswerFollowsItsQuestion(parts.map(p => p.body));
      parts.forEach(p => assert.ok(!p.body.trimEnd().endsWith('*الأسئلة والإجابات*')));
    }
  }
});

console.log(`OWNER MESSAGE: ${passed} PASSED, ${failed} FAILED`);
if (failed > 0) process.exitCode = 1;
