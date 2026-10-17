import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { generatePassword, secureRandomInt, CHARACTER_POOLS } from '../js/password-generator.js';
import { copyToClipboard } from '../js/clipboard.js';
import { analyzePassword } from '../js/analyzer.js';

test('generated lengths and selected-category requirements hold across 200 outputs', () => {
  for (let iteration = 0; iteration < 200; iteration++) {
    const length = 8 + (iteration % 57);
    const output = generatePassword({ length }, webcrypto);
    assert.equal(output.length, length);
    for (const category of Object.values(CHARACTER_POOLS))
      assert.ok([...output].some((char) => category.includes(char)));
    assert.ok(analyzePassword(output).score <= 100);
  }
});
test('every nonempty subset of categories is honored, without unselected characters', () => {
  const keys = Object.keys(CHARACTER_POOLS);
  for (let mask = 1; mask < 16; mask++) {
    const options = { length: 32 };
    keys.forEach((key, index) => {
      options[key] = Boolean(mask & (1 << index));
    });
    const output = generatePassword(options, webcrypto);
    const allowed = keys
      .filter((key) => options[key])
      .map((key) => CHARACTER_POOLS[key])
      .join('');
    assert.ok([...output].every((char) => allowed.includes(char)));
    for (const key of keys.filter((key) => options[key]))
      assert.ok([...output].some((char) => CHARACTER_POOLS[key].includes(char)));
  }
  assert.equal(CHARACTER_POOLS.special.length, 32);
});
test('rejection sampling discards biased tail values instead of applying modulo', () => {
  const samples = [4294967295, 7];
  let calls = 0;
  const mockCrypto = {
    getRandomValues(buffer) {
      buffer[0] = samples[calls++];
      return buffer;
    },
  };
  assert.equal(secureRandomInt(10, mockCrypto), 7);
  assert.equal(calls, 2);
  assert.equal(
    secureRandomInt(2 ** 32, {
      getRandomValues(b) {
        b[0] = 4294967295;
      },
    }),
    4294967295,
  );
});
test('invalid generator settings and unavailable crypto fail closed', () => {
  for (const length of [0, 7, 65, 8.5, '20', NaN])
    assert.throws(() => generatePassword({ length }, webcrypto), /length/);
  assert.throws(
    () =>
      generatePassword(
        { length: 8, uppercase: false, lowercase: false, digits: false, special: false },
        webcrypto,
      ),
    /at least one/,
  );
  assert.throws(() => generatePassword({ uppercase: 'yes' }, webcrypto), /true or false/);
  assert.throws(() => generatePassword({}, null), /Secure randomness/);
  assert.throws(() => secureRandomInt(5, {}), /Secure randomness/);
  for (const bound of [0, -1, 1.5, 2 ** 32 + 1])
    assert.throws(() => secureRandomInt(bound, webcrypto), /bound/);
});
test('clipboard success is reported only after a successful write', async () => {
  let wrote = false;
  assert.equal(
    await copyToClipboard('synthetic-only', {
      clipboard: {
        async writeText(value) {
          assert.equal(value, 'synthetic-only');
          wrote = true;
        },
      },
    }),
    true,
  );
  assert.equal(wrote, true);
});
test('clipboard denied, missing, and empty states return actionable failures', async () => {
  await assert.rejects(copyToClipboard('synthetic', { clipboard: null }), /unavailable/);
  await assert.rejects(
    copyToClipboard('synthetic', {
      clipboard: {
        async writeText() {
          throw new Error('permission');
        },
      },
    }),
    /denied/,
  );
  await assert.rejects(copyToClipboard('', { clipboard: null }), /Generate/);
});
