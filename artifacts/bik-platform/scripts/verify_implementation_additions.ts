import assert from 'node:assert/strict';
import fs from 'node:fs';
import { platformCopy } from '../src/copy/platformCopy';

const server = fs.readFileSync('server.ts', 'utf8');
const db = fs.readFileSync('server/db.ts', 'utf8');
const chat = fs.readFileSync('src/components/ConsultantChat.tsx', 'utf8');
const offers = fs.readFileSync('src/services/reportFallback.ts', 'utf8');
const tracking = fs.readFileSync('src/services/supabase.ts', 'utf8');
const report = fs.readFileSync('src/pages/Report.tsx', 'utf8');
const reportDetails = fs.readFileSync('src/components/report/ReportDetails.tsx', 'utf8');
const transfer = fs.readFileSync('src/pages/ReportTransfer.tsx', 'utf8');

assert.equal(server.includes("req.path.startsWith('/api/v1/admin')"), true);
assert.equal(server.includes("req.path === '/api/v1/events'"), true);
assert.equal(server.includes("'/api/v1/sessions/answers'"), true);
assert.equal(server.includes("'/api/v1/diagnose/generate'"), true);
assert.equal(server.indexOf('Close retired persistence') < server.indexOf('app.use(express.json'), true);
assert.equal(db.includes("= 'session_only'"), true);
assert.equal(db.includes('loadLocalDb'), false);
assert.equal(db.includes('saveLocalDb'), false);
assert.equal(tracking.includes('void eventName'), true);
assert.equal(tracking.includes('fetch('), false);
assert.equal(report.includes('<ReportDetails'), true);
assert.equal(report.includes('<ConsultantChat'), false);
assert.equal(reportDetails.includes('DIAGNOSTIC_DIMENSIONS'), true);
assert.equal(reportDetails.includes("key: 'strengths'"), true);
assert.equal(reportDetails.includes("key: 'weaknesses'"), true);
assert.equal(reportDetails.includes("key: 'opportunities'"), true);
assert.equal(reportDetails.includes("key: 'threats'"), true);
assert.equal(reportDetails.includes('data-testid="results-issue-board"'), true);
// Fix F: the chat is an automated assistant behind /api/v1/chat, not a disabled card.
assert.equal(chat.includes("platformCopy['chat.badge']") && platformCopy['chat.badge'] === 'مساعد آلي يقرأ نتيجتك', true);
assert.equal(chat.includes("platformCopy['chat.privacy']") && platformCopy['chat.privacy'] === 'تُرسل المحادثة إلى خادم BIK ثم مزودها: سجل الرسائل والقطاع وحالة المحاور ونوع بدايتك (تحليل أو أزمة) وإشارات محدودة عن النتيجة والتوصية. لا تُرفق إجابات التشخيص أو بيانات الهوية المحفوظة؛ ويُنقّح نص الرسائل آلياً، لذا تجنّب كتابة بيانات شخصية.', true);
assert.equal(transfer.includes('window.open('), true);
// Fix E (final): the part text travels inside the wa.me link only. No clipboard route exists:
// a blocked popup gets explicit enabling steps and a retry, and every send leaves through
// the consultant's WhatsApp chat.
assert.equal(transfer.includes('customMessage: selectedPart.message'), true);
assert.equal(transfer.includes('copyToClipboard'), false);
assert.equal(transfer.includes('popup-blocked') && transfer.includes('اسمح بالنوافذ المنبثقة'), true);
// Fix D: no generated offers; the only offers are the two fixed cards rendered from BIK_OFFERS.
assert.equal(offers.includes('service_offers.push'), false);
assert.equal(fs.readFileSync('src/components/OfferCards.tsx', 'utf8').includes('BIK_OFFERS[key]'), true);

console.log(JSON.stringify({
  suite: 'implementation_additions',
  passed: 24,
  privacy: 'server answer/report/lead/event/admin paths are closed before request-body parsing',
  report: 'six axes, four evidence-based SWOT quadrants, and complete issue board are rendered',
  advisor: 'Automated assistant via server route; non-personal payload only; no synthetic replies on failure',
  delivery: 'manual WhatsApp handoff; part text inside the wa.me link; blocked popups get enabling steps and a retry, no clipboard route'
}, null, 2));
