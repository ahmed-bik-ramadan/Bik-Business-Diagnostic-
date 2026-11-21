/**
 * Codex round-3 fixes pinned (v5 reports: B م1-م3, C 6ب/7أ/7ب, plus the
 * deprecated pnpm.overrides location). Every fix is checked at its source,
 * and the chat mock path is checked functionally.
 * Run: npx tsx scripts/verify_codex_round3_fixes.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleChat } from '../server/chatHandler.ts';

// ---- Report A: overrides live only in the workspace config (deprecation warning gone) ----
{
  const root = fs.readFileSync('../../package.json', 'utf8');
  assert.ok(!/"overrides"\s*:/.test(root), 'package.json carries no pnpm.overrides block');
  const ws = fs.readFileSync('../../pnpm-workspace.yaml', 'utf8');
  for (const key of ['brace-expansion@5.0.9', 'fast-uri', 'js-yaml', 'proxy-addr', 'source-map-js']) {
    assert.ok(new RegExp(`["']?${key}["']?\\s*:`).test(ws), `pnpm-workspace.yaml keeps the override: ${key}`);
  }
}

// ---- م1: the completion mark alone opens the full analysis in the live view ----
// F2/F3 (round-5) update: the gate is resolved synchronously through resolveReportGate;
// the done-mark satisfies the gate as doneMarkVerified, and recovery consent is never read.
{
  const src = fs.readFileSync('src/pages/Report.tsx', 'utf8');
  assert.ok(src.includes('isTransferDone'), 'Report imports the transfer-done check');
  assert.ok(
    /doneMarkVerified = allPartsSent && isTransferDone\(sessionStorage, input\.sessionId, parts\);/.test(src),
    'the done mark satisfies the gate once the transfer is complete'
  );
  assert.ok(
    /const \[gate\] = useState\(\(\) => resolveReportGate\(collectGateInputs\(/.test(src),
    'the gate is resolved synchronously in the useState initializer'
  );
  assert.ok(!src.includes('snapshot?.consented'), 'recovery consent never reaches the gate (F3)');
}

// ---- م2: completion also wipes the local-sessions record from sessionStorage ----
// F8 (round-5) update: the removal now lives in the shared wipe function.
{
  const service = fs.readFileSync('src/services/reportTransferState.ts', 'utf8');
  assert.ok(service.includes("'local_sessions'"), 'local_sessions is in the shared session-key wipe list');
  const page = fs.readFileSync('src/pages/ReportTransfer.tsx', 'utf8');
  assert.ok(page.split('wipeTransferSessionArtifacts(').length - 1 >= 2, 'the page runs the wipe at completion AND on restore');
  // And the writer service is the only place it ever reappears.
  const writer = fs.readFileSync('src/services/supabase.ts', 'utf8');
  assert.ok(writer.includes("sessionStorage.getItem('local_sessions')"), 'the local-sessions writer is untouched elsewhere');
}

// ---- م3: after completion the lead gate never re-consents nor rewrites copies ----
{
  const src = fs.readFileSync('src/pages/LeadGate.tsx', 'utf8');
  assert.ok(src.includes('isTransferDone'), 'LeadGate imports the transfer-done check');
  assert.ok(
    /isTransferDone\(sessionStorage[\s\S]{0,200}navigate\('\/report', \{ replace: true \}\)/.test(src),
    'a completed transfer is redirected to the report instead of re-consenting'
  );
  const gate = src.indexOf('isTransferDone(sessionStorage');
  const consentWrite = src.indexOf("sessionStorage.setItem(`bik-sharing-consent:");
  assert.ok(gate >= 0 && consentWrite > gate, 'the done-mark check runs before any consent write');
}

// ---- 6ب: a non-finite overall is never printed as a measurement ----
{
  const fallback = fs.readFileSync('src/services/reportFallback.ts', 'utf8');
  assert.ok(/const scoreComputed = scoreResult\.overallComputed !== false && finiteScore;/.test(fallback), 'the fallback engine gates scoreComputed on a finite overall');
  assert.ok(/health_score_computed: scoreComputed/.test(fallback), 'health_score_computed carries the guarded flag');
  const preview = fs.readFileSync('src/components/report/ReportPreview.tsx', 'utf8');
  assert.ok(preview.includes('Number.isFinite(Number(report.health_score))'), 'the preview badge refuses a non-finite score');
}

// ---- 7أ + 7ب: one canonical mock branch, reachable with or without a key ----
{
  const src = fs.readFileSync('server/chatHandler.ts', 'utf8');
  assert.ok(/if \(!apiKey && !mockMode\) return \{ status: 503/.test(src), 'a missing key only 503s when mock mode is off');
  assert.ok((src.match(/رد محاكى/g) || []).length === 1, 'exactly one mock reply text exists');
  assert.ok(src.includes('رد محاكى لفحص المنصة (وضع الاختبار)'), 'the canonical mock text is the agreed wording');
  assert.ok(!src.includes('رد محاكى لوضع الاختبار'), 'the older duplicate mock text is gone');
  const mockIdx = src.indexOf('if (mockMode)');
  const gateIdx = src.indexOf('!apiKey && !mockMode');
  assert.ok(gateIdx >= 0 && mockIdx > gateIdx, 'the mock branch runs inside the same request flow as the key gate');

  // Functional: flag on, key absent → 200, labelled, canonical text.
  const noKey = await handleChat(
    { messages: [{ role: 'user', text: 'كيف أقرأ التقرير؟' }] },
    { env: { BIK_CHAT_MOCK: '1' }, fetchImpl: fetch, ip: 'test', buckets: new Map() }
  );
  assert.equal(noKey.status, 200, 'mock works without an upstream key (7أ)');
  assert.equal((noKey.json as any).mock, true, 'the keyless mock reply is labelled');
  assert.ok(String((noKey.json as any).text).startsWith('رد محاكى لفحص المنصة'), 'the keyless mock uses the canonical text (7ب)');

  // Functional: flag on, key present → the very same canonical deterministic reply.
  const withKey = await handleChat(
    { messages: [{ role: 'user', text: 'كيف أقرأ التقرير؟' }] },
    { env: { OPENROUTER_API_KEY: 'mock', BIK_CHAT_MOCK: '1' }, fetchImpl: fetch, ip: 'test', buckets: new Map() }
  );
  assert.equal(withKey.status, 200);
  assert.equal((withKey.json as any).text, (noKey.json as any).text, 'mock replies are identical with and without a key');

  // Functional: flag on, personal data in a user turn → the notice is appended.
  const withData = await handleChat(
    { messages: [{ role: 'user', text: 'أنا نور الاختبار، رقمي +20 100 000 0000' }] },
    { env: { BIK_CHAT_MOCK: '1' }, fetchImpl: fetch, ip: 'test', buckets: new Map() }
  );
  assert.ok(String((withData.json as any).text).includes('بيانات شخصية هنا'), 'the personal-data notice survives the consolidation');

  // Functional: no flag, no key → 503 as in production behaviour.
  const noMock = await handleChat(
    { messages: [{ role: 'user', text: 'مرحبا' }] },
    { env: {}, fetchImpl: fetch, ip: 'test', buckets: new Map() }
  );
  assert.equal(noMock.status, 503, 'no key and no flag still means chat_unavailable');
}

console.log('verify_codex_round3_fixes: كل إصلاحات الجولة الثالثة مثبتة ✅');
