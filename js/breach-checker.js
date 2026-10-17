import { validatePassword } from './password-validation.js';

export const BREACH_ENDPOINT = 'https://api.pwnedpasswords.com/range/';
export const BREACH_TIMEOUT_MS = 10000;
const MAX_RESPONSE_SIZE = 2_000_000;
export class BreachCheckError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BreachCheckError';
    this.code = code;
  }
}
export function hasBreachSupport(cryptoProvider = globalThis.crypto, fetchImpl = globalThis.fetch) {
  return (
    typeof cryptoProvider?.subtle?.digest === 'function' &&
    typeof fetchImpl === 'function' &&
    typeof AbortController === 'function' &&
    typeof TextEncoder === 'function'
  );
}
/** Validate the ENTIRE body before trusting any match or negative result.
 * Counts are decimal strings, preserving values above Number.MAX_SAFE_INTEGER.
 * Padded zero-count records are valid but never count as exposure.
 */
export function parseRangeResponse(text, targetSuffix) {
  if (
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > MAX_RESPONSE_SIZE ||
    !/^[A-F0-9]{35}$/.test(targetSuffix)
  ) {
    throw new BreachCheckError(
      'MALFORMED',
      'The breach service returned an invalid response. No result was recorded.',
    );
  }
  const rows = text.trim().split(/\r?\n/);
  const seen = new Set();
  let count = '0';
  for (const row of rows) {
    const match = /^([A-Fa-f0-9]{35}):([0-9]{1,20})$/.exec(row);
    if (!match || seen.has(match[1].toUpperCase()))
      throw new BreachCheckError(
        'MALFORMED',
        'The breach service returned an invalid response. No result was recorded.',
      );
    const suffix = match[1].toUpperCase();
    seen.add(suffix);
    if (suffix === targetSuffix) count = BigInt(match[2]).toString();
  }
  return { status: count === '0' ? 'not-found' : 'exposed', count };
}
/** Called only by the explicit breach-check action. Plaintext and full hash never
 * appear in requests, return values, errors, browser storage, or logs.
 */
export async function checkBreach(
  password,
  {
    cryptoProvider = globalThis.crypto,
    fetchImpl = globalThis.fetch,
    signal,
    timeoutMs = BREACH_TIMEOUT_MS,
    now = () => new Date(),
  } = {},
) {
  validatePassword(password);
  if (!hasBreachSupport(cryptoProvider, fetchImpl))
    throw new BreachCheckError(
      'UNSUPPORTED',
      'Breach checking needs Web Crypto SHA-1, fetch, and a secure context (HTTPS or localhost). Other local tools remain available.',
    );
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000)
    throw new RangeError('The request timeout must be from 1 to 120,000 milliseconds.');
  const controller = new AbortController();
  let timedOut = false;
  const onParentAbort = () => controller.abort();
  if (signal?.aborted)
    throw new BreachCheckError('CANCELLED', 'Breach check cancelled. No result was recorded.');
  signal?.addEventListener('abort', onParentAbort, { once: true });
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let onAbort;
  const aborted = new Promise((resolve, reject) => {
    onAbort = () =>
      reject(new BreachCheckError('CANCELLED', 'Breach check cancelled. No result was recorded.'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  const operation = async () => {
    let hashBytes;
    try {
      hashBytes = await cryptoProvider.subtle.digest('SHA-1', new TextEncoder().encode(password));
    } catch {
      throw new BreachCheckError('CRYPTO', 'Local hashing failed. No breach request was sent.');
    }
    if (controller.signal.aborted)
      throw new BreachCheckError('CANCELLED', 'Breach check cancelled.');
    const fullHash = Array.from(new Uint8Array(hashBytes), (byte) =>
      byte.toString(16).padStart(2, '0'),
    )
      .join('')
      .toUpperCase();
    if (!/^[A-F0-9]{40}$/.test(fullHash))
      throw new BreachCheckError(
        'CRYPTO',
        'Local hashing returned an invalid result. No breach request was sent.',
      );
    const prefix = fullHash.slice(0, 5);
    const suffix = fullHash.slice(5);
    const response = await fetchImpl(`${BREACH_ENDPOINT}${prefix}`, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { 'Add-Padding': 'true', Accept: 'text/plain' },
      signal: controller.signal,
    });
    if (response.status === 429)
      throw new BreachCheckError(
        'RATE_LIMIT',
        'The breach service is rate-limiting requests. Try again later; this is not a negative result.',
      );
    if (response.status !== 200)
      throw new BreachCheckError(
        'HTTP',
        'The breach service is unavailable or refused the request. No result was recorded.',
      );
    const contentLength = response.headers?.get('content-length');
    const contentType = response.headers?.get('content-type');
    if (
      (contentLength && Number(contentLength) > MAX_RESPONSE_SIZE) ||
      (contentType && !/^text\/plain(?:;|$)/i.test(contentType))
    ) {
      throw new BreachCheckError(
        'MALFORMED',
        'The breach service returned an unexpected response. No result was recorded.',
      );
    }
    const text = await response.text();
    if (controller.signal.aborted)
      throw new BreachCheckError('CANCELLED', 'Breach check cancelled.');
    return { ...parseRangeResponse(text, suffix), checkedAt: now().toISOString() };
  };
  try {
    return await Promise.race([operation(), aborted]);
  } catch (error) {
    if (timedOut)
      throw new BreachCheckError(
        'TIMEOUT',
        'The breach check timed out. No result was recorded; try again later.',
      );
    if (controller.signal.aborted)
      throw new BreachCheckError('CANCELLED', 'Breach check cancelled. No result was recorded.');
    if (error instanceof BreachCheckError) throw error;
    throw new BreachCheckError(
      'NETWORK',
      'The breach check failed because of a network, CORS, or service error. No result was recorded. Other tools still work.',
    );
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onParentAbort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}
