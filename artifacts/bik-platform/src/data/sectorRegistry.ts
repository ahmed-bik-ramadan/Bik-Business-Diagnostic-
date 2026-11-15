// src/data/sectorRegistry.ts
// BIK Business Intelligence & Knowledge - Configuration-Driven Sector Taxonomy Registry
// Phase 2: Diagnostic Intelligence & Adaptive Taxonomy

import { QuestionDefinition, DiagnosticHypothesis } from '../types/adaptiveDiagnostic';
import { sectorQuestions } from './sectorQuestions';
import { getEnrichedQuestion } from './questionClassification';
import { DEEP_TIER_QUESTIONS, UNIVERSAL_DEEP_QUESTIONS } from './sectorFinancialTaxonomy';
import { deltaQuestions } from './deltaQuestions';
import { isQuestionApplicable } from './subsectorGating';

export interface SectorTaxonomyConfig {
  sectorId: string;
  nameAr: string;
  dimensions: string[];
  questions: QuestionDefinition[];
  hypotheses: DiagnosticHypothesis[];
  financialMetrics?: string[];
  rules?: Record<string, any>;
}

// In-memory registry of sector taxonomy configurations
const sectorTaxonomyRegistry: Map<string, SectorTaxonomyConfig> = new Map();

export interface SectorValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateSectorTaxonomyConfig(config: SectorTaxonomyConfig): SectorValidationResult {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    return { isValid: false, errors: ['إعدادات القطاع غير متوفرة.'] };
  }

  if (!config.sectorId || !/^[a-z0-9_-]+$/.test(config.sectorId)) {
    errors.push(`معرف القطاع "${config?.sectorId}" غير صالح. يجب أن يتكون من أحرف إنجليزية وأرقام.`);
  }

  if (!config.nameAr || config.nameAr.trim().length < 2) {
    errors.push(`اسم القطاع بالعربية مطلوب.`);
  }

  if (!Array.isArray(config.dimensions) || config.dimensions.length === 0) {
    errors.push(`يجب تحديد أبعاد تشخيصية واحدة على الأقل للقطاع.`);
  }

  if (!Array.isArray(config.questions) || config.questions.length === 0) {
    errors.push(`يجب توفير قائمة أسئلة تشخيصية مكتملة للقطاع.`);
  } else {
    for (const q of config.questions) {
      const qText = (q as any).text || (q as any).question || (q as any).label;
      const qRole = (q as any).role || (q as any).diagnosticRole;
      if (!q.id || !qText || !q.dimension || !qRole) {
        errors.push(`السؤال ${q?.id || 'مجهول'} غير مكتمل الحقول (id, text, dimension, role).`);
      }
    }
  }

  if (!Array.isArray(config.hypotheses) || config.hypotheses.length === 0) {
    errors.push(`يجب توفير فرضيات تشخيصية قابلة للاختبار (hypotheses) لتشغيل المحرك التكيفي.`);
  } else {
    for (const hyp of config.hypotheses) {
      if (!hyp.id || !hyp.title || !hyp.trigger || !hyp.trigger.questionId) {
        errors.push(`الفرضية ${hyp?.id || 'مجهولة'} تفتقر إلى شرط التفعيل (trigger).`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Registers a new sector configuration.
 * Enforces Option A launch safety: registration requires complete diagnostic metadata.
 */
export function registerSectorTaxonomy(config: SectorTaxonomyConfig): void {
  const validation = validateSectorTaxonomyConfig(config);
  if (!validation.isValid) {
    const errorMsg = `[SECTOR REGISTRY REJECTED] فشل تسجيل القطاع "${config?.sectorId}": ${validation.errors.join('; ')}`;
    console.error(errorMsg);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(errorMsg);
    }
    return;
  }

  sectorTaxonomyRegistry.set(config.sectorId.toLowerCase(), config);
}

/**
 * Retrieves a sector configuration by ID.
 */
export function getSectorTaxonomy(sectorId?: string): SectorTaxonomyConfig | undefined {
  if (!sectorId) return undefined;
  return sectorTaxonomyRegistry.get(sectorId.toLowerCase());
}

/**
 * Retrieves all registered sector configurations.
 */
export function getAllRegisteredSectors(): SectorTaxonomyConfig[] {
  return Array.from(sectorTaxonomyRegistry.values());
}

/**
 * Retrieves questions for a specific sector, optionally combining deep tier and subsector delta questions.
 */
export function getSectorQuestions(
  sectorL1?: string,
  sectorL2?: string,
  includeDeep: boolean = false
): QuestionDefinition[] {
  if (!sectorL1) return [];
  
  const registered = getSectorTaxonomy(sectorL1);
  const baseQuestions: QuestionDefinition[] = registered
    ? [...registered.questions]
    : (sectorQuestions[sectorL1] || []).map(q => getEnrichedQuestion(q, sectorL1));

  if (includeDeep) {
    // Sectors with their own deep tier get it; every other sector still gets the universal
    // financial deep tier (revenue + receivables) so no sector leaves without a loss reading.
    const deepBank = DEEP_TIER_QUESTIONS[sectorL1] ?? UNIVERSAL_DEEP_QUESTIONS;
    const deepEnriched = deepBank.map(q => getEnrichedQuestion(q, sectorL1));
    baseQuestions.push(...deepEnriched);
  }

  // Sector-bank questions that are clearly irrelevant to the chosen sub-sector are never asked
  // (e.g. gym-membership questions for a sports agency). Sub-sector delta questions are always kept.
  const applicable = baseQuestions.filter(q => isQuestionApplicable(sectorL1, q.id, sectorL2));

  if (sectorL2 && deltaQuestions[sectorL2]) {
    const deltaEnriched = deltaQuestions[sectorL2].map(q => getEnrichedQuestion(q, sectorL1));
    applicable.push(...deltaEnriched);
  }

  return applicable;
}

/**
 * Retrieves diagnostic hypotheses for a given sector.
 */
export function getSectorHypotheses(sectorId?: string): DiagnosticHypothesis[] {
  if (!sectorId) return [];
  const registered = getSectorTaxonomy(sectorId);
  return registered?.hypotheses || [];
}

// ============================================================================
// Built-in Sector Taxonomies Initialization
// ============================================================================

// Healthcare
registerSectorTaxonomy({
  sectorId: 'healthcare',
  nameAr: 'الرعاية الصحية والعيادات',
  dimensions: ['الرعاية الصحية', 'تجربة المريض والتدفقات'],
  questions: (sectorQuestions['healthcare'] || []).map(q => getEnrichedQuestion(q, 'healthcare')),
  hypotheses: [
    {
      id: 'hyp_hc_no_show_leak',
      dimension: 'الرعاية الصحية',
      title: 'ارتفاع معدل إهدار المواعيد (No-Show) وغياب الأتمتة التأكيدية',
      description: 'إلغاء وتغيب المرضى عن المواعيد المحجوزة دون إعادة جدولة مما يعطل استغلال غرف الكشف ووقت الأطباء.',
      trigger: { questionId: 'h01', operator: 'gt', value: 20 },
      supportingQuestions: ['h03', 'h05', 'h12'],
      validationQuestions: ['h04', 'h10'],
      confidenceThreshold: 0.70,
      severity: 4
    },
    {
      id: 'hyp_hc_retention_gap',
      dimension: 'الرعاية الصحية',
      title: 'فجوة المتابعة العلاجية وضعف عودة المرضى للبرامج المستمرة',
      description: 'انقطاع المرضى بعد أول كشف دون استكمال بروتوكولات المتابعة الدورية أو الجلسات الوقائية.',
      trigger: { questionId: 'h04', operator: 'equals', value: 'high_low' },
      supportingQuestions: ['h03', 'h09', 'h11'],
      validationQuestions: ['h02', 'h06'],
      confidenceThreshold: 0.68,
      severity: 4
    }
  ],
  financialMetrics: ['avgVisitValue', 'noShowCost', 'monthlyPatientCount']
});

// Automotive
registerSectorTaxonomy({
  sectorId: 'automotive',
  nameAr: 'خدمات وصيانة السيارات',
  dimensions: ['السيارات', 'كفاءة الورشة والتوريد'],
  questions: (sectorQuestions['automotive'] || []).map(q => getEnrichedQuestion(q, 'automotive')),
  hypotheses: [
    {
      id: 'hyp_auto_rework_drain',
      dimension: 'السيارات',
      title: 'ارتفاع نسبة إعادة الإصلاح (Rework) وتراجع كفاءة فنيي الصيانة',
      description: 'عودة السيارات لنفس الأعطال بعد التسليم مما يستهلك ساعات تشغيل مجانية ويضر بسمعة المركز.',
      trigger: { questionId: 'a03', operator: 'gt', value: 10 },
      supportingQuestions: ['a04', 'a05', 'a10'],
      validationQuestions: ['a01', 'a02'],
      confidenceThreshold: 0.72,
      severity: 5
    },
    {
      id: 'hyp_auto_parts_delay',
      dimension: 'السيارات',
      title: 'اختناق الإمداد بقطع الغيار وتأخر مواعيد تسليم العملاء',
      description: 'تأخر تسليم السيارات بسبب انتظار القطع غير المتوفرة مما يعطل مساحات الرفع ويخفض دوران الورشة.',
      trigger: { questionId: 'a05', operator: 'equals', value: 'often' },
      supportingQuestions: ['a01', 'a04'],
      validationQuestions: ['a12', 'a02'],
      confidenceThreshold: 0.68,
      severity: 4
    }
  ],
  financialMetrics: ['technicianUtilization', 'reworkCost', 'avgInvoiceValue']
});

// Real Estate
registerSectorTaxonomy({
  sectorId: 'realestate',
  nameAr: 'التطوير والوساطة العقارية',
  dimensions: ['العقارات', 'إدارة دورة المبيعات والعملاء'],
  questions: (sectorQuestions['realestate'] || []).map(q => getEnrichedQuestion(q, 'realestate')),
  hypotheses: [
    {
      id: 'hyp_re_lead_pipeline_decay',
      dimension: 'العقارات',
      title: 'ضعف أتمتة إدارة علاقات العملاء (CRM) وتسرب الاستفسارات العقارية قبل المعاينة',
      description: 'الاعتماد على المتابعة اليدوية غير المنظمة مما يؤدي إلى فقدان العملاء المحتملين وتأخر المعاينات.',
      trigger: { questionId: 're09', operator: 'equals', value: 'nothing' },
      supportingQuestions: ['re01', 're02', 're10'],
      validationQuestions: ['re03', 're05'],
      confidenceThreshold: 0.70,
      severity: 4
    },
    {
      id: 'hyp_re_cancellation_spike',
      dimension: 'العقارات',
      title: 'ارتفاع نسبة إلغاء الحجوزات بعد دفع العربون لضعف بناء الثقة',
      description: 'تراجع المشترين بعد إبداء الرغبة الأولية بسبب مخاوف المطور أو تعثر ترتيبات التمويل.',
      trigger: { questionId: 're06', operator: 'gt', value: 15 },
      supportingQuestions: ['re10', 're08'],
      validationQuestions: ['re01', 're12'],
      confidenceThreshold: 0.70,
      severity: 5
    }
  ],
  financialMetrics: ['dealCost', 'conversionRate', 'brokerProductivity']
});

// Retail & E-commerce
registerSectorTaxonomy({
  sectorId: 'retail',
  nameAr: 'التجزئة والتجارة الإلكترونية',
  dimensions: ['التجزئة', 'المخزون وسلة المشتريات'],
  questions: (sectorQuestions['retail'] || []).map(q => getEnrichedQuestion(q, 'retail')),
  hypotheses: [
    {
      id: 'hyp_retail_cart_abandonment',
      dimension: 'التجزئة',
      title: 'ارتفاع نسبة التخلي عن سلة الشراء وضعف تحفيز الإتمام الفوري',
      description: 'مغادرة المتسوقين قبل إتمام الدفع بسبب تكاليف الشحن غير المتوقعة أو تعقيد واجهة الدفع.',
      trigger: { questionId: 'ret01', operator: 'gt', value: 65 },
      supportingQuestions: ['ret03', 'ret05'],
      validationQuestions: ['ret08', 'ret11'],
      confidenceThreshold: 0.70,
      severity: 4
    }
  ],
  financialMetrics: ['cartAbandonmentRate', 'inventoryTurnover', 'aov']
});

// Professional Services
registerSectorTaxonomy({
  sectorId: 'professional',
  nameAr: 'الاستشارات والخدمات المهنية',
  dimensions: ['الخدمات المهنية', 'استقرار العقود والإنتاجية'],
  questions: (sectorQuestions['professional'] || []).map(q => getEnrichedQuestion(q, 'professional')),
  hypotheses: [
    {
      id: 'hyp_prof_scope_creep',
      dimension: 'الخدمات المهنية',
      title: 'نزيف أرباح المشاريع بسبب تضخّم نطاق العمل (Scope Creep) غير المُحاسَب عليه',
      description: 'قبول طلبات إضافية من العملاء دون أوامر تغيير رسمية مما يستنزف هامش ربح المشروع.',
      trigger: { questionId: 'p06', operator: 'equals', value: 'no_control' },
      supportingQuestions: ['p01', 'p04', 'p09', 'p10'],
      validationQuestions: ['p03', 'p05'],
      confidenceThreshold: 0.72,
      severity: 5
    }
  ],
  financialMetrics: ['effectiveHourlyRate', 'retainerPercentage', 'cacRatio']
});
