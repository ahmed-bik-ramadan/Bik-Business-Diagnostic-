/**
 * Fix D — only the two approved offers, one recommended by a coded rule.
 * Run: tsx scripts/verify_offers.ts
 */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OfferCards from '../src/components/OfferCards';
import { BIK_OFFERS } from '../src/config/appConfig';
import { recommendOffer, CRISIS_CRITICAL_AXES_FOR_RETAINER } from '../src/services/offerRecommendation';
import { formatPlatformCopy } from '../src/copy/platformCopy';
import { reviewSessions } from './fixtures/reviewSessions';
import { computeDeterministicScore } from '../src/services/deterministicScoring';
import { createFallbackReport } from '../src/services/reportFallback';

let pass = 0;
let fail = 0;
function check(ok: boolean, msg: string) {
  if (ok) { pass++; console.log(`  PASS: ${msg}`); } else { fail++; console.error(`  FAIL: ${msg}`); }
}

const ax = (...statuses: string[]) => Object.fromEntries(statuses.map((status, i) => [`a${i}`, { status }]));
const OK = 'مستقر', IMP = 'يحتاج تحسين', CRIT = 'نقطة حرجة', GAP = 'بيانات غير كافية';

// 1. The three approved offers and their prices.
check(Object.keys(BIK_OFFERS).sort().join() === 'executiveProject,focusedWeek,monthlyRetainer', 'exactly three offers are configured');
check(BIK_OFFERS.focusedWeek.name === 'أسبوع استشاري مُركَّز' && BIK_OFFERS.focusedWeek.price === '$272', 'focused week: name and 272 USD');
check(BIK_OFFERS.monthlyRetainer.name === 'المستشار في منصبك — تعاقد شهري' && BIK_OFFERS.monthlyRetainer.price === '$499', 'monthly retainer: name and 499 USD/month');
check(BIK_OFFERS.executiveProject.name === 'التعاقد الاستشاري التنفيذي للمشروع' && BIK_OFFERS.executiveProject.price === '$5000', 'executive project: name and 5000 USD/month');

// 2. Recommendation rule.
check(recommendOffer({ axisDetails: null }).rule === 'insufficient_data', 'no axis data -> insufficient_data, focused week');
check(recommendOffer({ axisDetails: null }).key === 'focusedWeek', 'no axis data -> focusedWeek');
check(recommendOffer({ overallComputed: false, axisDetails: ax(CRIT, CRIT, CRIT, CRIT, CRIT, CRIT) }).key === 'focusedWeek', 'overall not computed overrides everything -> focusedWeek');
check(recommendOffer({ overallComputed: true, axisDetails: ax(CRIT, IMP, GAP, GAP, GAP, GAP) }).rule === 'insufficient_data', 'only 2 scored axes -> insufficient_data');
const four = recommendOffer({ overallComputed: true, axisDetails: ax(CRIT, IMP, IMP, CRIT, OK, OK) });
check(four.key === 'monthlyRetainer' && four.rule === 'many_fronts' && four.axesNeedingWork === 4 && four.scoredAxes === 6, '4 of 6 axes need work -> monthly retainer');
check(/\d+ من \d+/.test(four.reason) && !/\d+\s*%/.test(four.reason), 'reason states counts, no percentage');
const three = recommendOffer({ overallComputed: true, axisDetails: ax(CRIT, IMP, IMP, OK, OK, OK) });
check(three.key === 'focusedWeek' && three.rule === 'specific_issue', '3 of 6 (not more than half) -> focused week');
check(recommendOffer({ overallComputed: true, axisDetails: ax(OK, OK, OK, OK, OK, OK) }).key === 'focusedWeek', 'all stable -> focused week');
// Every scored axis needs work -> the crisis-scale executive project, whatever the count of scored axes.
const crisis = recommendOffer({ overallComputed: true, axisDetails: ax(CRIT, CRIT, CRIT, CRIT, CRIT, CRIT) });
check(crisis.key === 'executiveProject' && crisis.rule === 'crisis_scale' && crisis.axesNeedingWork === 6, 'all six axes need work -> executive project');
const gapsIgnored = recommendOffer({ overallComputed: true, axisDetails: ax(IMP, IMP, CRIT, GAP, GAP, GAP) });
check(gapsIgnored.key === 'executiveProject' && gapsIgnored.rule === 'crisis_scale' && gapsIgnored.scoredAxes === 3 && gapsIgnored.axesNeedingWork === 3, 'axes without data are excluded from the count (3 of 3 scored need work)');

// 3. Real score result drives the rule deterministically.
const FULL = { u01:'always',u02:'week',u03:'no',u04:'expected',u05:'same',u06:'5_10',u08:'no',u09:'45',u10:'40_60',u11:'yes_clear',u12:'week',u13:'recent_known',u15:'week',u16:'no',u17:'gt40',u18:'most',u19:'lt10',u20:'big_yes',u22:'no',u23:'raise_value',u24:'strong',u25:'no_goal',u26:'none',u27:'gt10',u28:'yes' };
const score = computeDeterministicScore(FULL);
const rec1 = recommendOffer({ overallComputed: score.overallComputed, axisDetails: score.axisDetails });
const rec2 = recommendOffer({ overallComputed: score.overallComputed, axisDetails: score.axisDetails });
check(JSON.stringify(rec1) === JSON.stringify(rec2), 'same input gives same recommendation');
console.log(`  realistic session -> ${rec1.key} (${rec1.axesNeedingWork}/${rec1.scoredAxes})`);
const sparse = computeDeterministicScore({ u01: 'always' });
check(recommendOffer({ overallComputed: sparse.overallComputed, axisDetails: sparse.axisDetails }).rule === 'insufficient_data', 'sparse real session -> insufficient_data');

// 4. No invented offers anywhere in generated data or source.
const FORBIDDEN = ['مختبر إنقاذ الربحية', 'نظام التشغيل الذي لا يتوقف', 'جلسة فك الاختناق', 'هندسة العرض والرسالة البيعية'];
const report: any = createFallbackReport({ scoreResult: score, companyData: { companyName: 'ش', sectorL1: 'services', sectorL2: 'consulting', diagnosticDepth: 'quick' }, answers: FULL });
check(report.service_offers === undefined && report.dual_layer?.clientReport?.service_offers === undefined, 'fallback report carries no service_offers');
const reportJson = JSON.stringify(report);
check(FORBIDDEN.every(f => !reportJson.includes(f)), 'no invented offer names in the generated report');
check(!(report.dual_layer?.consultantDossier?.full_dossier_text || '').match(/272|499/), 'WhatsApp dossier contains no offer prices');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(ts|tsx|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const src = walk(path.join(HERE, '..', 'src')).filter(f => !f.endsWith('knowledgeLayer.generated.ts'));
const hits = src.filter(f => FORBIDDEN.some(x => fs.readFileSync(f, 'utf8').includes(x)));
check(hits.length === 0, `forbidden offer names absent from src (${hits.join(', ') || 'none'})`);

// 5. UI wiring: one card pair per page, prices only from config.
const read = (rel: string) => fs.readFileSync(path.join(HERE, '..', rel), 'utf8');
const count = (s: string, needle: string) => s.split(needle).length - 1;
check(count(read('src/pages/Report.tsx'), '<OfferCards') === 1, 'Report page renders the offer cards exactly once');
check(!read('src/pages/Consultant.tsx').includes('BIK_OFFERS') && !read('src/pages/Consultant.tsx').includes('<OfferCards'), 'Consultant route delegates to the standalone page');
const consultant = read('src/pages/consultant/ConsultantPage.jsx');
check(consultant.includes('<OfferCard ') && consultant.includes('BIK_OFFERS[key]') && !consultant.includes('bkc-offer-body'), 'consultant page renders its data with the shared card');
const cardSources = src.filter(file => /function OfferCard\s*\(/u.test(fs.readFileSync(file, 'utf8')));
check(cardSources.length === 1 && cardSources[0].endsWith('/components/OfferCards.tsx'), 'only one shared offer-card component file exists');
const reason = 'سبب الاختبار';
const highlighted = renderToStaticMarkup(createElement(OfferCards, { recommended: { key: 'focusedWeek', reason } }));
check(count(highlighted, 'الأنسب لوضعك') === 1 && highlighted.includes(reason), 'a recommended offer shows its badge with the visible reason');
for (const missing of [undefined, '', '   ']) {
  const neutral = renderToStaticMarkup(createElement(OfferCards, { recommended: { key: 'focusedWeek', reason: missing } }));
  check(!neutral.includes('الأنسب لوضعك'), 'an empty reason suppresses the badge');
}
const priceLiterals = src.filter(f => /272|499/.test(fs.readFileSync(f, 'utf8')) && !/config\/(?:appConfig|paymentConfig)\.ts$|deterministicScoring\.ts$|consultant\/ConsultantPage\.jsx$/.test(f));
check(priceLiterals.length === 0, `no hard-coded 272/499 outside config and the financial model (${priceLiterals.join(', ') || 'none'})`);

// Mission 6-B: executive rules precede the crisis-start monthly rule; data sufficiency stays first.
check(CRISIS_CRITICAL_AXES_FOR_RETAINER === 2, 'crisis retainer threshold is exactly two critical axes');
const twoCritical = { overallComputed: true, axisDetails: ax(CRIT, CRIT, OK, OK, OK, OK) };
const crisisTwo = recommendOffer({ ...twoCritical, startMode: 'crisis' });
check(crisisTwo.key === 'monthlyRetainer' && crisisTwo.rule === 'crisis_critical' && crisisTwo.scoredAxes === 6 && crisisTwo.axesNeedingWork === 2, 'crisis start with two critical axes -> monthly retainer via crisis_critical');
check(crisisTwo.reason === formatPlatformCopy('offer.reason.crisisCritical', { n: 2 }), 'new reason uses the approved copy and actual count of critical axes');
const crisisThree = recommendOffer({ overallComputed: true, axisDetails: ax(CRIT, CRIT, CRIT, IMP, OK, OK), startMode: 'crisis' });
check(crisisThree.reason === formatPlatformCopy('offer.reason.crisisCritical', { n: 3 }) && crisisThree.axesNeedingWork === 4, 'reason counts critical axes separately from all axes needing work');
for (const [name, input] of [
  ['one critical axis', { overallComputed: true, axisDetails: ax(CRIT, IMP, IMP, OK, OK, OK) }],
  ['no critical axes', { overallComputed: true, axisDetails: ax(IMP, IMP, IMP, IMP, IMP, IMP) }],
  ['one critical axis with declared real loss', { overallComputed: true, axisDetails: ax(CRIT, OK, OK, OK, OK, OK), lossSustainsExecutive: true }],
] as const) {
  check(JSON.stringify(recommendOffer({ ...input, startMode: 'crisis' })) === JSON.stringify(recommendOffer(input)), `crisis start with ${name} retains the previous rule and full result`);
}
const analysisTwo = recommendOffer({ ...twoCritical, startMode: 'analysis' });
check(analysisTwo.key === 'focusedWeek' && analysisTwo.rule === 'specific_issue' && JSON.stringify(analysisTwo) === JSON.stringify(recommendOffer(twoCritical)), 'analysis start with two critical axes retains the old specific-issue rule');
const crisisBeforeLoss = recommendOffer({ overallComputed: true, axisDetails: ax(CRIT, CRIT, OK, OK, OK, OK), lossSustainsExecutive: true, startMode: 'crisis' });
// 6-B intentionally restores declared-loss and whole-company executive priority.
check(crisisBeforeLoss.key === 'executiveProject' && crisisBeforeLoss.rule === 'real_loss_covers_it', 'declared real loss precedes the crisis-critical monthly rule');
const crisisAllNeedsWork = recommendOffer({ overallComputed: true, axisDetails: ax(CRIT, CRIT, IMP, IMP, IMP, IMP), startMode: 'crisis' });
check(crisisAllNeedsWork.key === 'executiveProject' && crisisAllNeedsWork.rule === 'crisis_scale', 'crisis with all scored axes needing work selects the executive project before the monthly rule');
for (const input of [
  { overallComputed: false, axisDetails: ax(CRIT, CRIT, CRIT, CRIT, CRIT, CRIT), lossSustainsExecutive: true },
  { overallComputed: true, axisDetails: ax(CRIT, CRIT, GAP, GAP, GAP, GAP), lossSustainsExecutive: true },
  { axisDetails: null, lossSustainsExecutive: true },
]) {
  const recommendation = recommendOffer({ ...input, startMode: 'crisis' });
  check(recommendation.key === 'focusedWeek' && recommendation.rule === 'insufficient_data', 'insufficient data takes precedence over crisis critical axes and real loss');
}

// This fingerprint preserves pre-5-D decisions and metadata, with only the approved
// 6-C spelling correction in crisis_scale reasons recorded in the fixture. Exhaust every six-axis status combination, computed-data flag and real-loss
// flag, so analysis and omitted-mode behavior cannot silently change while adding the new rule.
const analysisBaseline = JSON.parse(read('scripts/fixtures/offerAnalysisBaseline.json'));
const stableStates = [OK, IMP, CRIT, GAP];
const analysisHash = createHash('sha256');
const omittedModeHash = createHash('sha256');
let analysisCases = 0;
let crisisCases = 0, crisisParity = true;
for (let encoded = 0; encoded < stableStates.length ** 6; encoded += 1) {
  let cursor = encoded;
  const statuses = Array.from({ length: 6 }, () => {
    const status = stableStates[cursor % stableStates.length];
    cursor = Math.floor(cursor / stableStates.length);
    return status;
  });
  for (const overallComputed of [undefined, false, true]) {
    for (const lossSustainsExecutive of [false, true]) {
      const input = { axisDetails: ax(...statuses), overallComputed, lossSustainsExecutive };
      const analysisResult = recommendOffer({ ...input, startMode: 'analysis' });
      const crisisResult = recommendOffer({ ...input, startMode: 'crisis' });
      analysisHash.update(JSON.stringify(analysisResult) + '\n');
      omittedModeHash.update(JSON.stringify(recommendOffer(input)) + '\n');
      if (crisisResult.rule !== 'crisis_critical' && JSON.stringify(crisisResult) !== JSON.stringify(analysisResult)) crisisParity = false;
      crisisCases += 1;
      analysisCases += 1;
    }
  }
}
check(analysisCases === analysisBaseline.cases && analysisHash.digest('hex') === analysisBaseline.sha256, `analysis mode preserves all ${analysisCases} frozen results with the authorized 6-C reason correction`);
check(omittedModeHash.digest('hex') === analysisBaseline.sha256, 'omitting the optional start mode preserves the same corrected analysis results');
check(crisisCases === analysisBaseline.cases && crisisParity, `all ${crisisCases} crisis combinations match analysis unless crisis_critical applies`);
const syntheticSessions = reviewSessions();
check(analysisBaseline.sessions.length === syntheticSessions.length, 'all five existing synthetic sessions are covered by the pre-D oracle');
for (const session of syntheticSessions) {
  const score = computeDeterministicScore(session.universalAnswers || {}, session.intakeAnswers);
  const expected = analysisBaseline.sessions.find((item: { sessionId: string }) => item.sessionId === session.sessionId)?.expected;
  const actual = recommendOffer({ overallComputed: score.overallComputed, axisDetails: score.axisDetails, startMode: 'analysis' });
  check(Boolean(expected) && JSON.stringify(actual) === JSON.stringify(expected), `${session.sessionId}: analysis recommendation exactly matches its pre-D result`);
}
const reportRecommendation = read('src/pages/Report.tsx').match(/recommendOffer\(\{([^}]+)\}\)/)?.[1] || '';
check(/\bstartMode\b/.test(reportRecommendation), 'Report passes the selected start mode into its offer recommendation');
check(read('src/pages/Report.tsx').includes('[report, axisDetails, monthlyWaste, startMode]'), 'Report recomputes the offer when the selected start mode changes');

console.log(`\nOFFERS: ${pass} PASSED, ${fail} FAILED`);
if (fail > 0) process.exit(1);
