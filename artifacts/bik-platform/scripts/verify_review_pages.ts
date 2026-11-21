import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildReviewPages, isReviewGap, questionnaireFinished, processingReviewRedirect, reviewEntryRedirect, reviewNextRoute, reviewHistoryRoutes } from '../src/services/reviewContent';
import { buildReviewedSections, confirmReview, emptyReviewState, firstPendingReview, redactReviewContacts, reviewedSectionText, sanitizeReviewState } from '../src/services/reviewState';
import { sanitizeDiagnosticPersisted } from '../src/services/persistedStateSanitizer';
import { generateDiagnosticReport } from '../src/services/diagnose';
import { buildWhatsAppDossierText } from '../src/services/dualLayerReport';
import { buildWhatsAppReportParts } from '../src/services/reportTextDelivery';
import { buildChatContext } from '../src/services/chatPolicy';
import { computeDeterministicScore, DIAGNOSTIC_DIMENSIONS, POSITIVE_SIGNALS } from '../src/services/deterministicScoring';
import { getSectorQuestions } from '../src/data/sectorRegistry';
import { createTransferProgress, readTransferProgress, writeTransferProgress, transferProgressKey } from '../src/services/reportTransferState';
import * as recovery from '../src/services/analysisRecovery';
import { dialectForCountry, reviewCopy } from '../src/services/dialect';
import { reviewSessions } from './fixtures/reviewSessions';

let passed = 0;
function check(condition: unknown, message: string) { assert.ok(condition, message); passed += 1; console.log(`PASS: ${message}`); }
const sessions = reviewSessions();
const approvedReviewCopy = Object.fromEntries(Object.entries(JSON.parse(readFileSync('scripts/fixtures/reviewApprovedCopy.json', 'utf8')))
  .filter(([key]) => key !== 'v14Page1Archive')) as Record<string, any>;
const finalReviewCopy = reviewCopy('fusha');
for (const [key, expected] of Object.entries(approvedReviewCopy)) {
  if (key === 'sectorAnswer') {
    assert.equal(finalReviewCopy.sectorAnswer('{answer}', 0), approvedReviewCopy.sectorAnswer.variant0);
    assert.equal(finalReviewCopy.sectorAnswer('{answer}', 1), approvedReviewCopy.sectorAnswer.variant1);
  } else {
    assert.deepEqual(finalReviewCopy[key as keyof typeof finalReviewCopy], expected, `${key}: final approved review text (page-1 groups authorized by Mission 8)`);
  }
}
check(true, 'all active final review templates match the approved deck, including both sectorAnswer variants and the Mission 8 page-1 groups; historical metadata is excluded');
function checkReviewProse(value: unknown): void {
  if (typeof value === 'string') {
    assert.doesNotMatch(value, /[٠-٩۰-۹]|\.\.\.|قيد الصياغة|البداية الممكنة:|بخصوص ما قرأته/u);
    assert.ok(!/[{}]/.test(value.replaceAll('{answer}', '')), 'only the approved answer placeholder is allowed');
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) checkReviewProse(child);
  }
}
checkReviewProse(approvedReviewCopy);
const page1Entries: Array<[string, string]> = (['pain', 'axisPain', 'sectorPain'] as const).flatMap(group =>
  Object.entries(finalReviewCopy[group]).flatMap(([id, values]) => values.map((value, index): [string, string] => [`${group}.${id}.${index + 1}`, value])));
page1Entries.push(['noPain', finalReviewCopy.noPain]);
check(page1Entries.length === 63, 'Mission 8: all 63 page-1 templates are covered by the sentence contract');
function verifyPage1Sentence(key: string, value: string): void {
  assert.equal(typeof value, 'string', `${key}: text`);
  assert.ok(key === 'noPain' ? value.length <= 160 : value.length >= 35 && value.length <= 110,
    `${key}: approved sentence length (${value.length})`);
  assert.match(value, /^[^.!?؟]+[.!?؟]$/u, `${key}: exactly one sentence and one final terminator`);
  assert.doesNotMatch(value, /[0-9٠-٩۰-۹]|ا\/|\.\.\.|ضمان|نضمن|حتماً|بالتأكيد|قيد الصياغة/u,
    `${key}: no digits, address without hamza, three dots, guarantee, certainty or draft wording`);
  const tokens = value.normalize('NFKC').replace(/[\u064B-\u065F\u0670ـ]/g, '').match(/\p{L}+/gu) || [];
  assert.ok(!tokens.some(word => ['أنا', 'نحن', 'لدي', 'عندي', 'لنا', 'شركتي', 'إجابتي'].includes(word)),
    `${key}: no first-person words`);
  // A future prefix needs an imperfect-verb stem; the noun «سير» has only three letters.
  assert.ok(!tokens.some(word => word === 'سوف' || /^س[أنيت]\p{L}{2,}$/u.test(word)),
    `${key}: no سوف or prefixed future verb`);
}
for (const [key, value] of page1Entries) {
  verifyPage1Sentence(key, value);
  check(true, `Mission 8: sentence contract holds for ${key}`);
}
const validPage1Sentence = 'تسير شركتك بطريقة واضحة يرجع إليها فريقك في العمل.';
verifyPage1Sentence('pain.test.1', validPage1Sentence);
for (const word of ['1', '١', '۱', 'ا/', '...', 'ضمان', 'نضمن', 'حتماً', 'بالتأكيد', 'قيد الصياغة',
  'أنا', 'نحن', 'لدي', 'عندي', 'لنا', 'شركتي', 'إجابتي', 'سوف', 'سأتابع', 'سنتابع', 'سيتابع', 'ستتابع']) {
  assert.throws(() => verifyPage1Sentence('pain.test.1', validPage1Sentence.replace('تسير', word)), undefined,
    `Mission 8: the sentence validator rejects ${word}`);
}
for (const value of ['تسير شركتك.', 'أ'.repeat(110) + '.', validPage1Sentence.slice(0, -1),
  validPage1Sentence + ' تبقى مهام معلقة.']) assert.throws(() => verifyPage1Sentence('pain.test.1', value));
assert.throws(() => verifyPage1Sentence('noPain', 'أ'.repeat(160) + '.'));
check(true, 'Mission 8: sentence validator rejects forbidden prose, missing/multiple terminators and out-of-range lengths');
const nominalSolutionStart = /^(?:كتابة|ترتيب|تتبع|سؤال|تسجيل|اختيار|جمع|اتصال|تدوين|تسليم|النظر|وضع|تحديد|تخصيص) /u;
for (const solution of [...Object.values(finalReviewCopy.solution), ...Object.values(finalReviewCopy.axisSolution), finalReviewCopy.sectorSolution]) {
  assert.match(solution, nominalSolutionStart, 'each approved solution begins with a verbal noun');
  assert.ok(solution.endsWith('.'), 'each approved solution ends with a period');
}
assert.deepEqual(reviewCopy('fusha').consequence, approvedReviewCopy.consequence);
assert.deepEqual(reviewCopy('fusha').problemHook, approvedReviewCopy.problemHook);
check(true, 'all approved consequence and problemHook values match the owner-provided copy verbatim');
const symptomCopy = { pain: reviewCopy('fusha').pain, axisPain: reviewCopy('fusha').axisPain };
check(createHash('sha256').update(JSON.stringify(symptomCopy)).digest('hex') === '37e3288b24b1c6eda15e44c99b7d2dbd45feedad43318b06045e08a156bdaf01',
  'Mission 8: page-1 symptom text matches the newly authorized exact-copy fingerprint');
check(!['قيد الصياغة', 'بخصوص ما قرأته', 'البداية الممكنة:'].some(retired => JSON.stringify(reviewCopy('fusha')).includes(retired)),
  'the complete review copy contains no retired temporary or solution-prefix wording');
const src = (path: string) => readFileSync(path, 'utf8');
check(src('src/pages/Questionnaire.tsx').includes("navigate('/review/1')") && !src('src/pages/Questionnaire.tsx').includes("navigate('/processing'"), 'questionnaire enters review before processing');
check(src('src/App.tsx').includes('path="/review/:page"'), 'review route is registered');
assert.deepEqual([reviewNextRoute(1), reviewNextRoute(2), reviewNextRoute(3)], ['/review/2', '/review/3', '/processing']);
check(sessions.every(session => questionnaireFinished(session) && session.questionHistory?.at(-1)?.questionId === 'u30'), 'actual synthetic questionnaire walks end with u30');
assert.equal(reviewEntryRedirect({}, 2), '/sector-select');
assert.equal(reviewEntryRedirect({ sectorL1: 'retail' }, 2), '/company-intake');
assert.equal(reviewEntryRedirect({ ...sessions[0], universalAnswers: {} }, 2), '/questionnaire');
assert.equal(reviewEntryRedirect(sessions[0], 3), '/review/1');
check(true, 'direct entry and incomplete questionnaires are redirected to the correct earlier step');

const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => { throw new Error('Review generation attempted network access'); }) as typeof fetch;
try {
  for (const session of sessions) {
    const pages = buildReviewPages(session);
    assert.deepEqual(pages, buildReviewPages(structuredClone(session)));
    check(pages.every(page => page.lines.length > 0 && page.lines.length <= 4), `${session.sessionId}: deterministic text with at most four statements`);
    const text = pages.flatMap(page => [page.title, page.subtitle, ...page.lines]).join('\n');
    check(!['قيد الصياغة', 'بخصوص ما قرأته', 'البداية الممكنة:'].some(retired => text.includes(retired)), `${session.sessionId}: no retired review copy appears on any page`);
    assert.equal(pages[2].subtitle, `هذا ما قد يقلقك لو طال الحال بشركتك${session.companyName ? ` «${session.companyName}»` : ''}`);
    check(!/[\d٠-٩۰-۹]/u.test(pages.flatMap(page => page.lines).join('\n')), `${session.sessionId}: no invented or option-derived numbers`);
    for (const forbidden of [...Object.keys(DIAGNOSTIC_DIMENSIONS), 'نقطة حرجة', 'يحتاج تحسين', 'أسبوع استشاري', 'تعاقد شهري', '5000', '499', '272', 'درجتك', '/100']) assert.ok(!text.includes(forbidden), forbidden);
    for (const forbidden of ['أنت أخطأت', 'فشلت', 'تهمل', 'احجز', 'عرض لفترة محدودة', 'لا تفوّت', 'لا تفوت', 'نتيجة مضمونة', 'نضمن']) assert.ok(!text.includes(forbidden), forbidden);
    check(true, `${session.sessionId}: no scores, status labels, offer names, prices, blame, guarantees or direct marketing`);
    if (session.userName) assert.ok(pages.every(page => page.title.includes(`أ/ ${session.userName}`)));
    check(!text.includes('ا/ ') && !/undefined|null|\[الاسم\]|\[الشركة\]|placeholder/i.test(text), `${session.sessionId}: identity phrases have correct hamza and no placeholders`);
    check(pages[1].lines.filter(line => line.includes('فأولى الخطوات:')).length <= 1, `${session.sessionId}: at most one possible intervention`);
    session.review = pages.reduce((state, page) => confirmReview(state, page.page, { kind: 'accepted', text: page.lines.join('\n') }), session.review!);
    assert.equal(firstPendingReview(session.review), null);
    assert.equal(processingReviewRedirect(session), null);
    const report = await generateDiagnosticReport(session as any);
    const sections = buildReviewedSections(session.review);
    assert.deepEqual(report.review, sections);
    assert.deepEqual(report.dual_layer?.clientReport.review, sections);
    assert.deepEqual(report.dual_layer?.consultantDossier.review, sections);
    const full = report.dual_layer!.consultantDossier.full_dossier_text;
    assert.ok(full.includes(reviewedSectionText(session.review)));
    const parts = buildWhatsAppReportParts(full, session.sessionId);
    check(parts.every(part => Array.from(part.message).length <= 1100) && parts.map(part => part.body).join('') === full,
      `${session.sessionId}: reviewed section reaches report/dossier; WhatsApp parts are bounded and reconstruct exactly`);
    const context = buildChatContext({ ...(session as any), sector: session.sectorL1 });
    assert.ok(!JSON.stringify(context).includes('review'));
  }
} finally { globalThis.fetch = originalFetch; }

const sectorSession = structuredClone(sessions[0]);
sectorSession.sectorL1 = 'healthcare';
sectorSession.sectorAnswers = { h01: 35, h03: 'automatic' };
for (const [id, value] of Object.entries(POSITIVE_SIGNALS)) sectorSession.universalAnswers![id] = Array.isArray(value) ? value[0] : 80;
const healthyPage = buildReviewPages({ ...sectorSession, sectorAnswers: {} })[0];
check(healthyPage.sources.length === 0 && healthyPage.lines[0] === finalReviewCopy.noPain && !healthyPage.lines[0].includes('لم تكتمل'), 'healthy answered sessions show the exact authorized noPain sentence, without being called incomplete or assigned pain');
const sectorPage = buildReviewPages(sectorSession)[0];
check(sectorPage.sources.includes('h01') && sectorPage.lines.join(' ').includes('مواعيد') && !sectorPage.lines.join(' ').includes('غياب الأتمتة'), 'actual sector negative evidence is reused without asserting an unsupported cause');
check(buildReviewPages(sectorSession)[1].lines.filter(line => line.includes('فأولى الخطوات:')).length === 1, 'a sector-only problem also gets one possible intervention');
const missing = sessions[2];
const pages = buildReviewPages(missing);
check(pages[0].sources.length === 0 && pages[0].lines[0].includes('لم تكتمل') && pages[0].lines[0].includes('إجابة أخرى'), 'unknown answers produce an honest invitation, not invented pain');
check(['unknown', 'لا أعرف', '...', '…', null, 'skipped'].every(isReviewGap), 'unknown, skipped and ellipsis are data gaps');
check(pages.every(page => !page.title.includes('أ/') && !page.title.includes('  ') && !page.subtitle.includes('«»')), 'missing names/companies omit the entire optional phrase');
for (const country of ['مصر', 'السعودية', 'الإمارات', 'الكويت', 'المغرب']) {
  assert.equal(reviewCopy(dialectForCountry(country)).yes, 'نعم');
  assert.ok(reviewCopy(dialectForCountry(country)).previous);
}
check(true, 'all five existing dialect selections supply review copy');

const raw = 'أريد مرجعاً واضحاً.\nهاتفي +20 1066966515، بريدي review@example.com ورابطي https://example.com.\n  أريد u06 كما كتبته 🚢.';
const cleaned = 'أريد مرجعاً واضحاً.\nهاتفي [محذوف]، بريدي [محذوف] ورابطي [محذوف].\n  أريد u06 كما كتبته 🚢.';
assert.equal(redactReviewContacts(raw), cleaned);
assert.equal(redactReviewContacts('إيرادنا 12000000 جنيه، ومبيعاتنا 15000000 ريال.'), 'إيرادنا 12000000 جنيه، ومبيعاتنا 15000000 ريال.');
check(true, 'declared financial amounts are preserved instead of being mistaken for phone numbers');
let custom = confirmReview(sessions[0].review!, 3, { kind: 'custom', text: raw });
const customReport = await generateDiagnosticReport({ ...sessions[0], review: custom } as any);
const full = customReport.dual_layer!.consultantDossier.full_dossier_text;
check(full.includes(cleaned) && !full.includes('review@example.com') && !full.includes('+20 1066966515'), 'only contact spans are redacted; whitespace, punctuation, emoji and visitor words are preserved');
const direct = buildWhatsAppDossierText({ overallScore: null, blindSpots: [], qaRecord: [], priorities: [], review: custom });
check(direct.includes(cleaned), 'direct dossier builder includes the same reviewed section');
const parts = buildWhatsAppReportParts(full);
check(parts.every(part => Array.from(part.message).length <= 1100) && parts.map(part => part.body).join('') === full, 'free-text review survives exact WhatsApp reconstruction');

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
const outside = new MemoryStorage();
check(!('saveAnalysisRecovery' in recovery) && !src('src/pages/LeadGate.tsx').includes('analysisRecovery'), 'review-bearing reports have no persistence path through the WhatsApp gate');
const progress = createTransferProgress('review', parts);
progress.parts[0] = { ...progress.parts[0], status: 'sent', openedAt: 1, confirmedAt: 2 };
progress.currentIndex = 1;
writeTransferProgress(outside, progress);
const storedProgress = outside.getItem(transferProgressKey('review'))!;
check(!storedProgress.includes('مراجعتك معنا') && !storedProgress.includes('أريد مرجعاً') && !storedProgress.includes('message'), 'transfer storage retains metadata without a copy of review text');
assert.equal(readTransferProgress(outside, 'review', parts).currentIndex, 1);
check(true, 'metadata-only transfer progress restores against the current session text');

custom = { ...custom, page: 3, editing: { 3: true }, drafts: { 3: raw } };
const restored = sanitizeDiagnosticPersisted(JSON.parse(JSON.stringify({ state: { review: custom } })));
assert.deepEqual(restored.review, custom);
check(true, 'sanitizer preserves current page, accepted responses and in-progress free text');
assert.deepEqual(sanitizeReviewState({ page: 999, responses: { 1: { kind: 'custom', text: 'x'.repeat(301) } }, drafts: { 1: 2 } }), emptyReviewState());
check(true, 'corrupt persisted review values and overlong responses fail closed');
for (const file of ['src/pages/ReviewPage.tsx', 'src/services/reviewContent.ts', 'src/services/reviewState.ts']) {
  assert.doesNotMatch(src(file), /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|indexedDB)\s*[.(]/);
}
check(true, 'review UI/services have no network calls or storage outside the existing session store');
assert.deepEqual(reviewHistoryRoutes(3), ['/questionnaire', '/review/1', '/review/2', '/review/3']);
assert.deepEqual(reviewHistoryRoutes(1), ['/questionnaire', '/review/1']);
check(src('src/pages/ReviewPage.tsx').includes('navigate(-1)') && src('src/pages/ReviewPage.tsx').includes('maxLength={REVIEW_FREE_TEXT_LIMIT}'), 'native back history and bounded free-text input are wired');
check(src('src/pages/LeadGate.tsx').includes('review: current.review'), 'identity rebuild forwards the confirmed review into the consultant dossier');
check(src('src/pages/Report.tsx').includes('data-testid="review-report-section"'), 'review section is rendered inside the existing report gate');

// Rehydrate the real store, not just a parallel test state object.
const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true });
const { useDiagnosticStore } = await import('../src/store/diagnosticStore');
useDiagnosticStore.setState({ ...sessions[0], review: custom } as any);
const snapshot = storage.getItem('bik-diagnostic-storage')!;
useDiagnosticStore.setState({ review: emptyReviewState() });
storage.setItem('bik-diagnostic-storage', snapshot);
await useDiagnosticStore.persist.rehydrate();
assert.deepEqual(useDiagnosticStore.getState().review, custom);
check(true, 'the real persisted session store restores the page and unsubmitted draft');
useDiagnosticStore.getState().undoLastAnswer();
assert.deepEqual(useDiagnosticStore.getState().review, emptyReviewState());
check(true, 'editing questionnaire answers invalidates the previous review');

// Mission 5-A: compare complete approved statements. Jaccard >= 0.65 is considered too similar.
const SIMILARITY_LIMIT = 0.65;
const words = (text: string) => new Set(text.normalize('NFKC').replace(/[\u064B-\u065F\u0670ـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').match(/[\p{L}\p{N}]+/gu) || []);
function similarity(a: string, b: string): number {
  const left = words(a), right = words(b);
  return [...left].filter(word => right.has(word)).length / new Set([...left, ...right]).size;
}
check(similarity('تأخر تنفيذ العمل داخل الشركة', 'تأخر تنفيذ العمل داخل الشركة!') === 1
  && similarity('تأخر تنفيذ العمل داخل الشركة', 'تأخر تنفيذ العمل داخل الشركة اليوم') >= SIMILARITY_LIMIT,
  'similarity check rejects exact and near-literal statements after punctuation normalization');
let maximumPage1Similarity = 0;
for (let left = 0; left < page1Entries.length; left += 1) {
  for (let right = left + 1; right < page1Entries.length; right += 1) {
    const a = page1Entries[left], b = page1Entries[right];
    const value = similarity(a[1], b[1]);
    maximumPage1Similarity = Math.max(maximumPage1Similarity, value);
    assert.ok(value < SIMILARITY_LIMIT, `Mission 8: page-1 similarity ${value}: ${a[0]} / ${b[0]}`);
  }
}
check(true, 'Mission 8: all 1953 pairs across pain, axisPain, sectorPain and noPain have Jaccard < 0.65');
console.log(`PAGE-1 SIMILARITY: max=${maximumPage1Similarity.toFixed(3)}, reject>=${SIMILARITY_LIMIT}; TEMPLATES: ${page1Entries.length}`);
check(sessions.length === 5 && sessions[3].sectorL1 === 'professional'
  && sessions[3].universalAnswers?.u18 === 'none' && sessions[3].universalAnswers?.u03 === 'yes_comfortable'
  && sessions[4].universalAnswers?.u09 === 10 && sessions[4].universalAnswers?.u16 === 'no',
  'five complete synthetic sessions include mixed services and weak sales with a weak team');
let maximumSimilarity = 0;
for (const session of sessions) {
  const pages = buildReviewPages(session), copy = reviewCopy(dialectForCountry(session.intakeAnswers?.country));
  const symptoms = pages[0], worries = pages[2];
  check(!worries.sources.some(source => symptoms.sources.includes(source)),
    `${session.sessionId}: no question supplies direct symptom text to both pages 1 and 3`);
  const score = computeDeterministicScore(session.universalAnswers!, session.intakeAnswers);
  const negativeIds = Object.values(score.axisDetails).flatMap(detail => detail.evidence
    .filter(item => item.signal === 'negative').map(item => item.sourceQuestionId));
  for (let index = 0; index < worries.sources.length; index += 1) {
    const source = worries.sources[index];
    if (!source.startsWith('consequence:')) continue;
    const id = source.slice('consequence:'.length);
    assert.ok(negativeIds.includes(id), `consequence ${id} requires actual negative evidence`);
    assert.equal(worries.lines[index], copy.consequence[id] || copy.consequence.other);
    assert.ok(!(copy.pain[id] || []).includes(worries.lines[index]), 'namespacing cannot disguise repeated symptom text');
  }
  check(true, `${session.sessionId}: consequences use independent templates and trace to actual negative evidence`);
  check(symptoms.sources.every(id => worries.sources.includes(`consequence:${id}`)),
    `${session.sessionId}: each displayed symptom feeds an independent consequence before other evidence`);
  for (let left = 0; left < pages.length; left += 1) {
    for (let right = left + 1; right < pages.length; right += 1) {
      for (const a of pages[left].lines) for (const b of pages[right].lines) {
        const value = similarity(a, b); maximumSimilarity = Math.max(maximumSimilarity, value);
        assert.ok(value < SIMILARITY_LIMIT, `${session.sessionId}: cross-page similarity ${value}: ${a} / ${b}`);
      }
    }
  }
  check(true, `${session.sessionId}: complete statements are distinct across all three pages (Jaccard < ${SIMILARITY_LIMIT})`);
  check(worries.lines.length > 0 && (negativeIds.length === 0 || !worries.lines.includes(copy.fallback[3])),
    `${session.sessionId}: worries are nonempty and never claim absence of fears when negative evidence exists`);
  const axes = symptoms.sources.map(id => Object.entries(DIAGNOSTIC_DIMENSIONS).find(([, ids]) => ids.includes(id))?.[0]
    || getSectorQuestions(session.sectorL1, session.sectorL2).find(question => question.id === id)?.dimension || id);
  check(symptoms.lines.length <= 3 && axes.length === new Set(axes).size,
    `${session.sessionId}: page 1 has at most three statements and at most one per available axis`);
  const interventions = pages[1].lines.filter(line => line.includes('فأولى الخطوات:'));
  if (symptoms.sources.length) {
    assert.equal(interventions.length, 1);
    const id = symptoms.sources[0];
    assert.ok(interventions[0].startsWith((copy.problemHook[id] || copy.problemHook.other) + ' '));
    const axis = Object.entries(DIAGNOSTIC_DIMENSIONS).find(([, ids]) => ids.includes(id))?.[0];
    const solution = copy.solution[id] || (axis ? copy.axisSolution[axis] : copy.sectorSolution);
    assert.equal(interventions[0], `${copy.problemHook[id] || copy.problemHook.other} ${solution}`,
      'the intervention is exactly the approved hook, one space and the nominal solution');
    assert.ok(interventions[0].endsWith('.'), 'the complete intervention ends with a period');
    assert.equal(pages[1].sources.at(-1), id);
    assert.ok(pages[1].sources.includes(id));
  } else assert.equal(interventions.length, 0);
  check(true, `${session.sessionId}: one intervention begins with the approved hook for the linked page-1 problem`);
}
console.log(`CROSS-PAGE SIMILARITY: max=${maximumSimilarity.toFixed(3)}, reject>=${SIMILARITY_LIMIT}; SYNTHETIC SESSIONS: ${sessions.length}`);

const copy = reviewCopy(dialectForCountry(sessions[0].intakeAnswers?.country));
const diverse = buildReviewPages(sessions[3])[0];
check(diverse.sources.length === 3, 'mixed services fills three distinct evidenced axes instead of repeating the strongest axis');
const diverseWithGap = buildReviewPages({ ...sessions[3], universalAnswers: { ...sessions[3].universalAnswers, u31: 'unknown' } });
check(diverseWithGap[0].sources.every(id => diverseWithGap[2].sources.includes(`consequence:${id}`))
  && diverseWithGap[2].lines.includes(copy.financialGap) && diverseWithGap[2].lines.length <= 4,
  'three displayed symptoms retain all consequences and the real financial gap within four statements');
const healthy = { ...sectorSession, sectorAnswers: {}, universalAnswers: { ...sectorSession.universalAnswers, u06: 25, u31: 300000 } };
assert.deepEqual(buildReviewPages(healthy)[2].lines, [copy.fallback[3]]);
check(true, 'a fully answered session with no negative evidence shows only the honest worry fallback');
const healthyAnswers = healthy.universalAnswers;
const oneAxis = { ...healthy, universalAnswers: { ...healthyAnswers, u04: 'negative_surprise', u05: 'slower', u06: 'lt5', u08: 'yes' } };
const oneAxisPage = buildReviewPages(oneAxis)[0];
check(oneAxisPage.sources.length >= 1 && oneAxisPage.sources.length <= 2
  && oneAxisPage.sources.every(id => DIAGNOSTIC_DIMENSIONS['الصحة المالية'].includes(id)),
  'a session with only one weak axis uses one or two symptoms from that axis');
const negativeInStableAxis = { ...healthy, universalAnswers: { ...healthyAnswers, u01: 'never' } };
check(buildReviewPages(negativeInStableAxis)[2].sources.includes('consequence:u01')
  && !buildReviewPages(negativeInStableAxis)[2].lines.includes(copy.fallback[3]),
  'negative evidence still feeds consequences when its axis is not selected as weak');
const missingRevenue = { ...healthy, universalAnswers: { ...healthyAnswers, u31: 'unknown' } };
check(buildReviewPages(missingRevenue)[2].lines.includes(copy.financialGap), 'financial gap appears when monthly revenue is missing');
check(buildReviewPages({ ...healthy, universalAnswers: { ...healthyAnswers, u31: undefined } })[2].lines.includes(copy.financialGap),
  'financial gap appears when monthly revenue has no answer at all');
for (const margin of ['unknown', 'skipped', 'لا أحسبها بدقة', undefined]) {
  check(buildReviewPages({ ...healthy, universalAnswers: { ...healthyAnswers, u06: margin } })[2].lines.includes(copy.financialGap),
    `financial gap appears for an unknown or skipped margin: ${String(margin)}`);
}
for (const margin of ['lt5', '5_10', '10_20', 'gt20', 12.7]) {
  check(!buildReviewPages({ ...healthy, universalAnswers: { ...healthyAnswers, u06: margin } })[2].lines.includes(copy.financialGap),
    `financial gap is absent for a declared band or exact margin: ${margin}`);
}
check(!buildReviewPages({ ...healthy, universalAnswers: { ...healthyAnswers, u31: 0 } })[2].lines.includes(copy.financialGap),
  'declared zero revenue is available data, not an absent answer');
check(!buildReviewPages({ ...missingRevenue, intakeAnswers: { ...healthy.intakeAnswers, monthlyRevenue: 100000 } })[2].lines.includes(copy.financialGap),
  'an available intake revenue prevents a false gap when u31 is unknown');
check(!buildReviewPages(sessions[0])[2].lines.includes(copy.financialGap), 'the original cash session with a margin band no longer claims missing financial answers');
const sectorConsequences = buildReviewPages(sectorSession)[2];
check(sectorConsequences.sources.includes('consequence:h01') && sectorConsequences.lines.includes(copy.consequence.h01),
  'sector-only negative evidence also feeds an independent consequence');
console.log(`REVIEW PAGES: ${passed} PASSED, 0 FAILED`);
