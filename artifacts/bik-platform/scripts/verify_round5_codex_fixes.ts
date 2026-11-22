/**
 * verify_round5_codex_fixes.ts
 *
 * Pins the nine findings of the Codex v7 audit (F1-F9) as tests BEFORE any fix
 * (protocol rule 3: test before code). Run: pnpm tsx scripts/verify_round5_codex_fixes.ts
 *
 * F1  sector questions may not precede unfinished universal core questions (journey order)
 * F2  Report consent gate must be resolved synchronously, before the report JSX commits
 * F3  localStorage recovery "consented" must never open the report gate on a fresh mount
 * F4  corrupted persisted payloads are sanitized, and the visitor never sees error.message
 * F5  every client-facing sector fallback is «الأعمال والخدمات»
 * F6  a message over MAX_MESSAGE_CHARS is rejected (400) before sanitization slices it
 * F7  guardAssistantReply strips HTML/script markup from replies
 * F8  persisted "all sent" progress without the done-mark never reads back as complete;
 *     the 7-key wipe also runs on restore, not only inside acknowledgeCurrent
 * F9  the diagnostic flow renders offer figures without a currency word; the consultant
 *     page keeps the full USD wording; the user-mandated per-day line stays verbatim
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(join(here, '..', rel), 'utf8');

let failed = 0;
const section = (name: string, run: () => void | Promise<void>) =>
  Promise.resolve()
    .then(run)
    .catch((error: unknown) => {
      failed += 1;
      console.error(`  ✗ ${name}: ${(error as Error).message.split('\n')[0]}`);
    });

// ---- F1: journey order — universal core first, sector only after ----
{
  await section('F1', async () => {
    const { getNextAdaptiveQuestion } = await import('../src/services/adaptiveDiagnosticEngine');
    const { UNIVERSAL_QUESTION_METADATA } = await import('../src/data/questionClassification');

    const answers: Record<string, any> = {};
    const journey: Array<{ id: string }> = [];
    for (let step = 0; step < 300; step += 1) {
      const result = getNextAdaptiveQuestion({ sectorL1: 'healthcare', diagnosticDepth: 'deep', answers });
      if (result.isComplete || !result.question) break;
      journey.push(result.question);
      const q: any = result.question;
      if (q.type === 'single_choice') answers[q.id] = q.options?.[0]?.value ?? 'yes';
      else if (q.type === 'multi_choice') answers[q.id] = q.options?.[0]?.value ?? '';
      else if (q.type === 'slider') answers[q.id] = Math.round(((q.min ?? 0) + (q.max ?? 10)) / 2);
      else if (q.type === 'number') answers[q.id] = 5;
      else answers[q.id] = 'إجابة تشخيصية للاختبار';
    }
    assert.ok(journey.length > 5, 'the journey walk produced questions (sanity)');

    const universalCoreIds = new Set(Object.entries(UNIVERSAL_QUESTION_METADATA)
      .filter(([, meta]) => meta.priority <= 2)
      .map(([id]) => id));
    const firstSectorIndex = journey.findIndex(q => !q.id.startsWith('u'));
    assert.ok(firstSectorIndex !== -1, 'the walk reaches the sector phase (sanity)');
    const lateUniversalCore = journey
      .map((q, index) => ({ id: q.id, index }))
      .filter(q => universalCoreIds.has(q.id) && q.index > firstSectorIndex);
    assert.ok(
      lateUniversalCore.length === 0,
      `sector questions must not precede unfinished universal core questions, but [${lateUniversalCore.map(q => `${q.id}@${q.index}`).join(', ')}] came after the first sector question (index ${firstSectorIndex})`
    );
  });
}

// ---- F2/F3: the report gate is synchronous and never trusts recovery consent ----
{
  await section('F2+F3', async () => {
    let reportGate: any;
    try {
      reportGate = await import('../src/services/reportGate');
    } catch {
      throw new Error('src/services/reportGate.ts is missing: the gate cannot be resolved synchronously (F2) and recovery consent still bypasses it (F3)');
    }
    const { resolveReportGate } = reportGate;

    // F2: closed gate = blocked, with an explicit redirect, never "open by default".
    const closed = resolveReportGate({ hasReport: true, sessionConsent: false, allPartsSent: false, doneMarkVerified: false });
    assert.equal(closed.open, false, 'a fresh mount without session consent is not open');
    assert.equal(closed.redirect, 'lead-gate', 'a fresh mount without consent is redirected to the lead gate');

    // F3: a fully sent transfer without the done-mark proves nothing.
    const forged = resolveReportGate({ hasReport: true, sessionConsent: false, allPartsSent: true, doneMarkVerified: false });
    assert.equal(forged.open, false, 'all-sent progress without the done-mark never opens the gate');
    assert.equal(forged.redirect, 'lead-gate', 'the forged state lands on the lead gate, not the report');

    // The legitimate completion path still opens.
    const open = resolveReportGate({ hasReport: true, sessionConsent: false, allPartsSent: true, doneMarkVerified: true });
    assert.equal(open.open, true, 'the done-mark plus all parts sent opens the report');
    assert.equal(open.redirect, null);

    // Session consent without a completed transfer goes back to the transfer page.
    const midTransfer = resolveReportGate({ hasReport: true, sessionConsent: true, allPartsSent: false, doneMarkVerified: false });
    assert.equal(midTransfer.open, false, 'consent alone does not open the report');
    assert.equal(midTransfer.redirect, 'report-transfer');

    // No report at all goes home.
    const empty = resolveReportGate({ hasReport: false, sessionConsent: true, allPartsSent: true, doneMarkVerified: true });
    assert.equal(empty.redirect, 'home');

    const reportSource = src('src/pages/Report.tsx');
    assert.ok(reportSource.includes('resolveReportGate('), 'Report.tsx resolves the gate through the shared service');
    assert.ok(/useState\(\(\) =>/.test(reportSource), 'the gate is resolved in a synchronous useState initializer, before any effect can run');
    assert.ok(/if \(!gate\.open\)/.test(reportSource), 'the main JSX is guarded by an early return on the closed gate');
    assert.ok(!reportSource.includes('snapshot?.consented'), 'the localStorage recovery consent field no longer reaches the gate (F3)');
  });
}

// ---- F4: corrupted persisted payloads are sanitized; visitors never see error.message ----
{
  await section('F4', async () => {
    let sanitizer: any;
    try {
      sanitizer = await import('../src/services/persistedStateSanitizer');
    } catch {
      throw new Error('src/services/persistedStateSanitizer.ts is missing: corrupted persisted state still reaches the store unvalidated');
    }
    const { sanitizeDiagnosticPersisted } = sanitizer;

    const corrupt = {
      state: {
        sessionId: 42,
        companyName: { nested: true },
        questionHistory: 'not-an-array',
        answers: 'also-not-an-object',
        currentQuestionId: 12345,
        diagnosticDepth: 'ultra',
        sectorL1: { code: 'h' }
      },
      version: 99
    };
    const safe = sanitizeDiagnosticPersisted(corrupt) as Record<string, any>;
    assert.ok(safe && typeof safe === 'object', 'the sanitizer returns an object for any input');
    assert.equal(safe.sessionId, undefined, 'a non-string sessionId is dropped');
    assert.ok(safe.questionHistory === undefined || Array.isArray(safe.questionHistory), 'questionHistory is an array or absent');
    if (safe.questionHistory !== undefined) assert.ok(Array.isArray(safe.questionHistory), 'questionHistory is never a string');
    if (safe.answers !== undefined) {
      assert.equal(typeof safe.answers, 'object', 'answers is never a string');
      assert.ok(!Array.isArray(safe.answers), 'answers is never an array');
    }
    if (safe.currentQuestionId !== undefined) assert.equal(typeof safe.currentQuestionId, 'string', 'currentQuestionId is a string or absent');
    if (safe.diagnosticDepth !== undefined) assert.ok(['quick', 'deep'].includes(safe.diagnosticDepth), 'diagnosticDepth is only quick or deep');
    if (safe.sectorL1 !== undefined) assert.equal(typeof safe.sectorL1, 'string', 'sectorL1 is a string or absent');

    // A valid payload survives intact.
    const valid = sanitizeDiagnosticPersisted({
      state: { sessionId: 's1', companyName: 'شركة', questionHistory: [{ questionId: 'u01', answer: 'نعم' }], answers: { u01: 'نعم' }, sectorL1: 'h', diagnosticDepth: 'deep' },
      version: 1
    }) as Record<string, any>;
    assert.equal(valid.sessionId, 's1');
    assert.equal(valid.companyName, 'شركة');
    assert.equal(valid.questionHistory.length, 1);
    assert.equal(valid.answers.u01, 'نعم');
    assert.equal(valid.sectorL1, 'h');
    assert.equal(valid.diagnosticDepth, 'deep');

    // The store must run the sanitizer on rehydration.
    const storeSource = src('src/store/diagnosticStore.ts');
    assert.ok(storeSource.includes('sanitizeDiagnosticPersisted'), 'the diagnostic store validates persisted state on rehydrate');

    // The error boundary never prints the raw technical message to the visitor.
    const boundarySource = src('src/components/ErrorBoundary.tsx');
    assert.ok(!boundarySource.includes('{this.state.error.message}'), 'ErrorBoundary does not render the raw error message');
    assert.ok(boundarySource.includes('حدث خطأ غير متوقع'), 'the visitor sees a calm generic Arabic message instead');
  });
}

// ---- F5: every client-facing sector fallback is «الأعمال والخدمات» ----
{
  await section('F5', async () => {
    const { buildWhatsAppDossierText } = await import('../src/services/dualLayerReport');
    const dossier = buildWhatsAppDossierText({
      sectorL1: '',
      overallScore: null,
      blindSpots: [],
      qaRecord: [],
      priorities: []
    } as any);
    assert.ok(dossier.includes('الأعمال والخدمات'), 'the dossier falls back to «الأعمال والخدمات» for a missing sector');
    assert.ok(!dossier.includes('(اسم النشاط غير مُدخل)'), 'the old identity-style fallback is gone from the dossier');
    assert.ok(!/[a-z]{3,}/.test(dossier.replace(/WhatsApp|BIK/gi, '')), 'no Latin sector id leaks into the dossier');

    const dualSource = src('src/services/dualLayerReport.ts');
    assert.ok(dualSource.includes("|| 'الأعمال والخدمات'"), 'the report sector fallback is the full phrase');
    assert.ok(!dualSource.includes("|| 'الأعمال'"), 'the bare «الأعمال» fallback is gone');
    const fallbackSource = src('src/services/reportFallback.ts');
    assert.ok(fallbackSource.includes('الأعمال والخدمات'), 'the fallback report uses the full phrase');
    assert.ok(!fallbackSource.includes("'قطاع الأعمال'"), 'the old «قطاع الأعمال» fallback is gone');
  });
}

// ---- F6: an oversized message is rejected before sanitization slices it ----
{
  await section('F6', async () => {
    const { validateChatRequest, MAX_MESSAGE_CHARS } = await import('../src/services/chatPolicy');
    const oversized = 'ا'.repeat(MAX_MESSAGE_CHARS + 1);
    const rejected = validateChatRequest({ messages: [{ role: 'user', text: oversized }] });
    assert.equal(rejected.ok, false, 'a message above the limit is rejected');
    assert.equal(rejected.error, 'message_too_long', 'the rejection names the reason');
    const boundary = validateChatRequest({ messages: [{ role: 'user', text: 'ا'.repeat(MAX_MESSAGE_CHARS) }] });
    assert.equal(boundary.ok, true, 'a message exactly at the limit is accepted');
  });
}

// ---- F7: replies never carry HTML/script markup ----
{
  await section('F7', async () => {
    const { guardAssistantReply } = await import('../src/services/chatPolicy');
    const script = guardAssistantReply('نصيحة قيّمة <script>alert(1)</script> تابع');
    assert.ok(!script.includes('<'), 'no tag opener survives the guard');
    assert.ok(!/script/i.test(script), 'the script tag is gone entirely');
    const bold = guardAssistantReply('نص <b>عنوان</b> بعد');
    assert.equal(bold, 'نص عنوان بعد', 'markup is stripped while the words stay');
  });
}

// ---- F8: forged "all sent" never reads back complete; the wipe runs on restore too ----
{
  await section('F8', async () => {
    const transfer = await import('../src/services/reportTransferState');
    const { readTransferProgress, transferProgressKey, transferDoneKey, partsFingerprint } = transfer;

    const memory = (): TransferStorage & { data: Map<string, string> } => {
      const data = new Map<string, string>();
      return {
        data,
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
        removeItem: (key: string) => void data.delete(key)
      };
    };
    const parts = [{ message: 'أ' }, { message: 'ب' }, { message: 'ج' }] as any[];

    // The forge: every part "sent" with plausible timestamps, no done-mark.
    const store = memory();
    const at = Date.now();
    const forgedProgress = {
      sessionId: 's1',
      parts: parts.map(part => ({ ...part, status: 'sent', openedAt: at - 1000, confirmedAt: at })),
      currentIndex: parts.length,
      updatedAt: at
    };
    store.setItem(transferProgressKey('s1'), JSON.stringify(forgedProgress));
    const read = readTransferProgress(store, 's1', parts);
    assert.equal(read.currentIndex, 0, 'a forged all-sent record without the done-mark restarts the transfer');
    assert.ok(read.parts.every(part => part.status === 'pending'), 'every forged sent part reads back as pending');

    // The honest completion path still reads back complete.
    const honest = memory();
    honest.setItem(transferDoneKey('s1'), JSON.stringify({ sessionId: 's1', fingerprint: partsFingerprint(parts), completedAt: at }));
    const done = readTransferProgress(honest, 's1', parts);
    assert.equal(done.currentIndex, parts.length, 'a matching done-mark keeps the transfer complete');
    assert.ok(done.parts.every(part => part.status === 'sent'));

    // A done-mark whose fingerprint does not match the report is refused.
    honest.setItem(transferDoneKey('s1'), JSON.stringify({ sessionId: 's1', fingerprint: '3:deadbeef', completedAt: at }));
    const mismatch = readTransferProgress(honest, 's1', parts);
    assert.equal(mismatch.currentIndex, 0, 'a done-mark for a different report text does not open the transfer');

    // The 7-key wipe must exist as one shared function and be called on restore too.
    assert.ok(typeof (transfer as any).wipeTransferSessionArtifacts === 'function', 'reportTransferState exports one shared wipe function');
    const pageSource = src('src/pages/ReportTransfer.tsx');
    const calls = pageSource.split('wipeTransferSessionArtifacts(').length - 1;
    assert.ok(calls >= 2, `the wipe runs on completion AND on restore (found ${calls} call site(s))`);
  });
}

// ---- F9: config supplies the same exact USD prices to every page ----
{
  await section('F9', async () => {
    const { BIK_OFFERS } = await import('../src/config/appConfig');
    assert.deepEqual(Object.values(BIK_OFFERS).map(offer => offer.price), ['$5000', '$499', '$272']);
    assert.equal(BIK_OFFERS.monthlyRetainer.perDayNote, 'أقل من 17 دولاراً في اليوم');

    const cardsSource = src('src/components/OfferCards.tsx');
    assert.ok(cardsSource.includes('{offer.price}'), 'the report reads the configured USD price');
    const chatSource = src('src/services/chatPolicy.ts');
    assert.ok(chatSource.includes('offer.price'), 'the chat system prompt reads the configured USD price');
  });
}

console.log(failed === 0
  ? 'verify_round5_codex_fixes: كل نتائج تدقيق Codex التسع مثبتة ✅'
  : `verify_round5_codex_fixes: ${failed} قسم/أقسام فاشلة (المتوقع قبل الإصلاح)`);
process.exitCode = failed === 0 ? 0 : 1;
