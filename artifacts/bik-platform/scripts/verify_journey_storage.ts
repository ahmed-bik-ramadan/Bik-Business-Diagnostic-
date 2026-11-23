// Run after the platform build. Install Chromium with "pnpm exec playwright-core install chromium"
// in this package if neither Playwright Chromium nor system Chromium is installed.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { chromium, type Page } from 'playwright-core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { preview } from 'vite';
import { APP_CONFIG, BIK_EXECUTIVE_RETURN_TARGET, BIK_OFFERS, BIK_REFUND_POLICY } from '../src/config/appConfig';
import { paymentConfig } from '../src/config/paymentConfig';
import OfferSummary from '../src/pages/OfferSummary';
import type { LibraryDialect, SlimPathway } from '../src/pathways/engine';

const visitor = { name: 'زائر الاختبار', company: 'شركة الاختبار', city: 'القاهرة', review: 'نحتاج إلى متابعة مواعيد التحصيل بانتظام.' };
const button = (page: Page, text: string) => page.getByRole('button', { name: text, exact: true });
const approvedCopy = readFileSync(new URL('../../../docs/codex/BIK_TEXTS_LEGAL_FAQ_PAYMENT.md', import.meta.url), 'utf8');
const library = JSON.parse(readFileSync(new URL('../../../docs/codex/bik-library-v2.json', import.meta.url), 'utf8')) as {
  pathways: SlimPathway[];
};
const slim = JSON.parse(readFileSync(new URL('../src/pathways/pathways.slim.json', import.meta.url), 'utf8')) as SlimPathway[];
const publishedIds = new Set(slim.map(pathway => pathway.id));
const approvedSection = (number: number) => approvedCopy.split(/^## /mu).find(section => section.startsWith(number + ') '))!;
const legalLinks = [
  { path: '/privacy', title: 'سياسة الخصوصية', section: 2 },
  { path: '/terms', title: 'الشروط', section: 3 },
];

async function verifyFooter(page: Page) {
  assert.equal(await page.locator('footer').count(), 1);
  const footer = page.getByRole('contentinfo');
  assert.equal(await footer.getByText('BIK Business Solutions', { exact: true }).count(), 1);
  for (const { path, title } of legalLinks) {
    assert.equal(await footer.getByRole('link', { name: title, exact: true }).getAttribute('href'), path);
  }
}

async function verifyLegalRoutes(page: Page, origin: string) {
  for (const { path, title, section } of legalLinks) {
    await page.goto(origin + path);
    const main = page.getByRole('main');
    await main.getByRole('heading', { name: title, level: 1, exact: true }).waitFor();
    const approved = [...approvedSection(section).matchAll(/^\*\*(.+?)\*\*\s*([^\r\n]+)$/gmu)];
    assert.equal(approved.length, 7);
    assert.deepEqual(await main.getByRole('heading', { level: 2 }).allTextContents(), approved.map(match => match[1]));
    assert.deepEqual(await main.locator('p').allTextContents(), approved.map(match => match[2]));
    assert.deepEqual(await main.evaluate(element => [getComputedStyle(element).direction, element.scrollWidth <= element.clientWidth]),
      ['rtl', true]);
    await verifyFooter(page);
    await page.waitForFunction(() => document.activeElement?.tagName === 'MAIN');
    await page.keyboard.press('Tab');
    assert.equal(await main.getByRole('link', { name: 'صفحة الترحيب' }).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter');
    await page.waitForURL(origin + '/');
    await page.getByTestId('start-analysis').waitFor();
  }
}

async function verifyGateLegalLinks(page: Page, origin: string) {
  const main = page.getByRole('main');
  for (const { path, title } of legalLinks) {
    const link = main.getByRole('link', { name: title, exact: true });
    assert.equal(await link.getAttribute('href'), path);
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
    const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
    await popup.waitForURL(origin + path);
    await popup.getByRole('heading', { name: title, level: 1, exact: true }).waitFor();
    await popup.close();
    assert.equal(new URL(page.url()).pathname, '/lead-gate');
    assert.equal(await main.getByRole('checkbox').isChecked(), false);
  }
}

async function verifyFaq(page: Page, group: 'أ' | 'ب' | 'ج') {
  const approvedGroup = approvedSection(6).split(/^### /mu).find(section => section.startsWith(group + ') '))!;
  const approved = [...approvedGroup.matchAll(/^- \*\*(.+?)\*\* ([^\r\n]+)$/gmu)];
  assert.equal(approved.length, group === 'ج' ? 4 : 5);

  const faq = page.getByRole('region', { name: 'الأسئلة الشائعة', exact: true });
  await faq.waitFor();
  assert.deepEqual(await faq.evaluate(el => [getComputedStyle(el).direction, el.scrollWidth <= el.clientWidth]), ['rtl', true]);
  assert.deepEqual(await faq.getByRole('button').allTextContents(), approved.map(match => match[1]));
  assert.equal(await faq.locator('[aria-expanded="true"]').count(), 0);
  if (group === 'ب') {
    assert.ok(await faq.evaluate(el => {
      const lastCard = document.querySelector('[data-offer="focusedWeek"]');
      return lastCard && (lastCard.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    }), 'the report FAQ follows the offers');
  }

  for (const [index, [, question, answer]] of approved.entries()) {
    const trigger = faq.getByRole('button', { name: question, exact: true });
    const content = faq.getByRole('region', { name: question, exact: true });
    assert.equal(await content.isVisible(), false);
    if (index === 0) await trigger.focus();
    else await page.keyboard.press('Tab');
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);

    await page.keyboard.press(index % 2 === 0 ? 'Enter' : 'Space');
    await content.waitFor();
    assert.equal(await content.innerText(), answer);
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press(index % 2 === 0 ? 'Space' : 'Enter');
    await content.waitFor({ state: 'hidden' });
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  }
}

async function enterIntake(page: Page) {
  const identity = page.locator('section').first();
  const inputs = identity.getByRole('textbox');
  await inputs.nth(0).fill(visitor.name);
  await inputs.nth(1).fill(visitor.company);
  await identity.getByRole('combobox').selectOption('مصر');
  await inputs.nth(2).fill(visitor.city);
  for (const answer of ['أقل من سنة', 'أقل من 3 سنوات', 'خبرة سابقة', 'لم أطبق أياً من الأعلى', 'لا بعد', 'لا أحسبه', 'لا', 'الجودة الأعلى', 'محلي مدينة واحدة']) {
    await button(page, answer).click();
  }
  await button(page, 'ابدأ التشخيص الكامل').click();
}

async function answerQuestionnaire(page: Page) {
  const dialect = page.getByTestId('questionnaire-dialect');
  await dialect.waitFor();
  assert.equal(await dialect.innerText(), 'مصري');
  const card = page.locator('.questionnaire-card');
  const heading = card.getByRole('heading');
  while (new URL(page.url()).pathname === '/questionnaire') {
    const previous = await heading.innerText();
    if (await card.locator('textarea').count()) {
      await card.locator('textarea').fill('نراجع التحصيل أسبوعياً');
      await button(page, 'متابعة').click();
    } else if (await card.locator('input[type=number]').count()) {
      await card.getByRole('button', { name: /تخطي/ }).click();
    } else if (await card.getByRole('slider').count()) {
      await button(page, 'متابعة').click();
    } else {
      await card.getByRole('button').first().click();
      const next = card.getByRole('button', { name: 'متابعة', exact: true });
      if (await next.count()) await next.click();
    }
    await page.waitForFunction(text => location.pathname !== '/questionnaire' ||
      (document.querySelector('.questionnaire-card h2')?.textContent?.trim() || text) !== text, previous);
  }
}

async function verifyIntakeDialects(page: Page, origin: string) {
  await page.goto(origin);
  for (const [country, label] of [
    ['مصر', 'مصري'], ['السعودية', 'سعودي'], ['الإمارات', 'إماراتي'],
    ['الكويت', 'خليجي عام'], ['المغرب', 'فصحى'], ['', 'فصحى'], ['غير معروف', 'فصحى']
  ]) {
    await page.evaluate(country => {
      sessionStorage.setItem('bik-diagnostic-storage', JSON.stringify({
        state: { sectorL1: 'retail', diagnosticDepth: 'quick', intakeAnswers: { country } },
        version: 0
      }));
    }, country);
    await page.goto(origin + '/questionnaire');
    const dialect = page.getByTestId('questionnaire-dialect');
    await dialect.waitFor();
    assert.equal(await dialect.innerText(), label);
    assert.equal(await page.getByTestId('dialect-country-select').count(), 0);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('bik_visitor_country')), null);
  }
}

function contrastRatio(first: string, second: string) {
  function luminance(color: string) {
    const channels = color.match(/[\d.]+/gu)?.slice(0, 3);
    assert.equal(channels?.length, 3, color);
    const [r, g, b] = channels!.map(channel => {
      const value = Number(channel) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const values = [luminance(first), luminance(second)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

async function verifyOfferCards(page: Page, inReport: boolean) {
  const order = ['executiveProject', 'monthlyRetainer', 'focusedWeek'] as const;
  const prices = ['$5000', '$499', '$272'];
  const minutes = [40, 15, 15];
  const cards = page.locator('[data-offer]');
  await cards.first().waitFor();
  assert.deepEqual(await cards.evaluateAll(elements => elements.map(element => element.getAttribute('data-offer'))), order);
  assert.deepEqual(await cards.locator('bdi').allTextContents(), prices);
  const executiveTarget = page.locator('[data-offer="executiveProject"] + [data-testid="offer-return-target"]');
  assert.equal(await executiveTarget.innerText(), BIK_EXECUTIVE_RETURN_TARGET);
  assert.equal(await page.getByText(/هدية لك: 15 دقيقة|جلسة أولى مجانية ·/u).count(), 0);
  assert.equal(await page.getByText('الأنسب لوضعك', { exact: true }).count(), inReport ? 1 : 0);
  if (inReport) {
    assert.ok((await page.locator('[data-recommended="true"]').getByTestId('offer-reason').innerText()).trim());
  }
  const executiveRatios: number[] = [];
  for (const [index, key] of order.entries()) {
    const offer = BIK_OFFERS[key];
    const card = cards.nth(index);
    const before = await card.innerText();
    assert.equal(await card.getByTestId('offer-free-call').innerText(), `مكالمة تمهيدية مجانية مع أ/ أحمد: ${minutes[index]} دقيقة`);
    assert.equal(await card.getByText(offer.scope, { exact: true }).count(), 1);
    assert.equal(await card.getByTestId('offer-includes').count(), 0);
    const trigger = card.getByRole('button', { name: 'لماذا تناسبك هذه الخدمة' });
    const appearance = await trigger.evaluate(el => ({
      card: getComputedStyle(el.closest('article')!).backgroundColor,
      button: getComputedStyle(el).backgroundColor,
      text: getComputedStyle(el).color
    }));
    assert.equal(appearance.card, index === 0 ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)');
    if (index === 0) assert.equal(appearance.button, 'rgb(187, 247, 208)');
    else assert.equal(appearance.button, 'rgb(15, 23, 42)');
    assert.ok(contrastRatio(appearance.card, appearance.button) >= 4.5);
    assert.ok(contrastRatio(appearance.button, appearance.text) >= 4.5);

    await trigger.press('Enter');
    const dialog = page.getByRole('dialog', { name: offer.name, exact: true });
    await dialog.waitFor();
    assert.equal(await dialog.getAttribute('aria-modal'), 'true');
    assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), 'focus moves into the dialog');
    assert.deepEqual(await dialog.getByTestId('offer-includes').locator('li').allTextContents(), [...offer.includes]);
    assert.equal(await dialog.getByText(BIK_REFUND_POLICY, { exact: true }).count(), 1);
    const choose = dialog.getByRole('link', { name: 'اختر هذا العرض', exact: true });
    assert.equal(await choose.getAttribute('href'), '/offer-summary/' + key);
    if (inReport) {
      assert.equal(await dialog.getByTestId('offer-loss').innerText(),
        'المشكلة تستمر بكلفتها الشهرية حتى تُعالج: قرابة 1,250 EGP على أرقامك المصرّح بها، تقدير استرشادي.');
      assert.equal(await dialog.locator('[data-testid="offer-outcomes"], [data-testid="offer-outcomes-empty"]').count(), 1);
    } else {
      assert.equal(await dialog.getByTestId('offer-loss').count(), 0);
    }
    const close = dialog.getByRole('button', { name: 'إغلاق', exact: true });
    if (index === 0) {
      const controls = [trigger, close, choose];
      for (const control of controls) {
        const [bg, fg] = control === trigger ? [appearance.button, appearance.card]
          : await control.evaluate(el => [getComputedStyle(el).backgroundColor, getComputedStyle(el.closest('[role="dialog"]')!).backgroundColor]);
        const ratio = contrastRatio(bg, fg);
        assert.ok(ratio >= 4.5, `executive button contrast: ${ratio}`);
        executiveRatios.push(ratio);
      }
      await page.keyboard.press('Tab');
      assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)));
      await page.keyboard.press('Escape');
    } else if (index === 1) {
      await close.click();
    } else {
      await page.getByTestId('offer-dialog-backdrop').click({ position: { x: 5, y: 5 } });
    }
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(key => document.activeElement?.closest('[data-offer]')?.getAttribute('data-offer') === key, key);
    assert.equal(await card.innerText(), before, 'closing the dialog restores the compact card');
  }
  await cards.last().getByRole('button', { name: 'لماذا تناسبك هذه الخدمة' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'اختر هذا العرض' }).click();
  await page.waitForURL('**/offer-summary/focusedWeek');
  await page.getByRole('heading', { name: BIK_OFFERS.focusedWeek.name + ' — $272' }).waitFor();
  await page.goBack();
  await cards.first().waitFor();
  console.log(`OFFER DIALOGS (${inReport ? 'report' : 'consultant'}): executive button contrast ${Math.min(...executiveRatios).toFixed(2)}:1`);
}

function verifyPayLinkConfiguration() {
  assert.deepEqual(paymentConfig, {
    272: { url: '', depositUsd: 95.20 }, 499: { url: '', depositUsd: 174.65 }, 5000: null,
  });
  const renderSummary = (offerKey: string) => renderToStaticMarkup(
    createElement(MemoryRouter, { initialEntries: ['/offer-summary/' + offerKey] },
      createElement(Routes, null,
        createElement(Route, { path: '/offer-summary/:offerKey', element: createElement(OfferSummary) })))
  );
  const testUrl = 'https://www.paypal.com/test-deposit';
  for (const [key, price] of [['focusedWeek', 272], ['monthlyRetainer', 499]] as const) {
    assert.doesNotMatch(renderSummary(key), /ادفع المقدم/u);
    const payment = paymentConfig[price];
    payment.url = testUrl;
    try {
      const summary = renderSummary(key);
      assert.ok(summary.includes(`href="${testUrl}" target="_blank" rel="noopener noreferrer"`));
      assert.match(summary, /ادفع المقدم/u);
      assert.doesNotMatch(renderSummary('executiveProject'), /ادفع المقدم/u);
    } finally {
      payment.url = '';
    }
  }
}

async function checkWhatsAppLink(page: Page, label: string, message: string) {
  const link = page.getByRole('link', { name: label, exact: true });
  const url = new URL((await link.getAttribute('href'))!);
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/' + APP_CONFIG.consultantWhatsApp);
  assert.equal(url.searchParams.get('text'), message);
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
}

async function verifyPaymentRoutes(page: Page, origin: string) {
  // Keep this check in a fresh context, without diagnostic state from the other journey.
  await page.addInitScript(() => {
    const mutations: string[] = [];
    Object.assign(window, { storageMutations: mutations });
    for (const method of ['setItem', 'removeItem', 'clear'] as const) {
      const original = Reflect.get(Storage.prototype, method);
      Reflect.set(Storage.prototype, method, function (this: Storage, ...args: string[]) {
        mutations.push(method);
        return Reflect.apply(original, this, args);
      });
    }
  });
  const checkNoStorage = async () => assert.deepEqual(
    await page.evaluate(() => [Object.entries(localStorage), Object.entries(sessionStorage), (window as any).storageMutations]),
    [[], [], []],
  );
  for (const [key, detail] of [
    ['focusedWeek', 'المقدم: $95.20 (35% من قيمة العرض، جزء من الأتعاب لا فوقها)'],
    ['monthlyRetainer', 'المقدم: $174.65 (35% من قيمة العرض، جزء من الأتعاب لا فوقها)'],
    ['executiveProject', 'نبدأ بمكالمة 40 دقيقة نتفق فيها على النطاق، ثم تصلك فاتورة بالمقدم.'],
  ] as const) {
    const offer = BIK_OFFERS[key];
    await page.goto(origin + '/offer-summary/' + key);
    await page.getByRole('heading', { name: offer.name + ' — ' + offer.price }).waitFor();
    assert.equal(await page.getByText(detail, { exact: true }).count(), 1);
    assert.equal(await page.getByRole('link', { name: 'ادفع المقدم' }).count(), 0);
    await checkWhatsAppLink(page, 'راسل أحمد أولاً',
      `مرحباً أستاذ أحمد، أرغب في مناقشة «${offer.name}» (${offer.price}) قبل دفع المقدم.`);
    await checkNoStorage();
  }
  for (const [query, offerName] of [
    ['?offer=monthlyRetainer', ' ' + BIK_OFFERS.monthlyRetainer.name],
    ['?offer=__proto__', ''],
    ['', ''],
  ]) {
    await page.goto(origin + '/payment-sent' + query);
    await page.getByRole('heading', { name: 'شكراً لك.' }).waitFor();
    assert.equal(await page.getByText('أرسل إيصال الدفع إلى أحمد عبر واتساب ليؤكد استلامه ويحدد موعد البدء.', { exact: true }).count(), 1);
    await checkWhatsAppLink(page, 'أرسل الإيصال', `أرسلت مقدم عرض${offerName} وأرفقت الإيصال.`);
    await checkNoStorage();
  }
  await page.goto(origin + '/offer-summary/__proto__');
  await page.waitForURL(origin + '/');
  console.log('PAYMENT ROUTES: PASS (direct entry, conditional PayPal links, WhatsApp messages, unknown offers and no browser storage)');
}

async function verifyConsultantPathways(page: Page, dialect: LibraryDialect) {
  const section = page.getByRole('region', { name: 'ما الذي يقلقك في شركتك؟', exact: true });
  await section.locator('[data-pathway-id]').first().waitFor({ state: 'attached' });
  const cards = await section.locator('[data-pathway-id]').evaluateAll(elements => elements.map(element => {
    const link = element.querySelector('a');
    return {
      id: element.getAttribute('data-pathway-id'), phrase: element.querySelector('h3')?.textContent,
      href: link?.href, target: link?.target, rel: link?.rel,
    };
  }));
  const byId = new Map(cards.map(card => [card.id, card]));
  assert.equal(cards.length, 87);
  assert.deepEqual([...byId.keys()].sort(), [...publishedIds].sort());
  for (const pathway of library.pathways) {
    const card = byId.get(pathway.id);
    if (!publishedIds.has(pathway.id)) {
      assert.equal(card, undefined, `excluded pathway ${pathway.id}`);
      continue;
    }
    assert.ok(card?.href, `visible pathway and contact link for ${pathway.id}`);
    const phrase = pathway.dialects[dialect];
    assert.equal(card.phrase, phrase);
    const url = new URL(card.href);
    assert.equal(url.origin, 'https://wa.me');
    assert.equal(url.pathname, '/' + APP_CONFIG.consultantWhatsApp);
    assert.equal(url.searchParams.get('text'), `مرحباً أستاذ أحمد، أرغب في مناقشة حالة: «${phrase}» ضمن ${pathway.service_name}.`);
    assert.equal(card.target, '_blank');
    assert.equal(card.rel, 'noopener noreferrer');
  }

  const groups = section.locator('details');
  assert.deepEqual(await groups.evaluateAll(elements => elements.map(element => element.getAttribute('data-pathway-axis'))),
    ['AX1', 'AX2', 'AX3', 'AX4', 'AX5', 'AX6']);
  const cash = groups.nth(1);
  const cashSummary = cash.locator('summary');
  assert.equal(await cashSummary.getAttribute('aria-disabled'), null);
  await cashSummary.press('Enter');
  assert.equal(await cash.getByRole('link', { name: 'ناقش هذه الحالة مع أحمد' }).count(), 7);
  await cashSummary.press('Space');
  const first = groups.first();
  await first.locator('summary').press('Enter');
  assert.ok(await first.getByRole('link', { name: 'ناقش هذه الحالة مع أحمد' }).first().isVisible());
  await first.locator('summary').press('Space');
  assert.equal(await first.evaluate(element => (element as HTMLDetailsElement).open), false);
  assert.equal(await page.locator('.bkc-tile:not([aria-hidden="true"])').count(), 23);
}

async function runJourney(page: Page, origin: string) {
  await page.goto(origin);
  await page.getByTestId('start-analysis').waitFor();
  await verifyFooter(page);
  await verifyFaq(page, 'أ');
  await page.getByTestId('start-analysis').click();
  await page.getByRole('textbox').fill('مطعم فاخر');
  await page.getByRole('button', { name: /مطعم فاخر/ }).click();
  await button(page, 'ابدأ التشخيص السريع').click();
  await enterIntake(page);
  await answerQuestionnaire(page);
  for (const step of [1, 2, 3]) {
    await page.waitForURL('**/review/' + step);
    if (step === 1) {
      await page.getByTestId('review-other').click();
      await page.getByTestId('review-draft').fill(visitor.review);
      await page.getByTestId('review-submit').click();
    } else {
      await page.getByTestId('review-yes').click();
    }
  }
  await page.waitForURL('**/lead-gate');
  await verifyGateLegalLinks(page, origin);
  await page.getByLabel('رمز الدولة').selectOption('+968');
  await page.getByLabel('رقم الهاتف').fill('00968 091234567');
  await page.getByRole('checkbox').check();
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/report-transfer');
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('bik-diagnostic-storage')!).state.whatsapp), '+96891234567');
  // Exercise the offer dialog and a weak-axis match while preserving the report transfer.
  await page.evaluate(() => {
    const key = 'bik-diagnostic-storage';
    const stored = JSON.parse(sessionStorage.getItem(key)!);
    const client = stored.state.report.dual_layer.clientReport;
    client.financial_impact = {
      ...client.financial_impact,
      declaredValueModel: { isComputable: false, gaps: [], monthlyReducibleWaste: 1250, currency: 'EGP' }
    };
    const dimension = 'بنية الشركة وهويتها';
    const detail = stored.state.axisDetails[dimension];
    stored.state.axisDetails[dimension] = { ...detail, score: 0, status: 'نقطة حرجة' };
    stored.state.report.evidence = [
      ...(stored.state.report.evidence ?? []),
      {
        sourceQuestionId: 'u03', dimension, signal: 'negative', userAnswerRaw: 'no', userAnswerParsed: 'no',
        questionLabel: 'استقلالية الشركة التشغيلية عن المالك', findingDescription: 'استقلالية الشركة التشغيلية عن المالك'
      }
    ];
    sessionStorage.setItem(key, JSON.stringify(stored));
  });
  await page.reload();
  const openButton = page.getByTestId('open-whatsapp');
  const alert = page.getByRole('alert');
  await openButton.or(alert).first().waitFor();
  assert.deepEqual(await alert.allTextContents(), []);
  const count = await page.getByRole('list', { name: 'حالة كل جزء' }).getByRole('listitem').count();
  assert.ok(count > 1, 'the generated report must exercise a multipart transfer');
  for (let part = 0; part < count; part++) {
    const popup = page.waitForEvent('popup');
    await page.getByTestId('open-whatsapp').click();
    await (await popup).close();
    await page.getByTestId('acknowledge-part').click();
    if (part === 0) {
      await page.reload();
      await page.getByTestId('open-whatsapp').waitFor();
      const saved = await page.evaluate(() => {
        const key = Object.keys(sessionStorage).find(key => key.startsWith('bik-transfer-state:'));
        return key && JSON.parse(sessionStorage.getItem(key)!);
      });
      assert.equal(saved.parts[0].status, 'sent');
      assert.ok(saved.parts.every((p: object) => !('body' in p) && !('message' in p)));
    }
  }
  await page.getByTestId('open-full-analysis').click();
  await page.getByTestId('consultant-cta').waitFor();
  const pathways = page.getByRole('region', { name: 'ما يظهر في المحورين الأضعف', exact: true });
  await pathways.locator('[data-pathway-id^="PW-AX1-"]').first().waitFor();
  assert.match(await pathways.innerText(), /هذه فرضيات نفحصها معك، وليست أحكاماً على شركتك\./u);
  assert.doesNotMatch(await pathways.innerText(), /[0-9٠-٩۰-۹]/u);
  assert.deepEqual(await pathways.evaluate(element => [
    getComputedStyle(element).direction,
    element.scrollWidth <= element.clientWidth,
    Boolean(element.compareDocumentPosition(document.querySelector('[data-offer]')!) & Node.DOCUMENT_POSITION_FOLLOWING),
  ]), ['rtl', true, true]);
  await verifyFooter(page);
  await verifyFaq(page, 'ب');
  assert.ok((await page.getByRole('heading', { level: 1 }).innerText()).includes(visitor.company));
  assert.ok((await page.getByTestId('review-report-section').innerText()).includes(visitor.review));
  await verifyOfferCards(page, true);
  await page.getByTestId('header-consultant-link').click();
  await page.waitForURL('**/consultant');
  await page.locator('.bkc-back').waitFor();
  await verifyConsultantPathways(page, 'egypt');
  await verifyFooter(page);
  await verifyFaq(page, 'ج');
  await verifyOfferCards(page, false);
  await page.locator('.bkc-back').click();
  await button(page, 'ابدأ من جديد').click();
  await page.getByTestId('start-analysis').waitFor();
  assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage)), []);
}

verifyPayLinkConfiguration();
const systemChromium = ['/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
const browser = await chromium.launch({ executablePath: existsSync(chromium.executablePath()) ? chromium.executablePath() : systemChromium });
try {
  const server = await preview({ configFile: false, logLevel: 'error', preview: { host: '127.0.0.1', port: 0 } });
  try {
    const origin = 'http://127.0.0.1:' + (server.httpServer.address() as AddressInfo).port;
    const paymentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const direct = await paymentContext.newPage();
      await verifyPaymentRoutes(direct, origin);
      await direct.goto(origin + '/consultant');
      await verifyConsultantPathways(direct, 'msa_neutral');
    } finally {
      await paymentContext.close();
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await context.route(origin + '/storage-observer', route => route.fulfill({ contentType: 'text/html', body: '<title>Storage observer</title>' }));
    await context.route('https://wa.me/**', route => route.fulfill({ body: 'Simulated WhatsApp handoff' }));
    const observer = await context.newPage();
    await observer.goto(origin + '/storage-observer');
    // A separate same-origin document observes native mutations, including property assignments
    // and values immediately removed, across navigation and reloads of the application tab.
    await observer.evaluate(() => {
      localStorage.setItem('other-app', 'keep');
      const writes: (string | null)[] = [];
      Object.assign(window, { observedWrites: writes });
      window.addEventListener('storage', e => {
        if (e.storageArea === localStorage && e.newValue !== null) writes.push(e.key);
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    await verifyLegalRoutes(page, origin);
    for (const route of ['/sector-select', '/diagnostic-depth', '/company-intake', '/questionnaire', '/review/1', '/processing', '/lead-gate', '/report-transfer', '/report', '/consultant', '/']) {
      await observer.evaluate(() => localStorage.setItem('bik-analysis-session:old', 'legacy report'));
      await page.goto(origin + route);
      await page.waitForFunction(() => localStorage.getItem('bik-analysis-session:old') === null);
    }
    await verifyIntakeDialects(page, origin);
    await runJourney(page, origin);
    // Wait until the observer has processed all preceding mutations.
    await page.evaluate(() => localStorage.setItem('test-finished', '1'));
    await observer.waitForFunction(() => (window as any).observedWrites.includes('test-finished'));
    assert.deepEqual(await observer.evaluate(() => (window as any).observedWrites), ['test-finished']);
    assert.deepEqual(await observer.evaluate(() => Object.entries(localStorage).sort()), [['other-app', 'keep'], ['test-finished', '1']]);
    console.log('LEGAL PAGES: PASS (verbatim copy, direct routes, shared footer and lead-gate links in new tabs)');
    console.log('FAQ: PASS (verbatim copy, RTL, Tab navigation and Enter/Space toggling on all three pages)');
    console.log('CONSULTANT PATHWAYS: PASS (all 105 IDs checked, 87 rendered with WhatsApp links, keyboard groups and dialects)');
    console.log('JOURNEY STORAGE: PASS (direct entry, intake, questionnaire, reviews, report preparation, multipart transfer, reload and restart)');
  } finally {
    await server.close();
  }
} finally {
  await browser.close();
}
