/**
 * Fix B — no invented numbers, "unknown" is a data gap.
 * Run: tsx scripts/verify_scoring_integrity.ts
 */
import { computeDeterministicScore, computeInstantScore, parseNetMargin, U06_BAND_LABELS } from '../src/services/deterministicScoring';
import { createFallbackReport } from '../src/services/reportFallback';
import { buildEvidenceBasedSwot } from '../src/services/evidenceSwot';

let pass = 0;
let fail = 0;
function check(ok: boolean, msg: string) {
  if (ok) { pass++; console.log(`  PASS: ${msg}`); } else { fail++; console.error(`  FAIL: ${msg}`); }
}

const FULL: Record<string, string> = { u01:'always',u02:'week',u03:'no',u04:'expected',u05:'same',u06:'5_10',u08:'no',u09:'45',u10:'40_60',u11:'yes_clear',u12:'week',u13:'recent_known',u15:'week',u16:'no',u17:'gt40',u18:'most',u19:'lt10',u20:'big_yes',u22:'no',u23:'raise_value',u24:'strong',u25:'no_goal',u26:'none',u27:'gt10',u28:'yes' };
const withAll = (v: string) => Object.fromEntries(Object.keys(FULL).map(k => [k, v]));

// 1. Golden: realistic full session is unchanged.
const golden = computeDeterministicScore(FULL);
check(golden.overallComputed === true && golden.overall === 76, `G1 full session computed, overall=76 (got ${golden.overall})`);

// 2. Insufficient data never yields a computed overall.
for (const [name, ans] of [
  ['no answers', {}],
  ['all "unknown"', withAll('unknown')],
  ['all "..."', withAll('...')],
  ['all "لا أعرف"', withAll('لا أعرف')],
  ['single answer', { u01: 'always' }],
] as Array<[string, Record<string, string>]>) {
  const r = computeDeterministicScore(ans);
  check(r.overallComputed === false, `A. ${name}: overallComputed=false`);
  check(Object.values(r.axisDetails).every(d => d.status === 'بيانات غير كافية'), `A. ${name}: every axis marked insufficient`);
}

// 3. Skip on an arbitrary question is a gap, not a neutral 50%.
const skipped = computeDeterministicScore({ ...FULL, u01: 'unknown' });
check(skipped.dataGaps.some(g => g.questionId === 'u01'), 'B. u01 skipped -> listed in data gaps');

// 4. u06: a band never becomes a point value; exact input stays exact.
const band = parseNetMargin('gt20');
check(band.isExact === false, 'C. band answer is not exact');
const gtRes = computeDeterministicScore({ ...FULL, u06: 'gt20' });
const gtText = JSON.stringify(gtRes.topStrengths ?? []) + JSON.stringify(gtRes.topWeaknesses ?? []);
check(!gtText.includes('25%'), 'C. "gt20" does not print midpoint 25%');
check(gtText.includes('أكثر من 20%'), 'C. "gt20" is shown as the band label "أكثر من 20%"');
check(Object.values(U06_BAND_LABELS).includes('أكثر من 20%'), 'C. band label table has "أكثر من 20%"');
const exact = computeDeterministicScore({ ...FULL, u06: '12.7' });
check(JSON.stringify(exact.axisDetails).includes('12.7%'), 'C. exact 12.7 is shown as "12.7%"');
check(parseNetMargin('12.7').isExact === true && parseNetMargin('12.7').value === 12.7, 'C. exact 12.7 parsed as exact 12.7');

// 5. Fallback report with insufficient data.
const sparse = computeDeterministicScore({ u01: 'always' });
const rep = createFallbackReport({ scoreResult: sparse, companyData: { companyName: 'ش', sectorL1: 'services', sectorL2: 'consulting', diagnosticDepth: 'quick' }, answers: { u01: 'always' } });
const repText = JSON.stringify(rep);
check(rep.health_score_computed === false, 'D. fallback report flags health_score_computed=false');
check(rep.health_label === 'بيانات غير كافية لحساب مؤشر موثوق', 'D. fallback label says insufficient data');
check(!/\d+\s*\/\s*100/.test(String(rep.executive_diagnosis ?? '')), 'D. diagnosis text has no "/100"');
check(!/تنامي الطلب/.test(repText), 'D. no invented demand-growth claim in report');

// 6. SWOT: no invented percentages.
const swot = buildEvidenceBasedSwot(golden, FULL, 'retail', 'supermarket');
const swotText = JSON.stringify(swot);
check(!swotText.includes('30%'), 'E. SWOT has no "30%"');
check(!/تنامي الطلب/.test(swotText), 'E. SWOT has no "تنامي الطلب"');

console.log(`\nSCORING INTEGRITY: ${pass} PASSED, ${fail} FAILED`);
if (fail > 0) process.exit(1);
