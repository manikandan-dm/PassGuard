// Optional browser integration tests. All breach traffic is intercepted and mocked.
import { chromium, firefox } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.PASSGUARD_URL || 'http://localhost:3000';
const origin = new URL(base).origin;
const browserName = process.env.PASSGUARD_BROWSER || 'chromium';
assert.ok(['chromium', 'firefox'].includes(browserName), 'PASSGUARD_BROWSER must be chromium or firefox.');
const browserLabel = browserName === 'firefox' ? 'Firefox' : 'Chromium';
const resultFile = browserName === 'firefox' ? 'firefox-test-results.json' : 'browser-test-results.json';
const screenshotSuffix = browserName === 'firefox' ? '-firefox' : '';
let pdfByteLength = null;
const fixture = 'vR8#kL2!xT9@pN6$';
const fullHash = createHash('sha1').update(fixture).digest('hex').toUpperCase();
const suffix = fullHash.slice(5);
const other = suffix === 'F'.repeat(35) ? 'A'.repeat(35) : 'F'.repeat(35);
const checks = [];
const consoleErrors = [];
const expectedMockAbortUrls = new Set();
const expectedMockRateLimitUrls = new Set();
const expectedConsoleDiagnostics = [];
const pageErrors = [];
const localFailures = [];
const apiRequests = [];
const unexpectedExternal = [];
const accessibilityScans = [];
const responsiveCases = [];
let apiMode = 'match';
let heldRoute = null;
let onHeld = null;
const browser = await ({ chromium, firefox })[browserName].launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  // Firefox does not support these Chromium permission names. Its successful
  // clipboard boundary is explicitly mocked below; native permissions are manual.
  permissions: browserName === 'chromium' ? ['clipboard-read', 'clipboard-write'] : [],
  acceptDownloads: true,
  reducedMotion: 'reduce',
});
await context.addInitScript(() => {
  // Test-only click coverage, containing control identifiers but no input values.
  window.__passguardVerification = { actions: [], controls: [] };
  document.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('button');
      if (button && !button.disabled) {
        if (button.dataset.action)
          window.__passguardVerification.actions.push(button.dataset.action);
        if (button.id) window.__passguardVerification.controls.push(button.id);
        if (button.dataset.togglePassword)
          window.__passguardVerification.controls.push(
            `visibility:${button.dataset.togglePassword}`,
          );
      }
      if (event.target.closest('.skip-link'))
        window.__passguardVerification.controls.push('skip-link');
      if (event.target.closest('#sidebar-backdrop'))
        window.__passguardVerification.controls.push('sidebar-backdrop');
    },
    true,
  );
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  const expectedUrl = [...expectedMockAbortUrls].find((url) =>
    message.location().url === url || text.includes(url),
  );
  const expectedRateLimitUrl = [...expectedMockRateLimitUrls].find((url) =>
    message.location().url === url || text.includes(url),
  );
  if (expectedRateLimitUrl && /^Failed to load resource: the server responded with a status of 429\b/.test(text)) {
    expectedMockRateLimitUrls.delete(expectedRateLimitUrl);
    expectedConsoleDiagnostics.push({ kind: 'Expected browser diagnostic from explicit mocked HTTP 429 breach response' });
    return;
  }
  const knownMockAbortDiagnostic = browserName === 'firefox'
    ? text.includes('Cross-Origin Request Blocked:') &&
      text.includes('Reason: CORS request did not succeed') && text.includes('Status code: (null)')
    : /^Failed to load resource: net::ERR_FAILED(?:$|\s)/.test(text);
  if (expectedUrl && knownMockAbortDiagnostic) {
    // Classify only a diagnostic tied to an explicitly aborted mock URL. Do not
    // suppress unrelated CORS, application, missing-asset, or console errors.
    expectedMockAbortUrls.delete(expectedUrl);
    expectedConsoleDiagnostics.push({ kind: 'Expected browser diagnostic from deliberately aborted mock breach request' });
    return;
  }
  consoleErrors.push(text);
});
page.on('response', (response) => {
  if (response.url().startsWith(origin) && response.status() >= 400)
    localFailures.push(response.url());
});
await context.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin === origin) return route.continue();
  if (url.origin !== 'https://api.pwnedpasswords.com') {
    unexpectedExternal.push(request.url());
    return route.abort();
  }
  apiRequests.push({
    url: request.url(),
    method: request.method(),
    body: request.postData(),
    padding: request.headers()['add-padding'] ?? null,
    referrerPresent: Boolean(request.headers().referer),
    cookiePresent: Boolean(request.headers().cookie),
    authorizationPresent: Boolean(request.headers().authorization),
  });
  if (apiMode === 'network') {
    expectedMockAbortUrls.add(request.url());
    return route.abort('failed');
  }
  if (apiMode === 'hold') {
    heldRoute = route;
    onHeld?.();
    return;
  }
  const body =
    apiMode === 'match'
      ? `${other}:0\r\n${suffix}:42`
      : apiMode === 'negative'
        ? `${other}:1`
        : apiMode === 'malformed'
          ? `${suffix}:5\r\ninvalid`
          : 'rate limited';
  if (apiMode === 'rate-limit') expectedMockRateLimitUrls.add(request.url());
  return route.fulfill({
    status: apiMode === 'rate-limit' ? 429 : 200,
    contentType: 'text/plain',
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Add-Padding' },
    body,
  });
});
async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, status: 'passed' });
    console.log(`PASS ${name}`);
  } catch (error) {
    checks.push({ name, status: 'failed', message: error.message });
    throw error;
  }
}
async function go(view) {
  await page.evaluate((value) => {
    location.hash = value;
  }, view);
  await page.locator(`#view-${view}`).waitFor({ state: 'visible' });
}
async function text(selector, value) {
  await page.waitForFunction(
    ({ selector, value }) => document.querySelector(selector)?.textContent.includes(value),
    { selector, value },
  );
}
async function analyze(value = fixture) {
  await go('analyzer');
  await page.locator('#analyzer-password').fill(value);
  await page.locator('#view-analyzer [data-action="analyze"]').click();
  await page.locator('[role="meter"]').waitFor();
}
async function axe(label) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  accessibilityScans.push({ label, violations: result.violations.length });
  assert.deepEqual(
    result.violations.map((item) => ({
      id: item.id,
      impact: item.impact,
      nodes: item.nodes.map((node) => node.target),
    })),
    [],
    label,
  );
}
let failed;
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await check('initial dashboard: honest empty state and no external requests', async () => {
    assert.equal(await page.locator('.view:visible').count(), 1);
    assert.ok((await page.locator('#dashboard-metrics').textContent()).includes('Not analyzed'));
    assert.equal(await page.locator('[data-action="generate-report"]').isDisabled(), true);
    assert.equal(apiRequests.length, 0);
    assert.equal(unexpectedExternal.length, 0);
    await axe('empty overview');
  });
  await check('all ten navigation destinations and browser history', async () => {
    for (const view of [
      'analyzer',
      'generator',
      'resistance',
      'common',
      'breach',
      'recommendations',
      'report',
      'tips',
      'privacy',
      'overview',
    ]) {
      await page.locator(`[data-nav="${view}"]`).click();
      await page.locator(`#view-${view}`).waitFor({ state: 'visible' });
      assert.equal(await page.locator('.view:visible').count(), 1);
      assert.equal(await page.locator(`[data-nav="${view}"]`).getAttribute('aria-current'), 'page');
    }
    await page.goBack();
    await page.locator('#view-privacy').waitFor({ state: 'visible' });
    await go('overview');
  });
  await check(
    'keyboard skip link preserves each current section and focuses main content',
    async () => {
      for (const view of [
        'overview',
        'analyzer',
        'generator',
        'resistance',
        'common',
        'breach',
        'recommendations',
        'report',
        'tips',
        'privacy',
      ]) {
        await go(view);
        await page.locator('.skip-link').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator(`#view-${view}`).isVisible(), true);
        assert.equal(await page.evaluate(() => location.hash), `#${view}`);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'main-content');
      }
      await go('overview');
    },
  );
  await check('theme toggle and password visibility are accessible and functional', async () => {
    await page.locator('#theme-toggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await axe('light empty overview');
    await page.locator('#theme-toggle').click();
    await page.locator('#dashboard-password').fill(fixture);
    await page.locator('[data-toggle-password="dashboard-password"]').click();
    assert.equal(await page.locator('#dashboard-password').getAttribute('type'), 'text');
    await page.locator('[data-toggle-password="dashboard-password"]').click();
    assert.equal(await page.locator('#dashboard-password').getAttribute('type'), 'password');
    assert.equal(apiRequests.length, 0);
  });
  await check('analysis, character statistics, common checks and shared score', async () => {
    await page.locator('#view-overview [data-action="analyze"]').click();
    await text('#dashboard-metrics', 'Strong');
    const dashboardScore = await page.locator('.metric-value').first().textContent();
    await go('analyzer');
    assert.equal(await page.locator('#analyzer-password').inputValue(), fixture);
    const score = await page.locator('[role="meter"]').getAttribute('aria-valuenow');
    assert.ok(dashboardScore.includes(score));
    const counts = await page.locator('.character-stat strong').allTextContents();
    assert.deepEqual(counts, ['16', '4', '4', '4', '4']);
    await go('common');
    assert.ok(
      (await page.locator('#common-results').textContent()).includes('Not found in the local list'),
    );
    await page.locator('[data-action="local-check"]').click();
    assert.equal(apiRequests.length, 0);
  });
  await check('stale analysis and report are hidden immediately on input change', async () => {
    await go('report');
    await page.locator('[data-action="generate-report"]').click();
    await page.locator('#report-preview').waitFor({ state: 'visible' });
    await go('analyzer');
    await page.locator('#analyzer-password').fill('Password2026!');
    assert.equal(await page.locator('#stale-notice').isVisible(), true);
    assert.equal(await page.locator('[role="meter"]').count(), 0);
    await go('report');
    assert.equal(await page.locator('[data-action="export-html"]').isDisabled(), true);
    await analyze('Password2026!');
    assert.ok(Number(await page.locator('[role="meter"]').getAttribute('aria-valuenow')) < 40);
    assert.ok(
      (await page.locator('#analyzer-results').textContent()).includes(
        'Common word with a simple addition',
      ),
    );
    await analyze('password');
    await go('common');
    await text('#common-results', 'Exact match in the local list');
    await analyze(fixture);
  });
  await check('attack scenarios show finite estimates and validate editable rates', async () => {
    await go('resistance');
    assert.equal(await page.locator('#resistance-results tbody tr').count(), 4);
    assert.ok(!/Infinity|NaN/.test(await page.locator('#resistance-results').textContent()));
    await page.locator('#rate-online-strict').fill('1');
    await page.locator('[data-action="update-rates"]').click();
    assert.equal(
      await page.locator('#resistance-results tbody tr').first().locator('td').nth(1).textContent(),
      '1',
    );
    await page.locator('#rate-online-strict').fill('0');
    await page.locator('[data-action="update-rates"]').click();
    assert.equal(await page.locator('#scenario-error').isVisible(), true);
    await page.locator('[data-action="reset-rates"]').click();
    assert.equal(await page.locator('#rate-online-strict').inputValue(), '0.1');
  });
  await check('generator length, categories, analysis integration and clear', async () => {
    await go('generator');
    await page.locator('#generator-length-number').fill('32');
    await page.locator('[data-action="generate"]').click();
    const generated = await page.locator('#generated-password').inputValue();
    assert.equal(generated.length, 32);
    for (const pattern of [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/])
      assert.match(generated, pattern);
    await page.locator('[data-action="analyze-generated"]').click();
    await page.locator('#view-analyzer').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#analyzer-password').inputValue(), generated);
    assert.equal((await page.locator('.character-stat strong').allTextContents())[0], '32');
    await go('generator');
    await page.locator('[data-action="clear-generated"]').click();
    assert.equal(await page.locator('#generated-password').inputValue(), '');
    for (const input of await page.locator('[name="category"]').all()) await input.uncheck();
    await page.locator('[data-action="generate"]').click();
    await text('#generator-error', 'at least one');
    await page.locator('[name="category"][value="digits"]').check();
    await page.locator('[data-action="generate"]').click();
    assert.match(await page.locator('#generated-password').inputValue(), /^\d{32}$/);
    assert.equal(apiRequests.length, 0);
  });
  await check(
    browserName === 'firefox'
      ? 'clipboard success (mocked Firefox boundary) and denied-write manual fallback'
      : 'clipboard writes successfully; permission rejection offers manual copy without false success',
    async () => {
      if (browserName === 'firefox') {
        await page.evaluate(() => {
          let contents = '';
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
              writeText: async (value) => { contents = value; },
              readText: async () => contents,
            },
          });
        });
      }
      const generated = await page.locator('#generated-password').inputValue();
      await page.locator('[data-action="copy-generated"]').click();
      await text('#clipboard-message', 'Copied successfully');
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), generated);
      await page.evaluate(() =>
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async () => {
              throw new DOMException('Denied', 'NotAllowedError');
            },
          },
        }),
      );
      await page.locator('[data-action="copy-generated"]').click();
      await text('#clipboard-message', 'selected for manual copying');
      assert.ok(
        !(await page.locator('#clipboard-message').textContent()).includes('Copied successfully'),
      );
      assert.equal(
        await page
          .locator('#generated-password')
          .evaluate((el) => el.selectionEnd - el.selectionStart),
        generated.length,
      );
    },
  );
  await check(
    'reset rejects late clipboard callbacks even after a new password is generated',
    async () => {
      await page.evaluate(() =>
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: () =>
              new Promise((resolve) => {
                window.__releaseCopy = resolve;
              }),
          },
        }),
      );
      await page.locator('[data-action="copy-generated"]').click();
      assert.equal(await page.locator('[data-action="copy-generated"]').isDisabled(), true);
      await go('analyzer');
      await page.locator('#view-analyzer [data-action="reset"]').click();
      await go('generator');
      await page.locator('[data-action="generate"]').click();
      await page.evaluate(async () => {
        window.__releaseCopy();
        await Promise.resolve();
        await Promise.resolve();
      });
      assert.equal(await page.locator('#clipboard-message').textContent(), '');
      assert.ok(!(await page.locator('#toast').textContent()).includes('copied successfully'));
    },
  );
  await check(
    'HTML-like password input remains data and cannot inject markup or a report credential',
    async () => {
      const synthetic = '"><img src=x onerror="window.__xss=true">';
      await analyze(synthetic);
      assert.equal(await page.locator('img').count(), 0);
      assert.equal(await page.evaluate(() => window.__xss), undefined);
      await go('report');
      await page.locator('[data-action="generate-report"]').click();
      assert.ok(!(await page.locator('#report-preview').innerHTML()).includes(synthetic));
      assert.equal(unexpectedExternal.length, 0);
    },
  );
  await check('explicit breach success and exact five-character request privacy', async () => {
    await analyze(fixture);
    await go('breach');
    assert.equal(apiRequests.length, 0);
    await page.locator('[data-action="check-breach"]').click();
    await text('#breach-results', 'Match found in the checked dataset');
    await text('#breach-results', '42');
    assert.equal(apiRequests.length, 1);
    assert.equal(
      apiRequests[0].url,
      `https://api.pwnedpasswords.com/range/${fullHash.slice(0, 5)}`,
    );
    assert.equal(apiRequests[0].body, null);
    assert.ok(!JSON.stringify(apiRequests).includes(fixture));
    assert.ok(!JSON.stringify(apiRequests).includes(fullHash));
    await go('recommendations');
    await text('#recommendation-results', 'Replace this exposed password');
  });
  await check(
    'mocked negative, network failure, rate limit and malformed breach states',
    async () => {
      await go('breach');
      for (const mode of ['negative', 'network', 'rate-limit', 'malformed']) {
        apiMode = mode;
        await page.locator('[data-action="check-breach"]').click();
        await text(
          '#breach-results',
          mode === 'negative' ? 'No match found in the checked dataset' : 'Check failed',
        );
        if (mode !== 'negative')
          assert.ok(
            !(await page.locator('#breach-results').textContent()).includes(
              'No match found in the checked dataset',
            ),
          );
      }
    },
  );
  await check('cancel and changed-input races discard late breach responses', async () => {
    apiMode = 'hold';
    const held = new Promise((resolve) => {
      onHeld = resolve;
    });
    await page.locator('[data-action="check-breach"]').click();
    await held;
    assert.equal(await page.locator('[data-action="cancel-breach"]').isVisible(), true);
    await page.locator('[data-action="cancel-breach"]').click();
    await text('#breach-results', 'Ready when you are');
    await heldRoute
      .fulfill({ status: 200, contentType: 'text/plain', body: `${suffix}:42` })
      .catch(() => {});
    const heldAgain = new Promise((resolve) => {
      onHeld = resolve;
    });
    await page.locator('[data-action="check-breach"]').click();
    await heldAgain;
    await go('analyzer');
    await page.locator('#analyzer-password').fill(`${fixture}Z`);
    await heldRoute
      .fulfill({ status: 200, contentType: 'text/plain', body: `${suffix}:42` })
      .catch(() => {});
    await go('breach');
    await text('#breach-results', 'Analyze first');
    assert.equal(await page.locator('[data-action="check-breach"]').isDisabled(), true);
  });
  await check('report preview, real HTML/text downloads, privacy and clear report', async () => {
    await analyze(fixture);
    await go('report');
    await page.locator('[data-action="generate-report"]').click();
    await page.locator('#report-preview').waitFor({ state: 'visible' });
    const content = await page.locator('#report-preview').textContent();
    assert.ok(content.includes('Not checked'));
    assert.ok(!content.includes(fixture));
    assert.ok(!content.includes(fullHash));
    for (const format of ['html', 'text']) {
      const downloadPromise = page.waitForEvent('download');
      await page.locator(`[data-action="export-${format}"]`).click();
      const download = await downloadPromise;
      const file = await download.path();
      const output = await readFile(file, 'utf8');
      assert.match(download.suggestedFilename(), format === 'html' ? /\.html$/ : /\.txt$/);
      assert.ok(
        output.includes('Password Security Assessment') ||
          output.includes('PASSWORD SECURITY ASSESSMENT'),
      );
      assert.ok(!output.includes(fixture));
      assert.ok(!output.includes(fullHash));
    }
    await page.locator('[data-action="clear-report"]').click();
    assert.equal(await page.locator('#report-preview').isVisible(), false);
    assert.equal(await page.locator('[data-action="export-text"]').isDisabled(), true);
    await page.locator('[data-action="generate-report"]').click();
  });
  await check(browserName === 'firefox'
    ? 'print invocation (mocked) and report-only stylesheet; Firefox PDF/dialog remains manual'
    : 'print invocation (mocked), report-only stylesheet and real headless PDF', async () => {
    await page.evaluate(() => {
      window.__printCalls = 0;
      window.print = () => {
        window.__printCalls++;
      };
    });
    await page.locator('[data-action="print-report"]').click();
    assert.equal(await page.evaluate(() => window.__printCalls), 1);
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('#report-preview').isVisible(), true);
    assert.equal(await page.locator('.sidebar').isVisible(), false);
    assert.equal(await page.locator('.report-toolbar').isVisible(), false);
    // Playwright's PDF API is Chromium-only, not a Firefox capability.
    if (browserName === 'chromium') {
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      pdfByteLength = pdf.length;
      assert.ok(pdfByteLength > 10000);
    }
    await page.emulateMedia({ media: 'screen' });
  });
  await check('WCAG A/AA automated scans: all ten populated views in both themes', async () => {
    for (const theme of ['dark', 'light']) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page.locator('#theme-toggle').click();
      for (const view of [
        'overview',
        'analyzer',
        'generator',
        'resistance',
        'common',
        'breach',
        'recommendations',
        'report',
        'tips',
        'privacy',
      ]) {
        await go(view);
        await axe(`${theme}/${view}`);
      }
    }
    await page.locator('#theme-toggle').click();
  });
  await check(
    'responsive layouts: every section at 320, 360, 390, 768, 1024 and 1440 pixels',
    async () => {
      for (const width of [320, 360, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 950 });
        for (const view of [
          'overview',
          'analyzer',
          'generator',
          'resistance',
          'common',
          'breach',
          'recommendations',
          'report',
          'tips',
          'privacy',
        ]) {
          await go(view);
          const size = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            viewport: innerWidth,
          }));
          assert.ok(
            size.scroll <= size.viewport + 1,
            `Overflow at ${width}px/${view}: ${size.scroll}`,
          );
          responsiveCases.push({ width, view, overflow: size.scroll > size.viewport + 1 });
        }
      }
    },
  );
  await check('mobile drawer, keyboard Escape, focus management and theme', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await go('overview');
    assert.equal(await page.locator('#sidebar').evaluate((el) => el.inert), true);
    await page.locator('#sidebar-toggle').click();
    assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'), 'true');
    const firstLink = page.locator('#sidebar a[href]').first();
    const lastLink = page.locator('#sidebar a[href]').last();
    await lastLink.focus();
    await page.keyboard.press('Tab');
    assert.equal(await firstLink.evaluate((el) => document.activeElement === el), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await lastLink.evaluate((el) => document.activeElement === el), true);
    await page.locator('#sidebar-close').click();
    assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(
      await page.locator('#sidebar-toggle').evaluate((el) => document.activeElement === el),
      true,
    );
    await page.locator('#sidebar-toggle').click();
    await page.locator('#sidebar-backdrop').click({ position: { x: 350, y: 400 } });
    assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'), 'false');
    await page.locator('#sidebar-toggle').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'), 'false');
    await page.locator('#sidebar-toggle').click();
    await page.locator('[data-nav="generator"]').click();
    await page.locator('#view-generator').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#sidebar-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#sidebar').evaluate((el) => el.inert), true);
    await axe('mobile generator');
  });
  await check(
    'reset clears sensitive controls, masks inputs and removes assessments/reports',
    async () => {
      await go('analyzer');
      await page.locator('[data-toggle-password="analyzer-password"]').click();
      await page.locator('#view-analyzer [data-action="reset"]').click();
      for (const selector of ['#analyzer-password', '#dashboard-password', '#generated-password'])
        assert.equal(await page.locator(selector).inputValue(), '');
      assert.equal(await page.locator('#analyzer-password').getAttribute('type'), 'password');
      assert.equal(await page.locator('[role="meter"]').count(), 0);
      assert.equal(await page.locator('#report-preview').textContent(), '');
      assert.equal(await page.locator('#stale-notice').isVisible(), false);
      const storage = await page.evaluate(() => ({
        local: localStorage.length,
        session: sessionStorage.length,
        cookies: document.cookie,
      }));
      assert.deepEqual(storage, { local: 0, session: 0, cookies: '' });
    },
  );
  await check(
    'missing Web Crypto fails closed while analysis and reporting remain available',
    async () => {
      const isolated = await browser.newContext();
      await isolated.addInitScript(() =>
        Object.defineProperty(window, 'crypto', { configurable: true, value: undefined }),
      );
      const isolatedPage = await isolated.newPage();
      await isolatedPage.goto(`${base}/#generator`);
      assert.equal(await isolatedPage.locator('[data-action="generate"]').isDisabled(), true);
      assert.ok(
        (await isolatedPage.locator('#generator-error').textContent()).includes(
          'no insecure fallback',
        ),
      );
      await isolatedPage.evaluate(() => {
        location.hash = 'analyzer';
      });
      await isolatedPage.locator('#analyzer-password').fill(fixture);
      await isolatedPage.locator('#view-analyzer [data-action="analyze"]').click();
      await isolatedPage.locator('[role="meter"]').waitFor();
      await isolatedPage.evaluate(() => {
        location.hash = 'report';
      });
      await isolatedPage.locator('[data-action="generate-report"]').click();
      assert.equal(await isolatedPage.locator('#report-preview').isVisible(), true);
      await isolated.close();
    },
  );
  await check('clean application logs, references, storage and network boundaries', async () => {
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(localFailures, []);
    assert.deepEqual(unexpectedExternal, []);
    for (const request of apiRequests) {
      assert.match(request.url, /^https:\/\/api\.pwnedpasswords\.com\/range\/[A-F0-9]{5}$/);
      assert.equal(request.body, null);
      assert.equal(request.method, 'GET');
      assert.equal(request.padding, 'true');
      assert.equal(request.referrerPresent, false);
      assert.equal(request.cookiePresent, false);
      assert.equal(request.authorizationPresent, false);
    }
    const coverage = await page.evaluate(() => window.__passguardVerification);
    const declaredActions = await page
      .locator('button[data-action]')
      .evaluateAll((buttons) =>
        [...new Set(buttons.map((button) => button.dataset.action))].sort(),
      );
    assert.deepEqual([...new Set(coverage.actions)].sort(), declaredActions);
    for (const control of [
      'theme-toggle',
      'sidebar-toggle',
      'sidebar-close',
      'sidebar-backdrop',
      'visibility:dashboard-password',
      'visibility:analyzer-password',
      'skip-link',
    ])
      assert.ok(coverage.controls.includes(control), `Control not exercised: ${control}`);
    assert.ok(!(await page.locator('body').innerText()).includes(fixture));
  });
  // Only empty-state screenshots are saved, never password values.
  await page.setViewportSize({ width: 1440, height: 1100 });
  await go('overview');
  await page.locator('#toast').evaluate((el) => {
    el.hidden = true;
  });
  await mkdir(path.join(root, 'docs/screenshots'), { recursive: true });
  await page.screenshot({ path: path.join(root, `docs/screenshots/overview${screenshotSuffix}.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(root, `docs/screenshots/mobile${screenshotSuffix}.png`), fullPage: true });
} catch (error) {
  failed = error;
  console.error(error.message);
} finally {
  const summary = {
    runAt: new Date().toISOString(),
    environment: `${browserLabel} headless / Playwright`,
    browserVersion: browser.version(),
    hostPlatform: process.platform,
    nodeVersion: process.version,
    capabilities: {
      clipboardSuccess: browserName === 'chromium'
        ? 'Real browser clipboard with granted permissions'
        : 'Mocked Clipboard API boundary; native Firefox clipboard permissions remain manual',
      print: 'Mocked window.print invocation and real print-media stylesheet checks',
      headlessPdfBytes: pdfByteLength,
      nativePrintDialog: 'Not tested',
      actualKaliFirefoxESR: 'Not tested; host is the Arena Linux sandbox',
    },
    baseUrl: base,
    checks,
    passed: checks.filter((item) => item.status === 'passed').length,
    failed: checks.filter((item) => item.status === 'failed').length,
    breachRequests: 'Mocked only; no live breach API requests',
    requestPrivacy: {
      observedRequestCount: apiRequests.length,
      fiveHexPrefixOnly:
        apiRequests.length > 0 &&
        apiRequests.every((request) =>
          /^https:\/\/api\.pwnedpasswords\.com\/range\/[A-F0-9]{5}$/.test(request.url),
        ),
      getOnly: apiRequests.length > 0 && apiRequests.every((request) => request.method === 'GET'),
      requestBodiesAbsent:
        apiRequests.length > 0 && apiRequests.every((request) => request.body === null),
      plaintextTransmitted: JSON.stringify(apiRequests).includes(fixture),
      completeHashTransmitted: JSON.stringify(apiRequests).includes(fullHash),
      paddingRequested:
        apiRequests.length > 0 && apiRequests.every((request) => request.padding === 'true'),
      referrerCookieOrAuthorizationObserved: apiRequests.some(
        (request) =>
          request.referrerPresent || request.cookiePresent || request.authorizationPresent,
      ),
    },
    accessibilityScans,
    responsiveCases,
    browserDiagnostics: {
      uncaughtJavaScriptErrors: pageErrors.length,
      unexpectedConsoleErrors: consoleErrors.length,
      expectedMockedNetworkConsoleMessages: expectedConsoleDiagnostics.length,
      failedLocalFileResponses: localFailures.length,
      unexpectedExternalRequests: unexpectedExternal.length,
    },
    expectedConsoleDiagnostics,
    buttonCoverage: await page
      .evaluate(() => ({
        clickedActions: [...new Set(window.__passguardVerification.actions)].sort(),
        exercisedControls: [...new Set(window.__passguardVerification.controls)].sort(),
      }))
      .catch(() => null),
    accessibility:
      'axe-core WCAG 2 A/AA and 2.1 A/AA scans; not a manual accessibility certification',
  };
  await writeFile(
    path.join(root, 'docs', resultFile),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await browser.close();
}
if (failed) throw failed;
console.log(`\n${checks.length} ${browserLabel} integration groups passed.`);
