import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_CONFIG } from '../src/config/appConfig';

const welcome = fs.readFileSync('src/pages/Welcome.tsx', 'utf8');
assert.equal(welcome.includes('بإشراف أ/ أحمد رمضان — مستشار تطوير وحلول الأعمال'), true, 'consultant identity is visible');
assert.ok(welcome.includes('[[TEXT_NEEDED: welcome_heading]]'), 'the pressure headline awaits approved wording');
assert.ok(welcome.includes('أداة عربية تقرأ حال شركتك في ست محاور'), 'the introduction describes what the diagnostic reads');
// Mission 5-C intentionally replaces the single CTA with the two approved start cards.
assert.equal(welcome.includes('data-testid="start-analysis"') && welcome.includes('data-testid="start-crisis"'), true, 'both approved start cards are present');
assert.equal(welcome.includes("platformCopy['start.analysis.title']") && welcome.includes("platformCopy['start.crisis.title']"), true, 'approved card labels come from the copy deck');
assert.equal(welcome.includes('<motion'), false, 'welcome page has no decorative entrance motion');
assert.equal(welcome.includes('#0F172A'), true, 'navy identity color is present');
assert.equal(welcome.includes('#C9A961'), true, 'gold identity color is present');
assert.equal(APP_CONFIG.consultantWhatsApp, '201066966515', 'public consultant phone remains the approved number');

console.log('Welcome identity contract: PASS');
