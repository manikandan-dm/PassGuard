import { analyzePassword } from './analyzer.js';
import { defaultScenarioRates, estimateAttack, ATTACK_SCENARIOS } from './attack-estimator.js';
import { estimateCrackTime } from './crack-time-estimator.js';
import { generateSecurityReport } from './security-report.js';
import { validatePassword } from './password-validation.js';
import { checkCommonPassword } from './common-password-checker.js';

/** Explicit memory-only state machine. No persistence adapter exists. */
export function createStore() {
  const empty = (revision = 0, rates = defaultScenarioRates(), generationRevision = 0) => ({
    password: '',
    analysis: null,
    stale: false,
    revision,
    breach: { status: 'not-checked' },
    report: null,
    generated: '',
    generationRevision,
    rates,
  });
  let state = empty();
  const currentAnalysis = () => (state.stale ? null : state.analysis);
  return {
    get state() {
      return state;
    },
    currentAnalysis,
    currentAttack() {
      const analysis = currentAnalysis();
      return analysis ? estimateAttack(analysis, state.rates) : null;
    },
    setPassword(password) {
      validatePassword(password, { allowEmpty: true });
      if (password === state.password) return false;
      state = {
        ...state,
        password,
        stale: !!state.analysis,
        revision: state.revision + 1,
        breach: { status: 'not-checked' },
        report: null,
      };
      return true;
    },
    analyze() {
      const analysis = analyzePassword(state.password);
      state = {
        ...state,
        analysis,
        stale: false,
        revision: state.revision + 1,
        breach: { status: 'not-checked' },
        report: null,
      };
      return analysis;
    },
    setGenerated(generated) {
      validatePassword(generated, { allowEmpty: true });
      state = { ...state, generated, generationRevision: state.generationRevision + 1 };
    },
    startBreach() {
      if (!currentAnalysis())
        throw new RangeError('Analyze the current password before checking exposure.');
      state = {
        ...state,
        breach: { status: 'checking' },
        report: null,
        revision: state.revision + 1,
      };
      return state.revision;
    },
    applyBreach(result, revision) {
      if (revision !== state.revision || !currentAnalysis() || state.breach.status !== 'checking')
        return false;
      if (!['exposed', 'not-found', 'error'].includes(result.status))
        throw new RangeError('Invalid breach-check result.');
      state = { ...state, breach: result, report: null };
      return true;
    },
    cancelBreach() {
      if (state.breach.status !== 'checking') return;
      state = {
        ...state,
        revision: state.revision + 1,
        breach: { status: 'not-checked' },
        report: null,
      };
    },
    setRates(rates) {
      const next = {};
      for (const { id } of ATTACK_SCENARIOS) {
        estimateCrackTime(0, rates[id]);
        next[id] = rates[id];
      }
      state = { ...state, rates: next, report: null };
    },
    runLocalCheck() {
      const analysis = currentAnalysis();
      if (!analysis)
        throw new RangeError('Analyze the current password before running the local check.');
      const common = checkCommonPassword(state.password, analysis.weaknesses);
      state = { ...state, analysis: { ...analysis, common }, report: null };
      return common;
    },
    makeReport() {
      if (!currentAnalysis())
        throw new RangeError('Analyze the current password before generating a report.');
      if (state.breach.status === 'checking')
        throw new RangeError('Wait for or cancel the breach check before generating a report.');
      const report = generateSecurityReport(currentAnalysis(), state.breach, this.currentAttack());
      state = { ...state, report };
      return report;
    },
    clearReport() {
      state = { ...state, report: null };
    },
    reset() {
      state = empty(state.revision + 1, state.rates, state.generationRevision + 1);
    },
  };
}
