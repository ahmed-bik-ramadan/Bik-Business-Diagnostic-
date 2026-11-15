import type { QuestionDefinition } from '../types/adaptiveDiagnostic';

export function isPunctuationOnly(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && !/[\p{L}\p{N}]/u.test(trimmed);
}

export function normalizeMultiChoice(nextValue: string, currentValues: string[]): string[] {
  if (currentValues.includes(nextValue)) {
    return currentValues.filter((value) => value !== nextValue);
  }
  if (nextValue === 'nothing') {
    return ['nothing'];
  }
  return [...currentValues.filter((value) => value !== 'nothing'), nextValue];
}

export function validateQuestionAnswer(
  question: Pick<QuestionDefinition, 'type' | 'options' | 'min' | 'max'>,
  answer: unknown
): { valid: boolean; reason: 'empty' | 'punctuation_only' | 'invalid_option' | 'invalid_number' | 'out_of_range' | 'conflicting_options' | null } {
  if (answer === 'unknown') return { valid: true, reason: null };

  if (question.type === 'multi_choice' || question.type === 'multi') {
    if (!Array.isArray(answer) || answer.length === 0) return { valid: false, reason: 'empty' };
    const allowed = new Set((question.options || []).map((option) => String(option.value)));
    if (answer.some((value) => !allowed.has(String(value)))) return { valid: false, reason: 'invalid_option' };
    if (answer.includes('nothing') && answer.length > 1) return { valid: false, reason: 'conflicting_options' };
    return { valid: true, reason: null };
  }

  if (question.type === 'single_choice' || question.type === 'single') {
    const allowed = new Set((question.options || []).map((option) => String(option.value)));
    return allowed.has(String(answer))
      ? { valid: true, reason: null }
      : { valid: false, reason: 'invalid_option' };
  }

  if (question.type === 'number' || question.type === 'slider' || question.type === 'percentage') {
    // Numeric inputs may also display explicit categorical presets (for example u06 bands).
    if (question.options?.some(option => String(option.value) === String(answer))) return { valid: true, reason: null };
    const numeric = typeof answer === 'number' ? answer : Number(String(answer).trim());
    if (!Number.isFinite(numeric)) return { valid: false, reason: 'invalid_number' };
    if (question.min !== undefined && numeric < question.min || question.max !== undefined && numeric > question.max) {
      return { valid: false, reason: 'out_of_range' };
    }
    return { valid: true, reason: null };
  }

  if (typeof answer !== 'string' || answer.trim().length === 0) return { valid: false, reason: 'empty' };
  if (isPunctuationOnly(answer)) return { valid: false, reason: 'punctuation_only' };
  return { valid: true, reason: null };
}
