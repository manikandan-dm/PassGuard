const YEAR_SECONDS = 365.25 * 24 * 60 * 60;
/** Format logarithms directly: never exponentiate an unbounded search space. */
export function formatMagnitude(log10Value, significantDigits = 3) {
  if (log10Value === null || !Number.isFinite(log10Value)) return 'Not available';
  if (log10Value < 6 && log10Value >= -3) {
    return Number((10 ** log10Value).toPrecision(significantDigits)).toLocaleString('en-US', {
      maximumFractionDigits: 4,
    });
  }
  let exponent = Math.floor(log10Value);
  let mantissa = Number((10 ** (log10Value - exponent)).toPrecision(significantDigits));
  if (mantissa >= 10) {
    mantissa /= 10;
    exponent++;
  }
  return `${mantissa} × 10^${exponent}`;
}
export function formatDuration(log10Seconds) {
  if (!Number.isFinite(log10Seconds)) return 'Not available';
  if (log10Seconds < -3) return 'Less than a millisecond';
  if (log10Seconds < 0) return `${Number((10 ** (log10Seconds + 3)).toPrecision(3))} milliseconds`;
  const units = [
    { label: 'second', seconds: 1 },
    { label: 'minute', seconds: 60 },
    { label: 'hour', seconds: 3600 },
    { label: 'day', seconds: 86400 },
    { label: 'year', seconds: YEAR_SECONDS },
  ];
  let unit = units[0];
  for (const candidate of units)
    if (log10Seconds >= Math.log10(candidate.seconds)) unit = candidate;
  const valueLog = log10Seconds - Math.log10(unit.seconds);
  const value = formatMagnitude(valueLog);
  return `${value} ${unit.label}${value === '1' ? '' : 's'}`;
}
export function estimateCrackTime(log10ExpectedAttempts, guessesPerSecond) {
  if (!Number.isFinite(guessesPerSecond) || guessesPerSecond < 0.001 || guessesPerSecond > 1e18) {
    throw new RangeError('Scenario rates must be between 0.001 and 10¹⁸ guesses per second.');
  }
  if (!Number.isFinite(log10ExpectedAttempts))
    throw new RangeError('Expected attempts are not available.');
  const log10Seconds = log10ExpectedAttempts - Math.log10(guessesPerSecond);
  return { log10Seconds, duration: formatDuration(log10Seconds) };
}
