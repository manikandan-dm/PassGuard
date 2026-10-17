/** Uses the same analysis score and weakness codes; never invents another score. */
export function getRiskIndicators(analysis) {
  const highRiskCodes = new Set([
    'common-password',
    'keyboard',
    'sequence',
    'single-character',
    'repeated-character',
    'repeated-section',
    'repeated-words',
    'predictable-substitution',
    'predictable-combination',
    'familiar-phrase',
  ]);
  const highRisk = analysis.weaknesses.some((item) => highRiskCodes.has(item.code));
  const moderateRisk = analysis.weaknesses.some((item) =>
    ['dictionary-word', 'very-short', 'short', 'year-suffix'].includes(item.code),
  );
  return {
    bruteForce: {
      label:
        analysis.classification === 'Strong'
          ? 'Higher theoretical resistance'
          : analysis.classification === 'Medium'
            ? 'Moderate theoretical resistance'
            : 'Low theoretical resistance',
      level: analysis.classification.toLowerCase(),
      explanation: `Based on the same ${analysis.score}/100 educational score, not on the enormous theoretical search space alone. Real-world resistance depends on randomness, the verifier, and the attacker.`,
    },
    dictionary: {
      label: highRisk
        ? 'High pattern-based guessing risk'
        : moderateRisk
          ? 'Some predictable content detected'
          : 'No listed patterns detected',
      level: highRisk ? 'high' : moderateRisk ? 'medium' : 'unidentified',
      explanation: highRisk
        ? 'Detected patterns are likely to be prioritized before exhaustive search. Treat theoretical durations with particular caution.'
        : moderateRisk
          ? 'Some length or dictionary-related weaknesses remain. Attackers may prioritize likely choices before exploring every combination.'
          : 'The small local detector did not identify its listed patterns. It cannot establish randomness or rule out dictionary attacks.',
    },
  };
}
