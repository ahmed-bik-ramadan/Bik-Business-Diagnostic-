import { parseValueNumber } from '../services/valueModule/compute';
import type { UniversalQuestion } from './universalQuestions';

export interface BlindSpotFormula {
  id: string;
  name: string;
  kind: 'declaredLoss' | 'sensitivity';
  requiredDeepFields: string[];     // new deep-tier question ids
  requiredAnswerIds: string[];       // numeric answers outside the deep fields
  compute: (deep: Answers, answers: Answers) => number | null;
  monthlyOrOneTime: 'monthly';
}

export const DEEP_TIER_QUESTIONS: Record<string, UniversalQuestion[]> = {
  healthcare: [
    {
      id: 'hd01',
      dimension: 'التشخيص المالي العميق',
      question: 'متوسط قيمة الزيارة الواحدة (بعملة نشاطك)',
      type: 'text',
      placeholder: 'مثال: 350',
      toastKey: 'deep_hc_avg_visit'
    },
    {
      id: 'hd02',
      dimension: 'التشخيص المالي العميق',
      question: 'عدد المواعيد الشهرية التقريبي',
      type: 'text',
      placeholder: 'مثال: 400',
      toastKey: 'deep_hc_monthly_appts'
    },
  ],

  automotive: [
    {
      id: 'ad01',
      dimension: 'التشخيص المالي العميق',
      question: 'عدد السيارات المخدومة شهرياً تقريباً',
      type: 'text',
      placeholder: 'مثال: 120',
      toastKey: 'deep_auto_monthly_jobs'
    },
    {
      id: 'ad02',
      dimension: 'التشخيص المالي العميق',
      question: 'عدد الفنيين العاملين',
      type: 'text',
      placeholder: 'مثال: 4',
      toastKey: 'deep_auto_technicians'
    },
    {
      id: 'ad03',
      dimension: 'التشخيص المالي العميق',
      question: 'متوسط تكلفة الساعة الواحدة للفني (بعملة نشاطك)',
      type: 'text',
      placeholder: 'مثال: 60',
      toastKey: 'deep_auto_hourly_rate'
    },
  ],

  retail: [
    {
      id: 'rd01',
      dimension: 'التشخيص المالي العميق',
      question: 'إجمالي قيمة المخزون الحالي (بعملة نشاطك)',
      type: 'text',
      placeholder: 'مثال: 800000',
      toastKey: 'deep_retail_inventory'
    },
    {
      id: 'rd02',
      dimension: 'التشخيص المالي العميق',
      question: 'عدد الزوار الشهري التقريبي للمتجر أو الصفحة',
      type: 'text',
      placeholder: 'مثال: 2000',
      toastKey: 'deep_retail_visitors'
    },
    {
      id: 'rd03',
      dimension: 'التشخيص المالي العميق',
      question: 'متوسط قيمة الفاتورة الواحدة (بعملة نشاطك)',
      type: 'text',
      placeholder: 'مثال: 450',
      toastKey: 'deep_retail_avg_basket'
    },
  ],

  fnb: [
    {
      id: 'fd01',
      dimension: 'التشخيص المالي العميق',
      question: 'متوسط مبيعات اليوم الواحد تقريباً (بعملة نشاطك)',
      type: 'text',
      placeholder: 'مثال: 5000',
      toastKey: 'deep_fnb_daily_sales'
    },
    {
      id: 'fd02',
      dimension: 'التشخيص المالي العميق',
      question: 'متوسط تكلفة المواد الخام الشهرية تقريباً (بعملة نشاطك)',
      type: 'text',
      placeholder: 'مثال: 60000',
      toastKey: 'deep_fnb_material_cost'
    },
  ],

  realestate: [
    {
      id: 'red01',
      dimension: 'التشخيص المالي العميق',
      question: 'عدد الاستفسارات الشهرية التقريبي من العملاء المحتملين',
      type: 'text',
      placeholder: 'مثال: 120',
      toastKey: 'deep_re_monthly_leads'
    },
    {
      id: 'red02',
      dimension: 'التشخيص المالي العميق',
      question: 'متوسط قيمة عمولة الصفقة الواحدة (بعملة نشاطك)',
      type: 'text',
      placeholder: 'مثال: 5000',
      toastKey: 'deep_re_avg_commission'
    },
  ],

  professional: [
    {
      id: 'prd01',
      dimension: 'التشخيص المالي العميق',
      question: 'متوسط الإيراد الشهري التقريبي لنشاطك (بعملة نشاطك)',
      type: 'text',
      placeholder: 'مثال: 80000',
      toastKey: 'deep_prof_monthly_revenue'
    },
  ],

  import: [
    {
      id: 'imd01',
      dimension: 'التشخيص المالي العميق',
      question: 'إجمالي قيمة المخزون الحالي لديك (بعملة نشاطك)',
      type: 'text',
      placeholder: 'مثال: 1200000',
      toastKey: 'deep_import_inventory'
    },
    {
      id: 'imd02',
      dimension: 'التشخيص المالي العميق',
      question: 'متوسط قيمة مشتريات الاستيراد الشهرية تقريباً (بعملة نشاطك)',
      type: 'text',
      placeholder: 'مثال: 200000',
      toastKey: 'deep_import_monthly_purchases'
    },
  ],

  tech: [
    {
      id: 'ted01',
      dimension: 'التشخيص المالي العميق',
      question: 'الإيراد الشهري المتكرر التقريبي (اشتراكات وعقود، بعملة نشاطك)',
      type: 'text',
      placeholder: 'مثال: 40000',
      toastKey: 'deep_tech_mrr'
    },
  ],

  construction: [
    {
      id: 'cod01',
      dimension: 'التشخيص المالي العميق',
      question: 'متوسط قيمة المشروع الجاري الواحد تقريباً (بعملة نشاطك)',
      type: 'text',
      placeholder: 'مثال: 500000',
      toastKey: 'deep_construction_project_value'
    },
    {
      id: 'cod02',
      dimension: 'التشخيص المالي العميق',
      question: 'عدد المشاريع الجارية حالياً تقريباً',
      type: 'text',
      placeholder: 'مثال: 3',
      toastKey: 'deep_construction_active_projects'
    },
  ],
};

/**
 * Deep tier for every sector without its own set: two accounting-grounded questions
 * (revenue and uncollected receivables).
 */
export const UNIVERSAL_DEEP_QUESTIONS: UniversalQuestion[] = [
  {
    id: 'ud01',
    dimension: 'التشخيص المالي العميق',
    question: 'متوسط الإيراد الشهري التقريبي لنشاطك (بعملة نشاطك)',
    type: 'text',
    placeholder: 'مثال: 100000',
    toastKey: 'deep_universal_monthly_revenue'
  },
  {
    id: 'ud02',
    dimension: 'التشخيص المالي العميق',
    question: 'قيمة المبالغ المستحقة لديك من عملاء ولم تُحصّل بعد (ذمم مدينة، بعملة نشاطك)',
    type: 'text',
    placeholder: 'مثال: 50000',
    toastKey: 'deep_universal_receivables'
  },
];

type Answers = Readonly<Record<string, unknown>>;
type NumericAnswers = Record<string, number>;

function positiveFields(answers: Answers, fields: readonly string[], maximum = Infinity): NumericAnswers | null {
  const values: NumericAnswers = {};
  for (const field of fields) {
    const value = parseValueNumber(answers[field]);
    if (value === null || value <= 0 || value > maximum) return null;
    values[field] = value;
  }
  return values;
}

function declaredLoss(
  id: string, name: string, requiredDeepFields: string[], requiredAnswerIds: string[],
  calculate: (deep: NumericAnswers, percentages: NumericAnswers) => number
): BlindSpotFormula {
  return {
    id, name, kind: 'declaredLoss', requiredDeepFields, requiredAnswerIds, monthlyOrOneTime: 'monthly',
    compute(deep, answers) {
      const bases = positiveFields(deep, requiredDeepFields);
      const rates = positiveFields(answers, requiredAnswerIds, 100);
      if (!bases || !rates) return null;
      const amount = Math.round(calculate(bases, rates));
      return Number.isFinite(amount) && amount > 0 ? amount : null;
    }
  };
}

// An empty field list means the questionnaire does not supply a monetary base for this subject.
function sensitivity(id: string, name: string, baseFields: string[], answerFields: string[] = []): BlindSpotFormula {
  return {
    id, name, kind: 'sensitivity', requiredDeepFields: baseFields, requiredAnswerIds: answerFields, monthlyOrOneTime: 'monthly',
    compute(deep, answers) {
      if (baseFields.length + answerFields.length === 0) return null;
      const bases = positiveFields(deep, baseFields);
      const otherBases = positiveFields(answers, answerFields);
      if (!bases || !otherBases) return null;
      const base = [...Object.values(bases), ...Object.values(otherBases)].reduce((product, value) => product * value, 1);
      const amount = base / 100;
      return Number.isFinite(amount) && amount > 0 ? amount : null;
    }
  };
}

export const BLIND_SPOT_FORMULAS: Record<string, BlindSpotFormula[]> = {
  healthcare: [
    declaredLoss('hc_noshow', 'خسارة المواعيد الفارغة (No-Show)', ['hd01', 'hd02'], ['h01'],
      (deep, rates) => deep.hd01 * deep.hd02 * (rates.h01 / 100)),
    sensitivity('hc_followup_gap', 'فجوة متابعة المرضى', ['hd01', 'hd02'])
  ],
  automotive: [
    // Invoice bands do not give a rework cost. Hourly rates do not give monthly paid hours.
    sensitivity('auto_rework', 'خسارة إعادة العمل (Rework)', []),
    sensitivity('auto_idle_capacity', 'الطاقة الفنية الضائعة', [])
  ],
  retail: [
    sensitivity('retail_dead_stock', 'رأس المال المجمَّد في المخزون الراكد', ['rd01']),
    sensitivity('retail_conversion_gap', 'فجوة معدل التحويل', ['rd02', 'rd03'])
  ],
  fnb: [
    declaredLoss('fnb_food_waste', 'الهدر الغذائي اليومي على المواد الخام', ['fd02'], ['f04'],
      (deep, rates) => deep.fd02 * (rates.f04 / 100)),
    sensitivity('fnb_menu_engineering_gap', 'تآكل هامش الربح بفعل قائمة غير مُسعَّرة', [], ['u31'])
  ],
  realestate: [
    declaredLoss('re_cancellation_leak', 'خسارة الصفقات الملغاة بعد وصولها إلى المرحلة النهائية',
      ['red01', 'red02'], ['re01', 're06'],
      (deep, rates) => deep.red01 * (rates.re01 / 100) * (rates.re06 / 100) * deep.red02),
    sensitivity('re_conversion_gap', 'فجوة معدل تحويل الاستفسارات إلى صفقات', ['red01', 'red02'])
  ],
  professional: [
    sensitivity('prof_scope_creep_leak', 'تسرُّب إيراد بفعل نطاق عمل غير موثَّق', ['prd01']),
    // A share of team time cannot be valued from service revenue without a labour cost.
    sensitivity('prof_automation_leak', 'تكلفة وقت الفريق على مهام قابلة للأتمتة', [])
  ],
  import: [
    sensitivity('import_dead_stock_capital', 'رأس مال مجمَّد في مخزون بطيء الدوران', ['imd01']),
    sensitivity('import_forex_leak', 'تكلفة تقلب العملة على مشتريات غير محوَّطة', ['imd02'])
  ],
  tech: [
    declaredLoss('tech_churn_leak', 'إيراد متكرر يتسرب مع نسبة انسحاب العملاء', ['ted01'], ['t02'],
      (deep, rates) => deep.ted01 * (rates.t02 / 100)),
    // The infrastructure percentage in t12 is a share of total revenue.
    sensitivity('tech_infra_excess', 'زيادة تكلفة البنية التقنية عن الحد الصحي', [], ['u31'])
  ],
  construction: [
    // Whole contracts in progress do not establish monthly project costs or monthly change-order value.
    sensitivity('const_cost_overrun', 'تجاوزات التكلفة على المشاريع الجارية', []),
    sensitivity('const_change_order_leak', 'تسريبات أوامر تغيير غير موثَّقة', [])
  ],
  universal: [
    sensitivity('univ_collection_leak', 'التكلفة الشهرية لذمم مدينة لم تُحصّل', ['ud02'])
  ]
};
