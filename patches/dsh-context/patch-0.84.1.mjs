#!/usr/bin/env node
// patch-dsh-context-0.84.1.mjs — B12 slim-headers 移植：0.81.0 -> 0.84.1
//
// slim-headers 让 session/list 的 contextHeaders 只带最近 3 个信封 + toolCount/
// totalToolTokens/epochCount（detail:true），全量 epoch tools 走 detail 路由。
//
// 0.84.1 上游变化：index.js 111KB -> 191KB（打包重构、标识符整体重排 Ti->Us 等），
// 但结构同构：Qs = full wire schema、tc() = contextHeaders 投影、.live 闸保留。
// 故本次为**锚点平移移植**，不是架构重写。
//
// 用法：node patch-dsh-context-0.84.1.mjs [--check|--revert]
'use strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

const LIB = path.join(os.homedir(), '.dsh', 'profiles', 'web', 'node_modules', 'dsh-context', 'lib');
const IDX = path.join(LIB, 'index.js');
const CLI = path.join(LIB, 'client.js');
const MARK = 'B12 slim-headers';

const argv = process.argv.slice(2);
const checkOnly = argv.includes('--check');
const revert = argv.includes('--revert');

if (!fs.existsSync(IDX)) { console.error('ERROR: not found ' + IDX); process.exit(1); }

if (revert) {
  let n = 0;
  for (const f of [IDX, CLI]) {
    const p = f + '.pristine-slim';
    if (fs.existsSync(p)) { fs.copyFileSync(p, f); n++; }
  }
  console.log('REVERTED ' + n + ' file(s)');
  process.exit(0);
}

let idx = fs.readFileSync(IDX, 'utf8');
let cli = fs.readFileSync(CLI, 'utf8');

if (idx.includes(MARK)) { console.log('ALREADY_PATCHED'); process.exit(0); }
if (checkOnly) { console.log('NOT_PATCHED'); process.exit(1); }

function replaceOnce(src, needle, repl, label) {
  const n = src.split(needle).length - 1;
  if (n !== 1) {
    console.error(`ERROR: anchor "${label}" matched ${n} times (expected 1) — aborting`);
    process.exit(1);
  }
  return src.replace(needle, repl);
}

// ── 1) full wire schema (Qs) 前插入 slim schema
// 0.84.1: ...}).strict(),Qs=t.object({headers:t.array(t.object({seq:t.number(),time:t.number(),systemTokens:...
const QS_HEAD = 'Qs=t.object({headers:t.array(t.object({seq:t.number(),time:t.number(),systemTokens:';
const SLIM =
  '/*' + MARK + '*/' +
  'B12_slim=t.object({headers:t.array(t.object({seq:t.number(),time:t.number(),' +
  'systemTokens:t.number().int().nonnegative().optional(),tools:t.array(Zs),' +
  'toolCount:t.number().int().nonnegative().optional(),' +
  'totalToolTokens:t.number().int().nonnegative().optional()}).strict()),' +
  'epochCount:t.number().int().nonnegative().optional(),' +
  'detail:t.literal(!0).optional()}).strict(),';
idx = replaceOnce(idx, QS_HEAD, SLIM + QS_HEAD, 'Qs-schema-head');

// ── 2) tc() 整体替换为「带 live 闸的 slim 版」
const TC_OLD =
  'function tc(e){return{key:`contextHeaders`,stateSchema:Xs,wire:{viewSchema:Qs,' +
  'view:t=>({headers:ec(t,e).slice(-50)}),summary:!1},init:()=>({headers:[]}),' +
  'apply:(e,t)=>{let n=$s(t);if(n===null)return e;let r=e.headers.at(-1);' +
  'if(r!==void 0&&r.seq===n.seq)return e;let i=[...e.headers,n];' +
  'return{headers:i.length>50?i.slice(-50):i}},stateVersion:1}}';

const TC_NEW =
  'function tc(e,t=()=>!1){return{key:`contextHeaders`,' +
  'stateSchema:t()?B12_slim:Xs,' +
  'wire:{viewSchema:t()?B12_slim:Qs,view:n=>{let r=t(),i=n.headers.slice(-50);' +
  'return{...r?{epochCount:i.length,detail:!0}:{},' +
  'headers:(r?i.slice(-3):i).map(t=>{let n={seq:t.seq,time:t.time,' +
  '...r?{toolCount:t.tools.length,totalToolTokens:t.tools.reduce((e,t)=>e+t.tokens,0)}:{},' +
  'tools:r?[]:t.tools.map(t=>{let n={name:t.name,tokens:t.tokens},' +
  'a=t.plugin??(e===void 0?void 0:e(t.name));return a!==void 0&&(n.plugin=a),n})},' +
  'i=t.systemTokens??(typeof t.system==`string`&&t.system!==``?ne(t.system):void 0);' +
  'return i!==void 0&&(n.systemTokens=i),n})}},summary:!1},' +
  'init:()=>({headers:[]}),apply:(e,t)=>{let n=$s(t);if(n===null)return e;' +
  'let r=e.headers.at(-1);if(r!==void 0&&r.seq===n.seq)return e;' +
  'let i=[...e.headers,n];return{headers:i.length>50?i.slice(-50):i}},stateVersion:1}}';

idx = replaceOnce(idx, TC_OLD, TC_NEW, 'tc-body');

// ── 3) 注册处传入 live 闸
idx = replaceOnce(
  idx,
  'e.sessionProjections.register(tc(e=>o.ownerOf(e))),',
  'e.sessionProjections.register(tc(e=>o.ownerOf(e),()=>o.live)),',
  'register-live-gate'
);

// ── 4) client.js：slim 下 tools 为空，计数兜底到 toolCount
const CLI_REPS = [
  ['asm.header!==null?asm.header.tools.length:0', 'asm.header!==null?asm.header.toolCount??asm.header.tools.length:0'],
  ['e.header!==null?e.header.tools.length:0', 'e.header!==null?e.header.toolCount??e.header.tools.length:0'],
];
let cliApplied = 0;
for (const [a, r] of CLI_REPS) {
  const n = cli.split(a).length - 1;
  if (n >= 1) { cli = cli.split(a).join(r); cliApplied += n; }
}

fs.copyFileSync(IDX, IDX + '.pristine-slim');
fs.copyFileSync(CLI, CLI + '.pristine-slim');
fs.writeFileSync(IDX, idx);
fs.writeFileSync(CLI, cli);
console.log(`APPLIED index.js: 3 anchors + slim schema; client.js: ${cliApplied} toolCount fallback(s)`);
console.log('pristine backups: *.pristine-slim');
