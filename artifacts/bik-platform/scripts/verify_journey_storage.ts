// Run after the platform build. Install Chromium with "pnpm exec playwright-core install chromium"
// in this package if neither Playwright Chromium nor system Chromium is installed.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { chromium, type Page } from 'playwright-core';
import { preview } from 'vite';
import { APP_CONFIG, BIK_EXECUTIVE_RETURN_TARGET, BIK_OFFERS, BIK_REFUND_POLICY } from '../src/config/appConfig';

const visitor = { name: 'زائر الاختبار', company: 'شركة الاختبار', city: 'القاهرة', review: 'نحتاج إلى متابعة مواعيد التحصيل بانتظام.' };
const button = (page: Page, text: string) => page.getByRole('button', { name: text, exact: true });

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
    const contact = dialog.getByRole('link', { name: 'ناقش هذا العرض مع أ/ أحمد' });
    const url = new URL((await contact.getAttribute('href'))!);
    assert.equal(url.origin, 'https://wa.me');
    assert.equal(url.pathname, '/' + APP_CONFIG.consultantWhatsApp);
    assert.ok(url.searchParams.get('text')?.includes(offer.name));
    if (inReport) {
      assert.equal(await dialog.getByTestId('offer-loss').innerText(),
        'المشكلة تستمر بكلفتها الشهرية حتى تُعالج: قرابة 1,250 EGP على أرقامك المصرّح بها، تقدير استرشادي.');
      assert.equal(await dialog.locator('[data-testid="offer-outcomes"], [data-testid="offer-outcomes-empty"]').count(), 1);
    } else {
      assert.ok(url.searchParams.get('text')?.includes(`(${minutes[index]} دقيقة)`));
      assert.equal(await dialog.getByTestId('offer-loss').count(), 0);
    }
    const close = dialog.getByRole('button', { name: 'إغلاق', exact: true });
    if (index === 0) {
      const controls = [trigger, close, contact];
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
  console.log(`OFFER DIALOGS (${inReport ? 'report' : 'consultant'}): executive button contrast ${Math.min(...executiveRatios).toFixed(2)}:1`);
}

async function runJourney(page: Page, origin: string) {
  await page.goto(origin);
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
  await page.getByLabel('رمز الدولة').selectOption('+968');
  await page.getByLabel('رقم الهاتف').fill('00968 091234567');
  await page.getByRole('checkbox').check();
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/report-transfer');
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('bik-diagnostic-storage')!).state.whatsapp), '+96891234567');
  // Exercise the dialog with a declared loss while preserving the verified report transfer.
  await page.evaluate(() => {
    const key = 'bik-diagnostic-storage';
    const stored = JSON.parse(sessionStorage.getItem(key)!);
    const client = stored.state.report.dual_layer.clientReport;
    client.financial_impact = {
      ...client.financial_impact,
      declaredValueModel: { isComputable: false, gaps: [], monthlyReducibleWaste: 1250, currency: 'EGP' }
    };
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
  assert.ok((await page.getByRole('heading', { level: 1 }).innerText()).includes(visitor.company));
  assert.ok((await page.getByTestId('review-report-section').innerText()).includes(visitor.review));
  await verifyOfferCards(page, true);
  await page.getByTestId('header-consultant-link').click();
  await page.waitForURL('**/consultant');
  await page.locator('.bkc-back').waitFor();
  await verifyOfferCards(page, false);
  await page.locator('.bkc-back').click();
  await button(page, 'ابدأ من جديد').click();
  await page.getByTestId('start-analysis').waitFor();
  assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage)), []);
}

const systemChromium = ['/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
const browser = await chromium.launch({ executablePath: existsSync(chromium.executablePath()) ? chromium.executablePath() : systemChromium });
try {
  const server = await preview({ configFile: false, logLevel: 'error', preview: { host: '127.0.0.1', port: 0 } });
  try {
    const origin = 'http://127.0.0.1:' + (server.httpServer.address() as AddressInfo).port;
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
    console.log('JOURNEY STORAGE: PASS (direct entry, intake, questionnaire, reviews, report preparation, multipart transfer, reload and restart)');
  } finally {
    await server.close();
  }
} finally {
  await browser.close();
}
