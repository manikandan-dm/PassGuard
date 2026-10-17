import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { readFile, mkdir, mkdtemp, copyFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EventEmitter } from 'node:events';
import { PROJECT_ROOT, startStaticServer, startOrReuseServer } from '../scripts/dev-server.mjs';
import { HEALTH_PATH, HEALTH_RECORD, HEALTH_BODY, localConnectionState, probePassGuard, inspectLocalPort, startupArguments, browserCommands, openLocalBrowser } from '../scripts/local-startup.mjs';
const execute = promisify(execFile);
const homepage = await readFile(join(PROJECT_ROOT,'index.html'));
const cli = join(PROJECT_ROOT,'scripts/dev-server.mjs');
async function close(server) {
  const done=new Promise(resolve=>server.close(resolve));server.closeAllConnections();await done;
}
async function fixture(t, handler, host='127.0.0.1') {
  const server=createServer(handler);
  await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,host,accept);});
  t.after(()=>close(server));return {server,port:server.address().port};
}
async function freePort() {
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;await close(server);return port;
}
async function transport(t) {
  const result=await startStaticServer({ports:[0],log:()=>{}});t.after(()=>close(result.server));return result;
}
function get(port,path='/',method='GET') {
  return new Promise((accept,reject)=>{
    const req=request({hostname:'127.0.0.1',port,path,method,agent:false},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);
      res.on('end',()=>accept({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));
    });req.on('error',reject);req.end();
  });
}
function processFixture(t, command, args, options={}) {
  const child=spawn(command,args,{cwd:tmpdir(),env:{...process.env,HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe'],...options});
  const result={child,stdout:'',stderr:''};
  let readyResolve,readyReject;
  const ready=new Promise((accept,reject)=>{readyResolve=accept;readyReject=reject;});
  // Attach immediately; a failure cannot leave an unhandled promise or child.
  ready.catch(()=>{});
  const timer=setTimeout(()=>readyReject(new Error('Local launcher did not print a confirmed URL.')),8000);
  child.stdout.on('data',chunk=>{result.stdout+=chunk;if(result.stdout.includes('Local:')){clearTimeout(timer);readyResolve();}});
  child.stderr.on('data',chunk=>{result.stderr+=chunk;});
  result.exited=new Promise((accept,reject)=>{
    child.once('error',error=>{clearTimeout(timer);readyReject(error);reject(error);});
    child.once('close',(code,signal)=>{clearTimeout(timer);if(!result.stdout.includes('Local:'))readyReject(new Error('Launcher exited before serving/reusing PassGuard.'));accept({code,signal});});
  });
  result.ready=ready;
  t.after(async()=>{
    clearTimeout(timer);
    if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
    const force=setTimeout(()=>child.kill('SIGKILL'),2000);
    try {await result.exited;} finally {clearTimeout(force);}
  });
  return result;
}

test('startup flags enable optional browser opening and supervisor-only ownership without changing server arguments',()=>{
  assert.deepEqual(startupArguments(['--open','--port','3000','--no-open','--require-new']),{serverArgs:['--port','3000'],open:false,requireNew:true});
  assert.equal(startupArguments(['--no-open','--open']).open,true);
});
test('read-only server identity supports GET/HEAD and reveals no root, PID or credential data',async t=>{
  const {port}=await transport(t);
  const response=await get(port,HEALTH_PATH);
  assert.equal(response.status,200);assert.deepEqual(JSON.parse(response.body),HEALTH_RECORD);
  assert.deepEqual(Object.keys(JSON.parse(response.body)).sort(),['application','protocol','service']);
  assert.match(response.headers['content-type'],/^application\/json/);assert.equal(response.headers['cache-control'],'no-store');
  const head=await get(port,HEALTH_PATH,'HEAD');assert.equal(head.status,200);assert.equal(head.body,'');assert.equal(Number(head.headers['content-length']),Buffer.byteLength(HEALTH_BODY));
  const post=await get(port,HEALTH_PATH,'POST');assert.equal(post.status,405);
});
test('disabled IPv6 does not falsely block IPv4 startup; reset/permission/unknown listeners remain conflicts',()=>{
  for(const code of ['ENETUNREACH','EADDRNOTAVAIL','EAFNOSUPPORT','EPROTONOSUPPORT'])assert.equal(localConnectionState(code,'::1'),'available');
  for(const code of ['ENETUNREACH','EADDRNOTAVAIL','ECONNRESET','ETIMEDOUT','EACCES','UNKNOWN'])assert.equal(localConnectionState(code,'127.0.0.1'),'occupied');
  for(const code of ['ECONNRESET','ETIMEDOUT','EACCES','UNKNOWN'])assert.equal(localConnectionState(code,'::1'),'occupied');
});
test('free local ports are classified available',async()=>{
  const result=await probePassGuard({host:'127.0.0.1',port:await freePort(),expectedHomepage:homepage});assert.equal(result.status,'available');
});
test('running current PassGuard is identified without starting another server',async t=>{
  const {port}=await transport(t);
  const result=await probePassGuard({host:'127.0.0.1',port,expectedHomepage:homepage});
  assert.deepEqual(result,{status:'passguard',recognition:'identity-endpoint'});
});
test('legacy PassGuard is recognized only by exact local homepage bytes, not an HTML title',async t=>{
  const {port}=await fixture(t,(req,res)=>{
    if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(homepage);}
    else {res.writeHead(404,{'Content-Type':'text/plain'});res.end('not found');}
  });
  assert.deepEqual(await probePassGuard({host:'127.0.0.1',port,expectedHomepage:homepage}),{status:'passguard',recognition:'exact-legacy-homepage'});
});
test('another app named PassGuard is not mistaken for this project',async t=>{
  const {port}=await fixture(t,(req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<title>PassGuard</title><p>Unrelated synthetic application</p>');});
  assert.equal((await probePassGuard({host:'127.0.0.1',port,expectedHomepage:homepage})).status,'occupied');
});
test('malformed/wrong identity JSON is not trusted',async t=>{
  let identity={...HEALTH_RECORD,protocol:999};
  const {port}=await fixture(t,(req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(identity));});
  for(const value of [{...HEALTH_RECORD,protocol:999},{...HEALTH_RECORD,application:'Other'},null]){
    identity=value;assert.equal((await probePassGuard({host:'127.0.0.1',port,expectedHomepage:homepage})).status,'occupied');
  }
});
test('startup probes never follow redirects',async t=>{
  let destinationRequests=0;
  const destination=await fixture(t,(req,res)=>{destinationRequests++;res.end('synthetic destination');});
  const {port}=await fixture(t,(req,res)=>{res.writeHead(302,{Location:`http://127.0.0.1:${destination.port}/`});res.end();});
  assert.equal((await probePassGuard({host:'127.0.0.1',port,expectedHomepage:homepage})).status,'occupied');assert.equal(destinationRequests,0);
});
test('silent/non-HTTP listeners time out safely instead of being treated as free',async t=>{
  const {port}=await fixture(t,()=>{});
  const result=await probePassGuard({host:'127.0.0.1',port,expectedHomepage:homepage,timeoutMs:60});assert.equal(result.status,'occupied');
});
test('oversized identity responses are bounded and do not become PassGuard',async t=>{
  const {port}=await fixture(t,(req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end('X'.repeat(8192));});
  assert.equal((await probePassGuard({host:'127.0.0.1',port,expectedHomepage:homepage})).status,'occupied');
});
test('probe targets are restricted to validated local addresses and ports',async()=>{
  for(const options of [{host:'example.invalid',port:3000},{host:'127.0.0.1',port:0},{host:'127.0.0.1',port:65536}])await assert.rejects(probePassGuard({...options,expectedHomepage:homepage}),/Invalid local probe/);
  await assert.rejects(probePassGuard({host:'127.0.0.1',port:3000}),/fingerprint/);
});
test('localhost startup detects an IPv6-only foreign listener as a conflict',async t=>{
  let instance;
  try {instance=await fixture(t,(req,res)=>res.end('synthetic foreign IPv6 service'),'::1');}
  catch(error){if(['EAFNOSUPPORT','EADDRNOTAVAIL'].includes(error.code)){t.skip('IPv6 loopback is unavailable on this host.');return;}throw error;}
  assert.equal((await inspectLocalPort({host:'127.0.0.1',port:instance.port,expectedHomepage:homepage})).status,'occupied');
});
test('idempotent local startup creates one loopback listener and reuses it thereafter',async t=>{
  const port=await freePort();const first=await startOrReuseServer({port,log:()=>{}});t.after(()=>close(first.server));
  assert.equal(first.reused,false);assert.equal(first.server.address().address,'127.0.0.1');
  const second=await startOrReuseServer({port,log:()=>{}});
  assert.equal(second.reused,true);assert.equal(second.server,null);assert.equal(second.port,port);
  assert.equal((await get(port)).status,200);
});
test('a foreign application is left untouched and produces an explicit CLI conflict (exit 73)',async t=>{
  const {port}=await fixture(t,(req,res)=>res.end('synthetic foreign application'));
  await assert.rejects(startOrReuseServer({port,log:()=>{}}),error=>error.exitCode===73&&/another application/.test(error.message));
  await assert.rejects(execute(process.execPath,[cli,'--port',String(port)],{env:{...process.env,HOST:'127.0.0.1'},timeout:5000}),error=>error.code===73&&/occupied by another application/.test(error.stderr)&&!error.stdout.includes('Local:'));
  assert.equal((await get(port)).body,'synthetic foreign application');
});
test('second CLI startup exits successfully without owning or stopping the original instance',async t=>{
  const {port}=await transport(t);
  const result=await execute(process.execPath,[cli,'--port',String(port),'--no-open'],{env:{...process.env,HOST:'127.0.0.1'},timeout:5000});
  assert.match(result.stdout,/already running/);assert.match(result.stdout,/No duplicate/);assert.equal(result.stderr,'');
  assert.equal((await get(port)).status,200);
});
test('supervised require-new mode refuses to adopt another process and never kills it',async t=>{
  const {port}=await transport(t);
  await assert.rejects(execute(process.execPath,[cli,'--port',String(port),'--require-new'],{env:{...process.env,HOST:'127.0.0.1'},timeout:5000}),error=>error.code===73&&/already running/.test(error.stderr));
  assert.equal((await get(port)).status,200);
});
test('two simultaneous cold CLI starts converge to one server and one successful reuse',async t=>{
  const port=await freePort();
  const a=processFixture(t,process.execPath,[cli,'--port',String(port),'--no-open']);
  const b=processFixture(t,process.execPath,[cli,'--port',String(port),'--no-open']);
  await Promise.all([a.ready,b.ready]);
  const firstExit=await Promise.race([a.exited.then(result=>({which:a,result})),b.exited.then(result=>({which:b,result}))]);
  assert.equal(firstExit.result.code,0);assert.match(firstExit.which.stdout,/already running/);
  const owner=firstExit.which===a?b:a;assert.match(owner.stdout,/Bound:/);assert.equal(owner.child.exitCode,null);
  assert.equal((await get(port)).status,200);
  owner.child.kill('SIGINT');assert.deepEqual(await owner.exited,{code:0,signal:null});assert.match(owner.stdout,/PassGuard stopped/);
});
test('Linux shell launcher works from another cwd/path with spaces, overrides inherited bind defaults, reuses, stops and restarts',{skip:process.platform==='win32'},async t=>{
  const root=await mkdtemp(join(tmpdir(),'passguard shell path with spaces-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'scripts'));
  for(const file of ['dev-server.mjs','local-startup.mjs'])await copyFile(join(PROJECT_ROOT,'scripts',file),join(root,'scripts',file));
  await copyFile(join(PROJECT_ROOT,'start-passguard.sh'),join(root,'start-passguard.sh'));
  await writeFile(join(root,'index.html'),'<!doctype html><title>synthetic local wrapper fixture</title>');
  const port=await freePort();const args=[join(root,'start-passguard.sh'),'--no-open','--port',String(port)];
  const env={...process.env,HOST:'0.0.0.0',PORT:'SYNTHETIC-BAD-ENV'};
  const first=processFixture(t,'bash',args,{env});await first.ready;
  assert.ok(first.stdout.includes(`Bound:   127.0.0.1:${port}`));
  const reused=await execute('bash',args,{cwd:tmpdir(),env,timeout:5000});assert.match(reused.stdout,/already running/);
  first.child.kill('SIGINT');assert.deepEqual(await first.exited,{code:0,signal:null});
  const restarted=processFixture(t,'bash',args,{env});await restarted.ready;assert.equal((await get(port)).status,200);
  restarted.child.kill('SIGTERM');assert.deepEqual(await restarted.exited,{code:0,signal:null});
});
test('OS wrappers and optional service are quoted, local-only by default, and do not install packages',async()=>{
  const shell=await readFile(join(PROJECT_ROOT,'start-passguard.sh'),'utf8');const batch=await readFile(join(PROJECT_ROOT,'start-passguard.bat'),'utf8');
  assert.match(shell,/exec node/);assert.match(shell,/--host 127\.0\.0\.1 --port 3000 --open/);assert.match(shell,/"\$@"/);
  if(process.platform!=='win32')assert.ok((await stat(join(PROJECT_ROOT,'start-passguard.sh'))).mode&0o111);
  assert.match(batch,/"%~dp0scripts\\dev-server\.mjs"/);assert.match(batch,/pushd "%~dp0"/);assert.match(batch,/--host 127\.0\.0\.1 --port 3000 --open/);
  assert.ok(!/^\s*(?:sudo\s+)?npm\s+(?:install|ci)/m.test(shell));
  const unit=await readFile(join(PROJECT_ROOT,'docs/systemd/passguard.service.example'),'utf8');
  assert.match(unit,/--require-new --no-open/);assert.match(unit,/RestartPreventExitStatus=73/);assert.match(unit,/--host 127\.0\.0\.1 --port 3000/);
});
test('browser commands are native OS helpers, optional in headless/CI, and reject remote/credential URLs',()=>{
  const url='http://localhost:3000';
  assert.deepEqual(browserCommands({url,platform:'linux',env:{}}),[]);
  assert.deepEqual(browserCommands({url,platform:'linux',env:{DISPLAY:':1',CI:'true'}}),[]);
  assert.deepEqual(browserCommands({url,platform:'linux',env:{DISPLAY:':1'}}).map(item=>item.command),['xdg-open','gio']);
  assert.equal(browserCommands({url,platform:'darwin',env:{}})[0].command,'open');
  assert.deepEqual(browserCommands({url,platform:'win32',env:{}})[0],{command:'cmd.exe',args:['/d','/c','start','',url]});
  for(const invalid of ['https://example.invalid','http://user:synthetic@localhost:3000','http://localhost:3000/?synthetic=value','http://localhost:3000\n'])assert.throws(()=>browserCommands({url:invalid,platform:'linux',env:{DISPLAY:':1'}}));
});
test('browser opening uses argv without a shell, falls back safely, and never becomes a server dependency',async()=>{
  const calls=[];let unref=0;
  const spawnProcess=(command,args,options)=>{
    calls.push({command,args,options});const child=new EventEmitter();child.unref=()=>{unref++;};
    process.nextTick(()=>command==='xdg-open'?child.emit('error',new Error('synthetic missing helper')):child.emit('spawn'));
    return child;
  };
  assert.equal(await openLocalBrowser('http://localhost:3000',{platform:'linux',env:{DISPLAY:':1'},spawnProcess,log:()=>{}}),true);
  assert.deepEqual(calls.map(item=>item.command),['xdg-open','gio']);assert.equal(unref,1);assert.equal(calls[0].options.shell,undefined);
  const never=()=>{throw new Error('A headless server must not try to open a browser.');};
  assert.equal(await openLocalBrowser('http://localhost:3000',{platform:'linux',env:{},spawnProcess:never,log:()=>{}}),false);
  assert.equal(await openLocalBrowser('http://localhost:3000',{platform:'linux',env:{DISPLAY:':1'},spawnProcess:()=>{throw new Error('synthetic opener failure');},log:()=>{}}),false);
});
