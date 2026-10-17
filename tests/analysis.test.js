import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzePassword } from '../js/analyzer.js';
import { analyzeCharacters } from '../js/character-analysis.js';
import { calculateEntropy } from '../js/entropy-calculator.js';
import { checkCommonPassword, COMMON_PASSWORDS } from '../js/common-password-checker.js';

const has = (password, code) =>
  analyzePassword(password).weaknesses.some((item) => item.code === code);
test('empty input is rejected, empty character statistics and entropy are zero', () => {
  assert.throws(() => analyzePassword(''), /Enter a password/);
  const chars = analyzeCharacters('');
  assert.equal(chars.length, 0);
  assert.equal(chars.categoryCount, 0);
  assert.equal(calculateEntropy(chars).bits, 0);
});
test('length, control-character, and input-type validation', () => {
  assert.throws(() => analyzePassword('x'.repeat(1025)), /1,024/);
  assert.throws(() => analyzePassword('test\nvalue'), /Control/);
  assert.throws(() => analyzePassword(null), /text/);
});
test('weak, medium, and strong fixtures use the same score thresholds', () => {
  const fixtures = [
    ['password', 'Weak'],
    ['vR8#kL2!xT', 'Medium'],
    ['vR8#kL2!xT9@pN6$', 'Strong'],
  ];
  for (const [value, classification] of fixtures) {
    const result = analyzePassword(value);
    assert.equal(result.classification, classification);
    assert.ok(result.score >= 0 && result.score <= 100);
    assert.equal(
      result.classification,
      result.score < 40 ? 'Weak' : result.score < 70 ? 'Medium' : 'Strong',
    );
  }
});
test('character counts and category presence are accurate', () => {
  const result = analyzeCharacters('ABcd12!? ');
  assert.deepEqual(
    [result.length, result.uppercase, result.lowercase, result.digits, result.special],
    [9, 2, 2, 2, 3],
  );
  assert.equal(result.asciiSymbols, 2);
  assert.equal(result.spaces, 1);
  assert.equal(result.categoryCount, 4);
});
test('Unicode code points are counted, with an explicit entropy proxy', () => {
  const result = analyzePassword('Ab1!😀😀é');
  assert.equal(result.characters.length, 7);
  assert.equal(result.characters.nonAscii, 3);
  assert.equal(result.characters.uniqueNonAscii, 2);
  assert.equal(result.entropy.characterSetSize, 96);
  assert.match(result.entropy.unicodeNote, /proxy/);
});
test('entropy uses only observed ASCII pools', () => {
  assert.equal(calculateEntropy(analyzeCharacters('abcd')).bits, 4 * Math.log2(26));
  assert.equal(calculateEntropy(analyzeCharacters('Ab1!')).characterSetSize, 94);
  assert.equal(calculateEntropy(analyzeCharacters('Ab1! ')).characterSetSize, 95);
});
test('sequential runs work in both directions', () => {
  for (const value of ['123456', 'abcdef', 'fedcba', '987654'])
    assert.equal(has(value, 'sequence'), true);
});
test('keyboard, repetition, repeated sections, and repeated words are detected', () => {
  assert.equal(has('qwertyuiop', 'keyboard'), true);
  assert.equal(has('AAAAAAAAAAAA', 'repeated-character'), true);
  assert.equal(has('ab!ab!ab!', 'repeated-section'), true);
  assert.equal(has('orange-orange', 'repeated-words'), true);
  assert.equal(has('sunshinesunshine', 'repeated-words'), true);
});
test('predictable substitutions and word-plus-number combinations do not get strong scores', () => {
  assert.equal(has('P@ssw0rd', 'predictable-substitution'), true);
  assert.equal(has('Password2026!', 'predictable-combination'), true);
  assert.equal(has('Password2026!', 'year-suffix'), true);
  assert.ok(analyzePassword('Password2026!').score < 40);
  assert.ok(analyzePassword('P@ssw0rd123!').score < 40);
});
test('long repetition does not receive excessive length credit', () => {
  assert.ok(analyzePassword('A'.repeat(256)).score <= 5);
  assert.ok(analyzePassword('ab'.repeat(128)).score <= 30);
});
test('exact local matches are separate from heuristic warnings', () => {
  assert.equal(checkCommonPassword('password').exactMatch, true);
  assert.equal(checkCommonPassword('Password').label, 'Not found in the local list');
  assert.equal(analyzePassword('P@ssw0rd').common.exactMatch, false);
  assert.ok(analyzePassword('P@ssw0rd').common.heuristicWarnings.length > 0);
  assert.equal(COMMON_PASSWORDS.length, 50);
});
test('analysis results contain no synthetic credential or extracted fragments', () => {
  const sentinel = 'vR8#kL2!xT9@pN6$';
  assert.ok(!JSON.stringify(analyzePassword(sentinel)).includes(sentinel));
  assert.equal(Object.hasOwn(analyzePassword(sentinel), 'password'), false);
});

test('well-known published passphrases do not receive a strong score', () => {
  const result = analyzePassword('correct-horse-battery-staple');
  assert.ok(result.score <= 25);
  assert.ok(result.weaknesses.some((item) => item.code === 'familiar-phrase'));
  assert.ok(result.common.heuristicWarnings.some((item) => item.code === 'familiar-phrase'));
});
