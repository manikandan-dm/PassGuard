import { validatePassword } from './password-validation.js';
import { analyzeCharacters } from './character-analysis.js';
import { detectWeaknesses } from './weakness-detector.js';
import { calculateEntropy } from './entropy-calculator.js';
import { calculateStrength } from './strength-score.js';
import { getRecommendations } from './recommendations.js';
import { checkCommonPassword } from './common-password-checker.js';

/** The only entry point for manual and generated password assessments.
 * The returned object deliberately contains no password or extracted fragments.
 */
export function analyzePassword(password, { now = () => new Date() } = {}) {
  validatePassword(password);
  const characters = analyzeCharacters(password);
  const weaknesses = detectWeaknesses(password, characters);
  return {
    analyzedAt: now().toISOString(),
    characters,
    weaknesses,
    ...calculateStrength(characters, weaknesses),
    entropy: calculateEntropy(characters),
    recommendations: getRecommendations(characters, weaknesses),
    common: checkCommonPassword(password, weaknesses),
  };
}
