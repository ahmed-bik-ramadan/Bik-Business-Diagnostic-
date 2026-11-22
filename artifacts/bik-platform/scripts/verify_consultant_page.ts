/**
 * Consultant page (approved version) — server-render contract checks.
 * Run: tsx scripts/verify_consultant_page.ts
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import ConsultantPage, { setConsultantWhatsApp } from '../src/pages/consultant/ConsultantPage';
import { APP_CONFIG, BIK_EXECUTIVE_RETURN_TARGET, BIK_OFFERS, BIK_REFUND_POLICY } from '../src/config/appConfig';

let pass = 0;
let fail = 0;
function check(ok: boolean, msg: string) {
  if (ok) { pass++; console.log(`  PASS: ${msg}`); } else { fail++; console.error(`  FAIL: ${msg}`); }
}

setConsultantWhatsApp(APP_CONFIG.consultantWhatsApp);
const anon = renderToString(React.createElement(ConsultantPage, {} as any));
const known = renderToString(React.createElement(ConsultantPage, { visitor: { name: 'منى', company: 'شركة النور', sector: 'التجزئة', country: 'مصر' } } as any));
const text = anon.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

check(anon.includes('أ/ أحمد رمضان') && !anon.includes('ا/ أحمد'), 'courtesy title is written with alif-hamza (أ/)');
check(!/mailto:|@gmail|@[a-z0-9-]+\.[a-z]{2,}/i.test(anon), 'no email address');
check(!/<img\b/i.test(anon), 'no images (no third-party logos, no portrait)');
check(/https:\/\/wa\.me\/201066966515\?text=/.test(anon), 'WhatsApp links use the configured number with the text inside the link');
check(!/wa\.me\/(?!201066966515)/.test(anon), 'no other WhatsApp number');
for (const n of ['أسبوع استشاري مُركَّز', 'المستشار في منصبك — تعاقد شهري', 'التعاقد الاستشاري التنفيذي للمشروع']) check(text.includes(n), `offer present: ${n}`);
check(Object.values(BIK_OFFERS).every(offer => text.includes(offer.price)), 'all three configured prices appear');
check(!anon.includes('bkc-free') && !text.includes('جلسة أولى مجانية ·'), 'the former free-call block is absent');
check(!text.includes(BIK_REFUND_POLICY), 'refund terms are shown in the full card dialog');
for (const offer of Object.values(BIK_OFFERS)) {
  check([offer.name, offer.price, offer.scope, `مكالمة تمهيدية مجانية مع أ/ أحمد: ${offer.freeCallMinutes} دقيقة`]
    .every(line => text.includes(line)), 'consultant compact card renders the configured offer: ' + offer.name);
}
check(text.includes('تشخيص BIK يجمع سياق نشاطك ويكشف أين تختنق أرباحك؛ ثم يقرأ المستشار تقرير شركتك قبل المكالمة، فتكون مكالمتكم كلها لقرارك لا للتعارف.'), 'the original introduction explains how to begin');
check(text.includes('في المبيعات منذ 2003 وفي تطوير الأعمال منذ 2017'), 'experience is given by the two approved dates');
check(text.includes(BIK_EXECUTIVE_RETURN_TARGET), 'the executive return target is visible beneath its compact card');
check(!text.includes('الأنسب لوضعك'), 'the consultant page has no recommendation badge without a reason');
check(!text.includes('عرضان فقط') && !text.includes('العرضين'), 'no stale "two offers" wording');
check(text.includes('تدريب') || text.includes('متدرب'), 'trainees figure present');
const msgKnown = decodeURIComponent((known.match(/wa\.me\/201066966515\?text=([^"&]+)/) || [])[1] || '');
check(msgKnown.includes('منى') && msgKnown.includes('شركة النور') && msgKnown.includes('التجزئة') && msgKnown.includes('مصر'), 'known visitor data goes into the WhatsApp text');
check(!known.includes('placeholder="الاسم"'), 'known visitor is not asked for name again');
check(anon.includes('placeholder="الاسم"'), 'anonymous visitor is asked for a name');
check(!/__[A-Z_]+__/.test(anon), 'no unfilled template placeholders');

console.log(`\nCONSULTANT PAGE: ${pass} PASSED, ${fail} FAILED`);
if (fail) process.exit(1);
