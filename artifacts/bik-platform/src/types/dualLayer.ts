/**
 * BIK V1 Dual-Layer Report Architecture
 * Phase 3B: Client Executive Report + Consultant Handoff Dossier
 */

import { FinancialImpactResult } from '../services/deterministicScoring';

export type SwotClassification = 'OBSERVED' | 'CALCULATED' | 'DERIVED' | 'SECTOR_CONTEXT';

export interface SwotItem {
  text: string;
  classification: SwotClassification;
  evidence: string; // Question IDs, calculation notes, or sector references
  evidence_label?: string; // Human-readable evidence reference for client view
  basis?: string;
  dimension?: string;
}

export interface EvidenceBasedSwot {
  strengths: SwotItem[];
  weaknesses: SwotItem[];
  opportunities: SwotItem[];
  threats: SwotItem[];
}

export type QuestionLedgerStatus = 'shown' | 'answered' | 'unanswered' | 'skipped';

export interface QuestionLedgerEntry {
  sequence: number;
  questionId: string;
  questionText: string;
  dimension?: string;
  diagnosticRole?: string;
  shownAt: number;
  answeredAt?: number;
  status: QuestionLedgerStatus;
  answerValue?: any;
  answerText?: string;
}

export interface QuestionAnswerRecord {
  question_number: number;
  question_id: string;
  question_text: string;
  answer_text: string; // Preserved human-readable answer
  answer_value: any; // Raw or normalized value
  normalized_answer?: any;
  answer_type: string;
  dimension: string;
  diagnostic_role: string;
  evidence_weight?: number | string;
  status?: QuestionLedgerStatus;
  shown_at?: number;
  answered_at?: number;
}

export interface ConsultantNote {
  strongest_signal: string;
  highest_risk_issue: string;
  biggest_contradiction: string;
  most_important_blind_spot: string;
  financial_uncertainty: string;
  likely_decision_barrier: string;
  questions_worth_exploring: string[];
}

export interface ConsultantBrief {
  company: string;
  sector: string;
  country: string;
  health_score: number;
  confidence: 'عالي' | 'متوسط' | 'منخفض';
  coverage: number;
  top_3_findings: Array<{
    title: string;
    dimension: string;
    status: string;
    evidence_ref: string;
  }>;
  top_blind_spot: {
    title: string;
    severity: string;
    description: string;
  };
  financial_snapshot: {
    revenue: string;
    profit: string;
    cac: string;
    status: string;
  };
  top_3_priorities: Array<{
    rank: number;
    title: string;
    objective: string;
  }>;
  key_data_gaps: Array<{
    label: string;
    dimension: string;
  }>;
  consultant_note: ConsultantNote;
  plain_text: string; // Optimized text ready to copy to clipboard for WhatsApp or notes
}

export interface ConsultantDossier {
  review?: import('../services/reviewState').ReviewedSection[];
  company_profile: {
    name: string;
    company: string;
    sector: string;
    sub_sector: string;
    country: string;
    city: string;
    contact_info?: string;
  };
  qa_record: QuestionAnswerRecord[];
  diagnostic_scores: {
    overall_score: number;
    health_label: string;
    axis_scores: Record<string, number>;
    axis_details: Record<string, any>;
    coverage: number;
    confidence: 'عالي' | 'متوسط' | 'منخفض';
  };
  diagnostic_findings: {
    observed_weaknesses: Array<{
      id: string;
      dimension: string;
      findingDescription: string;
      sourceQuestionId: string;
    }>;
    hypotheses: Array<{
      id: string;
      dimension: string;
      title: string;
      confidence: number;
      missingEvidence: string[];
    }>;
    validated_diagnoses: Array<{
      id: string;
      dimension: string;
      title: string;
      confidence: number;
      evidenceRefs: string[];
      recommendation?: string;
    }>;
    conflicted_findings: Array<{
      dimension: string;
      description: string;
      conflictingQuestions: string[];
    }>;
    insufficient_data_findings: Array<{
      dimension: string;
      missingQuestions: string[];
      impactOnDiagnosis: string;
    }>;
  };
  evidence_map: Array<{
    finding_id: string;
    finding_title: string;
    dimension: string;
    confidence: string;
    supporting_question_ids: string[];
    supporting_answers: Array<{
      question_id: string;
      question_text: string;
      answer_text: string;
    }>;
    calculation_reference?: string;
  }>;
  blind_spots: Array<{
    title: string;
    severity: 'critical' | 'high' | 'medium';
    description: string;
    evidence: string;
    related_questions: string[];
  }>;
  financial_inputs: Record<string, any>;
  financial_calculations: {
    monthly_revenue: { value: number | null; label: string; type: 'CALCULATED' | 'INPUT' };
    annual_revenue: { value: number | null; label: string; type: 'CALCULATED' };
    monthly_net_profit: { value: number | null; label: string; type: 'CALCULATED' };
    annual_net_profit: { value: number | null; label: string; type: 'CALCULATED' };
    cac_spend: { value: number | null; label: string; type: 'CALCULATED' };
    relevant_scenarios: Array<{ name: string; projectedMonthlyGain: number; basis: string; type: 'SCENARIO' }>;
    is_computable: boolean;
    currency: string;
    uncomputableReason?: string;
    declared_value_model?: import('../services/financialValueModel').DeclaredValueModel;
  };
  swot: EvidenceBasedSwot;
  executive_diagnosis?: {
    headline: string;
    one_sentence_explanation: string;
    aha_moment?: {
      apparent_problem: string;
      root_cause: string;
      is_supported: boolean;
      explanation: string;
      evidence_reference?: string;
    };
  };
  top_priorities?: Array<{
    rank: number;
    title: string;
    why_it_matters: string;
    expected_objective: string;
    first_action: string;
    trust_category?: 'RECOMMENDATION';
  }>;
  direction_90_days?: {
    days_0_30: { title: string; focus: string; actions: string[] };
    days_31_60: { title: string; focus: string; actions: string[] };
    days_61_90: { title: string; focus: string; actions: string[] };
  };
  data_gaps?: Array<{
    dimension: string;
    metric_label: string;
    impact_on_diagnosis: string;
    credibility_note: string;
  }>;
  consultant_brief: ConsultantBrief;
  consultant_note: ConsultantNote;
  full_dossier_text: string;
}

export interface ClientExecutiveReport {
  sector_sensitivities?: import('../services/blindSpotCalculator').SectorBlindSpot[];
  review?: import('../services/reviewState').ReviewedSection[];
  executive_diagnosis: {
    headline: string;
    one_sentence_explanation: string;
    aha_moment?: {
      apparent_problem: string;
      root_cause: string;
      is_supported: boolean;
      explanation: string;
      evidence_reference?: string;
    };
  };
  health_score: number;
  /** false = placeholder number (insufficient data); never display it as a measurement. */
  health_score_computed?: boolean;
  health_label: string;
  coverage: number;
  confidence: 'عالي' | 'متوسط' | 'منخفض';
  what_we_discovered: Array<{
    title: string;
    explanation: string;
    evidence_reference: string;
    confidence: 'عالي' | 'متوسط' | 'منخفض';
    status: 'Observed' | 'Hypothesis' | 'Validated' | 'Insufficient Data';
    business_consequence: string;
    trust_category: 'OBSERVED' | 'CALCULATED' | 'SCENARIO' | 'RECOMMENDATION' | 'DATA GAP';
  }>;
  why_it_matters: Array<{
    title: string;
    business_consequence: string;
    trust_category: 'OBSERVED' | 'CALCULATED' | 'SCENARIO' | 'RECOMMENDATION' | 'DATA GAP';
  }>;
  financial_impact: FinancialImpactResult | null;
  swot: EvidenceBasedSwot;
  top_priorities: Array<{
    rank: number;
    title: string;
    why_it_matters: string;
    expected_objective: string;
    first_action: string;
    trust_category?: 'RECOMMENDATION';
  }>;
  direction_90_days: {
    days_0_30: { title: string; focus: string; actions: string[] };
    days_31_60: { title: string; focus: string; actions: string[] };
    days_61_90: { title: string; focus: string; actions: string[] };
  };
  data_gaps: Array<{
    dimension: string;
    metric_label: string;
    impact_on_diagnosis: string;
    credibility_note: string;
  }>;
  consultant_cta: {
    whatsapp_url: string;
    message_text: string;
  };
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
}

export interface DualLayerReport {
  clientReport: ClientExecutiveReport;
  consultantDossier: ConsultantDossier;
}
