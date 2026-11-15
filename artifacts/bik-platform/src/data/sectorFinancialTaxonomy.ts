import { UniversalQuestion } from './universalQuestions';

export interface BlindSpotFormula {
  id: string;
  name: string;
  requiredDeepFields: string[];     // new deep-tier question ids
  requiredAnswerIds: string[];       // existing sector question ids used
  compute: (deep: Record<string, number>, answers: Record<string, any>) => number;
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
 * (revenue and uncollected receivables) so no sector leaves the report without a loss reading.
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

/** Monthly carrying cost of uncollected receivables (financing, ageing and collection effort). */
export const UNIV_RECEIVABLES_CARRY_FACTOR = 0.10;

export const BLIND_SPOT_FORMULAS: Record<string, BlindSpotFormula[]> = {
  healthcare: [
    {
      id: 'hc_noshow',
      name: 'خسارة المواعيد الفارغة (No-Show)',
      requiredDeepFields: ['hd01', 'hd02'],
      requiredAnswerIds: ['h01'],
      // h01 is a 0-100% percentage slider
      compute: (deep, answers) => {
        const avgVisit = Number(deep.hd01) || 0;
        const monthlyAppts = Number(deep.hd02) || 0;
        const noShowRatio = (Number(answers.h01) || 0) / 100;
        return Math.round(avgVisit * monthlyAppts * noShowRatio);
      },
      monthlyOrOneTime: 'monthly'
    },
    {
      id: 'hc_followup_gap',
      name: 'فجوة متابعة المرضى',
      requiredDeepFields: ['hd01', 'hd02'],
      requiredAnswerIds: ['h04'],
      compute: (deep, answers) => {
        const factorMap: Record<string, number> = {
          high_commit: 0.02,
          high_low: 0.15,
          low: 0.05
        };
        const factor = factorMap[answers.h04] ?? 0.05;
        const avgVisit = Number(deep.hd01) || 0;
        const monthlyAppts = Number(deep.hd02) || 0;
        return Math.round(avgVisit * monthlyAppts * factor);
      },
      monthlyOrOneTime: 'monthly'
    }
  ],

  automotive: [
    {
      id: 'auto_rework',
      name: 'خسارة إعادة العمل (Rework)',
      requiredDeepFields: ['ad01'],
      requiredAnswerIds: ['a03', 'a09'],
      compute: (deep, answers) => {
        const ticketMidpoint: Record<string, number> = {
          lt500: 350,
          '500_1500': 1000,
          '1500_3000': 2250,
          gt3000: 4000
        };
        const avgTicket = ticketMidpoint[answers.a09] ?? 1000;
        const monthlyJobs = Number(deep.ad01) || 0;
        const reworkRatio = (Number(answers.a03) || 0) / 100;
        return Math.round(avgTicket * monthlyJobs * reworkRatio);
      },
      monthlyOrOneTime: 'monthly'
    },
    {
      id: 'auto_idle_capacity',
      name: 'الطاقة الفنية الضائعة',
      requiredDeepFields: ['ad02', 'ad03'],
      requiredAnswerIds: ['a04'],
      compute: (deep, answers) => {
        const idleFactorMap: Record<string, number> = {
          gt80: 0.10,
          '60_80': 0.30,
          lt60: 0.50
        };
        const idleFactor = idleFactorMap[answers.a04] ?? 0.30;
        const technicians = Number(deep.ad02) || 0;
        const hourlyRate = Number(deep.ad03) || 0;
        const WORKING_HOURS_PER_MONTH = 208; // 8h x 26 days
        return Math.round(technicians * WORKING_HOURS_PER_MONTH * hourlyRate * idleFactor);
      },
      monthlyOrOneTime: 'monthly'
    }
  ],

  retail: [
    {
      id: 'retail_dead_stock',
      name: 'رأس المال المجمَّد في المخزون الراكد',
      requiredDeepFields: ['rd01'],
      requiredAnswerIds: ['rt03'],
      compute: (deep, answers) => {
        const deadStockFactorMap: Record<string, number> = {
          proactive: 0.05,
          discount: 0.15,
          no_plan: 0.30
        };
        const factor = deadStockFactorMap[answers.rt03] ?? 0.15;
        const totalInventory = Number(deep.rd01) || 0;
        return Math.round(totalInventory * factor);
      },
      monthlyOrOneTime: 'monthly'
    },
    {
      id: 'retail_conversion_gap',
      name: 'فجوة معدل التحويل',
      requiredDeepFields: ['rd02', 'rd03'],
      requiredAnswerIds: ['rt01'],
      compute: (deep, answers) => {
        if (answers.rt01 === 'gt30') return 0;
        const visitors = Number(deep.rd02) || 0;
        const avgBasket = Number(deep.rd03) || 0;
        const GAP_ASSUMPTION = 0.10; // standard 10pp improvement headroom
        return Math.round(visitors * avgBasket * GAP_ASSUMPTION);
      },
      monthlyOrOneTime: 'monthly'
    }
  ],

  fnb: [
    {
      // Accounting basis: food-cost control. The declared waste slider on the
      // raw-material cost is the client's own stated leak, month after month.
      id: 'fnb_food_waste',
      name: 'الهدر الغذائي اليومي على المواد الخام',
      requiredDeepFields: ['fd02'],
      requiredAnswerIds: ['f04'],
      compute: (deep, answers) => {
        const materialCost = Number(deep.fd02) || 0;
        const wastePct = Number(answers.f04) || 0;
        return Math.round(materialCost * (wastePct / 100));
      },
      monthlyOrOneTime: 'monthly'
    },
    {
      // Accounting basis: menu engineering. Prices unchanged while costs move erode
      // the gross margin; the headroom below is a conservative documented assumption.
      id: 'fnb_menu_engineering_gap',
      name: 'تآكل هامش الربح بفعل قائمة غير مُسعَّرة',
      requiredDeepFields: ['fd01'],
      requiredAnswerIds: ['f05', 'f08'],
      compute: (deep, answers) => {
        if (answers.f08 === 'yes_both') return 0; // margins tracked item by item
        const dailySales = Number(deep.fd01) || 0;
        if (answers.f05 === 'no') return Math.round(dailySales * 30 * 0.05);
        if (answers.f05 === 'yes_reactive') return Math.round(dailySales * 30 * 0.03);
        return 0;
      },
      monthlyOrOneTime: 'monthly'
    }
  ],

  realestate: [
    {
      // Accounting basis: pipeline leakage. Monthly deals from the declared lead count
      // and conversion slider, times the declared post-earnest-money cancellation rate.
      id: 're_cancellation_leak',
      name: 'خسارة الصفقات الملغاة بعد وصولها إلى المرحلة النهائية',
      requiredDeepFields: ['red01', 'red02'],
      requiredAnswerIds: ['re01', 're06'],
      compute: (deep, answers) => {
        const monthlyLeads = Number(deep.red01) || 0;
        const commission = Number(deep.red02) || 0;
        const conversionPct = Number(answers.re01) || 0;
        const cancelPct = Number(answers.re06) || 0;
        const monthlyDeals = monthlyLeads * (conversionPct / 100);
        return Math.round(monthlyDeals * (cancelPct / 100) * commission);
      },
      monthlyOrOneTime: 'monthly'
    },
    {
      // Accounting basis: conversion benchmark. A 10% lead-to-deal rate is the
      // documented conservative headroom; anything declared below it is a leak.
      id: 're_conversion_gap',
      name: 'فجوة معدل تحويل الاستفسارات إلى صفقات',
      requiredDeepFields: ['red01', 'red02'],
      requiredAnswerIds: ['re01'],
      compute: (deep, answers) => {
        const monthlyLeads = Number(deep.red01) || 0;
        const commission = Number(deep.red02) || 0;
        const conversionPct = Number(answers.re01) || 0;
        const BENCHMARK_PCT = 10;
        if (conversionPct >= BENCHMARK_PCT) return 0;
        return Math.round(monthlyLeads * ((BENCHMARK_PCT - conversionPct) / 100) * commission);
      },
      monthlyOrOneTime: 'monthly'
    }
  ],

  professional: [
    {
      // Accounting basis: revenue leakage. Written-but-uncontrolled scope creep
      // leaks about a tenth of monthly revenue; a documented conservative factor.
      id: 'prof_scope_creep_leak',
      name: 'تسرُّب إيراد بفعل نطاق عمل غير موثَّق',
      requiredDeepFields: ['prd01'],
      requiredAnswerIds: ['p06'],
      compute: (deep, answers) => {
        const monthlyRevenue = Number(deep.prd01) || 0;
        const factorMap: Record<string, number> = {
          verbal: 0.10,
          no_control: 0.10,
          template: 0.05,
          contract: 0
        };
        return Math.round(monthlyRevenue * (factorMap[answers.p06] ?? 0.05));
      },
      monthlyOrOneTime: 'monthly'
    },
    {
      // Accounting basis: capacity cost. Time on automatable tasks has a labour cost;
      // only 30% of it is realistically recoverable, a documented conservative share.
      id: 'prof_automation_leak',
      name: 'تكلفة وقت الفريق على مهام قابلة للأتمتة',
      requiredDeepFields: ['prd01'],
      requiredAnswerIds: ['p04'],
      compute: (deep, answers) => {
        const monthlyRevenue = Number(deep.prd01) || 0;
        const automatablePct = Number(answers.p04) || 0;
        const RECOVERABLE_SHARE = 0.30;
        return Math.round(monthlyRevenue * (automatablePct / 100) * RECOVERABLE_SHARE);
      },
      monthlyOrOneTime: 'monthly'
    }
  ],

  import: [
    {
      // Accounting basis: working-capital management. Stagnant inventory freezes
      // capital; the factor follows the client's own declared turnover health.
      id: 'import_dead_stock_capital',
      name: 'رأس مال مجمَّد في مخزون بطيء الدوران',
      requiredDeepFields: ['imd01'],
      requiredAnswerIds: ['im01'],
      compute: (deep, answers) => {
        const inventory = Number(deep.imd01) || 0;
        const factorMap: Record<string, number> = {
          high_turnover: 0,
          medium: 0.175,   // midpoint of the declared 10-25% stagnant band
          low_turnover: 0.30
        };
        return Math.round(inventory * (factorMap[answers.im01] ?? 0.175));
      },
      monthlyOrOneTime: 'monthly'
    },
    {
      // Accounting basis: FX exposure. An unhedged import cycle carries a
      // documented conservative monthly exposure factor on declared purchases.
      id: 'import_forex_leak',
      name: 'تكلفة تقلب العملة على مشتريات غير محوَّطة',
      requiredDeepFields: ['imd02'],
      requiredAnswerIds: ['im04'],
      compute: (deep, answers) => {
        const monthlyPurchases = Number(deep.imd02) || 0;
        if (answers.im04 === 'hedge' || answers.im04 === 'supplier_currency') return 0;
        const UNHEDGED_FX_FACTOR = 0.05;
        return Math.round(monthlyPurchases * UNHEDGED_FX_FACTOR);
      },
      monthlyOrOneTime: 'monthly'
    }
  ],

  tech: [
    {
      // Accounting identity: churn x MRR = recurring revenue lost per month.
      // No assumption beyond the client's own two declared figures.
      id: 'tech_churn_leak',
      name: 'إيراد متكرر يتسرب مع نسبة انسحاب العملاء',
      requiredDeepFields: ['ted01'],
      requiredAnswerIds: ['t02'],
      compute: (deep, answers) => {
        const mrr = Number(deep.ted01) || 0;
        const churnPct = Number(answers.t02) || 0;
        return Math.round(mrr * (churnPct / 100));
      },
      monthlyOrOneTime: 'monthly'
    },
    {
      // Accounting basis: cost-structure health. Infrastructure spend above 30%
      // of revenue eats the gross margin; the excess is the declared leak.
      id: 'tech_infra_excess',
      name: 'زيادة تكلفة البنية التقنية عن الحد الصحي',
      requiredDeepFields: ['ted01'],
      requiredAnswerIds: ['t12'],
      compute: (deep, answers) => {
        const mrr = Number(deep.ted01) || 0;
        const infraPct = Number(answers.t12) || 0;
        const HEALTHY_CAP_PCT = 30;
        if (infraPct <= HEALTHY_CAP_PCT) return 0;
        return Math.round(mrr * ((infraPct - HEALTHY_CAP_PCT) / 100));
      },
      monthlyOrOneTime: 'monthly'
    }
  ],

  construction: [
    {
      // Accounting basis: job costing. Declared share of projects over budget,
      // times a documented average overrun depth on the affected projects.
      id: 'const_cost_overrun',
      name: 'تجاوزات التكلفة على المشاريع الجارية',
      requiredDeepFields: ['cod01', 'cod02'],
      requiredAnswerIds: ['c02'],
      compute: (deep, answers) => {
        const projectValue = Number(deep.cod01) || 0;
        const activeProjects = Number(deep.cod02) || 0;
        const overrunPct = Number(answers.c02) || 0;
        const OVERRUN_DEPTH = 0.15; // average depth of an overrun on affected projects
        return Math.round(projectValue * activeProjects * (overrunPct / 100) * OVERRUN_DEPTH);
      },
      monthlyOrOneTime: 'monthly'
    },
    {
      // Accounting basis: change-order control. Verbal change orders leak about
      // 8% of contract value — a documented conservative industry factor.
      id: 'const_change_order_leak',
      name: 'تسريبات أوامر تغيير غير موثَّقة',
      requiredDeepFields: ['cod01', 'cod02'],
      requiredAnswerIds: ['c08'],
      compute: (deep, answers) => {
        if (answers.c08 !== 'verbal') return 0;
        const projectValue = Number(deep.cod01) || 0;
        const activeProjects = Number(deep.cod02) || 0;
        const CHANGE_ORDER_LEAK = 0.08;
        return Math.round(projectValue * activeProjects * CHANGE_ORDER_LEAK);
      },
      monthlyOrOneTime: 'monthly'
    }
  ],

  // Fallback for every sector without its own formulas: the receivables carrying
  // cost, computed on the client's declared uncollected balance alone.
  universal: [
    {
      id: 'univ_collection_leak',
      name: 'التكلفة الشهرية لذمم مدينة لم تُحصّل',
      requiredDeepFields: ['ud02'],
      requiredAnswerIds: [],
      compute: (deep) => {
        const receivables = Number(deep.ud02) || 0;
        return Math.round(receivables * UNIV_RECEIVABLES_CARRY_FACTOR);
      },
      monthlyOrOneTime: 'monthly'
    }
  ],
};
