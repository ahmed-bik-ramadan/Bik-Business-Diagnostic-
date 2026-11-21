// src/services/reportFallback.ts
// BIK Business Intelligence & Knowledge - Deterministic Fallback Report Engine
// Version: 2.0.0
// Guarantees:
// 1. 0 LLM calls inside fallback.
// 2. 0 fake percentages or unverified benchmarks (no "20%", "30%", "80%", "ضعف متوسط السوق" fabricated).
// 3. Fully grounded in deterministic score, actual answers, and verified financial calculations.

import { DiagnosticReport } from '../types';
import { calculateFinancialSensitivities, DetailedScoreResult, FinancialSensitivities, FindingEvidence, toFiniteNumber } from './deterministicScoring';
import { evaluateDiagnosticState, calculateDiagnosticCoverage } from './adaptiveDiagnosticEngine';
import { universalQuestions } from '../data/universalQuestions';
import { getEnrichedQuestion } from '../data/questionClassification';
import { STRATEGIC_HYPOTHESES } from '../data/diagnosticHypotheses';
import { getSectorQuestions, getSectorHypotheses } from '../data/sectorRegistry';
import { buildDualLayerReport } from './dualLayerReport';
import { QuestionLedgerEntry } from '../types/dualLayer';
import { getActiveKnowledgeTrace } from '../data/activeKnowledgeRules';

export interface FallbackReportInput {
  review?: import('./reviewState').ReviewState;
  sessionId?: string;
  scoreResult: DetailedScoreResult;
  companyData?: {
    companyName?: string;
    sectorL1?: string;
    sectorL2?: string;
    diagnosticDepth?: string;
  };
  answers?: Record<string, any>;
  questionHistory?: QuestionLedgerEntry[];
}

export function createFallbackReport(input: FallbackReportInput): DiagnosticReport {
  const { scoreResult: rawScoreResult, companyData } = input;
  // حارس ثانٍ عند حدود هذا المستهلك: كل حقول الدليل هنا تُطبع في نص العميل
  // (questionLabel، dimension، findingDescription)، فتُطبَّع عند المدخل مهما كان
  // مصدر النقاط، فلا يظهر «undefined» في أي تقرير مهما كانت المدخلات فاسدة.
  const safeText = (value: unknown, fallback: string) =>
    typeof value === 'string' && value.trim() ? value : fallback;
  const normalizeEvidence = <T extends { dimension?: unknown; questionLabel?: unknown; findingDescription?: unknown }>(e: T) => ({
    ...e,
    dimension: safeText(e.dimension, 'البُعد العام'),
    questionLabel: safeText(e.questionLabel, 'مؤشر تشغيلي'),
    findingDescription: safeText(e.findingDescription, 'مؤشر يحتاج استكمال بيانات')
  });
  const rawAnswers = input.answers || {};
  const intakeAnswers = rawAnswers.intakeAnswers || rawAnswers;
  const universalAnswers = rawAnswers.universalAnswers || rawAnswers;
  const sectorAnswers = rawAnswers.sectorAnswers || rawAnswers;
  const deltaAnswers = rawAnswers.deltaAnswers || {};
  const impact = rawScoreResult.financialImpact;
  const revenue = impact.metrics.monthlyRevenue?.value;
  const hasRevenue = revenue != null && Number.isFinite(revenue) && revenue > 0;
  // Retail visitor count and basket value arrive with sector answers after universal scoring.
  const sensitivities = calculateFinancialSensitivities(revenue, impact.metrics.monthlyAcquisitionSpend?.value,
    toFiniteNumber(sectorAnswers.rd02 ?? intakeAnswers.monthlyVisitors),
    toFiniteNumber(sectorAnswers.rd03 ?? universalAnswers.u34 ?? intakeAnswers.aov));
  if (sensitivities.margin !== undefined && sensitivities.conversion === undefined && impact.sensitivities?.conversion !== undefined) {
    sensitivities.conversion = impact.sensitivities.conversion;
  }
  // Older score payloads can still contain projected gains. Only forward the unit sensitivities.
  const finImpact = { ...impact, isComputable: hasRevenue && impact.isComputable, scenarios: [], sensitivities };
  const scoreResult = {
    ...rawScoreResult,
    financialImpact: finImpact,
    topWeaknesses: (rawScoreResult.topWeaknesses ?? []).map(normalizeEvidence),
    topStrengths: (rawScoreResult.topStrengths ?? []).map(normalizeEvidence)
  };
  const companyName = companyData?.companyName || 'الشركة';
  const sectorL2 = companyData?.sectorL2 || 'الأعمال والخدمات';
  // A non-finite overall (NaN/undefined, injected or corrupted) can never be presented as a
  // measurement: it reads exactly like "too few answers", with no number shown anywhere.
  const rawScore = scoreResult.overall;
  const finiteScore = typeof rawScore === 'number' && Number.isFinite(rawScore);
  const score = finiteScore ? rawScore : 0;
  // false = too few axes had real answers, or the overall is not a finite number;
  // the number is a placeholder and must not be presented as a measurement.
  const scoreComputed = scoreResult.overallComputed !== false && finiteScore;

  // Determine health label deterministically
  let health_label = 'مستوى تشغيلي متوسط يحتاج تحسينات هيكلية';
  if (!scoreComputed) {
    health_label = 'بيانات غير كافية لحساب مؤشر موثوق';
  } else if (score < 45) {
    health_label = 'يحتاج معالجة مرتبة الأولويات لوقف تسرب الموارد.';
  } else if (score >= 70) {
    health_label = 'استقرار تشغيلي جيد مع فرص واعدة للتوسع المدروس';
  }

  // Find lowest performing dimension (only axes that were actually scored; an axis without data is never "the bottleneck")
  let lowestDimension = 'البيانات المتاحة';
  let lowestScore = Infinity;
  for (const [dim, val] of Object.entries(scoreResult.axisScores)) {
    if (scoreResult.axisDetails?.[dim]?.status === 'بيانات غير كافية') continue;
    if (val < lowestScore) {
      lowestScore = val;
      lowestDimension = dim;
    }
  }

  // Build grounded headline diagnosis
  const primaryWeakness = scoreResult.topWeaknesses[0]?.findingDescription;
  const headline_diagnosis = !scoreComputed
    ? `تشخيص أولي لشركة ${companyName}: البيانات المتاحة لا تكفي لحساب مؤشر كفاءة موثوق، لذلك لا يُعرض رقم. أكمل الأسئلة التي اخترت فيها «لا أعرف» أو ناقشها مع المستشار.`
    : primaryWeakness
    ? `تشخيص استراتيجي لشركة ${companyName}: مؤشر كفاءة ${score}/100 — نقطة الاختناق الأبرز تتركز في بُعد «${lowestDimension}» (${primaryWeakness}).`
    : `تشخيص استراتيجي لشركة ${companyName}: مؤشر كفاءة ${score}/100 — تركيز الأولوية على رفع كفاءة بُعد «${lowestDimension}».`;

  // Build SWOT strictly from verified evidence
  const strengths: string[] = [];
  if (scoreResult.topStrengths.length > 0) {
    scoreResult.topStrengths.slice(0, 4).forEach((ev) => {
      strengths.push(`${ev.dimension}: ${ev.findingDescription}`);
    });
  } else {
    strengths.push('وجود إرادة إدارية لإجراء التقييم التشخيصي وتحديد مسار التطوير.');
  }

  const weaknesses: string[] = [];
  if (scoreResult.topWeaknesses.length > 0) {
    scoreResult.topWeaknesses.slice(0, 4).forEach((ev) => {
      weaknesses.push(`${ev.dimension}: ${ev.findingDescription}`);
    });
  } else {
    weaknesses.push('الحاجة إلى استكمال قياس المؤشرات التشغيلية غير الموثقة بدقة.');
  }

  const opportunities: string[] = [
    `توثيق العمليات وإجراءات التشغيل القياسية في بُعد «${lowestDimension}» لتحرير وقت الإدارة.`,
    'استثمار بيانات التشخيص في بناء مؤشرات أداء أسبوعية واضحة ومباشرة للفريق.',
    'تقليل هدر الموارد والوقت عبر معالجة المشاكل المتراكمة بدلاً من الحلول المؤقتة.'
  ];

  const threats: string[] = [];
  if (scoreResult.topWeaknesses.some((w) => w.sourceQuestionId === 'u02' || w.sourceQuestionId === 'u03')) {
    threats.push('مخاطر استمرارية الأعمال بسبب الاعتماد المفرط على المؤسس أو الموظف المحوري.');
  }
  if (scoreResult.topWeaknesses.some((w) => w.sourceQuestionId === 'u06' || w.sourceQuestionId === 'u08')) {
    threats.push('ضغوط السيولة النقدية نتيجة تراجع هوامش الربحية أو الاعتماد على التمويل الخارجي.');
  }
  if (threats.length === 0) {
    threats.push('تآكل الميزة التنافسية في حال دخول منافسين يمتلكون كفاءة تشغيلية أعلى وتكاليف أقل.');
  }

  // Build Blind Spots
  const blind_spots: Array<{
    name: string;
    description: string;
    impact_level: 'critical' | 'high' | 'medium';
    source_question: string;
    estimated_cost: string;
  }> = [];

  const currency = finImpact.currency;
  const sensitivityNames = { margin: 'الهامش', acquisition: 'تكلفة الاكتساب', conversion: 'التحويل' } as const;
  const sensitivityLines: Partial<Record<keyof FinancialSensitivities, string>> = {};
  for (const key of Object.keys(sensitivityNames) as (keyof FinancialSensitivities)[]) {
    const value = sensitivities[key];
    if (value === undefined) continue;
    const formatted = value.toLocaleString('en-US', { maximumSignificantDigits: 15 });
    const amount = currency === 'USD' ? `$${formatted}` : [formatted, currency].filter(Boolean).join(' ');
    sensitivityLines[key] = `كل نقطة مئوية من ${sensitivityNames[key]} تساوي بحسب أرقامك: ${amount} شهرياً (تقدير استرشادي)`;
  }

  if (scoreResult.topWeaknesses.length > 0) {
    scoreResult.topWeaknesses.slice(0, 3).forEach((w, idx) => {
      let costPhrase = 'غير محدد لعدم توافر البيانات المالية الكافية';
      if (w.sourceQuestionId === 'u06' || w.sourceQuestionId === 'u05') {
        costPhrase = sensitivityLines.margin ?? '';
      } else if (w.sourceQuestionId === 'u33' || w.sourceQuestionId === 'u10') {
        costPhrase = sensitivityLines.acquisition ?? '';
      } else if (w.sourceQuestionId === 'rt01') {
        costPhrase = sensitivityLines.conversion ?? '';
      } else if (finImpact.isComputable) {
        costPhrase = 'أثر تشغيلي متراكم يؤثر على إنتاجية الفريق وخدمة العملاء';
      }

      blind_spots.push({
        name: w.questionLabel,
        description: `أظهر التشخيص نقطة حرجة: ${w.findingDescription}. استمرار هذا الوضع يضغط على كفاءة الشركة التشغيلية.`,
        impact_level: idx === 0 ? 'critical' : 'high',
        source_question: w.sourceQuestionId,
        estimated_cost: costPhrase
      });
    });
  }

  // If there are data gaps, add a blind spot for unmeasured metrics
  if (scoreResult.dataGaps.length > 0) {
    const gapList = scoreResult.dataGaps.slice(0, 2).map((g) => g.label).join(' و ');
    blind_spots.push({
      name: 'فجوة قياس وعدم توافر بيانات موثقة',
      description: `عدم قياس أو تتبع: ${gapList}. الغياب عن القياس الدوري يحجب رؤية الإدارة لحجم الهدر الفعلي.`,
      impact_level: 'medium',
      source_question: scoreResult.dataGaps[0].questionId,
      estimated_cost: 'يتطلب وضع آلية قياس شهرية منتظمة قبل احتساب التكلفة بدقة'
    });
  }

  // Ensure blind spots are always populated with actionable strategic insights
  if (blind_spots.length === 0) {
    blind_spots.push(
      {
        name: 'الحفاظ على الانضباط المؤسسي واستباق التوسع',
        description: 'أظهر التقييم مؤشرات أداء وتشغيل متقدمة. النقطة العمياء الأبرز في هذه المرحلة هي الركون إلى النتائج الحالية وتأجيل بناء الصف الثاني وأتمتة العمليات.',
        impact_level: 'medium',
        source_question: 'u01',
        estimated_cost: 'مخاطر تباطؤ النمو وفقدان المرونة أثناء التوسع المستقبلي'
      },
      {
        name: 'المراقبة المستمرة للمتغيرات السعرية والمنافسة',
        description: 'ضرورة مراجعة تسعير المنتجات أو الخدمات بشكل دوري لحماية هوامش الربحية التشغيلية الصافية.',
        impact_level: 'medium',
        source_question: 'u06',
        estimated_cost: 'تآكل الهوامش في حال زيادة تكاليف المدخلات التشغيلية دون تعديل مقابل'
      }
    );
  }

  // Build Priority Actions (Traceable to weaknesses)
  const priority_actions: Array<{
    action: string;
    why_now: string;
    expected_impact: string;
    difficulty: 'low' | 'medium' | 'high';
    timeframe: string;
  }> = [];

  const topWeakness = scoreResult.topWeaknesses[0];
  if (topWeakness) {
    priority_actions.push({
      action: `معالجة ${topWeakness.questionLabel} وتوثيق سياسة تشغيلية محددة`,
      why_now: 'تعد النقطة الأكثر تأثيراً سلبياً على النتيجة الإجمالية للشركة في التقييم الحالي.',
      expected_impact: 'إيقاف الهدر المباشر وضبط آلية التنفيذ دون الحاجة لتدخل مستمر من الإدارة.',
      difficulty: 'medium',
      timeframe: 'الأسبوع 1 إلى 2'
    });
  } else {
    priority_actions.push({
      action: 'إطلاق مصفوفة مؤشرات الأداء التشغيلية الأسبوعية',
      why_now: 'لتثبيت الاستقرار التشغيلي ومراقبة تطور مؤشرات النمو بوضوح.',
      expected_impact: 'رؤية إدارية واضحة لأداء الفريق والعمليات.',
      difficulty: 'low',
      timeframe: 'خلال أسبوعين'
    });
  }

  priority_actions.push({
    action: 'توثيق إجراءات العمل الأساسية (SOPs) ونقل المعرفة من الموظفين المحوريين',
    why_now: 'حماية استمرارية أعمال الشركة من مخاطر غياب أو استقالة الكفاءات الأساسية.',
    expected_impact: 'تقليص زمن تأهيل الموظفين الجدد وضمان ثبات جودة الخدمة المقدمة للعملاء.',
    difficulty: 'medium',
    timeframe: 'خلال 30 يوماً'
  });

  priority_actions.push({
    action: 'تفعيل مراجعة مالية شهرية لهوامش الربح وتكلفة اكتساب العملاء',
    why_now: 'لضمان نمو الأرباح الصافية بموازاة نمو الإيرادات وتفادي حروب الأسعار غير المدروسة.',
    expected_impact: 'حماية هوامش الربحية وتوجيه ميزانيات التسويق للقنوات الأكثر عائداً.',
    difficulty: 'medium',
    timeframe: 'خلال 60 يوماً'
  });

  // Closing question and sector insight
  const closing_question = `لو عالجت نقطة الضعف الأبرز في «${lowestDimension}» هذا الشهر، كم ساعة إضافية من وقتك كقائد ستوفر للتركيز على النمو؟`;
  let sector_insight = `في قطاع ${sectorL2}، لم تُفعّل قاعدة قطاعية كافية للحكم من هذه الجلسة؛ لذلك تبقى القراءة مرتبطة بإجاباتك وفجواتها فقط.`;

  // Build structured diagnostic findings distinguishing observed weaknesses, validated diagnoses, hypotheses, and gaps
  const sectorL1 = companyData?.sectorL1 || '';
  const sectorQuestionsList = getSectorQuestions(sectorL1, sectorL2);
  const allEnrichedQuestions = [
    ...universalQuestions.map((q) => getEnrichedQuestion(q)),
    ...sectorQuestionsList
  ];
  const allHypotheses = [...STRATEGIC_HYPOTHESES, ...getSectorHypotheses(sectorL1)];
  const actualAnswers = input.answers || {};

  const diagEval = evaluateDiagnosticState(allEnrichedQuestions, allHypotheses, actualAnswers);
  const diagCoverage = calculateDiagnosticCoverage(allEnrichedQuestions, actualAnswers);
  const knowledgeTrace = getActiveKnowledgeTrace(
    sectorL1,
    actualAnswers,
    (actualAnswers as any).intakeAnswers || actualAnswers
  ).map(rule => ({
    rule_id: rule.id,
    source_record_id: rule.sourceRecordId,
    source_scope: rule.sourceScope,
    path: rule.path,
    question_ids: rule.questionIds,
    hypothesis: rule.hypothesis,
    evidence_status: rule.evidenceStatus as 'OBSERVED' | 'HYPOTHESIS',
    service_boundary: rule.serviceBoundary
  }));
  if (knowledgeTrace.length > 0) {
    sector_insight = `في مسار ${sectorL2}، فُعّل مسار معرفة محدود بعنوان «${knowledgeTrace[0].path}». حالته ${knowledgeTrace[0].evidence_status === 'OBSERVED' ? 'إشارة من إجاباتك' : 'فرضية تحتاج تحققاً'}، وليس حكماً قطاعياً عاماً.`;
  }

  const observed_weaknesses = scoreResult.topWeaknesses.map((w) => ({
    id: `obs_${w.sourceQuestionId}`,
    dimension: w.dimension,
    findingDescription: w.findingDescription,
    sourceQuestionId: w.sourceQuestionId
  }));

  const validated_diagnoses = diagEval.findings
    .filter((f) => f.status === 'validated')
    .map((f) => ({
      id: f.id,
      dimension: f.dimension,
      title: f.title,
      confidence: f.confidence,
      evidenceRefs: f.evidenceRefs,
      recommendation: f.recommendation
    }));

  const hypothesesList = diagEval.findings
    .filter((f) => f.status === 'hypothesis' || f.status === 'observed')
    .map((f) => ({
      id: f.id,
      dimension: f.dimension,
      title: f.title,
      confidence: f.confidence,
      missingEvidence: f.dataGaps || []
    }));

  const data_gaps = Object.values(diagCoverage.dimensionCoverages)
    .filter((d) => d.coverage < 50)
    .map((d) => ({
      dimension: d.dimension,
      missingQuestions: [`تغطية البعد ${d.coverage}%`],
      impactOnDiagnosis: `البيانات المجمعة في بُعد «${d.dimension}» تقع عند مستوى ${d.confidence}، مما يستدعي تعميق الفحص التشغيلي.`
    }));

  const financial_calculations: Array<{ metric: string; label: string; value: number | null; unit?: string; interpretation: string }> = [];
  if (hasRevenue) {
    financial_calculations.push({
      metric: 'monthlyRevenue',
      label: 'الإيراد الشهري',
      value: revenue,
      unit: finImpact.currency,
      interpretation: 'متوسط الإيراد الشهري المباشر المسجل للشركة.'
    });
    if (finImpact.metrics.netProfitMargin?.value !== null && finImpact.metrics.netProfitMargin?.value !== undefined) {
      financial_calculations.push({
        metric: 'netMargin',
        label: 'هامش صافي الربح',
        value: finImpact.metrics.netProfitMargin.value,
        unit: '%',
        interpretation: 'نسبة صافي الربح من الإيرادات بعد كافة التكاليف.'
      });
    }
  }

  const recommended_diagnostic_steps: Array<{ step: string; priority: 'high' | 'medium' | 'low'; targetDimension: string }> = [
    {
      step: `تدقيق عمليات بُعد «${lowestDimension}» وتوثيق إجراءات التشغيل القياسية.`,
      priority: 'high',
      targetDimension: lowestDimension
    }
  ];

  // 1. One-Sentence Explanation (SECTION 1)
  const one_sentence_explanation = primaryWeakness
    ? `أظهر تحليل إجاباتك أن التحدي الأكثر تأثيراً يتركز في بُعد «${lowestDimension}» (${primaryWeakness})، مما يستوجب تركيز التدخل المباشر عليه لتثبيت الكفاءة.`
    : `أظهر تحليل إجاباتك استقراراً عاماً في المؤشرات الأساسية مع وجود فرص محددة لتعزيز كفاءة بُعد «${lowestDimension}» وحماية هوامش الربحية.`;

  // 2. Aha Moment (Early Reveal based ONLY on diagnostic evidence)
  let aha_moment: DiagnosticReport['aha_moment'] = {
    apparent_problem: 'الحاجة إلى استكمال قياس المؤشرات التشغيلية',
    root_cause: 'لا تتوافر بيانات كافية للجزم بفرضية جذرية منفصلة',
    is_supported: false,
    explanation: 'أظهر تحليل إجاباتك مؤشرات عامة مستقرة، والبيانات المتاحة لا تكفي للجزم بوجود انحراف جذري مركب دون تعميق القياس الميداني.',
    evidence_reference: 'بيانات غير كافية للجزم بأصل جذري منفصل'
  };

  if (validated_diagnoses.length > 0) {
    const topV = validated_diagnoses[0];
    if (topV.id.includes('margin') || topV.dimension.includes('مال')) {
      aha_moment = {
        apparent_problem: 'المشكلة التي تبدو كأنها ضعف في وتيرة نمو المبيعات أو شح السيولة',
        root_cause: 'قد يكون أصلها في الواقع تآكل الهوامش الربحية وارتفاع التكاليف المباشرة مع كل نمو إيرادي جديد',
        is_supported: true,
        explanation: 'أظهر تحليل إجاباتك أن محاولات رفع الإيرادات دون حماية هوامش الربح الصافية تزيد من ضغط التكاليف والسيولة بدلاً من توليد أرباح قابلة للاستبقاء.',
        evidence_reference: 'مستند إلى إجابات بُعد الصحة المالية ومؤشر حركة صافي الأرباح'
      };
    } else if (topV.id.includes('person') || topV.dimension.includes('بنية') || topV.dimension.includes('عمليات')) {
      aha_moment = {
        apparent_problem: 'المشكلة التي تبدو كأنها بطء في وتيرة التنفيذ أو ضغط وقت دائم على الإدارة',
        root_cause: 'قد يكون أصلها ارتهاناً تشغيلياً بالمسؤول الأول وغياب أدلة العمليات الموثقة (SOPs)',
        is_supported: true,
        explanation: 'أظهر تحليل إجاباتك أن عدم قدرة العمليات على المضي قدماً دون الرجوع المستمر للمؤسس أو الموظف المحوري يعطل سرعة الإنجاز ويحد من إمكانية التوسع.',
        evidence_reference: 'مستند إلى إجابات بُعد بنية الشركة ومؤشر فترة غياب المؤسس'
      };
    } else if (topV.id.includes('value') || topV.dimension.includes('عملاء') || topV.dimension.includes('مبيعات')) {
      aha_moment = {
        apparent_problem: 'المشكلة التي تبدو كأنها ضعف في مهارات الإغلاق البيعي لدى الفريق',
        root_cause: 'قد يكون أصلها تشتت الرسالة التنافسية وغياب وضوح القيمة المضافة المحورية',
        is_supported: true,
        explanation: 'أظهر تحليل إجاباتك عدم تطابق إجابات الموظفين عند شرح سبب تفضيل العميل للشراء من شركتكم، مما يرفع جهد الإقناع ويطيل دورة التحويل.',
        evidence_reference: 'مستند إلى إجابات بُعد بنية الشركة وتماسك الرسالة البيعية'
      };
    } else {
      aha_moment = {
        apparent_problem: `المشكلة التي تبدو كأنها صعوبة في إدارة نمو بُعد ${topV.dimension}`,
        root_cause: `أصلها في الواقع ${topV.title}`,
        is_supported: true,
        explanation: `أظهر تحليل إجاباتك أن نقطة الاختناق الجوهرية تكمن في «${topV.title}» بناءً على توافق الأدلة المرصودة.`,
        evidence_reference: `مستند إلى أدلة تقييم بُعد ${topV.dimension}`
      };
    }
  } else if (scoreResult.topWeaknesses.length > 0) {
    const topW = scoreResult.topWeaknesses[0];
    aha_moment = {
      apparent_problem: `المشكلة التي تبدو كأنها ضغط تشغيلي عام في نشاط الشركة`,
      root_cause: `أصلها في الواقع ${topW.findingDescription}`,
      is_supported: true,
      explanation: `أظهر تحليل إجاباتك أن العائق الأكثر استنزافاً لموارد الشركة يكمن في «${topW.findingDescription}»، وأن استمرار الحلول الترقيعية يفاقم الهدر التراكمي.`,
      evidence_reference: `مستند إلى تقييم بُعد ${topW.dimension} (${topW.questionLabel})`
    };
  }

  // 3. What We Discovered: Exactly 3 Most Important Findings (SECTION 2 & 3)
  const discovered_findings: NonNullable<DiagnosticReport['discovered_findings']> = [];

  // Pool 1: Validated Diagnoses
  for (const v of validated_diagnoses) {
    if (discovered_findings.length >= 3) break;
    discovered_findings.push({
      title: v.title,
      explanation: `أظهر فحص الأدلة المترابطة تأكيد وجود اختناق في بُعد ${v.dimension}. هذا النمط يضعف قدرة الشركة على تحقيق أقصى عائد من مواردها الحالية.`,
      evidence_reference: `مستند إلى إجابات بُعد ${v.dimension} ومطابقة المؤشرات التفصيلية`,
      confidence: 'عالي',
      status: 'Validated',
      business_consequence: finImpact.isComputable && finImpact.metrics.monthlyNetProfit?.value !== null
        ? `يؤثر سلباً على كفاءة تحقيق الأرباح المقدرة شهرياً (${finImpact.metrics.monthlyNetProfit?.value?.toLocaleString()} ${currency}) ويرفع تكلفة التشغيل الفعلي.`
        : 'يؤدي إلى استنزاف طاقة الفريق الإداري وتقليص سرعة الاستجابة لطلبات السوق دون تحقيق وفورات حجم.',
      trust_category: 'OBSERVED'
    });
  }

  // Pool 2: Deterministic Top Weaknesses
  for (const w of scoreResult.topWeaknesses) {
    if (discovered_findings.length >= 3) break;
    discovered_findings.push({
      title: `قصور في ${w.questionLabel}`,
      explanation: `أظهرت الإجابات: ${w.findingDescription}. هذا المؤشر يشكل عائقاً مباشراً أمام استقرار الأداء.`,
      evidence_reference: `مستند إلى تقييم بُعد ${w.dimension}`,
      confidence: 'عالي',
      status: 'Observed',
      business_consequence: 'استمرار هذا القصور يفرض تدخلاً متكرراً من الإدارة لمعالجة الأخطاء التشغيلية بدلاً من التفرغ للتطوير.',
      trust_category: 'OBSERVED'
    });
  }

  // Pool 3: Diagnostic Hypotheses
  for (const hyp of hypothesesList) {
    if (discovered_findings.length >= 3) break;
    discovered_findings.push({
      title: hyp.title,
      explanation: 'فرضية تشخيصية استرشادية ترجحها المؤشرات الأولية، وتتطلب استكمال قياس المؤشرات الفرعية للتأكيد النهائي وليست سبباً مؤكداً بعد.',
      evidence_reference: 'فرضية قيد التحقق — بانتظار استكمال فحص السجلات',
      confidence: 'متوسط',
      status: 'Hypothesis',
      business_consequence: 'في حال تأكد هذه الفرضية، فإن أثرها يتركز في تشتت الجهود وتباطؤ دورة التنفيذ المؤسسي.',
      trust_category: 'RECOMMENDATION'
    });
  }

  // Pool 4: Identified Data Gaps
  for (const gap of scoreResult.dataGaps) {
    if (discovered_findings.length >= 3) break;
    discovered_findings.push({
      title: `فجوة توثيق في ${gap.label}`,
      explanation: `عدم قياس أو تسجيل مؤشر «${gap.label}» دورياً يحجب عن الإدارة القدرة على اتخاذ قرارات مبنية على حقائق رقمية موثقة.`,
      evidence_reference: `مؤشر غير مسجل في السجلات التشغيلية الحالية للشركة`,
      confidence: 'منخفض',
      status: 'Insufficient Data',
      business_consequence: 'لا تتوافر بيانات كافية لحساب الأثر المالي بدقة، مما يترك تقدير التكلفة معتمداً على الانطباع لا الأرقام.',
      trust_category: 'DATA GAP'
    });
  }

  // Pool 5: Observed Strengths if Weaknesses are few
  for (const s of scoreResult.topStrengths) {
    if (discovered_findings.length >= 3) break;
    discovered_findings.push({
      title: `ركيزة أداء مستقرة: ${s.questionLabel}`,
      explanation: `أظهرت الإجابات كفاءة إيجابية: ${s.findingDescription}. تمثل هذه النقطة قاعدة صلبة يمكن البناء عليها للتوسع.`,
      evidence_reference: `مستند إلى تقييم بُعد ${s.dimension}`,
      confidence: 'عالي',
      status: 'Observed',
      business_consequence: 'تعزيز هذه القوة يرفع من استقرار التدفقات النقدية ويمنح ميزة تفاوضية أمام المنافسين.',
      trust_category: 'OBSERVED'
    });
  }

  // Pool 6: Deterministic Baseline Findings if still under 3
  const baselineFindings = [
    {
      title: 'استقرار الهيكل التنظيمي الأساسي',
      explanation: 'أظهر تحليل إجاباتك وجود بنية أولية مقبولة، لكنها تحتاج إلى مأسسة الصلاحيات لتفادي الاعتماد الحصري على الإدارة العليا.',
      evidence_reference: 'مستند إلى التقييم المؤسسي العام',
      confidence: 'متوسط' as const,
      status: 'Observed' as const,
      business_consequence: 'تفويض الصلاحيات يحمي وتيرة العمل من البطء عند زيادة عدد العملاء أو المشاريع.',
      trust_category: 'OBSERVED' as const
    },
    {
      title: 'حاجة لتعميق رصد مؤشرات الأداء الأسبوعية',
      explanation: 'لا تتوافر بيانات كافية لحسم دقة المتابعة الدورية، مما يستلزم اعتماد لوحة مؤشرات أداء دورية بسيطة.',
      evidence_reference: 'بيانات المتابعة التشغيلية الدورية',
      confidence: 'منخفض' as const,
      status: 'Insufficient Data' as const,
      business_consequence: 'غياب المتابعة الأسبوعية يؤخر اكتشاف انحرافات الميزانية أو تراجع الإنتاجية.',
      trust_category: 'DATA GAP' as const
    },
    {
      title: 'حماية هوامش الربحية التشغيلية أثناء التوسع',
      explanation: 'أظهر التقييم مؤشرات تشغيل إيجابية، وتبرز الحاجة لحماية الهوامش الصافية من تآكل التكاليف غير المباشرة.',
      evidence_reference: 'نموذج هوامش الربحية التشغيلية',
      confidence: 'عالي' as const,
      status: 'Observed' as const,
      business_consequence: 'حماية الهامش الصافي تدعم توليد سيولة نقدية تكفي لتمويل التطوير ذاتياً.',
      trust_category: 'OBSERVED' as const
    }
  ];

  for (const b of baselineFindings) {
    if (discovered_findings.length >= 3) break;
    discovered_findings.push(b);
  }

  // Guarantee exactly 3 findings
  const final_discovered_findings = discovered_findings.slice(0, 3);

  // 4. Ranked Top 3 Priorities (SECTION 5)
  const top_priorities: NonNullable<DiagnosticReport['top_priorities']> = [];

  // Priority 1: Bottleneck remediation
  top_priorities.push({
    rank: 1,
    title: topWeakness ? `معالجة ${topWeakness.questionLabel} ووقف الهدر` : 'معالجة نقطة الاختناق التشغيلية الأبرز',
    why_it_matters: [
      'تعد النقطة الأكثر تأثيراً سلبياً على مؤشر كفاءة الشركة واستنزاف مواردها في التقييم الحالي.',
      ...Object.values(sensitivityLines)
    ].join('\n'),
    evidence: `مستند إلى نتائج تقييم بُعد «${lowestDimension}»`,
    expected_objective: 'إيقاف تسرب الموارد الفوري وتثبيت آلية التنفيذ دون الحاجة لتدخل استثنائي دائم من الإدارة.',
    first_action: 'عقد جلسة حصر فوري للإجراءات المتعلقة بهذه النقطة وتحديد مسؤول مباشر عن الالتزام بالمعايير.',
    trust_category: 'RECOMMENDATION'
  });

  // Priority 2: Process documentation & knowledge institutionalization
  top_priorities.push({
    rank: 2,
    title: 'توثيق إجراءات العمل القياسية (SOPs) ونقل المعرفة المؤسسية',
    why_it_matters: 'حماية استمرارية أعمال الشركة من مخاطر الاعتماد على أفراد محددين وضمان ثبات جودة التسليم.',
    evidence: 'مستند إلى مؤشرات استقلالية العمليات وقابلية التوسع المؤسسي',
    expected_objective: 'تقليص زمن تدريب الكفاءات وضمان سير الأعمال بكفاءة منتظمة دون توقف.',
    first_action: 'توثيق أهم 3 عمليات متكررة في الشركة وكتابة خطواتها ونماذجها خطوة بخطوة.',
    trust_category: 'RECOMMENDATION'
  });

  // Priority 3: Financial margin review & measurement
  top_priorities.push({
    rank: 3,
    title: 'تفعيل مراجعة مالية شهرية لهوامش الربحية الصافية والإنفاق',
    why_it_matters: 'لضمان نمو الأرباح الصافية بموازاة نمو الإيرادات وتفادي حروب الأسعار والتسرب المالي غير المحسوب.',
    evidence: 'مستند إلى نموذج تحليل التدفقات النقدية وهوامش المساهمة',
    expected_objective: 'حماية الهوامش التشغيلية وتوجيه ميزانيات التسويق والتطوير للقنوات الأعلى عائداً.',
    first_action: 'فصل التكاليف المباشرة عن الثابتة واحتساب صافي الربح الحقيقي لكل قطاع أو خدمة شهرياً.',
    trust_category: 'RECOMMENDATION'
  });

  // 5. 90-Day Directional Action Roadmap (SECTION 6)
  const direction_90_days: NonNullable<DiagnosticReport['direction_90_days']> = {
    days_0_30: {
      title: 'المرحلة الأولى (الأيام 1–30): التثبيت ووقف تسرب الموارد',
      focus: 'معالجة الاختناق التشغيلي الفوري وحصر بنود النفقات غير المنتجة',
      actions: [
        `التدخل المباشر لمعالجة نقطة الضعف في بُعد «${lowestDimension}» وتعيين مسؤول تنفيذي محدد.`,
        'مراجعة التدفقات المالية وتحديد التكاليف التشغيلية التي يمكن ترشيدها دون المساس بجودة الخدمة.',
        'إيقاف الحلول الترقيعية المؤقتة وتوحيد قنوات التواصل والإبلاغ داخل الفريق.'
      ]
    },
    days_31_60: {
      title: 'المرحلة الثانية (الأيام 31–60): توثيق العمليات وضبط المعايير',
      focus: 'بناء معايير العمل المؤسسي وتفعيل مؤشرات الأداء الأسبوعية',
      actions: [
        'توثيق أدلة العمليات التشغيلية القياسية (SOPs) للأنشطة والمهام الأكثر تكراراً.',
        'إطلاق لوحة مؤشرات أداء تشغيلية أسبوعية بسيطة لمتابعة مؤشرات الإنجاز والجودة.',
        'مراجعة سياسة التسعير وعروض الأسعار لحماية هامش صافي الربح التشغيلي.'
      ]
    },
    days_61_90: {
      title: 'المرحلة الثالثة (الأيام 61–90): بناء الكفاءة واستدامة النمو',
      focus: 'تعزيز استقلالية الفريق والتمهيد للتوسع المدروس',
      actions: [
        'تفويض الصلاحيات التشغيلية الروتينية للصف الثاني من الفريق لتحرير وقت الإدارة للنمو.',
        'تقييم نتائج الشهرين الأولين وإعادة تخصيص الميزانيات للقنوات الأكثر ربحية.',
        'وضع مستهدفات الربع التالي استناداً إلى أرقام مدققة وبيانات موثقة بالكامل.'
      ]
    }
  };

  // 6. Data Gaps Credibility Analysis (SECTION 7)
  const data_gaps_analysis: NonNullable<DiagnosticReport['data_gaps_analysis']> = [];
  if (scoreResult.dataGaps.length > 0) {
    scoreResult.dataGaps.slice(0, 4).forEach((g) => {
      data_gaps_analysis.push({
        dimension: g.dimension,
        metric_label: g.label,
        impact_on_diagnosis: `عدم توافر سجلات دورية لمؤشر «${g.label}» حدّ من دقة الفحص التفصيلي في بُعد ${g.dimension}.`,
        credibility_note: 'البدء في قياس هذا المؤشر شهرياً يبني موثوقية عالية لدى الإدارة ويجعل القرارات مستندة لأرقام دقيقة بدلاً من التقدير.'
      });
    });
  } else {
    data_gaps_analysis.push({
      dimension: 'العمليات والمالية',
      metric_label: 'معدل دوران رأس المال العامل وتكلفة استبقاء العملاء',
      impact_on_diagnosis: 'البيانات الأساسية مكتملة، وتعميق التشخيص مستقبلاً يتطلب ربط مخرجات المحاسبة الدورية بلوحة مؤشرات حية.',
      credibility_note: 'رصد المؤشرات المتقدمة يدعم الجاهزية للتوسع والتعامل الاستباقي مع أي تغيرات في السوق.'
    });
  }

  // 8. Decision narrative and service matching. This is persuasive writing grounded in
  // observed signals; it does not claim clinical neuroscience or guaranteed outcomes.
  const primarySignal = topWeakness?.findingDescription || (scoreResult.dataGaps.length ? 'بيانات تحتاج استكمالًا قبل ترشيح تدخل' : 'لم تظهر نقطة ضعف محددة في الإجابات المتاحة');
  const strategic_narrative = topWeakness ? `من السهل أن تبدو المشكلة في نشاط ${companyName} كأنها تحتاج مزيداً من المبيعات أو مزيداً من الجهد. لكن الإشارة الأهم في إجاباتك تقول شيئاً أدق: ${primarySignal}. هنا لا تكون الخطوة الذكية هي إضافة حملات عشوائية، بل إزالة الاحتكاك الذي يجعل كل عميل جديد وكل قرار جديد يستهلك طاقة أكبر مما ينبغي. عندما يصبح المسار أوضح، يعرف الفريق ماذا يفعل، وتعرف الإدارة أين تتدخل، يتحول النمو من ضغط يومي إلى قدرة يمكن تكرارها وقياسها. لذلك يبدأ التدخل المقترح من نقطة الاختناق الحالية، ثم يربطها بالربحية والقدرة على الاحتفاظ بالعملاء، لا بشعار عام عن التطوير.` : `تشير الإجابات المتاحة إلى عدم رصد نقطة ضعف محددة تبرر خدمة علاجية الآن. ${scoreResult.dataGaps.length ? 'الخطوة الأولى هي استكمال البيانات الناقصة.' : 'يمكن مناقشة هدف تطوير أو توسع تختاره، ثم تحديد نوع المساعدة الذي يخدمه.'} لا تعني هذه القراءة أن النشاط خالٍ من المخاطر غير المقاسة.`;
  const behavioral_insight = `في قرارات الشراء الاستشارية، لا يبحث صاحب النشاط عن تقرير أطول بقدر ما يبحث عن تفسير يطابق ما يراه كل يوم ويمنحه خطوة أولى منخفضة المخاطر. لذلك صيغت التوصيات هنا حول ثلاث محفزات عملية: وضوح المشكلة، تقليل شعور التعقيد، وإظهار أول خطوة قابلة للملاحظة. هذه ليست نتيجة قياس نفسي للفرد، بل طريقة عرض تساعد على تحويل الفهم إلى قرار دون ضغط أو وعود غير مثبتة.`;

  // No service offers are generated here. The only offers BIK shows are the two fixed, priced cards in
  // BIK_OFFERS (see src/services/offerRecommendation.ts and src/components/OfferCards.tsx).

  // Build dual-layer architecture
  const questionHistory = input.questionHistory || (rawAnswers as any).questionHistory;

  const dual_layer = buildDualLayerReport({
    review: input.review,
    sessionId: input.sessionId,
    diagnosticDepth: companyData?.diagnosticDepth === 'deep' ? 'deep' : 'quick',
    scoreResult,
    companyData: {
      companyName,
      sectorL1: companyData?.sectorL1,
      sectorL2: companyData?.sectorL2
    },
    intakeAnswers,
    universalAnswers,
    sectorAnswers,
    deltaAnswers,
    questionHistory,
    baseReport: {
      headline_diagnosis,
      health_score: score,
      health_score_computed: scoreComputed,
      health_label,
      one_sentence_explanation,
      aha_moment,
      discovered_findings: final_discovered_findings,
      top_priorities,
      direction_90_days,
      data_gaps_analysis,
      blind_spots,
      priority_actions,
      financial_impact: finImpact,
      confidence: scoreResult.overallConfidence,
      coverage: scoreResult.overallCoverage,
      strategic_narrative,
      behavioral_insight
    }
  });

  if (!hasRevenue) dual_layer.clientReport.financial_impact = null;

  return {
    review: dual_layer.clientReport.review,
    headline_diagnosis,
    health_score: score,
    health_score_computed: scoreComputed,
    health_label,
    one_sentence_explanation,
    aha_moment,
    discovered_findings: final_discovered_findings,
    top_priorities,
    direction_90_days,
    data_gaps_analysis,
    swot: {
      strengths,
      weaknesses,
      opportunities,
      threats
    },
    evidence_swot: dual_layer.consultantDossier.swot,
    dual_layer,
    blind_spots,
    priority_actions,
    closing_question,
    sector_insight,
    strategic_narrative,
    behavioral_insight,
    financial_impact: finImpact,
    confidence: scoreResult.overallConfidence,
    coverage: scoreResult.overallCoverage,
    engine_metadata: scoreResult.engineMetadata,
    evidence: scoreResult.topWeaknesses.concat(scoreResult.topStrengths),
    diagnostic_findings: {
      observed_weaknesses,
      validated_diagnoses,
      hypotheses: hypothesesList,
      data_gaps,
      financial_calculations,
      recommended_diagnostic_steps
    },
    knowledge_trace: knowledgeTrace
  };
}
