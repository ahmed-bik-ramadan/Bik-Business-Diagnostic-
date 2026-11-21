/**
 * Consultant page (approved version) — server-render contract checks.
 * Run: tsx scripts/verify_consultant_page.ts
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import ConsultantPage, { setConsultantWhatsApp } from '../src/pages/consultant/ConsultantPage';
import { APP_CONFIG, BIK_OFFERS, BIK_REFUND_POLICY } from '../src/config/appConfig';

let pass = 0;
let fail = 0;
function check(ok: boolean, msg: string) {
  if (ok) { pass++; console.log(`  PASS: ${msg}`); } else { fail++; console.error(`  FAIL: ${msg}`); }
}

setConsultantWhatsApp(APP_CONFIG.consultantWhatsApp);
const anon = renderToString(React.createElement(ConsultantPage, {} as any));
const known = renderToString(React.createElement(ConsultantPage, { visitor: { name: 'منى', company: 'شركة النور', sector: 'التجزئة', country: 'مصر' } } as any));
const text = anon.replace(/<[^>]+>/g, ' ');

check(anon.includes('أ/ أحمد رمضان') && !anon.includes('ا/ أحمد'), 'courtesy title is written with alif-hamza (أ/)');
check(!/mailto:|@gmail|@[a-z0-9-]+\.[a-z]{2,}/i.test(anon), 'no email address');
check(!/<img\b/i.test(anon), 'no images (no third-party logos, no portrait)');
check(/https:\/\/wa\.me\/201066966515\?text=/.test(anon), 'WhatsApp links use the configured number with the text inside the link');
check(!/wa\.me\/(?!201066966515)/.test(anon), 'no other WhatsApp number');
for (const n of ['أسبوع استشاري مُركَّز', 'المستشار في منصبك — تعاقد شهري', 'التعاقد الاستشاري التنفيذي للمشروع']) check(text.includes(n), `offer present: ${n}`);
check(text.includes('272') && text.includes('499') && text.includes('5000'), 'three prices present');
check(text.includes(BIK_REFUND_POLICY) && /أقل من 85%، أو إذا لم يتم العمل/.test(text) && text.includes('يُخصم رسم إداري فقط'), 'published refund terms match the approved policy');
for (const offer of Object.values(BIK_OFFERS)) {
  const request = [...anon.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)]
    .map(match => new URL(match[1]).searchParams.get('text'))
    .find(message => message?.includes('عرض: ' + offer.name));
  check(request?.includes('(' + offer.freeCallMinutes + ' دقيقة)') === true, 'WhatsApp uses the introductory call length for ' + offer.name);
  check([offer.name, offer.price, offer.scope, ...offer.includes].every(line => text.includes(line)), 'consultant card renders the configured offer: ' + offer.name);
}
check(text.includes('في المبيعات منذ 2003 وفي تطوير الأعمال منذ 2017'), 'experience is given by the two approved dates');
check(text.indexOf('أكثر من 550 ساعة عمل تنفيذي خلال الشهر') >= 0 && text.indexOf('هدف عائد عشرة أضعاف الأتعاب') > text.indexOf('أكثر من 550 ساعة عمل تنفيذي خلال الشهر'), 'executive hours precede the measured return target');
check(text.includes('دقيقة') && text.includes('15'), 'free first session length shown (15 minutes)');
check(!text.includes('عرضان فقط') && !text.includes('العرضين'), 'no stale "two offers" wording');
check(text.includes('تدريب') || text.includes('متدرب'), 'trainees figure present');
const msgKnown = decodeURIComponent((known.match(/wa\.me\/201066966515\?text=([^"&]+)/) || [])[1] || '');
check(msgKnown.includes('منى') && msgKnown.includes('شركة النور') && msgKnown.includes('التجزئة') && msgKnown.includes('مصر'), 'known visitor data goes into the WhatsApp text');
check(!known.includes('placeholder="الاسم"'), 'known visitor is not asked for name again');
check(anon.includes('placeholder="الاسم"'), 'anonymous visitor is asked for a name');
check(!/__[A-Z_]+__/.test(anon), 'no unfilled template placeholders');

console.log(`\nCONSULTANT PAGE: ${pass} PASSED, ${fail} FAILED`);
if (fail) process.exit(1);
