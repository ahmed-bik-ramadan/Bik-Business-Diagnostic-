/**
 * Codex round-2 fixes pinned: Report A (pnpm ignored builds), Report B (م1-م6),
 * Report C (cases 5, 7, 8ب). Every fix is checked at its source and, where a
 * module is importable, functionally.
 * Run: npx tsx scripts/verify_codex_round2_fixes.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BIK_OFFERS } from '../src/config/appConfig';
import { handleChat } from '../server/chatHandler.ts';

// ---- Report A: pnpm build scripts are approved in the workspace config ----
{
  const ws = fs.readFileSync('../../pnpm-workspace.yaml', 'utf8');
  const allowBlock = ws.match(/allowBuilds:\n((?:[ \t]+.*\n)+)/)?.[1] ?? '';
  for (const pkg of ['@google/genai', 'bcrypt', 'esbuild', 'protobufjs']) {
    assert.ok(new RegExp(`'?${pkg}'?:\\s*true`).test(allowBlock), `allowBuilds approves ${pkg}`);
  }
  const onlyBlock = ws.match(/onlyBuiltDependencies:\n((?:[ \t]+-.*\n)+)/)?.[1] ?? '';
  for (const pkg of ['@google/genai', 'bcrypt', 'esbuild', 'protobufjs']) {
    assert.ok(onlyBlock.includes(`'${pkg}'`) || onlyBlock.includes(`- ${pkg}`), `onlyBuiltDependencies lists ${pkg}`);
  }
}

// ---- م1: every intake section carries the لماذا نسأل heading ----
{
  const src = fs.readFileSync('src/pages/CompanyIntake.tsx', 'utf8');
  const headings = src.split('<p className="text-xs font-bold text-[#146B4F]">لماذا نسأل</p>').length - 1;
  assert.equal(headings, 5, 'exactly 5 لماذا نسأل headings, one per section');
  for (const desc of [
    'بيانات هذا القسم تصف لمن نتحدث',
    'طريق شركتك حتى اليوم يفسّر',
    'ما خططت له قبل البدء، ومدى تطابقه مع الواقع',
    'تساعد بيانات هذا القسم على قراءة الوضع المالي',
    'السوق الذي تتنافس فيه يحدد'
  ]) {
    const idx = src.indexOf(desc);
    assert.ok(idx > 0, `section description exists: ${desc.slice(0, 20)}…`);
    const before = src.slice(Math.max(0, idx - 400), idx);
    assert.ok(before.includes('لماذا نسأل'), `heading precedes: ${desc.slice(0, 20)}…`);
  }
}

// ---- م2: LeadGate steps are numbered circles inside an ordered list ----
{
  const src = fs.readFileSync('src/pages/LeadGate.tsx', 'utf8');
  assert.ok(src.includes('<ol className="mt-2 space-y-2'), 'the three steps live in an <ol>');
  for (const digit of ['1', '2', '3']) {
    const marker = `aria-hidden="true">${digit}</span>`;
    assert.ok(src.includes(marker), `step marker ${digit} rendered as a numbered circle`);
  }
  assert.ok(!/mt-2\.5 h-1 w-1/.test(src), 'no leftover round-bullet dots');
}

// ---- م3: transfer completion clears the session (report + answers leave the tab) ----
// F8 (round-5) update: the seven key removals moved into one shared wipe function,
// called at completion AND on restore; the contract is checked at its new home.
{
  const src = fs.readFileSync('src/pages/ReportTransfer.tsx', 'utf8');
  const service = fs.readFileSync('src/services/reportTransferState.ts', 'utf8');
  assert.ok(service.includes('export function wipeTransferSessionArtifacts'), 'the session wipe lives in one shared function (F8)');
  assert.ok(service.includes("'bik-diagnostic-storage'"), 'diagnostic storage is in the wipe list');
  assert.ok(service.includes('bik-sharing-consent:'), 'sharing-consent key is in the wipe list');
  assert.ok(service.includes('bik_session_ownership_token'), 'the ownership token is in the wipe list');
  const sessionKeys = service.match(/sessionKeys = \[([\s\S]*?)\]/)?.[1] ?? '';
  // 6 keys are single-quoted; the consent key is a template literal, so it adds no quote chars.
  const keyCount = (sessionKeys.match(/'/g)?.length ?? 0) / 2 + (sessionKeys.includes('`bik-sharing-consent:') ? 1 : 0);
  assert.ok(keyCount >= 7, `the wipe removes the full session-key list (found ${keyCount} keys)`);
  const calls = src.split('wipeTransferSessionArtifacts(').length - 1;
  assert.ok(calls >= 2, 'the page calls the wipe at completion AND on restore');
}

// ---- م4: the per-day note retains its wording with Latin digits ----
{
  const src = fs.readFileSync('src/config/appConfig.ts', 'utf8');
  assert.ok(!src.includes('toArabicIndic'), 'no helper converts output to Arabic-Indic digits');
  assert.equal(BIK_OFFERS.monthlyRetainer.perDayNote, 'أقل من 17 دولاراً في اليوم');
  assert.ok(!src.includes('في اليوم الواحد'), 'the dropped suffix الواحد is gone');
}

// ---- م5: the client-loss opening line fires even without a declared value model ----
{
  const dual = fs.readFileSync('src/services/dualLayerReport.ts', 'utf8');
  assert.ok(dual.includes("import type { DeclaredValueModel } from './financialValueModel'"), 'DeclaredValueModel type is imported');
  assert.ok(dual.includes('computedMonthlyWaste: sectorBlindSpots.monthlyTotal'), 'sector blind-spot total feeds the synthetic value model');
  const report = fs.readFileSync('src/pages/Report.tsx', 'utf8');
  const block = report.match(/const monthlyWaste = useMemo[\s\S]*?\}, \[report\]\);/)?.[0] ?? '';
  assert.ok(block.length > 0, 'monthlyWaste block exists');
  assert.ok(block.includes('computedMonthlyWaste'), 'monthlyWaste falls back to the computed amount');
  assert.ok(!/isComputable[\s\S]{0,200}return null/.test(block), 'monthlyWaste no longer requires isComputable');
  const offers = fs.readFileSync('src/components/OfferCards.tsx', 'utf8');
  assert.ok(offers.includes('monthlyWaste'), 'the offer loss line consumes the monthlyWaste prop');
  assert.ok(offers.includes('تقدير استرشادي') && offers.includes('monthlyWaste.amount'), 'the monthly amount is labelled as an estimate');
}

// ---- م6: the consultant page uses the full offer names, unchanged ----
{
  const src = fs.readFileSync('src/pages/consultant/ConsultantPage.jsx', 'utf8');
  assert.ok(src.includes('BIK_OFFERS[key]') && src.includes('<OfferCard') && src.includes('offer={offer}'), 'consultant renders offer names from the shared catalog');
  const config = fs.readFileSync('src/config/appConfig.ts', 'utf8');
  for (const full of ['التعاقد الاستشاري التنفيذي للمشروع', 'المستشار في منصبك — تعاقد شهري', 'أسبوع استشاري مُركَّز']) {
    assert.ok(config.includes(full), `consultant page matches appConfig: ${full}`);
  }
}

// ---- Case 5: a non-Arabic sector id can never reach client text ----
{
  const src = fs.readFileSync('src/services/evidenceSwot.ts', 'utf8');
  assert.ok(src.includes('/[\\u0600-\\u06FF]/.test(rawSector)'), 'Arabic-script guard on the sector name');
  assert.ok(src.includes("'الأعمال والخدمات'"), 'fallback is the generic Arabic label');
}

// ---- Case 7: BIK_CHAT_MOCK=1 verifies the notice path with no upstream key use ----
{
  const src = fs.readFileSync('server/chatHandler.ts', 'utf8');
  assert.ok(src.includes("deps.env.BIK_CHAT_MOCK === '1'"), 'mock mode is an explicit opt-in flag');
  assert.ok(src.includes('mock: true'), 'mock replies are labelled as mock');
  // Functional: with mock mode, a personal-data message yields 200 + the notice.
  const withData = await handleChat(
    { messages: [{ role: 'user', text: 'أنا نور الاختبار، رقمي +20 100 000 0000، شركة النور تعاني تأخير تحصيل' }] },
    { env: { OPENROUTER_API_KEY: 'mock', BIK_CHAT_MOCK: '1' }, fetchImpl: fetch, ip: 'test', buckets: new Map() }
  );
  assert.equal(withData.status, 200, 'mock mode returns 200');
  assert.equal((withData.json as any).mock, true, 'mock mode is labelled in the payload');
  assert.ok(String((withData.json as any).text).includes('بيانات شخصية هنا'), 'the personal-data notice is appended in mock mode');
  // Functional: without personal data, the plain deterministic reply, no notice.
  const plain = await handleChat(
    { messages: [{ role: 'user', text: 'كيف أقرأ التقرير؟' }] },
    { env: { OPENROUTER_API_KEY: 'mock', BIK_CHAT_MOCK: '1' }, fetchImpl: fetch, ip: 'test', buckets: new Map() }
  );
  assert.equal(plain.status, 200);
  assert.ok(!String((plain.json as any).text).includes('بيانات شخصية هنا'), 'no notice without personal data');
  // Without the flag, a missing key still 503s: mock never leaks into production behaviour.
  const noMock = await handleChat(
    { messages: [{ role: 'user', text: 'مرحبا' }] },
    { env: {}, fetchImpl: fetch, ip: 'test', buckets: new Map() }
  );
  assert.equal(noMock.status, 503, 'no key and no flag still means chat_unavailable');
}

// ---- Case 8ب: confirmation requires in-view proof of the WhatsApp open ----
{
  const src = fs.readFileSync('src/pages/ReportTransfer.tsx', 'utf8');
  assert.ok(src.includes('openedInThisView'), 'an in-view proof set exists');
  assert.ok(/canConfirmSelected[\s\S]{0,400}openedInThisView\.current\.has\(selectedIndex\)/.test(src), 'confirmation is gated on the in-view proof');
  assert.ok(/دليل الفتح الحقيقي يُسجَّل هنا فقط[\s\S]{0,200}openedInThisView\.current\.add\(selectedIndex\)/.test(src), 'the proof is added only after a successful open');
  // It lives in memory only: never written to any storage.
  assert.ok(!/localStorage[^\n]*openedInThisView|sessionStorage[^\n]*openedInThisView/.test(src), 'the proof never touches storage');
}

console.log('verify_codex_round2_fixes: كل إصلاحات الجولة الثانية مثبتة ✅');
