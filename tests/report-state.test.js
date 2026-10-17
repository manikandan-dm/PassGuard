import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { analyzePassword } from '../js/analyzer.js';
import { generateSecurityReport, renderReportHtml, describeBreach } from '../js/security-report.js';
import {
  buildHtmlReport,
  buildTextReport,
  downloadReport,
  printReport,
} from '../js/report-export.js';
import { createStore } from '../js/state.js';
import { defaultScenarioRates } from '../js/attack-estimator.js';
import { escapeHtml } from '../js/formatters.js';
const fixture = 'vR8#kL2!xT9@pN6$';
const assessment = () => analyzePassword(fixture);
const initialized = () => {
  const store = createStore();
  store.setPassword(fixture);
  store.analyze();
  return store;
};

test('reports contain actual available results and honestly label unchecked exposure', () => {
  const analysis = assessment();
  const report = generateSecurityReport(analysis);
  const text = buildTextReport(report);
  assert.match(text, new RegExp(`${analysis.score}/100`));
  assert.match(text, /Not checked/);
  assert.match(text, /Not available/);
  assert.match(text, /Total possible candidates/);
  assert.match(text, /Expected exhaustive-search attempts/);
  assert.match(text, /Hypothetical crack-time scenarios/i);
  assert.equal(report.sections.length, 11);
});
test('exposure match, negative, error and unknown labels are accurate', () => {
  assert.equal(
    describeBreach({ status: 'not-found' }).label,
    'No match found in the checked dataset',
  );
  assert.equal(describeBreach({ status: 'error' }).label, 'Check failed');
  assert.equal(describeBreach({ status: 'not-checked' }).label, 'Not checked');
  assert.equal(describeBreach({ status: 'unknown' }).label, 'Not available');
  const exposed = generateSecurityReport(assessment(), {
    status: 'exposed',
    count: '1234',
    checkedAt: new Date().toISOString(),
  });
  assert.match(buildTextReport(exposed), /1,234/);
  assert.match(buildTextReport(exposed), /Replace the exposed password/);
  const failed = generateSecurityReport(assessment(), {
    status: 'error',
    message: 'Service failed.',
  });
  assert.match(buildTextReport(failed), /Check failed/);
});
test('HTML, text, and preview never include the synthetic password or full hash', () => {
  const report = generateSecurityReport(assessment());
  const hash = createHash('sha1').update(fixture).digest('hex').toUpperCase();
  for (const output of [
    JSON.stringify(report),
    buildHtmlReport(report),
    buildTextReport(report),
    renderReportHtml(report),
  ]) {
    assert.ok(!output.includes(fixture));
    assert.ok(!output.includes(hash));
  }
});
test('every dynamic HTML surface escapes injected report fields', () => {
  const attack = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
  const report = generateSecurityReport(assessment());
  report.title = attack;
  report.summary = attack;
  report.sections[0].rows.push([attack, attack]);
  report.sections[1].bullets = [attack, { title: attack, description: attack }];
  report.sections[6].table.rows[0][0] = attack;
  const html = buildHtmlReport(report);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;img'));
  assert.equal(escapeHtml('"\'&<>'), '&quot;&#39;&amp;&lt;&gt;');
  assert.ok(!/https?:\/\/[^\s<]+\.js/.test(html));
});
test('download creates a local blob with safe filename and no upload', () => {
  let clicked = false;
  let appended = false;
  let removed = false;
  let capturedBlob;
  const anchor = {
    click() {
      clicked = true;
    },
    remove() {
      removed = true;
    },
  };
  const documentRef = {
    createElement(tag) {
      assert.equal(tag, 'a');
      return anchor;
    },
    body: {
      append() {
        appended = true;
      },
    },
  };
  const urlApi = {
    createObjectURL(blob) {
      capturedBlob = blob;
      return 'blob:synthetic';
    },
    revokeObjectURL() {},
  };
  downloadReport(generateSecurityReport(assessment()), 'html', { documentRef, urlApi });
  assert.ok(clicked && appended && removed);
  assert.ok(capturedBlob instanceof Blob);
  assert.match(anchor.download, /^passguard-assessment-\d{4}-\d{2}-\d{2}\.html$/);
  assert.throws(() => downloadReport(null, 'html'), /Generate/);
});
test('print calls the native print operation only for a generated report', () => {
  let printed = false;
  printReport(generateSecurityReport(assessment()), {
    print() {
      printed = true;
    },
  });
  assert.equal(printed, true);
  assert.throws(() => printReport(null, { print() {} }), /current report/);
  assert.throws(() => printReport(generateSecurityReport(assessment()), {}), /unavailable/);
});
test('initial state contains no fabricated results', () => {
  const store = createStore();
  assert.equal(store.currentAnalysis(), null);
  assert.equal(store.currentAttack(), null);
  assert.equal(store.state.report, null);
  assert.equal(store.state.breach.status, 'not-checked');
  assert.throws(() => store.makeReport(), /Analyze/);
  assert.throws(() => store.startBreach(), /Analyze/);
  assert.throws(() => store.runLocalCheck(), /Analyze/);
});
test('changing a password hides old analysis and invalidates exposure and report', () => {
  const store = initialized();
  const revision = store.startBreach();
  store.applyBreach(
    { status: 'not-found', count: '0', checkedAt: new Date().toISOString() },
    revision,
  );
  store.makeReport();
  store.setPassword(`${fixture}X`);
  assert.equal(store.state.stale, true);
  assert.equal(store.currentAnalysis(), null);
  assert.equal(store.currentAttack(), null);
  assert.equal(store.state.report, null);
  assert.equal(store.state.breach.status, 'not-checked');
  assert.throws(() => store.makeReport(), /Analyze/);
});
test('returning to an earlier value still requires an explicit new analysis', () => {
  const store = initialized();
  store.setPassword('something-different');
  store.setPassword(fixture);
  assert.equal(store.currentAnalysis(), null);
  store.analyze();
  assert.equal(store.state.stale, false);
});
test('late API results cannot apply after input changes, cancellation, reset, or re-analysis', () => {
  for (const action of [
    (store) => store.setPassword('different'),
    (store) => store.cancelBreach(),
    (store) => store.reset(),
    (store) => store.analyze(),
  ]) {
    const store = initialized();
    const revision = store.startBreach();
    action(store);
    assert.equal(store.applyBreach({ status: 'not-found', count: '0' }, revision), false);
  }
});
test('a pending check cannot be represented as a completed report', () => {
  const store = initialized();
  store.startBreach();
  assert.throws(() => store.makeReport(), /Wait/);
});
test('scenario changes and local checks invalidate an existing report', () => {
  const store = initialized();
  store.makeReport();
  const rates = defaultScenarioRates();
  rates['online-strict'] = 1;
  store.setRates(rates);
  assert.equal(store.state.report, null);
  store.makeReport();
  assert.match(buildTextReport(store.state.report), /Guesses \/ second: 1\n/);
  store.runLocalCheck();
  assert.equal(store.state.report, null);
});
test('reset clears password, generated output, assessment, exposure, and report', () => {
  const store = initialized();
  store.setGenerated(fixture);
  store.makeReport();
  store.reset();
  assert.equal(store.state.password, '');
  assert.equal(store.state.generated, '');
  assert.equal(store.state.analysis, null);
  assert.equal(store.state.report, null);
  assert.equal(store.state.stale, false);
  assert.equal(store.state.breach.status, 'not-checked');
});
test('clearing only a report leaves the current assessment available', () => {
  const store = initialized();
  store.makeReport();
  store.clearReport();
  assert.equal(store.state.report, null);
  assert.ok(store.currentAnalysis());
});

test('generation revision remains monotonic across reset to reject old clipboard callbacks', () => {
  const store = initialized();
  store.setGenerated(fixture);
  const before = store.state.generationRevision;
  store.reset();
  store.setGenerated(fixture);
  assert.ok(store.state.generationRevision > before);
});
test('unchanged input does not invalidate a current result', () => {
  const store = initialized();
  store.makeReport();
  const report = store.state.report;
  assert.equal(store.setPassword(fixture), false);
  assert.ok(store.currentAnalysis());
  assert.equal(store.state.report, report);
});
test('invalid scenario settings preserve the last applied assumptions', () => {
  const store = initialized();
  const previous = store.state.rates;
  store.makeReport();
  const report = store.state.report;
  const rates = defaultScenarioRates();
  rates['offline-fast'] = Infinity;
  assert.throws(() => store.setRates(rates), /rates/);
  assert.equal(store.state.rates, previous);
  assert.equal(store.state.report, report);
});
