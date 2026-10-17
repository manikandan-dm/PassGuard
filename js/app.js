import { createStore } from './state.js';
import { generatePassword, hasSecureRandomness } from './password-generator.js';
import { checkBreach, hasBreachSupport } from './breach-checker.js';
import { copyToClipboard } from './clipboard.js';
import { downloadReport, printReport } from './report-export.js';
import { defaultScenarioRates } from './attack-estimator.js';
import {
  navigate,
  setMobileNavigation,
  updateTheme,
  notify,
  clearNotifications,
  showFieldError,
  resetVisibility,
  togglePassword,
  renderAll,
  initializeScenarioControls,
} from './ui.js';

const store = createStore();
const capabilities = { generator: hasSecureRandomness(), breach: hasBreachSupport() };
const $ = (id) => document.getElementById(id);
let breachController = null;
const render = () => renderAll(store, capabilities);
function cancelBreach() {
  breachController?.abort();
  breachController = null;
  store.cancelBreach();
}
function clearClipboardMessage() {
  $('clipboard-message').textContent = '';
}
function clearWorkspace({ announce = true } = {}) {
  cancelBreach();
  store.reset();
  resetVisibility();
  clearNotifications();
  clearClipboardMessage();
  for (const id of ['generator-error', 'scenario-error']) showFieldError(id);
  render();
  if (announce)
    notify(
      'Workspace cleared. Passwords, results, checks, and reports were removed from application state.',
    );
}
function runAnalysis() {
  cancelBreach();
  const result = store.analyze();
  render();
  notify(
    `Assessment complete: ${result.classification}, ${result.score}/100. Analysis stayed on your device.`,
    'success',
  );
}
async function runBreachCheck() {
  if (!capabilities.breach)
    throw new Error(
      'Breach checking requires Web Crypto in a secure context (HTTPS or localhost).',
    );
  cancelBreach();
  const revision = store.startBreach();
  const controller = new AbortController();
  breachController = controller;
  render();
  try {
    const result = await checkBreach(store.state.password, { signal: controller.signal });
    if (store.applyBreach(result, revision))
      notify(
        result.status === 'exposed'
          ? 'Exposure found. Review the result and replace this password.'
          : 'Check completed. No match was found in the checked dataset.',
        result.status === 'exposed' ? 'error' : 'info',
      );
  } catch (error) {
    if (
      error.code !== 'CANCELLED' &&
      store.applyBreach({ status: 'error', message: error.message, code: error.code }, revision)
    )
      notify('Breach check failed. No negative result was recorded.', 'error');
  } finally {
    if (breachController === controller) breachController = null;
    render();
  }
}
async function copyGenerated() {
  const revision = store.state.generationRevision;
  const button = document.querySelector('[data-action="copy-generated"]');
  button.disabled = true;
  clearClipboardMessage();
  try {
    await copyToClipboard(store.state.generated);
    if (revision !== store.state.generationRevision || !store.state.generated) return;
    $('clipboard-message').textContent =
      'Copied successfully. Your system clipboard may retain the password.';
    notify('Password copied successfully.', 'success');
  } catch (error) {
    if (revision !== store.state.generationRevision || !store.state.generated) return;
    const output = $('generated-password');
    output.focus();
    output.select();
    $('clipboard-message').textContent =
      `${error.message} The password has been selected for manual copying.`;
    notify('Automatic copying did not succeed. Use the selected text to copy manually.', 'error');
  } finally {
    render();
  }
}
function generatorSettings() {
  const length = Number($('generator-length-number').value);
  const options = { length };
  document.querySelectorAll('[name="category"]').forEach((input) => {
    options[input.value] = input.checked;
  });
  return options;
}
const actions = {
  analyze: runAnalysis,
  reset: () => clearWorkspace(),
  generate: () => {
    showFieldError('generator-error');
    clearClipboardMessage();
    try {
      store.setGenerated(generatePassword(generatorSettings()));
      render();
      notify('A random password candidate was generated securely on your device.', 'success');
    } catch (error) {
      showFieldError('generator-error', error.message);
      throw error;
    }
  },
  'clear-generated': () => {
    store.setGenerated('');
    clearClipboardMessage();
    render();
    notify(
      'Generated password cleared. Previously copied clipboard text is not cleared automatically.',
    );
  },
  'copy-generated': copyGenerated,
  'analyze-generated': () => {
    if (!store.state.generated) throw new Error('Generate a password first.');
    cancelBreach();
    store.setPassword(store.state.generated);
    resetVisibility();
    runAnalysis();
    window.location.hash = 'analyzer';
  },
  'local-check': () => {
    store.runLocalCheck();
    render();
    notify('Local list and pattern check complete. No network request was made.', 'success');
  },
  'check-breach': runBreachCheck,
  'cancel-breach': () => {
    cancelBreach();
    render();
    notify('Breach check cancelled. No result was recorded.');
  },
  'update-rates': () => {
    showFieldError('scenario-error');
    try {
      const rates = Object.fromEntries(
        [...document.querySelectorAll('[data-rate]')].map((input) => [
          input.dataset.rate,
          Number(input.value),
        ]),
      );
      store.setRates(rates);
      render();
      notify('Hypothetical scenario rates applied. Existing report cleared.', 'success');
    } catch (error) {
      showFieldError('scenario-error', error.message);
      throw error;
    }
  },
  'reset-rates': () => {
    store.setRates(defaultScenarioRates());
    initializeScenarioControls(store.state.rates);
    showFieldError('scenario-error');
    render();
    notify('Example scenario rates restored.');
  },
  'generate-report': () => {
    store.makeReport();
    render();
    notify('Report generated locally. No password or complete hash is included.', 'success');
  },
  'clear-report': () => {
    store.clearReport();
    render();
    notify('Report cleared from the workspace. Previously downloaded files are unchanged.');
  },
  'export-html': () => {
    downloadReport(store.state.report, 'html');
    notify('HTML report download requested.');
  },
  'export-text': () => {
    downloadReport(store.state.report, 'text');
    notify('Text report download requested.');
  },
  'print-report': () => printReport(store.state.report),
};

document.addEventListener('click', async (event) => {
  const toggle = event.target.closest('[data-toggle-password]');
  if (toggle) {
    togglePassword(toggle);
    return;
  }
  const button = event.target.closest('button[data-action]');
  if (!button || button.disabled) return;
  const handler = actions[button.dataset.action];
  if (!handler) return;
  event.preventDefault();
  try {
    await handler();
  } catch (error) {
    notify(error.message || 'That action could not be completed. Please try again.', 'error');
  }
});
document.querySelectorAll('[data-password-input]').forEach((input) => {
  input.addEventListener('input', () => {
    cancelBreach();
    try {
      store.setPassword(input.value);
    } catch (error) {
      notify(error.message, 'error');
    }
    render();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      try {
        runAnalysis();
      } catch (error) {
        notify(error.message, 'error');
      }
    }
  });
});
function generatorSettingsChanged() {
  store.setGenerated('');
  clearClipboardMessage();
  showFieldError('generator-error');
  render();
}
$('generator-length').addEventListener('input', () => {
  $('generator-length-number').value = $('generator-length').value;
  generatorSettingsChanged();
});
$('generator-length-number').addEventListener('input', () => {
  const length = Number($('generator-length-number').value);
  if (Number.isInteger(length) && length >= 8 && length <= 64)
    $('generator-length').value = String(length);
  generatorSettingsChanged();
});
document
  .querySelectorAll('[name="category"]')
  .forEach((input) => input.addEventListener('change', generatorSettingsChanged));
// The skip link is a focus action, not a hash-router destination. Preserve the
// current section and assessment instead of routing #main-content to Overview.
document.querySelector('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  setMobileNavigation(false);
  $('main-content').focus();
});
$('theme-toggle').addEventListener('click', () =>
  updateTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'),
);
$('sidebar-toggle').addEventListener('click', () => {
  setMobileNavigation(true);
  $('sidebar-close').focus();
});
$('sidebar-close').addEventListener('click', () => {
  setMobileNavigation(false);
  $('sidebar-toggle').focus();
});
$('sidebar-backdrop').addEventListener('click', () => {
  setMobileNavigation(false);
  $('sidebar-toggle').focus();
});
document.addEventListener('keydown', (event) => {
  if (!$('sidebar').classList.contains('is-open')) return;
  if (event.key === 'Escape') {
    setMobileNavigation(false);
    $('sidebar-toggle').focus();
    return;
  }
  if (event.key === 'Tab') {
    const focusable = [...$('sidebar').querySelectorAll('a[href],button:not([disabled])')].filter(
      (element) => element.getClientRects().length,
    );
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
window.addEventListener('hashchange', () => {
  setMobileNavigation(false);
  navigate(window.location.hash.slice(1), { focus: true });
});
// A repeated same-hash link still closes a mobile drawer.
document.querySelectorAll('.sidebar a').forEach((link) =>
  link.addEventListener('click', () => {
    setMobileNavigation(false);
    if (link.hash === window.location.hash) navigate(link.hash.slice(1), { focus: true });
  }),
);
window
  .matchMedia('(max-width: 760px)')
  .addEventListener('change', () => setMobileNavigation(false));
// Best effort lifecycle clearing; clipboard and downloaded files are outside this boundary.
window.addEventListener('pagehide', () => clearWorkspace({ announce: false }));
window.addEventListener('pageshow', (event) => {
  if (event.persisted) clearWorkspace({ announce: false });
});
window.addEventListener('beforeprint', () =>
  document.body.classList.toggle('print-ready', !!store.state.report),
);
initializeScenarioControls(store.state.rates);
updateTheme('dark');
setMobileNavigation(false);
render();
navigate(window.location.hash.slice(1));
