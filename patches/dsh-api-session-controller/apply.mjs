#!/usr/bin/env node
/**
 * Count scheduled deliveries as Session activity in the sidebar list.
 *
 * Two anchored single-line edits in the installed
 * `@deepseek-ai/dsh-api-session-controller/lib/index.js`:
 *   1. `applySessionListMetadata` — the list row's `lastPromptAt`
 *   2. the host `session/event` hook — the live `api-session/activity` signal
 *
 * Deliberately does NOT bump the projection `stateVersion`: existing cache rows
 * stay valid (no re-fold of thousands of sessions). Rows frozen before the patch
 * are healed by the next delivery, or by `heal-cache-rows.py`.
 *
 * Usage:
 *   node apply.mjs                     # auto-detect the dsh install
 *   node apply.mjs --dsh-root <dir>    # explicit @deepseek-ai/dsh directory
 *   node apply.mjs --check             # report PATCHED / WIPED only
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const MARK = '2026-10-26 local patch: schedule counts as activity';
const REL = 'node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js';

const A_OLD = 'const lastPromptAt = event.type === "user/message" && event.data.source.kind === "user" ? event.time : state.lastPromptAt;';
const A_NEW = `/* ${MARK} (lastPromptAt) */\n\t${A_OLD.replace('event.data.source.kind === "user"', '(event.data.source.kind === "user" || event.data.source.kind === "schedule")')}`;

const B_OLD = 'if (event.type !== "user/message" || event.data.source.kind !== "user") return;';
const B_NEW = `/* ${MARK} (api-session/activity) */\n\t\t\t\tif (event.type !== "user/message" || (event.data.source.kind !== "user" && event.data.source.kind !== "schedule")) return;`;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function candidates() {
  const out = [];
  if (arg('--dsh-root')) out.push(arg('--dsh-root'));
  if (process.env.DSH_ROOT) out.push(process.env.DSH_ROOT);
  try {
    const root = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (root) out.push(path.join(root, '@deepseek-ai', 'dsh'));
  } catch { /* npm not on PATH */ }
  if (process.env.APPDATA) out.push(path.join(process.env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh'));
  out.push('C:/Users/h00899877/npm-global/node_modules/@deepseek-ai/dsh');
  return out;
}

const checkOnly = process.argv.includes('--check');
const file = candidates().map((root) => path.join(root, REL)).find((p) => existsSync(p));
if (!file) {
  console.error('Cannot locate dsh-api-session-controller; pass --dsh-root <@deepseek-ai/dsh>');
  process.exit(2);
}
console.log(`target: ${file}`);
let src = readFileSync(file, 'utf8');
const marks = src.split(MARK).length - 1;

if (checkOnly) {
  console.log(marks === 2 ? 'PATCHED' : `WIPED (marks=${marks})`);
  process.exit(marks === 2 ? 0 : 1);
}
if (marks === 2) {
  console.log('already patched; nothing to do');
  process.exit(0);
}
if (marks === 1) {
  // half-applied: strip our comment lines and fall through to a full replay
  src = src.split('\n').filter((line) => !(line.includes(MARK) && line.trim().startsWith('/*'))).join('\n');
  console.log('rolled back a partial patch');
}
if (!src.includes(A_OLD) || !src.includes(B_OLD)) {
  console.error('ANCHOR MISS — upstream shape changed; port manually (see README "Anchors")');
  process.exit(3);
}
writeFileSync(file, src.replace(A_OLD, A_NEW).replace(B_OLD, B_NEW));
console.log('patched; marks=2 — restart `dsh web` for the host half to load it');
