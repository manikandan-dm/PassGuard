/** ASCII pools: 26 upper, 26 lower, 10 digits, 32 punctuation, 1 space.
 * Unicode contributes only the count of distinct observed non-ASCII code points.
 * This is an explicit conservative pool proxy, not a Unicode alphabet model.
 */
export function calculateEntropy(characters) {
  const characterSetSize =
    (characters.uppercase ? 26 : 0) +
    (characters.lowercase ? 26 : 0) +
    (characters.digits ? 10 : 0) +
    (characters.asciiSymbols ? 32 : 0) +
    (characters.spaces ? 1 : 0) +
    characters.uniqueNonAscii;
  const bits = characterSetSize > 0 ? characters.length * Math.log2(characterSetSize) : 0;
  const assumptions =
    'Length × log₂(pool size), assuming independent, uniformly random character selection. ASCII pools: uppercase 26, lowercase 26, digits 10, punctuation 32, and space 1, only when present. Human-created patterns can make this a substantial overestimate.';
  const unicodeNote = characters.nonAscii
    ? 'Unicode is present: distinct observed non-ASCII code points are added as a conservative pool proxy, not the full Unicode alphabet. Length counts code points, not displayed graphemes.'
    : null;
  return { bits, characterSetSize, assumptions, unicodeNote };
}
