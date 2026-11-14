import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {patchSource,checkSource} from '../patches/dsh-win-bash-shell-gc/apply-shell-gc.mjs';

const root = process.env.WIN_BASH_FIXTURE_ROOT;
if (!root) throw new Error('Set WIN_BASH_FIXTURE_ROOT to verified official 0.4.8/ and 0.4.18/ package extracts; no tests silently skipped');
const manifest = JSON.parse(fs.readFileSync(new URL('./win-bash-fixtures.json',import.meta.url)));
const tick = async () => {for(let i=0;i<10;i++) await Promise.resolve();};
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function harness(source){
  let now=0;const timers=[];const killed=[];let terminateHook;
  const ctx={process:{env:{}},randomUUID:()=> 'id',markerFor:()=>({begin:'begin'}),buildFrame:()=>'',
    StreamTail:class{consumed(){return 0}visible(){return {text:'',truncated:false}}lost(){return false}wasCut(){return false}},
    readFrame:s=>{if(s.error)throw Error('read failed');return {text:'',outcome:s.ready?{stdout:'ok',exitCode:0}:undefined}},
    complete:o=>o,removeShellTempDir:async()=>{},recoverPartial:()=>'',tailBytes:()=>({text:'',truncated:false}),
    ShellUnavailableError:class extends Error{},POLL_INTERVAL_MS:1,
    setTimeout:r=>timers.push(r),terminate:async(s)=>{killed.push(s);if(terminateHook)await terminateHook(s)}};
  const start=source.indexOf('var ShellRegistry = class {');
  const end=source.indexOf('\n};',start)+3;
  assert(start>=0 && end>start);
  const C=vm.runInNewContext(source.slice(start,end)+';ShellRegistry',ctx);
  const r=new C({},()=>now);
  const shell=()=>({handle:{stdin:{write(){}}},cursor:{stdout:0,stderr:0},exited:false,exitCode:null,lastUsedAt:0});
  return {r,shell,killed,ctx,setNow:n=>{now=n},setTerminate:f=>{terminateHook=f},pump:async()=>{timers.splice(0).forEach(r=>r());await tick()}};
}
function applyUnified(source, patch) {
 let out=source;
 for(const hunk of patch.split(/^@@.*@@.*$/m).slice(1)) {
  const lines=hunk.split('\n').filter(l=> /^[ +\-]/.test(l));
  const before=lines.filter(l=>l[0]!=='+').map(l=>l.slice(1)).join('\n')+'\n';
  const after=lines.filter(l=>l[0]!=='-').map(l=>l.slice(1)).join('\n')+'\n';
  assert.equal(out.split(before).length-1,1,'legacy fixture anchor');out=out.replace(before,after);
 }
 return out;
}
for(const version of ['0.4.8','0.4.18']){
 const source=fs.readFileSync(path.join(root,version,'package/lib/index.js'),'utf8');
 assert.equal(createHash('sha256').update(source).digest('hex'),manifest[version].indexSha256);
 const patched=patchSource(source);
 const legacy=applyUnified(source,fs.readFileSync(new URL(`./fixtures/b13-v1-${version}.patch`,import.meta.url),'utf8'));
 test(`${version}: deployment reference diff exactly matches v2 transformer`,()=>{
  const diff=fs.readFileSync(new URL(`../patches/dsh-win-bash-shell-gc/shell-gc@${version}.patch`,import.meta.url),'utf8');
  assert.equal(applyUnified(source,diff),patched);assert(diff.includes('activeRuns'));
 });
 test(`${version}: real CLI isolated apply/check/revert preserves old backups`,()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'b13-cli-'));const target=path.join(dir,'index.js');
  const script=fileURLToPath(new URL('../patches/dsh-win-bash-shell-gc/apply-shell-gc.mjs',import.meta.url));
  const cli=(...args)=>spawnSync(process.execPath,[script,'--target',target,...args],{encoding:'utf8'});
  try {
   fs.writeFileSync(target,legacy);fs.writeFileSync(target+'.pristine-shell-gc','older version backup');
   assert.equal(cli('--check').status,1);assert.equal(fs.readFileSync(target,'utf8'),legacy);
   assert.equal(cli().status,0);assert(checkSource(fs.readFileSync(target,'utf8')));
   assert.equal(fs.readFileSync(target+'.before-shell-gc-v2','utf8'),legacy);
   assert.equal(fs.readFileSync(target+'.pristine-shell-gc','utf8'),'older version backup');
   assert.equal(cli('--check').status,0);assert.equal(cli().status,0);
   assert.equal(cli('--revert').status,0);assert.equal(fs.readFileSync(target,'utf8'),legacy);
   fs.writeFileSync(target,source);assert.equal(cli().status,1);
   assert.equal(fs.readFileSync(target,'utf8'),source);assert.equal(fs.readFileSync(target+'.before-shell-gc-v2','utf8'),legacy);
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
 });
 test(`${version}: v1-to-v2 migration and incomplete v1 rejection`,()=>{
  assert.equal(checkSource(legacy),false);const migrated=patchSource(legacy);assert(checkSource(migrated));assert.equal(patchSource(migrated),migrated);
  assert.throws(()=>patchSource(legacy.replace('await this.sweepIdle(owner);','/* removed sweep */')),/Incomplete B13 v1/);
 });
 test(`${version}: old-fails/new-passes active command counterexample`,async()=>{
  for(const [src,expectedKills] of [[legacy,1],[patched,0]]){
   const h=harness(src),owner={},s=h.shell();h.r.shells.set(owner,s);h.r.ensure=async()=>s;
   const p=h.r.run(owner,{},'.','long',{timeoutMs:10000000});await tick();h.setNow(40*60000);
   await h.r.sweepIdle({});assert.equal(h.killed.length,expectedKills);s.ready=true;await h.pump();await p;
  }
 });
 test(`${version}: exact upstream patches, strict check, idempotent, CRLF`,()=>{
  assert.equal(checkSource(source),false);assert(checkSource(patched));assert.equal(patchSource(patched),patched);
  assert(checkSource(patchSource(source.replace(/\n/g,'\r\n'))));
  assert.equal(checkSource('/* B13 active-run lease v2 */'),false);
  assert.throws(()=>patchSource('/* B13 active-run lease v2 */'),/Incomplete/);
  assert.throws(()=>patchSource(source.replace('async run(owner','async changed(owner')),/anchor/);
 });
 test(`${version}: idle/exited reclaimed; recent and calling owner kept`,async()=>{
  const h=harness(patched),a={},b={},c={},d={};
  for(const owner of [a,b,c,d])h.r.shells.set(owner,h.shell());
  h.r.shells.get(c).lastUsedAt=35*60000;h.r.shells.get(d).exited=true;
  h.setNow(40*60000);await h.r.sweepIdle(b);
  assert(!h.r.shells.has(a));assert(h.r.shells.has(b));assert(h.r.shells.has(c));assert(!h.r.shells.has(d));assert.equal(h.killed.length,2);
 });
 test(`${version}: lease acquired before ensure's first yield protects stale shell`,async()=>{
  const h=harness(patched),owner={},other={},s=h.shell(),wait=deferred();h.r.shells.set(owner,s);h.setNow(40*60000);
  h.r.ensure=()=>wait.promise;const run=h.r.run(owner,{},'.','cmd',{timeoutMs:10000000});
  assert.equal(h.r.activeRuns.get(owner),1);await h.r.sweepIdle(other);assert.equal(h.killed.length,0);
  wait.resolve(s);await tick();h.setNow(80*60000);await h.r.sweepIdle(other);assert.equal(h.killed.length,0);
  s.ready=true;await h.pump();await run;assert.equal(h.r.activeRuns.size,0);assert.equal(s.lastUsedAt,80*60000);
 });
 test(`${version}: same owner overlap retains lease until both return`,async()=>{
  const h=harness(patched),owner={},s=h.shell();h.r.shells.set(owner,s);const waits=[deferred(),deferred()];let i=0;
  h.r.ensure=()=>waits[i++].promise;const p1=h.r.run(owner,{},'.','a',{}),p2=h.r.run(owner,{},'.','b',{});
  assert.equal(h.r.activeRuns.get(owner),2);s.ready=true;waits[0].resolve(s);await p1;assert.equal(h.r.activeRuns.get(owner),1);
  h.setNow(60*60000);await h.r.sweepIdle({});assert.equal(h.killed.length,0);waits[1].resolve(s);await p2;assert.equal(h.r.activeRuns.size,0);
 });
 test(`${version}: failed ensure releases lease`,async()=>{
  const h=harness(patched);h.r.ensure=async()=>{throw Error('ensure failed')};await assert.rejects(h.r.run({}, {},'.','x',{}),/ensure failed/);assert.equal(h.r.activeRuns.size,0);
 });
 test(`${version}: read exception releases lease and refreshes only same shell`,async()=>{
  const h=harness(patched),o={},s=h.shell();s.error=true;h.r.shells.set(o,s);h.r.ensure=async()=>s;h.setNow(17);
  await assert.rejects(h.r.run(o,{},'.','x',{}),/read failed/);assert.equal(h.r.activeRuns.size,0);assert.equal(s.lastUsedAt,17);
  assert.equal(s.gcUncertain,true);h.setNow(40*60000);await h.r.sweepIdle({});assert.equal(h.killed.length,0);
  s.error=false;s.ready=true;await h.r.run(o,{},'.','recovered',{});assert.equal(s.gcUncertain,true);
  h.setNow(80*60000);await h.r.sweepIdle({});assert.equal(h.killed.length,0);
  s.exited=true;await h.r.sweepIdle({});assert.equal(h.killed.length,1);
 });
 test(`${version}: concurrent successful run cannot clear another unknown run`,async()=>{
  const h=harness(patched),o={},s=h.shell(),a=deferred(),b=deferred();let i=0;h.r.shells.set(o,s);h.r.ensure=()=>[a,b][i++].promise;
  const p1=h.r.run(o,{},'.','a',{}),p2=h.r.run(o,{},'.','b',{});s.error=true;a.resolve(s);await assert.rejects(p1,/read failed/);
  s.error=false;s.ready=true;b.resolve(s);await p2;assert.equal(s.gcUncertain,true);h.setNow(60*60000);await h.r.sweepIdle({});assert.equal(h.killed.length,0);
 });
 test(`${version}: unknown exited shell can be reclaimed`,async()=>{
  const h=harness(patched),o={},s=h.shell();s.gcUncertain=true;s.exited=true;h.r.shells.set(o,s);await h.r.sweepIdle({});assert.equal(h.killed.length,1);
 });
 test(`${version}: serialization error after observed outcome does not invent an active command`,async()=>{
  const h=harness(patched),o={},s=h.shell();s.ready=true;h.r.shells.set(o,s);h.r.ensure=async()=>s;h.ctx.complete=()=>{throw Error('format failed')};
  await assert.rejects(h.r.run(o,{},'.','x',{}),/format failed/);assert.equal(s.gcUncertain,undefined);assert.equal(h.r.activeRuns.size,0);
 });
 test(`${version}: timeout disposes through upstream path and releases lease`,async()=>{
  const h=harness(patched),o={},s=h.shell();h.r.shells.set(o,s);h.r.ensure=async()=>s;
  const p=h.r.run(o,{},'.','long',{timeoutMs:5});await tick();h.setNow(10);await h.pump();assert.equal((await p).exitCode,124);assert.equal(h.killed.length,1);assert.equal(h.r.activeRuns.size,0);assert(!h.r.shells.has(o));
 });
 test(`${version}: abort disposes through upstream path and releases lease`,async()=>{
  const h=harness(patched),o={},s=h.shell();h.r.shells.set(o,s);h.r.ensure=async()=>s;
  await assert.rejects(h.r.run(o,{},'.','long',{signal:{aborted:true}}));assert.equal(h.killed.length,1);assert.equal(h.r.activeRuns.size,0);
 });
 test(`${version}: sweep rechecks replacement identity after async termination`,async()=>{
  const h=harness(patched),a={},b={},sa=h.shell(),sb=h.shell(),replacement=h.shell(),wait=deferred();h.setNow(40*60000);
  h.r.shells.set(a,sa);h.r.shells.set(b,sb);h.setTerminate(s=>s===sa?wait.promise:undefined);
  const p=h.r.sweepIdle({});await tick();h.r.shells.set(b,replacement);wait.resolve();await p;
  assert.equal(h.r.shells.get(b),replacement);assert.deepEqual(h.killed,[sa]);
 });
 test(`${version}: sweep rechecks newly active owner after async termination`,async()=>{
  const h=harness(patched),a={},b={},sa=h.shell(),sb=h.shell(),wait=deferred();h.setNow(40*60000);
  h.r.shells.set(a,sa);h.r.shells.set(b,sb);h.setTerminate(s=>s===sa?wait.promise:undefined);
  const p=h.r.sweepIdle({});await tick();h.r.activeRuns.set(b,1);wait.resolve();await p;
  assert.equal(h.r.shells.get(b),sb);assert.deepEqual(h.killed,[sa]);
 });
 test(`${version}: finalizer does not refresh replacement`,async()=>{
  const h=harness(patched),o={},s=h.shell(),replacement=h.shell();h.r.shells.set(o,s);h.r.ensure=async()=>s;
  const p=h.r.run(o,{},'.','x',{timeoutMs:10000});await tick();h.r.shells.set(o,replacement);h.setNow(123);s.ready=true;await h.pump();await p;assert.equal(replacement.lastUsedAt,0);
 });
}
