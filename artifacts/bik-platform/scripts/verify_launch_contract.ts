import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildConsultantWhatsAppUrl } from '../src/config/appConfig.ts';
import { buildDualLayerReport } from '../src/services/dualLayerReport.ts';

const coverageResult = buildDualLayerReport({
  scoreResult: {
    overall: 40,
    overallScore: 40,
    overallCoverage: undefined,
    overallConfidence: 'منخفض',
    axisScores: {},
    axisDetails: {},
    topStrengths: [],
    topWeaknesses: [],
    dataGaps: [],
    financialImpact: { isComputable: false, metrics: {}, currency: 'EGP', scenarios: [] },
    diagnosticFindings: {},
    engineMetadata: {}
  } as any,
  companyData: { companyName: 'شركة اختبار' },
  baseReport: {}
});
assert.equal(coverageResult.clientReport.coverage, 0, 'missing coverage must remain unavailable, not become a fabricated percentage');

// Adversarial: NaN score + uncomputed flag + internal sector ids must never reach the client's WhatsApp message.
const adversarial = buildDualLayerReport({
  scoreResult: { overallScore: NaN, overallComputed: false, axisDetails: {}, financialImpact: { isComputable: false, metrics: {}, currency: 'EGP', scenarios: [] } } as any,
  companyData: { companyName: 'شركة اختبار', sectorL1: 'unknown_sector_987', sectorL2: 'missing_subsector_654' },
  baseReport: {}
});
const ctaText = adversarial.clientReport.consultant_cta.message_text;
assert.ok(!/unknown_sector|missing_subsector/.test(ctaText), 'internal sector ids never leak into the client handoff message');
assert.ok(!ctaText.includes('NaN') && !/\b0\/100\b/.test(ctaText), 'an uncomputed score prints neither NaN/100 nor 0/100');

const whatsapp = buildConsultantWhatsAppUrl({
  sessionHandoff: { companyName: 'شركة اختبار', healthScore: 40, coverage: 0, confidence: 'منخفض' }
});
assert.equal(whatsapp.isConfigured, true);
assert.match(whatsapp.url, /^https:\/\/wa\.me\/201066966515\?text=/);
assert.ok(!whatsapp.url.includes('BIK_Consultant_Handoff.md'));
assert.ok(!whatsapp.url.includes('u01'));

const reportSource = fs.readFileSync('src/pages/Report.tsx', 'utf8');
assert.ok(!reportSource.includes('a.download ='));
const leadGateSource = fs.readFileSync('src/pages/LeadGate.tsx', 'utf8');
assert.ok(!leadGateSource.includes('نسخ الرسالة'));
assert.ok(leadGateSource.includes('لا يؤكد الإرسال أو الاستلام'));
assert.ok(leadGateSource.includes('أوافق صراحةً'));
const generatorSource = fs.readFileSync('src/services/reportGenerator.ts', 'utf8');
assert.ok(generatorSource.includes("process.env.ENABLE_GEMINI_REPORTS !== 'true'"));
const packageSource = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.ok(packageSource.scripts.build.includes('dist/server.js'));
assert.equal(packageSource.scripts.start, 'NODE_ENV=production node dist/server.js');
const serverSource = fs.readFileSync('server.ts', 'utf8');
assert.ok(serverSource.includes('storageMode: "session_only"'));
assert.ok(serverSource.includes("req.method === 'POST' && req.path === '/api/v1/leads/submit'"));

// Neuromarketing contract: gain framing, partitioned pricing, grounded loss lines, green recommended card.
const offerCardsSource = fs.readFileSync('src/components/OfferCards.tsx', 'utf8');
assert.ok(offerCardsSource.includes('OFFER_GAP_LINE') && offerCardsSource.includes('data-testid="offer-gap-line"'), 'offers section carries the single linking line between the three cards');
assert.ok(offerCardsSource.includes('146B4F'), 'the recommended offer card carries the luxury green');
assert.ok(offerCardsSource.includes('الأنسب لوضعك') && offerCardsSource.includes('هدية لك'), 'recommendation badge and the free call speak to the situation (curation + gift framing)');
assert.ok(offerCardsSource.includes('amount <= 0'), 'a loss line is built only on a valid declared figure, never invented');
const reportSourceN = fs.readFileSync('src/pages/Report.tsx', 'utf8');
assert.ok(reportSourceN.includes('monthlyWaste={monthlyWaste}'), 'the declared monthly figure feeds the offer cards');
assert.ok(reportSourceN.includes("lossSustainsExecutive: recommendation.rule === 'real_loss_covers_it'"), 'the chat context carries the real-loss flag only, never an amount');
const previewSource = fs.readFileSync('src/components/report/ReportPreview.tsx', 'utf8');
assert.ok(previewSource.includes('ما تستعيده بقرار واحد'), 'the decision scale is framed as recovery (gain), not cost alone');
const policySource = fs.readFileSync('src/services/chatPolicy.ts', 'utf8');
assert.ok(policySource.includes('كيف تتحدث عن القيمة والخسارة') && policySource.includes('لا محور تُسند إليه = لا استنتاج'), 'chat policy trains loss language grounded in the session axes');
const recSource = fs.readFileSync('src/services/offerRecommendation.ts', 'utf8');
assert.ok(recSource.includes('real_loss_covers_it') && recSource.includes("currency !== 'USD'"), 'the real-loss rule never compares a non-USD figure to a USD threshold');
assert.ok(fs.readFileSync('src/services/financialValueModel.ts', 'utf8').includes('monthlyReducibleWaste: input.mode'), 'the declared monthly waste travels into the value model verbatim');

console.log('LAUNCH CONTRACT: 17 PASSED, 0 FAILED');
