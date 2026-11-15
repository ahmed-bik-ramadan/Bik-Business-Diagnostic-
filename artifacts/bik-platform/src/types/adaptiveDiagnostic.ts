// src/types/adaptiveDiagnostic.ts
// BIK Business Intelligence & Knowledge - Adaptive Diagnostic Engine Types
// Phase 2: Diagnostic Intelligence & Adaptive Taxonomy

export type DiagnosticRole =
  | 'baseline'
  | 'signal'
  | 'root_cause'
  | 'validation'
  | 'financial'
  | 'context';

export type QuestionType =
  | 'single'
  | 'multi'
  | 'number'
  | 'percentage'
  | 'slider'
  | 'text'
  | 'single_choice'
  | 'multi_choice';

export interface QuestionDependency {
  questionId: string;
  operator: 'equals' | 'not_equals' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
  value: unknown;
}

export interface QuestionOption {
  value: string;
  label: string;
  score?: number;
  weight?: number;
  signalPolarity?: 'positive' | 'negative' | 'neutral';
}

export interface QuestionDefinition {
  id: string;
  sectorId?: string;
  dimension: string;
  type: QuestionType;
  label: string;
  question?: string; // Backwards compatibility with existing dataset
  options?: QuestionOption[];
  required?: boolean;
  measurable?: boolean;
  diagnosticRole?: DiagnosticRole;
  dependsOn?: QuestionDependency[];
  priority?: number; // 1 (highest priority) to 10 (lowest)
  evidenceWeight?: number; // 0.1 to 3.0 (diagnostic signal weight)
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  toastKey?: string;
  highIsBad?: boolean;
}

export interface DiagnosticHypothesis {
  id: string;
  dimension: string;
  title: string;
  description: string;
  trigger: {
    questionId: string;
    operator: 'equals' | 'not_equals' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
    value: unknown;
  };
  supportingQuestions: string[];
  validationQuestions: string[];
  confidenceThreshold: number; // e.g. 0.65 to 0.85
  severity: number; // 1 (minor) to 5 (critical)
  conflictRules?: Array<{
    conflictingQuestionId: string;
    expectedValue: unknown;
    operator: 'equals' | 'not_equals';
    reason: string;
  }>;
}

export interface DiagnosticEvidence {
  questionId: string;
  answer: unknown;
  dimension: string;
  diagnosticRole: DiagnosticRole;
  weight: number;
  polarity: 'positive' | 'negative' | 'neutral';
  source: 'user_input' | 'calculated';
  confidence: number;
  description?: string;
}

export type FindingStatus =
  | 'observed'
  | 'hypothesis'
  | 'validated'
  | 'conflicted'
  | 'insufficient_data';

export interface DiagnosticFinding {
  id: string;
  hypothesisId?: string;
  dimension: string;
  title: string;
  severity: number;
  confidence: number; // 0.0 to 1.0 (strictly deterministic)
  status: FindingStatus;
  evidenceRefs: string[];
  dataGaps: string[];
  conflictReason?: string;
  recommendation?: string;
}

export interface DimensionCoverage {
  dimension: string;
  coverage: number; // 0 to 100%
  confidence: 'عالي' | 'متوسط' | 'منخفض';
  answeredQuestions: number;
  totalRelevantQuestions: number;
}

export interface DiagnosticCoverageSummary {
  overallCoverage: number;
  overallConfidence: 'عالي' | 'متوسط' | 'منخفض';
  dimensionCoverages: Record<string, DimensionCoverage>;
  totalAnswered: number;
  totalEstimated: number;
}

export interface AdaptiveEngineState {
  answeredCount: number;
  evidenceList: DiagnosticEvidence[];
  activeHypotheses: Array<{
    hypothesis: DiagnosticHypothesis;
    supportScore: number;
    refuteScore: number;
    confidence: number;
    status: FindingStatus;
  }>;
  findings: DiagnosticFinding[];
  coverage: DiagnosticCoverageSummary;
  isComplete: boolean;
  stopReason?: 'confidence_achieved' | 'questions_exhausted' | 'low_diagnostic_value' | 'depth_limit_reached';
}

export interface NextQuestionResult {
  question: QuestionDefinition | null;
  isComplete: boolean;
  reason?: 'baseline_collection' | 'root_cause_investigation' | 'validation_confirmation' | 'financial_context' | 'sector_specialization';
  diagnosticMessage?: string;
  progress: {
    overallCoverage: number;
    answeredCount: number;
    estimatedRemaining: number;
    overallConfidence: 'عالي' | 'متوسط' | 'منخفض';
  };
  diagnosticState: {
    activeHypothesesCount: number;
    validatedFindingsCount: number;
    conflictedCount: number;
    findings: DiagnosticFinding[];
    dimensionCoverages: Record<string, DimensionCoverage>;
  };
}
