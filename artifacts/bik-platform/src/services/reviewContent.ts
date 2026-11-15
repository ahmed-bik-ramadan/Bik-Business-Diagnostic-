import { computeDeterministicScore, DIAGNOSTIC_DIMENSIONS, parseNetMargin } from './deterministicScoring';
import { buildOfferOutcomes } from './offerOutcomes';
import { evaluateDiagnosticState, getNextAdaptiveQuestion } from './adaptiveDiagnosticEngine';
import { getSectorHypotheses, getSectorQuestions } from '../data/sectorRegistry';
import { dialectForCountry, reviewCopy } from './dialect';
import { scrubInternalIds } from './internalIdScrub';
import { emptyReviewState, firstPendingReview, sanitizeReviewState, type ReviewPageNumber, type ReviewState } from './reviewState';

export interface ReviewInput {
  sessionId?: string;
  userName?: string;
  companyName?: string;
  sectorL1?: string;
  sectorL2?: string;
  diagnosticDepth?: 'quick' | 'deep';
  intakeAnswers?: Record<string, any>;
  universalAnswers?: Record<string, any>;
  sectorAnswers?: Record<string, any>;
  questionHistory?: Array<{ questionId: string; status?: string }>;
  review?: ReviewState;
}
export interface ReviewPageContent {
  page: ReviewPageNumber; title: string; subtitle: string; lines: string[]; sources: string[];
  /** Presentation only: these paragraphs never enter the accepted symptom lines. */
  mirror?: { opening: string; closing: string };
  inferredDestination?: boolean;
}

export function isReviewGap(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  const text = String(value).trim().toLowerCase();
  return !text || ['unknown', 'skipped', 'dont_know', 'guess', 'لا أعرف', 'لا اعرف', 'غير معروف'].includes(text)
    || /^(?:[\p{P}\p{S}\s]|…)+$/u.test(text);
}

const known = (answers: Record<string, any> = {}) => Object.fromEntries(Object.entries(answers).filter(([, value]) => !isReviewGap(value)));
const variant = (value: unknown): number => Array.from(JSON.stringify(value) ?? '').reduce((sum, char) => (sum + char.charCodeAt(0)) % 2, 0);
const identity = (value: unknown): string => typeof value === 'string'
  ? value.replace(/^\s*[أا]\s*\/\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';

/** The six existing results alone choose the mirror axis; sector labels never participate. */
export function selectReviewMirrorAxis(axisDetails: Record<string, { status?: string; score?: number }>): string {
  const priority = (status?: string) => status === 'نقطة حرجة' ? 0 : status === 'يحتاج تحسين' ? 1 : 2;
  const computed = (axis: string) => axisDetails[axis]?.status !== 'بيانات غير كافية'
    && Number.isFinite(axisDetails[axis]?.score) ? axisDetails[axis].score! : Infinity;
  return Object.keys(DIAGNOSTIC_DIMENSIONS).map((axis, index) => ({ axis, index }))
    .sort((a, b) => priority(axisDetails[a.axis]?.status) - priority(axisDetails[b.axis]?.status)
      || computed(a.axis) - computed(b.axis) || a.index - b.index)[0].axis;
}

/** A stable session checksum, derived on demand without storing another seed. */
const sessionCopySeed = (sessionId = ''): number => Array.from(sessionId)
  .reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 0);

/** Replace only the fallback prose. The separately approved hook + solution stays intact. */
export function buildReviewDestination(symptoms: ReadonlyArray<{ source: string }>, axis: string, sessionId = ''): string | undefined {
  if (!symptoms.length) return undefined;
  const copy = reviewCopy('fusha').destination;
  const lines = [...new Set(symptoms.slice(0, 3).map(({ source }) => {
    const direct = (copy as Record<string, unknown>)[source];
    const line = /^u\d{2}$/.test(source) && typeof direct === 'string' ? direct : copy.axis[axis];
    if (typeof line !== 'string') throw new Error('Missing approved review destination');
    return line;
  }))];
  const seed = sessionCopySeed(sessionId);
  const joined = lines.map((line, index) => index ? line.replace(/^أن\s+/u, '') : line).join('، وأن ');
  return `${copy.lead[seed % copy.lead.length].trim()} ${joined}. ${copy.tail[(seed + 1) % copy.tail.length].trim()}`;
}

/** Editorial projection of existing evidence, not another score or diagnostic model. */
export function buildReviewPages(input: ReviewInput): ReviewPageContent[] {
  const copy = reviewCopy(dialectForCountry(input.intakeAnswers?.country));
  const name = identity(input.userName || input.intakeAnswers?.firstName);
  const company = identity(input.companyName || input.intakeAnswers?.companyName);
  const { u30: reflectiveAnswer, ...answers } = known(input.universalAnswers);
  const score = computeDeterministicScore(answers, known(input.intakeAnswers));
  const outcomes = buildOfferOutcomes(score.axisDetails, 6).filter(outcome => outcome.kind === 'weak' && outcome.basis);
  const evidence = outcomes.flatMap(outcome => {
    const detail = score.axisDetails[outcome.axis];
    return detail.evidence
      .filter(item => item.signal === 'negative' && !isReviewGap(answers[item.sourceQuestionId]))
      .map(negative => ({ outcome, negative }));
  });
  const pains = evidence.flatMap(({ outcome, negative }) => {
    const choices = copy.pain[negative.sourceQuestionId] || copy.axisPain[outcome.axis];
    return choices ? [{ text: choices[variant(negative.userAnswerRaw)], source: negative.sourceQuestionId, axis: outcome.axis }] : [];
  });

  // Sector findings use the same applicable catalog, polarity, hypotheses and conflict handling as the existing engine.
  const questions = getSectorQuestions(input.sectorL1 || '', input.sectorL2);
  const sectorState = evaluateDiagnosticState(questions, getSectorHypotheses(input.sectorL1 || ''), {
    ...answers, ...known(input.sectorAnswers)
  });
  const existingFindings = getNextAdaptiveQuestion({ sectorL1: input.sectorL1, sectorL2: input.sectorL2,
    diagnosticDepth: input.diagnosticDepth, answers: { ...answers, ...known(input.sectorAnswers) } }).diagnosticState.findings;
  const severity = (id: string) => Math.max(0, ...existingFindings.filter(finding => finding.evidenceRefs.includes(id)).map(finding => finding.severity));
  const sectorNegatives = sectorState.evidenceList
    .filter(item => item.polarity === 'negative' && !isReviewGap(item.answer)
      && !sectorState.findings.some(finding => finding.status === 'conflicted' && finding.evidenceRefs.includes(item.questionId)))
    .sort((a, b) => severity(b.questionId) - severity(a.questionId) || b.weight - a.weight || a.questionId.localeCompare(b.questionId, 'en'));
  const sectorPains = sectorNegatives.flatMap(item => {
      const choices = copy.sectorPain[item.questionId];
      const question = questions.find(question => question.id === item.questionId);
      const axis = question?.dimension || item.questionId;
      if (choices) return [{ text: choices[variant(item.answer)], source: item.questionId, axis }];
      const selected = question?.options?.find(option => String(option.value) === String(item.answer));
      const label = selected && scrubInternalIds(selected.label);
      // A hypothesis title can assert more than its trigger proves. Quote only an actual selected answer instead.
      return label && !/[\d٠-٩۰-۹]/u.test(label)
        ? [{ text: copy.sectorAnswer(label, variant(item.answer)), source: item.questionId, axis }] : [];
    });
  const rankedPains = [...pains, ...sectorPains].filter((item, index, all) => all.findIndex(other => other.text === item.text) === index)
    .sort((a, b) => severity(b.source) - severity(a.source));
  const singleAxis = new Set(rankedPains.map(item => item.axis)).size === 1;
  const painLines = rankedPains.filter((item, index, all) => singleAxis
    || all.findIndex(other => other.axis === item.axis) === index).slice(0, singleAxis ? 2 : 3);
  const mirrorAxis = selectReviewMirrorAxis(score.axisDetails);
  const mirror = painLines.length ? {
    opening: copy.mirror.open[mirrorAxis][variant([mirrorAxis, score.axisDetails[mirrorAxis]?.status])],
    closing: copy.mirror.close[sessionCopySeed(input.sessionId) % copy.mirror.close.length]
  } : undefined;

  const ambition: Array<{ text: string; source: string }> = [];
  if (copy.goals[answers.u25]) ambition.push({ text: copy.goals[answers.u25], source: 'u25' });
  if (copy.reflection[reflectiveAnswer]) ambition.push({ text: copy.reflection[reflectiveAnswer], source: 'u30' });
  const customDestination = input.review?.responses[2]?.kind === 'custom' || Boolean(input.review?.drafts[2]?.trim());
  const inferredDestination = !ambition.length && !customDestination
    ? buildReviewDestination(painLines, mirrorAxis, input.sessionId) : undefined;
  if (!ambition.length) ambition.push({ text: inferredDestination || copy.fallback[2], source: '' });
  // One possible intervention, attached only to the first evidenced weak outcome. Never a promised result.
  const primary = painLines[0];
  const first = evidence.find(item => item.negative.sourceQuestionId === primary?.source);
  const solution = primary && (copy.solution[primary.source]
    || (first ? copy.axisSolution[first.outcome.axis] : copy.sectorSolution));
  if (solution) {
    const hook = copy.problemHook[primary.source] || copy.problemHook.other;
    ambition.push({ text: `${hook} ${solution}`, source: primary.source });
  }

  // The entire negative pool can feed consequences, including evidence outside the three displayed symptoms.
  const negativeIds = [...painLines.map(item => item.source), ...rankedPains.map(item => item.source), ...sectorNegatives.map(item => item.questionId),
    ...Object.values(score.axisDetails).flatMap(detail => detail.evidence
      .filter(item => item.signal === 'negative' && !isReviewGap(answers[item.sourceQuestionId]))
      .map(item => item.sourceQuestionId))];
  const decision = copy.decisions[answers.u26] && !painLines.some(item => item.source === 'u26')
    ? { text: copy.decisions[answers.u26], source: 'u26' } : null;
  // These are gaps, not negative signals or invented fears. Do not display calculated figures here.
  const margin = parseNetMargin(input.universalAnswers?.u06);
  const financialGap = (isReviewGap(input.universalAnswers?.u31) && isReviewGap(input.intakeAnswers?.monthlyRevenue))
    || isReviewGap(input.universalAnswers?.u06) || margin.isGap || margin.value === null;
  // Displayed symptoms get consequences first; a real gap must fit, then an additional decision if room remains.
  const includedDecision = decision && painLines.length + Number(financialGap) < 4 ? decision : null;
  const concerns: Array<{ text: string; source: string }> = [...new Set(negativeIds)]
    .filter(id => id !== 'u26' || !includedDecision)
    .slice(0, 4 - Number(Boolean(includedDecision)) - Number(financialGap))
    .map(id => ({ text: copy.consequence[id] || copy.consequence.other, source: `consequence:${id}` }));
  if (includedDecision) concerns.push(includedDecision);
  if (!concerns.length) concerns.push({ text: copy.fallback[3], source: '' });
  if (financialGap) concerns.push({ text: copy.financialGap, source: 'gap:u31/u06' });
  const worryLines = concerns.slice(0, 4);
  if (!worryLines.length) worryLines.push({ text: copy.fallback[3], source: '' });

  return ([1, 2, 3] as const).map(page => {
    const items = page === 1 ? (painLines.length ? painLines : [{ text: score.overallComputed !== false ? copy.noPain : copy.fallback[1], source: '' }]) : page === 2 ? ambition : worryLines;
    return { page, title: copy.title(page, name), subtitle: copy.subtitle(page, name, company),
      lines: items.map(item => item.text), sources: items.map(item => item.source).filter(Boolean),
      ...(page === 1 && mirror ? { mirror } : {}),
      ...(page === 2 && inferredDestination ? { inferredDestination: true } : {}) };
  });
}

export function questionnaireFinished(input: ReviewInput): boolean {
  if (isReviewGap(input.universalAnswers?.u30)) {
    // The explicit unknown answer is valid completion, even though it cannot feed the prose.
    if (input.universalAnswers?.u30 !== 'unknown') return false;
  }
  const last = input.questionHistory?.at(-1);
  if (!last || last.questionId !== 'u30' || !['answered', 'skipped'].includes(last.status || '')) return false;
  return getNextAdaptiveQuestion({ sectorL1: input.sectorL1, sectorL2: input.sectorL2,
    diagnosticDepth: input.diagnosticDepth, answers: { ...input.universalAnswers, ...input.sectorAnswers } }).isComplete;
}

export function reviewEntryRedirect(input: ReviewInput, requestedPage: ReviewPageNumber): string | null {
  if (!input.sectorL1) return '/sector-select';
  if (!Object.keys(input.intakeAnswers || {}).length) return '/company-intake';
  const state = sanitizeReviewState(input.review);
  if (!state.questionnaireComplete || !questionnaireFinished(input)) return '/questionnaire';
  const first = firstPendingReview(state);
  return first && requestedPage > first ? `/review/${first}` : null;
}

export function processingReviewRedirect(input: ReviewInput): string | null {
  return reviewEntryRedirect(input, 3) || (firstPendingReview(input.review || emptyReviewState()) ? '/review/3' : null);
}

export const reviewNextRoute = (page: ReviewPageNumber): string => page < 3 ? `/review/${page + 1}` : '/processing';

/** Native history for a direct entry/reload, with no visitor text in browser history. */
export const reviewHistoryRoutes = (page: ReviewPageNumber): string[] =>
  ['/questionnaire', ...([1, 2, 3] as const).filter(number => number <= page).map(number => `/review/${number}`)];
