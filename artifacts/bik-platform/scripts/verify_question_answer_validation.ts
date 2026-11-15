import assert from 'node:assert/strict';
import { isPunctuationOnly, normalizeMultiChoice, validateQuestionAnswer } from '../src/services/questionAnswerValidation';

assert.equal(isPunctuationOnly('.!?'), true, 'punctuation-only answer is invalid');
assert.equal(isPunctuationOnly('   —  '), true, 'whitespace and punctuation-only answer is invalid');
assert.equal(isPunctuationOnly('قرار البيع'), false, 'Arabic text is valid');
assert.equal(isPunctuationOnly('0'), false, 'numeric zero is not treated as punctuation');
assert.equal(validateQuestionAnswer({ type: 'text', options: [] }, 'العملاء لا يعودون، رغم جودة الخدمة.').valid, true, 'natural text accepts punctuation');
assert.equal(validateQuestionAnswer({ type: 'single_choice', options: [{ value: 'gt_month', label: 'أكثر من شهر' }] }, 'gt_month').valid, true, 'allowed choice value is accepted');
assert.equal(validateQuestionAnswer({ type: 'single_choice', options: [{ value: 'gt_month', label: 'أكثر من شهر' }] }, 'not_allowed').valid, false, 'unknown choice value is rejected');
assert.equal(validateQuestionAnswer({ type: 'number', min: 0, max: 100, options: [] }, 40).valid, true, 'number in range is accepted');
assert.equal(validateQuestionAnswer({ type: 'number', min: 0, max: 100, options: [] }, 140).valid, false, 'number outside range is rejected');
assert.equal(validateQuestionAnswer({ type: 'text', options: [] }, '...').reason, 'punctuation_only', 'punctuation-only natural text is rejected');
assert.equal(validateQuestionAnswer({ type: 'multi_choice', options: [{ value: 'nothing', label: 'لم أجرب' }, { value: 'marketing', label: 'تسويق' }] }, ['nothing', 'marketing']).reason, 'conflicting_options', 'nothing conflicts with other choices');
assert.deepEqual(normalizeMultiChoice('nothing', ['marketing']), ['nothing'], 'nothing clears other choices');
assert.deepEqual(normalizeMultiChoice('marketing', ['nothing']), ['marketing'], 'a real choice clears nothing');
assert.deepEqual(normalizeMultiChoice('marketing', ['marketing', 'sales']), ['sales'], 'selected choice toggles off');

console.log('Question answer validation: PASS');
