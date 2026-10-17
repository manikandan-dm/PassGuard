import { estimateCrackTime, formatMagnitude } from './crack-time-estimator.js';
import { getRiskIndicators } from './risk-indicators.js';

/** Deliberately hypothetical and editable; none are measured on a user's device. */
export const ATTACK_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'online-strict',
    name: 'Online · strict rate limit',
    rate: 0.1,
    description:
      'Assumes strict throttling holds continuously; account lockouts, adaptive changes, and MFA are not modeled.',
  }),
  Object.freeze({
    id: 'online-weak',
    name: 'Online · weaker rate limit',
    rate: 10,
    description:
      'Assumes continuous availability with weaker throttling and no effective lockout or adaptive defenses.',
  }),
  Object.freeze({
    id: 'offline-slow',
    name: 'Offline · slower hash',
    rate: 10000,
    description:
      'Assumes a stolen verifier protected by a relatively costly password hash. Hash designs, parameters, salts, and hardware vary enormously.',
  }),
  Object.freeze({
    id: 'offline-fast',
    name: 'Offline · faster hash',
    rate: 10000000000,
    description:
      'Assumes a stolen verifier and a relatively fast hashing method. This is not a benchmark or a claim about a particular algorithm.',
  }),
]);
export const defaultScenarioRates = () =>
  Object.fromEntries(ATTACK_SCENARIOS.map((item) => [item.id, item.rate]));
export function estimateAttack(analysis, rates = defaultScenarioRates()) {
  if (!analysis || analysis.characters.length < 1 || analysis.entropy.characterSetSize < 1)
    throw new RangeError('A current password analysis is required.');
  const log10SearchSpace =
    analysis.characters.length * Math.log10(analysis.entropy.characterSetSize);
  const log10ExpectedAttempts = log10SearchSpace - Math.log10(2);
  return {
    log10SearchSpace,
    log10ExpectedAttempts,
    searchSpace: formatMagnitude(log10SearchSpace),
    expectedAttempts: formatMagnitude(log10ExpectedAttempts),
    formula: `${analysis.entropy.characterSetSize}^${analysis.characters.length}; expected exhaustive-search attempts ≈ N/2`,
    scenarios: ATTACK_SCENARIOS.map((scenario) => {
      const rate = rates[scenario.id];
      return {
        ...scenario,
        rate,
        rateLabel: formatMagnitude(Math.log10(rate)),
        expectedAttempts: formatMagnitude(log10ExpectedAttempts),
        ...estimateCrackTime(log10ExpectedAttempts, rate),
      };
    }),
    risks: getRiskIndicators(analysis),
    assumptions:
      'Uniformly random independent characters, exhaustive search, a fixed hypothetical guessing rate, and N/2 expected attempts. Dictionary and pattern-based guessing can succeed much earlier. No real attack is executed.',
  };
}
