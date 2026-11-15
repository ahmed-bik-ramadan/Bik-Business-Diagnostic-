export type ValueModelMode = 'reducible_waste' | 'incremental_sales_contribution';

export interface DeclaredValueInputs {
  mode: ValueModelMode;
  monthlyReducibleWaste?: number | null;
  reductionLowPct?: number | null;
  reductionHighPct?: number | null;
  monthlyIncrementalSales?: number | null;
  contributionMarginPct?: number | null;
  implementationCost: number | null;
  evaluationDays: number | null;
  currency: string;
  focusedWeekFee?: number | null;
  monthlyRetainerFee?: number | null;
}

export interface DeclaredValueModel {
  mode: ValueModelMode;
  isComputable: boolean;
  currency: string;
  evaluationDays: number | null;
  /** المصرَّح به من صاحب النشاط كما هو، بلا معالجة — لأسطر الخسارة في بطاقات العروض. */
  monthlyReducibleWaste: number | null;
  /** مشتق من أرقام العميل المصرَّح بها في أسئلة التشخيص العميق، لا يُستعمل إلا حين لا يوجد مصرَّح مباشر. */
  computedMonthlyWaste?: number | null;
  monthlyIncrementalSales: number | null;
  grossImpactLow: number | null;
  grossImpactHigh: number | null;
  netBenefitLow: number | null;
  netBenefitHigh: number | null;
  noImprovementNetBenefit: number | null;
  focusedWeekNoImprovementNetBenefit: number | null;
  monthlyRetainerNoImprovementNetBenefit: number | null;
  focusedWeekNetBenefitLow: number | null;
  focusedWeekNetBenefitHigh: number | null;
  monthlyRetainerNetBenefitLow: number | null;
  monthlyRetainerNetBenefitHigh: number | null;
  breakEvenGrossImpactForWeek: number | null;
  breakEvenGrossImpactForMonth: number | null;
  assumptions: string[];
  gaps: string[];
  disclaimer: string;
}

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function finitePercentage(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

/**
 * Calculates only from explicitly declared inputs. It never treats historic loss as
 * recoverable by default, never applies FX conversion, and allows negative net benefit.
 */
export function calculateDeclaredValueModel(input: DeclaredValueInputs): DeclaredValueModel {
  const gaps: string[] = [];
  const assumptions: string[] = [];
  const implementationCost = finiteNonNegative(input.implementationCost);
  const evaluationDays = finiteNonNegative(input.evaluationDays);
  const currency = (input.currency || '').trim().toUpperCase();
  if (!currency) gaps.push('عملة نموذج القيمة');
  if (implementationCost === null) gaps.push('تكلفة التنفيذ');
  if (evaluationDays === null || evaluationDays === 0) gaps.push('فترة التقييم بالأيام');

  let grossImpactLow: number | null = null;
  let grossImpactHigh: number | null = null;
  if (input.mode === 'reducible_waste') {
    const waste = finiteNonNegative(input.monthlyReducibleWaste);
    const low = finitePercentage(input.reductionLowPct);
    const high = finitePercentage(input.reductionHighPct);
    if (waste === null) gaps.push('الهدر الشهري القابل للتقليل');
    if (low === null) gaps.push('نسبة التقليل المنخفضة');
    if (high === null) gaps.push('نسبة التقليل المرتفعة');
    if (low !== null && high !== null && low > high) gaps.push('ترتيب نطاق التقليل');
    if (waste !== null && low !== null && high !== null && low <= high) {
      grossImpactLow = Math.round(waste * low / 100 * 100) / 100;
      grossImpactHigh = Math.round(waste * high / 100 * 100) / 100;
      assumptions.push(`هدر مصرح به ${waste} ${currency} خلال ${evaluationDays ?? '؟'} يوماً`);
      assumptions.push(`نطاق تقليل معلن ${low}%–${high}%؛ ليس توقعاً سوقياً`);
    }
  } else {
    const sales = finiteNonNegative(input.monthlyIncrementalSales);
    const margin = finitePercentage(input.contributionMarginPct);
    if (sales === null) gaps.push('المبيعات الإضافية الشهرية المصرح بها');
    if (margin === null) gaps.push('هامش مساهمة المبيعات الإضافية');
    if (sales !== null && margin !== null) {
      grossImpactLow = grossImpactHigh = Math.round(sales * margin / 100 * 100) / 100;
      assumptions.push(`المبيعات الإضافية المصرح بها ${sales} ${currency}`);
      assumptions.push(`هامش مساهمة معلن ${margin}%؛ الناتج ربح مساهمة لا إيراد خام`);
    }
  }

  if (implementationCost !== null) assumptions.push(`تكلفة تنفيذ معلنة ${implementationCost} ${currency}`);
  if (evaluationDays !== null) assumptions.push(`فترة تقييم معلنة ${evaluationDays} يوماً`);

  const computable = gaps.length === 0 && grossImpactLow !== null && grossImpactHigh !== null && implementationCost !== null;
  const netBenefitLow = computable ? grossImpactLow! - implementationCost! : null;
  const netBenefitHigh = computable ? grossImpactHigh! - implementationCost! : null;
  const noImprovementNetBenefit = implementationCost !== null ? -implementationCost : null;
  const weekFee = finiteNonNegative(input.focusedWeekFee);
  const monthFee = finiteNonNegative(input.monthlyRetainerFee);
  const focusedWeekNetBenefitLow = computable && weekFee !== null ? grossImpactLow! - implementationCost! - weekFee : null;
  const focusedWeekNetBenefitHigh = computable && weekFee !== null ? grossImpactHigh! - implementationCost! - weekFee : null;
  const monthlyRetainerNetBenefitLow = computable && monthFee !== null ? grossImpactLow! - implementationCost! - monthFee : null;
  const monthlyRetainerNetBenefitHigh = computable && monthFee !== null ? grossImpactHigh! - implementationCost! - monthFee : null;
  const focusedWeekNoImprovementNetBenefit = implementationCost !== null && weekFee !== null ? -implementationCost - weekFee : null;
  const monthlyRetainerNoImprovementNetBenefit = implementationCost !== null && monthFee !== null ? -implementationCost - monthFee : null;

  return {
    mode: input.mode,
    isComputable: computable,
    currency,
    evaluationDays,
    monthlyReducibleWaste: input.mode === 'reducible_waste' ? finiteNonNegative(input.monthlyReducibleWaste) : null,
    monthlyIncrementalSales: input.mode === 'incremental_sales_contribution' ? finiteNonNegative(input.monthlyIncrementalSales) : null,
    grossImpactLow,
    grossImpactHigh,
    netBenefitLow,
    netBenefitHigh,
    noImprovementNetBenefit,
    focusedWeekNoImprovementNetBenefit,
    monthlyRetainerNoImprovementNetBenefit,
    focusedWeekNetBenefitLow,
    focusedWeekNetBenefitHigh,
    monthlyRetainerNetBenefitLow,
    monthlyRetainerNetBenefitHigh,
    breakEvenGrossImpactForWeek: weekFee !== null && implementationCost !== null ? weekFee + implementationCost : null,
    breakEvenGrossImpactForMonth: monthFee !== null && implementationCost !== null ? monthFee + implementationCost : null,
    assumptions,
    gaps,
    disclaimer: 'نموذج قيمة مشروط بمدخلات صرّح بها صاحب النشاط؛ لا يعادل الخسارة التاريخية بمبلغ قابل للاسترداد، ولا يجمع وفورات متداخلة، ولا يحوّل العملات.',
  };
}
