/**
 * Which of the three BIK offers to highlight.
 * Pure, deterministic and explainable: the rule and its inputs are shown to the client with the card.
 *
 * Rule:
 *  - Not enough data (overall not computed, or fewer than 3 scored axes) -> focused week
 *    (it starts by verifying the evidence).
 *  - Declared real losses sustain the executive project (lossSustainsExecutive, computed only
 *    when the client's own declared monthly waste covers the project price clearly) -> executive
 *    project: paying it does not strain his liquidity, and the case deserves a guiding hand.
 *  - Every scored axis (3 or more) is "critical" or "needs improvement" -> executive project
 *    (the whole company needs a guiding hand, not one isolated fix).
 *  - Crisis start with at least two critical axes -> monthly retainer for continuous execution.
 *  - More than half of the scored axes are "critical" or "needs improvement" -> monthly retainer
 *    (several fronts at once need execution follow-up).
 *  - Otherwise -> focused week (a specific problem or decision).
 */
import { EXECUTIVE_LOSS_THRESHOLD_USD } from '../config/appConfig';
import { formatPlatformCopy } from '../copy/platformCopy';

export type OfferKey = 'executiveProject' | 'focusedWeek' | 'monthlyRetainer';

export interface OfferRecommendation {
  key: OfferKey;
  rule: 'insufficient_data' | 'crisis_critical' | 'real_loss_covers_it' | 'crisis_scale' | 'many_fronts' | 'specific_issue';
  reason: string;
  scoredAxes: number;
  axesNeedingWork: number;
}

const INSUFFICIENT = 'بيانات غير كافية';
const NEEDS_WORK = new Set(['نقطة حرجة', 'يحتاج تحسين']);
export const MIN_SCORED_AXES_FOR_RECOMMENDATION = 3;
export const CRISIS_CRITICAL_AXES_FOR_RETAINER = 2;

/**
 * Does the client's declared monthly loss sustain the executive project? Computed once in the
 * report, and only the boolean (never the amount) travels into the chat context.
 */
export function lossSustainsExecutive(monthlyWaste: { amount: number; currency: string } | null | undefined): boolean {
  if (!monthlyWaste || !Number.isFinite(monthlyWaste.amount)) return false;
  // The threshold is set in USD, so the rule applies only to a USD-declared loss: comparing any
  // other currency to a USD figure without a rate would be a fabrication, and none is invented here.
  if (monthlyWaste.currency !== 'USD') return false;
  return monthlyWaste.amount >= EXECUTIVE_LOSS_THRESHOLD_USD;
}

export function recommendOffer(input: {
  startMode?: 'analysis' | 'crisis';
  overallComputed?: boolean;
  axisDetails?: Record<string, { status?: string }> | null;
  lossSustainsExecutive?: boolean;
}): OfferRecommendation {
  const statuses = Object.values(input.axisDetails || {}).map(detail => detail?.status || INSUFFICIENT);
  const scored = statuses.filter(status => status !== INSUFFICIENT);
  const needingWork = scored.filter(status => NEEDS_WORK.has(status));

  if (input.overallComputed === false || scored.length < MIN_SCORED_AXES_FOR_RECOMMENDATION) {
    return {
      key: 'focusedWeek',
      rule: 'insufficient_data',
      reason: 'بيانات هذه الجلسة لا تكفي لحكم شامل على الشركة، والأسبوع المُركَّز يبدأ بالتحقق من الأدلة قبل أي قرار.',
      scoredAxes: scored.length,
      axesNeedingWork: needingWork.length
    };
  }

  if (input.lossSustainsExecutive) {
    return {
      key: 'executiveProject',
      rule: 'real_loss_covers_it',
      reason: 'خسارتك الشهرية المصرَّح بها في ميزان القرار تغطي قيمة هذا المشروع تغطية واضحة، فالدفع لا يضغط على سيولتك، والحالة تستحق قائداً يقودها عنك لا معالجة موضعية.',
      scoredAxes: scored.length,
      axesNeedingWork: needingWork.length
    };
  }

  if (needingWork.length === scored.length) {
    return {
      key: 'executiveProject',
      rule: 'crisis_scale',
      reason: `${needingWork.length} من ${scored.length} محاور مقيّمة تحتاج تحسيناً أو حرجة، بلا محور واحد سليم. الحالة كلها تحتاج قائداً يتولى أمرها ويقود التنفيذ عنك، لا معالجة موضعية.`,
      scoredAxes: scored.length,
      axesNeedingWork: needingWork.length
    };
  }

  const criticalAxes = scored.filter(status => status === 'نقطة حرجة').length;
  if (input.startMode === 'crisis' && criticalAxes >= CRISIS_CRITICAL_AXES_FOR_RETAINER) {
    return {
      key: 'monthlyRetainer',
      rule: 'crisis_critical',
      reason: formatPlatformCopy('offer.reason.crisisCritical', { n: criticalAxes }),
      scoredAxes: scored.length,
      axesNeedingWork: needingWork.length
    };
  }

  if (needingWork.length * 2 > scored.length) {
    return {
      key: 'monthlyRetainer',
      rule: 'many_fronts',
      reason: `${needingWork.length} من ${scored.length} محاور مقيّمة تحتاج تحسيناً أو حرجة. حالة متعددة الجبهات تحتاج متابعة تنفيذ لا قراراً واحداً.`,
      scoredAxes: scored.length,
      axesNeedingWork: needingWork.length
    };
  }

  return {
    key: 'focusedWeek',
    rule: 'specific_issue',
    reason: `${needingWork.length} من ${scored.length} محاور مقيّمة فقط تحتاج تحسيناً أو حرجة. المشكلة محددة، وتناسبها معالجة مركزة.`,
    scoredAxes: scored.length,
    axesNeedingWork: needingWork.length
  };
}
