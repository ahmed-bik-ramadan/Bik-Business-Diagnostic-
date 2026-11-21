/**
 * Fixes from the first live review (10 points).
 * Run: tsx scripts/verify_client_flow_fixes.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIN_WAIT_MS, clearOpened, openedKey, readOpened, secondsUntilReady, writeOpened } from '../src/services/transferGate';
import { MAX_OFFER_OUTCOMES, buildOfferOutcomes } from '../src/services/offerOutcomes';
import { NATIONAL_NUMBER_EXAMPLES, normalizePhoneNumber, sanitizeNationalInput, splitPhoneForForm } from '../src/services/phoneNormalization';
import { BIK_OFFERS } from '../src/config/appConfig';
import { useDiagnosticStore } from '../src/store/diagnosticStore';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');
let pass = 0;
let fail = 0;
function check(ok: boolean, msg: string) {
  if (ok) { pass++; console.log(`  PASS: ${msg}`); } else { fail++; console.error(`  FAIL: ${msg}`); }
}

// ---- 6. Offer outcomes come from the diagnosed axes only.
{
  const axes: any = {
    'الصحة المالية': { status: 'نقطة حرجة', score: 30, evidence: [{ signal: 'positive', findingDescription: 'قوة' }, { signal: 'negative', findingDescription: 'الهامش أقل من تكاليف التشغيل' }] },
    'العملاء والمبيعات': { status: 'يحتاج تحسين', score: 55, evidence: [{ signal: 'negative', findingDescription: 'لا يوجد مسار متابعة للعملاء المحتملين' }] },
    'الفريق والعمليات': { status: 'يحتاج تحسين', score: 40, evidence: [] },
    'الموقع التنافسي': { status: 'مستقر', score: 88, evidence: [] },
    'الرؤية والنمو': { status: 'بيانات غير كافية', score: 0, evidence: [] },
    'بنية الشركة وهويتها': { status: 'مستقر', score: 80, evidence: [] }
  };
  const out = buildOfferOutcomes(axes);
  check(out.length === 4, 'one line per axis that needs work or has a data gap (4 here), no padding to 5');
  check(out[0].axis === 'الصحة المالية' && out[0].kind === 'weak', 'critical axis comes first');
  check(out[1].axis === 'الفريق والعمليات', 'then needs-improvement axes by lowest score');
  check(out[3].axis === 'الرؤية والنمو' && out[3].kind === 'gap', 'data-gap axes are last and phrased as verification, not as weakness');
  check(!out.some(o => o.axis === 'الموقع التنافسي' || o.axis === 'بنية الشركة وهويتها'), 'stable axes never appear as needs');
  check(out[0].basis === 'الهامش أقل من تكاليف التشغيل', "the basis is the client's own negative finding");
  check(out[2].basis === 'لا يوجد مسار متابعة للعملاء المحتملين', 'basis is taken from that axis only');
  check(out[1].basis === undefined, 'no basis is invented when the axis has no negative evidence');
  check(!/\d/.test(out.map(o => o.outcome).join(' ')), 'no numbers in generated outcome lines');
  const many: any = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`m${i}`, { status: 'نقطة حرجة', score: i }]));
  check(buildOfferOutcomes(many).length === MAX_OFFER_OUTCOMES && MAX_OFFER_OUTCOMES === 5, 'capped at 5');
  check(buildOfferOutcomes(null).length === 0, 'no axes -> no outcomes');
}

// ---- 8. Phone field.
{
  check(NATIONAL_NUMBER_EXAMPLES['+20'] === '1012345678' && !NATIONAL_NUMBER_EXAMPLES['+20'].startsWith('0'), 'Egypt example has no leading zero');
  check(Object.values(NATIONAL_NUMBER_EXAMPLES).every(v => !v.startsWith('0')), 'no example starts with a trunk zero');
  check(sanitizeNationalInput('+20', '01012345678') === '1012345678', 'leading zero is removed as the client types');
  check(sanitizeNationalInput('+20', '٠١٠١٢٣٤٥٦٧٨') === '1012345678', 'Arabic-Indic digits and leading zero handled');
  check(sanitizeNationalInput('+20', '10 1234-5678') === '1012345678', 'separators removed');
  check(sanitizeNationalInput('+00', '+44 7700 900123') === '+447700900123', 'other-country keeps one leading +');
  check(normalizePhoneNumber('+20', sanitizeNationalInput('+20', '01012345678')) === '+201012345678', 'normalised number is correct');
  check(splitPhoneForForm('+201012345678', ['+20', '+966']).nationalNumber === '1012345678', 'stored number splits back without a zero');
}

// ---- 1, 2. Locked preview carries no diagnostic content; gate leaks nothing before the details are entered.
{
  const locked = read('src/components/LockedPreview.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
  const gate = read('src/pages/LeadGate.tsx');
  const quest = read('src/pages/Questionnaire.tsx');
  check(!/health_score|headline|what_we_discovered|top_priorities|axisDetails|status/.test(locked), 'LockedPreview reads no score, finding or status');
  check(locked.includes('ملخص موجز') && locked.includes('مقفل'), 'the preview is labelled as a brief, locked summary');
  check(gate.includes('<LockedPreview') && !gate.includes('<ReportPreview') && !gate.includes('report.dual_layer.clientReport'), 'LeadGate shows the locked preview, not the report preview');
  check(!quest.includes('instantScore !== null') && !quest.includes('مؤشرك الأولي'), 'the running score banner is gone from the questionnaire');
  check(!quest.includes('{instantScore}'), 'no score rendered during the questionnaire');
}

// ---- 3, 4. The part text is not shown; confirmation waits 3 s after opening (details: verify_transfer_flow.ts).
{
  const t = read('src/pages/ReportTransfer.tsx');
  check(!t.includes('{current.message}') && !t.includes('{selectedPart.message}'), 'the transfer page does not render the part text');
  check(!t.includes('returnedFromWhatsApp') && !t.includes('hiddenAtRef'), 'acknowledgement does not depend on a hidden->visible browser event (unreliable on phones)');
  check(t.includes('secondsUntilReady(waitMark, currentIndex, now)') && t.includes('secondsLeft === 0'), 'acknowledge is disabled until the wait since opening has passed');
  check(t.includes('أؤكد أنني أرسلت هذا الجزء'), 'acknowledge wording states that the part was sent');
}

// ---- 5. Consultant call-to-action in the report.
{
  const r = read('src/pages/Report.tsx');
  check(r.includes('data-testid="header-consultant-link"') && r.includes('data-testid="consultant-cta"'), 'report has a header button and a full-width consultant section');
  check(!r.includes('<ConsultantChat'), 'the report offers direct consultant contact without a chat widget');
  check(r.includes('outcomes={outcomes}'), 'report passes the client-specific outcomes to the offer cards');
}

// ---- 7. Back navigation keeps the session.
{
  const quest = read('src/pages/Questionnaire.tsx');
  check(quest.includes('data-testid="previous-question"'), 'questionnaire has an on-screen previous button');
  check(!quest.includes('هتفقد كل إجاباتك') && !quest.includes('handleConfirmBack'), 'the lose-everything dialog is removed');
  check(quest.includes('goPreviousRef.current()'), 'the phone back gesture steps back one question');
  check(read('src/pages/LeadGate.tsx').includes('data-testid="back-to-questionnaire"'), 'lead gate has a back button to the questionnaire');
  check(read('src/pages/Welcome.tsx').includes('data-testid="resume-session"'), 'welcome page offers to resume an unfinished session');

  const store = useDiagnosticStore;
  store.getState().reset();
  const s = store.getState();
  s.recordQuestionShown({ id: 'u01', question: 'q1' });
  s.recordQuestionAnswered('u01', 'always', 'دائماً');
  s.setField('universalAnswers', { u01: 'always' });
  s.recordQuestionShown({ id: 'u02', question: 'q2' });
  s.recordQuestionAnswered('u02', 'yes', 'نعم');
  s.setField('universalAnswers', { u01: 'always', u02: 'yes' });
  s.setField('instantScore', 70);
  const removed = store.getState().undoLastAnswer();
  const after = store.getState();
  check(removed === 'u02', 'undo removes the most recent answer');
  check(after.universalAnswers.u01 === 'always' && !('u02' in after.universalAnswers), 'earlier answers stay');
  check(after.questionHistory.length === 1 && after.questionHistory[0].questionId === 'u01', 'ledger drops the removed question');
  check(after.instantScore === null && after.report === null, 'derived results are cleared');
  check(store.getState().undoLastAnswer() === 'u01' && store.getState().undoLastAnswer() === null, 'undo walks back to the start, then reports nothing left');
}

// ---- 9, 10. Consultant page: approved page wired in, no email.
{
  const c = read('src/pages/Consultant.tsx');
  const page = read('src/pages/consultant/ConsultantPage.jsx');
  check(c.includes("from './consultant/ConsultantPage'") && c.includes('setConsultantWhatsApp(APP_CONFIG.consultantWhatsApp)'), 'consultant route renders the approved page and takes the WhatsApp number from config');
  check(['target: 350', 'target: 2000', 'target: 500', 'target: 96'].every(x => page.includes(x)), 'figures are the stated +350, 2000+, +500, 96%');
  check(page.includes('prefers-reduced-motion'), 'count-up respects reduced motion');
  const everything = [read('src/pages/Consultant.tsx'), page, read('src/config/appConfig.ts'), read('src/pages/Report.tsx'), read('src/pages/LeadGate.tsx')].join('\n');
  check(!/consultantEmail|@gmail\.com|ahmed\.bik|mailto:/.test(everything), 'no email address anywhere in the client-facing source');
  check(BIK_OFFERS.focusedWeek.includes.length === 3 && BIK_OFFERS.monthlyRetainer.includes.length === 3 && BIK_OFFERS.executiveProject.includes.length === 3, 'offer inclusions are the ones the consultant stated');
}

// ---- A choice question's own "unknown" option keeps its own wording in the transcript.
{
  const q = read('src/pages/Questionnaire.tsx');
  check(q.includes('labelledUnknown') && q.indexOf('labelledUnknown') < q.indexOf("answerText = 'لا أملك هذا الرقم بدقة حالياً (تخطي)'"),
    'option labelled unknown is resolved before the generic numeric skip wording');
  const u = read('src/data/universalQuestions.ts');
  const u30 = u.slice(u.indexOf('id: "u30"'), u.indexOf('id: "u31"'));
  check(u30.includes('label: "لا أستطيع تقدير ذلك"'), 'u30 keeps its own "unknown" label in the data');
}

// ---- Transfer gate behaviour (time based, survives reloads).
{
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
  check(secondsUntilReady(null, 0, 1000) === null, 'no opened mark -> not ready');
  check(secondsUntilReady({ index: 1, at: 0 }, 0, 99999) === null, 'a mark for another part never enables this part');
  check(secondsUntilReady({ index: 0, at: 1000 }, 0, 1000) === Math.ceil(MIN_WAIT_MS / 1000), 'right after opening the full wait remains');
  check((secondsUntilReady({ index: 0, at: 1000 }, 0, 1000 + MIN_WAIT_MS - 1) ?? 0) === (MIN_WAIT_MS > 0 ? 1 : 0), 'a millisecond before the wait ends is still waiting (or already ready when the wait is zero)');
  check(secondsUntilReady({ index: 0, at: 1000 }, 0, 1000 + MIN_WAIT_MS) === 0, 'ready once the wait has passed');
  check(secondsUntilReady({ index: 0, at: 5000 }, 0, 1000) === Math.ceil(MIN_WAIT_MS / 1000), 'a clock set back does not enable early');
  check(MIN_WAIT_MS === 0, 'the wait is zero: the owner removed this friction entirely');
  writeOpened(storage, 'sess', { index: 2, at: 1234 });
  const back = readOpened(storage, 'sess');
  check(back?.index === 2 && back?.at === 1234, 'opened mark is restored after a reload');
  check(readOpened(storage, 'other') === null, 'marks are per session');
  mem.set(openedKey('bad'), '{oops');
  check(readOpened(storage, 'bad') === null, 'a corrupt mark counts as not opened');
  clearOpened(storage, 'sess');
  check(readOpened(storage, 'sess') === null, 'mark is cleared after acknowledgement');
}

console.log(`\nCLIENT FLOW FIXES: ${pass} PASSED, ${fail} FAILED`);
process.exit(fail ? 1 : 0);
