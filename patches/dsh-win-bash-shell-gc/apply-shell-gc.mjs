#!/usr/bin/env node
// B13: reclaim idle shells, never an owner's in-flight run. No host restart here.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const MARK = 'B13 active-run lease v2';
const MAP = '\tshells = /* @__PURE__ */ new Map();';
const RUN = '\tasync run(owner, runtime, cwd, command, budget) {\n\t\tconst shell = await this.ensure(owner, runtime, cwd, budget.signal);';
const RUN_V2 = `\tasync run(owner, runtime, cwd, command, budget) {
\t\t// ${MARK}: acquire before ensure() can yield to another owner.
\t\tthis.activeRuns.set(owner, (this.activeRuns.get(owner) ?? 0) + 1);
\t\tlet shell;
\t\tlet commandFinished = false;
\t\ttry {
\t\t\tshell = await this.ensure(owner, runtime, cwd, budget.signal);`;
const END = '\t}\n\t/**\n\t* Get the owner\'s live shell, starting one when absent.';
const END_V2 = `\t\t} catch (error) {
\t\t\t// A reader/write failure does not prove the command stopped.
\t\t\tif (shell !== void 0 && this.shells.get(owner) === shell && !commandFinished && !shell.exited) shell.gcUncertain = true;
\t\t\tthrow error;
\t\t} finally {
\t\t\tconst remaining = this.activeRuns.get(owner) - 1;
\t\t\tif (remaining > 0) this.activeRuns.set(owner, remaining);
\t\t\telse this.activeRuns.delete(owner);
\t\t\t// Do not refresh a replacement shell belonging to a later call.
\t\t\tif (shell !== void 0 && this.shells.get(owner) === shell) {
\t\t\t\tshell.lastUsedAt = this.now();
\t\t\t}
\t\t}
${END}`;
const SWEEP = `\t/** Recheck identity and active leases after every asynchronous termination. */
\tasync sweepIdle(keep) {
\t\tconst configured = Number(process.env.DSH_WIN_BASH_IDLE_MS ?? 1800000);
\t\tconst idleMs = Number.isFinite(configured) && configured > 0 ? configured : 1800000;
\t\tfor (const [owner, shell] of [...this.shells]) {
\t\t\tif (owner === keep || this.activeRuns.has(owner) || this.shells.get(owner) !== shell) continue;
\t\t\tif (shell.gcUncertain && !shell.exited) continue;
\t\t\tconst last = shell.lastUsedAt;
\t\t\tif (!shell.exited && (typeof last !== 'number' || this.now() - last < idleMs)) continue;
\t\t\t// Deletion is synchronous with the eligibility check. Never delete a new record.
\t\t\tthis.shells.delete(owner);
\t\t\tawait terminate(shell, 'idle reclamation');
\t\t}
\t}
`;
const ENSURE = '\tasync ensure(owner, runtime, cwd, signal) {\n\t\tconst existing = this.shells.get(owner);';
const ENSURE_V2 = '\tasync ensure(owner, runtime, cwd, signal) {\n\t\tawait this.sweepIdle(owner);\n\t\tconst existing = this.shells.get(owner);';
const OUTCOME = '\t\t\tif (frame.outcome !== void 0) {';
const OUTCOME_V2 = OUTCOME + '\n\t\t\t\tcommandFinished = true;';
const RECORD = '\t\t\texitCode: null\n\t\t};';
const RECORD_V2 = '\t\t\texitCode: null,\n\t\t\tlastUsedAt: this.now()\n\t\t};';
const LEGACY_SWEEP = `\tasync sweepIdle(keep) {
\t\tif (this.shells.size === 0) return;
\t\tconst idleMs = Number(process.env.DSH_WIN_BASH_IDLE_MS || 1800000) || 1800000;
\t\tconst now = this.now();
\t\tconst victims = [];
\t\tfor (const [owner, shell] of [...this.shells]) {
\t\t\tif (owner === keep) continue;
\t\t\tif (shell.exited) { victims.push(owner); continue; }
\t\t\tconst last = typeof shell.lastUsedAt === "number" ? shell.lastUsedAt : now;
\t\t\tif (now - last >= idleMs) victims.push(owner);
\t\t}
\t\tif (victims.length === 0) return;
\t\tfor (const owner of victims) {
\t\t\tconst shell = this.shells.get(owner);
\t\t\tthis.shells.delete(owner);
\t\t\tif (shell !== void 0) await terminate(shell, "idle reclamation");
\t\t}
\t\tthis.ctx?.logger?.debug?.(\`win-bash: reclaimed \${victims.length} idle shell(s)\`);
\t}
`;
function count(src, needle) { return src.split(needle).length - 1; }
function once(src, old, replacement, label) {
  if (count(src, old) !== 1) throw new Error(`${label}: expected one complete anchor; no file written`);
  return src.replace(old, replacement);
}
export function checkSource(source) {
  const src = source.replace(/\r\n/g, '\n');
  return [MAP + '\n\tactiveRuns = new Map();', RUN_V2, END_V2, SWEEP, ENSURE_V2, RECORD_V2, OUTCOME_V2]
    .every(anchor => count(src, anchor) === 1);
}
export function patchSource(source) {
  const crlf = source.includes('\r\n');
  let src = source.replace(/\r\n/g, '\n');
  if (checkSource(src)) return source;
  if (src.includes(MARK)) throw new Error('Incomplete B13 v2; restore a verified baseline before applying');
  const legacy = src.includes('DSH_WIN_BASH_IDLE_MS');
  if (legacy) {
    src = once(src, LEGACY_SWEEP, SWEEP, 'complete legacy sweep');
    src = once(src, '\t\t\t\tshell.lastUsedAt = this.now();\n', '', 'legacy completion refresh');
    if (count(src, ENSURE_V2) !== 1 || count(src, RECORD_V2) !== 1) throw new Error('Incomplete B13 v1');
  } else {
    src = once(src, ENSURE, SWEEP + ENSURE_V2, 'ensure');
    src = once(src, RECORD, RECORD_V2, 'shell record (with or without upstream temp field)');
  }
  src = once(src, MAP, MAP + '\n\tactiveRuns = new Map();', 'registry map');
  src = once(src, RUN, RUN_V2, 'run entry');
  src = once(src, END, END_V2, 'run finalizer');
  src = once(src, OUTCOME, OUTCOME_V2, 'observed command outcome');
  if (!checkSource(src)) throw new Error('B13 postcondition failed; no file written');
  return crlf ? src.replace(/\n/g, '\r\n') : src;
}
export function main(argv = process.argv.slice(2)) {
  const index = argv.indexOf('--target');
  if (index >= 0 && !argv[index + 1]) throw new Error('--target needs a file');
  const target = index < 0 ? path.join(os.homedir(), '.dsh', 'profiles', 'web', 'node_modules', '@linxin666', 'dsh-win-bash', 'lib', 'index.js') : path.resolve(argv[index + 1]);
  const backup = target + '.before-shell-gc-v2';
  if (argv.includes('--check')) {
    if (!checkSource(fs.readFileSync(target, 'utf8'))) throw new Error('B13 active-run protection missing or incomplete');
    console.log('OK: complete B13 v2'); return;
  }
  if (argv.includes('--revert')) {
    fs.copyFileSync(backup, target); console.log('REVERTED'); return;
  }
  const before = fs.readFileSync(target, 'utf8');
  const after = patchSource(before);
  if (after === before) { console.log('ALREADY_PATCHED: complete B13 v2'); return; }
  if (fs.existsSync(backup) && fs.readFileSync(backup, 'utf8') !== before) throw new Error('Existing v2 rollback snapshot differs; preserve it and select a fresh verified target');
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, before, { flag: 'wx' });
  fs.writeFileSync(target, after);
  console.log('APPLIED: B13 v2; no process restarted');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
