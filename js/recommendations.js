/** Recommendations reuse detected weaknesses instead of re-scoring passwords. */
export function getRecommendations(characters, weaknesses) {
  const recommendations = [];
  const add = (code, title, description) => {
    if (!recommendations.some((item) => item.code === code))
      recommendations.push({ code, title, description });
  };
  if (characters.length < 16)
    add(
      'length',
      'Give your password more length',
      'Prefer at least 16 randomly generated characters where supported, or a long passphrase from independently selected random words.',
    );
  for (const item of weaknesses) {
    let code = item.code;
    if (
      ['single-character', 'repeated-character', 'repeated-section', 'repeated-words'].includes(
        code,
      )
    )
      code = 'repetition';
    if (['very-short', 'short'].includes(code)) continue;
    add(
      code,
      code === 'repetition' ? 'Choose independent characters or words' : item.title,
      item.recommendation,
    );
  }
  add(
    'unique',
    'Use a different password for every account',
    'Never reuse this password or a minor variation of it. A breach on one service should not unlock another.',
  );
  add(
    'manager',
    'Let a trusted password manager help',
    'Generate, store, and autofill long unique passwords instead of memorizing predictable variations.',
  );
  add(
    'mfa',
    'Add multi-factor authentication',
    'Prefer passkeys or security keys where available, and securely store account recovery codes.',
  );
  return recommendations;
}
