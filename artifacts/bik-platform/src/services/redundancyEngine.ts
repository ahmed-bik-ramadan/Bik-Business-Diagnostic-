// src/services/redundancyEngine.ts
// BIK Business Intelligence & Knowledge - Deterministic Redundancy & Catalog Integrity Engine
// Phase 2: Diagnostic Intelligence & Adaptive Taxonomy

import { QuestionDefinition } from '../types/adaptiveDiagnostic';

export interface RedundancyIssue {
  type: 'duplicate_id' | 'exact_text' | 'normalized_text' | 'semantic_purpose' | 'contradictory_definition';
  questionIdA: string;
  questionIdB?: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Normalizes Arabic text for deterministic comparison:
 * - Strips diacritics / tashkeel
 * - Unifies alefs (أ, إ, آ -> ا)
 * - Unifies taa marbuta and haa (ة -> ه)
 * - Unifies alef maksura and yaa (ى -> ي)
 * - Removes punctuation and excess whitespace
 */
export function normalizeArabicText(text: string): string {
  if (!text) return '';
  return text
    // Remove diacritics
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Unify alefs
    .replace(/[أإآ]/g, 'ا')
    // Unify taa marbuta
    .replace(/ة/g, 'ه')
    // Unify yaa
    .replace(/ى/g, 'ي')
    // Remove punctuation
    .replace(/[؟?.,!،;:—\-_()[\]{}"'/\\]/g, ' ')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Extracts key semantic tokens from normalized Arabic question text
 */
export function extractSemanticTokens(text: string): Set<string> {
  const normalized = normalizeArabicText(text);
  // Common Arabic stop words to ignore when comparing semantic purpose
  const stopWords = new Set([
    'ما', 'هو', 'هي', 'هل', 'كم', 'من', 'في', 'على', 'الي', 'عن', 'مع', 'هذا', 'هذه',
    'التي', 'الذي', 'لديك', 'شركتك', 'عميلك', 'لك', 'او', 'ام', 'كل', 'بعد', 'قبل',
    'دون', 'كيف', 'اذا', 'لو', 'ان', 'لا', 'نعم'
  ]);

  const tokens = normalized.split(' ').filter(word => word.length > 2 && !stopWords.has(word));
  return new Set(tokens);
}

/**
 * Checks if two questions in the same dimension share the same semantic purpose
 */
export function calculateSemanticOverlap(textA: string, textB: string): number {
  const tokensA = extractSemanticTokens(textA);
  const tokensB = extractSemanticTokens(textB);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersection++;
    }
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union; // Jaccard similarity
}

/**
 * Detects redundancy and catalog definition contradictions across a collection of questions.
 */
export function detectQuestionRedundancies(questions: QuestionDefinition[]): {
  isValid: boolean;
  issues: RedundancyIssue[];
} {
  const issues: RedundancyIssue[] = [];
  const idMap = new Map<string, QuestionDefinition>();
  const exactTextMap = new Map<string, string>();
  const normalizedTextMap = new Map<string, string>();

  for (let i = 0; i < questions.length; i++) {
    const qA = questions[i];
    const textA = qA.label || qA.question || '';
    const normA = normalizeArabicText(textA);

    // 1. Exact Duplicate ID
    if (idMap.has(qA.id)) {
      issues.push({
        type: 'duplicate_id',
        questionIdA: qA.id,
        questionIdB: idMap.get(qA.id)!.id,
        message: `معرّف السؤال مكرر: ${qA.id}`,
        severity: 'error'
      });
    } else {
      idMap.set(qA.id, qA);
    }

    // 2. Contradictory Definitions
    if (qA.type === 'slider') {
      if (typeof qA.min === 'number' && typeof qA.max === 'number' && qA.min >= qA.max) {
        issues.push({
          type: 'contradictory_definition',
          questionIdA: qA.id,
          message: `حدود غير منطقية لمؤشر السلايدر: min (${qA.min}) >= max (${qA.max})`,
          severity: 'error'
        });
      }
    }

    if ((qA.type === 'single' || qA.type === 'single_choice' || qA.type === 'multi' || qA.type === 'multi_choice')) {
      if (!qA.options || qA.options.length < 2) {
        issues.push({
          type: 'contradictory_definition',
          questionIdA: qA.id,
          message: `سؤال خيارات يفتقر إلى خيارين صالحين على الأقل`,
          severity: 'error'
        });
      }
    }

    // 3. Exact Text Duplication
    if (exactTextMap.has(textA)) {
      issues.push({
        type: 'exact_text',
        questionIdA: qA.id,
        questionIdB: exactTextMap.get(textA),
        message: `تطابق تام في نص السؤال مع السؤال: ${exactTextMap.get(textA)}`,
        severity: 'error'
      });
    } else {
      exactTextMap.set(textA, qA.id);
    }

    // 4. Normalized Arabic Text Duplication
    if (normA.length > 10) {
      if (normalizedTextMap.has(normA)) {
        const prevId = normalizedTextMap.get(normA)!;
        if (prevId !== qA.id) {
          issues.push({
            type: 'normalized_text',
            questionIdA: qA.id,
            questionIdB: prevId,
            message: `تطابق دلالي كامل في صياغة السؤال مع: ${prevId}`,
            severity: 'error'
          });
        }
      } else {
        normalizedTextMap.set(normA, qA.id);
      }
    }

    // 5. Semantic Redundancy within same dimension
    for (let j = i + 1; j < questions.length; j++) {
      const qB = questions[j];
      if (qA.dimension === qB.dimension && qA.id !== qB.id) {
        const textB = qB.label || qB.question || '';
        const overlap = calculateSemanticOverlap(textA, textB);
        // If similarity is extremely high (> 0.85) in the same dimension
        if (overlap > 0.85) {
          issues.push({
            type: 'semantic_purpose',
            questionIdA: qA.id,
            questionIdB: qB.id,
            message: `تشابه دلالي مرتفع جداً (${Math.round(overlap * 100)}%) في نفس البعد "${qA.dimension}" بين ${qA.id} و ${qB.id}`,
            severity: 'warning'
          });
        }
      }
    }
  }

  const hasErrors = issues.some(iss => iss.severity === 'error');
  return {
    isValid: !hasErrors,
    issues
  };
}
