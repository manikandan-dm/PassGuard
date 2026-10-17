import { escapeHtml as e, formatDateTime, formatCount } from './formatters.js';
import { renderReportHtml, describeBreach } from './security-report.js';
import { ATTACK_SCENARIOS } from './attack-estimator.js';
import { COMMON_PASSWORDS } from './common-password-checker.js';

export const VIEW_LABELS = Object.freeze({
  overview: 'Overview',
  analyzer: 'Password analyzer',
  generator: 'Password generator',
  resistance: 'Attack resistance',
  common: 'Common passwords',
  breach: 'Breach exposure',
  recommendations: 'Recommendations',
  report: 'Security report',
  tips: 'Security essentials',
  privacy: 'Privacy & limitations',
});
const $ = (id) => document.getElementById(id);
const icon = (name, extra = '') =>
  `<svg class="icon ${extra}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const tone = (analysis) => analysis?.classification.toLowerCase() || 'neutral';
const badgeTone = (analysis) =>
  !analysis
    ? 'neutral'
    : analysis.classification === 'Strong'
      ? 'positive'
      : analysis.classification === 'Medium'
        ? 'warning'
        : 'negative';
const safeTone = (value) => (['weak', 'medium', 'strong'].includes(value) ? value : 'neutral');
const empty = (
  title,
  description,
  target = 'analyzer',
  action = 'Analyze a password',
  name = 'scan',
) =>
  `<div class="empty-state"><span class="icon-tile blue">${icon(name)}</span><h3>${e(title)}</h3><p>${e(description)}</p>${target ? `<a href="#${e(target)}" class="button secondary">${e(action)} ${icon('arrow')}</a>` : ''}</div>`;

export function navigate(view, { focus = false } = {}) {
  const selected = Object.hasOwn(VIEW_LABELS, view) ? view : 'overview';
  document.querySelectorAll('.view').forEach((section) => {
    section.hidden = section.id !== `view-${selected}`;
  });
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const active = link.dataset.nav === selected;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('breadcrumb-current').textContent = VIEW_LABELS[selected];
  document.title = `${VIEW_LABELS[selected]} — PassGuard`;
  if (focus) {
    $(`heading-${selected}`).focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  return selected;
}
export function setMobileNavigation(open) {
  $('sidebar').classList.toggle('is-open', open);
  $('sidebar-backdrop').hidden = !open;
  $('sidebar-toggle').setAttribute('aria-expanded', String(open));
  if (window.matchMedia('(max-width: 760px)').matches) $('sidebar').inert = !open;
  else $('sidebar').inert = false;
  document.body.classList.toggle('navigation-open', open);
}
export function updateTheme(theme) {
  const selected = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = selected;
  const label = `Switch to ${selected === 'dark' ? 'light' : 'dark'} theme`;
  $('theme-toggle').setAttribute('aria-label', label);
  $('theme-toggle').title = label;
  $('theme-toggle').innerHTML = icon(selected === 'dark' ? 'sun' : 'moon');
}
let toastTimer;
export function notify(message, type = 'info') {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').className =
    `toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => {
    $('toast').hidden = true;
  }, 6500);
}
export function clearNotifications() {
  clearTimeout(toastTimer);
  $('toast').hidden = true;
  $('toast').textContent = '';
}
export function showFieldError(id, message = '') {
  $(id).textContent = message;
  $(id).hidden = !message;
}
export function resetVisibility() {
  document.querySelectorAll('[data-password-input]').forEach((input) => {
    input.type = 'password';
  });
  document.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.setAttribute('aria-label', 'Show password');
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = icon('eye');
  });
}
export function togglePassword(button) {
  const input = $(button.dataset.togglePassword);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  button.setAttribute('aria-pressed', String(show));
  button.innerHTML = icon(show ? 'eye-off' : 'eye');
}

function scoreRing(analysis) {
  const score = analysis?.score ?? 0;
  const circumference = 2 * Math.PI * 65;
  return `<div class="score-visual"><svg class="score-ring" viewBox="0 0 150 150" aria-hidden="true"><circle class="score-ring-bg" cx="75" cy="75" r="65" ${!analysis ? 'stroke-dasharray="3 5"' : ''}/><circle class="score-ring-fill tone-${tone(analysis)}" cx="75" cy="75" r="65" opacity="${analysis ? 1 : 0}" stroke-dasharray="${(score / 100) * circumference} ${circumference}"/></svg><div class="score-center">${!analysis ? icon('shield') : ''}<strong class="${analysis ? `tone-${tone(analysis)}` : ''}">${analysis ? e(score) : '—'}</strong><span>${analysis ? 'OUT OF 100' : 'NO SCORE YET'}</span></div></div>`;
}
function metric(label, value, foot, name, { text = false, toneName = '', suffix = '' } = {}) {
  return `<article class="metric-card"><div class="metric-top"><span class="metric-label">${e(label)}</span>${icon(name)}</div><div class="metric-value ${text ? 'text-value' : ''} ${toneName ? `tone-${safeTone(toneName)}` : ''}">${e(value)}${suffix ? `<small>${e(suffix)}</small>` : ''}</div><div class="metric-foot"><span class="tiny-dot" aria-hidden="true"></span>${e(foot)}</div></article>`;
}
function renderDashboard(analysis, state) {
  const breachLabel =
    state.breach.status === 'exposed'
      ? 'Exposed'
      : state.breach.status === 'not-found'
        ? 'No match found'
        : state.breach.status === 'error'
          ? 'Check failed'
          : state.breach.status === 'checking'
            ? 'Checking…'
            : 'Not checked';
  $('dashboard-metrics').innerHTML = [
    metric(
      'Security score',
      analysis ? analysis.score : '—',
      analysis ? 'Pattern-aware assessment' : 'Awaiting first assessment',
      'chart',
      { suffix: '/ 100', toneName: tone(analysis) },
    ),
    metric(
      'Password strength',
      analysis?.classification || 'Not analyzed',
      analysis
        ? `${analysis.characters.length} characters assessed`
        : 'Your assessment starts here',
      'shield',
      { text: true, toneName: tone(analysis) },
    ),
    metric(
      'Detected weaknesses',
      analysis ? analysis.weaknesses.length : '—',
      analysis
        ? analysis.common.exactMatch
          ? 'Exact match in local list'
          : 'Not found in local list'
        : 'Common passwords: not checked',
      'alert',
    ),
    metric(
      'Breach exposure',
      breachLabel,
      state.breach.status === 'checking'
        ? 'Explicit request in progress'
        : 'Optional, privacy-preserving check',
      'fingerprint',
      { text: true, toneName: state.breach.status === 'exposed' ? 'weak' : '' },
    ),
  ].join('');
  $('summary-badge').textContent = analysis
    ? analysis.classification.toUpperCase()
    : state.stale
      ? 'OUTDATED'
      : 'NOT ANALYZED';
  $('summary-badge').className = `badge ${badgeTone(analysis)}`;
  $('dashboard-summary').innerHTML =
    `${scoreRing(analysis)}<div class="summary-caption"><h3>${analysis ? `${e(analysis.classification)} by the local heuristic` : state.stale ? 'Ready for a fresh assessment' : 'Your security story starts here.'}</h3><p>${analysis ? `${analysis.weaknesses.length} listed weakness${analysis.weaknesses.length === 1 ? '' : 'es'} detected. An estimate, not a guarantee.` : 'Analyze a password to reveal its strengths and uncover potential risks.'}</p></div><div class="summary-footer"><span>${analysis ? `${analysis.characters.length} characters · ${analysis.characters.categoryCount} categories` : 'No password data stored'}</span><a href="#${analysis ? 'analyzer' : 'privacy'}" class="text-link">${analysis ? 'View assessment' : 'Privacy first'} ${icon('arrow')}</a></div>`;
  const items = analysis
    ? analysis.recommendations.slice(0, 3).map((item) => item.title)
    : [
        'Analyze a password for tailored recommendations',
        'Choose a unique password for every account',
        'Add multi-factor authentication',
      ];
  $('dashboard-recommendations').innerHTML = items
    .map((item) => `<div class="next-step">${icon('chevron')}<span>${e(item)}</span></div>`)
    .join('');
  $('tool-breach-status').textContent =
    state.breach.status === 'not-checked' ? 'ON YOUR REQUEST' : breachLabel.toUpperCase();
  $('tool-report-status').textContent = state.report
    ? 'REPORT READY'
    : state.breach.status === 'checking'
      ? 'WAITING FOR CHECK'
      : analysis
        ? 'READY TO GENERATE'
        : 'AWAITING ANALYSIS';
  $('tool-report-status').className = `badge ${analysis ? 'blue' : 'neutral'}`;
}
function characterStats(analysis) {
  const c = analysis.characters;
  const pairs = [
    ['Total', c.length],
    ['Uppercase', c.uppercase],
    ['Lowercase', c.lowercase],
    ['Numbers', c.digits],
    ['Special', c.special],
  ];
  return `<article class="panel"><div class="panel-heading compact"><h2>Character breakdown</h2><span class="badge neutral">CODE POINTS</span></div><div class="character-grid">${pairs.map(([name, count]) => `<div class="character-stat"><strong>${count}</strong><span>${name}</span></div>`).join('')}</div><div class="category-indicators">${Object.entries(
    c.presence,
  )
    .map(
      ([name, present]) =>
        `<span class="category-indicator ${present ? '' : 'absent'}">${icon(present ? 'check' : 'close')}${e(name)} ${present ? 'present' : 'absent'}</span>`,
    )
    .join(
      '',
    )}</div><div class="entropy-strip"><div><strong>${analysis.entropy.bits.toFixed(1)} bits</strong><span>Theoretical entropy</span></div><p>Assumes uniform random selection from a ${analysis.entropy.characterSetSize}-character pool. Patterns can make this a substantial overestimate.</p></div>${analysis.entropy.unicodeNote ? `<p class="muted small-text">${e(analysis.entropy.unicodeNote)}</p>` : ''}</article>`;
}
function weaknessList(analysis) {
  return analysis.weaknesses.length
    ? analysis.weaknesses
        .map(
          (item) =>
            `<div class="weakness-item">${icon('alert')}<div><h3>${e(item.title)} <span class="badge ${item.severity === 'high' ? 'negative' : 'warning'}">${e(item.severity.toUpperCase())}</span></h3><p>${e(item.explanation)}</p></div></div>`,
        )
        .join('')
    : `<div class="positive-message">${icon('check')}<p>No listed weaknesses detected. This does not establish randomness or guarantee safety.</p></div>`;
}
function recommendationsList(items) {
  return items
    .map(
      (item, index) =>
        `<div class="recommendation-item"><span class="recommendation-number">${String(index + 1).padStart(2, '0')}</span><div><h3>${e(item.title)}</h3><p>${e(item.description)}</p></div></div>`,
    )
    .join('');
}
function renderAnalyzer(analysis, state) {
  if (!analysis) {
    $('analyzer-results').innerHTML =
      `<article class="panel">${empty(state.stale ? 'The password changed.' : 'A little insight goes a long way.', state.stale ? 'Your previous results are outdated. Analyze the current password to produce a new assessment.' : 'Enter a password above and choose Analyze password. You will see a score, character breakdown, and specific guidance.', null)}</article>`;
    return;
  }
  $('analyzer-results').innerHTML =
    `<div class="analysis-grid"><article class="panel score-detail-panel"><div class="panel-heading compact"><h2>Security assessment</h2><span class="badge ${badgeTone(analysis)}">${e(analysis.classification.toUpperCase())}</span></div>${scoreRing(analysis)}<div class="strength-bar ${tone(analysis)}" role="meter" aria-label="Educational password score" aria-valuenow="${analysis.score}" aria-valuemin="0" aria-valuemax="100" aria-valuetext="${analysis.score} out of 100, ${e(analysis.classification)}"><span></span><span></span><span></span></div><p class="score-explanation">${e(analysis.explanation)}</p></article>${characterStats(analysis)}</div><div class="two-column"><article class="panel"><div class="panel-heading"><h2>Detected weaknesses</h2><span class="badge neutral">${analysis.weaknesses.length} DETECTED</span></div>${weaknessList(analysis)}</article><article class="panel"><div class="panel-heading"><h2>A stronger next step</h2><a href="#recommendations" class="text-link">All recommendations ${icon('arrow')}</a></div>${recommendationsList(analysis.recommendations.slice(0, 4))}<div class="button-row spaced-title"><a href="#generator" class="button secondary">${icon('key')} Generate a replacement</a><a href="#resistance" class="button ghost">Explore attack estimates ${icon('arrow')}</a></div></article></div>`;
}
function renderResistance(analysis, attack, state) {
  if (!analysis) {
    $('resistance-results').innerHTML =
      `<article class="panel">${empty('Start with a current assessment.', state.stale ? 'The password changed. Re-analyze it to update the search space and attack estimates.' : 'Analyze a password to explore its theoretical search space and four hypothetical guessing scenarios. No attack is performed.', 'analyzer', 'Open password analyzer', 'bolt')}</article>`;
    return;
  }
  $('resistance-results').innerHTML =
    `<div class="metrics-grid estimate-metrics">${metric('Total possible candidates', attack.searchSpace, 'N = pool size ^ length', 'chart')}${metric('Expected guessing attempts', attack.expectedAttempts, 'Approximate expected attempts = N / 2', 'terminal')}${metric('Assumed character pool', analysis.entropy.characterSetSize, `${analysis.characters.length} independent character selections`, 'key', { suffix: 'characters' })}</div><article class="panel estimate-table-panel"><div class="panel-heading compact"><h2>Applied scenario estimates</h2><span class="badge neutral">THEORETICAL ONLY</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Scenario & assumptions</th><th scope="col">Guesses / second</th><th scope="col">Expected attempts</th><th scope="col">Estimated duration</th></tr></thead><tbody>${attack.scenarios.map((item) => `<tr><td><strong>${e(item.name)}</strong><p>${e(item.description)}</p></td><td>${e(item.rateLabel)}</td><td>${e(item.expectedAttempts)}</td><td class="duration">${e(item.duration)}</td></tr>`).join('')}</tbody></table></div></article><div class="risk-grid"><article class="panel risk-card"><h3>Brute-force resistance</h3><span class="badge ${badgeTone(analysis)}">${e(attack.risks.bruteForce.label)}</span><p>${e(attack.risks.bruteForce.explanation)}</p></article><article class="panel risk-card"><h3>Dictionary-attack risk</h3><span class="badge ${attack.risks.dictionary.level === 'high' ? 'negative' : 'warning'}">${e(attack.risks.dictionary.label)}</span><p>${e(attack.risks.dictionary.explanation)}</p><a href="#recommendations" class="text-link">Review relevant recommendations ${icon('arrow')}</a></article></div>`;
}
export function initializeScenarioControls(rates) {
  $('scenario-controls').innerHTML = ATTACK_SCENARIOS.map(
    (item) =>
      `<div class="scenario-control"><label for="rate-${e(item.id)}">${e(item.name)}</label><div class="rate-input-wrap"><input id="rate-${e(item.id)}" data-rate="${e(item.id)}" type="number" min="0.001" max="1000000000000000000" step="any" value="${e(rates[item.id])}"><span>guesses / sec</span></div></div>`,
  ).join('');
}
function renderCommon(analysis) {
  if (!analysis) {
    $('common-results').innerHTML = empty(
      'Not checked',
      'Analyze a password first. Exact local-list matches and heuristic pattern warnings will be shown separately.',
      'analyzer',
      'Open password analyzer',
      'list',
    );
    return;
  }
  const common = analysis.common;
  $('common-results').innerHTML =
    `<div class="check-result ${common.exactMatch ? 'negative' : ''}"><span class="badge ${common.exactMatch ? 'negative' : 'neutral'}">${common.exactMatch ? 'EXACT MATCH' : 'LOCAL CHECK COMPLETE'}</span><h3>${e(common.label)}</h3><p>${e(common.limitation)}</p></div><div class="heuristic-summary"><h3>Heuristic pattern warnings · ${common.heuristicWarnings.length}</h3>${common.heuristicWarnings.length ? `<ul>${common.heuristicWarnings.map((item) => `<li>${e(item.title)}</li>`).join('')}</ul>` : '<p>No listed patterns were detected. This is not evidence of safety.</p>'}</div>`;
}
function renderBreach(analysis, state, capabilities) {
  const breach = state.breach;
  const checking = breach.status === 'checking';
  let contents;
  if (checking)
    contents =
      '<div class="check-result" aria-busy="true"><span class="badge blue">EXPLICIT REQUEST IN PROGRESS</span><h3><span class="spinner" aria-hidden="true"></span> Checking the prefix range…</h3><p>Your password is hashed locally. Only the five-character prefix is requested. This check times out after 10 seconds.</p></div>';
  else if (breach.status === 'not-checked')
    contents = `<div class="check-result"><span class="badge neutral">NOT CHECKED</span><h3>${analysis ? 'Ready when you are.' : 'Analyze first. Check when you choose.'}</h3><p>${analysis ? 'No completed exposure check exists for this assessment. This optional action is the only feature that contacts an external service.' : 'A current password analysis is required. No breach request has been sent for the current input.'}</p></div>`;
  else {
    const description = describeBreach(breach);
    contents = `<div class="check-result ${breach.status === 'exposed' || breach.status === 'error' ? 'negative' : ''}"><span class="badge ${breach.status === 'exposed' || breach.status === 'error' ? 'negative' : 'neutral'}">${breach.status === 'exposed' ? 'PASSWORD EXPOSURE FOUND' : breach.status === 'error' ? 'NO RESULT AVAILABLE' : 'CHECK COMPLETED'}</span><h3>${e(description.label)}</h3><p>${e(description.detail)}</p>${breach.status === 'exposed' ? '<p>Replace it wherever it was used. Choose a completely new unique password and review your account security.</p>' : ''}${description.checkedAt ? `<span class="check-date">Checked ${e(formatDateTime(description.checkedAt))}</span>` : ''}</div>`;
  }
  $('breach-results').innerHTML = contents;
  const button = document.querySelector('[data-action="check-breach"]');
  button.disabled = !analysis || checking || !capabilities.breach;
  button.setAttribute('aria-busy', String(checking));
  button.innerHTML = `${checking ? '<span class="spinner" aria-hidden="true"></span>' : icon('fingerprint')}<span>${checking ? 'Checking exposure…' : 'Check breach exposure'}</span>`;
  document.querySelector('[data-action="cancel-breach"]').hidden = !checking;
  showFieldError(
    'breach-capability',
    capabilities.breach
      ? ''
      : 'Breach checking is unavailable here. It requires Web Crypto SHA-1 in a secure context (HTTPS or localhost). Local analysis and reports still work.',
  );
}
function renderRecommendations(analysis, state) {
  if (!analysis) {
    $('recommendation-results').innerHTML =
      `<article class="panel">${empty('Make the advice personal.', state.stale ? 'Re-analyze the changed password for current, context-aware recommendations.' : 'Analyze a password to get specific guidance based on its actual length and detected weaknesses.', 'analyzer', 'Analyze a password', 'spark')}</article>`;
    return;
  }
  const items = [...analysis.recommendations];
  if (state.breach.status === 'exposed')
    items.unshift({
      title: 'Replace this exposed password everywhere it was used',
      description:
        'Choose a completely new unique password. Review sessions, recovery settings, and MFA on affected accounts. Do not merely add a new suffix.',
    });
  $('recommendation-results').innerHTML =
    `<article class="panel recommendation-assessment"><div class="panel-heading"><div><h2>Personalized action plan</h2><p>Based on the current ${e(analysis.classification.toLowerCase())} assessment (${analysis.score}/100).</p></div><span class="badge ${badgeTone(analysis)}">${items.length} NEXT STEPS</span></div>${recommendationsList(items)}</article>`;
}
function renderReport(analysis, state) {
  const report = state.report;
  $('report-status').textContent = report
    ? `Generated ${formatDateTime(report.generatedAt)}`
    : state.breach.status === 'checking'
      ? 'Waiting for breach check'
      : 'No report generated';
  $('report-placeholder').hidden = !!report;
  $('report-preview').hidden = !report;
  if (report) $('report-preview').innerHTML = renderReportHtml(report);
  else {
    $('report-preview').replaceChildren();
    $('report-placeholder').innerHTML = empty(
      'Your assessment, clearly documented.',
      state.breach.status === 'checking'
        ? 'A breach check is in progress. Wait for it to finish, or cancel it in Breach exposure, before generating a report.'
        : analysis
          ? 'Choose Generate report to create a snapshot of the actual current results. Unrun or failed checks are labeled honestly.'
          : 'Analyze a password, then generate a report. Optional breach results and applied scenario rates will be included only when available.',
      analysis ? null : 'analyzer',
      'Start an assessment',
      'file',
    );
  }
  for (const action of ['export-html', 'export-text', 'print-report', 'clear-report'])
    document.querySelector(`[data-action="${action}"]`).disabled = !report;
  const generate = document.querySelector('[data-action="generate-report"]');
  generate.disabled = !analysis || state.breach.status === 'checking';
  generate.innerHTML = `${icon('file')} ${report ? 'Regenerate report' : 'Generate report'}`;
  document.body.classList.toggle('print-ready', !!report);
}
export function renderAll(store, capabilities) {
  const state = store.state;
  const analysis = store.currentAnalysis();
  const attack = store.currentAttack();
  document.querySelectorAll('[data-password-input]').forEach((input) => {
    if (input.value !== state.password) input.value = state.password;
  });
  document.querySelectorAll('[data-input-count]').forEach((element) => {
    element.textContent = `${Array.from(state.password).length} characters`;
  });
  $('stale-notice').hidden = !state.stale;
  renderDashboard(analysis, state);
  renderAnalyzer(analysis, state);
  renderResistance(analysis, attack, state);
  renderCommon(analysis);
  renderBreach(analysis, state, capabilities);
  renderRecommendations(analysis, state);
  renderReport(analysis, state);
  if ($('generated-password').value !== state.generated)
    $('generated-password').value = state.generated;
  $('generated-details').textContent = state.generated
    ? `${state.generated.length} characters · Generated securely on this device. Analyze for the same heuristic assessment.`
    : 'Choose your settings, then generate a password.';
  for (const action of ['copy-generated', 'analyze-generated', 'clear-generated'])
    document.querySelector(`[data-action="${action}"]`).disabled = !state.generated;
  document.querySelector('[data-action="generate"]').disabled = !capabilities.generator;
  $('generator-status-badge').textContent = capabilities.generator
    ? 'READY TO USE'
    : 'UNAVAILABLE HERE';
  $('generator-status-badge').className =
    `badge ${capabilities.generator ? 'positive' : 'warning'}`;
  if (!capabilities.generator)
    showFieldError(
      'generator-error',
      'Secure randomness is unavailable. Password generation is disabled; no insecure fallback is used.',
    );
  document.querySelectorAll('[data-local-list-size]').forEach((element) => {
    element.textContent = String(COMMON_PASSWORDS.length);
  });
}
