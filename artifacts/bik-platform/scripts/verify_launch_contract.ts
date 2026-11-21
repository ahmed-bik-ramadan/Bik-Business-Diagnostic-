import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildConsultantWhatsAppUrl, OFFER_GAP_LINE, BIK_OFFERS } from '../src/config/appConfig.ts';
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
assert.ok(reportSource.includes("'تشخيص شركتك'}: أين تختنق أرباحك، ولماذا، وماذا يكلّفك تجاهل ذلك"));
const leadGateSource = fs.readFileSync('src/pages/LeadGate.tsx', 'utf8');
assert.ok(!leadGateSource.includes('نسخ الرسالة'));
assert.ok(leadGateSource.includes('لا يؤكد الإرسال أو الاستلام'));
assert.ok(leadGateSource.includes('أوافق صراحةً'));
assert.ok(leadGateSource.includes('ما رأيته حتى الآن هو غرفة الانتظار، والتقرير الكامل ينتظر خلف الباب: الأصل الجذري للمشكلة، وكلفة الوضع الحالي بحسب أرقامك، وأول خطوة تستحق أن تُدار. وهو تقرير لا يُستعار: يبقى لديك في محادثة واتساب، ترجع إليه كلما تحركت شركتك. وفي مكالمتكما، يقرأه أ/ أحمد قبل المكالمة، فيمضي وقتك كله في شركتك لا في التعارف.'));
assert.ok(leadGateSource.includes('تبقى إجاباتك في متصفحك أثناء الجلسة وتُمحى بإغلاق الصفحة، وما تُرسله يبقى في محادثة واتساب بينك وبين أحمد. لا تُرسل أرقام حسابات بنكية أو بيانات بطاقات.'));
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
assert.equal(OFFER_GAP_LINE, 'الفارق بين هذه البطاقات ليس فرق سعر فقط: إنه حجم القرار الذي تريد أن يقود عنك. المشكلة تستمر بكلفتها الشهرية حتى تُعالج.');
assert.equal(BIK_OFFERS.focusedWeek.scope, 'أسبوع واحد يُحسم فيه قرار واحد كنت تؤجله: نتحقق من الأدلة معاً، ثم ننتهي بقرار محسوم لا بملاحظات معلقة.');
assert.ok(offerCardsSource.includes('المشكلة تستمر بكلفتها الشهرية حتى تُعالج: قرابة ${amount} ${monthlyWaste.currency} على أرقامك المصرّح بها، تقدير استرشادي.'));
assert.ok(offerCardsSource.includes('OFFER_GAP_LINE') && offerCardsSource.includes('data-testid="offer-gap-line"'), 'offers section carries the single linking line between the three cards');
assert.ok(offerCardsSource.includes('146B4F'), 'the recommended offer card carries the luxury green');
assert.ok(offerCardsSource.includes('الأنسب لوضعك') && offerCardsSource.includes('هدية لك'), 'recommendation badge and the free call speak to the situation (curation + gift framing)');
assert.ok(offerCardsSource.includes('amount <= 0'), 'a loss line is built only on a valid declared figure, never invented');
const reportSourceN = fs.readFileSync('src/pages/Report.tsx', 'utf8');
assert.ok(reportSourceN.includes('monthlyWaste={monthlyWaste}'), 'the declared monthly figure feeds the offer cards');
assert.ok(!reportSourceN.includes('buildChatContext'), 'the report sends no data to chat');
const previewSource = fs.readFileSync('src/components/report/ReportPreview.tsx', 'utf8');
assert.ok(previewSource.includes('ما تستعيده بقرار واحد'), 'the decision scale is framed as recovery (gain), not cost alone');
const policySource = fs.readFileSync('src/services/chatPolicy.ts', 'utf8');
assert.ok(policySource.includes('كيف تتحدث عن القيمة والخسارة') && policySource.includes('لا محور تُسند إليه = لا استنتاج'), 'chat policy trains loss language grounded in the session axes');
const recSource = fs.readFileSync('src/services/offerRecommendation.ts', 'utf8');
assert.ok(recSource.includes('real_loss_covers_it') && recSource.includes("currency !== 'USD'"), 'the real-loss rule never compares a non-USD figure to a USD threshold');
assert.ok(fs.readFileSync('src/services/financialValueModel.ts', 'utf8').includes('monthlyReducibleWaste: input.mode'), 'the declared monthly waste travels into the value model verbatim');

console.log('LAUNCH CONTRACT: PASS');
