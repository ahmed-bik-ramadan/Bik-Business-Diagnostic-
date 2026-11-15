/**
 * Fix C — sector questions only for matching sub-sectors.
 * Run: tsx scripts/verify_subsector_gating.ts
 */
import { sectors } from '../src/data/sectors';
import { getSectorQuestions } from '../src/data/sectorRegistry';
import { deltaQuestions } from '../src/data/deltaQuestions';
import { SUBSECTOR_EXCLUSIONS, isQuestionApplicable } from '../src/data/subsectorGating';
import { getNextAdaptiveQuestion } from '../src/services/adaptiveDiagnosticEngine';

let pass = 0;
let fail = 0;
function check(ok: boolean, msg: string) {
  if (ok) { pass++; console.log(`  PASS: ${msg}`); } else { fail++; console.error(`  FAIL: ${msg}`); }
}

const byId = new Map((sectors as any[]).map(s => [s.id as string, s]));

// 1. Data integrity: every excluded label and question id really exists.
let integrityOk = true;
for (const [sectorId, qs] of Object.entries(SUBSECTOR_EXCLUSIONS)) {
  const sector: any = byId.get(sectorId);
  if (!sector) { integrityOk = false; console.error(`  unknown sector ${sectorId}`); continue; }
  const bankIds = new Set(getSectorQuestions(sectorId, undefined, true).map((q: any) => q.id));
  for (const [qid, labels] of Object.entries(qs)) {
    if (!bankIds.has(qid)) { integrityOk = false; console.error(`  ${sectorId}.${qid}: question not in bank`); }
    for (const label of labels) {
      if (!sector.subsectors.includes(label)) { integrityOk = false; console.error(`  ${sectorId}.${qid}: unknown sub-sector "${label}"`); }
    }
    if (labels.length >= sector.subsectors.length) { integrityOk = false; console.error(`  ${sectorId}.${qid}: excluded for ALL sub-sectors`); }
  }
}
check(integrityOk, 'every exclusion points to a real question and a real sub-sector, and none removes a question everywhere');

// 2. No sub-sector chosen -> nothing is removed.
check((sectors as any[]).every(s => getSectorQuestions(s.id, undefined, true).length >= 12), 'without a sub-sector the full bank is returned');

// 3. Investigation table (printed) + the sports agency case from the real session.
const table: Array<{ sector: string; sub: string; n: number }> = [];
for (const s of sectors as any[]) {
  for (const sub of s.subsectors as string[]) {
    table.push({ sector: s.id, sub, n: getSectorQuestions(s.id, sub, true).length });
  }
}
console.log(`\n  sub-sectors checked: ${table.length}`);
const thin = table.filter(t => t.n < 6).sort((a, b) => a.n - b.n);
console.log('  sub-sectors left with fewer than 6 sector questions (content gap, needs new questions):');
thin.forEach(t => console.log(`    ${t.sector} / ${t.sub}: ${t.n}`));
check(table.length === 167, 'all 167 sub-sectors evaluated');

const agency = getSectorQuestions('sports', 'وكالة رياضية وتسويق رياضي', true).map((q: any) => q.id);
check(agency.every((id: string) => !/^s\d\d$/.test(id)), 'sports agency gets none of the gym/membership questions (s01-s12)');
const gym = getSectorQuestions('sports', 'مركز لياقة بدنية جيم', true).map((q: any) => q.id);
check(gym.filter((id: string) => /^s\d\d$/.test(id)).length === 12, `gym keeps all 12 membership questions (got ${gym.filter((id: string) => /^s\d\d$/.test(id)).length})`);
check(gym.filter((id: string) => /^ud\d\d$/.test(id)).length === 2, 'gym flow carries the universal deep financial questions (ud01-ud02)');
const stadium = getSectorQuestions('sports', 'ملعب خماسي أو صالة متعددة الألعاب', true).map((q: any) => q.id);
check(!stadium.includes('s11') && !stadium.includes('s07') && stadium.includes('s04'), 'five-a-side stadium: no coach questions, keeps facility occupancy');

// 4. Other known mismatches are gone.
check(!getSectorQuestions('healthcare', 'صيدلية', true).some((q: any) => q.id === 'h01'), 'pharmacy is not asked about missed patient appointments');
check(!getSectorQuestions('logistics', 'تخزين ومستودعات', true).some((q: any) => q.id === 'l03'), 'warehouse is not asked about empty truck miles');
check(!getSectorQuestions('realestate', 'تقييم عقاري', true).some((q: any) => q.id === 're05'), 'property valuation is not asked about number of brokers');
check(getSectorQuestions('logistics', 'تخزين ومستودعات', true).some((q: any) => q.id === 'l07'), 'warehouse keeps inventory accuracy');

// 5. Sub-sector delta questions are never removed.
let deltaOk = true;
for (const [label, list] of Object.entries(deltaQuestions as any)) {
  const sector = (sectors as any[]).find(s => s.subsectors.includes(label));
  if (!sector) { deltaOk = false; continue; }
  const ids = getSectorQuestions(sector.id, label, true).map((q: any) => q.id);
  for (const q of list as any[]) if (!ids.includes(q.id)) deltaOk = false;
}
check(deltaOk, 'sub-sector delta questions are all still present');

// 6. The live adaptive flow never serves a gym question to the agency, and still serves them to the gym.
function runFlow(sub: string): string[] {
  const answers: Record<string, any> = {};
  const asked: string[] = [];
  for (let i = 0; i < 120; i += 1) {
    const r = getNextAdaptiveQuestion({ sectorL1: 'sports', sectorL2: sub, diagnosticDepth: 'deep', answers });
    if (r.isComplete || !r.question) break;
    const q: any = r.question;
    if (asked.includes(q.id)) break;
    asked.push(q.id);
    answers[q.id] = q.options?.[0]?.value ?? '1';
  }
  return asked;
}
const agencyFlow = runFlow('وكالة رياضية وتسويق رياضي');
const gymFlow = runFlow('مركز لياقة بدنية جيم');
console.log(`  flow lengths: agency=${agencyFlow.length}, gym=${gymFlow.length}`);
check(agencyFlow.length > 20 && agencyFlow.every(id => !/^s\d\d$/.test(id)), 'live flow: agency asked >20 questions, none from the gym bank');
check(gymFlow.some(id => /^s\d\d$/.test(id)), 'live flow: gym is still asked gym questions');

console.log(`\nSUBSECTOR GATING: ${pass} PASSED, ${fail} FAILED`);
if (fail > 0) process.exit(1);
