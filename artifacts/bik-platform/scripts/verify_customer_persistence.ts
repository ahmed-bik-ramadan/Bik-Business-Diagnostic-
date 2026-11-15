import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildWhatsAppReportParts, WHATSAPP_MESSAGE_LIMIT } from '../src/services/reportTextDelivery';
import { submitLeadApi } from '../src/services/api';

const syntheticId = 'synthetic-session-for-local-test';
const reportText = Array.from({ length: 12500 }, (_, index) =>
  `سطر ${index + 1}: إجابة افتراضية؛ تحقق من الفرضية قبل اعتماد القرار.`
).join('\n');
const parts = buildWhatsAppReportParts(reportText, syntheticId);

assert.ok(parts.length >= 5, 'the complete dossier is not capped at two parts');
assert.equal(parts.map(part => part.body).join(''), reportText, 'the parts reassemble the exact report without loss');
assert.equal(parts.every(part => Array.from(part.message).length <= WHATSAPP_MESSAGE_LIMIT), true, 'each numbered message stays within its limit');
assert.equal(parts.every(part => !part.message.includes(syntheticId)), true, 'no session identifier is sent in a report part');
assert.equal(parts.every((part, index) => part.message.startsWith(`الجزء ${index + 1} من ${parts.length}\n\n`)), true);

const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = (async () => {
  networkCalls += 1;
  throw new Error('Unexpected network request in local privacy test');
}) as typeof fetch;
const leadResult = await submitLeadApi({
  sessionId: syntheticId,
  name: 'اسم اصطناعي',
  companyName: 'نشاط افتراضي للاختبار',
  whatsapp: '+201000000000',
  privacyConsent: true
});
globalThis.fetch = originalFetch;

assert.equal(networkCalls, 0, 'client contact data must not be sent to the application server');
assert.equal(leadResult.success, false, 'lead ingestion must fail closed');
assert.equal(leadResult.persisted, false);
assert.equal(leadResult.storageMode, 'session_only');

const serverSource = fs.readFileSync('server.ts', 'utf8');
const legacyStorage = fs.readFileSync('server/platform-db.ts', 'utf8');
const reportSource = fs.readFileSync('src/pages/ReportTransfer.tsx', 'utf8');
assert.match(serverSource, /app\.post\(["']\/api\/v1\/leads\/submit["'],\s*\(_req,\s*res\)\s*=>\s*\{\s*return res\.status\(410\)/u);
assert.match(legacyStorage, /Legacy file-backed storage is disabled/u);
assert.ok(serverSource.includes("'/api/v1/diagnose/generate'"), 'server-side report generation is closed');
assert.ok(serverSource.includes("'/api/v1/sessions/answers'"), 'server-side answer writes are closed');
assert.ok(serverSource.includes('req.url = `/api${req.url.slice("/_bik-api".length)}`'), 'the browser API prefix reaches the stateless server routes');
assert.equal(reportSource.includes('navigator.clipboard'), false);
assert.equal(reportSource.includes('نسخ الرسالة'), false);

console.log(JSON.stringify({
  suite: 'session-only privacy and lossless report transfer',
  passed: 13,
  networkRequests: networkCalls,
  parts: parts.length,
  reportCharacters: Array.from(reportText).length,
  maxMessageCharacters: Math.max(...parts.map(part => Array.from(part.message).length)),
  reassemblesExactly: true,
  leadSubmission: 'blocked',
  verificationData: 'synthetic only'
}, null, 2));
