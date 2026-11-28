import assert from 'node:assert/strict';
import { buildWhatsAppExecutiveMessage } from '../src/config/appConfig';
import adminDivisions from '../src/data/adminDivisions.json';
import { submitLeadApi } from '../src/services/api';
import { buildChatContext } from '../src/services/chatPolicy';
import { buildWhatsAppDossierText } from '../src/services/dualLayerReport';
import { valueIdentity } from '../src/services/valueModule/prefill';

const counts = {
  'مصر': 27,
  'السعودية': 13,
  'الإمارات': 7,
  'الكويت': 6,
  'قطر': 8,
  'البحرين': 4,
  'الأردن': 12,
  'المغرب': 12,
};
const countries = Object.keys(counts) as (keyof typeof counts)[];
assert.deepEqual(Object.keys(adminDivisions).sort(), [...countries].sort());
for (const country of countries) {
  const { label, items } = adminDivisions[country];
  assert.deepEqual(Object.keys(adminDivisions[country]).sort(), ['items', 'label'], country);
  assert.ok(typeof label === 'string' && label.trim(), country + ': nonempty label');
  assert.equal(items.length, counts[country], country);
  assert.ok(items.every(item => typeof item === 'string' && item.trim()), country + ': nonempty locations');
  assert.equal(new Set(items.map(item => item.trim())).size, items.length, country + ': no duplicates');
}

const location = { country: 'السعودية', city: 'منطقة الرياض' };
assert.ok(adminDivisions['السعودية'].items.includes(location.city));
assert.ok(buildWhatsAppExecutiveMessage(location).includes('الموقع: السعودية / منطقة الرياض'));
assert.equal(valueIdentity({ intakeAnswers: location }).context, 'منطقة الرياض، السعودية');
assert.ok(buildWhatsAppDossierText({
  ...location, overallScore: null, blindSpots: [], qaRecord: [], priorities: [],
}).includes('الدولة والمدينة: السعودية / منطقة الرياض'));
const chatInput = { sector: 'healthcare' };
const chatWithLocation = { ...chatInput, ...location };
assert.deepEqual(buildChatContext(chatWithLocation), buildChatContext(chatInput));
const lead = await submitLeadApi({ name: '', companyName: '', whatsapp: '', privacyConsent: true, ...location });
assert.equal(lead.persisted, false);
assert.equal(lead.storageMode, 'session_only');

console.log('ADMIN DIVISIONS: PASS (8 exact country keys, counts, unique and nonempty entries, compatible city consumers)');
