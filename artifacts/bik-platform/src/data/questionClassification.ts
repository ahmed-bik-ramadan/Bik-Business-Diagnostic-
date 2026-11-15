// src/data/questionClassification.ts
// BIK Business Intelligence & Knowledge - Question Role Classification & Taxonomy Metadata
// Phase 2: Diagnostic Intelligence & Adaptive Taxonomy

import { DiagnosticRole, QuestionDependency } from '../types/adaptiveDiagnostic';
import { UniversalQuestion } from './universalQuestions';

export interface QuestionMetadata {
  diagnosticRole: DiagnosticRole;
  priority: number; // 1 (highest/baseline first) to 10
  evidenceWeight: number; // 0.1 to 3.0
  measurable: boolean;
  dependsOn?: QuestionDependency[];
  triggerPolarity?: 'negative' | 'positive' | 'neutral';
  signalsWeaknessValues?: string[];
  signalsStrengthValues?: string[];
}

/**
 * Explicit Classification of Universal Question Bank (u01 - u35)
 * Classifies every question into:
 * BASELINE | SIGNAL | ROOT_CAUSE | VALIDATION | FINANCIAL | CONTEXT
 */
export const UNIVERSAL_QUESTION_METADATA: Record<string, QuestionMetadata> = {
  // Identity & Governance
  u01: {
    diagnosticRole: 'baseline',
    priority: 1,
    evidenceWeight: 1.5,
    measurable: false,
    signalsWeaknessValues: ['never', 'sometimes'],
    signalsStrengthValues: ['always']
  },
  u02: {
    diagnosticRole: 'signal',
    priority: 2,
    evidenceWeight: 2.0,
    measurable: true,
    signalsWeaknessValues: ['gt_month', 'cant'],
    signalsStrengthValues: ['week']
  },
  u03: {
    diagnosticRole: 'signal',
    priority: 2,
    evidenceWeight: 2.0,
    measurable: true,
    signalsWeaknessValues: ['no', 'yes_worried'],
    signalsStrengthValues: ['yes_comfortable']
  },

  // Financial Health & Cash Flow
  u04: {
    diagnosticRole: 'baseline',
    priority: 1,
    evidenceWeight: 1.5,
    measurable: false,
    signalsWeaknessValues: ['negative_surprise', 'unknown'],
    signalsStrengthValues: ['expected']
  },
  u05: {
    diagnosticRole: 'signal',
    priority: 2,
    evidenceWeight: 2.0,
    measurable: true,
    signalsWeaknessValues: ['slower', 'declined'],
    signalsStrengthValues: ['faster', 'same']
  },
  u06: {
    diagnosticRole: 'financial', // Net profit margin numeric input
    priority: 3,
    evidenceWeight: 1.8,
    measurable: true,
    signalsWeaknessValues: ['lt5', 'unknown'],
    signalsStrengthValues: ['gt20', '10_20']
  },
  u07: {
    diagnosticRole: 'root_cause',
    priority: 4,
    evidenceWeight: 1.2,
    measurable: true,
    dependsOn: [{ questionId: 'u05', operator: 'in', value: ['slower', 'declined'] }]
  },

  // Sales, Marketing & Customers
  u08: {
    diagnosticRole: 'baseline',
    priority: 1,
    evidenceWeight: 1.6,
    measurable: true,
    signalsWeaknessValues: ['high_leads_low_sales', 'low_leads', 'unpredictable'],
    signalsStrengthValues: ['steady_growth']
  },
  u09: {
    diagnosticRole: 'signal',
    priority: 2,
    evidenceWeight: 1.8,
    measurable: true,
    signalsWeaknessValues: ['low_repeat', 'high_churn'],
    signalsStrengthValues: ['high_loyalty', 'frequent_repeat']
  },
  u10: {
    diagnosticRole: 'signal',
    priority: 3,
    evidenceWeight: 1.5,
    measurable: true,
    signalsWeaknessValues: ['always_discount', 'severe_resistance'],
    signalsStrengthValues: ['price_maker', 'high_confidence']
  },
  u11: {
    diagnosticRole: 'root_cause',
    priority: 4,
    evidenceWeight: 1.3,
    measurable: true,
    dependsOn: [{ questionId: 'u08', operator: 'in', value: ['high_leads_low_sales', 'low_leads'] }]
  },

  // Team & Operations
  u12: {
    diagnosticRole: 'baseline',
    priority: 1,
    evidenceWeight: 1.5,
    measurable: false,
    signalsWeaknessValues: ['no_middle_mgmt', 'all_on_owner'],
    signalsStrengthValues: ['empowered_leads']
  },
  u13: {
    diagnosticRole: 'root_cause',
    priority: 4,
    evidenceWeight: 1.8,
    measurable: false,
    signalsWeaknessValues: ['verbal_only', 'none'],
    signalsStrengthValues: ['fully_documented']
  },
  u14: {
    diagnosticRole: 'root_cause',
    priority: 4,
    evidenceWeight: 1.4,
    measurable: false,
    signalsWeaknessValues: ['wait_complaints', 'no_followup'],
    signalsStrengthValues: ['systematic_nps', 'automatic_followup']
  },

  // Liquidity & Cash Cycle
  u15: {
    diagnosticRole: 'signal',
    priority: 2,
    evidenceWeight: 2.2,
    measurable: true,
    signalsWeaknessValues: ['lt1month', '1_2months'],
    signalsStrengthValues: ['gt6months', '3_6months']
  },
  u16: {
    diagnosticRole: 'root_cause',
    priority: 4,
    evidenceWeight: 1.7,
    measurable: true,
    signalsWeaknessValues: ['gt60days', 'high_bad_debt'],
    signalsStrengthValues: ['cash_upfront', 'lt30days']
  },

  // Operational Technology & Infrastructure
  u17: {
    diagnosticRole: 'root_cause',
    priority: 5,
    evidenceWeight: 1.2,
    measurable: false,
    signalsWeaknessValues: ['purely_manual', 'isolated_excel'],
    signalsStrengthValues: ['integrated_erp_crm']
  },

  // Competitive Position & Moat
  u18: {
    diagnosticRole: 'baseline',
    priority: 1,
    evidenceWeight: 1.6,
    measurable: false,
    signalsWeaknessValues: ['no_diff', 'price_only'],
    signalsStrengthValues: ['unique_moat', 'high_reputation']
  },
  u19: {
    diagnosticRole: 'root_cause',
    priority: 4,
    evidenceWeight: 1.4,
    measurable: false,
    signalsWeaknessValues: ['forced_price_war', 'losing_deals'],
    signalsStrengthValues: ['premium_pricing_holding']
  },
  u20: {
    diagnosticRole: 'signal',
    priority: 2,
    evidenceWeight: 2.0,
    measurable: true,
    signalsWeaknessValues: ['gt40pct_single', 'gt60pct_top3'],
    signalsStrengthValues: ['well_diversified']
  },
  u21: {
    diagnosticRole: 'validation',
    priority: 4,
    evidenceWeight: 1.5,
    measurable: true,
    signalsWeaknessValues: ['frequent_discounts', 'deal_maker_discount'],
    signalsStrengthValues: ['strict_pricing_policy']
  },

  // HR & Culture
  u22: {
    diagnosticRole: 'signal',
    priority: 3,
    evidenceWeight: 1.5,
    measurable: true,
    signalsWeaknessValues: ['high_turnover', 'difficult_hire'],
    signalsStrengthValues: ['stable_tenure', 'talent_magnet']
  },

  // Marketing & Channel Resilience
  u23: {
    diagnosticRole: 'root_cause',
    priority: 4,
    evidenceWeight: 1.4,
    measurable: false,
    signalsWeaknessValues: ['single_ad_channel', 'word_of_mouth_only'],
    signalsStrengthValues: ['omnichannel_pipeline']
  },
  u24: {
    diagnosticRole: 'validation',
    priority: 5,
    evidenceWeight: 1.2,
    measurable: false,
    signalsWeaknessValues: ['never_reviewed', 'rarely'],
    signalsStrengthValues: ['quarterly_review']
  },
  u25: {
    diagnosticRole: 'signal',
    priority: 3,
    evidenceWeight: 1.6,
    measurable: true,
    signalsWeaknessValues: ['constant_bottlenecks', 'frequent_delays'],
    signalsStrengthValues: ['smooth_delivery']
  },

  // Strategy & Vision
  u26: {
    diagnosticRole: 'baseline',
    priority: 1,
    evidenceWeight: 1.4,
    measurable: false,
    signalsWeaknessValues: ['day_to_day_only', 'reactive'],
    signalsStrengthValues: ['clear_3yr_roadmap']
  },
  u27: {
    diagnosticRole: 'root_cause',
    priority: 5,
    evidenceWeight: 1.3,
    measurable: false,
    signalsWeaknessValues: ['linear_labor_trap', 'cannot_scale'],
    signalsStrengthValues: ['high_scalability']
  },
  u28: {
    diagnosticRole: 'validation',
    priority: 4,
    evidenceWeight: 1.5,
    measurable: false,
    signalsWeaknessValues: ['ceo_bottleneck', 'all_decisions_owner'],
    signalsStrengthValues: ['delegated_framework']
  },
  u29: {
    diagnosticRole: 'validation',
    priority: 5,
    evidenceWeight: 1.2,
    measurable: false,
    signalsWeaknessValues: ['spontaneous_only', 'no_system'],
    signalsStrengthValues: ['systematic_incentivized']
  },
  u30: {
    diagnosticRole: 'context',
    priority: 99,
    evidenceWeight: 0,
    measurable: false
  },

  // Financial Context Inputs (strictly non-scoring)
  u31: {
    diagnosticRole: 'financial',
    priority: 6,
    evidenceWeight: 1.0,
    measurable: true
  },
  u32: {
    diagnosticRole: 'financial',
    priority: 6,
    evidenceWeight: 0.8,
    measurable: true
  },
  u33: {
    diagnosticRole: 'financial',
    priority: 6,
    evidenceWeight: 0.8,
    measurable: true
  },
  u34: {
    diagnosticRole: 'financial',
    priority: 6,
    evidenceWeight: 0.8,
    measurable: true
  },
  u35: {
    diagnosticRole: 'financial',
    priority: 6,
    evidenceWeight: 0.5,
    measurable: false
  }
};

/**
 * Returns enriched QuestionDefinition with its diagnostic role, priority, and dependencies.
 */
export function getEnrichedQuestion(q: UniversalQuestion, sectorKey?: string): {
  id: string;
  sectorId?: string;
  dimension: string;
  type: any;
  label: string;
  question: string;
  options?: any[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  toastKey?: string;
  required?: boolean;
  measurable?: boolean;
  diagnosticRole: DiagnosticRole;
  dependsOn?: QuestionDependency[];
  priority: number;
  evidenceWeight: number;
  highIsBad?: boolean;
} {
  const meta = UNIVERSAL_QUESTION_METADATA[q.id];

  // If question already defines explicit role or priority, respect it
  const diagnosticRole: DiagnosticRole = (q as any).diagnosticRole || (meta ? meta.diagnosticRole : (
    q.id.endsWith('01') || q.id.endsWith('02') ? 'baseline' :
    q.id.endsWith('03') || q.id.endsWith('04') || q.id.endsWith('05') ? 'signal' :
    q.id.endsWith('06') || q.id.endsWith('07') || q.id.endsWith('08') ? 'root_cause' :
    q.id.endsWith('09') || q.id.endsWith('10') ? 'validation' : 'root_cause'
  ));

  const priority = (q as any).priority || (meta ? meta.priority : (
    diagnosticRole === 'baseline' ? 2 :
    diagnosticRole === 'signal' ? 3 :
    diagnosticRole === 'root_cause' ? 4 :
    diagnosticRole === 'validation' ? 5 : 6
  ));

  const evidenceWeight = (q as any).evidenceWeight || (meta ? meta.evidenceWeight : 1.2);
  const measurable = (q as any).measurable ?? (meta ? meta.measurable : (q.type === 'slider' || q.type === 'number'));
  const dependsOn = (q as any).dependsOn || (meta ? meta.dependsOn : undefined);
  const highIsBad = q.highIsBad ?? (meta as any)?.highIsBad ?? false;

  return {
    ...q,
    sectorId: sectorKey,
    label: q.label || q.question,
    question: q.question,
    diagnosticRole,
    priority,
    evidenceWeight,
    measurable,
    dependsOn,
    highIsBad
  };
}
