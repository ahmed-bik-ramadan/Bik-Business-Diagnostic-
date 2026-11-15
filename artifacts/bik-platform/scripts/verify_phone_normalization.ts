import assert from 'node:assert/strict';
import { normalizePhoneNumber, splitPhoneForForm } from '../src/services/phoneNormalization';

const cases: Array<[string, string, string | null]> = [
  ['+20', '01012345678', '+201012345678'],
  ['+20', '201012345678', '+201012345678'],
  ['+20', '٠١٠١٢٣٤٥٦٧٨', '+201012345678'],
  ['+966', '0501234567', '+966501234567'],
  ['+966', '501234567', '+966501234567'],
  ['+00', '+44 020 7946 0000', '+442079460000'],
  ['+20', '0044 020 7946 0000', '+442079460000'],
  ['+20', '+966 0501234567', '+966501234567'],
  ['+00', '441234567890', null],
  ['+20', '12', null]
];

for (const [dialCode, input, expected] of cases) {
  assert.equal(normalizePhoneNumber(dialCode, input), expected, `${dialCode} / ${input}`);
}

const egyptForm = splitPhoneForForm('+201012345678', ['+20', '+966', '+00']);
assert.deepEqual(egyptForm, { dialCode: '+20', nationalNumber: '1012345678' });
assert.equal(normalizePhoneNumber(egyptForm.dialCode, egyptForm.nationalNumber), '+201012345678');

console.log(JSON.stringify({
  suite: 'phone normalization',
  passed: cases.length + 2,
  countries: ['Egypt', 'Saudi Arabia', 'international'],
  duplicateCountryPrefix: 'removed',
  verificationData: 'synthetic only'
}, null, 2));
