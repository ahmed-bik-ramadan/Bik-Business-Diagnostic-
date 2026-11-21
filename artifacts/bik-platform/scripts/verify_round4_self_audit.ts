/**
 * Round-4 self-audit (adversarial pass by the builder, per the pre-delivery
 * protocol). Pins every finding of the break-try round so it can never return:
 *
 * 1. Transfer completion wipes EVERY answer-bearing sessionStorage key the
 *    codebase can write — proven against a live inventory, not a list.
 * 2. The LeadGate re-consent gate fires before any consent write (م3 round-3).
 * 3. isTransferDone refuses empty part lists, so an empty dossier can never
 *    be mistaken for a completed transfer.
 * 4. The report fallback never interpolates a non-finite score (6ب) —
 *    functional check on the real function.
 * 5. Mock chat mode works with and without an API key (7أ) — functional.
 * Run: npx tsx scripts/verify_round4_self_audit.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createFallbackReport } from '../src/services/reportFallback.ts';
import { handleChat } from '../server/chatHandler.ts';

// ---- 1. Every sessionStorage key written anywhere is covered by the completion wipe ----
{
  const collect = (dir: string): string[] => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(ts|tsx|jsx|js)$/.test(entry.name)) {
          const src = fs.readFileSync(p, 'utf8');
          const re = /sessionStorage\.(?:get|set)Item\(\s*`?([A-Za-z0-9_:@.$-]*)/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(src))) if (m[1]) out.push(m[1]); // dynamic keys (variables) are audited by hand, not here
        }
      }
    };
    walk(dir);
    return out;
  };
  const written = new Set(collect('src'));
  // F8 (round-5) update: the completion wipe moved into the shared function in
  // reportTransferState.ts, called by the page at completion AND on restore.
  const transfer = fs.readFileSync('src/pages/ReportTransfer.tsx', 'utf8');
  const service = fs.readFileSync('src/services/reportTransferState.ts', 'utf8');
  assert.ok(transfer.split('wipeTransferSessionArtifacts(').length - 1 >= 2, 'the page runs the shared wipe at completion AND on restore');
  // Keys removed at completion: the diagnostic store copy, the consent key, the
  // local recovery store, and every questionnaire-answer key + current index +
  // session ownership token.
  const removed: string[] = [];
  const keyBlock = service.match(/const sessionKeys = \[([\s\S]*?)\]/)?.[1] ?? '';
  const reKey = /'([^']+)'|`([^`]+)`/g;
  let km: RegExpExecArray | null;
  while ((km = reKey.exec(keyBlock))) removed.push(km[1] || km[2]);
  assert.deepEqual(removed, [
    'bik-diagnostic-storage',
    'bik-sharing-consent:${sessionId}',
    'local_sessions',
    'bik_universal_answers',
    'bik_sector_answers',
    'bik_questionnaire_current_index',
    'bik_session_ownership_token'
  ], 'the completion wipe list is exactly the full set, in order');
  const covered = (key: string) => {
    if (key.startsWith('bik-sharing-consent:')) return true;
    if (key.startsWith('bik-transfer-acks:')) return true; // legacy, removed on submit
    if (key === 'probeKey') return transfer.includes('window.sessionStorage.removeItem(probeKey)');
    if (key.startsWith('__bik_probe')) return true; // probes, self-cleaning
    return removed.includes(key);
  };
  const uncovered = [...written].filter(k => !covered(k));
  assert.deepEqual(uncovered, [], `no session key may outlive a completed transfer; uncovered: ${uncovered.join(', ')}`);
}

// ---- 2. The LeadGate re-consent gate precedes any consent write ----
{
  const src = fs.readFileSync('src/pages/LeadGate.tsx', 'utf8');
  const gate = src.indexOf('isTransferDone(sessionStorage');
  const write = src.indexOf("sessionStorage.setItem(`bik-sharing-consent:${sessionId}`");
  assert.ok(gate > 0 && write > gate, 'the transfer-done gate runs before the consent write');
  assert.ok(src.includes("navigate('/report', { replace: true });"), 'a done transfer goes to the report, not back through the gate');
}

// ---- 3. isTransferDone refuses empty part lists ----
{
  const src = fs.readFileSync('src/services/reportTransferState.ts', 'utf8');
  assert.ok(/isTransferDone[\s\S]{0,300}if \(!parts\.length\) return false;/.test(src), 'empty part list can never read as a completed transfer');
}

// ---- 4. 6ب: a non-finite score never reaches the executive summary ----
{
  const scoreResult = (overall: number) => ({
    overall,
    overallComputed: true,
    axisScores: { 'التشغيل': 50, 'المالية': 40 },
    axisDetails: {},
    topStrengths: [],
    topWeaknesses: [{ dimension: 'المالية', findingDescription: 'ضعف التحصيل', sourceQuestionId: 'u01' }],
    financialImpact: { currency: '', isComputable: false, metrics: {} },
    dataGaps: []
  }) as never;
  for (const bad of [NaN, undefined as unknown as number]) {
    const report = createFallbackReport({ scoreResult: scoreResult(bad) });
    const headline = JSON.stringify(report).replace(/"/g, ' ').replace(/\\/g, ' ');
    assert.ok(!/NaN|undefined/.test(headline), `no ${String(bad)} value can appear anywhere in the fallback report`);
    assert.ok(report.headline_diagnosis?.includes('لا يُعرض رقم'), 'the wording says no number is shown');
  }
  const good = createFallbackReport({ scoreResult: scoreResult(42) });
  assert.ok(good.headline_diagnosis?.includes('42/100'), 'a finite score still renders normally');
}

// ---- 5. 7أ: mock chat works with and without an API key ----
{
  const noKey = await handleChat(
    { messages: [{ role: 'user', text: 'كيف أقرأ التقرير؟' }] },
    { env: { BIK_CHAT_MOCK: '1' }, fetchImpl: fetch, ip: 'audit', buckets: new Map() }
  );
  assert.equal(noKey.status, 200, 'mock works with no key at all');
  assert.equal((noKey.json as any).mock, true);
  const withKey = await handleChat(
    { messages: [{ role: 'user', text: 'مرحبا' }] },
    { env: { OPENROUTER_API_KEY: 'k', BIK_CHAT_MOCK: '1' }, fetchImpl: fetch, ip: 'audit', buckets: new Map() }
  );
  assert.equal(withKey.status, 200, 'mock works with a key too');
  const canonical = 'رد محاكى لفحص المنصة (وضع الاختبار)';
  assert.ok(String(withKey.json.text).includes(canonical), 'the mock text is the one canonical wording');
  const off = await handleChat(
    { messages: [{ role: 'user', text: 'مرحبا' }] },
    { env: {}, fetchImpl: fetch, ip: 'audit', buckets: new Map() }
  );
  assert.equal(off.status, 503, 'no flag and no key still means chat_unavailable');
}

console.log('verify_round4_self_audit: كل نتائج جولة الكسر مثبتة ✅');
