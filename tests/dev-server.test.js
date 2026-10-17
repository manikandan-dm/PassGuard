import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { readFile, readdir, mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PROJECT_ROOT, readConfiguration, startStaticServer } from '../scripts/dev-server.mjs';
const execute = promisify(execFile);
const script = join(PROJECT_ROOT, 'scripts/dev-server.mjs');
async function stop(server) {
  const closed = new Promise(resolve => server.close(resolve));
  server.closeAllConnections(); await closed;
}
async function serve(t, options = {}) {
  const logs = [];
  const instance = await startStaticServer({ ports:[0], log:line => logs.push(line), ...options });
  t.after(() => stop(instance.server));
  return { ...instance, logs };
}
function get(port, path = '/', { method = 'GET', body, headers = {} } = {}) {
  return new Promise((accept, reject) => {
    const req = request({ hostname:'127.0.0.1', port, path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => { const bytes = Buffer.concat(chunks); accept({status:response.statusCode,headers:response.headers,text:bytes.toString('utf8'),bytes}); });
    });
    req.on('error', reject); req.end(body);
  });
}
async function occupy(t) {
  const server = createServer((req,res) => res.end('synthetic occupied-port fixture'));
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => stop(server)); return server.address().port;
}

test('localhost defaults are loopback with fixed port 3000 and no dependency on Python', () => {
  assert.deepEqual(readConfiguration({env:{},args:[]}),{host:'127.0.0.1',ports:[3000],help:false});
});
test('explicit environment and CLI ports are strict and CLI options override environment values', () => {
  assert.deepEqual(readConfiguration({env:{PORT:'8000'},args:[]}).ports,[8000]);
  assert.deepEqual(readConfiguration({env:{PORT:'8000',HOST:'0.0.0.0'},args:['--port','8001','--host','127.0.0.1']}),{host:'127.0.0.1',ports:[8001],help:false});
  assert.deepEqual(readConfiguration({env:{},args:['--port=8000','--host=localhost']}).ports,[8000]);
  assert.equal(readConfiguration({env:{},args:['--help']}).help,true);
});
test('invalid ports, hosts, and unknown or incomplete options fail without echoing input', () => {
  for (const port of ['0','-1','65536','3.5','','secret-not-a-port']) assert.throws(() => readConfiguration({env:{PORT:port},args:[]}),error => /integer/.test(error.message) && !error.message.includes('secret-not-a-port'));
  assert.throws(() => readConfiguration({env:{HOST:'untrusted-host.example'},args:[]}),/HOST/);
  assert.throws(() => readConfiguration({env:{},args:['--port']}),/value/);
  assert.throws(() => readConfiguration({env:{},args:['--unknown']}),/Unknown option/);
});
test('homepage and every current runtime asset are served from the project root with correct MIME', async t => {
  const {port,server} = await serve(t);
  assert.equal(server.address().address,'127.0.0.1');
  const assets = ['index.html',...(await readdir(join(PROJECT_ROOT,'css'))).filter(name=>name.endsWith('.css')).map(name=>`css/${name}`),...(await readdir(join(PROJECT_ROOT,'js'))).filter(name=>name.endsWith('.js')).map(name=>`js/${name}`),'assets/favicon.svg'];
  for (const asset of assets) {
    const result = await get(port,`/${asset}`);
    assert.equal(result.status,200,asset);
    assert.deepEqual(result.bytes,await readFile(join(PROJECT_ROOT,asset)),asset);
    assert.match(result.headers['content-type'],asset.endsWith('.js')?/^text\/javascript/:asset.endsWith('.css')?/^text\/css/:asset.endsWith('.svg')?/^image\/svg\+xml/:/^text\/html/);
    assert.equal(result.headers['x-content-type-options'],'nosniff');
    assert.equal(result.headers['cache-control'],'no-store');
  }
  assert.match((await get(port)).text,/<title>PassGuard/);
});
test('HEAD preserves content headers without a body and query strings do not change assets', async t => {
  const {port} = await serve(t);
  const result = await get(port,'/js/app.js?v=test',{method:'HEAD'});
  assert.equal(result.status,200); assert.equal(result.text,'');
  assert.equal(Number(result.headers['content-length']),(await readFile(join(PROJECT_ROOT,'js/app.js'))).length);
  assert.deepEqual((await get(port,'/css/style.css?cache=test')).bytes,await readFile(join(PROJECT_ROOT,'css/style.css')));
});
test('favicon aliases serve the existing SVG and preview Host headers are accepted', async t => {
  const {port} = await serve(t);
  for (const name of ['/favicon.ico','/favicon.svg','/assets/favicon.svg']) {
    const result = await get(port,name);
    assert.equal(result.status,200); assert.equal(result.headers['content-type'],'image/svg+xml');
  }
  assert.equal((await get(port,'/',{headers:{Host:'3000-passguard-check.e2b.app'}})).status,200);
});
test('missing assets and directory paths return 404, not a misleading HTML fallback', async t => {
  const {port} = await serve(t);
  for (const path of ['/js/missing.js','/assets/missing.png','/css/','/assets/','/analyzer']) {
    const result = await get(port,path);
    assert.equal(result.status,404); assert.match(result.headers['content-type'],/^text\/plain/);
    assert.ok(!result.text.includes('<html'));
  }
});
test('private configuration, tests, docs, scripts and node_modules are not exposed', async t => {
  const {port} = await serve(t);
  for (const path of ['/.env','/.git/config','/package.json','/README.md','/tests/analysis.test.js','/scripts/dev-server.mjs','/docs/unit-test-results.txt','/node_modules/playwright/package.json']) assert.equal((await get(port,path)).status,404,path);
});
test('encoded traversal, backslashes, null bytes and malformed encodings fail closed', async t => {
  const {port} = await serve(t);
  for (const path of ['/../index.html','/js/../index.html','/js/%2e%2e/README.md','/assets/%2e%2e%2findex.html','/js/%5c..%5cindex.html','/js/%00.js']) assert.equal((await get(port,path)).status,403,path);
  assert.equal((await get(port,'/assets/%ZZ')).status,400);
  assert.equal((await get(port,'//index.html')).status,400);
});
test('symlinks cannot escape the project or expose private files within it', async t => {
  const parent = await mkdtemp(join(tmpdir(),'passguard-server-fixture-'));
  t.after(()=>rm(parent,{recursive:true,force:true}));
  const root = join(parent,'site'); await mkdir(join(root,'assets'),{recursive:true});
  await writeFile(join(root,'index.html'),'<!doctype html><title>synthetic fixture</title>');
  await writeFile(join(parent,'outside.svg'),'synthetic outside fixture');
  await writeFile(join(root,'private.svg'),'synthetic private fixture');
  await symlink(join(parent,'outside.svg'),join(root,'assets/outside.svg'));
  await symlink(join(root,'private.svg'),join(root,'assets/private.svg'));
  const {port} = await serve(t,{root});
  assert.equal((await get(port,'/assets/outside.svg')).status,403);
  assert.equal((await get(port,'/assets/private.svg')).status,403);
});
test('unsupported request bodies are rejected; request paths and body text never enter logs', async t => {
  const {port,logs} = await serve(t);
  const sentinel='SYNTHETIC-REQUEST-DO-NOT-LOG';
  const result=await get(port,`/index.html?synthetic=${sentinel}`,{method:'POST',body:sentinel});
  assert.equal(result.status,405);assert.equal(result.headers.allow,'GET, HEAD');
  assert.ok(!result.text.includes(sentinel));
  const good=await get(port,`/index.html?synthetic=${sentinel}`);assert.equal(good.status,200);
  assert.ok(!JSON.stringify(logs).includes(sentinel));assert.ok(!JSON.stringify(logs).includes('?synthetic='));
});
test('occupied-port fallback prints only the URL of a successfully bound listener', async t => {
  const occupied=await occupy(t);
  const {port,url,logs}=await serve(t,{ports:[occupied,0]});
  assert.notEqual(port,occupied);assert.equal(url,`http://localhost:${port}`);
  assert.ok(logs.some(line=>line.includes(`Port ${occupied} is in use`)));
  assert.ok(logs.some(line=>line.includes(`Local:   ${url}`)));
  assert.equal((await get(port)).status,200);
});
test('explicit occupied ports fail instead of silently choosing another port', async t => {
  const occupied=await occupy(t);
  const options=readConfiguration({env:{PORT:String(occupied)},args:[]});
  await assert.rejects(startStaticServer({...options,log:()=>{}}),/No configured port/);
});
test('CLI serves the script-relative root from another working directory and stops on Ctrl+C', async t => {
  const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;await stop(reservation);
  const child=spawn(process.execPath,[script,'--port',String(port)],{cwd:tmpdir(),env:{...process.env,HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM');});
  let output='';let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
  const exited=new Promise((accept,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>accept({code,signal}));});
  await new Promise((accept,reject)=>{
    const timer=setTimeout(()=>reject(new Error('CLI startup did not print a URL.')),8000);
    child.stdout.on('data',chunk=>{output+=chunk;if(output.includes(`Local:   http://localhost:${port}`)){clearTimeout(timer);accept();}});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);if(!output.includes('Local:'))reject(new Error(`CLI exited before startup (${code}).`));});
  });
  assert.match((await get(port)).text,/PassGuard/);
  child.kill('SIGINT');
  assert.deepEqual(await exited,{code:0,signal:null});assert.equal(errors,'');assert.match(output,/PassGuard stopped/);
});
test('CLI help works and invalid settings fail without printing untrusted values', async () => {
  const help=await execute(process.execPath,[script,'--help'],{cwd:tmpdir(),env:{...process.env,PORT:'3000',HOST:'127.0.0.1'}});
  assert.match(help.stdout,/3000/);assert.match(help.stdout,/Ctrl\+C/);
  await assert.rejects(execute(process.execPath,[script,'--port','SYNTHETIC-INVALID-VALUE'],{cwd:tmpdir(),env:{...process.env,HOST:'127.0.0.1'}}),error=>error.code===1 && !error.stderr.includes('SYNTHETIC-INVALID-VALUE'));
});
test('npm dev/start share the zero-dependency launcher and targeted tests are configured', async () => {
  const manifest=JSON.parse(await readFile(join(PROJECT_ROOT,'package.json'),'utf8'));
  assert.equal(manifest.scripts.dev,'node scripts/dev-server.mjs');
  assert.equal(manifest.scripts.start,manifest.scripts.dev);
  assert.ok(manifest.scripts['test:firefox']);
  assert.equal(Object.keys(manifest.dependencies||{}).length,0);
});
