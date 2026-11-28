import assert from 'node:assert/strict';
import type { Locator, Page } from 'playwright-core';
import { universalQuestions } from '../../src/data/universalQuestions';
import { localizeQuestion } from '../../src/copy/dialectQuestions';
import { intakeCopy } from '../../src/copy/intakeCopy';
import { dialectForCountry } from '../../src/services/dialect';
import { currencyForCountry, type ValueCurrency } from '../../src/services/valueModule/currency';
import { getSectorQuestions } from '../../src/data/sectorRegistry';
import type { QuestionDefinition } from '../../src/types/adaptiveDiagnostic';
import { normalizedOmanPhone, omanPhone, visitorName, type Answer, type JourneyFixture } from './fixtures';

const questionCard = '.questionnaire-card';
const storeKey = 'bik-diagnostic-storage';

function button(scope: Page | Locator, name: string) {
  return scope.getByRole('button', { name, exact: true });
}

interface IntakeTestOptions {
  legacyCurrency?: ValueCurrency;
  expectedWhy?: string;
}

export async function startIntake(page: Page, origin: string, fixture: JourneyFixture, options: IntakeTestOptions = {}) {
  await page.goto(origin + '/');
  await page.getByTestId('start-analysis').click();
  await page.waitForURL('**/sector-select');
  await page.getByRole('textbox').fill(fixture.subsector);
  await page.getByRole('button').filter({
    has: page.getByText(fixture.subsector, { exact: true }),
  }).click();
  await button(page, 'ابدأ التشخيص السريع').click();
  await page.waitForURL('**/company-intake');

  const identity = page.locator('section').first();
  const fields = identity.getByRole('textbox');
  await fields.nth(2).waitFor();
  assert.equal(await fields.count(), 3, 'Intake has name, company and city fields');
  await fields.nth(0).fill(visitorName);
  await fields.nth(1).fill(fixture.company);
  await identity.getByRole('combobox').selectOption(fixture.country);
  await fields.nth(2).fill(fixture.city);

  if (options.expectedWhy) {
    const history = page.locator('section').nth(1);
    const why = history.getByText(options.expectedWhy, { exact: true });
    await why.waitFor();
    assert.equal(await why.textContent(), options.expectedWhy, 'Section 2 renders the expected locale');
  }

  const copy = intakeCopy(dialectForCountry(fixture.country));
  const groupLabels = {
    'finance.breakEvenChoice': copy.text('finance.breakEven'),
    'finance.debtChoice': copy.text('finance.hasDebt'),
  } as Record<string, string>;
  for (const key of fixture.intake) {
    const group = groupLabels[key.slice(0, key.lastIndexOf('.'))];
    const scope = group ? page.locator('label').filter({ hasText: group }).locator('..') : page;
    await button(scope, copy.option(key).label).click();
  }
  if (options.legacyCurrency) {
    await page.evaluate(currency => {
      sessionStorage.setItem('bik_universal_answers', JSON.stringify({ u35: currency }));
    }, options.legacyCurrency);
  }
  await button(page, copy.text('form.submit')).click();
  await page.waitForURL('**/questionnaire');
  await page.locator(questionCard).getByRole('heading', { level: 2 }).waitFor();
}

async function selectOption(card: Locator, question: QuestionDefinition, value: string) {
  const option = question.options?.find(entry => entry.value === value);
  assert.ok(option, `Missing option ${value} for ${question.id}`);
  await button(card, option.label).click();
}

async function answerQuestion(card: Locator, question: QuestionDefinition, answer: Answer) {
  switch (question.type) {
    case 'single_choice':
      assert.equal(typeof answer, 'string', question.id);
      await selectOption(card, question, answer as string);
      return;
    case 'multi_choice':
      assert.ok(Array.isArray(answer) && answer.length > 0, question.id);
      for (const choice of answer) await selectOption(card, question, choice);
      break;
    case 'slider': {
      assert.equal(typeof answer, 'number', question.id);
      const range = card.getByRole('slider');
      await range.fill(String(answer));
      assert.equal(await range.inputValue(), String(answer), question.id);
      break;
    }
    case 'number':
      assert.equal(typeof answer, 'number', question.id);
      await card.getByRole('spinbutton').fill(String(answer));
      await button(card, 'تأكيد الرقم والمتابعة').click();
      return;
    case 'text':
      assert.equal(typeof answer, 'string', question.id);
      await card.getByRole('textbox').fill(answer as string);
      break;
    default:
      throw new Error(`Unexpected question type ${question.type} for ${question.id}`);
  }
  await button(card, 'متابعة').click();
}

async function answerQuestionnaire(page: Page, fixture: JourneyFixture) {
  const dialect = dialectForCountry(fixture.country);
  const catalog = [
    ...universalQuestions.map(question => localizeQuestion({ ...question, label: question.label ?? question.question }, dialect)),
    ...getSectorQuestions(fixture.sector, fixture.subsector),
  ];
  const normalize = (title: string) => title.trim().replace(/\s+/gu, ' ');
  const answered = new Set<string>();
  const card = page.locator(questionCard);
  while (new URL(page.url()).pathname === '/questionnaire') {
    const heading = normalize(await card.getByRole('heading', { level: 2 }).innerText());
    const matches = catalog.filter(question => normalize(question.question ?? '') === heading);
    assert.equal(matches.length, 1, `Expected one question for: ${heading}`);
    const question = matches[0];
    assert.notEqual(question.id, 'u35', 'Automatic currency is excluded from the questionnaire');
    assert.ok(!answered.has(question.id), `Question ${question.id} repeated`);
    assert.ok(Object.hasOwn(fixture.answers, question.id), `Missing scripted answer for ${question.id}`);
    await answerQuestion(card, question, fixture.answers[question.id]);
    answered.add(question.id);

    await page.waitForFunction(({ selector, previous }) => {
      if (location.pathname !== '/questionnaire') return true;
      const title = document.querySelector(selector + ' h2')?.textContent?.trim().replace(/\s+/gu, ' ');
      return Boolean(title && title !== previous);
    }, { selector: questionCard, previous: heading });
  }
  await page.waitForURL('**/review/1');
  const { questionHistory: history, universalAnswers } = await page.evaluate(key => {
    const saved = sessionStorage.getItem(key);
    if (!saved) throw new Error('Questionnaire did not save a tab session');
    return JSON.parse(saved).state as {
      questionHistory: { questionId: string; status: string; answerValue: Answer; questionText: string; answerText: string }[];
      universalAnswers: Record<string, Answer>;
    };
  }, storeKey);
  assert.equal(universalAnswers.u35, currencyForCountry(fixture.country));
  const opener = history.find(entry => entry.questionId === 'u01');
  const canonical = universalQuestions.find(question => question.id === 'u01');
  assert.ok(opener && canonical);
  assert.equal(opener.questionText, canonical.question, 'The saved question uses the original wording');
  assert.equal(opener.answerText, canonical.options?.find(option => option.value === opener.answerValue)?.label,
    'The saved answer label uses the original wording');
  assert.ok(answered.size >= 28, 'The quick diagnostic completed with its full required minimum');
  assert.deepEqual(history.filter(entry => entry.status !== 'answered'), []);
  assert.deepEqual(history.map(entry => entry.questionId).sort(), [...answered].sort());
  for (const entry of history) {
    assert.deepEqual(entry.answerValue, fixture.answers[entry.questionId], entry.questionId);
  }
  return answered.size;
}

interface ProcessingMonitor {
  started?: number;
  exited?: number;
  polls: number;
  sawError: boolean;
  stop: () => void;
}

declare global {
  interface Window {
    bikProcessingMonitor?: ProcessingMonitor;
  }
}

async function confirmReviewsAndWatchProcessing(page: Page) {
  for (const step of [1, 2]) {
    await page.waitForURL('**/review/' + step);
    await page.getByTestId('review-yes').click();
  }
  await page.waitForURL('**/review/3');

  await page.evaluate(() => {
    const errorSelector = '[data-testid="processing-error"]';
    const monitor: ProcessingMonitor & { sample(): void } = {
      polls: 0,
      sawError: false,
      sample() {
        if (document.querySelector(errorSelector)) this.sawError = true;
        if (location.pathname === '/processing') {
          if (document.querySelector('#processing-title')) this.started ??= performance.now();
        } else if (this.started !== undefined) {
          this.exited ??= performance.now();
        }
      },
      stop() {
        observer.disconnect();
        clearInterval(interval);
      },
    };
    // Poll throughout processing. Also catch a card inserted and removed between two ticks.
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && (node.matches(errorSelector) || node.querySelector(errorSelector))) {
            monitor.sawError = true;
          }
        }
      }
      monitor.sample();
    });
    const interval = window.setInterval(() => {
      if (location.pathname === '/processing') monitor.polls++;
      monitor.sample();
    }, 100);
    window.bikProcessingMonitor = monitor;
    observer.observe(document.body, { childList: true, subtree: true });
  });

  await page.getByTestId('review-yes').click();
  await page.waitForFunction(() => {
    const monitor = window.bikProcessingMonitor;
    return monitor?.sawError || monitor?.exited !== undefined;
  }, null, { polling: 100, timeout: 20000 });

  const { elapsed, sawError, polls } = await page.evaluate(() => {
    const monitor = window.bikProcessingMonitor!;
    monitor.stop();
    delete window.bikProcessingMonitor;
    return {
      elapsed: (monitor.exited ?? 0) - (monitor.started ?? 0),
      sawError: monitor.sawError,
      polls: monitor.polls,
    };
  });
  assert.equal(sawError, false, 'Processing rendered its error card');
  assert.ok(polls > 0, 'Processing was polled');
  assert.ok(elapsed >= 6000, `Processing only displayed for ${elapsed.toFixed(0)} ms`);
  await page.waitForURL('**/lead-gate');
  return Math.round(elapsed);
}

async function useLeadGate(page: Page, origin: string, company: string) {
  const gate = page.locator('main form');
  await gate.waitFor();
  assert.equal(await gate.getByRole('textbox', { name: 'اسم الشركة أو النشاط' }).inputValue(), company);

  for (const [path, title] of [['/privacy', 'سياسة الخصوصية'], ['/terms', 'الشروط']]) {
    const link = gate.getByRole('link', { name: title, exact: true });
    assert.equal(await link.getAttribute('href'), path);
    assert.equal(await link.getAttribute('target'), '_blank');
    const [tab] = await Promise.all([page.waitForEvent('popup'), link.click()]);
    await tab.waitForURL(origin + path);
    await tab.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor();
    await tab.waitForLoadState('load');
    await tab.close();
    assert.equal(new URL(page.url()).pathname, '/lead-gate');
  }

  const phone = gate.getByRole('textbox', { name: 'رقم الهاتف' });
  const submit = button(gate, 'متابعة إلى تجهيز التقرير');
  await gate.getByRole('combobox', { name: 'رمز الدولة' }).selectOption('+968');
  await gate.getByRole('checkbox').check();
  await phone.fill('123');
  await submit.click();
  const error = gate.getByRole('alert');
  await error.waitFor();
  assert.equal(await error.innerText(), 'أدخل رقم واتساب صحيحاً من 7 إلى 15 رقماً.');
  assert.equal(new URL(page.url()).pathname, '/lead-gate');

  await phone.fill(omanPhone);
  await submit.click();
  await page.waitForURL('**/report-transfer');
  const accepted = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!).state.whatsapp, storeKey);
  assert.equal(accepted, normalizedOmanPhone);
}

async function completeTransfer(page: Page) {
  const openWhatsApp = page.getByTestId('open-whatsapp');
  const acknowledge = page.getByTestId('acknowledge-part');
  const parts = page.getByRole('list', { name: 'حالة كل جزء' }).getByRole('listitem');
  await parts.first().waitFor();
  const count = await parts.count();
  for (let index = 0; index < count; index++) {
    const [tab] = await Promise.all([page.waitForEvent('popup'), openWhatsApp.click()]);
    await tab.waitForLoadState('load');
    assert.equal(new URL(tab.url()).origin, 'https://wa.me');
    await tab.close();
    await acknowledge.click();
  }
  await page.getByTestId('open-full-analysis').click();
  await page.waitForURL('**/report');
  await page.getByTestId('consultant-cta').waitFor();
}

export async function completeJourney(page: Page, origin: string, fixture: JourneyFixture) {
  await startIntake(page, origin, fixture);
  const answers = await answerQuestionnaire(page, fixture);
  const processingMs = await confirmReviewsAndWatchProcessing(page);
  await useLeadGate(page, origin, fixture.company);
  await completeTransfer(page);
  const reportTitle = page.getByRole('heading', { level: 1 });
  assert.ok((await reportTitle.innerText()).includes(fixture.company), 'The generated report names the test company');
  return { answers, processingMs };
}

export async function completeDialectPreview(page: Page, origin: string, fixture: JourneyFixture, firstQuestion: string, expectedWhy?: string) {
  const legacyCurrency = fixture.country === 'السعودية' ? 'EGP' : undefined;
  await startIntake(page, origin, fixture, { legacyCurrency, expectedWhy });
  const card = page.locator(questionCard);
  assert.equal(await card.getByRole('heading', { level: 2 }).textContent(), firstQuestion);
  assert.equal(await card.getByText('السؤال 1', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
  const answers = await answerQuestionnaire(page, fixture);
  await confirmReviewsAndWatchProcessing(page);
  await page.getByTestId('locked-preview').waitFor();
  await checkStorage(page, fixture.company);
  return `country=${fixture.country} answers=${answers} preview=/lead-gate`;
}

export async function checkStorage(page: Page, company: string) {
  const storage = await page.evaluate(() => ({
    local: Object.entries(localStorage),
    session: Object.keys(sessionStorage).sort(),
  }));
  for (const [key, value] of storage.local) {
    assert.ok(!key.startsWith('bik-'), `Unexpected localStorage key ${key}`);
    assert.ok(![company, omanPhone, normalizedOmanPhone, '91234567'].some(text => key.includes(text) || value.includes(text)),
      'Visitor identity reached localStorage');
  }
  return storage.session.map(key => key.replace(/:[0-9a-f-]{36}$/iu, ':<sessionId>'));
}
