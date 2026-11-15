/**
 * The reflective question u30 is asked exactly once, last, in quick and deep sessions,
 * and never changes scoring (scoring isolation is covered by verify_reflective_question_isolation.ts).
 * Run: tsx scripts/verify_u30_flow.ts
 */
import { getNextAdaptiveQuestion } from '../src/services/adaptiveDiagnosticEngine';

let pass = 0;
let fail = 0;
function check(ok: boolean, msg: string) {
  if (ok) { pass++; console.log(`  PASS: ${msg}`); } else { fail++; console.error(`  FAIL: ${msg}`); }
}

function answerFor(q: any): any {
  if (q.type === 'number') return 1000;
  if (q.type === 'slider') return 50;
  if (q.type === 'multi_choice') return [q.options[0].value];
  if (q.type === 'text') return 'نص';
  return q.options?.[0]?.value ?? 'x';
}

const sessions: Array<[string, string]> = [
  ['الرياضة والتأهيل البدني', 'وكالة رياضية وتسويق رياضي'],
  ['التجزئة', 'متجر ملابس']
];
for (const depth of ['quick', 'deep'] as const) {
  for (const [l1, l2] of sessions) {
    const answers: Record<string, any> = {};
    const asked: string[] = [];
    for (let i = 0; i < 150; i++) {
      const next: any = getNextAdaptiveQuestion({ sessionId: 's', sectorL1: l1, sectorL2: l2, diagnosticDepth: depth, answers });
      if (next.isComplete || !next.question) break;
      asked.push(next.question.id);
      answers[next.question.id] = answerFor(next.question);
    }
    check(asked.filter(id => id === 'u30').length === 1, `${depth} / ${l2}: u30 asked exactly once`);
    check(asked[asked.length - 1] === 'u30', `${depth} / ${l2}: u30 is the last question`);
    check(new Set(asked).size === asked.length, `${depth} / ${l2}: no question repeated`);
  }
}
console.log(`\nU30 FLOW: ${pass} PASSED, ${fail} FAILED`);
process.exit(fail ? 1 : 0);
