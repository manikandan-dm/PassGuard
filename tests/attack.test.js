import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePassword } from '../js/analyzer.js';
import { estimateAttack, defaultScenarioRates } from '../js/attack-estimator.js';
import { estimateCrackTime, formatDuration, formatMagnitude } from '../js/crack-time-estimator.js';

test('search-space and expected-attempt logs are distinct and mathematically correct', () => {
  const result = estimateAttack(analyzePassword('ab'));
  assert.ok(Math.abs(result.log10SearchSpace - Math.log10(26 ** 2)) < 1e-12);
  assert.ok(Math.abs(result.log10ExpectedAttempts - Math.log10(26 ** 2 / 2)) < 1e-12);
  assert.equal(result.searchSpace, '676');
  assert.equal(result.expectedAttempts, '338');
});
test('all four scenarios reuse the same expected attempts', () => {
  const result = estimateAttack(analyzePassword('vR8#kL2!xT9@pN6$'));
  assert.equal(result.scenarios.length, 4);
  for (const scenario of result.scenarios)
    assert.equal(scenario.expectedAttempts, result.expectedAttempts);
});
test('large values never produce Infinity or NaN', () => {
  const analysis = analyzePassword('vR8#'.repeat(256));
  const attack = estimateAttack(analysis);
  assert.ok(attack.log10SearchSpace > 1900);
  assert.ok(!/Infinity|NaN/.test(JSON.stringify(attack)));
  assert.match(attack.searchSpace, /10\^/);
  assert.match(attack.scenarios[3].duration, /years/);
});
test('duration conversion handles readable units and subsecond values', () => {
  assert.equal(formatDuration(Math.log10(60)), '1 minute');
  assert.equal(formatDuration(Math.log10(3600)), '1 hour');
  assert.equal(formatDuration(Math.log10(86400)), '1 day');
  assert.equal(formatDuration(-10), 'Less than a millisecond');
  assert.equal(formatDuration(-2), '10 milliseconds');
  assert.equal(formatMagnitude(1000), '1 × 10^1000');
  assert.equal(formatDuration(NaN), 'Not available');
});
test('scenario rates are configurable and validated', () => {
  const rates = defaultScenarioRates();
  rates['online-strict'] = 1;
  const attack = estimateAttack(analyzePassword('ab'), rates);
  assert.ok(Math.abs(attack.scenarios[0].log10Seconds - Math.log10(338)) < 1e-12);
  for (const rate of [0, -1, Infinity, NaN, 1e19])
    assert.throws(() => estimateCrackTime(10, rate), /rates/);
  assert.throws(() => estimateAttack(null), /current/);
});
test('dictionary risk recognizes predictable strings regardless of search-space size', () => {
  const result = estimateAttack(analyzePassword('password'.repeat(20)));
  assert.equal(result.risks.dictionary.level, 'high');
  assert.equal(result.risks.bruteForce.level, 'weak');
});
