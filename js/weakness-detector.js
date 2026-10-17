import { DICTIONARY_WORDS, isExactCommonPassword } from './common-password-checker.js';
import { validatePassword } from './password-validation.js';

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
const reverse = (value) => Array.from(value).reverse().join('');
function containsWindow(value, sequences, width = 4) {
  return sequences.some((sequence) =>
    [sequence, reverse(sequence)].some((row) => {
      for (let index = 0; index <= row.length - width; index++)
        if (value.includes(row.slice(index, index + width))) return true;
      return false;
    }),
  );
}
function repeatedBlock(value) {
  const chars = Array.from(value);
  for (let width = 1; width <= chars.length / 2; width++) {
    if (
      chars.length % width === 0 &&
      chars
        .slice(0, width)
        .join('')
        .repeat(chars.length / width) === value
    )
      return chars.slice(0, width).join('');
  }
  return null;
}
/** Structured, static explanations: no password fragments are retained in results. */
export function detectWeaknesses(password, characters) {
  validatePassword(password);
  const weaknesses = [];
  const add = (code, title, explanation, recommendation, severity, penalty, scoreCap = 100) => {
    weaknesses.push({ code, title, explanation, recommendation, severity, penalty, scoreCap });
  };
  const lower = password.toLowerCase();
  const normalized = lower.replace(/[013457@$!]/g, (char) => LEET[char]);
  if (characters.length < 8)
    add(
      'very-short',
      'Very short password',
      'Fewer than eight characters leaves little room against guessing.',
      'Use at least 16 random characters where supported, or a long randomly selected passphrase.',
      'high',
      30,
      20,
    );
  else if (characters.length < 12)
    add(
      'short',
      'More length would help',
      'This password is shorter than 12 characters. Character variety does not replace length.',
      'Prefer at least 16 randomly generated characters, subject to the service’s limits.',
      'medium',
      6,
      69,
    );
  if (isExactCommonPassword(password))
    add(
      'common-password',
      'Known local-list example',
      'This exact value appears in the bundled weak-password example list.',
      'Replace it entirely with a unique, randomly generated password.',
      'high',
      35,
      15,
    );
  const unique = new Set(Array.from(password));
  if (unique.size === 1)
    add(
      'single-character',
      'Only one distinct character',
      'Repeating one character does not make a password unpredictable.',
      'Choose independent random characters instead of repeating one.',
      'high',
      40,
      5,
    );
  if (/(.)\1{2,}/u.test(password))
    add(
      'repeated-character',
      'Repeated characters',
      'A run of three or more identical characters is easy to prioritize in guessing.',
      'Avoid long runs of identical characters.',
      'medium',
      12,
      55,
    );
  const block = repeatedBlock(lower);
  if (block && Array.from(block).length > 1)
    add(
      'repeated-section',
      'Repeated sections',
      'The entire password is composed of a smaller repeated section.',
      'Do not obtain length by repeating a short block.',
      'high',
      25,
      30,
    );
  const tokens = lower.split(/[\s_-]+/).filter(Boolean);
  if (
    (tokens.length > 1 && new Set(tokens).size < tokens.length) ||
    (block && /^[a-z]{3,}$/.test(block))
  ) {
    add(
      'repeated-words',
      'Repeated words',
      'A word or word-like section is reused within this password.',
      'Select unrelated words independently; do not repeat a word to increase length.',
      'medium',
      12,
      45,
    );
  }
  if (containsWindow(lower, ['0123456789012', 'abcdefghijklmnopqrstuvwxyz']))
    add(
      'sequence',
      'Sequential pattern',
      'An ascending or descending run of at least four letters or digits was detected.',
      'Avoid alphabetic and numerical sequences in either direction.',
      'high',
      15,
      60,
    );
  if (containsWindow(lower, ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1qaz2wsx', 'qazwsx']))
    add(
      'keyboard',
      'Keyboard sequence',
      'A familiar keyboard walk appears in this password.',
      'Use random choices rather than adjacent keyboard keys.',
      'high',
      20,
      50,
    );
  const compact = normalized.replace(/[^a-z]/g, '');
  if (
    ['correcthorsebatterystaple', 'iloveyou', 'letmein', 'thisisapassword'].some((phrase) =>
      compact.includes(phrase),
    )
  )
    add(
      'familiar-phrase',
      'Familiar published phrase',
      'A well-known phrase or published password example was detected. Length does not make a public example unpredictable.',
      'Do not reuse quotes or published examples. Choose independent random words or characters.',
      'high',
      25,
      25,
    );
  const words = DICTIONARY_WORDS.filter(
    (word) => lower.includes(word) || normalized.includes(word),
  );
  if (words.length) {
    // A long multi-word passphrase is not treated like a short dictionary word.
    const longPhrase = characters.length >= 24 && new Set(words).size >= 4;
    add(
      'dictionary-word',
      'Dictionary-like content',
      'One or more words from a small English-centric demonstration dictionary were detected. This detector is not comprehensive.',
      'Prefer random characters or several independently selected, unrelated words; avoid quotes and personal details.',
      'medium',
      longPhrase ? 5 : 10,
      100,
    );
  }
  if (words.some((word) => !lower.includes(word) && normalized.includes(word)))
    add(
      'predictable-substitution',
      'Predictable substitutions',
      'Familiar letter-to-digit or letter-to-symbol replacements reveal a dictionary-like base.',
      'Substitutions are well known to attackers. Replace the base, not just its spelling.',
      'high',
      18,
      45,
    );
  const root = lower.replace(/^[\d!@#$%^&*._-]+/, '').replace(/[\d!@#$%^&*._-]+$/, '');
  const normalizedRoot = root.replace(/[013457@$!]/g, (char) => LEET[char]);
  if (root.length >= 3 && root !== lower && DICTIONARY_WORDS.includes(normalizedRoot))
    add(
      'predictable-combination',
      'Common word with a simple addition',
      'A dictionary-like base is paired with a predictable numeric or symbol prefix/suffix.',
      'Avoid a common word followed by numbers, a year, or punctuation.',
      'high',
      22,
      30,
    );
  if (
    /^(?:19|20)\d{2}$/.test(password) ||
    /(?:19|20)\d{2}$/.test(lower.replace(/[!@#$%^&*._-]+$/, ''))
  ) {
    add(
      'year-suffix',
      'Predictable year pattern',
      'A calendar-year-like ending may be included in early guesses.',
      'Do not rely on a year or date suffix for unpredictability.',
      'low',
      5,
      100,
    );
  }
  return weaknesses;
}
