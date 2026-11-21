// src/services/deterministicScoring.ts
// BIK Business Intelligence & Knowledge - Pure Deterministic Diagnostic & Financial Engine
// Version: 2.0.0
// Guarantees:
// 1. Exact determinism: same inputs => identical outputs.
// 2. 0 LLM in scoring, 0 random values, 0 hidden assumptions.
// 3. Complete separation of diagnostic Health Score from Financial Impact calculations.
// 4. Missing inputs reduce confidence and identify gaps; never fabricate values.

import { calculateDeclaredValueModel, DeclaredValueModel, ValueModelMode } from './financialValueModel';
import { FOCUSED_WEEK_USD, MONTHLY_RETAINER_USD } from '../config/appConfig';

export type Confidence = 'عالي' | 'متوسط' | 'منخفض';
export type AxisStatus = 'مستقر' | 'يحتاج تحسين' | 'نقطة حرجة' | 'بيانات غير كافية';

export interface FindingEvidence {
  sourceQuestionId: string;
  questionLabel: string;
  dimension: string;
  userAnswerRaw: unknown;
  userAnswerParsed: string | number | boolean | null;
  signal: 'positive' | 'negative' | 'neutral' | 'gap';
  findingDescription: string;
}

export interface AxisDetail {
  dimension: string;
  score: number; // 0 to 100
  coverage: number; // 0 to 100
  confidence: Confidence;
  status: AxisStatus;
  dataGaps: string[];
  evidence: FindingEvidence[];
}

export interface FinancialInputs {
  monthlyRevenue: number | null;
  monthlyNewCustomers: number | null;
  cac: number | null;
  averageOrderValue: number | null;
  currency: string;
  netMarginPct: number | null;
  monthlyVisitors?: number | null;
  valueModel?: {
    mode: ValueModelMode;
    monthlyReducibleWaste?: number | null;
    reductionLowPct?: number | null;
    reductionHighPct?: number | null;
    monthlyIncrementalSales?: number | null;
    contributionMarginPct?: number | null;
    implementationCost: number | null;
    evaluationDays: number | null;
  };
}

export interface FinancialMetric {
  key: string;
  label: string;
  value: number | null;
  currency: string;
  isCalculated: boolean;
  formula?: string;
  evidenceInputs: string[];
}

export interface FinancialScenario {
  id: string;
  label: string;
  type: 'net_margin_improvement' | 'cac_optimization' | 'conversion_lift';
  currentValue: number | null;
  targetValue: number | null;
  projectedMonthlyGain: number | null;
  projectedAnnualGain: number | null;
  disclaimer: string;
  formula: string;
  isComputable: boolean;
  uncomputableReason?: string;
}

export interface FinancialSensitivities {
  margin?: number;
  acquisition?: number;
  conversion?: number;
}

export interface FinancialImpactResult {
  sensitivities?: FinancialSensitivities;
  metrics: Record<string, FinancialMetric>;
  scenarios: FinancialScenario[];
  identifiedGaps: string[];
  isComputable: boolean;
  uncomputableReason?: string;
  currency: string;
  declaredValueModel?: DeclaredValueModel;
  /** النقاط العمياء المشتقة من أرقام العميل المصرَّح بها في التشخيص العميق (لا شيء يُختلق). */
  sector_blind_spots?: Array<{ name: string; monthly_amount: number }>;
}

export interface EngineMetadata {
  diagnosticEngineVersion: string;
  scoringVersion: string;
  financialModelVersion: string;
  taxonomyVersion: string;
}

export interface DetailedScoreResult {
  overall: number; // 0 to 100. Meaningful ONLY when overallComputed !== false; otherwise 0 is a placeholder, never a measurement.
  /** false when too few axes have enough real answers; the overall number must not be shown. Undefined = legacy (treated as computed). */
  overallComputed?: boolean;
  overallConfidence: Confidence;
  overallCoverage: number; // 0 to 100
  axisScores: Record<string, number>;
  axisDetails: Record<string, AxisDetail>;
  dataGaps: Array<{ questionId: string; label: string; dimension: string }>;
  topWeaknesses: FindingEvidence[];
  topStrengths: FindingEvidence[];
  financialImpact: FinancialImpactResult;
  engineMetadata: EngineMetadata;
}

export const ENGINE_METADATA: EngineMetadata = {
  diagnosticEngineVersion: '2.0.0',
  scoringVersion: '2.0.0',
  financialModelVersion: '2.0.0',
  taxonomyVersion: '2.0.0'
};

// Map Eastern Arabic (٠-٩) and Persian (۰-۹) digits to Western ASCII digits (0-9)
const ARABIC_PERSIAN_DIGITS_MAP: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
};

/**
 * Robust numerical parser supporting Arabic/Persian digits, Arabic decimal separator (٫),
 * commas as thousand separators, percentage marks, and whitespace.
 * Returns any finite number when parseable; field-specific validation is applied by callers.
 */
export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    let s = value.trim();
    if (!s) return null;

    // Convert Arabic and Persian digits to ASCII
    s = s.replace(/[٠-٩۰-۹]/g, (ch) => ARABIC_PERSIAN_DIGITS_MAP[ch] || ch);

    // Replace Arabic decimal separator '٫' with '.'
    s = s.replace(/٫/g, '.');
    // Replace Arabic thousands separator '٬' with ''
    s = s.replace(/٬/g, '');

    // Strip currency symbols and percent signs
    s = s.replace(/[%٪$€£]|SAR|AED|EGP|KWD|QAR|USD|ريال|درهم|جنيه|دينار/gi, '');
    s = s.trim();

    // A currency/percentage label by itself is missing data, not numeric zero.
    if (!/[0-9]/.test(s)) return null;

    // Handle thousands separator commas (e.g., 100,000.50)
    // If string has commas and a single dot, remove commas
    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/,/g, '');
    } else if (s.includes(',')) {
      // If there is only one comma and 1 or 2 digits after it, it might be a decimal comma
      const parts = s.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        s = `${parts[0]}.${parts[1]}`;
      } else {
        // Otherwise treat commas as thousands separators
        s = s.replace(/,/g, '');
      }
    }

    const parsed = Number(s);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

/**
 * Categorical ranges backward compatibility mapping for u06 net margin.
 */
export const U06_CATEGORICAL_MAP: Record<string, number> = {
  lt5: 2.5,
  '5_10': 7.5,
  '10_20': 15,
  gt20: 25
};

/** Display labels for the margin bands. A band is shown as a band, never as the midpoint used for classification. */
export const U06_BAND_LABELS: Record<string, string> = {
  lt5: 'أقل من 5%',
  '5_10': 'من 5% إلى 10%',
  '10_20': 'من 10% إلى 20%',
  gt20: 'أكثر من 20%'
};

/** Minimum share of an axis's questions that must carry real (non-"unknown") answers for the axis to be scored. */
export const AXIS_MIN_EVALUATED_COVERAGE = 50;
/** Minimum number of scored axes (of 6) for an overall score to be shown. */
export const MIN_AXES_FOR_OVERALL = 3;

const UNKNOWN_ANSWERS = new Set([
  'unknown', 'dont_know', 'dont_know_exact', 'skip',
  'لا أعرف', 'لا اعرف', 'لا أعلم', 'لا اعلم', 'لا أحسبها بدقة', 'لا أملك هذا الرقم بدقة حالياً (تخطي)'
]);

/**
 * "I don't know" / skipped / punctuation-only answers are a DATA GAP for every question,
 * never a neutral performance signal.
 */
export function isUnknownAnswer(raw: unknown): boolean {
  const value = String(raw ?? '').trim();
  if (!value) return false;
  if (UNKNOWN_ANSWERS.has(value)) return true;
  return /^(?:[\p{P}\p{S}\s]|…)+$/u.test(value);
}

/**
 * Parse Question u06 (Net Margin):
 * Exact numeric input ALWAYS takes precedence over categorical approximations.
 * If user enters 12.7, returns 12.7.
 */
export function parseNetMargin(rawAnswer: unknown): { value: number | null; isExact: boolean; isGap: boolean } {
  if (rawAnswer === null || rawAnswer === undefined) {
    return { value: null, isExact: false, isGap: false };
  }

  const rawStr = String(rawAnswer).trim();
  if (rawStr === 'unknown' || rawStr === 'لا أحسبها بدقة') {
    return { value: null, isExact: false, isGap: true };
  }

  // Check if it matches categorical key
  if (rawStr in U06_CATEGORICAL_MAP) {
    return { value: U06_CATEGORICAL_MAP[rawStr], isExact: false, isGap: false };
  }

  // Attempt numeric parse
  const num = toFiniteNumber(rawAnswer);
  if (num !== null && num <= 100) {
    return { value: num, isExact: true, isGap: false };
  }

  return { value: null, isExact: false, isGap: false };
}

export const QUESTION_METRIC_LABELS: Record<string, string> = {
  u01: 'وضوح الرسالة البيعية بين الموظفين',
  u02: 'مخاطر الاعتماد على الموظف المحوري وتوثيق العمليات',
  u03: 'استقلالية الشركة التشغيلية عن المالك',
  u04: 'نظام التنبؤ المالي وتوقع الأرقام الشهرية',
  u05: 'مواءمة نمو الأرباح مع نمو الإيرادات',
  u06: 'هامش صافي الربح من الإيرادات',
  u08: 'الاعتماد على التمويل الخارجي لتغطية التشغيل',
  u09: 'معدل تحول العملاء المحتملين إلى مشترين',
  u10: 'معدل تكرار الشراء واحتفاظ العملاء',
  u11: 'تحديد العملاء الأكثر ربحية بالبيانات',
  u12: 'سرعة دورة المبيعات وإغلاق الصفقات',
  u13: 'متابعة أسباب تسرب العملاء الحقيقية',
  u15: 'مرونة وسرعة إطلاق الخدمات الجديدة',
  u16: 'وضوح مؤشرات الأداء اليومية الموثقة للفريق',
  u17: 'كفاءة التفويض وحجم إطفاء الحرائق للمؤسس',
  u18: 'توثيق العمليات والإجراءات القياسية',
  u19: 'معدل دوران الكفاءات واستقرار الفريق',
  u20: 'قوة الجذب التنافسي للعلامة التجارية',
  u22: 'المتابعة المنهجية لتحركات المنافسين',
  u23: 'استراتيجية التعامل مع حروب الأسعار',
  u24: 'الانتشار السوقي خارج دائرة المعارف',
  u25: 'وضوح الأهداف الرقمية الاستراتيجية السنوية',
  u26: 'شجاعة القرارات الاستثمارية والتوسعية',
  u27: 'القدرة على الاستثمار الذاتي في التطوير',
  u28: 'قياس تكلفة المشاكل المتراكمة غير المحلولة',
};

// 6 Core Diagnostic Dimensions strictly for Health Score (u31-u35 are financial inputs, kept separate)
export const DIAGNOSTIC_DIMENSIONS: Record<string, string[]> = {
  'بنية الشركة وهويتها': ['u01', 'u02', 'u03'],
  'الصحة المالية': ['u04', 'u05', 'u06', 'u08'],
  'العملاء والمبيعات': ['u09', 'u10', 'u11', 'u12', 'u13'],
  'الفريق والعمليات': ['u15', 'u16', 'u17', 'u18', 'u19'],
  'الموقع التنافسي': ['u20', 'u22', 'u23', 'u24'],
  // u30 is intentionally reflective/psychological. It remains in the question
  // catalog and session ledger, but must never affect scoring or diagnostic coverage.
  'الرؤية والنمو': ['u25', 'u26', 'u27', 'u28']
};

export const POSITIVE_SIGNALS: Record<string, string[] | 'slider_gte_60'> = {
  u01: ['always'],
  u02: ['week'],
  u03: ['yes_comfortable'],
  u04: ['expected'],
  u05: ['faster', 'same'],
  u06: ['gt20', '10_20'],
  u08: ['no'],
  u09: 'slider_gte_60',
  u10: ['gt60', '40_60'],
  u11: ['yes_clear'],
  u12: ['same_day', 'week'],
  u13: ['recent_known', 'never'],
  u15: ['week'],
  u16: ['yes_metrics'],
  u17: ['lt20'],
  u18: ['most'],
  u19: ['lt10'],
  u20: ['big_yes'],
  u22: ['systematic'],
  u23: ['raise_value', 'different_segment'],
  u24: ['strong'],
  u25: ['specific_number', 'percentage'],
  u26: ['none'],
  u27: ['gt10', '5_10'],
  u28: ['yes'],
};

export const NEGATIVE_SIGNALS: Record<string, string[] | 'slider_lt_30'> = {
  u01: ['never'],
  u02: ['cant', 'gt_month'],
  u03: ['no'],
  u04: ['negative_surprise'],
  u05: ['declined', 'slower'],
  u06: ['lt5'],
  u08: ['yes'],
  u09: 'slider_lt_30',
  u10: ['lt20'],
  u11: ['no'],
  u12: ['gt_month'],
  u13: ['recent_unknown'],
  u15: ['gt_month'],
  u16: ['no'],
  u17: ['gt40'],
  u18: ['none'],
  u19: ['gt25'],
  u20: ['no'],
  u22: ['no'],
  u23: ['lower_price'],
  u24: ['none'],
  u25: ['no_goal'],
  u26: ['pricing', 'expansion', 'hiring'],
  u27: ['zero', 'lt5'],
  u28: ['no'],
};

export const DATA_GAP_SIGNALS: Record<string, string[]> = {
  u04: ['unknown'],
  u06: ['unknown'],
  u10: ['unknown'],
  u11: ['guess'],
  u13: ['recent_unknown'],
  u15: ['unknown'],
  u19: ['unknown'],
  u23: ['dont_know'],
  u28: ['guess'],
};

/**
 * Extract typed financial inputs from universal answers and company intake data.
 */
export function extractFinancialInputs(
  universalAnswers: Record<string, any>,
  intakeAnswers?: Record<string, any>
): FinancialInputs {
  // u31: Monthly Revenue
  const rawRev = universalAnswers.u31 !== undefined ? universalAnswers.u31 : intakeAnswers?.monthlyRevenue;
  const monthlyRevenue = toFiniteNumber(rawRev);

  // u32: Monthly New Customers
  const rawCust = universalAnswers.u32 !== undefined ? universalAnswers.u32 : intakeAnswers?.monthlyNewCustomers;
  const monthlyNewCustomers = toFiniteNumber(rawCust);

  // u33: Customer Acquisition Cost (CAC)
  const rawCAC = universalAnswers.u33 !== undefined ? universalAnswers.u33 : intakeAnswers?.cac;
  const cac = toFiniteNumber(rawCAC);

  // u34: Average Order Value (AOV)
  const rawAOV = universalAnswers.rd03 ?? universalAnswers.u34 ?? intakeAnswers?.aov;
  const averageOrderValue = toFiniteNumber(rawAOV);

  // u35: Currency
  const rawCurr = universalAnswers.u35 || intakeAnswers?.currency || '';
  const currency = String(rawCurr).trim().toUpperCase();

  // u06: Net Margin
  const marginParsed = parseNetMargin(universalAnswers.u06);
  // Legacy bands can inform qualitative scoring, but cannot establish exact profit.
  const netMarginPct = marginParsed.isExact ? marginParsed.value : null;

  const monthlyVisitors = toFiniteNumber(universalAnswers.rd02 ?? intakeAnswers?.monthlyVisitors);

  const valueSource = (intakeAnswers?.valueModel || universalAnswers.valueModel || {}) as Record<string, any>;
  const valueModel = {
    mode: (valueSource.mode === 'incremental_sales_contribution' ? 'incremental_sales_contribution' : 'reducible_waste') as ValueModelMode,
    monthlyReducibleWaste: toFiniteNumber(valueSource.monthlyReducibleWaste),
    reductionLowPct: toFiniteNumber(valueSource.reductionLowPct),
    reductionHighPct: toFiniteNumber(valueSource.reductionHighPct),
    monthlyIncrementalSales: toFiniteNumber(valueSource.monthlyIncrementalSales),
    contributionMarginPct: toFiniteNumber(valueSource.contributionMarginPct),
    implementationCost: toFiniteNumber(valueSource.implementationCost),
    evaluationDays: toFiniteNumber(valueSource.evaluationDays)
  };

  return {
    monthlyRevenue: monthlyRevenue !== null && monthlyRevenue >= 0 ? monthlyRevenue : null,
    monthlyNewCustomers: monthlyNewCustomers !== null && monthlyNewCustomers >= 0 ? monthlyNewCustomers : null,
    cac: cac !== null && cac >= 0 ? cac : null,
    averageOrderValue: averageOrderValue !== null && averageOrderValue >= 0 ? averageOrderValue : null,
    currency,
    netMarginPct: netMarginPct !== null && netMarginPct <= 100 ? netMarginPct : null,
    monthlyVisitors: monthlyVisitors !== null && monthlyVisitors >= 0 ? monthlyVisitors : null,
    valueModel
  };
}

// A unit sensitivity describes the value of a one-point change at the declared volume.
export function calculateFinancialSensitivities(
  revenue: number | null | undefined,
  acquisitionSpend: number | null | undefined,
  visitors: number | null | undefined,
  orderValue: number | null | undefined
): FinancialSensitivities {
  if (revenue == null || !Number.isFinite(revenue) || revenue <= 0) return {};
  const result: FinancialSensitivities = { margin: revenue / 100 };
  if (acquisitionSpend != null && Number.isFinite(acquisitionSpend) && acquisitionSpend >= 0) {
    result.acquisition = acquisitionSpend / 100;
  }
  if (visitors != null && visitors >= 0 && orderValue != null && orderValue >= 0) {
    const amount = (visitors / 100) * orderValue;
    if (Number.isFinite(amount)) result.conversion = amount;
  }
  return result;
}

/**
 * Deterministic Financial Impact Calculator
 * Strictly follows mathematical formulas. If inputs are missing, outputs null.
 * 0 hallucinated benchmarks, 0 random ROI.
 */
export function calculateFinancialImpact(inputs: FinancialInputs): FinancialImpactResult {
  const { monthlyRevenue, monthlyNewCustomers, cac, averageOrderValue, currency, netMarginPct, monthlyVisitors } = inputs;
  const identifiedGaps: string[] = [];

  if (monthlyRevenue === null) identifiedGaps.push('الإيراد الشهري (u31)');
  if (netMarginPct === null) identifiedGaps.push('هامش صافي الربح (u06)');
  if (monthlyNewCustomers === null) identifiedGaps.push('عدد العملاء الجدد شهرياً (u32)');
  if (cac === null) identifiedGaps.push('تكلفة اكتساب العميل CAC (u33)');
  if (!currency) identifiedGaps.push('عملة البيانات المالية (u35)');

  const metrics: Record<string, FinancialMetric> = {};

  // 1. Monthly Revenue
  metrics.monthlyRevenue = {
    key: 'monthlyRevenue',
    label: 'الإيراد الشهري',
    value: monthlyRevenue,
    currency,
    isCalculated: false,
    evidenceInputs: ['u31']
  };

  // 2. Annual Revenue
  metrics.annualRevenue = {
    key: 'annualRevenue',
    label: 'الإيراد السنوي التقديري',
    value: monthlyRevenue !== null ? monthlyRevenue * 12 : null,
    currency,
    isCalculated: true,
    formula: 'monthlyRevenue * 12',
    evidenceInputs: ['u31']
  };

  // 3. Monthly Net Profit
  const monthlyNetProfit = (monthlyRevenue !== null && netMarginPct !== null)
    ? Math.round(monthlyRevenue * (netMarginPct / 100))
    : null;

  metrics.monthlyNetProfit = {
    key: 'monthlyNetProfit',
    label: 'صافي الربح الشهري',
    value: monthlyNetProfit,
    currency,
    isCalculated: true,
    formula: 'monthlyRevenue * (netMarginPct / 100)',
    evidenceInputs: ['u31', 'u06']
  };

  // 4. Annual Net Profit
  metrics.annualNetProfit = {
    key: 'annualNetProfit',
    label: 'صافي الربح السنوي',
    value: monthlyNetProfit !== null ? monthlyNetProfit * 12 : null,
    currency,
    isCalculated: true,
    formula: 'monthlyNetProfit * 12',
    evidenceInputs: ['u31', 'u06']
  };

  // 5. Monthly Acquisition Spend
  const monthlyAcquisitionSpend = (monthlyNewCustomers !== null && cac !== null)
    ? Math.round(monthlyNewCustomers * cac)
    : null;

  metrics.monthlyAcquisitionSpend = {
    key: 'monthlyAcquisitionSpend',
    label: 'الإنفاق الشهري على اكتساب العملاء',
    value: monthlyAcquisitionSpend,
    currency,
    isCalculated: true,
    formula: 'monthlyNewCustomers * cac',
    evidenceInputs: ['u32', 'u33']
  };

  // 6. Annual Acquisition Spend
  metrics.annualAcquisitionSpend = {
    key: 'annualAcquisitionSpend',
    label: 'الإنفاق السنوي على اكتساب العملاء',
    value: monthlyAcquisitionSpend !== null ? monthlyAcquisitionSpend * 12 : null,
    currency,
    isCalculated: true,
    formula: 'monthlyAcquisitionSpend * 12',
    evidenceInputs: ['u32', 'u33']
  };

  const sensitivities = calculateFinancialSensitivities(monthlyRevenue, monthlyAcquisitionSpend, monthlyVisitors, averageOrderValue);
  const isComputable = monthlyRevenue !== null && monthlyRevenue > 0 && netMarginPct !== null;
  const uncomputableReason = !isComputable
    ? 'الأثر المالي غير قابل للحساب بدقة من البيانات المتاحة لعدم اكتمال مدخلات الإيراد أو هامش الربح.'
    : undefined;

  const hasDeclaredValueInput = Boolean(inputs.valueModel && Object.entries(inputs.valueModel).some(([key, value]) => key !== 'mode' && value !== null && value !== undefined));
  const declaredValueModel = hasDeclaredValueInput
    ? calculateDeclaredValueModel({
        ...(inputs.valueModel as NonNullable<FinancialInputs['valueModel']>),
        currency,
        focusedWeekFee: currency === 'USD' ? FOCUSED_WEEK_USD : null,
        monthlyRetainerFee: currency === 'USD' ? MONTHLY_RETAINER_USD : null
      })
    : undefined;

  return {
    metrics,
    scenarios: [],
    sensitivities,
    identifiedGaps,
    isComputable,
    uncomputableReason,
    currency,
    declaredValueModel
  };
}

/**
 * Pure Deterministic Scoring Engine
 * Computes axis scores, health score, confidence, and financial impact.
 */
export function computeDeterministicScore(
  universalAnswers: Record<string, any>,
  intakeAnswers?: Record<string, any>
): DetailedScoreResult {
  const safeAnswers = universalAnswers || {};
  const axisScores: Record<string, number> = {};
  const axisDetails: Record<string, AxisDetail> = {};
  const allDataGaps: Array<{ questionId: string; label: string; dimension: string }> = [];
  const topWeaknesses: FindingEvidence[] = [];
  const topStrengths: FindingEvidence[] = [];

  for (const [dimension, qIds] of Object.entries(DIAGNOSTIC_DIMENSIONS)) {
    let answeredCount = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    let dataGapCount = 0;
    const dimensionGaps: string[] = [];
    const dimensionEvidence: FindingEvidence[] = [];

    qIds.forEach((qId) => {
      const rawAns = safeAnswers[qId];
      const ansStr = rawAns !== undefined && rawAns !== null ? String(rawAns).trim() : '';
      const metricLabel = QUESTION_METRIC_LABELS[qId] || qId;

      if (!ansStr && ansStr !== '0') {
        // Unanswered question
        return;
      }

      answeredCount++;

      // Special handling for u06: exact numeric or categorical
      if (qId === 'u06') {
        const marginParsed = parseNetMargin(rawAns);
        if (marginParsed.isGap) {
          dataGapCount++;
          const gapNotice = `عدم قياس أو توافر بيانات دقيقة حول: ${metricLabel}`;
          dimensionGaps.push(gapNotice);
          allDataGaps.push({ questionId: qId, label: metricLabel, dimension });
          dimensionEvidence.push({
            sourceQuestionId: qId,
            questionLabel: metricLabel,
            dimension,
            userAnswerRaw: rawAns,
            userAnswerParsed: null,
            signal: 'gap',
            findingDescription: gapNotice
          });
          return;
        }

        if (marginParsed.value !== null) {
          const val = marginParsed.value;
          // Exact numbers are shown as typed; a band is shown as a band (its midpoint is only a classification device).
          const shown = marginParsed.isExact ? `${val}%` : (U06_BAND_LABELS[String(rawAns).trim()] ?? 'نطاق مصرّح');
          const parsedForEvidence: string | number = marginParsed.isExact ? val : shown;
          if (val >= 15) {
            positiveCount++;
            const ev: FindingEvidence = {
              sourceQuestionId: qId,
              questionLabel: metricLabel,
              dimension,
              userAnswerRaw: rawAns,
              userAnswerParsed: parsedForEvidence,
              signal: 'positive',
              findingDescription: `هامش صافي ربح صحي (${shown})`
            };
            dimensionEvidence.push(ev);
            topStrengths.push(ev);
          } else if (val < 5) {
            negativeCount++;
            const ev: FindingEvidence = {
              sourceQuestionId: qId,
              questionLabel: metricLabel,
              dimension,
              userAnswerRaw: rawAns,
              userAnswerParsed: parsedForEvidence,
              signal: 'negative',
              findingDescription: `هامش صافي ربح حرج ومنخفض جداً (${shown})`
            };
            dimensionEvidence.push(ev);
            topWeaknesses.push(ev);
          } else {
            neutralCount++;
            dimensionEvidence.push({
              sourceQuestionId: qId,
              questionLabel: metricLabel,
              dimension,
              userAnswerRaw: rawAns,
              userAnswerParsed: parsedForEvidence,
              signal: 'neutral',
              findingDescription: `هامش صافي ربح متوسط (${shown})`
            });
          }
          return;
        }
      }

      // Check Data Gap Signals (a generic "unknown"/skip/punctuation-only answer is a gap for EVERY question)
      const isGapOption = isUnknownAnswer(ansStr) || DATA_GAP_SIGNALS[qId]?.includes(ansStr);
      if (isGapOption) {
        dataGapCount++;
        const gapNotice = `عدم قياس أو توافر بيانات دقيقة حول: ${metricLabel}`;
        dimensionGaps.push(gapNotice);
        allDataGaps.push({ questionId: qId, label: metricLabel, dimension });
        dimensionEvidence.push({
          sourceQuestionId: qId,
          questionLabel: metricLabel,
          dimension,
          userAnswerRaw: rawAns,
          userAnswerParsed: ansStr,
          signal: 'gap',
          findingDescription: gapNotice
        });
        return;
      }

      // Check Positive Signal
      const posRule = POSITIVE_SIGNALS[qId];
      let isPositive = false;
      if (posRule === 'slider_gte_60') {
        const num = toFiniteNumber(rawAns);
        isPositive = num !== null && num >= 60;
      } else if (Array.isArray(posRule)) {
        isPositive = posRule.includes(ansStr);
      }

      // Check Negative Signal
      const negRule = NEGATIVE_SIGNALS[qId];
      let isNegative = false;
      if (negRule === 'slider_lt_30') {
        const num = toFiniteNumber(rawAns);
        isNegative = num !== null && num < 30;
      } else if (Array.isArray(negRule)) {
        isNegative = negRule.includes(ansStr);
      }

      if (isPositive) {
        positiveCount++;
        const ev: FindingEvidence = {
          sourceQuestionId: qId,
          questionLabel: metricLabel,
          dimension,
          userAnswerRaw: rawAns,
          userAnswerParsed: ansStr,
          signal: 'positive',
          findingDescription: `مؤشر قوة إيجابي: ${metricLabel}`
        };
        dimensionEvidence.push(ev);
        topStrengths.push(ev);
      } else if (isNegative) {
        negativeCount++;
        const ev: FindingEvidence = {
          sourceQuestionId: qId,
          questionLabel: metricLabel,
          dimension,
          userAnswerRaw: rawAns,
          userAnswerParsed: ansStr,
          signal: 'negative',
          findingDescription: `نقطة ضعف تشغيلية: ${metricLabel}`
        };
        dimensionEvidence.push(ev);
        topWeaknesses.push(ev);
      } else {
        neutralCount++;
        dimensionEvidence.push({
          sourceQuestionId: qId,
          questionLabel: metricLabel,
          dimension,
          userAnswerRaw: rawAns,
          userAnswerParsed: ansStr,
          signal: 'neutral',
          findingDescription: `أداء معتدل: ${metricLabel}`
        });
      }
    });

    // Coverage counts only questions with REAL answers; "unknown"/skipped answers are data gaps, not coverage.
    const evaluatedCount = positiveCount + negativeCount + neutralCount;
    const coverage = Math.round((evaluatedCount / qIds.length) * 100);
    const axisScored = coverage >= AXIS_MIN_EVALUATED_COVERAGE && evaluatedCount > 0;

    // An axis without enough real answers gets NO score (0 is a placeholder, excluded from the overall).
    let score = 0;
    if (axisScored) {
      const calculatedPct = ((positiveCount * 1.0) + (neutralCount * 0.5)) / evaluatedCount;
      score = Math.round(calculatedPct * 100);
    }

    // Confidence determination
    let confidence: Confidence = 'منخفض';
    if (coverage >= 80 && dataGapCount === 0) {
      confidence = 'عالي';
    } else if (coverage >= 50 && dataGapCount <= 1) {
      confidence = 'متوسط';
    }

    // Status label
    let status: AxisStatus = 'يحتاج تحسين';
    if (!axisScored) {
      status = 'بيانات غير كافية';
    } else if (score >= 70) {
      status = 'مستقر';
    } else if (score < 45) {
      status = 'نقطة حرجة';
    }

    axisScores[dimension] = score;
    axisDetails[dimension] = {
      dimension,
      score,
      coverage,
      confidence,
      status,
      dataGaps: dimensionGaps,
      evidence: dimensionEvidence
    };
  }

  // Overall health score: average of SCORED axes only. Too few scored axes => not computed (never 0 or 50 by default).
  const scoredAxes = Object.values(axisDetails).filter(detail => detail.status !== 'بيانات غير كافية');
  const overallComputed = scoredAxes.length >= MIN_AXES_FOR_OVERALL;
  const overall = overallComputed
    ? Math.round(scoredAxes.reduce((sum, detail) => sum + detail.score, 0) / scoredAxes.length)
    : 0;

  // Clamped strictly between 0 and 100
  const clampedOverall = Math.max(0, Math.min(100, overall));

  const totalPossibleQuestions = Object.values(DIAGNOSTIC_DIMENSIONS).reduce((acc, q) => acc + q.length, 0);
  const totalAnswered = Object.keys(safeAnswers).filter((k) => {
    // Only count questions belonging to the diagnostic dimensions
    const isInDiagnostic = Object.values(DIAGNOSTIC_DIMENSIONS).some(arr => arr.includes(k));
    return isInDiagnostic && safeAnswers[k] !== undefined && safeAnswers[k] !== '' && !isUnknownAnswer(safeAnswers[k]);
  }).length;

  const overallCoverage = Math.round((totalAnswered / totalPossibleQuestions) * 100);

  let overallConfidence: Confidence = 'منخفض';
  if (!overallComputed) {
    overallConfidence = 'منخفض';
  } else if (overallCoverage >= 80 && allDataGaps.length <= 2) {
    overallConfidence = 'عالي';
  } else if (overallCoverage >= 50 && allDataGaps.length <= 4) {
    overallConfidence = 'متوسط';
  }

  // Compute Financial Impact independently
  const financialInputs = extractFinancialInputs(safeAnswers, intakeAnswers);
  const financialImpact = calculateFinancialImpact(financialInputs);

  // حارس عند الحدود: كل حقل في أدلة الاستبيان يُطبع لاحقاً في نص العميل
  // (اسم البُعد، عنوان السؤال، وصف الاستدلال)، فلا يُسمح لأي قيمة ناقصة
  // أو فاسدة أن تصل إلى العميل كسلسلة «undefined»، مهما كان مصدرها.
  const safeText = (value: unknown, fallback: string) =>
    typeof value === 'string' && value.trim() ? value : fallback;
  const normalizeEvidence = (e: typeof topWeaknesses[number]) => ({
    ...e,
    dimension: safeText(e.dimension, 'البُعد العام'),
    questionLabel: safeText(e.questionLabel, 'مؤشر تشغيلي'),
    findingDescription: safeText(e.findingDescription, 'مؤشر يحتاج استكمال بيانات')
  });

  return {
    overall: clampedOverall,
    overallComputed,
    overallConfidence,
    overallCoverage,
    axisScores,
    axisDetails,
    dataGaps: allDataGaps,
    topWeaknesses: topWeaknesses.map(normalizeEvidence),
    topStrengths: topStrengths.map(normalizeEvidence),
    financialImpact,
    engineMetadata: ENGINE_METADATA
  };
}

// Backward-compatibility alias
export const computeInstantScore = computeDeterministicScore;
