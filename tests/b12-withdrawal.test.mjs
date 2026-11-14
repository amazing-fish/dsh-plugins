import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {BASELINE,inspect} from '../patches/dsh-context/patch-0.84.1.mjs';
const root=process.env.B12_FIXTURE_ROOT;
assert.ok(root,'B12_FIXTURE_ROOT must point to official 0.84.1 lib directory; no silent skip');
assert.equal(inspect(root).fullDataBaseline,true,'official fixture hashes must match');
const script=fileURLToPath(new URL('../patches/dsh-context/patch-0.84.1.mjs',import.meta.url));
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'b12-'));try{for(const name of Object.keys(BASELINE))fs.copyFileSync(path.join(root,name),path.join(dir,name));return fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
function run(dir,args){return spawnSync(process.execPath,[script,...args,'--lib',dir],{encoding:'utf8'});}
function snapshot(dir){return fs.readdirSync(dir).sort().map(n=>[n,fs.readFileSync(path.join(dir,n)).toString('base64')]);}
test('check exact pair reports full data, never optimization',()=>fixture(dir=>{const before=snapshot(dir),r=run(dir,['--check']);assert.equal(r.status,0);assert.match(r.stdout,/FULL_DATA_UNPATCHED/);assert.doesNotMatch(r.stdout,/APPLIED/);assert.deepEqual(snapshot(dir),before);}));
test('default deployment refused without writes',()=>fixture(dir=>{const before=snapshot(dir),r=run(dir,[]);assert.equal(r.status,1);assert.match(r.stderr,/slimming is withdrawn/);assert.deepEqual(snapshot(dir),before);}));
test('revert refuses blind backup copy',()=>fixture(dir=>{fs.writeFileSync(path.join(dir,'index.js.pristine-slim'),'untrusted backup');const before=snapshot(dir),r=run(dir,['--revert']);assert.equal(r.status,1);assert.deepEqual(snapshot(dir),before);}));
for(const name of Object.keys(BASELINE)){
 test(`modified ${name} fails without writes`,()=>fixture(dir=>{fs.appendFileSync(path.join(dir,name),'/*B12 slim-headers*/');const before=snapshot(dir),r=run(dir,['--check']);assert.equal(r.status,1);assert.match(r.stdout,/BASELINE_MISMATCH/);assert.deepEqual(snapshot(dir),before);}));
 test(`missing ${name} fails without writes`,()=>fixture(dir=>{fs.unlinkSync(path.join(dir,name));const before=snapshot(dir),r=run(dir,['--check']);assert.equal(r.status,1);assert.deepEqual(snapshot(dir),before);}));
}
test('unknown flags fail without writes',()=>fixture(dir=>{const before=snapshot(dir);assert.equal(run(dir,['--force']).status,1);assert.deepEqual(snapshot(dir),before);}));
test('historical marker-only files cannot pass',()=>fixture(dir=>{for(const name of Object.keys(BASELINE))fs.writeFileSync(path.join(dir,name),'/* B12 slim-headers */');assert.equal(run(dir,['--check']).status,1);}));
