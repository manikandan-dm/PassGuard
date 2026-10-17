import { validatePassword } from './password-validation.js';

/** Length is Unicode code points, not UTF-16 units or grapheme clusters. */
export function analyzeCharacters(password) {
  validatePassword(password, { allowEmpty: true });
  const stats = {
    length: 0,
    uppercase: 0,
    lowercase: 0,
    digits: 0,
    special: 0,
    asciiSymbols: 0,
    spaces: 0,
    nonAscii: 0,
    uniqueNonAscii: 0,
  };
  const nonAscii = new Set();
  for (const character of password) {
    stats.length++;
    if (/[A-Z]/.test(character)) stats.uppercase++;
    else if (/[a-z]/.test(character)) stats.lowercase++;
    else if (/[0-9]/.test(character)) stats.digits++;
    else {
      stats.special++;
      if (character === ' ') stats.spaces++;
      else if (character.codePointAt(0) > 127) {
        stats.nonAscii++;
        nonAscii.add(character);
      } else stats.asciiSymbols++;
    }
  }
  stats.uniqueNonAscii = nonAscii.size;
  stats.presence = {
    uppercase: stats.uppercase > 0,
    lowercase: stats.lowercase > 0,
    digits: stats.digits > 0,
    special: stats.special > 0,
  };
  stats.categoryCount = Object.values(stats.presence).filter(Boolean).length;
  return stats;
}
