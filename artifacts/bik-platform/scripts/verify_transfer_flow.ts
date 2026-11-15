/**
 * Send flow: text travels inside the wa.me link only, a blocked popup gets its own guidance panel (no clipboard route), zero wait, cleanup after completion.
 * Run: tsx scripts/verify_transfer_flow.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWhatsAppReportParts, WHATSAPP_ENCODED_MESSAGE_LIMIT, WHATSAPP_MESSAGE_LIMIT } from '../src/services/reportTextDelivery';
import { buildConsultantWhatsAppUrl, APP_CONFIG } from '../src/config/appConfig';
import {
  completedTransferProgress, confirmTransferPart, createTransferProgress, finishTransfer, isTransferDone,
  markTransferPartOpened, readTransferProgress, transferDoneKey, transferProgressKey, writeTransferProgress
} from '../src/services/reportTransferState';
import { clearAnalysisRecovery, saveAnalysisRecovery, readAnalysisRecovery, readLatestAnalysisRecovery } from '../src/services/analysisRecovery';
import { MIN_WAIT_MS, secondsUntilReady } from '../src/services/transferGate';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => fs.readFileSync(path.join(HERE, '..', rel), 'utf8');
let pass = 0;
let fail = 0;
function check(ok: boolean, msg: string) {
  if (ok) { pass++; console.log(`  PASS: ${msg}`); } else { fail++; console.error(`  FAIL: ${msg}`); }
}
class MemoryStorage {
  map = new Map<string, string>();
  failWrites = false;
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { if (this.failWrites) throw new Error('quota'); this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

// A realistic long Arabic dossier (sentences, paragraphs, digits).
const sentence = 'المبيعات الشهرية تراجعت بنسبة 18% مقارنة بالربع السابق، والسبب الأرجح هو ضعف المتابعة مع العملاء الحاليين. ';
const dossier = Array.from({ length: 14 }, (_, i) => `القسم ${i + 1}\n\n${sentence.repeat(9)}`).join('\n\n');

// 1. Parts: short, and each fits inside a link.
const parts = buildWhatsAppReportParts(dossier, 's1');
check(WHATSAPP_MESSAGE_LIMIT === 1100, 'part budget is 1100 characters');
check(parts.length > 1 && parts.every(p => Array.from(p.message).length <= 1100), `every part is within 1100 characters (${parts.length} parts)`);
check(parts.every(p => encodeURIComponent(p.message).length <= WHATSAPP_ENCODED_MESSAGE_LIMIT), 'every part stays within the encoded link budget');
check(parts.map(p => p.body).join('') === dossier, 'parts rebuild the report text exactly (nothing lost or reordered)');

// 2. The link carries the whole part text.
const phone = APP_CONFIG.consultantWhatsApp.replace(/[^0-9]/g, '');
const link = buildConsultantWhatsAppUrl({ customMessage: parts[0].message });
check(link.url.startsWith(`https://wa.me/${phone}?text=`) && decodeURIComponent(link.url.split('?text=')[1]) === parts[0].message, 'wa.me link holds the full part text');

// 3. The page: the part text travels inside the wa.me link and nowhere else; a blocked popup
// gets a dedicated guidance panel (steps + retry) and no clipboard route exists at all; no
// WhatsApp Web link, no manual text box, no noopener (so a blocked window is detectable);
// the wait gate is removed (zero friction at the send moment).
const page = read('src/pages/ReportTransfer.tsx');
check(!page.includes('copyToClipboard') && !page.includes('execCommand') && !page.includes('<textarea') && !/web\.whatsapp\.com|manual-copy-text|copy-fallback/i.test(page), 'transfer page has no clipboard route, no WhatsApp Web link, no manual text box');
check(!fs.existsSync(path.join(HERE, '..', 'src/services/clipboardCopy.ts')), 'clipboard service is deleted: no copy fallback exists anywhere');
check(page.includes('window.open(target.url, \'_blank\')') && !/window\.open\([^)]*noopener/.test(page) && page.includes('opened.opener = null'), 'window.open without noopener; opener detached afterwards');
check(page.includes('if (!opened)') && page.includes('setPopupBlocked(true)'), 'a blocked window raises the popup-blocked state instead of copying');
check(page.includes('data-testid="popup-blocked"') && page.includes('اسمح بالنوافذ المنبثقة') && page.includes('popup-blocked-retry'), 'blocked popup shows its own guidance panel with enabling steps and a retry button');
check(page.includes('setPopupBlocked(false)'), 'a successful open clears the popup-blocked panel');
check(page.includes('__bik_probe') && page.includes('data-testid="storage-blocked"'), 'blocked localStorage gets its own plain blocking message, not a generic notice');
check(page.includes('secondsUntilReady(waitMark, currentIndex, now)') && page.includes('secondsLeft === 0'), 'confirm button respects the (zero) wait gate');
check(page.includes('finishTransfer(localStorage'), 'completion triggers cleanup');
check(MIN_WAIT_MS === 0, 'wait is zero: the wait gate is removed');
check(secondsUntilReady({ index: 0, at: 0 }, 0, 0) === 0 && secondsUntilReady({ index: 0, at: 0 }, 0, 2999) === 0 && secondsUntilReady({ index: 0, at: 0 }, 0, 3000) === 0, 'gate: ready immediately at 0 ms, at 2.999 s and at 3 s');

// 4. Flow through all parts, then cleanup.
{
  const st = new MemoryStorage();
  const sid = 's1';
  saveAnalysisRecovery(st, { sessionId: sid, report: { dual_layer: { consultantDossier: { full_dossier_text: dossier } } } as any, axisScores: null, axisDetails: null, sectorL1: '', sectorL2: '', consented: true });
  let progress = createTransferProgress(sid, parts);
  for (let i = 0; i < parts.length; i++) {
    progress = markTransferPartOpened(progress, i, 1000 * (i + 1));
    progress = confirmTransferPart(progress, i, 1000 * (i + 1) + 3000).progress;
    writeTransferProgress(st, progress);
  }
  check(progress.currentIndex === parts.length, 'all parts confirmed in order');
  check(st.getItem(transferProgressKey(sid)) !== null && readAnalysisRecovery(st, sid) !== null, 'before cleanup the local copies exist');
  const done = finishTransfer(st, sid, parts, () => clearAnalysisRecovery(st, sid));
  check(done, 'finishTransfer succeeds');
  check(st.getItem(transferProgressKey(sid)) === null, 'per-part text copies are removed');
  check(readAnalysisRecovery(st, sid) === null && readLatestAnalysisRecovery(st) === null, 'local report copy and latest pointer are removed');
  const mark = st.getItem(transferDoneKey(sid)) || '';
  check(mark.length > 0 && mark.length < 200 && !mark.includes('القسم') && !mark.includes('المبيعات'), 'completion mark is small and holds no report text');
  check(isTransferDone(st, sid, parts), 'completion is recognised for the same report');
  const again = readTransferProgress(st, sid, parts);
  check(again.currentIndex === parts.length && again.parts.every(p => p.status === 'sent'), 'reload after cleanup still shows the transfer as complete');
  check(!isTransferDone(st, sid, buildWhatsAppReportParts(dossier + ' إضافة جديدة.', sid)), 'a changed report is not treated as already sent');
  check(completedTransferProgress(sid, parts).currentIndex === parts.length, 'completed progress helper');
}

// 5. If the completion mark cannot be written, nothing is removed.
{
  const st = new MemoryStorage();
  const sid = 's2';
  writeTransferProgress(st, createTransferProgress(sid, parts));
  st.failWrites = true;
  let cleared = false;
  const ok = finishTransfer(st, sid, parts, () => { cleared = true; });
  check(!ok && !cleared && st.getItem(transferProgressKey(sid)) !== null, 'write failure keeps the local state (no data loss, no false completion)');
}

console.log(`\nTRANSFER FLOW: ${pass} PASSED, ${fail} FAILED`);
if (fail) process.exit(1);
