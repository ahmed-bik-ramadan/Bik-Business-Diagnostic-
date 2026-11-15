export type KnowledgeEvidenceStatus = 'OBSERVED' | 'HYPOTHESIS' | 'INSUFFICIENT_DATA';

export interface ActiveKnowledgeRule {
  id: string;
  sourceRecordId: string;
  sourceScope: string;
  sectorL1: string;
  path: string;
  questionIds: string[];
  hypothesis: string;
  serviceBoundary: string;
  evaluate: (answers: Record<string, any>, intake: Record<string, any>) => KnowledgeEvidenceStatus;
}

const answered = (answers: Record<string, any>, key: string) => answers[key] !== undefined && answers[key] !== null && answers[key] !== '';

/**
 * This is intentionally a curated activation layer, not an import of the generated archive.
 * Every active rule names its source record, scope, questions, lifecycle status, and service boundary.
 */
export const ACTIVE_KNOWLEDGE_RULES: ActiveKnowledgeRule[] = [
  {
    id: 'retail-margin-erosion-path',
    sourceRecordId: 'RT-MARGIN-EROS',
    sourceScope: 'generated knowledge archive; retail; sector context only',
    sectorL1: 'retail',
    path: 'هامش التجزئة',
    questionIds: ['u05', 'u06', 'u31'],
    hypothesis: 'قد يكون تآكل الهامش مرتبطاً بفجوة التسعير أو تكلفة المنتج، وليس نقص الطلب وحده.',
    serviceBoundary: 'لا تُرشح خدمة إنقاذ الربحية إلا عند وجود إشارة مالية من إجابات النشاط؛ المصدر القطاعي وحده لا يثبت المشكلة.',
    evaluate: (answers) => {
      if (!answered(answers, 'u06') && !answered(answers, 'u05')) return 'INSUFFICIENT_DATA';
      const margin = Number(answers.u06);
      if (answers.u05 === 'declined' || answers.u05 === 'slower' || (Number.isFinite(margin) && margin <= 10)) return 'OBSERVED';
      return 'HYPOTHESIS';
    }
  },
  {
    id: 'retail-conversion-path',
    sourceRecordId: 'RT-CAC-LTV',
    sourceScope: 'generated knowledge archive; retail; sector context only',
    sectorL1: 'retail',
    path: 'تحويل الزيارة إلى شراء',
    questionIds: ['u09', 'u10', 'u12'],
    hypothesis: 'قد تكون المشكلة في التحويل أو تكرار الشراء، لا في زيادة الإنفاق التسويقي فقط.',
    serviceBoundary: 'لا تُرشح هندسة العرض والرسالة إلا إذا دعمتها إجابة مبيعات أو رسالة فعلية.',
    evaluate: (answers) => {
      if (!answered(answers, 'u09') && !answered(answers, 'u10') && !answered(answers, 'u12')) return 'INSUFFICIENT_DATA';
      const conversion = Number(answers.u09);
      if (Number.isFinite(conversion) && conversion < 30) return 'OBSERVED';
      if (answers.u10 === 'lt20' || answers.u12 === 'gt_month') return 'OBSERVED';
      return 'HYPOTHESIS';
    }
  },
  {
    id: 'professional-scope-path',
    sourceRecordId: 'PS-SCOPE-001',
    sourceScope: 'curated implementation rule; professional services; requires local validation',
    sectorL1: 'professional',
    path: 'هامش المشروع ونطاق الخدمة',
    questionIds: ['p06', 'p03', 'u06'],
    hypothesis: 'قد يتسرب هامش المشروع بسبب أعمال إضافية غير مضبوطة أو غير محاسَب عليها.',
    serviceBoundary: 'تُعرض كمحور تحقق تشغيلي، لا كإثبات لخسارة أو كخدمة جاهزة من أرشيف بحثي.',
    evaluate: (answers) => answers.p06 === 'no_control' ? 'OBSERVED' : (answered(answers, 'p06') ? 'HYPOTHESIS' : 'INSUFFICIENT_DATA')
  },
  {
    id: 'early-stage-separation',
    sourceRecordId: 'STAGE-FOUNDATION-001',
    sourceScope: 'curated stage rule; applies only to businesses under one year',
    sectorL1: '*',
    path: 'مرحلة التأسيس قبل التشغيل المستقر',
    questionIds: ['companyAge', 'u31', 'breakEven'],
    hypothesis: 'هذه قراءة جاهزية وتحقق نموذج، وليست تشخيصاً لنتائج تشغيل تاريخية ولا توصية استثمارية.',
    serviceBoundary: 'يفصل أسئلة التأسيس عن قواعد الإنقاذ التشغيلي؛ لا تُستنتج خسائر أو عوائد استثمارية من غياب الإيراد.',
    evaluate: (answers, intake) => {
      if (intake.companyAge !== 'أقل من سنة') return 'INSUFFICIENT_DATA';
      if (!answered(answers, 'u31') && intake.breakEven === 'لا بعد') return 'OBSERVED';
      return 'HYPOTHESIS';
    }
  }
];

export function getActiveKnowledgeTrace(sectorL1: string | undefined, answers: Record<string, any>, intake: Record<string, any>) {
  return ACTIVE_KNOWLEDGE_RULES
    .filter(rule => rule.sectorL1 === '*' || rule.sectorL1 === (sectorL1 || '').toLowerCase())
    .map(rule => ({ ...rule, evidenceStatus: rule.evaluate(answers, intake) }))
    .filter(rule => rule.evidenceStatus !== 'INSUFFICIENT_DATA');
}
