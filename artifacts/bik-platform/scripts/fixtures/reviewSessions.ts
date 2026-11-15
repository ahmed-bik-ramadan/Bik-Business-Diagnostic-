import { getNextAdaptiveQuestion } from '../../src/services/adaptiveDiagnosticEngine';
import { POSITIVE_SIGNALS } from '../../src/services/deterministicScoring';
import { emptyReviewState } from '../../src/services/reviewState';
import type { ReviewInput } from '../../src/services/reviewContent';
import type { QuestionLedgerEntry } from '../../src/types/dualLayer';

export function reviewSession(kind: 'cash' | 'growth' | 'missing' | 'services' | 'sales-team'): ReviewInput & { sessionId: string } {
  const overrides: Record<string, any> = {
    cash: { u04: 'negative_surprise', u05: 'same', u06: '10_20', u08: 'yes', u27: 'zero', u26: 'hiring', u30: 'profitability_time', r01: 45 },
    growth: { u09: 15, u10: 'lt20', u12: 'gt_month', u20: 'no', u24: 'none', u25: 'specific_number', u30: 'sales_decision' },
    missing: {},
    services: { u02: 'cant', u04: 'negative_surprise', u05: 'slower', u06: '5_10', u15: 'gt_month', u18: 'none', u20: 'no', u25: 'non_financial', u26: 'technology', u30: 'organization_customers', p03: 'qualitative', p06: 'no_control' },
    'sales-team': { u09: 10, u10: 'lt20', u11: 'no', u12: 'gt_month', u16: 'no', u17: 'gt40', u18: 'none', u19: 'gt25', u25: 'percentage', u30: 'sales_decision' }
  }[kind];
  const sectorL1 = kind === 'services' ? 'professional' : 'retail';
  const answers: Record<string, any> = {};
  const history: QuestionLedgerEntry[] = [];
  let complete = false;
  for (let step = 0; step < 350; step += 1) {
    const result = getNextAdaptiveQuestion({ sectorL1, diagnosticDepth: 'deep', answers });
    if (result.isComplete) { complete = true; break; }
    const q = result.question;
    if (!q) throw new Error('Synthetic questionnaire stopped without completion');
    let value: any;
    if (kind === 'missing') value = 'unknown';
    else if (Object.hasOwn(overrides, q.id)) value = overrides[q.id];
    else if (q.id === 'u31') value = 300000;
    else if (q.id === 'u32') value = 120;
    else if (q.id === 'u33') value = 200;
    else if (q.id === 'u34') value = 700;
    else if (Array.isArray(POSITIVE_SIGNALS[q.id])) value = POSITIVE_SIGNALS[q.id][0];
    else if (q.type === 'slider') value = q.highIsBad ? (q.min ?? 0) : Math.min(q.max ?? 100, 80);
    else if (q.type === 'number') value = 20;
    else if (q.options?.length) value = q.type === 'multi_choice' ? [q.options[0].value] : q.options[0].value;
    else value = 'إجابة اصطناعية مكتملة';
    answers[q.id] = value;
    history.push({ sequence: history.length + 1, questionId: q.id, questionText: q.question,
      dimension: q.dimension, shownAt: step * 2, answeredAt: step * 2 + 1,
      status: 'answered', answerValue: value,
      answerText: q.options?.find(option => String(option.value) === String(value))?.label || String(value) });
  }
  if (!complete || history.at(-1)?.questionId !== 'u30') throw new Error('Synthetic walk did not end with u30');
  return {
    sessionId: `synthetic-review-${kind}`,
    userName: kind === 'cash' ? 'محمود' : kind === 'growth' ? 'نورة' : kind === 'services' ? 'سلمى' : kind === 'sales-team' ? 'أحمد' : '',
    companyName: kind === 'cash' ? 'دار النسيج' : kind === 'growth' ? 'مدار' : kind === 'services' ? 'مسار للخدمات' : kind === 'sales-team' ? 'وصل' : '',
    sectorL1, sectorL2: '', diagnosticDepth: 'deep',
    intakeAnswers: { country: kind === 'cash' ? 'مصر' : kind === 'growth' ? 'السعودية' : 'المغرب' },
    universalAnswers: Object.fromEntries(Object.entries(answers).filter(([id]) => id.startsWith('u'))),
    sectorAnswers: Object.fromEntries(Object.entries(answers).filter(([id]) => !id.startsWith('u'))),
    questionHistory: history,
    review: { ...emptyReviewState(), questionnaireComplete: true }
  };
}

export const reviewSessions = () => [reviewSession('cash'), reviewSession('growth'), reviewSession('missing'), reviewSession('services'), reviewSession('sales-team')];
