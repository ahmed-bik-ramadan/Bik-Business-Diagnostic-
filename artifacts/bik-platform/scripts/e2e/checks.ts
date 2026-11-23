import assert from 'node:assert/strict';
import type { Locator, Page } from 'playwright-core';
import { BIK_OFFERS } from '../../src/config/appConfig';
import { offerPaymentPrices, paymentConfig } from '../../src/config/paymentConfig';
import slimPathways from '../../src/pathways/pathways.slim.json';

const legalLinks = [
  { path: '/privacy', title: 'سياسة الخصوصية' },
  { path: '/terms', title: 'الشروط' },
];
const offerOrder = ['executiveProject', 'monthlyRetainer', 'focusedWeek'] as const;
const samplePathway = slimPathways.find(({ id }) => id === 'PW-AX1-001')!;
const dialects = ['egypt', 'saudi', 'msa_neutral'] as const;
type TestDialect = typeof dialects[number];

async function checkLayout(page: Page) {
  const layout = await page.evaluate(() => ({
    direction: document.documentElement.dir,
    width: document.documentElement.clientWidth,
    contents: document.documentElement.scrollWidth,
  }));
  assert.equal(layout.direction, 'rtl');
  assert.ok(layout.contents <= layout.width, `Horizontal overflow: ${layout.contents}px on ${layout.width}px`);
}

export async function checkFaq(page: Page) {
  const faq = page.getByRole('region', { name: 'الأسئلة الشائعة', exact: true });
  const question = faq.getByRole('button').first();
  await question.waitFor();
  const name = await question.innerText();
  const answer = faq.getByRole('region', { name, exact: true });
  assert.equal(await answer.isVisible(), false);
  assert.equal(await question.getAttribute('aria-expanded'), 'false');
  await question.focus();
  for (const [open, close] of [['Enter', 'Space'], ['Space', 'Enter']]) {
    await page.keyboard.press(open);
    await answer.waitFor({ state: 'visible' });
    assert.equal(await question.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press(close);
    await answer.waitFor({ state: 'hidden' });
    assert.equal(await question.getAttribute('aria-expanded'), 'false');
  }
}

export async function checkReportPathways(page: Page, expectPathways: boolean) {
  const pathways = page.getByRole('region', { name: 'ما يظهر في المحورين الأضعف', exact: true });
  if (!expectPathways) {
    await page.waitForLoadState('networkidle');
    assert.equal(await pathways.count(), 0, 'The strong report has no matched pathway section');
    return;
  }
  await pathways.waitFor();
  const ids = await pathways.locator('[data-pathway-id]').evaluateAll(cards =>
    cards.map(card => card.getAttribute('data-pathway-id')!));
  const counts = new Map<string, number>();
  for (const id of ids) {
    const axis = /^PW-(AX[1-6])-\d+$/u.exec(id)?.[1];
    assert.ok(axis, `Invalid pathway ID: ${id}`);
    counts.set(axis, (counts.get(axis) ?? 0) + 1);
  }
  assert.ok(counts.size >= 1 && counts.size <= 2, 'The report has one or two matched axes');
  assert.ok([...counts.values()].every(count => count <= 2), 'At most two cards per axis');
  await pathways.getByText('هذه فرضيات نفحصها معك، وليست أحكاماً على شركتك.', { exact: true }).waitFor();
  await checkLayout(page);
}

function contrastRatio(a: string, b: string) {
  function luminance(color: string) {
    const channels = color.match(/[\d.]+/gu)?.map(Number) ?? [];
    assert.equal(channels.length, 3, `Expected opaque RGB, received ${color}`);
    const [r, g, b] = channels.map(channel => {
      const ratio = channel / 255;
      return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export async function checkOffers(page: Page) {
  const cards = page.locator('[data-offer]');
  await cards.first().waitFor();
  assert.deepEqual(await cards.evaluateAll(elements => elements.map(el => el.getAttribute('data-offer'))), offerOrder);
  assert.deepEqual(await cards.locator('bdi').allTextContents(), ['$5000', '$499', '$272']);
  let executiveContrast = 0;
  for (const [index, key] of offerOrder.entries()) {
    const card = cards.nth(index);
    assert.equal(await card.getByTestId('offer-free-call').innerText(),
      `مكالمة تمهيدية مجانية مع أ/ أحمد: ${index === 0 ? 40 : 15} دقيقة`);
    const button = card.getByRole('button', { name: 'لماذا تناسبك هذه الخدمة', exact: true });
    if (index === 0) {
      const colors = await button.evaluate(el => ({
        text: getComputedStyle(el).color,
        button: getComputedStyle(el).backgroundColor,
        card: getComputedStyle(el.closest('article')!).backgroundColor,
      }));
      executiveContrast = Math.min(contrastRatio(colors.button, colors.card), contrastRatio(colors.text, colors.button));
      assert.ok(executiveContrast >= 4.5, `Executive button contrast is ${executiveContrast.toFixed(2)}:1`);
    }
    await button.press('Enter');
    const dialog = page.getByRole('dialog', { name: BIK_OFFERS[key].name, exact: true });
    await dialog.waitFor();
    assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), 'Focus enters the offer dialog');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.waitForFunction(offer => {
      const focus = document.activeElement;
      return focus?.tagName === 'BUTTON' && focus.closest('[data-offer]')?.getAttribute('data-offer') === offer;
    }, key);
    assert.ok(await button.evaluate(el => el === document.activeElement), 'Focus returns to the trigger');
  }
  await checkLayout(page);
  return executiveContrast.toFixed(2) + ':1';
}

async function whatsappLink(link: Locator) {
  const href = await link.getAttribute('href');
  assert.ok(href, 'WhatsApp link has an href');
  const url = new URL(href);
  assert.equal(url.origin, 'https://wa.me');
  return url;
}

export async function checkConsultantPathways(page: Page, dialect: TestDialect) {
  const pathways = page.getByRole('region', { name: 'ما الذي يقلقك في شركتك؟', exact: true });
  await pathways.waitFor();
  const cards = pathways.locator('[data-pathway-id]');
  const ids = await cards.evaluateAll(elements => elements.map(el => el.getAttribute('data-pathway-id')));
  assert.equal(ids.length, 87);
  assert.deepEqual(ids.sort(), slimPathways.map(({ id }) => id).sort());

  const group = pathways.locator('details[data-pathway-axis="AX1"]');
  const trigger = group.locator('summary');
  assert.equal(await group.getAttribute('open'), null);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await group.and(page.locator('details[open]')).waitFor();

  assert.equal(new Set(dialects.map(key => samplePathway.dialects[key])).size, 3, 'The sample has distinct dialects');
  const card = group.locator(`[data-pathway-id="${samplePathway.id}"]`);
  const phrase = await card.getByRole('heading', { level: 3 }).innerText();
  assert.equal(phrase, samplePathway.dialects[dialect], `Owner phrase in ${dialect}`);
  const url = await whatsappLink(card.getByRole('link', { name: 'ناقش هذه الحالة مع أحمد', exact: true }));
  assert.ok(url.searchParams.get('text')?.includes('«' + phrase + '»'), 'The link includes the shown owner phrase');
  await checkLayout(page);
}

async function openApp(page: Page, origin: string, path: string, title: string) {
  const response = await page.goto(origin + path);
  assert.equal(response?.status(), 200, path);
  assert.equal(new URL(page.url()).pathname, new URL(path, origin).pathname);
  await page.getByRole('heading', { name: title, level: 1, exact: true }).waitFor();
  await page.waitForLoadState('networkidle');
}

function summaryTitle(key: typeof offerOrder[number]) {
  return BIK_OFFERS[key].name + ' — ' + BIK_OFFERS[key].price;
}

export async function checkPayments(page: Page, origin: string) {
  for (const key of ['focusedWeek', 'monthlyRetainer', 'executiveProject'] as const) {
    await openApp(page, origin, '/offer-summary/' + key, summaryTitle(key));
    const expectedUrl = key === 'executiveProject' ? '' : paymentConfig[offerPaymentPrices[key]]?.url ?? '';
    assert.equal(await page.getByText('ادفع المقدم', { exact: true }).count(), expectedUrl ? 1 : 0);
    if (expectedUrl) {
      const pay = page.getByRole('link', { name: 'ادفع المقدم', exact: true });
      assert.equal(await pay.getAttribute('href'), expectedUrl);
      assert.equal(await pay.getAttribute('target'), '_blank');
    }
    await whatsappLink(page.getByRole('link', { name: 'راسل أحمد أولاً', exact: true }));
    await checkLayout(page);
  }
  await openApp(page, origin, '/payment-sent?offer=focusedWeek', 'شكراً لك.');
  await page.getByText('أرسل إيصال الدفع إلى أحمد عبر واتساب ليؤكد استلامه ويحدد موعد البدء.', { exact: true }).waitFor();
  const receipt = await whatsappLink(page.getByRole('link', { name: 'أرسل الإيصال', exact: true }));
  assert.equal(receipt.searchParams.get('text'), `أرسلت مقدم عرض ${BIK_OFFERS.focusedWeek.name} وأرفقت الإيصال.`);
  await checkLayout(page);
}

export async function checkDirectRoutes(page: Page, origin: string) {
  const routes = [
    ...legalLinks,
    { path: '/payment-sent', title: 'شكراً لك.' },
    { path: '/consultant', title: 'أ/ أحمد رمضان' },
    { path: '/offer-summary/focusedWeek', title: summaryTitle('focusedWeek') },
  ];
  for (const { path, title } of routes) {
    await openApp(page, origin, path, title);
    const footer = page.getByRole('contentinfo');
    await footer.waitFor();
    assert.equal(await footer.count(), 1);
    for (const link of legalLinks) {
      assert.equal(await footer.getByRole('link', { name: link.title, exact: true }).getAttribute('href'), link.path);
    }
  }
}
