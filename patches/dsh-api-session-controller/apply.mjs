#!/usr/bin/env node
/**
 * Count scheduled deliveries as Session activity in the sidebar list.
 *
 * Two anchored single-line edits in the installed
 * `@deepseek-ai/dsh-api-session-controller/lib/index.js`:
 *   1. `applySessionListMetadata` — the list row's `lastPromptAt`
 *   2. the host `session/event` hook — the live `api-session/activity` signal
 *
 * Each edit is applied independently, so a half-applied file (one hunk only, or a
 * marker comment edited away by hand) converges to the same result instead of
 * refusing to continue. The script never rewrites anything it cannot recognise.
 *
 * Deliberately does NOT bump the projection `stateVersion`: existing cache rows
 * stay valid (no re-fold of thousands of sessions). Rows frozen before the patch
 * are healed by the next delivery, or by `heal-cache-rows.py`.
 *
 * Usage:
 *   node apply.mjs                     # auto-detect the dsh install
 *   node apply.mjs --dsh-root <dir>    # explicit @deepseek-ai/dsh directory
 *   node apply.mjs --check             # report per-hunk state, exit 1 unless patched
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const MARK = '2026-10-26 local patch: schedule counts as activity';
const REL = 'node_modules/@deepseek-ai/dsh-api-session-controller/lib/index.js';

const EDITS = [
  {
    label: 'lastPromptAt',
    oldLine: '\tconst lastPromptAt = event.type === "user/message" && event.data.source.kind === "user" ? event.time : state.lastPromptAt;',
    newLine: '\tconst lastPromptAt = event.type === "user/message" && (event.data.source.kind === "user" || event.data.source.kind === "schedule") ? event.time : state.lastPromptAt;',
  },
  {
    label: 'api-session/activity',
    oldLine: '\t\t\t\tif (event.type !== "user/message" || event.data.source.kind !== "user") return;',
    newLine: '\t\t\t\tif (event.type !== "user/message" || (event.data.source.kind !== "user" && event.data.source.kind !== "schedule")) return;',
  },
].map((edit) => {
  // The marker comment carries the same indentation as the line it annotates.
  const indent = edit.newLine.match(/^[\t ]*/)[0];
  return {
    ...edit,
    block: `${indent}/* ${MARK} (${edit.label}) */\n${edit.newLine}`,
    comment: `${indent}/* ${MARK} (${edit.label}) */`,
  };
});

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
  out.push('/usr/local/lib/node_modules/@deepseek-ai/dsh');
  return out;
}

/**
 * Classify one edit against the current source.
 * @returns {{ state: 'patched' | 'pristine' | 'half' | 'miss', next?: string }}
 *   `half` = the modified line survived but its marker comment did not;
 *   `miss` = neither the original nor the modified line is present.
 */
function classify(src, edit) {
  if (src.includes(edit.block)) return { state: 'patched' };
  if (src.includes(edit.oldLine)) {
    return { state: 'pristine', next: src.replace(edit.oldLine, edit.block) };
  }
  if (src.includes(edit.comment)) {
    // marker without either predicate line is not a shape this patch produced
    return { state: 'miss' };
  }
  if (src.includes(edit.newLine)) {
    // modified predicate with the marker comment stripped (e.g. by an older
    // partial-recovery path): restore the marker so presence checks work again
    return { state: 'half', next: src.replace(edit.newLine, edit.block) };
  }
  return { state: 'miss' };
}

const checkOnly = process.argv.includes('--check');
const file = candidates().map((root) => path.join(root, REL)).find((p) => existsSync(p));
if (!file) {
  console.error('Cannot locate dsh-api-session-controller; pass --dsh-root <@deepseek-ai/dsh>');
  process.exit(2);
}
console.log(`target: ${file}`);

const original = readFileSync(file, 'utf8');
const states = EDITS.map((edit) => ({ edit, ...classify(original, edit) }));
for (const { edit, state } of states) console.log(`  ${edit.label}: ${state}`);

if (checkOnly) {
  const ok = states.every(({ state }) => state === 'patched');
  console.log(ok ? 'PATCHED' : 'WIPED');
  process.exit(ok ? 0 : 1);
}

if (states.every(({ state }) => state === 'patched')) {
  console.log('already patched; nothing to do');
  process.exit(0);
}

// Re-classify against the progressively edited text so each hunk is applied to the
// result of the previous one (`original` would drop the earlier hunk).
let next = original;
const applied = [];
const missing = [];
for (const edit of EDITS) {
  const step = classify(next, edit);
  if (step.state === 'patched') continue;
  if (step.state === 'miss') {
    missing.push(edit.label);
    continue;
  }
  next = step.next;
  applied.push(`${edit.label} (${step.state === 'half' ? 'repaired' : 'applied'})`);
}
if (missing.length > 0) {
  console.error(`ANCHOR MISS (${missing.join(', ')}) — upstream shape changed; port manually (see README "Anchors"). File left untouched.`);
  process.exit(3);
}
writeFileSync(file, next);
console.log(`patched: ${applied.join(', ')} — restart \`dsh web\` for the host half to load it`);
