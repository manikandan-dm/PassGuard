import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto, createHash } from 'node:crypto';
import { checkBreach, parseRangeResponse, hasBreachSupport } from '../js/breach-checker.js';
const fixture = 'Synthetic-Breach-Fixture#2048';
const hash = createHash('sha1').update(fixture).digest('hex').toUpperCase();
const suffix = hash.slice(5);
const other = 'F'.repeat(35) === suffix ? 'A'.repeat(35) : 'F'.repeat(35);
const response = (body, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain' } });
const options = (fetchImpl) => ({ cryptoProvider: webcrypto, fetchImpl });

test('successful exposure sends exactly a five-character prefix, never plaintext or a full hash', async () => {
  let requests = 0;
  const result = await checkBreach(
    fixture,
    options(async (url, init) => {
      requests++;
      assert.equal(url, `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
      assert.match(url, /\/range\/[A-F0-9]{5}$/);
      assert.equal(init.method, 'GET');
      assert.equal(init.headers['Add-Padding'], 'true');
      assert.equal(init.credentials, 'omit');
      assert.equal(init.referrerPolicy, 'no-referrer');
      assert.equal(init.cache, 'no-store');
      assert.equal(init.redirect, 'error');
      assert.equal(init.body, undefined);
      const request = JSON.stringify({ url, ...init });
      assert.ok(!request.includes(fixture));
      assert.ok(!request.includes(hash));
      return response(`${other}:0\r\n${suffix}:314`);
    }),
  );
  assert.equal(requests, 1);
  assert.equal(result.status, 'exposed');
  assert.equal(result.count, '314');
  assert.ok(!JSON.stringify(result).includes(hash));
});
test('a validated successful response without a suffix match is negative', async () => {
  const result = await checkBreach(
    fixture,
    options(async () => response(`${other}:12`)),
  );
  assert.equal(result.status, 'not-found');
  assert.equal(result.count, '0');
});
test('padding zero records, case-insensitive suffixes, and large counts are handled', () => {
  assert.equal(parseRangeResponse(`${suffix}:0`, suffix).status, 'not-found');
  assert.equal(
    parseRangeResponse(`${suffix.toLowerCase()}:9007199254740993`, suffix).count,
    '9007199254740993',
  );
});
test('network and non-200 responses are failures, never negative results', async () => {
  await assert.rejects(
    checkBreach(
      fixture,
      options(async () => {
        throw new TypeError('network');
      }),
    ),
    (error) => error.code === 'NETWORK',
  );
  for (const status of [404, 403, 503])
    await assert.rejects(
      checkBreach(
        fixture,
        options(async () => response('error', status)),
      ),
      (error) => error.code === 'HTTP',
    );
  await assert.rejects(
    checkBreach(
      fixture,
      options(async () => response('limited', 429)),
    ),
    (error) => error.code === 'RATE_LIMIT',
  );
});
test('malformed responses fail closed even if a valid match appeared earlier', async () => {
  for (const body of [
    '',
    'not-a-response',
    `${suffix}:2\r\ncorrupted`,
    `${suffix}:-1`,
    `${suffix}:NaN`,
    `${suffix}:1\n${suffix}:2`,
    `${suffix}:1\n\n${other}:0`,
  ]) {
    await assert.rejects(
      checkBreach(
        fixture,
        options(async () => response(body)),
      ),
      (error) => error.code === 'MALFORMED',
    );
  }
});
test('unexpected content type or oversized body is rejected', async () => {
  await assert.rejects(
    checkBreach(
      fixture,
      options(
        async () =>
          new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }),
      ),
    ),
    (error) => error.code === 'MALFORMED',
  );
  await assert.rejects(
    checkBreach(
      fixture,
      options(async () => response('A'.repeat(2_000_001))),
    ),
    (error) => error.code === 'MALFORMED',
  );
});
test('timeouts work even if a fetch implementation does not observe abort', async () => {
  await assert.rejects(
    checkBreach(fixture, { ...options(() => new Promise(() => {})), timeoutMs: 15 }),
    (error) => error.code === 'TIMEOUT',
  );
});
test('body-read failures and stalled bodies cannot become negative', async () => {
  await assert.rejects(
    checkBreach(
      fixture,
      options(async () => ({
        status: 200,
        async text() {
          throw new Error('read');
        },
      })),
    ),
    (error) => error.code === 'NETWORK',
  );
  await assert.rejects(
    checkBreach(fixture, {
      ...options(async () => ({
        status: 200,
        text() {
          return new Promise(() => {});
        },
      })),
      timeoutMs: 15,
    }),
    (error) => error.code === 'TIMEOUT',
  );
});
test('cancellation aborts and unavailable hashing does not issue a request', async () => {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  await assert.rejects(
    checkBreach(fixture, {
      ...options(async () => {
        requests++;
        return response(`${other}:1`);
      }),
      signal: controller.signal,
    }),
    (error) => error.code === 'CANCELLED',
  );
  await assert.rejects(
    checkBreach(fixture, {
      cryptoProvider: null,
      fetchImpl: async () => {
        requests++;
      },
    }),
    (error) => error.code === 'UNSUPPORTED',
  );
  assert.equal(requests, 0);
  assert.equal(hasBreachSupport(null), false);
});
test('hashing failures do not transmit anything', async () => {
  let requests = 0;
  await assert.rejects(
    checkBreach(fixture, {
      cryptoProvider: {
        subtle: {
          async digest() {
            throw new Error('digest');
          },
        },
      },
      fetchImpl: async () => {
        requests++;
      },
    }),
    (error) => error.code === 'CRYPTO',
  );
  assert.equal(requests, 0);
});

test('missing fetch and invalid digest length fail before any request', async () => {
  assert.equal(hasBreachSupport(webcrypto, null), false);
  let requests = 0;
  await assert.rejects(
    checkBreach(fixture, {
      cryptoProvider: {
        subtle: {
          async digest() {
            return new ArrayBuffer(5);
          },
        },
      },
      fetchImpl: async () => {
        requests++;
      },
    }),
    (error) => error.code === 'CRYPTO',
  );
  assert.equal(requests, 0);
});
test('a timeout during local hashing cannot later send a prefix', async () => {
  let release;
  let requests = 0;
  const pending = checkBreach(fixture, {
    cryptoProvider: {
      subtle: {
        digest() {
          return new Promise((resolve) => {
            release = resolve;
          });
        },
      },
    },
    fetchImpl: async () => {
      requests++;
    },
    timeoutMs: 10,
  });
  await assert.rejects(pending, (error) => error.code === 'TIMEOUT');
  release(new ArrayBuffer(20));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests, 0);
});
