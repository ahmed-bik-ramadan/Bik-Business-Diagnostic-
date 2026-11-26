// src/services/adaptiveDiagnosticEngine.ts
// BIK Business Intelligence & Knowledge - Deterministic Adaptive Diagnostic Engine
// Phase 2: Diagnostic Intelligence & Adaptive Taxonomy

import {
  QuestionDefinition,
  DiagnosticRole,
  QuestionDependency,
  DiagnosticHypothesis,
  DiagnosticEvidence,
  DiagnosticFinding,
  DimensionCoverage,
  DiagnosticCoverageSummary,
  NextQuestionResult,
  FindingStatus
} from '../types/adaptiveDiagnostic';

import { universalQuestions } from '../data/universalQuestions';
import { getEnrichedQuestion, UNIVERSAL_QUESTION_METADATA } from '../data/questionClassification';
import { STRATEGIC_HYPOTHESES } from '../data/diagnosticHypotheses';
import { getSectorQuestions, getSectorHypotheses } from '../data/sectorRegistry';

export interface AdaptiveEngineContext {
  sessionId?: string;
  sectorL1?: string;
  sectorL2?: string;
  diagnosticDepth?: 'quick' | 'deep';
  answers: Record<string, any>;
  automaticCurrency?: boolean;
}

/**
 * Deterministically evaluates a question dependency rule.
 */
export function evaluateDependency(
  dep: QuestionDependency,
  answers: Record<string, any>
): boolean {
  const answer = answers[dep.questionId];
  if (answer === undefined || answer === null || answer === '') {
    return false;
  }

  const numericAnswer = typeof answer === 'number' ? answer : parseFloat(String(answer));
  const numericVal = typeof dep.value === 'number' ? dep.value : parseFloat(String(dep.value));

  switch (dep.operator) {
    case 'equals':
      return String(answer).toLowerCase() === String(dep.value).toLowerCase();

    case 'not_equals':
      return String(answer).toLowerCase() !== String(dep.value).toLowerCase();

    case 'in':
      if (Array.isArray(dep.value)) {
        return dep.value.some((v) => String(v).toLowerCase() === String(answer).toLowerCase());
      }
      return false;

    case 'contains':
      if (Array.isArray(answer)) {
        return answer.some((ansItem) => String(ansItem).toLowerCase() === String(dep.value).toLowerCase());
      }
      return String(answer).toLowerCase().includes(String(dep.value).toLowerCase());

    case 'gt':
      return !isNaN(numericAnswer) && !isNaN(numericVal) && numericAnswer > numericVal;

    case 'gte':
      return !isNaN(numericAnswer) && !isNaN(numericVal) && numericAnswer >= numericVal;

    case 'lt':
      return !isNaN(numericAnswer) && !isNaN(numericVal) && numericAnswer < numericVal;

    case 'lte':
      return !isNaN(numericAnswer) && !isNaN(numericVal) && numericAnswer <= numericVal;

    default:
      return false;
  }
}

/**
 * Checks if all dependencies of a question are satisfied.
 */
export function areDependenciesSatisfied(
  question: QuestionDefinition,
  answers: Record<string, any>
): boolean {
  if (!question.dependsOn || question.dependsOn.length === 0) {
    return true;
  }
  return question.dependsOn.every((dep) => evaluateDependency(dep, answers));
}

/**
 * Extracts structured evidence from a question answer.
 */
export function extractEvidenceFromAnswer(
  q: QuestionDefinition,
  rawAnswer: unknown
): DiagnosticEvidence | null {
  if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') {
    return null;
  }

  const meta = UNIVERSAL_QUESTION_METADATA[q.id];
  let polarity: 'positive' | 'negative' | 'neutral' = 'neutral';

  const stringVal = String(rawAnswer).toLowerCase();

  // Check explicit signals from metadata
  if (meta?.signalsWeaknessValues?.includes(stringVal)) {
    polarity = 'negative';
  } else if (meta?.signalsStrengthValues?.includes(stringVal)) {
    polarity = 'positive';
  } else if (q.type === 'slider') {
    const numVal = Number(rawAnswer);
    if (!isNaN(numVal)) {
      const highIsBad = q.highIsBad ?? false;
      if (highIsBad) {
        if (numVal < 10) polarity = 'positive';
        else if (numVal > 20) polarity = 'negative';
      } else {
        if (numVal < 30) polarity = 'negative';
        else if (numVal > 70) polarity = 'positive';
      }
    }
  } else if (q.options) {
    const selectedOpt = q.options.find((opt) => opt.value === stringVal);
    if (selectedOpt?.signalPolarity) {
      polarity = selectedOpt.signalPolarity;
    } else if (typeof selectedOpt?.score === 'number') {
      polarity = selectedOpt.score >= 70 ? 'positive' : selectedOpt.score <= 40 ? 'negative' : 'neutral';
    }
  }

  return {
    questionId: q.id,
    answer: rawAnswer,
    dimension: q.dimension,
    diagnosticRole: q.diagnosticRole || 'baseline',
    weight: q.evidenceWeight || 1.0,
    polarity,
    source: 'user_input',
    confidence: q.measurable ? 1.0 : 0.9,
    description: q.label || q.question
  };
}

/**
 * Analyzes evidence to assess hypotheses, detect conflicts, and generate findings.
 */
export function evaluateDiagnosticState(
  allQuestions: QuestionDefinition[],
  hypotheses: DiagnosticHypothesis[],
  answers: Record<string, any>
): {
  evidenceList: DiagnosticEvidence[];
  findings: DiagnosticFinding[];
  activeHypotheses: DiagnosticHypothesis[];
} {
  const questionMap = new Map<string, QuestionDefinition>();
  allQuestions.forEach((q) => questionMap.set(q.id, q));

  // 1. Extract evidence
  const evidenceList: DiagnosticEvidence[] = [];
  const evidenceByQ = new Map<string, DiagnosticEvidence>();

  for (const [qId, ans] of Object.entries(answers)) {
    const def = questionMap.get(qId);
    if (def) {
      const ev = extractEvidenceFromAnswer(def, ans);
      if (ev) {
        evidenceList.push(ev);
        evidenceByQ.set(qId, ev);
      }
    }
  }

  // 2. Evaluate Hypotheses
  const findings: DiagnosticFinding[] = [];
  const activeHypotheses: DiagnosticHypothesis[] = [];

  for (const hyp of hypotheses) {
    const triggerAns = answers[hyp.trigger.questionId];
    const isTriggered = triggerAns !== undefined && evaluateDependency(
      {
        questionId: hyp.trigger.questionId,
        operator: hyp.trigger.operator as any,
        value: hyp.trigger.value
      },
      answers
    );

    if (!isTriggered) {
      continue;
    }

    activeHypotheses.push(hyp);

    // Check Conflict Rules
    let isConflicted = false;
    let conflictReason: string | undefined = undefined;

    if (hyp.conflictRules && hyp.conflictRules.length > 0) {
      for (const rule of hyp.conflictRules) {
        const confAns = answers[rule.conflictingQuestionId];
        if (confAns !== undefined && confAns !== null) {
          const matched = evaluateDependency(
            {
              questionId: rule.conflictingQuestionId,
              operator: rule.operator,
              value: rule.expectedValue
            },
            answers
          );
          if (matched) {
            isConflicted = true;
            conflictReason = rule.reason;
            break;
          }
        }
      }
    }

    // Evaluate supporting evidence
    const relatedQIds = [...hyp.supportingQuestions, ...hyp.validationQuestions];
    const answeredRelated = relatedQIds.filter((qId) => answers[qId] !== undefined);
    const negativeEvCount = answeredRelated.filter((qId) => evidenceByQ.get(qId)?.polarity === 'negative').length;
    const positiveEvCount = answeredRelated.filter((qId) => evidenceByQ.get(qId)?.polarity === 'positive').length;

    // Trigger evidence itself counts as 1 supporting signal
    const totalSignalStrength = negativeEvCount + 1;
    const totalPossibleSignals = relatedQIds.length + 1;

    // Deterministic Confidence Formula:
    // confidence = (answeredRatio * 0.4) + (signalPolarityRatio * 0.6)
    const answeredRatio = answeredRelated.length / Math.max(1, relatedQIds.length);
    const polarityRatio = (totalSignalStrength) / Math.max(1, answeredRelated.length + 1);
    const calculatedConfidence = Math.min(1.0, Math.round(((answeredRatio * 0.4) + (polarityRatio * 0.6)) * 100) / 100);

    const evidenceRefs = [hyp.trigger.questionId, ...answeredRelated];
    const dataGaps = relatedQIds.filter((qId) => answers[qId] === undefined);

    let status: FindingStatus = 'hypothesis';

    if (isConflicted) {
      status = 'conflicted';
    } else if (answeredRelated.length >= 2 && calculatedConfidence >= hyp.confidenceThreshold) {
      status = 'validated';
    } else if (dataGaps.length === 0 && calculatedConfidence < hyp.confidenceThreshold) {
      status = 'insufficient_data';
    } else if (answeredRelated.length === 0) {
      status = 'observed';
    }

    findings.push({
      id: `finding_${hyp.id}`,
      hypothesisId: hyp.id,
      dimension: hyp.dimension,
      title: hyp.title,
      severity: hyp.severity,
      confidence: calculatedConfidence,
      status,
      evidenceRefs,
      dataGaps,
      conflictReason,
      recommendation: hyp.description
    });
  }

  return {
    evidenceList,
    findings,
    activeHypotheses
  };
}

/**
 * Calculates deterministic coverage across dimensions and overall.
 */
export function calculateDiagnosticCoverage(
  allQuestions: QuestionDefinition[],
  answers: Record<string, any>
): DiagnosticCoverageSummary {
  // Filter out questions whose dependencies aren't met
  const relevantQuestions = allQuestions.filter(
    (q) => q.id !== 'u30' && q.diagnosticRole !== 'context' && areDependenciesSatisfied(q, answers)
  );

  const dimensionGroups = new Map<string, QuestionDefinition[]>();
  for (const q of relevantQuestions) {
    if (!dimensionGroups.has(q.dimension)) {
      dimensionGroups.set(q.dimension, []);
    }
    dimensionGroups.get(q.dimension)!.push(q);
  }

  const dimensionCoverages: Record<string, DimensionCoverage> = {};
  let totalAnswered = 0;
  let totalRelevant = relevantQuestions.length;

  for (const [dim, qList] of dimensionGroups.entries()) {
    const answeredCount = qList.filter(
      (q) => answers[q.id] !== undefined && answers[q.id] !== '' && answers[q.id] !== null
    ).length;

    totalAnswered += answeredCount;
    const coveragePct = Math.round((answeredCount / Math.max(1, qList.length)) * 100);

    const confidence: 'عالي' | 'متوسط' | 'منخفض' =
      coveragePct >= 70 ? 'عالي' : coveragePct >= 40 ? 'متوسط' : 'منخفض';

    dimensionCoverages[dim] = {
      dimension: dim,
      coverage: coveragePct,
      confidence,
      answeredQuestions: answeredCount,
      totalRelevantQuestions: qList.length
    };
  }

  const overallCoverage = Math.round((totalAnswered / Math.max(1, totalRelevant)) * 100);
  const overallConfidence: 'عالي' | 'متوسط' | 'منخفض' =
    overallCoverage >= 70 ? 'عالي' : overallCoverage >= 40 ? 'متوسط' : 'منخفض';

  return {
    overallCoverage,
    overallConfidence,
    dimensionCoverages,
    totalAnswered,
    totalEstimated: totalRelevant
  };
}

/**
 * Main Deterministic Adaptive Selection Engine.
 * Decides the NEXT question to deliver based on:
 * 1. Unanswered status
 * 2. Satisfied dependencies
 * 3. Diagnostic role & priority
 * 4. Active hypothesis investigation
 * 5. Stopping criteria (confidence achieved, depth limit, branch exhausted)
 * 
 * NEVER uses an LLM to choose questions.
 */
export function getNextAdaptiveQuestion(context: AdaptiveEngineContext): NextQuestionResult {
  const { sectorL1, sectorL2, diagnosticDepth = 'quick', answers = {}, automaticCurrency = false } = context;

  // 1. Build complete question catalog for the company's context
  const universalEnriched: QuestionDefinition[] = universalQuestions
    .filter(q => !automaticCurrency || q.id !== 'u35')
    .map(q => getEnrichedQuestion(q));

  const sectorEnriched = getSectorQuestions(sectorL1, sectorL2, diagnosticDepth === 'deep');
  const allQuestions: QuestionDefinition[] = [...universalEnriched, ...sectorEnriched];
  // The closing reflection is retained for the session record only. Never expose
  // it to evidence extraction or hypothesis evaluation, even as neutral context.
  const analyticalAnswers = Object.fromEntries(
    Object.entries(answers).filter(([questionId]) => questionId !== 'u30')
  );

  // 2. Build combined hypotheses
  const sectorHypotheses = getSectorHypotheses(sectorL1);
  const allHypotheses: DiagnosticHypothesis[] = [...STRATEGIC_HYPOTHESES, ...sectorHypotheses];

  // 3. Evaluate current evidence, active hypotheses, and coverage
  const { findings, activeHypotheses } = evaluateDiagnosticState(
    allQuestions,
    allHypotheses,
    analyticalAnswers
  );

  const coverage = calculateDiagnosticCoverage(allQuestions, answers);
  const answeredIds = new Set(
    Object.keys(answers).filter(
      (k) => (!automaticCurrency || k !== 'u35') && answers[k] !== undefined && answers[k] !== '' && answers[k] !== null
    )
  );

  // 4. Filter candidate questions:
  // - Unanswered
  // - Dependencies satisfied
  const candidateQuestions = allQuestions.filter((q) => {
    if (answeredIds.has(q.id)) return false;
    return areDependenciesSatisfied(q, answers);
  });

  // F1 (round-5): رحلة التشخيص عقدٌ صريح: الأسئلة التأسيسية أولاً، ثم الأسئلة القطاعية.
  // ما دام سؤال أساسي عالمي (priority <= 2) قابلاً للاختيار، تُحجز أسئلة القطاع عن
 // تحقيق الفرضيات وتحققها وجمع الأساس وفرز الباقي — فلا يعقب سؤال قطاعي أسئلةً
  // تأسيسية عالمية لم تُطرح بعد.
  const universalCoreRemaining = candidateQuestions.some(
    (q) => q.id.startsWith('u') && (q.priority || 5) <= 2
  );
  const selectableQuestions = universalCoreRemaining
    ? candidateQuestions.filter((q) => q.id.startsWith('u'))
    : candidateQuestions;

  // 5. Stopping Rules:
  // A. If all candidate questions are exhausted -> Complete
  if (candidateQuestions.length === 0) {
    return {
      question: null,
      isComplete: true,
      reason: 'baseline_collection',
      diagnosticMessage: 'تم استيفاء كافة الأسئلة التشخيصية المقررة.',
      progress: {
        overallCoverage: 100,
        answeredCount: answeredIds.size,
        estimatedRemaining: 0,
        overallConfidence: coverage.overallConfidence
      },
      diagnosticState: {
        activeHypothesesCount: activeHypotheses.length,
        validatedFindingsCount: findings.filter((f) => f.status === 'validated').length,
        conflictedCount: findings.filter((f) => f.status === 'conflicted').length,
        findings,
        dimensionCoverages: coverage.dimensionCoverages
      }
    };
  }

  // B. Quick Mode Stopping Rule:
  // In quick mode, if all baseline questions (priority <= 2) are answered,
  // at least 25 questions are answered, and active hypotheses have at least 1 validated or resolved finding:
  const baselineRemaining = candidateQuestions.filter(
    (q) => q.diagnosticRole === 'baseline' && q.priority <= 2
  );
  const validatedCount = findings.filter((f) => f.status === 'validated').length;
  const conflictedCount = findings.filter((f) => f.status === 'conflicted').length;

  // The reflective question is intentionally shown once at the end of quick mode,
  // before the early-stop rule can finish the journey. It remains outside all metrics.
  const reflectiveCandidate = candidateQuestions.find((q) => q.id === 'u30');
  if (diagnosticDepth === 'quick' && reflectiveCandidate && answeredIds.size >= 28 && baselineRemaining.length === 0) {
    return {
      question: reflectiveCandidate,
      isComplete: false,
      reason: 'baseline_collection',
      diagnosticMessage: 'سؤال ختامي للتأمل في ما يستحق المراجعة، ولا يدخل في الدرجة.',
      progress: {
        overallCoverage: coverage.overallCoverage,
        answeredCount: answeredIds.size,
        estimatedRemaining: candidateQuestions.length,
        overallConfidence: coverage.overallConfidence
      },
      diagnosticState: {
        activeHypothesesCount: activeHypotheses.length,
        validatedFindingsCount: validatedCount,
        conflictedCount,
        findings,
        dimensionCoverages: coverage.dimensionCoverages
      }
    };
  }

  if (
    diagnosticDepth === 'quick' &&
    answeredIds.size >= 28 &&
    baselineRemaining.length === 0 &&
    (validatedCount >= 2 || candidateQuestions.filter((q) => q.priority <= 3).length === 0)
  ) {
    return {
      question: null,
      isComplete: true,
      diagnosticMessage: 'تم تحقيق كفاية الأدلة التشخيصية المطلوبة للمسار السريع.',
      progress: {
        overallCoverage: coverage.overallCoverage,
        answeredCount: answeredIds.size,
        estimatedRemaining: 0,
        overallConfidence: coverage.overallConfidence
      },
      diagnosticState: {
        activeHypothesesCount: activeHypotheses.length,
        validatedFindingsCount: validatedCount,
        conflictedCount,
        findings,
        dimensionCoverages: coverage.dimensionCoverages
      }
    };
  }

  // 6. Deterministic Next Question Prioritization:
  // Priority Order:
  // Step A: Active Hypothesis Investigation (Root-Cause questions of triggered hypotheses)
  // Step B: Hypothesis Validation Questions (to confirm or refute ambiguity)
  // Step C: High-priority Baseline questions across dimensions with low coverage
  // Step D: Sector-specific signal/root-cause questions
  // Step E: General strategic questions by priority order

  // Step A & B: Check active hypotheses that need supporting or validation answers
  for (const hyp of activeHypotheses) {
    const finding = findings.find((f) => f.hypothesisId === hyp.id);
    if (finding && finding.status === 'hypothesis') {
      // 1. Check supporting root-cause questions (within the selectable set only:
      // a sector question is never returned while universal core questions remain)
      for (const supQId of hyp.supportingQuestions) {
        const candidate = selectableQuestions.find((q) => q.id === supQId);
        if (candidate) {
          return {
            question: candidate,
            isComplete: false,
            reason: 'root_cause_investigation',
            diagnosticMessage: 'سننتقل إلى بعض الأسئلة الإضافية لتحديد سبب هذه النتيجة بدقة.',
            progress: {
              overallCoverage: coverage.overallCoverage,
              answeredCount: answeredIds.size,
              estimatedRemaining: candidateQuestions.length,
              overallConfidence: coverage.overallConfidence
            },
            diagnosticState: {
              activeHypothesesCount: activeHypotheses.length,
              validatedFindingsCount: validatedCount,
              conflictedCount,
              findings,
              dimensionCoverages: coverage.dimensionCoverages
            }
          };
        }
      }

      // 2. Check validation questions (same selectable-set rule)
      for (const valQId of hyp.validationQuestions) {
        const candidate = selectableQuestions.find((q) => q.id === valQId);
        if (candidate) {
          return {
            question: candidate,
            isComplete: false,
            reason: 'validation_confirmation',
            diagnosticMessage: 'نحتاج إلى معلومتين إضافيتين للتحقق من هذا المؤشر.',
            progress: {
              overallCoverage: coverage.overallCoverage,
              answeredCount: answeredIds.size,
              estimatedRemaining: candidateQuestions.length,
              overallConfidence: coverage.overallConfidence
            },
            diagnosticState: {
              activeHypothesesCount: activeHypotheses.length,
              validatedFindingsCount: validatedCount,
              conflictedCount,
              findings,
              dimensionCoverages: coverage.dimensionCoverages
            }
          };
        }
      }
    }
  }

  // Step C: Baseline collection for dimensions with low coverage (< 40%)
  const dimensionsWithLowData = Object.values(coverage.dimensionCoverages)
    .filter((d) => d.coverage < 40)
    .map((d) => d.dimension);

  const baselineCandidateInLowDim = selectableQuestions.find(
    (q) => q.diagnosticRole === 'baseline' && dimensionsWithLowData.includes(q.dimension)
  );

  if (baselineCandidateInLowDim) {
    return {
      question: baselineCandidateInLowDim,
      isComplete: false,
      reason: 'baseline_collection',
      diagnosticMessage: 'استكمال المؤشرات التأسيسية للمحور.',
      progress: {
        overallCoverage: coverage.overallCoverage,
        answeredCount: answeredIds.size,
        estimatedRemaining: candidateQuestions.length,
        overallConfidence: coverage.overallConfidence
      },
      diagnosticState: {
        activeHypothesesCount: activeHypotheses.length,
        validatedFindingsCount: validatedCount,
        conflictedCount,
        findings,
        dimensionCoverages: coverage.dimensionCoverages
      }
    };
  }

  // Step D: Sort remaining candidates deterministically by priority and evidence weight
  // (from the selectable set: universal core first, sector questions only after it)
  const sortedCandidates = [...selectableQuestions].sort((a, b) => {
    // 1. Lower priority number comes first (1 before 2)
    const prioDiff = (a.priority || 5) - (b.priority || 5);
    if (prioDiff !== 0) return prioDiff;

    // 2. Higher evidence weight comes first (2.0 before 1.0)
    const weightDiff = (b.evidenceWeight || 1.0) - (a.evidenceWeight || 1.0);
    if (weightDiff !== 0) return weightDiff;

    // 3. Deterministic alphabetical fallback by id (e.g. u01 before u02)
    return a.id.localeCompare(b.id);
  });

  const nextQ = sortedCandidates[0];

  let reason: NextQuestionResult['reason'] = 'baseline_collection';
  let diagnosticMessage = 'جاري تقييم المحاور الاستراتيجية.';

  if (nextQ.diagnosticRole === 'financial') {
    reason = 'financial_context';
    diagnosticMessage = 'البيانات المالية المباشرة لحساب مؤشرات الأثر والقيمة.';
  } else if (nextQ.sectorId) {
    reason = 'sector_specialization';
    diagnosticMessage = 'أسئلة تشخيصية تخصصية مرتبطة بقطاع عملك.';
  } else if (nextQ.diagnosticRole === 'root_cause') {
    reason = 'root_cause_investigation';
    diagnosticMessage = 'سننتقل إلى بعض الأسئلة الإضافية لتحديد سبب هذه النتيجة.';
  } else if (nextQ.diagnosticRole === 'validation') {
    reason = 'validation_confirmation';
    diagnosticMessage = 'نحتاج إلى معلومتين إضافيتين للتحقق من هذا المؤشر.';
  }

  return {
    question: nextQ,
    isComplete: false,
    reason,
    diagnosticMessage,
    progress: {
      overallCoverage: coverage.overallCoverage,
      answeredCount: answeredIds.size,
      estimatedRemaining: sortedCandidates.length,
      overallConfidence: coverage.overallConfidence
    },
    diagnosticState: {
      activeHypothesesCount: activeHypotheses.length,
      validatedFindingsCount: validatedCount,
      conflictedCount,
      findings,
      dimensionCoverages: coverage.dimensionCoverages
    }
  };
}
