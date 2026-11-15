/**
 * BIK V1 Evidence-Based SWOT Engine
 * Classifies every SWOT item strictly into:
 * - OBSERVED: Directly attested in client answers
 * - CALCULATED: Derived from deterministic financial formulas
 * - DERIVED: Inferred operational correlation from multiple evidence points
 * - SECTOR_CONTEXT: Market / industry baseline clearly marked as external context
 */

import { DetailedScoreResult } from './deterministicScoring';
import { EvidenceBasedSwot, SwotItem } from '../types/dualLayer';

export function buildEvidenceBasedSwot(
  scoreResult: DetailedScoreResult,
  answers: Record<string, any>,
  sectorL1?: string,
  sectorL2?: string
): EvidenceBasedSwot {
  const strengths: SwotItem[] = [];
  const weaknesses: SwotItem[] = [];
  const opportunities: SwotItem[] = [];
  const threats: SwotItem[] = [];

  // معرّف قطاع غير معروف (نص لاتيني مثل unregistered_subsector_902) لا يجوز أن يصل نصوص
  // العميل أبداً: كل اسم قطاع يمر من هنا فقط إذا كان عربياً، وإلا عُبد باسم النشاط العام.
  const rawSector = sectorL2 || sectorL1 || '';
  const sectorName = /[\u0600-\u06FF]/.test(rawSector) ? rawSector : 'الأعمال والخدمات';

  // ==========================================
  // 1. STRENGTHS (نقاط القوة - مبنية على الأدلة)
  // ==========================================
  
  // From scoreResult.topStrengths
  if (scoreResult.topStrengths && scoreResult.topStrengths.length > 0) {
    scoreResult.topStrengths.forEach(s => {
      const isFin = s.sourceQuestionId.startsWith('u3') || s.sourceQuestionId === 'u06';
      strengths.push({
        text: s.findingDescription || `${s.questionLabel}: أداء تشغيلي إيجابي ومستقر`,
        classification: isFin ? 'CALCULATED' : 'OBSERVED',
        evidence: s.sourceQuestionId,
        evidence_label: `مستند إلى إجابة السؤال في بُعد ${s.dimension}`,
        dimension: s.dimension,
        basis: s.findingDescription
      });
    });
  }

  // Check explicit positive signals
  if (answers.u01 === 'always' && !strengths.some(s => s.evidence.includes('u01'))) {
    strengths.push({
      text: 'وضوح الرسالة التسويقية والقيمة المقدمة للعملاء لدى جميع أفراد الفريق',
      classification: 'OBSERVED',
      evidence: 'u01',
      evidence_label: 'إجابة وضوح القيمة المقدمة',
      dimension: 'التسويق والمبيعات'
    });
  }

  if (answers.u03 === 'yes_comfortable' && !strengths.some(s => s.evidence.includes('u03'))) {
    strengths.push({
      text: 'استقلالية تشغيلية جيدة وقدرة الشركة على العمل المنتظم دون الحاجة لتدخل يومي من المؤسس',
      classification: 'OBSERVED',
      evidence: 'u03',
      evidence_label: 'إجابة استقلالية العمليات وغياب المؤسس',
      dimension: 'العمليات والإنتاجية'
    });
  }

  if ((answers.u12 === 'short' || answers.u12 === 'instant') && !strengths.some(s => s.evidence.includes('u12'))) {
    strengths.push({
      text: 'دورة مبيعات قصيرة وسرعة في إتمام الصفقات وتسييل الفرص البيعية',
      classification: 'OBSERVED',
      evidence: 'u12',
      evidence_label: 'إجابة سرعة دورة المبيعات',
      dimension: 'التسويق والمبيعات'
    });
  }

  // Financial positive calculation
  if (
    scoreResult.financialImpact?.isComputable &&
    scoreResult.financialImpact.metrics.monthlyNetProfit?.value !== null &&
    (scoreResult.financialImpact.metrics.monthlyNetProfit?.value || 0) > 0 &&
    !strengths.some(s => s.classification === 'CALCULATED')
  ) {
    const profit = scoreResult.financialImpact.metrics.monthlyNetProfit.value?.toLocaleString('ar-EG');
    strengths.push({
      text: `تحقيق صافي ربح تشغيلي إيجابي بمعدل تقديري (${profit} ${scoreResult.financialImpact.currency} شهرياً)`,
      classification: 'CALCULATED',
      evidence: 'u06 / u31',
      evidence_label: 'حساب بمعادلة ثابتة مباشرة استناداً إلى هامش الربح والإيرادات',
      dimension: 'المالية والتدفقات'
    });
  }

  // Guarantee at least 2 structured strengths
  if (strengths.length === 0) {
    strengths.push({
      text: 'جاهزية الإدارة للفحص المؤسسي وتحديد نقاط الاختناق بشفافية وموضوعية',
      classification: 'OBSERVED',
      evidence: 'جلسة التشخيص',
      evidence_label: 'بيانات جلسة الفحص المباشرة',
      dimension: 'القيادة والحوكمة'
    });
  }

  // ==========================================
  // 2. WEAKNESSES (نقاط الضعف - مبنية على الأدلة)
  // ==========================================

  if (scoreResult.topWeaknesses && scoreResult.topWeaknesses.length > 0) {
    scoreResult.topWeaknesses.forEach(w => {
      let classification: 'OBSERVED' | 'CALCULATED' | 'DERIVED' = 'OBSERVED';
      let text = `${w.questionLabel}: ${w.findingDescription}`;
      let evidence = w.sourceQuestionId;

      if (w.sourceQuestionId === 'u02' || w.sourceQuestionId === 'u03') {
        text = 'الاعتماد الكبير على المؤسس أو كفاءة محورية فردية في إدارة العمليات اليومية';
        evidence = 'u02 / u03';
        classification = 'OBSERVED';
      } else if (w.sourceQuestionId === 'u06') {
        text = 'انخفاض أو عدم وضوح هامش صافي الربح التشغيلي المحاسبي';
        classification = 'CALCULATED';
        evidence = 'u06';
      } else if (w.sourceQuestionId === 'u04') {
        text = 'مفاجآت غير محسوبة وتذبذب في سيولة التدفقات النقدية الدورية';
        classification = 'OBSERVED';
        evidence = 'u04';
      } else if (w.sourceQuestionId === 'u09') {
        text = 'غياب نظام متابعة آلي للتحصيل وتراكم مستحقات العملاء غير المسددة';
        classification = 'OBSERVED';
        evidence = 'u09';
      }

      if (!weaknesses.some(existing => existing.evidence === evidence)) {
        weaknesses.push({
          text,
          classification,
          evidence,
          evidence_label: `مستند إلى إجابة السؤال في بُعد ${w.dimension}`,
          dimension: w.dimension,
          basis: w.findingDescription
        });
      }
    });
  }

  // High debt burden
  if (answers.hasDebt === 'نعم' && !weaknesses.some(w => w.evidence.includes('debt'))) {
    weaknesses.push({
      text: 'التزامات ديون خارجية تقتطع جزءاً ثابتاً من التدفقات النقدية الشهرية',
      classification: 'OBSERVED',
      evidence: 'hasDebt / debtMonthlyPct',
      evidence_label: 'بيانات الالتزامات المالية والديون في مدخلات التأسيس',
      dimension: 'المالية والتدفقات'
    });
  }

  // Data gaps as weaknesses
  if (scoreResult.dataGaps && scoreResult.dataGaps.length > 0 && weaknesses.length < 3) {
    const gap = scoreResult.dataGaps[0];
    weaknesses.push({
      text: `عدم توافر سجلات دورية موثقة لمؤشر «${gap.label}» يحد من القدرة على التنبؤ بالأداء`,
      classification: 'OBSERVED',
      evidence: gap.questionId,
      evidence_label: `فجوة في قياس مؤشر (${gap.label})`,
      dimension: gap.dimension
    });
  }

  // ==========================================
  // 3. OPPORTUNITIES (الفرص - مستنتجة مع تمييز السياق)
  // ==========================================

  // Opportunity 1: If marketing relies on word of mouth or single channel
  if (answers.u10 === 'referral_only' || answers.u01 === 'sometimes' || answers.u01 === 'rarely') {
    opportunities.push({
      text: 'تنويع قنوات اكتساب العملاء وبناء منظومة تسويق مستدامة تقلل الاعتماد على التوصيات العفوية',
      classification: 'DERIVED',
      evidence: 'u10 / u01',
      evidence_label: 'مستنتج من مؤشرات اكتساب العملاء والاعتماد على العلاقات',
      basis: 'الاعتماد المرصود على التوصيات الشفهية يتيح فرصة نمو سريعة عند فتح قنوات مباشرة',
      dimension: 'التسويق والمبيعات'
    });
  }

  // Opportunity 2: Process documentation / SOPs
  if (answers.u02 === 'cant' || answers.u03 === 'no' || answers.u03 === 'yes_worried') {
    opportunities.push({
      text: 'توثيق أدلة العمليات القياسية (SOPs) ونقل الصلاحيات لتحرير جزء من وقت الإدارة للنمو التوسعي',
      classification: 'DERIVED',
      evidence: 'u02 / u03',
      evidence_label: 'مستنتج من مؤشرات التبعية للمؤسس وغياب التوثيق',
      basis: 'إيقاف الاختناق التشغيلي يحرر طاقة قيادية مباشرة موجهة للمبيعات وتطوير الأعمال',
      dimension: 'العمليات والإنتاجية'
    });
  }

  // Opportunity 3: Margin restructuring
  if (scoreResult.financialImpact?.isComputable) {
    opportunities.push({
      text: 'مراجعة قائمة الخدمات وهوامش التسعير لدراسة إمكانية رفع صافي الربح',
      classification: 'DERIVED',
      evidence: 'u06 / u31',
      evidence_label: 'مستنتج من الإيراد الشهري وهامش صافي الربح المصرّح بهما',
      basis: 'بناءً على الإيراد وهامش الربح كما صرّحت بهما؛ لا يتضمن هذا البند رقماً محسوباً',
      dimension: 'المالية والتدفقات'
    });
  }

  // Sector Context Opportunity (distinctly labeled)
  opportunities.push({
    text: `فرصة لإبراز جودة التسليم والموثوقية المؤسسية كميزة تنافسية في (${sectorName})`,
    classification: 'SECTOR_CONTEXT',
    evidence: `قطاع ${sectorName}`,
    evidence_label: `سياق عام لقطاع ${sectorName} (توجيه استرشادي، وليس إحصاءً عن السوق)`,
    basis: 'صياغة استرشادية عامة لا تستند إلى بيانات سوق ولا إلى أرقام',
    dimension: 'الاستراتيجية والسوق'
  });

  // ==========================================
  // 4. THREATS (التهديدات والمخاطر - مستنتجة وسياق)
  // ==========================================

  // Threat 1: Key person operational failure
  if (answers.u02 === 'cant' || answers.u03 === 'no') {
    threats.push({
      text: 'مخاطر تعطل العمليات وتراجع رضا العملاء عند أي غياب طارئ للمؤسس أو الموظف المحوري',
      classification: 'DERIVED',
      evidence: 'u02 / u03',
      evidence_label: 'مستنتج من مؤشر الاعتمادية التشغيلية اليومية',
      basis: 'تركيز الخبرات التنفيذية في عقل شخص واحد يمثل نقطة عطل أحادية حرجة',
      dimension: 'العمليات والإنتاجية'
    });
  }

  // Threat 2: Cash flow squeeze
  if (answers.u04 === 'yes_surprises' || answers.u09 === 'manual_invoicing' || answers.hasDebt === 'نعم') {
    threats.push({
      text: 'مخاطر تعثر السيولة المفاجئ في حال تأخر تحصيل دفعات كبار العملاء تزامناً مع التزامات تشغيلية ملزمة',
      classification: 'DERIVED',
      evidence: 'u04 / u09 / hasDebt',
      evidence_label: 'مستنتج من تباعد دورات التحصيل ومفاجآت السيولة',
      basis: 'غياب وسادة سيولة احتياطية محكمة يرفع حساسية الشركة لتقلبات السوق',
      dimension: 'المالية والتدفقات'
    });
  }

  // Threat 3: Sector Market Competition (distinctly labeled)
  threats.push({
    text: `التعرض لضغوط الأسعار والمنافسة في قطاع ${sectorName} عند غياب ميزة تنافسية واضحة`,
    classification: 'SECTOR_CONTEXT',
    evidence: `قطاع ${sectorName}`,
    evidence_label: `سياق عام لقطاع ${sectorName} (توجيه استرشادي، وليس إحصاءً عن السوق)`,
    basis: 'صياغة شرطية عامة لا تستند إلى بيانات سوق ولا إلى أرقام',
    dimension: 'الاستراتيجية والسوق'
  });

  return {
    strengths: strengths.slice(0, 4),
    weaknesses: weaknesses.slice(0, 4),
    opportunities: opportunities.slice(0, 4),
    threats: threats.slice(0, 4)
  };
}
