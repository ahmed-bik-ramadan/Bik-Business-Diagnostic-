/**
 * BIK V1 Dual-Layer Report Service
 * Phase 3B: Generates Client Executive Report + Consultant Handoff Dossier
 * Built from the single source of deterministic diagnostic truth.
 */

import { buildReviewedSections, reviewedSectionText, type ReviewState } from './reviewState';
import { DetailedScoreResult, extractFinancialInputs } from './deterministicScoring';
import type { DeclaredValueModel } from './financialValueModel';
import { DiagnosticReport } from '../types';
import {
  DualLayerReport,
  ClientExecutiveReport,
  ConsultantDossier,
  QuestionAnswerRecord,
  ConsultantBrief,
  ConsultantNote,
  QuestionLedgerEntry
} from '../types/dualLayer';
import { buildEvidenceBasedSwot } from './evidenceSwot';
import { computeSectorBlindSpots } from './blindSpotCalculator';
import { parseValueNumber } from './valueModule/compute';
import { scrubInternalIds } from './internalIdScrub';
import { universalQuestions } from '../data/universalQuestions';
import { sectorQuestions } from '../data/sectorQuestions';
import { INTAKE_QUESTIONS_META } from '../data/intakeQuestionsData';
import { UNIVERSAL_QUESTION_METADATA } from '../data/questionClassification';
import { getSectorQuestions } from '../data/sectorRegistry';
import { sectors } from '../data/sectors';
import { buildConsultantWhatsAppUrl } from '../config/appConfig';

export interface BuildDualLayerParams {
  review?: ReviewState;
  scoreResult: DetailedScoreResult;
  companyData: {
    userName?: string;
    companyName?: string;
    sectorL1?: string;
    sectorL2?: string;
    country?: string;
    city?: string;
    whatsapp?: string;
  };
  intakeAnswers?: Record<string, any>;
  universalAnswers?: Record<string, any>;
  sectorAnswers?: Record<string, any>;
  deltaAnswers?: Record<string, any>;
  baseReport?: Partial<DiagnosticReport>;
  questionHistory?: QuestionLedgerEntry[];
  sessionId?: string;
  diagnosticDepth?: 'quick' | 'deep';
  sessionTimestamp?: number;
}

function findQuestionMeta(questionId: string, sectorL1?: string, sectorL2?: string) {
  if (INTAKE_QUESTIONS_META[questionId]) {
    const meta = INTAKE_QUESTIONS_META[questionId];
    return {
      id: meta.id,
      text: meta.question,
      type: meta.type,
      dimension: meta.dimension,
      role: meta.diagnosticRole,
      evidenceWeight: 1.0,
      options: meta.options,
      unit: meta.unit
    };
  }

  const uq = universalQuestions.find(q => q.id === questionId);
  if (uq) {
    const meta = UNIVERSAL_QUESTION_METADATA[questionId];
    return {
      id: uq.id,
      text: uq.question,
      type: uq.type,
      dimension: uq.dimension,
      role: meta?.diagnosticRole || 'baseline',
      evidenceWeight: meta?.evidenceWeight || 1.0,
      options: uq.options,
      unit: uq.unit
    };
  }

  const sectorQs = getSectorQuestions(sectorL1, sectorL2, true);
  const sq = sectorQs.find(q => q.id === questionId);
  if (sq) {
    return {
      id: sq.id,
      text: (sq as any).question || (sq as any).label || (sq as any).text,
      type: sq.type,
      dimension: sq.dimension,
      role: sq.diagnosticRole || 'signal',
      evidenceWeight: (sq as any).evidenceWeight || 1.0,
      options: sq.options,
      unit: sq.unit
    };
  }

  return undefined;
}

export interface WhatsAppDossierTextInput {
  review?: ReviewState;
  companyName?: string;
  userName?: string;
  sectorL1?: string;
  sectorL2?: string;
  country?: string;
  city?: string;
  /** null / non-finite = not computed (insufficient data); printed as such, never as a number. */
  overallScore: number | null;
  healthLabel?: string;
  blindSpots: Array<{ name?: string }>;
  qaRecord: QuestionAnswerRecord[];
  priorities: Array<{ title?: string }>;
}

const FIELD_MAX = 160;
const NAME_MISSING = '(الاسم غير مُدخل)';
const COMPANY_MISSING = '(اسم الشركة غير مُدخل)';
const SCORE_NOT_COMPUTED = 'النتيجة: غير محسوبة (بيانات غير كافية)';

/**
 * Text typed by the client, and the question text the client was shown: nothing visible is deleted.
 * Only invisible control characters, CRLF, and a lone surrogate (which would break URL encoding) are normalised.
 */
const clientText = (value: unknown): string =>
  String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�')
    .trim();

/** One answer or question stays one block: a blank line inside it becomes a single line break. */
const singleBlock = (value: string): string => value.replace(/\n{2,}/g, '\n');

/** Header fields are capped visibly (with an ellipsis) instead of cutting the whole summary. */
const capField = (value: string): string => {
  const chars = Array.from(value);
  return chars.length > FIELD_MAX ? `${chars.slice(0, FIELD_MAX - 1).join('')}…` : value;
};

const PLACEHOLDER_IDENTITY = new Set(['العميل', 'الشركة', 'غير محدد', 'غير متاح في هذه الجلسة.']);

const identityText = (value: unknown, fallback: string): string => {
  const raw = clientText(value).replace(/\s*\n\s*/g, ' ');
  if (!raw || PLACEHOLDER_IDENTITY.has(raw)) return fallback;
  return capField(raw);
};

/** Platform-generated labels only (blind spots, priorities, health label): guards against internal tokens. */
const platformText = (value: unknown, fallback = ''): string => {
  const raw = String(value ?? '').trim();
  if (!raw || PLACEHOLDER_IDENTITY.has(raw)) return fallback;
  return raw
    .replace(/[#]/g, '')
    .replace(/\[(?:u|md)[^\]]*\]/gi, '')
    .replace(/\b(?:Observed|CALCULATED|DERIVED|SECTOR_CONTEXT|baseline|root_cause|financial|diagnostic|section|epoch)\b/gi, '')
    .replace(/\b(?:[0-9a-f]{8}-[0-9a-f-]{20,}|[0-9a-f]{16,})\b/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim() || fallback;
};

/** Arabic sector label for the owner's message. An internal id such as "retail" is never printed. */
const sectorDisplay = (value: unknown): string => {
  const raw = clientText(value);
  if (!raw) return '';
  const hit = sectors.find(sector => sector.id === raw || sector.label === raw);
  if (hit) return hit.label;
  return /[؀-ۿ]/.test(raw) ? capField(raw) : '';
};

const sectorPairLabel = (l1: unknown, l2: unknown): string =>
  Array.from(new Set([sectorDisplay(l1), sectorDisplay(l2)].filter(Boolean))).join(' - ') || 'غير محدد';

const whatsappAnswer = (qa: QuestionAnswerRecord, userName: string): string => {
  const answer = clientText(qa.answer_text);
  if (qa.status !== 'answered' || !answer) {
    return `↳ لم يُجب ${userName} عن هذا السؤال`;
  }
  if (/^(?:[\p{P}\p{S}\s]|…)+$/u.test(answer)) return '↳ (إجابة غير مفهومة)';
  return `↳ ${singleBlock(answer)}`;
};

export function buildWhatsAppDossierText(input: WhatsAppDossierTextInput): string {
  const userName = identityText(input.userName, NAME_MISSING);
  const companyName = identityText(input.companyName, COMPANY_MISSING);
  const sectorParts = [sectorDisplay(input.sectorL1), sectorDisplay(input.sectorL2)].filter(Boolean);
  // F5 (round-5): غياب القطاع ليس هوية ناقصة يُعرض عنها ناقص، بل يُصنَّف ضمن أوسع تصنيف عام.
  const sector = Array.from(new Set(sectorParts)).join(' / ') || 'الأعمال والخدمات';
  const location = [input.country, input.city].map(value => identityText(value, '')).filter(Boolean).join(' / ') || 'لم يُدخل';
  const blindSpotNames = input.blindSpots.slice(0, 3).map(spot => platformText(spot.name)).filter(Boolean);
  const scoreLine = typeof input.overallScore === 'number' && Number.isFinite(input.overallScore)
    ? `النتيجة ${input.overallScore}/100 (${platformText(input.healthLabel, 'متوسط')})`
    : SCORE_NOT_COMPUTED;
  const summaryLines = [
    `*تشخيص BIK — ${companyName}*`,
    blindSpotNames.length ? `أبرز ما كشفت الإجابات: ${blindSpotNames[0]}` : 'أبرز ما كشفت الإجابات: تُظهره القراءة الكاملة',
    `الاسم: ${userName}`,
    `النشاط: ${sector}`,
    `الدولة والمدينة: ${location}`,
    scoreLine,
    blindSpotNames.length ? `النقاط العمياء: ${blindSpotNames.join('؛ ')}` : 'النقاط العمياء: لم تُرصد'
  ];
  const summary = summaryLines.join('\n');
  const seen = new Set<number>();
  const qaBlocks = input.qaRecord
    .slice()
    .sort((a, b) => a.question_number - b.question_number)
    .filter(qa => {
      if (seen.has(qa.question_number)) return false;
      seen.add(qa.question_number);
      return true;
    })
    .map(qa => `${qa.question_number}) ${singleBlock(clientText(qa.question_text)) || 'سؤال غير متاح'}\n${whatsappAnswer(qa, userName)}`);
  const priorities = input.priorities.slice(0, 3).map((priority, index) => `${index + 1}) ${platformText(priority.title, 'أولوية غير محددة')}`);
  return [summary, '*الأسئلة والإجابات*', qaBlocks.join('\n\n'), '*الأولويات*', priorities.join('\n'), reviewedSectionText(input.review)].filter(Boolean).join('\n\n');
}

export function buildDualLayerReport(params: BuildDualLayerParams): DualLayerReport {
  const {
    scoreResult,
    companyData,
    intakeAnswers = {},
    universalAnswers = {},
    sectorAnswers = {},
    deltaAnswers = {},
    baseReport,
    questionHistory,
    sessionId = '',
    diagnosticDepth = 'quick',
    sessionTimestamp
  } = params;

  const companyName = companyData.companyName || 'الشركة';
  const userName = companyData.userName || 'العميل';
  const sectorL1 = companyData.sectorL1 || 'الأعمال والخدمات';
  const sectorL2 = companyData.sectorL2 || sectorL1;
  const country = companyData.country || intakeAnswers.country || 'غير محدد';
  const city = companyData.city || intakeAnswers.city || 'غير محدد';
  const whatsapp = companyData.whatsapp || '';

  const combinedAnswers = {
    ...intakeAnswers,
    ...universalAnswers,
    ...sectorAnswers,
    ...deltaAnswers
  };

  // النقاط العمياء المالية: مشتقة من أرقام العميل المصرَّح بها وحدها في أسئلة التشخيص العميق.
  const declaredRevenue = scoreResult.financialImpact?.metrics?.monthlyRevenue?.value
    ?? parseValueNumber(combinedAnswers.u31 ?? combinedAnswers.monthlyRevenue);
  const deepRevenue = parseValueNumber(sectorL1 === 'professional' ? combinedAnswers.prd01 : combinedAnswers.ud01);
  const monthlyRevenue = declaredRevenue ?? deepRevenue;
  const hasRevenue = monthlyRevenue !== null && Number.isFinite(monthlyRevenue) && monthlyRevenue > 0;
  const sectorBlindSpots = computeSectorBlindSpots(companyData.sectorL1, { ...combinedAnswers, u31: declaredRevenue });

  // Extract score metrics safely regardless of interface variant. NaN never counts as a score.
  const rawOverall = (scoreResult as any).overallScore ?? (scoreResult as any).overall ?? baseReport?.health_score;
  const overallScore = typeof rawOverall === 'number' && Number.isFinite(rawOverall) ? rawOverall : 0;
  // false = placeholder number (insufficient data): never print it as a measurement.
  // A score object without a finite overall number is structurally incomplete:
  // it is uncomputed, never 0/100. The placeholder 0 must never surface as a measurement.
  const overallComputed = typeof rawOverall === 'number' && Number.isFinite(rawOverall)
    && (scoreResult as any).overallComputed !== false
    && baseReport?.health_score_computed !== false;
  const confidence = (scoreResult as any).confidence ?? (scoreResult as any).overallConfidence ?? baseReport?.confidence ?? 'متوسط';
  const coverage = (scoreResult as any).coverage ?? (scoreResult as any).overallCoverage ?? baseReport?.coverage ?? 0;

  // 1. Build Evidence-Based SWOT
  const evidenceSwot = buildEvidenceBasedSwot(scoreResult, combinedAnswers, sectorL1, sectorL2);

  // 2. Build Complete Question -> Answer Record
  // If questionHistory is present, it is the canonical chronological session ledger!
  const qaRecord: QuestionAnswerRecord[] = [];

  if (questionHistory && questionHistory.length > 0) {
    questionHistory.forEach((entry) => {
      const qMeta = findQuestionMeta(entry.questionId, sectorL1, sectorL2);
      let answerText = '';
      if (entry.status === 'answered') {
        answerText = entry.answerText || String(entry.answerValue ?? '');
      } else if (entry.status === 'unanswered') {
        answerText = 'لم تتم الإجابة (عُرض ولم يُجب)';
      } else if (entry.status === 'skipped') {
        answerText = 'تم التخطي';
      } else {
        answerText = 'عُرض ولم يُجب بعد';
      }

      qaRecord.push({
        question_number: entry.sequence,
        question_id: entry.questionId,
        // An internal code is never client prose: without a real question text the
        // record carries the neutral phrase, never the raw id.
        question_text: entry.questionText || qMeta?.text || 'سؤال غير متاح',
        answer_text: answerText,
        answer_value: entry.answerValue ?? null,
        normalized_answer: entry.answerValue ?? null,
        answer_type: qMeta?.type || 'single_choice',
        dimension: entry.dimension || qMeta?.dimension || 'عام',
        diagnostic_role: entry.diagnosticRole || qMeta?.role || 'signal',
        evidence_weight: qMeta?.evidenceWeight || 1.0,
        status: entry.status,
        shown_at: entry.shownAt,
        answered_at: entry.answeredAt
      });
    });
  } else {
    // Fallback reconstruction for sessions without questionHistory (legacy / direct tests)
    let questionCounter = 1;
    const allSectorQuestionsList = Object.values(sectorQuestions).flat();

    // A. Process Intake Answers
    Object.keys(intakeAnswers).forEach(key => {
      const val = intakeAnswers[key];
      if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
        return;
      }
      const meta = INTAKE_QUESTIONS_META[key];
      if (meta) {
        let answerText = String(val);
        if (meta.options) {
          const matched = meta.options.find(o => o.value === String(val));
          if (matched) answerText = matched.label;
        } else if (Array.isArray(val)) {
          answerText = val.join('، ');
        } else if (meta.unit) {
          answerText = `${val}${meta.unit}`;
        }

        qaRecord.push({
          question_number: questionCounter++,
          question_id: meta.id,
          question_text: meta.question,
          answer_text: answerText,
          answer_value: val,
          normalized_answer: val,
          answer_type: meta.type,
          dimension: meta.dimension,
          diagnostic_role: meta.diagnosticRole,
          evidence_weight: 1.0,
          status: 'answered'
        });
      }
    });

    // B. Process Universal Questions
    universalQuestions.forEach(q => {
      if (universalAnswers[q.id] !== undefined && universalAnswers[q.id] !== null && universalAnswers[q.id] !== '') {
        const val = universalAnswers[q.id];
        let answerText = String(val);

        if (q.options && q.options.length > 0) {
          if (Array.isArray(val)) {
            answerText = val.map(v => q.options?.find(o => o.value === String(v))?.label || v).join('، ');
          } else {
            const matched = q.options.find(o => o.value === String(val));
            if (matched) answerText = matched.label;
          }
        } else if (q.unit) {
          answerText = `${val} ${q.unit}`;
        } else if (q.type === 'number') {
          answerText = Number(val).toLocaleString('en-US');
        }

        const meta = UNIVERSAL_QUESTION_METADATA[q.id];
        const role = meta?.diagnosticRole || 'baseline';

        qaRecord.push({
          question_number: questionCounter++,
          question_id: q.id,
          question_text: q.question,
          answer_text: answerText,
          answer_value: val,
          normalized_answer: val,
          answer_type: q.type,
          dimension: q.dimension,
          diagnostic_role: role,
          evidence_weight: meta?.evidenceWeight || 1.0,
          status: 'answered'
        });
      }
    });

    // C. Process Sector Questions
    allSectorQuestionsList.forEach(q => {
      if (sectorAnswers[q.id] !== undefined && sectorAnswers[q.id] !== null && sectorAnswers[q.id] !== '') {
        const val = sectorAnswers[q.id];
        let answerText = String(val);

        if (q.options && q.options.length > 0) {
          if (Array.isArray(val)) {
            answerText = val.map(v => q.options?.find(o => o.value === String(v))?.label || v).join('، ');
          } else {
            const matched = q.options.find(o => o.value === String(val));
            if (matched) answerText = matched.label;
          }
        } else if (q.unit) {
          answerText = `${val} ${q.unit}`;
        } else if (q.type === 'number') {
          answerText = Number(val).toLocaleString('en-US');
        }

        qaRecord.push({
          question_number: questionCounter++,
          question_id: q.id,
          question_text: q.question,
          answer_text: answerText,
          answer_value: val,
          normalized_answer: val,
          answer_type: q.type,
          dimension: q.dimension,
          diagnostic_role: 'signal',
          evidence_weight: 1.0,
          status: 'answered'
        });
      }
    });
  }

  // 3. Build Evidence Map
  const evidenceMap: ConsultantDossier['evidence_map'] = [];
  
  // From validated diagnoses
  const diagFindings = (scoreResult as any).diagnosticFindings;
  if (diagFindings?.validated_diagnoses) {
    diagFindings.validated_diagnoses.forEach((vd: any, idx: number) => {
      const supportingAns: Array<{ question_id: string; question_text: string; answer_text: string }> = [];
      vd.evidenceRefs?.forEach((refId: string) => {
        const found = qaRecord.find(qa => qa.question_id === refId);
        if (found) {
          supportingAns.push({
            question_id: found.question_id,
            question_text: found.question_text,
            answer_text: found.answer_text
          });
        }
      });

      evidenceMap.push({
        finding_id: vd.id || `vd-${idx}`,
        finding_title: vd.title,
        dimension: vd.dimension,
        confidence: vd.confidence >= 0.7 ? 'عالي' : 'متوسط',
        supporting_question_ids: vd.evidenceRefs || [],
        supporting_answers: supportingAns
      });
    });
  }

  // From weaknesses
  if (scoreResult.topWeaknesses) {
    scoreResult.topWeaknesses.forEach((w, idx) => {
      const found = qaRecord.find(qa => qa.question_id === w.sourceQuestionId);
      const supportingAns = found ? [{
        question_id: found.question_id,
        question_text: found.question_text,
        answer_text: found.answer_text
      }] : [];

      evidenceMap.push({
        finding_id: `weakness-${idx}`,
        finding_title: `${w.questionLabel}: ${w.findingDescription}`,
        dimension: w.dimension,
        confidence: 'عالي',
        supporting_question_ids: [w.sourceQuestionId],
        supporting_answers: supportingAns
      });
    });
  }

  // 4. Financial Inputs & Calculations
  const finInputs: Record<string, any> = {};
  const normalizedFinancialInputs = extractFinancialInputs(universalAnswers, intakeAnswers);
  ['u06', 'u31', 'u32', 'u33', 'u34', 'u35'].forEach(k => {
    if (universalAnswers[k] !== undefined) finInputs[k] = universalAnswers[k];
  });
  ['monthlyRevenue', 'monthlyCosts', 'monthlyMarketing', 'breakEven', 'roi', 'hasDebt', 'debtMonthlyPct', 'fixedCostsPct'].forEach(k => {
    if (intakeAnswers[k] !== undefined) finInputs[k] = intakeAnswers[k];
  });

  const finMetrics = scoreResult.financialImpact?.metrics || {};
  const isComputable = Boolean(scoreResult.financialImpact?.isComputable);
  const currency = scoreResult.financialImpact?.currency || 'عملة غير محددة';

  const financialCalculations: ConsultantDossier['financial_calculations'] = {
    monthly_revenue: {
      value: finMetrics.monthlyRevenue?.value ?? null,
      label: 'الإيراد الشهري المصرّح',
      type: 'INPUT'
    },
    annual_revenue: {
      value: finMetrics.annualRevenue?.value ?? null,
      label: 'الإيراد السنوي التقديري',
      type: 'CALCULATED'
    },
    monthly_net_profit: {
      value: finMetrics.monthlyNetProfit?.value ?? null,
      label: 'صافي الربح الشهري بمعادلة ثابتة',
      type: 'CALCULATED'
    },
    annual_net_profit: {
      value: finMetrics.annualNetProfit?.value ?? null,
      label: 'صافي الربح السنوي التقديري',
      type: 'CALCULATED'
    },
    cac_spend: {
      value: finMetrics.monthlyCACSpend?.value ?? null,
      label: 'الإنفاق الشهري على اكتساب العملاء',
      type: 'CALCULATED'
    },
    relevant_scenarios: (scoreResult.financialImpact?.scenarios || [])
      .filter(sc => sc.projectedMonthlyGain != null)
      .map((sc: any) => ({
        name: sc.name || sc.label,
        projectedMonthlyGain: sc.projectedMonthlyGain,
        basis: sc.basis || sc.disclaimer,
        type: 'SCENARIO' as const
      })),
    is_computable: isComputable,
    currency,
    uncomputableReason: scoreResult.financialImpact?.uncomputableReason,
    declared_value_model: scoreResult.financialImpact?.declaredValueModel
  };

  // 5. Build Consultant Note
  const strongestSignal = scoreResult.topStrengths?.[0]?.findingDescription || 
    (universalAnswers.u01 === 'always' ? 'وضوح الرسالة التسويقية والقيمة المقدمة للعملاء لدى جميع الموظفين' : 'جاهزية الإدارة للتقييم الموضوعي والمصداقية العالية');
  
  const highestRiskIssue = scoreResult.topWeaknesses?.[0]
    ? `اختناق في بُعد ${scoreResult.topWeaknesses[0].dimension}: ${scoreResult.topWeaknesses[0].findingDescription}`
    : 'الحاجة لتوثيق إجراءات العمل ونقل الاعتمادية عن الإدارة العليا';

  let biggestContradiction = 'لا توجد مفارقات حادة بين الإفصاحات المصرح بها والأداء التشغيلي العام.';
  if (finMetrics.monthlyRevenue?.value && (finMetrics.monthlyNetProfit?.value || 0) <= 0) {
    biggestContradiction = 'حجم إيرادات قائم مع تآكل كامل في هامش صافي الربح التشغيلي، مما يعكس تسرباً في التكاليف أو تسعيراً متدنياً.';
  } else if (universalAnswers.u03 === 'no' && (intakeAnswers.companyAge === '3-7 سنوات' || intakeAnswers.companyAge === 'أكثر من 7 سنوات')) {
    biggestContradiction = 'الشركة تعمل منذ عدة سنوات وتجاوزت مرحلة التأسيس، ومع ذلك لا تزال العمليات متوقفة بالكامل على الحضور اليومي للمؤسس.';
  } else if (universalAnswers.u10 === 'referral_only' && universalAnswers.u01 === 'always') {
    biggestContradiction = 'وضوح القيمة المقدمة لدى الفريق يقابله انحصار شبه كامل لاكتساب العملاء في التوصيات الشفهية دون قنوات مستدامة.';
  }

  const topBlindSpot = baseReport?.blind_spots?.[0] || {
    name: 'الاعتماد التشغيلي غير المحمي',
    description: 'تركيز القرارات في يد القيادة دون وجود بدائل مدربة أو إجراءات عمل قياسية موثقة.',
    impact_level: 'critical' as const
  };

  const financialUncertainty = isComputable
    ? 'البيانات المالية مدخلة بشكل مباشر، مع حاجة لمراجعة وتدقيق دفاتر الحسابات الفعلية للتحقق من هوامش الربحية.'
    : 'لم يتم الإفصاح عن بيانات محاسبية مكتملة (أرقام الإيرادات وهوامش التكاليف غير مسجلة بدقة)، وتعتمد الرؤية على التقديرات التشغيلية.';

  let likelyDecisionBarrier = 'الحاجة لرؤية عائد مباشر وسريع على الخطوات التنفيذية قبل الدخول في مشروعات تطوير مطولة.';
  if (universalAnswers.u03 === 'no' || universalAnswers.u02 === 'cant') {
    likelyDecisionBarrier = 'التردد في تفويض الصلاحيات والخوف من تراجع جودة المخرجات في حال التخلي عن السيطرة اليومية.';
  } else if (intakeAnswers.hasDebt === 'نعم' || (intakeAnswers.debtMonthlyPct && intakeAnswers.debtMonthlyPct > 20)) {
    likelyDecisionBarrier = 'التحفظ الشديد على السيولة النقدية بسبب التزامات الديون قصيرة الأجل وأولوية السداد.';
  } else if (Array.isArray(intakeAnswers.modelsApplied) && intakeAnswers.modelsApplied.includes('لم أطبق أياً من الأعلى')) {
    likelyDecisionBarrier = 'النفور من المصطلحات الإدارية النظرية وتفضيل الحلول الميدانية السريعة القابلة للتطبيق الفوري.';
  }

  const questionsWorthExploring = [
    universalAnswers.u03 === 'no' || universalAnswers.u02 === 'cant'
      ? 'ما هي المهمة التشغيلية اليومية الأكثر استنزافاً لوقتك والتي تتمنى لو كان بإمكانك تفويضها غداً لشخص آخر؟'
      : 'ما هو أكبر عائق يقف بين شركتكم وبين مضاعفة حجم المبيعات خلال الأشهر الاثني عشر القادمة؟',
    isComputable
      ? `كيف يتم تسعير الخدمات الحالية، وهل يأخذ التسعير بعين الاعتبار التكاليف غير المباشرة وهامش الأمان؟`
      : 'ما هي مؤشرات الأداء المالية التي تراقبها بصورة أسبوعية للتحقق من استقرار التدفقات النقدية؟',
    'لو غبت عن الشركة لمدة أسبوعين متتاليين دون اتصال، ما هو أول شيء سيتعطل أو يتراجع مستواه؟',
    'ما هي نقطة القوة التي تجعل عملاءكم يختارونكم تحديداً بدلاً من المنافسين؟'
  ];

  const consultantNote: ConsultantNote = {
    strongest_signal: strongestSignal,
    highest_risk_issue: highestRiskIssue,
    biggest_contradiction: biggestContradiction,
    most_important_blind_spot: `${topBlindSpot.name}: ${topBlindSpot.description}`,
    financial_uncertainty: financialUncertainty,
    likely_decision_barrier: likelyDecisionBarrier,
    questions_worth_exploring: questionsWorthExploring
  };

  // 6. Build Consultant Brief
  const top3FindingsForBrief = (baseReport?.discovered_findings || []).slice(0, 3).map(f => ({
    title: f.title,
    dimension: f.evidence_reference || 'التشخيص التنفيذي',
    status: f.status,
    evidence_ref: f.evidence_reference
  }));

  if (top3FindingsForBrief.length === 0 && scoreResult.topWeaknesses) {
    scoreResult.topWeaknesses.slice(0, 3).forEach(w => {
      top3FindingsForBrief.push({
        title: `${w.questionLabel}: ${w.findingDescription}`,
        dimension: w.dimension,
        status: 'Observed',
        evidence_ref: w.sourceQuestionId
      });
    });
  }

  const top3PrioritiesForBrief = (baseReport?.top_priorities || []).slice(0, 3).map(p => ({
    rank: p.rank,
    title: p.title,
    objective: p.expected_objective
  }));

  const keyDataGapsForBrief = (scoreResult.dataGaps || []).slice(0, 3).map(g => ({
    label: g.label,
    dimension: g.dimension
  }));

  const finSnapshotText = isComputable
    ? `الإيراد: ${finMetrics.monthlyRevenue?.value?.toLocaleString('en-US')} ${currency} | صافي الربح: ${finMetrics.monthlyNetProfit?.value?.toLocaleString('en-US')} ${currency} (محسوب)`
    : 'الأثر المالي: غير مكتمل المدخلات المحاسبية (يتطلب فحص الدفاتر)';

  // Build Plain Text for Copying
  const plainTextBrief = [
    `=== ملخص المستشار — BIK Executive Brief ===`,
    `الشركة: ${companyName} | المؤسس: ${userName}`,
    `القطاع: ${sectorPairLabel(sectorL1, sectorL2)} | الدولة: ${country} (${city})`,
    `مؤشر الصحة التشغيلية: ${overallComputed ? `${overallScore}/100` : 'غير محسوب (بيانات غير كافية)'} | مستوى الثقة: ${confidence} | التغطية: ${coverage}%`,
    ``,
    `--- أهم 3 نتائج تشخيصية ---`,
    ...top3FindingsForBrief.map((f, i) => `${i + 1}. [${f.status}] ${f.title}`),
    ``,
    `--- النقطة العمياء الأبرز ---`,
    `* ${topBlindSpot.name} [خطورة ${topBlindSpot.impact_level}]: ${topBlindSpot.description}`,
    ``,
    `--- اللقطة المالية ---`,
    `* ${finSnapshotText}`,
    ``,
    `--- أهم 3 أولويات للمعالجة ---`,
    ...top3PrioritiesForBrief.map(p => `#${p.rank} ${p.title} — الهدف: ${p.objective}`),
    ``,
    `--- مذكرة المستشار قبل المكالمة ---`,
    `* أقوى إشارة إيجابية: ${consultantNote.strongest_signal}`,
    `* أعلى نقطة خطر: ${consultantNote.highest_risk_issue}`,
    `* المفارقة/التناقض التشغيلي: ${consultantNote.biggest_contradiction}`,
    `* حاجز القرار المرجح: ${consultantNote.likely_decision_barrier}`,
    ``,
    `--- أسئلة موصى بها للاستكشاف ---`,
    ...consultantNote.questions_worth_exploring.map((q, i) => `${i + 1}. ${q}`),
    `==========================================`
  ].join('\n');

  const consultantBrief: ConsultantBrief = {
    company: companyName,
    sector: sectorPairLabel(sectorL1, sectorL2),
    country: `${country} (${city})`,
    health_score: overallScore,
    confidence: confidence,
    coverage: coverage,
    top_3_findings: top3FindingsForBrief,
    top_blind_spot: {
      title: topBlindSpot.name,
      severity: topBlindSpot.impact_level,
      description: topBlindSpot.description
    },
    financial_snapshot: {
      revenue: finMetrics.monthlyRevenue?.value?.toLocaleString('en-US') || 'غير محدد',
      profit: finMetrics.monthlyNetProfit?.value?.toLocaleString('en-US') || 'غير محدد',
      cac: finMetrics.monthlyCACSpend?.value?.toLocaleString('en-US') || 'غير محدد',
      status: isComputable ? 'محسوب حتمياً' : 'غير مكتمل'
    },
    top_3_priorities: top3PrioritiesForBrief,
    key_data_gaps: keyDataGapsForBrief,
    consultant_note: consultantNote,
    plain_text: plainTextBrief
  };

  // Build Candidate Questions and Filter for Branching Analysis
  const candidateQuestions = [
    ...universalQuestions,
    ...getSectorQuestions(sectorL1, sectorL2, diagnosticDepth === 'deep')
  ];

  const shownIds = new Set(
    questionHistory && questionHistory.length > 0
      ? questionHistory.map(q => q.questionId)
      : qaRecord.map(q => q.question_id)
  );

  const notPresentedQuestions = candidateQuestions.filter(q => !shownIds.has(q.id));
  const questionsShownUnanswered = qaRecord.filter(q => q.status === 'unanswered' || (q.status === 'shown' && (q.answer_value === null || q.answer_value === undefined)));
  const questionsAnswered = qaRecord.filter(q => q.status === 'answered');

  // Session Timeline calculation
  const firstShownTime = questionHistory?.[0]?.shownAt;
  const lastTime = questionHistory && questionHistory.length > 0
    ? (questionHistory[questionHistory.length - 1]?.answeredAt || questionHistory[questionHistory.length - 1]?.shownAt)
    : undefined;
  const sessionDurationSec = (firstShownTime && lastTime && lastTime > firstShownTime)
    ? Math.round((lastTime - firstShownTime) / 1000)
    : null;

  const timelineLines = (firstShownTime || lastTime) ? [
    `- بداية الجلسة: ${firstShownTime ? new Date(firstShownTime).toLocaleString('en-US') : 'غير متاح في هذه الجلسة.'}`,
    `- نهاية الجلسة: ${lastTime ? new Date(lastTime).toLocaleString('en-US') : 'غير متاح في هذه الجلسة.'}`,
    `- المدة التقديرية للجلسة: ${sessionDurationSec ? `${Math.floor(sessionDurationSec / 60)} د و ${sessionDurationSec % 60} ث` : 'غير متاح في هذه الجلسة.'}`,
    `- إجمالي الأسئلة المعروضة: ${qaRecord.length}`,
    `- إجمالي الأسئلة المجابة: ${questionsAnswered.length}`,
    `- إجمالي الأسئلة المتروكة دون إجابة: ${questionsShownUnanswered.length}`
  ] : ['غير متاح في هذه الجلسة.'];

  // Financial Inputs Formatted with Missing Declarations Explicitly Marked
  const financialInputsFormatted = [
    `### سجل الإفصاحات المالية الخام:`,
    `- الإيراد الشهري المصرّح: ${normalizedFinancialInputs.monthlyRevenue !== null ? `${normalizedFinancialInputs.monthlyRevenue.toLocaleString('en-US')} ${currency}` : 'غير مصرّح به (مفقود)'}`,
    `- التكاليف والمصروفات الشهرية: ${finInputs.monthlyCosts ? `${Number(finInputs.monthlyCosts).toLocaleString('en-US')} ${currency}` : 'غير مصرّح به (مفقود)'}`,
    `- الإنفاق التسويقي / تكلفة اكتساب العميل (CAC): ${finInputs.monthlyMarketing ? `${Number(finInputs.monthlyMarketing).toLocaleString('en-US')} ${currency}` : 'غير مصرّح به (مفقود)'}`,
    `- هامش صافي الربح المصرّح: ${normalizedFinancialInputs.netMarginPct !== null ? `${normalizedFinancialInputs.netMarginPct}%` : 'غير مصرّح به (مفقود)'}`,
    `- التزامات الديون وأقساط التمويل: ${finInputs.hasDebt ? `${finInputs.hasDebt} (نسبة السداد من الإيراد: ${finInputs.debtMonthlyPct ? finInputs.debtMonthlyPct + '%' : 'غير محددة'})` : 'غير مصرّح به (مفقود)'}`,
    `- نقطة التعادل التشغيلية: ${finInputs.breakEven || 'غير مصرّح به (مفقود)'}`,
    `- نسبة التكاليف الثابتة من المصروفات: ${finInputs.fixedCostsPct ? `${finInputs.fixedCostsPct}%` : 'غير مصرّح به (مفقود)'}`
  ];

  // Financial Calculations Formatted
  const financialCalculationsFormatted: string[] = [];
  if (isComputable) {
    financialCalculationsFormatted.push(`- حالة الحساب: محسوب بمعادلة ثابتة`);
    financialCalculationsFormatted.push(`- الإيراد السنوي التقديري: ${finMetrics.annualRevenue?.value ? `${finMetrics.annualRevenue.value.toLocaleString('en-US')} ${currency}` : 'غير متاح في هذه الجلسة.'}`);
    financialCalculationsFormatted.push(`- صافي الربح الشهري بمعادلة ثابتة: ${finMetrics.monthlyNetProfit?.value !== undefined ? `${finMetrics.monthlyNetProfit.value.toLocaleString('en-US')} ${currency}` : 'غير متاح في هذه الجلسة.'}`);
    financialCalculationsFormatted.push(`- صافي الربح السنوي التقديري: ${finMetrics.annualNetProfit?.value !== undefined ? `${finMetrics.annualNetProfit.value.toLocaleString('en-US')} ${currency}` : 'غير متاح في هذه الجلسة.'}`);
    financialCalculationsFormatted.push(`- الإنفاق الشهري على اكتساب العملاء: ${finMetrics.monthlyCACSpend?.value !== undefined ? `${finMetrics.monthlyCACSpend.value.toLocaleString('en-US')} ${currency}` : 'غير متاح في هذه الجلسة.'}`);
    if (financialCalculations.relevant_scenarios && financialCalculations.relevant_scenarios.length > 0) {
      financialCalculationsFormatted.push(`### سيناريوهات التحسين المالي المحسوبة:`);
      financialCalculations.relevant_scenarios.forEach(sc => {
        financialCalculationsFormatted.push(`- سيناريو [${sc.name}]: أثر شهري متوقع +${sc.projectedMonthlyGain.toLocaleString('en-US')} ${currency} (الأساس: ${sc.basis || 'حسابي بمعادلة ثابتة'})`);
      });
    }
  } else {
    financialCalculationsFormatted.push(`- حالة الحساب: غير قابل للحساب بمعادلة ثابتة (بيانات أولية غير مكتملة)`);
    financialCalculationsFormatted.push(`- سبب عدم إمكانية الحساب: ${scoreResult.financialImpact?.uncomputableReason || 'نقص في مدخلات الإيرادات الدقيقة أو هوامش الربحية والتكاليف'}`);
  }
  const declaredValue = scoreResult.financialImpact?.declaredValueModel;
  if (declaredValue) {
    financialCalculationsFormatted.push(`### نموذج القيمة المصرّح به (مشروط وليس وعداً):`);
    if (declaredValue.isComputable) {
      financialCalculationsFormatted.push(`- الأثر الإجمالي خلال ${declaredValue.evaluationDays} يوماً: ${declaredValue.grossImpactLow}–${declaredValue.grossImpactHigh} ${declaredValue.currency}`);
      financialCalculationsFormatted.push(`- الصافي بعد تكلفة التنفيذ: ${declaredValue.netBenefitLow}–${declaredValue.netBenefitHigh} ${declaredValue.currency}`);
      financialCalculationsFormatted.push(`- الصافي عند عدم تحقق التحسن: ${declaredValue.noImprovementNetBenefit} ${declaredValue.currency}`);
      financialCalculationsFormatted.push(`- بعد أتعاب الأسبوع: ${declaredValue.focusedWeekNetBenefitLow}–${declaredValue.focusedWeekNetBenefitHigh} ${declaredValue.currency}؛ عند عدم التحسن: ${declaredValue.focusedWeekNoImprovementNetBenefit} ${declaredValue.currency}`);
      financialCalculationsFormatted.push(`- بعد أتعاب الشهر: ${declaredValue.monthlyRetainerNetBenefitLow}–${declaredValue.monthlyRetainerNetBenefitHigh} ${declaredValue.currency}؛ عند عدم التحسن: ${declaredValue.monthlyRetainerNoImprovementNetBenefit} ${declaredValue.currency}`);
    } else {
      financialCalculationsFormatted.push(`- غير قابل للحساب: ${declaredValue.gaps.join('، ') || 'مدخلات القيمة المصرّح بها غير مكتملة'}`);
    }
    financialCalculationsFormatted.push(`- ${declaredValue.disclaimer}`);
  }
  if (hasRevenue && sectorBlindSpots.monthlyTotal !== null) {
    financialCalculationsFormatted.push(`### النقاط العمياء المالية (مشتقة من أرقام العميل المصرَّح بها في التشخيص العميق، لكل شهر):`);
    sectorBlindSpots.spots.forEach(spot => {
      financialCalculationsFormatted.push(`- ${spot.name}: ${spot.monthlyAmount.toLocaleString('en-US')} ${currency} شهرياً`);
    });
    financialCalculationsFormatted.push(`- الإجمالي الشهري المشتق: ${sectorBlindSpots.monthlyTotal.toLocaleString('en-US')} ${currency} (قاعدة اشتقاق، ليست وعداً)`);
  }

  // Contradictions List
  const conflictedFindingsList = ((scoreResult as any).diagnosticFindings?.conflicted_findings || []).map((cf: any) => 
    `- [${cf.dimension || 'مفارقة'}] ${cf.title || cf.description || 'مفارقة بين الإجابات'}`
  );
  const contradictionsLines = conflictedFindingsList.length > 0
    ? conflictedFindingsList
    : (consultantNote.biggest_contradiction && consultantNote.biggest_contradiction !== 'لا توجد مفارقات حادة بين الإفصاحات المصرح بها والأداء التشغيلي العام.'
        ? [`- ${consultantNote.biggest_contradiction}`]
        : ['لا توجد مفارقات أو تناقضات مرصودة بين الإجابات في هذه الجلسة.']);

  // Timestamp String
  const timestampVal = sessionTimestamp || firstShownTime;
  const sessionTimestampFormatted = timestampVal
    ? [
        `- التاريخ والوقت: ${new Date(timestampVal).toLocaleString('en-US')}`,
        `- التوقيت الرقمي (Epoch): ${timestampVal}`
      ]
    : ['غير متاح في هذه الجلسة.'];

  // One WhatsApp-safe client handoff builder; no file/download format is created.
  // The assembled text is scrubbed a final time: an internal code that slipped past
  // any upstream source can never reach the owner message or the consultant link.
  const fullDossierText = scrubInternalIds(buildWhatsAppDossierText({
    companyName,
    userName,
    sectorL1,
    sectorL2,
    country,
    city,
    overallScore: overallComputed ? overallScore : null,
    healthLabel: baseReport?.health_label || 'متوسط',
    blindSpots: baseReport?.blind_spots || [],
    qaRecord,
    priorities: baseReport?.top_priorities || []
  }));
  // Build Consultant Dossier
  const consultantDossier: ConsultantDossier = {
    review: buildReviewedSections(params.review),
    company_profile: {
      name: userName,
      company: companyName,
      sector: sectorL1,
      sub_sector: sectorL2,
      country,
      city,
      contact_info: whatsapp
    },
    qa_record: qaRecord,
    diagnostic_scores: {
      overall_score: overallScore,
      health_label: baseReport?.health_label || 'مستقر',
      axis_scores: scoreResult.axisScores,
      axis_details: scoreResult.axisDetails,
      coverage: coverage,
      confidence: confidence
    },
    diagnostic_findings: (scoreResult as any).diagnosticFindings || {
      observed_weaknesses: [],
      hypotheses: [],
      validated_diagnoses: [],
      conflicted_findings: [],
      insufficient_data_findings: []
    },
    evidence_map: evidenceMap,
    blind_spots: (baseReport?.blind_spots || []).map(b => ({
      title: b.name,
      severity: b.impact_level,
      description: b.description,
      evidence: b.source_question,
      related_questions: [b.source_question]
    })),
    financial_inputs: finInputs,
    financial_calculations: financialCalculations,
    swot: evidenceSwot,
    executive_diagnosis: {
      headline: baseReport?.headline_diagnosis || `تشخيص أداء: ${companyName}`,
      one_sentence_explanation: baseReport?.one_sentence_explanation || 'أظهر التحليل مؤشرات استقرار عامة مع وجود فرص تدعيم محددة لحماية الربحية.',
      aha_moment: baseReport?.aha_moment
    },
    top_priorities: (baseReport?.top_priorities || []).slice(0, 3),
    direction_90_days: baseReport?.direction_90_days || {
      days_0_30: { title: 'المرحلة الأولى (الأيام 1–30)', focus: 'التثبيت ومعالجة الاختناقات', actions: ['تحديد المسؤول المباشر', 'مراجعة التكاليف'] },
      days_31_60: { title: 'المرحلة الثانية (الأيام 31–60)', focus: 'توثيق العمليات والمؤشرات', actions: ['توثيق أدلة العمل', 'لوحة متابعة أسبوعية'] },
      days_61_90: { title: 'المرحلة الثالثة (الأيام 61–90)', focus: 'استدامة النمو وبناء الكفاءة', actions: ['تفويض الصلاحيات', 'التوسع المدروس'] }
    },
    data_gaps: ((baseReport?.data_gaps || baseReport?.data_gaps_analysis || []) as any[]).map(dg => ({
      dimension: dg.dimension,
      metric_label: dg.metric_label,
      impact_on_diagnosis: dg.impact_on_diagnosis,
      credibility_note: dg.credibility_note
    })),
    consultant_brief: consultantBrief,
    consultant_note: consultantNote,
    // Preserve visitor wording after the existing platform-text scrub; remove contact details only.
    full_dossier_text: [fullDossierText, reviewedSectionText(params.review)].filter(Boolean).join('\n\n')
  };

  // Build Client Executive Report with canonical session-derived WhatsApp handoff
  const clientWhatsApp = buildConsultantWhatsAppUrl({
    sessionHandoff: {
      userName,
      companyName,
      country: country !== 'غير محدد' ? country : undefined,
      city: city !== 'غير محدد' ? city : undefined,
      // Resolved Arabic labels only: an internal sector id never travels in the handoff message.
      sectorL1: sectorDisplay(sectorL1) || undefined,
      sectorL2: sectorDisplay(sectorL2) || undefined,
      // An uncomputed score is omitted entirely: no 0/100, no NaN/100 in the client's link.
      healthScore: overallComputed && Number.isFinite(overallScore) ? overallScore : undefined,
      coverage: overallComputed && Number.isFinite(coverage) ? coverage : undefined,
      confidence,
      strongestFinding: baseReport?.discovered_findings?.[0]?.title || baseReport?.headline_diagnosis,
      rootCause: baseReport?.aha_moment?.root_cause,
      topPriority: baseReport?.top_priorities?.[0]?.title,
      businessConsequence: baseReport?.top_priorities?.[0]?.expected_objective || baseReport?.discovered_findings?.[0]?.business_consequence,
      financialStatus: scoreResult.financialImpact?.isComputable ? 'مصرّحة وجاهزة للمراجعة التفصيلية' : 'أولية / غير مكتملة (تُستكمل في الجلسة)'
    },
    companyName
  });

  const clientReport: ClientExecutiveReport = {
    sector_sensitivities: hasRevenue ? sectorBlindSpots.sensitivities : [],
    review: buildReviewedSections(params.review),
    executive_diagnosis: {
      headline: baseReport?.headline_diagnosis || `تشخيص أداء: ${companyName}`,
      one_sentence_explanation: baseReport?.one_sentence_explanation || 'أظهر التحليل مؤشرات استقرار عامة مع وجود فرص تدعيم محددة لحماية الربحية.',
      aha_moment: baseReport?.aha_moment
    },
    health_score: overallScore,
    health_score_computed: overallComputed,
    health_label: baseReport?.health_label || 'مستقر',
    coverage: coverage,
    confidence: confidence,
    what_we_discovered: (baseReport?.discovered_findings || []).slice(0, 3).map(f => ({
      ...f,
      // Ensure evidence reference in client view is clean and jargon-free
      evidence_reference: f.evidence_reference.startsWith('u') 
        ? `مستند إلى إجاباتك في التشخيص` 
        : f.evidence_reference
    })),
    why_it_matters: (baseReport?.discovered_findings || []).slice(0, 3).map(f => ({
      title: f.title,
      business_consequence: f.business_consequence,
      trust_category: f.trust_category
    })),
    financial_impact: (() => {
      const base = scoreResult.financialImpact;
      const blindSpotRows = sectorBlindSpots.spots.map(spot => ({ name: spot.name, monthly_amount: spot.monthlyAmount }));
      if (!hasRevenue || sectorBlindSpots.monthlyTotal === null) return base || null;
      const declaredValueModel: DeclaredValueModel = base?.declaredValueModel
        ? { ...base.declaredValueModel, computedMonthlyWaste: sectorBlindSpots.monthlyTotal }
        // لا نموذج قيمة مصرَّح به من الأسئلة المالية المباشرة: تُحمَل الكلفة الشهرية المشتقة
        // من أرقام العميل نفسها في التشخيص العميق (لا رقم يُختلق)، والنموذج يبقى غير محسوب.
        : {
            mode: 'reducible_waste',
            isComputable: false,
            currency: base?.currency || currency,
            evaluationDays: null,
            monthlyReducibleWaste: null,
            computedMonthlyWaste: sectorBlindSpots.monthlyTotal,
            monthlyIncrementalSales: null,
            grossImpactLow: null,
            grossImpactHigh: null,
            netBenefitLow: null,
            netBenefitHigh: null,
            noImprovementNetBenefit: null,
            focusedWeekNoImprovementNetBenefit: null,
            monthlyRetainerNoImprovementNetBenefit: null,
            focusedWeekNetBenefitLow: null,
            focusedWeekNetBenefitHigh: null,
            monthlyRetainerNetBenefitLow: null,
            monthlyRetainerNetBenefitHigh: null,
            breakEvenGrossImpactForWeek: null,
            breakEvenGrossImpactForMonth: null,
            assumptions: [],
            gaps: ['نموذج القيمة المباشر (الإيراد الشهري ونسبة الهدر المصرَّح بهما) لم يُعلن'],
            disclaimer: 'التكلفة أدناه مشتقة من إجابات العميل في التشخيص العميق بمعادلات معلنة، وليست وعداً مالياً.'
          };
      return {
        ...(base || { metrics: {}, scenarios: [], identifiedGaps: [], isComputable: false, currency }),
        declaredValueModel,
        sector_blind_spots: blindSpotRows
      };
    })(),
    swot: evidenceSwot,
    top_priorities: (baseReport?.top_priorities || []).slice(0, 3),
    direction_90_days: baseReport?.direction_90_days || {
      days_0_30: { title: 'المرحلة الأولى (الأيام 1–30)', focus: 'التثبيت ومعالجة الاختناقات', actions: ['تحديد المسؤول المباشر', 'مراجعة التكاليف'] },
      days_31_60: { title: 'المرحلة الثانية (الأيام 31–60)', focus: 'توثيق العمليات والمؤشرات', actions: ['توثيق أدلة العمل', 'لوحة متابعة أسبوعية'] },
      days_61_90: { title: 'المرحلة الثالثة (الأيام 61–90)', focus: 'استدامة النمو وبناء الكفاءة', actions: ['تفويض الصلاحيات', 'التوسع المدروس'] }
    },
    data_gaps: (scoreResult.dataGaps || []).slice(0, 4).map(g => ({
      dimension: g.dimension,
      metric_label: g.label,
      impact_on_diagnosis: `عدم توافر سجلات دورية لمؤشر «${g.label}» حدّ من دقة الفحص في بُعد ${g.dimension}.`,
      credibility_note: 'البدء في قياس هذا المؤشر دورياً يعزز دقة اتخاذ القرار الإداري.'
    })),
    consultant_cta: {
      whatsapp_url: clientWhatsApp.url,
      message_text: clientWhatsApp.messageText || 'أرغب في مناقشة نتائج التشخيص مع أ/ أحمد.'
    },
    strategic_narrative: baseReport?.strategic_narrative,
    behavioral_insight: baseReport?.behavioral_insight
  };

  return {
    clientReport,
    consultantDossier
  };
}
