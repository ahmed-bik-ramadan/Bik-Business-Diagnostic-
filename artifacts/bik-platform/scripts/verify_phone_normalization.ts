import assert from 'node:assert/strict';
import { APP_CONFIG, buildConsultantWhatsAppUrl } from '../src/config/appConfig';
import { normalizePhoneNumber, sanitizeNationalInput, splitPhoneForForm } from '../src/services/phoneNormalization';

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
  ['+20', '12', null],
  ['+968', '96812345', '+96896812345'],
  ['+968', '+96812', null],
  ['+249', '002499123456789123456', null],
  ['+213', '000213551234567', null]
];

for (const [dialCode, input, expected] of cases) {
  assert.equal(normalizePhoneNumber(dialCode, input), expected, `${dialCode} / ${input}`);
}

const egyptForm = splitPhoneForForm('+201012345678', ['+20', '+966', '+00']);
assert.deepEqual(egyptForm, { dialCode: '+20', nationalNumber: '1012345678' });
assert.equal(normalizePhoneNumber(egyptForm.dialCode, egyptForm.nationalNumber), '+201012345678');

const regional = {
  '+968': '91234567', '+964': '7901234567', '+218': '912345678',
  '+970': '599123456', '+249': '912345678', '+961': '71123456', '+213': '551234567'
};
const supported = [...Object.keys(regional), '+20', '+966', '+00'];
const publishedNumber = APP_CONFIG.consultantWhatsApp;
try {
  for (const [dialCode, nationalNumber] of Object.entries(regional)) {
    const expected = dialCode + nationalNumber;
    assert.equal(normalizePhoneNumber(dialCode, sanitizeNationalInput(dialCode, '0' + nationalNumber)), expected);
    for (const input of [dialCode + ' 0' + nationalNumber, '00' + dialCode.slice(1) + ' 0' + nationalNumber]) {
      const cleaned = sanitizeNationalInput('+20', input);
      assert.equal(normalizePhoneNumber('+20', cleaned), expected);
      assert.deepEqual(splitPhoneForForm(input, supported), { dialCode, nationalNumber });
      APP_CONFIG.consultantWhatsApp = input;
      const url = new URL(buildConsultantWhatsAppUrl().url);
      assert.equal(url.host, 'wa.me');
      assert.equal(url.pathname, '/' + expected.slice(1));
    }
  }
  APP_CONFIG.consultantWhatsApp = '+968 12';
  assert.equal(buildConsultantWhatsAppUrl().isConfigured, false);
} finally {
  APP_CONFIG.consultantWhatsApp = publishedNumber;
}
assert.equal(sanitizeNationalInput('+968', '0'), '0', 'a leading zero survives until the international prefix can be typed');
assert.equal(sanitizeNationalInput('+968', '00'), '00');

console.log(JSON.stringify({
  suite: 'phone normalization',
  result: 'passed',
  regionalDialCodes: Object.keys(regional),
  duplicateCountryPrefix: 'removed',
  verificationData: 'synthetic only'
}, null, 2));
