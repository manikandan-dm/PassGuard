#!/usr/bin/env node
/** Static development transport only. No credential endpoints, access logs,
 * request-body parsing, persistence, directory listing, or runtime npm packages.
 */
import { createServer } from 'node:http';
import { open, readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipeline } from 'node:stream';
import { HEALTH_PATH, HEALTH_BODY, LocalStartupError, inspectLocalPort, startupArguments, openLocalBrowser } from './local-startup.mjs';

export const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
});
const HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});
const HELP = `PassGuard local development server\n\nUsage: npm start [-- --open] [-- --port 3000] [-- --host 127.0.0.1]\n       npm run dev\n       ./start-passguard.sh [--no-open]\n\nDefault: http://localhost:3000, bound to loopback 127.0.0.1.\nA verified existing PassGuard instance is reused; another application causes\na clear error. No duplicate server, automatic alternate port, or process kill.\nPORT / --port selects another port explicitly. HOST / --host selects a bind\naddress; 0.0.0.0 is only for an intentional trusted network/hosted preview.\n--open requests an OS browser when a graphical session is available.\n--no-open disables this request. Browser opening is never required.\n--require-new refuses reuse (for a supervised user service).\nStop the owning foreground terminal with Ctrl+C. No Arena is required.\n`;

export function readConfiguration({ env = process.env, args = process.argv.slice(2) } = {}) {
  let port = env.PORT;
  let host = env.HOST || '127.0.0.1';
  let help = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') help = true;
    else if (argument === '--port' || argument === '--host') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new LocalStartupError('Provide a value after --port or --host.');
      if (argument === '--port') port = value;
      else host = value;
    } else if (argument.startsWith('--port=')) port = argument.slice(7);
    else if (argument.startsWith('--host=')) host = argument.slice(7);
    else throw new LocalStartupError('Unknown option. Supported options: --port, --host, --help.');
  }
  if (port !== undefined && (!/^\d+$/.test(String(port)) || Number(port) < 1 || Number(port) > 65535)) {
    throw new LocalStartupError('PORT / --port must be an integer from 1 to 65535.');
  }
  if (!ALLOWED_HOSTS.has(host)) throw new LocalStartupError('HOST / --host must be 127.0.0.1, localhost, ::1, or 0.0.0.0.');
  return { host, ports: port === undefined ? [3000] : [Number(port)], help };
}

function isPublicFile(name) {
  const parts = name.split('/');
  if (parts.some(part => !part || part.startsWith('.'))) return false;
  if (name === 'index.html') return true;
  const extension = extname(name).toLowerCase();
  if (parts[0] === 'css') return extension === '.css';
  if (parts[0] === 'js') return ['.js', '.mjs'].includes(extension);
  return parts[0] === 'assets' && Boolean(MIME_TYPES[extension]) && !['.html', '.js', '.mjs', '.css'].includes(extension);
}
function sendError(request, response, status, message) {
  if (response.destroyed || response.headersSent) return;
  const text = `${message}\n`;
  response.writeHead(status, {
    ...HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    ...(status === 405 ? { Allow: 'GET, HEAD' } : {}),
  });
  response.end(request.method === 'HEAD' ? undefined : text);
}
function decodePublicPath(target = '/') {
  if (target.length > 8192) return { status: 414, message: 'Request target too long.' };
  if (!target.startsWith('/') || target.startsWith('//')) return { status: 400, message: 'Invalid request path.' };
  let decoded;
  try { decoded = decodeURIComponent(target.split(/[?#]/, 1)[0]); }
  catch { return { status: 400, message: 'Invalid request path.' }; }
  if (/[\\\u0000-\u001f\u007f]/u.test(decoded) || decoded.split('/').some(part => part === '..' || part === '.')) {
    return { status: 403, message: 'Path not permitted.' };
  }
  const name = decoded === '/' ? 'index.html' : ['/favicon.ico', '/favicon.svg'].includes(decoded) ? 'assets/favicon.svg' : decoded.slice(1);
  return isPublicFile(name) ? { name } : { status: 404, message: 'File not found.' };
}
function createStaticHandler(root) {
  return async (request, response) => {
    // Discard unsupported bodies without storing, parsing, echoing, or logging.
    request.resume();
    if (!['GET', 'HEAD'].includes(request.method)) return sendError(request, response, 405, 'Only GET and HEAD are supported.');
    if (request.url.split(/[?#]/, 1)[0] === HEALTH_PATH) {
      response.writeHead(200, { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(HEALTH_BODY) });
      response.end(request.method === 'HEAD' ? undefined : HEALTH_BODY);
      return;
    }
    const target = decodePublicPath(request.url);
    if (!target.name) return sendError(request, response, target.status, target.message);
    let file;
    try {
      const resolvedFile = await realpath(resolve(root, target.name));
      const inside = relative(root, resolvedFile);
      if (inside.startsWith('..') || isAbsolute(inside) || !isPublicFile(inside.split('\\').join('/'))) {
        return sendError(request, response, 403, 'Path not permitted.');
      }
      file = await open(resolvedFile, 'r');
      const details = await file.stat();
      if (!details.isFile()) {
        await file.close(); file = null;
        return sendError(request, response, 404, 'File not found.');
      }
      response.writeHead(200, { ...HEADERS, 'Content-Type': MIME_TYPES[extname(resolvedFile).toLowerCase()], 'Content-Length': details.size });
      if (request.method === 'HEAD') { await file.close(); file = null; response.end(); return; }
      const stream = file.createReadStream(); file = null;
      pipeline(stream, response, () => {});
    } catch (error) {
      if (file) await file.close().catch(() => {});
      if (response.headersSent) { response.destroy(); return; }
      sendError(request, response, error.code === 'EACCES' ? 403 : error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500, error.code === 'EACCES' ? 'File access denied.' : error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 'File not found.' : 'Unable to serve this file.');
    }
  };
}

/** Exported for native HTTP tests; port 0 is allowed here for isolated test listeners. */
export async function startStaticServer({ root = PROJECT_ROOT, host = '127.0.0.1', ports = [3000], log = console.log } = {}) {
  if (!ALLOWED_HOSTS.has(host)) throw new Error('Unsupported local bind address.');
  if (!Array.isArray(ports) || !ports.length || ports.some(port => !Number.isInteger(port) || port < 0 || port > 65535)) throw new Error('Invalid server port configuration.');
  const realRoot = await realpath(root);
  if (!(await stat(resolve(realRoot, 'index.html'))).isFile()) throw new Error('The project root must contain index.html.');
  for (const [index, port] of ports.entries()) {
    const server = createServer({ headersTimeout: 10000, requestTimeout: 10000, keepAliveTimeout: 5000 }, createStaticHandler(realRoot));
    try {
      await new Promise((accept, reject) => {
        const onError = error => { server.off('listening', onListen); reject(error); };
        const onListen = () => { server.off('error', onError); accept(); };
        server.once('error', onError); server.once('listening', onListen); server.listen(port, host);
      });
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      log(`Port ${port} is in use.${index + 1 < ports.length ? ' Trying the next explicitly configured port.' : ' No automatic alternate port will be chosen.'}`);
      continue;
    }
    const actualPort = server.address().port;
    const localHost = host === '::1' ? '[::1]' : 'localhost';
    const url = `http://${localHost}:${actualPort}`;
    log(`\nPassGuard — local development server\n  Project: ${realRoot}\n  Local:   ${url}\n  Bound:   ${host}:${actualPort}\n  Stop:    Ctrl+C\n`);
    if (host === '0.0.0.0') log('Network binding enabled explicitly. Use the default loopback binding for local-only access.');
    return { server, host, port: actualPort, url, root: realRoot };
  }
  const error = new Error('No configured port is available. Select a free port explicitly.');
  error.code = 'EADDRINUSE';
  throw error;
}

/** Idempotent CLI startup: never kill a process or silently change ports. */
export async function startOrReuseServer({ root = PROJECT_ROOT, host = '127.0.0.1', port = 3000, requireNew = false, log = console.log } = {}) {
  if (!ALLOWED_HOSTS.has(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new LocalStartupError('Invalid local server configuration.');
  const expectedHomepage = await readFile(resolve(root, 'index.html'));
  const url = `http://${host === '::1' ? '[::1]' : 'localhost'}:${port}`;
  const inspect = () => inspectLocalPort({ host, port, expectedHomepage });
  const reused = result => {
    if (result.status !== 'passguard') return null;
    if (requireNew) throw new LocalStartupError(`PassGuard is already running on port ${port}. Stop its owning terminal/service before starting this supervised instance.`, 73);
    log(`PassGuard is already running.\n  Local:   ${url}\n  No duplicate server was started. Stop/restart it in its original terminal or user service.`);
    return { server: null, port, host, url, reused: true, recognition: result.recognition };
  };
  const conflict = () => new LocalStartupError(`Port ${port} is occupied by another application or an unverified listener. PassGuard was not started. No process was killed or alternate port selected. Inspect the listener, stop it only if appropriate, or choose a different --port explicitly.`, 73);
  const before = await inspect();
  const existing = reused(before);
  if (existing) return existing;
  if (before.status !== 'available') throw conflict();
  try {
    return { ...await startStaticServer({ root, host, ports: [port], log }), reused: false };
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    // Another launcher may have won between probing and bind. Verify it instead
    // of assuming every EADDRINUSE means PassGuard, or launching on another port.
    const after = await inspect();
    const winner = reused(after);
    if (winner) return winner;
    throw conflict();
  }
}

export async function main() {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new LocalStartupError('PassGuard requires Node.js 20 or newer on this computer.');
  const startup = startupArguments(process.argv.slice(2));
  const configuration = readConfiguration({ args: startup.serverArgs });
  if (configuration.help) { console.log(HELP); return; }
  const instance = await startOrReuseServer({ host: configuration.host, port: configuration.ports[0], requireNew: startup.requireNew });
  if (instance.server) {
    const { server } = instance;
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      server.close(() => { console.log('PassGuard stopped.'); });
      server.closeAllConnections();
    };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }
  if (startup.open) await openLocalBrowser(instance.url);
}
const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) main().catch(error => {
  // Only static/validated configuration errors; never requests, bodies or input.
  console.error(error instanceof LocalStartupError ? error.message : 'PassGuard could not start. Check Node 20+, project files and local permissions. Use --help for options.');
  process.exitCode = error instanceof LocalStartupError ? error.exitCode : 1;
});
