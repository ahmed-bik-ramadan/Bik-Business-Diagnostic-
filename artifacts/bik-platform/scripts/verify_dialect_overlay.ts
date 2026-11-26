import assert from 'node:assert/strict';
import { localizeQuestion } from '../src/copy/dialectQuestions';
import saudiBatch from '../src/copy/saudi_universal_batch1.json';
import { universalQuestions } from '../src/data/universalQuestions';
import { dialectForCountry } from '../src/services/dialect';

const fields = ['question', 'label', 'placeholder', 'unit'] as const;
const allowed = new Set<string>([...fields, 'options']);
const items = Object.entries(saudiBatch.items);
const bank = new Map(universalQuestions.map(question => [question.id, question]));
const numbers = (text?: string) => text?.match(/\p{Nd}+(?:[.,٫٬]\p{Nd}+)*/gu) ?? [];

function verifyText(expected: string | undefined, actual: unknown, context: string) {
  assert.ok(typeof actual === 'string' && actual.trim(), `${context}: nonempty text`);
  assert.deepEqual(numbers(actual), numbers(expected), `${context}: original numbers`);
}

assert.equal(saudiBatch.dialect, 'saudi');
assert.equal(items.length, 34);
assert.deepEqual(items.map(([id]) => id).sort(), universalQuestions.map(question => question.id).filter(id => id !== 'u35').sort());
for (const [id, entry] of items) {
  const original = bank.get(id);
  assert.ok(original, id);
  for (const field of Object.keys(entry)) assert.ok(allowed.has(field), `${id}: unsupported field ${field}`);
  const copy: Partial<Record<(typeof fields)[number], string>> & { options?: Record<string, string> } = entry;
  for (const field of fields) {
    if (Object.hasOwn(entry, field)) verifyText(original[field], copy[field], `${id}.${field}`);
  }

  const labels = copy.options ?? {};
  assert.deepEqual(Object.keys(labels).sort(), (original.options ?? []).map(option => option.value).sort(), `${id}: option keys`);
  for (const { value, label } of original.options ?? []) verifyText(label, labels[value], `${id}.options.${value}`);

  const localized = localizeQuestion(original, dialectForCountry('السعودية'));
  const { options: optionLabels, ...text } = copy;
  const expected = {
    ...original,
    ...text,
    ...(optionLabels && original.options
      ? { options: original.options.map(option => ({ ...option, label: optionLabels[option.value] })) }
      : {}),
  };
  assert.deepEqual(localized, expected, `${id}: only the display text changes`);
}

for (const country of ['مصر', 'الإمارات', 'الكويت', 'المغرب', '']) {
  for (const question of universalQuestions) {
    assert.equal(localizeQuestion(question, dialectForCountry(country)), question, `${country}: ${question.id}`);
  }
}
const original = bank.get('u01')!;
const absentField = fields.find(field => !Object.hasOwn(saudiBatch.items.u01, field));
assert.ok(absentField);
const withFallback = { ...original, [absentField]: 'Existing text' };
assert.equal(localizeQuestion(withFallback, 'saudi')[absentField], withFallback[absentField], 'a missing field keeps the original');
const sectorQuestion = { ...original, id: 'sector-only' };
assert.equal(localizeQuestion(sectorQuestion, 'saudi'), sectorQuestion, 'a question outside the batch is unchanged');
assert.equal(localizeQuestion(bank.get('u35')!, 'saudi'), bank.get('u35'));
console.log('DIALECT OVERLAY: PASS (34 IDs, exact option keys and numbers, nonempty text, fallback and display-only changes)');
