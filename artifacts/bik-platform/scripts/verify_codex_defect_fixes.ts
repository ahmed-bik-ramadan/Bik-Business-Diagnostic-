/**
 * Codex defect round (cases 1, 5, 6, 7, 8, 9): every defect reported in isolated
 * component testing, fixed and pinned here.
 * Run: npx tsx scripts/verify_codex_defect_fixes.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { redactPersonalData, containsPersonalData, appendPersonalDataWarning, PERSONAL_DATA_NOTICE, guardAssistantReply } from '../src/services/chatPolicy.ts';
import { scrubInternalIds, hasInternalId } from '../src/services/internalIdScrub.ts';
import { readTransferProgress, createTransferProgress, writeTransferProgress, markTransferPartOpened, confirmTransferPart, finishTransfer, transferProgressKey, type TransferStorage } from '../src/services/reportTransferState.ts';
import { buildWhatsAppReportParts } from '../src/services/reportTextDelivery.ts';

function memoryStorage(): TransferStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); }
  };
}

// ---- Case 5: internal identifiers never reach client-facing text ----
{
  const label = scrubInternalIds('مستند إلى إجابة السؤال (u06 / u31) في بُعد التشغيل');
  assert.ok(!hasInternalId(label), 'SWOT evidence label carries no question codes after scrubbing');
  assert.ok(label.includes('بُعد التشغيل'), 'the Arabic meaning survives the scrub');
  assert.equal(hasInternalId('fnb_food_waste'), true, 'snake_case formula keys are detected');
  assert.equal(scrubInternalIds('النقطة العمياء: fnb_food_waste تترك أثراً'), 'النقطة العمياء: تترك أثراً', 'formula keys are scrubbed from prose');
  assert.equal(hasInternalId('hasDebt / debtMonthlyPct'), true, 'field chains are detected');
  assert.equal(scrubInternalIds('الحقول الناقصة hasDebt / debtMonthlyPct'), 'الحقول الناقصة', 'field chains are scrubbed');
  // Legitimate tokens a client may see pass untouched.
  assert.equal(scrubInternalIds('الإيراد 5000 بالدولار USD عبر منصة BIK، هامش 12%'), 'الإيراد 5000 بالدولار USD عبر منصة BIK، هامش 12%', 'ordinary words and figures pass untouched');
  // The WhatsApp dossier builder scrubs its output at the boundary.
  const dualSource = fs.readFileSync('src/services/dualLayerReport.ts', 'utf8');
  assert.ok(dualSource.includes('const fullDossierText = scrubInternalIds(buildWhatsAppDossierText('), 'the owner-message text is scrubbed before it becomes WhatsApp parts');
  assert.ok(dualSource.includes("question_text: entry.questionText || qMeta?.text || 'سؤال غير متاح'"), 'a missing question text never falls back to the raw internal id');
  // The SWOT builder no longer emits ids in its labels at the source.
  const swotSource = fs.readFileSync('src/services/evidenceSwot.ts', 'utf8');
  assert.ok(!/evidence_label:[^\n]*\((?:u|s|h|re|f|l|t|c)\d/.test(swotSource), 'no evidence label embeds a question code at the source');
  // The report screen scrubs evidence strings at display time.
  const detailsSource = fs.readFileSync('src/components/report/ReportDetails.tsx', 'utf8');
  assert.ok(detailsSource.includes('scrubInternalIds(issue.evidence)'), 'observed-weakness evidence strings are scrubbed before display');
  assert.ok(detailsSource.includes('scrubInternalIds(item.evidence_label)'), 'the SWOT label is scrubbed at display time too');
}

// ---- Case 7: the أنا pattern is redacted, and the notice anchor is exact ----
{
  const cleaned = redactPersonalData('أنا نور الاختبار، هاتفي +20 100 000 0000 وبريدي qa@example.test');
  assert.ok(!cleaned.includes('نور'), 'the name after أنا is redacted before it reaches the provider');
  assert.ok(!cleaned.includes('الاختبار'), 'the second word of the self-introduction is redacted too');
  assert.ok(cleaned.includes('[محذوف]'), 'the redaction marker is present');
  assert.equal(containsPersonalData(cleaned), true, 'the redacted message still triggers the personal-data flag');
  const plain = redactPersonalData('أنا لست متأكداً من الأرقام، لكن عندنا تأخير في التحصيل');
  assert.ok(!plain.includes('[محذوف]'), 'أنا followed by a function or verb word is not mangled');
  assert.ok(containsPersonalData('اسمي نور من شركة النور'), 'the اسمي cue still triggers the flag');
  assert.ok(!redactPersonalData('اسمي نور').includes('نور'), 'the اسمي cue still redacts');
  // Notice anchor: a reply that merely says "لا حاجة" in another sense must not swallow the notice.
  const bareReply = 'قلقك مفهوم، ولا حاجة للقلق: الأرقام تُحسب من إجاباتك أنت.';
  const appended = appendPersonalDataWarning(bareReply);
  assert.ok(appended.includes(PERSONAL_DATA_NOTICE), 'the notice is appended even when the reply says لا حاجة in another context');
  // Server-side composition: the user message is redacted, flagged, and the reply gets the notice once.
  const userMsg = redactPersonalData('أنا نور الاختبار، كيف أحسب خسارتي؟');
  const reply = guardAssistantReply(userMsg, 'سأحلل أرقامك.');
  const finalReply = containsPersonalData(userMsg) ? appendPersonalDataWarning(reply) : reply;
  assert.ok(finalReply.includes(PERSONAL_DATA_NOTICE), 'the guarded reply carries the notice when the visitor sent personal data');
  assert.equal(appendPersonalDataWarning(finalReply), finalReply, 'the notice appears at most once');
}

// ---- Case 8: a tampered 'sent' status without the real timestamps reads back as pending ----
{
  const parts = buildWhatsAppReportParts('سطر تجريبي للدوسيه ' + 'ك'.repeat(300), 'ses-case8');
  assert.ok(parts.length >= 1, 'test parts are built');
  const storage = memoryStorage();
  const real = createTransferProgress('ses-case8', parts);
  const opened = markTransferPartOpened(real, 0);
  const confirmed = confirmTransferPart(opened, 0).progress;
  writeTransferProgress(storage, confirmed);
  // F8 (round-5): the genuine path to "all sent" passes through finishTransfer, which
  // writes the done-mark; a confirmed part alone no longer reads back as complete.
  assert.ok(finishTransfer(storage, 'ses-case8', parts, () => {}), 'the genuine completion writes its done-mark');
  const honest = readTransferProgress(storage, 'ses-case8', parts);
  assert.equal(honest.parts[0].status, 'sent', 'a genuinely confirmed part stays sent');
  assert.equal(honest.currentIndex, parts.length, 'the flow advanced past the genuinely confirmed part');
  // Tamper: flip every part to 'sent' while erasing both timestamps (no done-mark present).
  const tamperStorage = memoryStorage();
  const tampered = JSON.parse(JSON.stringify(confirmed));
  tampered.parts = tampered.parts.map((part: any) => ({ ...part, status: 'sent', openedAt: null, confirmedAt: null }));
  tampered.currentIndex = parts.length;
  writeTransferProgress(tamperStorage, tampered);
  const restored = readTransferProgress(tamperStorage, 'ses-case8', parts);
  assert.equal(restored.parts[0].status, 'pending', 'a sent status without both real timestamps reads back as pending');
  assert.equal(restored.currentIndex, 0, 'a tampered record cannot mark the transfer complete');
  // Backwards timestamps are tamper too: confirmation cannot precede the open.
  const reversed = JSON.parse(JSON.stringify(confirmed));
  reversed.parts[0].openedAt = Date.now();
  reversed.parts[0].confirmedAt = Date.now() - 60_000;
  writeTransferProgress(tamperStorage, reversed);
  const restoredReversed = readTransferProgress(tamperStorage, 'ses-case8', parts);
  assert.equal(restoredReversed.parts[0].status, 'pending', 'a confirmation stamped before its open is rejected');
}

// ---- Case 1: an offline device cannot record an opened part ----
{
  const source = fs.readFileSync('src/pages/ReportTransfer.tsx', 'utf8');
  assert.ok(source.includes('navigator.onLine === false'), 'the open handler checks the device connection before opening wa.me');
  const openIndex = source.indexOf('const openWhatsApp');
  const onLineIndex = source.indexOf('navigator.onLine === false');
  const persistIndex = source.indexOf('persistOpened(selectedIndex)');
  assert.ok(openIndex > 0 && onLineIndex > openIndex && persistIndex > onLineIndex, 'the online check runs before anything is persisted as opened');
  assert.ok(source.includes('data-testid="offline-blocked"'), 'an offline refusal shows its own plain panel');
  assert.ok(source.includes('لم يُحتسب أي جزء ولم يُسجَّل أي إرسال'), 'the offline panel states plainly that nothing was counted');
}

// ---- Case 6: a structurally incomplete score object is uncomputed, never 0/100 ----
{
  const source = fs.readFileSync('src/services/dualLayerReport.ts', 'utf8');
  const overallComputedBlock = source.slice(source.indexOf('const overallComputed'), source.indexOf('const coveragePct') > 0 ? source.indexOf('const coveragePct') : source.indexOf('const overallComputed') + 900);
  assert.ok(overallComputedBlock.includes('Number.isFinite(rawOverall)'), 'overallComputed requires a finite overall number');
  const previewSource = fs.readFileSync('src/components/report/ReportPreview.tsx', 'utf8');
  assert.ok(previewSource.includes('المؤشر غير محسوب') && previewSource.includes('health_score_computed === false'), 'the preview shows the honest uncomputed state instead of 0/100');
}

// ---- Case 9: storage failures get their own panels instead of a silent redirect ----
{
  const source = fs.readFileSync('src/pages/ReportTransfer.tsx', 'utf8');
  const probeIndex = source.indexOf("window.sessionStorage.getItem('__bik_probe')");
  const writeProbeIndex = source.indexOf('__bik_probe_w:');
  const reportIndex = source.indexOf("if (!report) {");
  assert.ok(probeIndex > 0 && writeProbeIndex > 0 && reportIndex > writeProbeIndex, 'the storage read and write probes run before the report-null redirect');
  assert.ok(source.includes("window.sessionStorage.removeItem(probeKey)"), 'the write probe is cleaned up after itself');
  assert.ok(source.includes('data-testid="storage-write-blocked"'), 'a write-blocked browser gets its own named panel');
  assert.ok(source.includes('يرفض الحفظ'), 'the write-blocked panel names the write failure specifically');
  assert.ok(source.includes('data-testid="storage-blocked"'), 'a read-blocked browser keeps its named panel');
}

console.log('CODEX DEFECT FIXES CONTRACT: PASSED, 0 FAILED');
