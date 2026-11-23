import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { preview } from 'vite';
import { checkConsultantPathways, checkDirectRoutes, checkFaq, checkOffers, checkPayments, checkReportPathways } from './checks';
import { strong, weak, type JourneyFixture } from './fixtures';
import { checkStorage, completeJourney, startIntake } from './journey';

const mobile = { width: 390, height: 844 };
const desktop = { width: 1280, height: 800 };
type Viewport = typeof mobile;

interface BrowserTest {
  name: string;
  viewport: Viewport;
  run: (page: Page, origin: string) => Promise<string | void>;
}

function reportTest(fixture: JourneyFixture, viewport: Viewport, size: string): BrowserTest {
  const kind = fixture.expectPathways ? 'weak' : 'strong';
  return {
    name: `report-${kind}-${size}`,
    viewport,
    async run(page, origin) {
      const checkKeyboard = fixture.expectPathways && size === 'mobile';
      if (checkKeyboard) {
        await page.goto(origin + '/');
        await checkFaq(page);
      }
      const { answers, processingMs } = await completeJourney(page, origin, fixture);
      await checkReportPathways(page, fixture.expectPathways);
      if (checkKeyboard) await checkFaq(page);
      const contrast = fixture.expectPathways ? await checkOffers(page) : '';
      await page.getByTestId('header-consultant-link').click();
      await page.waitForURL('**/consultant');
      await checkConsultantPathways(page, fixture.dialect);
      await page.goBack();
      await page.waitForURL('**/report');
      await page.getByTestId('consultant-cta').waitFor();

      const keys = await checkStorage(page, fixture.company);
      return [
        `answers=${answers}`,
        `processing=${processingMs}ms`,
        `dialect=${fixture.dialect}`,
        contrast && `contrast=${contrast}`,
        `sessionStorage=${JSON.stringify(keys)}`,
      ].filter(Boolean).join(' ');
    },
  };
}

const tests: BrowserTest[] = [
  reportTest(weak, mobile, 'mobile'),
  reportTest(strong, mobile, 'mobile'),
  {
    name: 'direct-routes-mobile',
    viewport: mobile,
    run: checkDirectRoutes,
  },
];
for (const [size, viewport] of [['mobile', mobile], ['desktop', desktop]] as const) {
  tests.push(
    {
      name: 'consultant-' + size,
      viewport,
      async run(page, origin) {
        await startIntake(page, origin, {
          ...weak,
          country: 'أخرى',
          city: 'مدينة الاختبار',
          company: 'منشأة اختبار الفصحى',
        });
        await page.goto(origin + '/consultant');
        await checkConsultantPathways(page, 'msa_neutral');
        if (size === 'mobile') await checkFaq(page);
        return 'pathways=87 dialect=msa_neutral';
      },
    },
    {
      name: 'payments-' + size,
      viewport,
      run: checkPayments,
    },
  );
}
tests.push(reportTest(weak, desktop, 'desktop'), reportTest(strong, desktop, 'desktop'));

async function startPreview() {
  const index = await readFile(new URL('../../dist/index.html', import.meta.url), 'utf8');
  const deployment = JSON.parse(await readFile(new URL('../../../../vercel.json', import.meta.url), 'utf8')) as {
    rewrites: { source: string; destination: string }[];
  };
  const startPath = '/_bik-api/v1/sessions/start';
  assert.ok(deployment.rewrites.some(rule =>
    rule.destination === '/index.html' && new RegExp('^' + rule.source + '$', 'u').test(startPath)),
  'Expected the static deployment to rewrite the session-start URL to index.html');

  return preview({
    configFile: false,
    logLevel: 'error',
    preview: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'e2e-static-session-rewrite',
      configurePreviewServer({ middlewares }) {
        // Vite preview only rewrites GET/HEAD. Apply the repo's static rewrite to this POST so
        // Welcome exercises its real browser-only fallback, without a development Express server.
        middlewares.use((request, response, next) => {
          if (request.method !== 'POST' || request.url !== startPath) return next();
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end(index);
        });
      },
    }],
  });
}

function isFavicon(url: string) {
  return /(?:^|\/)favicon(?:\.[^/?#]+)?(?:[?#]|$)/iu.test(url);
}

function formatError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, ' ').trim();
}

async function runTest(browser: Browser, origin: string, test: BrowserTest, output: string) {
  const issues = new Set<string>();
  const context = await browser.newContext({ viewport: test.viewport, reducedMotion: 'reduce' });
  const screenshot = join(output, test.name + '.png');
  try {
    context.on('console', message => {
      if (message.type() === 'error' && !isFavicon(message.location().url)) issues.add('Console: ' + message.text());
    });
    context.on('weberror', event => issues.add('Page error: ' + event.error().message));
    context.on('requestfailed', request => {
      if (!isFavicon(request.url())) {
        issues.add(`Request: ${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText}`);
      }
    });
    context.on('response', response => {
      if (response.status() >= 400 && !isFavicon(response.url())) {
        issues.add(`HTTP ${response.status()}: ${response.request().method()} ${new URL(response.url()).pathname}`);
      }
    });
    // Confirm only synthetic handoffs. No messages or payment requests leave the browser.
    await context.route('https://wa.me/**', route => route.fulfill({
      contentType: 'text/html',
      body: '<title>Simulated WhatsApp handoff</title>',
    }));

    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.setDefaultNavigationTimeout(15000);
    let detail = '';
    try {
      const result = await test.run(page, origin);
      if (typeof result === 'string') detail = result;
      await page.waitForLoadState('networkidle');
    } catch (error) {
      issues.add(formatError(error));
    }
    try {
      await page.screenshot({ path: screenshot, animations: 'disabled', timeout: 10000 });
    } catch (error) {
      issues.add('Screenshot: ' + formatError(error));
    }

    const status = issues.size === 0 ? 'PASS' : 'FAIL';
    console.log([status, test.name, screenshot, detail, ...Array.from(issues, formatError)].filter(Boolean).join(' | '));
    return status === 'PASS';
  } finally {
    await context.close();
  }
}

async function main() {
  const start = performance.now();
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;
  let browser: Browser;
  try {
    browser = await chromium.launch({ executablePath });
  } catch {
    console.error('Chromium is unavailable. Run playwright-core install chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE to an installed Chromium.');
    process.exitCode = 2;
    return;
  }

  try {
    const output = join('e2e-output', new Date().toISOString().replace(/[:.]/gu, '-'));
    await mkdir(output, { recursive: true });
    const server = await startPreview();
    try {
      const origin = 'http://127.0.0.1:' + (server.httpServer.address() as AddressInfo).port;
      let passed = 0;
      for (const test of tests) {
        if (await runTest(browser, origin, test, output)) passed++;
      }
      if (passed !== tests.length) process.exitCode = 1;
      console.log(`TOTAL ${passed}/${tests.length} PASS in ${((performance.now() - start) / 1000).toFixed(1)}s`);
    } finally {
      await server.close();
    }
  } finally {
    await browser.close();
  }
}

await main().catch(error => {
  console.error('E2E setup failed: ' + formatError(error));
  process.exitCode = 1;
});
