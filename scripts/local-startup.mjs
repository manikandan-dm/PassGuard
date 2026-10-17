/** Node-built-in-only local process discovery and optional OS browser opening.
 * Read-only identity probes contain no entered passwords, hashes, or user data.
 * This is duplicate prevention, not authentication or a process-killing facility.
 */
import { request } from 'node:http';
import { spawn } from 'node:child_process';

export const HEALTH_PATH = '/__passguard/health';
export const HEALTH_RECORD = Object.freeze({ application: 'PassGuard', service: 'local-static', protocol: 1 });
export const HEALTH_BODY = `${JSON.stringify(HEALTH_RECORD)}\n`;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

export class LocalStartupError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = 'LocalStartupError';
    this.exitCode = exitCode;
  }
}

export function startupArguments(args) {
  const serverArgs = [];
  let open = false;
  let requireNew = false;
  for (const argument of args) {
    if (argument === '--open') open = true;
    else if (argument === '--no-open') open = false;
    else if (argument === '--require-new') requireNew = true;
    else serverArgs.push(argument);
  }
  return { serverArgs, open, requireNew };
}

/** A disabled IPv6 stack must not block ordinary IPv4 localhost startup. */
export function localConnectionState(code, host) {
  if (['ECONNREFUSED', 'EAFNOSUPPORT', 'EPROTONOSUPPORT'].includes(code)) return 'available';
  if (host === '::1' && ['ENETUNREACH', 'EADDRNOTAVAIL'].includes(code)) return 'available';
  return 'occupied'; // Reset, timeout, permission or unknown errors fail closed.
}

function localRequest({ host, port, path, timeoutMs, maxBytes }) {
  return new Promise(resolve => {
    let settled = false;
    let timer;
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const req = request({ hostname: host, port, path, method: 'GET', agent: false, headers: { Accept: '*/*', 'Cache-Control': 'no-store' } }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) {
          finish({ kind: 'occupied' });
          response.destroy(); req.destroy();
        } else chunks.push(chunk);
      });
      response.on('error', () => finish({ kind: 'occupied' }));
      response.on('end', () => finish({ kind: 'http', status: response.statusCode, type: response.headers['content-type'] || '', body: Buffer.concat(chunks) }));
    });
    req.on('error', error => finish({ kind: localConnectionState(error.code, host) }));
    timer = setTimeout(() => { finish({ kind: 'occupied' }); req.destroy(); }, timeoutMs);
    req.end();
  });
}

/** Probe only local addresses. Never follow redirects or trust an HTML title. */
export async function probePassGuard({ host, port, expectedHomepage, timeoutMs = 800 }) {
  if (!LOCAL_HOSTS.has(host) || !Number.isInteger(port) || port < 1 || port > 65535 || !Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new LocalStartupError('Invalid local probe configuration.');
  }
  if (!Buffer.isBuffer(expectedHomepage)) throw new LocalStartupError('The local homepage fingerprint is required.');
  const address = host === '0.0.0.0' || host === 'localhost' ? '127.0.0.1' : host;
  const health = await localRequest({ host: address, port, path: HEALTH_PATH, timeoutMs, maxBytes: 4096 });
  if (health.kind !== 'http') return { status: health.kind };
  if (health.status === 200 && /^application\/json(?:;|$)/i.test(health.type)) {
    try {
      const record = JSON.parse(health.body.toString('utf8'));
      if (record.application === HEALTH_RECORD.application && record.service === HEALTH_RECORD.service && record.protocol === HEALTH_RECORD.protocol) {
        return { status: 'passguard', recognition: 'identity-endpoint' };
      }
    } catch { /* Not a recognized identity response. Check a legacy static copy. */ }
  }
  const homepage = await localRequest({ host: address, port, path: '/', timeoutMs, maxBytes: Math.max(1048576, expectedHomepage.length) });
  if (homepage.kind === 'http' && homepage.status === 200 && /^text\/html(?:;|$)/i.test(homepage.type) && homepage.body.equals(expectedHomepage)) {
    return { status: 'passguard', recognition: 'exact-legacy-homepage' };
  }
  return { status: 'occupied' };
}

/** Check both loopback families so localhost cannot silently point at another app. */
export async function inspectLocalPort(options) {
  const addresses = options.host === '::1' ? ['::1'] : ['127.0.0.1', '::1'];
  const results = await Promise.all(addresses.map(host => probePassGuard({ ...options, host })));
  if (results.some(result => result.status === 'occupied')) return { status: 'occupied' };
  return results.find(result => result.status === 'passguard') || { status: 'available' };
}

export function browserCommands({ url, platform = process.platform, env = process.env }) {
  let parsed;
  if (typeof url !== 'string' || /[\u0000-\u0020\u007f]/u.test(url)) throw new LocalStartupError('Invalid browser URL.');
  try { parsed = new URL(url); } catch { throw new LocalStartupError('Invalid browser URL.'); }
  if (parsed.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new LocalStartupError('Browser opening is restricted to the local application URL.');
  }
  if (env.CI && env.CI !== 'false') return [];
  if (platform === 'win32') return [{ command: 'cmd.exe', args: ['/d', '/c', 'start', '', url] }];
  if (platform === 'darwin') return [{ command: 'open', args: [url] }];
  if (platform === 'linux' && (env.DISPLAY || env.WAYLAND_DISPLAY)) return [
    { command: 'xdg-open', args: [url] },
    { command: 'gio', args: ['open', url] },
  ];
  return [];
}

/** Browser opening is best-effort, never a prerequisite for a working server. */
export async function openLocalBrowser(url, { platform = process.platform, env = process.env, spawnProcess = spawn, log = console.log } = {}) {
  const commands = browserCommands({ url, platform, env });
  if (!commands.length) {
    log('Automatic browser opening skipped (headless/CI or no graphical session). Open the printed URL manually.');
    return false;
  }
  for (const { command, args } of commands) {
    const launched = await new Promise(resolve => {
      let child;
      try {
        child = spawnProcess(command, args, { detached: true, stdio: 'ignore', windowsHide: true, env });
        child.once('error', () => resolve(false));
        child.once('spawn', () => { child.unref(); resolve(true); });
      } catch { resolve(false); }
    });
    if (launched) {
      log('Browser open requested. If no tab appears, open the printed URL manually.');
      return true;
    }
  }
  log('Could not launch a desktop browser; the server is unaffected. Open the printed URL manually.');
  return false;
}
