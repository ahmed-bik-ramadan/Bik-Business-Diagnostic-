import type { FinancialImpactResult, FindingEvidence, EngineMetadata } from '../services/deterministicScoring';

export interface DiagnosticReport {
  review?: import('../services/reviewState').ReviewedSection[];
  headline_diagnosis: string;
  health_score: number;
  /** false = placeholder number (insufficient data); never display it as a measurement. Undefined = legacy (computed). */
  health_score_computed?: boolean;
  health_label: string;
  full_transcript?: string;
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  blind_spots: Array<{
    name: string;
    description: string;
    impact_level: 'critical' | 'high' | 'medium';
    source_question: string;
    estimated_cost: string;
  }>;
  priority_actions: Array<{
    action: string;
    why_now: string;
    expected_impact: string;
    difficulty: 'low' | 'medium' | 'high';
    timeframe: string;
  }>;
  closing_question: string;
  sector_insight: string;
  strategic_narrative?: string;
  behavioral_insight?: string;
  /** @deprecated No longer produced. Offers come only from BIK_OFFERS. */
  service_offers?: Array<{
    name: string;
    price?: string;
    promise: string;
    why_fit: string;
    deliverables: string[];
    next_step: string;
    basis: string;
    value_note?: string;
    break_even_note?: string;
  }>;
  financial_impact?: FinancialImpactResult | null;
  confidence?: 'عالي' | 'متوسط' | 'منخفض';
  coverage?: number;
  engine_metadata?: EngineMetadata;
  evidence?: FindingEvidence[];
  diagnostic_findings?: {
    observed_weaknesses: Array<{ id: string; dimension: string; findingDescription: string; sourceQuestionId: string }>;
    validated_diagnoses: Array<{ id: string; dimension: string; title: string; confidence: number; evidenceRefs: string[]; recommendation?: string }>;
    hypotheses: Array<{ id: string; dimension: string; title: string; confidence: number; missingEvidence: string[] }>;
    data_gaps: Array<{ dimension: string; missingQuestions: string[]; impactOnDiagnosis: string }>;
    financial_calculations: Array<{ metric: string; label: string; value: number | null; unit?: string; interpretation: string }>;
    recommended_diagnostic_steps: Array<{ step: string; priority: 'high' | 'medium' | 'low'; targetDimension: string }>;
  };
  one_sentence_explanation?: string;
  aha_moment?: {
    apparent_problem: string;
    root_cause: string;
    is_supported: boolean;
    explanation: string;
    evidence_reference?: string;
  };
  discovered_findings?: Array<{
    title: string;
    explanation: string;
    evidence_reference: string;
    confidence: 'عالي' | 'متوسط' | 'منخفض';
    status: 'Observed' | 'Hypothesis' | 'Validated' | 'Insufficient Data';
    business_consequence: string;
    trust_category: 'OBSERVED' | 'CALCULATED' | 'SCENARIO' | 'RECOMMENDATION' | 'DATA GAP';
  }>;
  top_priorities?: Array<{
    rank: number;
    title: string;
    why_it_matters: string;
    evidence: string;
    expected_objective: string;
    first_action: string;
    trust_category?: 'RECOMMENDATION';
  }>;
  direction_90_days?: {
    days_0_30: { title: string; focus: string; actions: string[] };
    days_31_60: { title: string; focus: string; actions: string[] };
    days_61_90: { title: string; focus: string; actions: string[] };
  };
  data_gaps_analysis?: Array<{
    dimension: string;
    metric_label: string;
    impact_on_diagnosis: string;
    credibility_note: string;
  }>;
  data_gaps?: Array<{
    dimension: string;
    metric_label: string;
    impact_on_diagnosis: string;
    credibility_note?: string;
  }>;
  evidence_swot?: import('./dualLayer').EvidenceBasedSwot;
  dual_layer?: import('./dualLayer').DualLayerReport;
  knowledge_trace?: Array<{
    rule_id: string;
    source_record_id: string;
    source_scope: string;
    path: string;
    question_ids: string[];
    hypothesis: string;
    evidence_status: 'OBSERVED' | 'HYPOTHESIS';
    service_boundary: string;
  }>;
}

export * from './dualLayer';

export interface LeadData {
  session_id: string;
  user_name: string;
  company_name: string;
  whatsapp: string;
  sector_l1: string;
  sector_l2: string;
  country: string;
  city: string;
}

export interface CompanyIntakeData {
  companyAge: string;
  founderExperience: string;
  country: string;
  city: string;
  businessMotivation: string[];
  modelsApplied: string[];
  modelSuccessRate: number;
  breakEven: string;
  roi: string;
  debt: string;
  debtMonthlyPct: number;
  operationalCostsPct: number;
  competitors: string[];
  differentiators: string[];
  geographicScope: string;
}
