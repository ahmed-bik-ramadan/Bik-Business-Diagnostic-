// Run after the platform build. Install Chromium with "pnpm exec playwright-core install chromium"
// in this package if neither Playwright Chromium nor system Chromium is installed.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { chromium, type Page } from 'playwright-core';
import { preview } from 'vite';

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
  await page.getByTestId('dialect-country-select').selectOption({ label: 'مصر' });
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
  await page.getByTestId('header-consultant-link').click();
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
