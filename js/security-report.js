import { estimateAttack } from './attack-estimator.js';
import { escapeHtml, formatDateTime, formatCount } from './formatters.js';

export function describeBreach(breach = { status: 'not-checked' }) {
  switch (breach.status) {
    case 'exposed':
      return {
        label: 'Match found in the checked dataset',
        detail: `Reported occurrences: ${formatCount(breach.count)}. This is a password prevalence count, not the number of your compromised accounts.`,
        checkedAt: breach.checkedAt,
      };
    case 'not-found':
      return {
        label: 'No match found in the checked dataset',
        detail:
          'The validated request succeeded with no nonzero suffix match. This is not proof of safety.',
        checkedAt: breach.checkedAt,
      };
    case 'error':
      return {
        label: 'Check failed',
        detail:
          breach.message ||
          'The check did not complete successfully. No negative result is available.',
      };
    case 'checking':
      return {
        label: 'Not checked',
        detail: 'A check is in progress; there is no completed result.',
      };
    case 'not-checked':
      return {
        label: 'Not checked',
        detail: 'No completed breach check is available for this assessment.',
      };
    default:
      return { label: 'Not available', detail: 'No valid breach result is available.' };
  }
}
/** Accepts only non-secret analysis records, never the password or a hash. */
export function generateSecurityReport(
  analysis,
  breach = { status: 'not-checked' },
  attack = null,
  { now = () => new Date() } = {},
) {
  if (!analysis) throw new RangeError('Analyze the current password before generating a report.');
  const estimates = attack || estimateAttack(analysis);
  const exposure = describeBreach(breach);
  const c = analysis.characters;
  const nextSteps = [...analysis.recommendations];
  if (breach.status === 'exposed')
    nextSteps.unshift({
      title: 'Replace the exposed password',
      description:
        'Use a completely new unique password on every account where this value or a variation was used. Review sessions, recovery settings, and MFA.',
    });
  if (breach.status === 'not-checked' || breach.status === 'error')
    nextSteps.push({
      title: 'Consider an optional exposure check',
      description:
        'If you choose, explicitly run the privacy-preserving breach check. A failed or unrun check provides no exposure conclusion.',
    });
  const summary = `${analysis.classification} under the local educational heuristic (${analysis.score}/100). ${analysis.weaknesses.length} detected weakness${analysis.weaknesses.length === 1 ? '' : 'es'}. Local list: ${analysis.common.label}. Breach exposure: ${exposure.label}.`;
  return {
    title: 'Password Security Assessment',
    version: '1.0.0',
    generatedAt: now().toISOString(),
    summary,
    sections: [
      {
        title: 'Assessment overview',
        rows: [
          ['Strength classification', analysis.classification],
          ['Security score', `${analysis.score}/100`],
          ['Assessment completed', formatDateTime(analysis.analyzedAt)],
          ['Interpretation', analysis.explanation],
        ],
      },
      {
        title: 'Character analysis',
        rows: [
          ['Total length', `${c.length} Unicode code points`],
          ['Uppercase (ASCII)', String(c.uppercase)],
          ['Lowercase (ASCII)', String(c.lowercase)],
          ['Digits (ASCII)', String(c.digits)],
          ['Special / other', String(c.special)],
          [
            'Character categories present',
            Object.entries(c.presence)
              .filter(([, present]) => present)
              .map(([name]) => name)
              .join(', ') || 'None',
          ],
        ],
      },
      {
        title: 'Theoretical entropy',
        rows: [
          ['Entropy estimate', `${analysis.entropy.bits.toFixed(2)} bits`],
          ['Assumed character pool', `${analysis.entropy.characterSetSize} characters`],
        ],
        bullets: [
          analysis.entropy.assumptions,
          ...(analysis.entropy.unicodeNote ? [analysis.entropy.unicodeNote] : []),
        ],
      },
      {
        title: 'Detected weaknesses',
        bullets: analysis.weaknesses.length
          ? analysis.weaknesses.map((item) => ({
              title: item.title,
              description: `${item.explanation} Recommendation: ${item.recommendation}`,
            }))
          : [
              'No listed weaknesses were detected. The detector is limited and does not establish randomness, uniqueness, or security.',
            ],
      },
      { title: 'Security recommendations', bullets: analysis.recommendations },
      {
        title: 'Theoretical search and risk indicators',
        rows: [
          ['Total possible candidates (N)', estimates.searchSpace],
          ['Expected exhaustive-search attempts (N/2)', estimates.expectedAttempts],
          ['Search-space formula', estimates.formula],
          ['Brute-force resistance', estimates.risks.bruteForce.label],
          ['Brute-force interpretation', estimates.risks.bruteForce.explanation],
          ['Dictionary-attack risk', estimates.risks.dictionary.label],
          ['Dictionary interpretation', estimates.risks.dictionary.explanation],
        ],
        bullets: [estimates.assumptions],
      },
      {
        title: 'Hypothetical crack-time scenarios',
        table: {
          headers: [
            'Scenario',
            'Guesses / second',
            'Expected attempts',
            'Estimated duration',
            'Assumptions',
          ],
          rows: estimates.scenarios.map((item) => [
            item.name,
            item.rateLabel,
            item.expectedAttempts,
            item.duration,
            item.description,
          ]),
        },
      },
      {
        title: 'Common-password check',
        rows: [
          ['Local list result', analysis.common.label],
          ['List size', `${analysis.common.listSize} hand-curated examples`],
          [
            'Heuristic warnings',
            `${analysis.common.heuristicWarnings.length} (distinct from an exact match)`,
          ],
        ],
        bullets: [analysis.common.limitation],
      },
      {
        title: 'Breach exposure check',
        rows: [
          ['Status', exposure.label],
          ['Detail', exposure.detail],
          ['Checked at', exposure.checkedAt ? formatDateTime(exposure.checkedAt) : 'Not available'],
        ],
        bullets: [
          'Only an explicit request to the official Pwned Passwords range API is used. Only a five-character SHA-1 prefix is sent; SHA-1 is used for API compatibility, not recommended for password storage.',
        ],
      },
      {
        title: 'Limitations',
        bullets: [
          'This score is an educational heuristic, not a formal guarantee, certified measure, or probability of compromise.',
          'The local list and English-centric dictionary are small. Absence of a match or warning does not establish safety.',
          'Entropy and exhaustive-search estimates assume uniformly random independent choices. Predictable human-created passwords can be guessed far sooner.',
          'Scenario rates are hypothetical fixed examples (or user-applied assumptions), not measured device performance. Hash costs, hardware, salts, MFA, rate limits, and attacker knowledge vary.',
          'A negative exposure result applies only to the checked dataset at the check time. A failed or unavailable request is not a negative result.',
          'No password is described as impossible to crack. Local processing cannot protect against malware, browser extensions, or an untrusted device.',
          'This report excludes the password and hash but reveals password characteristics. Handle downloaded files with care.',
        ],
      },
      { title: 'Suggested next steps', bullets: nextSteps },
    ],
  };
}
function renderSection(section) {
  const rows = section.rows
    ? `<dl>${section.rows.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>`
    : '';
  const bullets = section.bullets
    ? `<ul>${section.bullets.map((item) => (typeof item === 'string' ? `<li>${escapeHtml(item)}</li>` : `<li><strong>${escapeHtml(item.title)}</strong> — ${escapeHtml(item.description)}</li>`)).join('')}</ul>`
    : '';
  const table = section.table
    ? `<div class="table-wrap"><table class="data-table"><thead><tr>${section.table.headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${section.table.rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
    : '';
  return `<section class="report-section"><h3>${escapeHtml(section.title)}</h3>${rows}${bullets}${table}</section>`;
}
export function renderReportHtml(report) {
  return `<article class="report-document"><header class="report-header"><div><div class="report-brand">PASSGUARD / SECURITY WORKSPACE</div><h2>${escapeHtml(report.title)}</h2><p>A local, privacy-conscious educational assessment</p></div><div class="report-stamp"><strong>Generated locally</strong>${escapeHtml(formatDateTime(report.generatedAt))}<br>Version ${escapeHtml(report.version)}</div></header><div class="report-summary">${escapeHtml(report.summary)}</div>${report.sections.map(renderSection).join('')}<footer class="report-footnote">PassGuard — No passwords or complete hashes are included. No report was uploaded. Print or export only on a trusted device.</footer></article>`;
}
