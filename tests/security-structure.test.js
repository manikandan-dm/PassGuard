import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');
const scripts = async () =>
  Promise.all(
    (await readdir(path.join(root, 'js')))
      .filter((name) => name.endsWith('.js'))
      .map(async (name) => ({ name, source: await read(`js/${name}`) })),
  );

test('required application and documentation files exist and are nonempty', async () => {
  for (const file of [
    'index.html',
    'README.md',
    '.gitignore',
    'css/style.css',
    'css/responsive.css',
    'css/print.css',
    'docs/architecture.md',
    'docs/manual-testing.md',
    'js/app.js',
    'js/ui.js',
    'js/analyzer.js',
    'js/character-analysis.js',
    'js/weakness-detector.js',
    'js/entropy-calculator.js',
    'js/strength-score.js',
    'js/recommendations.js',
    'js/attack-estimator.js',
    'js/crack-time-estimator.js',
    'js/risk-indicators.js',
    'js/password-generator.js',
    'js/common-password-checker.js',
    'js/breach-checker.js',
    'js/security-report.js',
    'js/report-export.js',
  ]) {
    assert.ok((await stat(path.join(root, file))).size > 0, file);
  }
});
test('all ES-module imports resolve locally and no runtime package is required', async () => {
  for (const { name, source } of await scripts()) {
    for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('./'), `${name}: unexpected external import`);
      assert.ok((await stat(path.join(root, 'js', match[1]))).isFile(), name);
    }
  }
  const manifest = JSON.parse(await read('package.json'));
  assert.equal(manifest.type, 'module');
  assert.equal(Object.keys(manifest.dependencies || {}).length, 0);
});
test('HTML assets and all ten navigation views are linked correctly', async () => {
  const html = await read('index.html');
  for (const asset of [...html.matchAll(/(?:src|href)="([^"#]+\.(?:css|js|svg))"/g)].map(
    (match) => match[1],
  ))
    assert.ok((await stat(path.join(root, asset))).isFile(), asset);
  const views = [...html.matchAll(/data-nav="([a-z]+)"/g)].map((match) => match[1]);
  assert.equal(views.length, 10);
  assert.equal(new Set(views).size, 10);
  for (const view of views) {
    assert.ok(html.includes(`id="view-${view}"`));
    assert.ok(html.includes(`id="heading-${view}"`));
  }
});
test('runtime source never logs, persists credentials, or uses insecure randomness', async () => {
  for (const { name, source } of await scripts()) {
    assert.ok(
      !/\b(?:localStorage|sessionStorage|indexedDB)\b|document\.cookie\s*=/.test(source),
      name,
    );
    assert.ok(!/\bconsole\s*\.|Math\.random\s*\(/.test(source), name);
  }
  assert.ok((await read('js/password-generator.js')).includes('getRandomValues'));
});
test('only the breach module has a network call and the endpoint is HTTPS range-only', async () => {
  for (const { name, source } of await scripts()) {
    if (name !== 'breach-checker.js')
      assert.ok(
        !/\b(?:fetch|fetchImpl|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/.test(source),
        name,
      );
  }
  const breach = await read('js/breach-checker.js');
  assert.ok(breach.includes('https://api.pwnedpasswords.com/range/'));
  assert.ok(breach.includes('fullHash.slice(0, 5)'));
  assert.ok(!breach.includes('body: password'));
});
test('CSP, no inline handlers, and self-contained local styling reduce injection/dependency risk', async () => {
  const html = await read('index.html');
  assert.ok(html.includes('Content-Security-Policy'));
  assert.ok(html.includes("script-src 'self'"));
  assert.ok(html.includes("object-src 'none'"));
  assert.ok(!/\son[a-z]+\s*=|javascript:|<script(?![^>]*\bsrc=)/i.test(html));
  const css = await read('css/style.css');
  assert.ok(!/@import|url\(['"]?https?:/i.test(css));
});

test('every declared application button action has a wired handler', async () => {
  const app = await read('js/app.js');
  const html = await read('index.html');
  const ui = await read('js/ui.js');
  const actionMap = app.match(/const actions = \{([\s\S]*?)\n\};/);
  assert.ok(actionMap, 'The delegated action map must exist.');
  const handlers = new Set(
    [...actionMap[1].matchAll(/^ {2}(?:'([^']+)'|([A-Za-z]\w*)):/gm)].map(
      (match) => match[1] || match[2],
    ),
  );
  const declared = new Set(
    [...`${html}\n${ui}`.matchAll(/data-action="([a-z-]+)"/g)].map((match) => match[1]),
  );
  assert.equal(declared.size, 16);
  for (const action of declared) assert.ok(handlers.has(action), `Missing handler for ${action}`);
  assert.equal(handlers.size, declared.size);
});
