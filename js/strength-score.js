/** One rule: min(100, min(90, 4L) + 5 max(0,C−1)) − penalties, then caps.
 * Weak 0–39; Medium 40–69; Strong 70–100. Scores are educational, not calibrated.
 */
export function calculateStrength(characters, weaknesses) {
  const lengthPoints = Math.min(90, characters.length * 4);
  const varietyPoints = Math.max(0, characters.categoryCount - 1) * 5;
  const base = Math.min(100, lengthPoints + varietyPoints);
  const penalty = weaknesses.reduce((sum, weakness) => sum + weakness.penalty, 0);
  const cap = Math.min(100, ...weaknesses.map((weakness) => weakness.scoreCap));
  const score = Math.max(0, Math.min(cap, Math.round(base - penalty)));
  const classification = score < 40 ? 'Weak' : score < 70 ? 'Medium' : 'Strong';
  const explanation =
    classification === 'Weak'
      ? 'Short length or predictable patterns make this password a poor choice. Replace it rather than adding a familiar suffix.'
      : classification === 'Medium'
        ? 'Some useful length or variety is present, but the current heuristic indicates room for improvement. Prefer a longer, unique, unpredictable replacement.'
        : 'Useful length and limited detected predictability produce a strong heuristic score. This does not establish randomness, uniqueness, or absence from breaches.';
  return {
    score,
    classification,
    explanation,
    breakdown: { lengthPoints, varietyPoints, penalty, cap },
  };
}
