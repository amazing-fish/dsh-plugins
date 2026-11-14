import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../patches/dsh-api-session-controller/apply-conversation-first.mjs',import.meta.url),'utf8')
 .replace(/^#!.*\n/,'').replace(/^import .*;\n/gm,'');
const pre=source.slice(0,source.indexOf('if (!existsSync(TARGET))'));
function run(input,check=true){
 let output=input,writes=0,code=0,lines=[];
 const ctx={join:(...a)=>a.join('/'),homedir:()=>'/fixture',process:{argv:['node','script',...(check?['--check']:[])],exit:n=>{throw {exit:n}}},console:{log:x=>lines.push(x),error:x=>lines.push(x)},existsSync:()=>true,readFileSync:()=>input,writeFileSync:(_p,s)=>{output=s;writes++},copyFileSync:()=>{},mkdirSync:()=>{}};
 try{vm.runInNewContext(source,ctx)}catch(e){if(e.exit===undefined)throw e;code=e.exit}
 return {code,output,writes,lines};
}
const ctx={join:(...a)=>a.join('/'),homedir:()=>'/fixture',process:{argv:[]}};
vm.runInNewContext(pre+';globalThis.edits=EDITS;',ctx);
const pristine=ctx.edits.map(e=>e.from).join('\n');
test('pristine applicable anchors are missing, never installed',()=>{const r=run(pristine);assert.equal(r.code,1);assert.equal(r.writes,0);assert.equal(r.output,pristine);assert(r.lines.some(s=>s.includes('MISSING')))});
test('all exact installed edits pass without write',()=>{const installed=run(pristine,false);assert.equal(installed.code,0);assert.equal(installed.writes,1);const r=run(installed.output);assert.equal(r.code,0);assert.equal(r.writes,0)});
test('marker-only content cannot pass',()=>{const r=run(ctx.edits.map(e=>e.marker).join('\n'));assert.equal(r.code,1);assert.equal(r.writes,0)});
test('partial and drift states fail without any writes',()=>{const r=run(pristine.replace(ctx.edits[0].from,'drift'));assert.equal(r.code,1);assert.equal(r.writes,0);assert.equal(run(pristine.replace(ctx.edits[0].from,'drift'),false).writes,0)});
test('applying twice is a no-op',()=>{const installed=run(pristine,false);const r=run(installed.output,false);assert.equal(r.code,0);assert.equal(r.writes,0)});
