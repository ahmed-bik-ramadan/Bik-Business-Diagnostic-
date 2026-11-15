// src/data/diagnosticHypotheses.ts
// BIK Business Intelligence & Knowledge - Strategic Diagnostic Hypotheses
// Phase 2: Diagnostic Intelligence & Adaptive Taxonomy

import { DiagnosticHypothesis } from '../types/adaptiveDiagnostic';

/**
 * Standard Diagnostic Hypotheses across Strategic Dimensions
 * Each hypothesis defines:
 * - The signal trigger (observation that sparks the hypothesis)
 * - Supporting questions to gather root-cause evidence
 * - Validation questions to confirm or refute
 * - Confidence threshold for declaring a "Validated Finding"
 * - Conflict detection rules
 */
export const STRATEGIC_HYPOTHESES: DiagnosticHypothesis[] = [
  // 1. Key Person Dependency (بنية الشركة والاعتمادية)
  {
    id: 'hyp_key_person_vulnerability',
    dimension: 'بنية الشركة وهويتها',
    title: 'ارتهان تشغيلي بالمسؤول الأول وغياب التوثيق العملياتي المؤسسي',
    description: 'اعتماد الشركة المفرط على المؤسس أو موظف محوري واحد، مما يهدد استمرارية العمليات وقابلية التوسع عند غيابه.',
    trigger: {
      questionId: 'u02',
      operator: 'in',
      value: ['gt_month', 'cant']
    },
    supportingQuestions: ['u03', 'u12', 'u13', 'u28'],
    validationQuestions: ['u01', 'u22'],
    confidenceThreshold: 0.70,
    severity: 5,
    conflictRules: [
      {
        conflictingQuestionId: 'u13',
        operator: 'equals',
        expectedValue: 'fully_documented',
        reason: 'تعارض في الأدلة: تم الإبلاغ عن وجود أدلة توثيق كاملة للعمليات (SOPs) بينما أفاد المستجيب باستحالة تعويض الموظف المحوري.'
      }
    ]
  },

  // 2. Value Proposition Ambiguity (وضوح الهوية التنافسية)
  {
    id: 'hyp_weak_value_proposition',
    dimension: 'بنية الشركة وهويتها',
    title: 'تذبذب الرسالة البيعية وغياب وضوح القيمة المضافة لدى الفريق',
    description: 'عدم تطابق إجابات الموظفين عند شرح سبب الشراء من الشركة مقارنة بالمنافسين، مما يرفع تكلفة الإقناع ويضعف التحويل.',
    trigger: {
      questionId: 'u01',
      operator: 'in',
      value: ['never', 'sometimes']
    },
    supportingQuestions: ['u18', 'u19', 'u21'],
    validationQuestions: ['u29', 'u08'],
    confidenceThreshold: 0.65,
    severity: 4
  },

  // 3. Profit Margin Compression (الصحة المالية وهوامش الربح)
  {
    id: 'hyp_margin_compression_leak',
    dimension: 'الصحة المالية والتدفقات',
    title: 'تآكل الهوامش الربحية وتسرب القيمة رغم نمو الإيراد الظاهري',
    description: 'نمو الإيرادات دون زيادة موازية في صافي الربح نتيجة ارتفاع تكاليف التشغيل المباشرة أو التخفيضات غير المدروسة.',
    trigger: {
      questionId: 'u05',
      operator: 'in',
      value: ['slower', 'declined']
    },
    supportingQuestions: ['u06', 'u07', 'u10', 'u21'],
    validationQuestions: ['u04', 'u24'],
    confidenceThreshold: 0.72,
    severity: 5,
    conflictRules: [
      {
        conflictingQuestionId: 'u06',
        operator: 'equals',
        expectedValue: 'gt20',
        reason: 'تعارض في الأدلة: الإفادة بأن الأرباح تتراجع أسرع من الإيراد بينما تم تسجيل هامش ربح استثنائي يتجاوز 20%.'
      }
    ]
  },

  // 4. Cash Runway & Liquidity Risk (سيولة التدفقات النقدية)
  {
    id: 'hyp_cash_flow_liquidity_crunch',
    dimension: 'الصحة المالية والتدفقات',
    title: 'هشاشة السيولة النقدية وضيق هامش الأمان المالي الاحتياطي',
    description: 'رصيد السيولة المتاح لا يغطي سوى فترة وجيزة، مما يجعل الشركة عرضة لمخاطر حرجة عند أي تأخر في التحصيل أو انقطاع غير متوقع.',
    trigger: {
      questionId: 'u15',
      operator: 'in',
      value: ['lt1month', '1_2months']
    },
    supportingQuestions: ['u04', 'u16', 'u20'],
    validationQuestions: ['u05', 'u06'],
    confidenceThreshold: 0.75,
    severity: 5
  },

  // 5. Lead Conversion Leak (تسرب فرص البيع ومسار التحويل)
  {
    id: 'hyp_lead_conversion_leak',
    dimension: 'العملاء والمبيعات',
    title: 'اختناق مسار تحويل العملاء وتسرب الفرص البيعية (Leads) قبل الإغلاق',
    description: 'توليد عدد كبير من الاستفسارات دون ترجمتها إلى صفقات فعلية بسبب بطء المتابعة أو غياب آلية تأهيل متقدمة.',
    trigger: {
      questionId: 'u08',
      operator: 'in',
      value: ['high_leads_low_sales', 'unpredictable']
    },
    supportingQuestions: ['u11', 'u14', 'u21'],
    validationQuestions: ['u10', 'u23'],
    confidenceThreshold: 0.68,
    severity: 4
  },

  // 6. Pricing Power Deficit (التسعير وضعف القدرة التفاوضية)
  {
    id: 'hyp_pricing_power_deficit',
    dimension: 'الموقع التنافسي',
    title: 'فخ المنافسة السعرية والاضطرار الدائم للتنازل عن الهامش',
    description: 'الاعتماد على الخصومات السعرية لإغلاق الصفقات وضعف الدفاع عن القيمة، مما يقلص الربحية ويرهق التدفقات.',
    trigger: {
      questionId: 'u21',
      operator: 'in',
      value: ['frequent_discounts', 'deal_maker_discount']
    },
    supportingQuestions: ['u10', 'u18', 'u19', 'u24'],
    validationQuestions: ['u01', 'u05'],
    confidenceThreshold: 0.70,
    severity: 4,
    conflictRules: [
      {
        conflictingQuestionId: 'u10',
        operator: 'equals',
        expectedValue: 'price_maker',
        reason: 'تعارض في الأدلة: تم وصف الشركة بأنها صانعة أسعار وتملك قوة تسعيرية بينما يتم تقديم خصومات متكررة لإغلاق الصفقات.'
      }
    ]
  },

  // 7. Customer Concentration Risk (تركز الإيرادات لدى عملاء قلائل)
  {
    id: 'hyp_customer_concentration_peril',
    dimension: 'العملاء والمبيعات',
    title: 'خطر تركز الإيرادات والارتهان لعدد محدود من كبار العملاء',
    description: 'تمثيل عميل أو عميلين لأكثر من ثلث إيرادات الشركة، مما يجعل مستقبل المؤسسة رهناً بقرارات طرف خارجي وحيد.',
    trigger: {
      questionId: 'u20',
      operator: 'in',
      value: ['gt40pct_single', 'gt60pct_top3']
    },
    supportingQuestions: ['u08', 'u09', 'u23'],
    validationQuestions: ['u15', 'u16'],
    confidenceThreshold: 0.70,
    severity: 5
  },

  // 8. Operational Bottlenecks & Lack of SOPs (فوضى العمليات وغياب الأدلة)
  {
    id: 'hyp_operational_silo_chaos',
    dimension: 'الفريق والعمليات',
    title: 'اختناقات التسليم وتباين جودة المخرجات لغياب التوثيق القياسي (SOPs)',
    description: 'الاعتماد على التعليمات الشفهية والاجتهادات الفردية مما يتسبب في تكرار الأخطاء وتأخر تسليم الطلبات أو الخدمات.',
    trigger: {
      questionId: 'u25',
      operator: 'in',
      value: ['constant_bottlenecks', 'frequent_delays']
    },
    supportingQuestions: ['u13', 'u17', 'u22'],
    validationQuestions: ['u02', 'u14'],
    confidenceThreshold: 0.68,
    severity: 4
  },

  // 9. Centralized Decision Bottleneck (مركزية القرارات واختناق القيادة)
  {
    id: 'hyp_centralized_bottleneck',
    dimension: 'الفريق والعمليات',
    title: 'مركزية اتخاذ القرارات وتحول القيادة إلى عنق زجاجة تشغيلي',
    description: 'عجز الإدارة المتوسطة أو الموظفين عن التصرف في المشكلات اليومية دون موافقة الإدارة العليا، مما يبطئ الإنجاز.',
    trigger: {
      questionId: 'u28',
      operator: 'in',
      value: ['ceo_bottleneck', 'all_decisions_owner']
    },
    supportingQuestions: ['u12', 'u03', 'u13'],
    validationQuestions: ['u26', 'u27'],
    confidenceThreshold: 0.65,
    severity: 4
  },

  // 10. Customer Retention & Repeat Purchase Leak (تسرب العملاء وضعف الولاء)
  {
    id: 'hyp_customer_retention_leak',
    dimension: 'العملاء والمبيعات',
    title: 'ضعف معدل تكرار الشراء وتسرب العملاء بعد التجربة الأولى',
    description: 'غياب منظومة متابعة ورعاية العملاء بعد البيع مما يرفع تكلفة الاكتساب ويحرم الشركة من التدفق المتكرر.',
    trigger: {
      questionId: 'u09',
      operator: 'in',
      value: ['low_repeat', 'high_churn']
    },
    supportingQuestions: ['u14', 'u29', 'u08'],
    validationQuestions: ['u10', 'u21'],
    confidenceThreshold: 0.68,
    severity: 4
  }
];
