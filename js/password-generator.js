export const CHARACTER_POOLS = Object.freeze({
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  special: '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
});
export function hasSecureRandomness(cryptoProvider = globalThis.crypto) {
  return typeof cryptoProvider?.getRandomValues === 'function';
}
/** Rejection sampling removes modulo bias in a uniform 32-bit random source. */
export function secureRandomInt(maxExclusive, cryptoProvider = globalThis.crypto) {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 2 ** 32)
    throw new RangeError('The random selection bound must be an integer from 1 to 2³².');
  if (!hasSecureRandomness(cryptoProvider))
    throw new Error(
      'Secure randomness is unavailable. Use a modern browser; no insecure fallback is used.',
    );
  const limit = Math.floor(2 ** 32 / maxExclusive) * maxExclusive;
  const sample = new Uint32Array(1);
  do {
    cryptoProvider.getRandomValues(sample);
  } while (sample[0] >= limit);
  return sample[0] % maxExclusive;
}
export function generatePassword(options = {}, cryptoProvider = globalThis.crypto) {
  const length = options.length ?? 20;
  if (!Number.isInteger(length) || length < 8 || length > 64)
    throw new RangeError('Password length must be an integer from 8 to 64.');
  const enabled = Object.entries(CHARACTER_POOLS)
    .filter(([key]) => {
      if (options[key] !== undefined && typeof options[key] !== 'boolean')
        throw new TypeError('Category settings must be true or false.');
      return options[key] ?? true;
    })
    .map(([, pool]) => pool);
  if (!enabled.length) throw new RangeError('Select at least one character category.');
  if (!hasSecureRandomness(cryptoProvider))
    throw new Error(
      'Secure randomness is unavailable. Use a modern browser; no insecure fallback is used.',
    );
  const pool = enabled.join('');
  const characters = enabled.map(
    (category) => category[secureRandomInt(category.length, cryptoProvider)],
  );
  while (characters.length < length)
    characters.push(pool[secureRandomInt(pool.length, cryptoProvider)]);
  for (let index = characters.length - 1; index > 0; index--) {
    const target = secureRandomInt(index + 1, cryptoProvider);
    [characters[index], characters[target]] = [characters[target], characters[index]];
  }
  return characters.join('');
}
