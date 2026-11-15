/**
 * BIK V1 Intake Questions Metadata Dictionary
 * Translates intake questionnaire keys into full diagnostic question entries.
 */

export interface IntakeQuestionMeta {
  id: string;
  question: string;
  dimension: string;
  type: 'single_choice' | 'multi_choice' | 'slider' | 'text' | 'number';
  diagnosticRole: 'context' | 'financial' | 'baseline' | 'signal';
  unit?: string;
  options?: { value: string; label: string }[];
}

export const INTAKE_QUESTIONS_META: Record<string, IntakeQuestionMeta> = {
  country: {
    id: 'country',
    question: 'دولة المقر والنشاط',
    dimension: 'السياق العام والتأسيس',
    type: 'single_choice',
    diagnosticRole: 'context'
  },
  city: {
    id: 'city',
    question: 'مدينة النشاط الرئيسية',
    dimension: 'السياق العام والتأسيس',
    type: 'text',
    diagnosticRole: 'context'
  },
  companyAge: {
    id: 'companyAge',
    question: 'عمر الشركة في السوق',
    dimension: 'السياق العام والتأسيس',
    type: 'single_choice',
    diagnosticRole: 'context',
    options: [
      { value: 'أقل من سنة', label: 'أقل من سنة (مرحلة التأسيس المبكر)' },
      { value: '1-3 سنوات', label: '1–3 سنوات (مرحلة إثبات النموذج والنمو)' },
      { value: '3-7 سنوات', label: '3–7 سنوات (مرحلة الاستقرار والتوسع)' },
      { value: 'أكثر من 7 سنوات', label: 'أكثر من 7 سنوات (مؤسسة راسخة)' }
    ]
  },
  founderExperience: {
    id: 'founderExperience',
    question: 'خبرة المؤسس في مجال النشاط',
    dimension: 'القيادة والحوكمة',
    type: 'single_choice',
    diagnosticRole: 'baseline',
    options: [
      { value: 'أقل من 3', label: 'أقل من 3 سنوات' },
      { value: '3-7', label: '3 إلى 7 سنوات' },
      { value: '7-15', label: '7 إلى 15 سنة' },
      { value: 'أكثر من 15 سنة', label: 'أكثر من 15 سنة' }
    ]
  },
  businessMotivation: {
    id: 'businessMotivation',
    question: 'الدوافع الأساسية لاختيار هذا النشاط',
    dimension: 'الاستراتيجية والسوق',
    type: 'multi_choice',
    diagnosticRole: 'context'
  },
  modelsApplied: {
    id: 'modelsApplied',
    question: 'النماذج والأطر الإدارية والتخطيطية المطبقة قبل البدء',
    dimension: 'العمليات والإنتاجية',
    type: 'multi_choice',
    diagnosticRole: 'baseline'
  },
  modelSuccessRate: {
    id: 'modelSuccessRate',
    question: 'نسبة تطابق الواقع التشغيلي مع ما خُطط له مسبقاً',
    dimension: 'العمليات والإنتاجية',
    type: 'slider',
    unit: '%',
    diagnosticRole: 'signal'
  },
  breakEven: {
    id: 'breakEven',
    question: 'هل حققت الشركة نقطة التعادل المالي (Break Even)؟',
    dimension: 'المالية والتدفقات',
    type: 'single_choice',
    diagnosticRole: 'financial',
    options: [
      { value: 'نعم', label: 'نعم — الإيرادات تغطي التكاليف بالكامل' },
      { value: 'لا بعد', label: 'ليس بعد — لم نصل لنقطة التعادل بعد' }
    ]
  },
  breakEvenTime: {
    id: 'breakEvenTime',
    question: 'المدة المستغرقة للوصول إلى نقطة التعادل',
    dimension: 'المالية والتدفقات',
    type: 'single_choice',
    diagnosticRole: 'financial'
  },
  roi: {
    id: 'roi',
    question: 'معدل العائد على الاستثمار (ROI) منذ التأسيس',
    dimension: 'المالية والتدفقات',
    type: 'single_choice',
    diagnosticRole: 'financial'
  },
  hasDebt: {
    id: 'hasDebt',
    question: 'هل لدى شركتك قروض أو التزامات مالية خارجية قائمة؟',
    dimension: 'المالية والتدفقات',
    type: 'single_choice',
    diagnosticRole: 'financial',
    options: [
      { value: 'نعم', label: 'نعم — توجد قروض أو التزامات قائمة' },
      { value: 'لا', label: 'لا — لا توجد التزامات أو ديون خارجية' }
    ]
  },
  debtDuration: {
    id: 'debtDuration',
    question: 'إجمالي الديون القائمة كعدد أشهر من الإيرادات',
    dimension: 'المالية والتدفقات',
    type: 'single_choice',
    diagnosticRole: 'financial'
  },
  debtMonthlyPct: {
    id: 'debtMonthlyPct',
    question: 'أقساط الديون الشهرية كنسبة من الإيرادات الإجمالية',
    dimension: 'المالية والتدفقات',
    type: 'slider',
    unit: '%',
    diagnosticRole: 'financial'
  },
  fixedCostsPct: {
    id: 'fixedCostsPct',
    question: 'إجمالي التكاليف الثابتة الشهرية كنسبة من الإيرادات',
    dimension: 'المالية والتدفقات',
    type: 'slider',
    unit: '%',
    diagnosticRole: 'financial'
  },
  comp1: {
    id: 'comp1',
    question: 'المنافس الرئيسي الأول',
    dimension: 'الاستراتيجية والسوق',
    type: 'text',
    diagnosticRole: 'context'
  },
  comp2: {
    id: 'comp2',
    question: 'المنافس الرئيسي الثاني',
    dimension: 'الاستراتيجية والسوق',
    type: 'text',
    diagnosticRole: 'context'
  },
  comp3: {
    id: 'comp3',
    question: 'المنافس الرئيسي الثالث',
    dimension: 'الاستراتيجية والسوق',
    type: 'text',
    diagnosticRole: 'context'
  },
  differentiators: {
    id: 'differentiators',
    question: 'عوامل التميز التنافسي الرئيسية للشركة عن المنافسين',
    dimension: 'الاستراتيجية والسوق',
    type: 'multi_choice',
    diagnosticRole: 'signal'
  },
  geographicScope: {
    id: 'geographicScope',
    question: 'النطاق الجغرافي لعمليات الشركة',
    dimension: 'الاستراتيجية والسوق',
    type: 'single_choice',
    diagnosticRole: 'context'
  }
};
