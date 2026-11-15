// src/services/taxonomyValidation.ts
// BIK Business Intelligence & Knowledge - Question Catalog & Taxonomy Validator
// Version: 2.0.0
// Ensures strict data integrity across Universal and Sector Question catalogs.

import { universalQuestions } from '../data/universalQuestions';
import { sectorQuestions } from '../data/sectorQuestions';

export interface TaxonomyValidationError {
  questionId: string;
  catalog: 'universal' | 'sector';
  sectorKey?: string;
  field: string;
  message: string;
}

export class TaxonomyCatalogException extends Error {
  public errors: TaxonomyValidationError[];

  constructor(errors: TaxonomyValidationError[]) {
    const errorDetails = errors
      .slice(0, 10)
      .map((e) => `[${e.catalog}${e.sectorKey ? `:${e.sectorKey}` : ''}] ${e.questionId} (${e.field}): ${e.message}`)
      .join('\n');
    const overflow = errors.length > 10 ? `\n...and ${errors.length - 10} more errors.` : '';
    super(`Taxonomy catalog validation failed with ${errors.length} error(s):\n${errorDetails}${overflow}`);
    this.name = 'TaxonomyCatalogException';
    this.errors = errors;
  }
}

const ALLOWED_TYPES = new Set(['single_choice', 'multi_choice', 'slider', 'text', 'number']);

/**
 * Validates the entire question catalog across universal and sector datasets.
 * Throws TaxonomyCatalogException if throwOnError is true and validation errors are found.
 */
export function validateQuestionCatalog(options: { throwOnError?: boolean } = {}): {
  isValid: boolean;
  totalQuestions: number;
  errors: TaxonomyValidationError[];
} {
  const { throwOnError = true } = options;
  const errors: TaxonomyValidationError[] = [];
  const universalIdSet = new Set<string>();
  const questionTextsSeen = new Map<string, string>();
  let totalCount = 0;

  // 1. Validate Universal Questions
  for (const q of universalQuestions) {
    totalCount++;

    // Question ID
    if (!q.id || typeof q.id !== 'string' || q.id.trim() === '') {
      errors.push({
        questionId: q.id || 'MISSING_ID',
        catalog: 'universal',
        field: 'id',
        message: 'Question id is missing or empty'
      });
      continue;
    }

    if (universalIdSet.has(q.id)) {
      errors.push({
        questionId: q.id,
        catalog: 'universal',
        field: 'id',
        message: `Duplicate question id '${q.id}' detected in universal questions`
      });
    } else {
      universalIdSet.add(q.id);
    }

    // Question Text
    if (!q.question || typeof q.question !== 'string' || q.question.trim().length < 5) {
      errors.push({
        questionId: q.id,
        catalog: 'universal',
        field: 'question',
        message: 'Question text is empty or too short (< 5 characters)'
      });
    }

    // Dimension
    if (!q.dimension || typeof q.dimension !== 'string' || q.dimension.trim() === '') {
      errors.push({
        questionId: q.id,
        catalog: 'universal',
        field: 'dimension',
        message: 'Dimension is missing or empty'
      });
    }

    // Type
    if (!ALLOWED_TYPES.has(q.type)) {
      errors.push({
        questionId: q.id,
        catalog: 'universal',
        field: 'type',
        message: `Invalid question type '${q.type}'. Allowed: ${Array.from(ALLOWED_TYPES).join(', ')}`
      });
    }

    // Options validation for single_choice / multi_choice
    if (q.type === 'single_choice' || q.type === 'multi_choice') {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        errors.push({
          questionId: q.id,
          catalog: 'universal',
          field: 'options',
          message: `Choice question '${q.id}' must have at least 2 options`
        });
      } else {
        const optionValues = new Set<string>();
        q.options.forEach((opt, idx) => {
          if (!opt.value || opt.value.trim() === '') {
            errors.push({
              questionId: q.id,
              catalog: 'universal',
              field: `options[${idx}].value`,
              message: `Empty option value at index ${idx}`
            });
          }
          if (!opt.label || opt.label.trim() === '') {
            errors.push({
              questionId: q.id,
              catalog: 'universal',
              field: `options[${idx}].label`,
              message: `Empty option label at index ${idx}`
            });
          }
          if (optionValues.has(opt.value)) {
            errors.push({
              questionId: q.id,
              catalog: 'universal',
              field: `options[${idx}].value`,
              message: `Duplicate option value '${opt.value}' in question '${q.id}'`
            });
          } else {
            optionValues.add(opt.value);
          }
        });
      }
    }

    // Slider validation
    if (q.type === 'slider') {
      if (typeof q.min !== 'number' || typeof q.max !== 'number' || q.max <= q.min) {
        errors.push({
          questionId: q.id,
          catalog: 'universal',
          field: 'slider_bounds',
          message: `Slider question '${q.id}' has invalid min/max bounds (min=${q.min}, max=${q.max})`
        });
      }
    }
  }

  // 2. Validate Sector Questions
  for (const [sectorKey, questions] of Object.entries(sectorQuestions)) {
    const sectorIdSet = new Set<string>();

    for (const q of questions) {
      totalCount++;

      if (!q.id || typeof q.id !== 'string' || q.id.trim() === '') {
        errors.push({
          questionId: q.id || 'MISSING_ID',
          catalog: 'sector',
          sectorKey,
          field: 'id',
          message: `Question id is missing in sector '${sectorKey}'`
        });
        continue;
      }

      if (sectorIdSet.has(q.id)) {
        errors.push({
          questionId: q.id,
          catalog: 'sector',
          sectorKey,
          field: 'id',
          message: `Duplicate question id '${q.id}' within sector '${sectorKey}'`
        });
      } else {
        sectorIdSet.add(q.id);
      }

      if (!q.question || typeof q.question !== 'string' || q.question.trim().length < 5) {
        errors.push({
          questionId: q.id,
          catalog: 'sector',
          sectorKey,
          field: 'question',
          message: 'Question text is empty or too short'
        });
      }

      if (!q.dimension || typeof q.dimension !== 'string' || q.dimension.trim() === '') {
        errors.push({
          questionId: q.id,
          catalog: 'sector',
          sectorKey,
          field: 'dimension',
          message: 'Dimension is missing or empty'
        });
      }

      if (!ALLOWED_TYPES.has(q.type)) {
        errors.push({
          questionId: q.id,
          catalog: 'sector',
          sectorKey,
          field: 'type',
          message: `Invalid question type '${q.type}' in sector '${sectorKey}'`
        });
      }

      if (q.type === 'single_choice' || q.type === 'multi_choice') {
        if (!Array.isArray(q.options) || q.options.length < 2) {
          errors.push({
            questionId: q.id,
            catalog: 'sector',
            sectorKey,
            field: 'options',
            message: `Choice question '${q.id}' must have at least 2 options`
          });
        }
      }
    }
  }

  if (errors.length > 0 && throwOnError) {
    throw new TaxonomyCatalogException(errors);
  }

  return {
    isValid: errors.length === 0,
    totalQuestions: totalCount,
    errors
  };
}
