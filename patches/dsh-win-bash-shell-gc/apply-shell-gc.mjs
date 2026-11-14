#!/usr/bin/env node
// apply-win-bash-shell-gc.mjs — 修复 @linxin666/dsh-win-bash「子代理 shell 永不释放」
//
// 背景（2026-11-13 实测）：
//   ShellRegistry 以 **agent 对象**为 key 建 shell，释放只挂在 `agent/disposed` 一个事件上。
//   而 core 的 agent/disposed 语义是「**calling fiber 被 dispose** 时」发出（dsh-agent/lib/index.js:474-489），
//   子代理跑完只会产生 stopReason（completed/aborted/…），agent 对象不销毁 → shell 永挂。
//   实证：19 个 runner 起始时刻与子代理会话起止一一对应，最老 27.8h，合计 ~522 MB；
//   最老几个已降到 6-9 MB WS（完全分页出去 = 长期闲置）。插件本身无任何闲置回收逻辑。
//
// 修法（最小侵入，只动 lib/index.js 三处）：
//   ① shell 记录加 lastUsedAt；② run() 每次成功返回前刷新 lastUsedAt；
//   ③ 新增 sweepIdle()，在 ensure() 进入时先回收「闲置超过 IDLE_MS 且非当前 owner」的 shell。
//   阈值走环境变量 DSH_WIN_BASH_IDLE_MS（默认 30 分钟），便于按需调整。
//
// 用法：
//   node apply-win-bash-shell-gc.mjs            # 应用（幂等：已含补丁则跳过）
//   node apply-win-bash-shell-gc.mjs --check    # 只检查，不写入
//   node apply-win-bash-shell-gc.mjs --revert   # 还原（需同目录 .pristine 备份）
'use strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

const TARGET = path.join(
  os.homedir(),
  '.dsh', 'profiles', 'web', 'node_modules',
  '@linxin666', 'dsh-win-bash', 'lib', 'index.js'
);
const MARK = 'DSH_WIN_BASH_IDLE_MS';
const PRISTINE = TARGET + '.pristine-shell-gc';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const revert = args.includes('--revert');

if (!fs.existsSync(TARGET)) {
  console.error('ERROR: target not found -> ' + TARGET);
  process.exit(1);
}

if (revert) {
  if (!fs.existsSync(PRISTINE)) {
    console.error('ERROR: no pristine backup at ' + PRISTINE);
    process.exit(1);
  }
  fs.copyFileSync(PRISTINE, TARGET);
  console.log('REVERTED from ' + PRISTINE);
  process.exit(0);
}

let src = fs.readFileSync(TARGET, 'utf8');

if (src.includes(MARK)) {
  console.log('ALREADY_PATCHED (marker present)');
  process.exit(0);
}
if (checkOnly) {
  console.log('NOT_PATCHED');
  process.exit(1);
}

// —— 锚点（每处在 pristine 中必命中 1 次）——
const A1 = `		const shell = {
			handle,
			exited: false,
			cursor: {
				stdout: 0,
				stderr: 0
			},
			exitCode: null
		};`;
const R1 = `		const shell = {
			handle,
			exited: false,
			cursor: {
				stdout: 0,
				stderr: 0
			},
			exitCode: null,
			lastUsedAt: this.now()
		};`;

const A2 = `	async ensure(owner, runtime, cwd, signal) {
		const existing = this.shells.get(owner);`;
const R2 = `	async ensure(owner, runtime, cwd, signal) {
		await this.sweepIdle(owner);
		const existing = this.shells.get(owner);`;

// insert sweepIdle() right before ensure()'s docblock
const A3 = `	* @returns the live shell record.
	*/
	async ensure(owner, runtime, cwd, signal) {`;
const R3 = `	* @returns the live shell record.
	*/
	/**
	 * Reclaim shells no command has used for DSH_WIN_BASH_IDLE_MS (default 30 min).
	 *
	 * The registry keys shells by the calling agent and releases them only on
	 * \`agent/disposed\`, which Cordis emits when the owning FIBER is disposed —
	 * a subagent that simply finishes never triggers it, so its shell outlives the
	 * work by hours (measured: 19 shells / 522 MB, oldest 27.8 h). Sweeping on
	 * ensure() bounds that leak without changing ownership semantics: the calling
	 * owner's own shell is never touched, and a reclaimed shell costs one bash
	 * restart the next time its session really needs it.
	 *
	 * @param keep - the owner whose shell must survive this sweep.
	 */
	async sweepIdle(keep) {
		if (this.shells.size === 0) return;
		const idleMs = Number(process.env.DSH_WIN_BASH_IDLE_MS || 1800000) || 1800000;
		const now = this.now();
		const victims = [];
		for (const [owner, shell] of [...this.shells]) {
			if (owner === keep) continue;
			if (shell.exited) { victims.push(owner); continue; }
			const last = typeof shell.lastUsedAt === "number" ? shell.lastUsedAt : now;
			if (now - last >= idleMs) victims.push(owner);
		}
		if (victims.length === 0) return;
		for (const owner of victims) {
			const shell = this.shells.get(owner);
			this.shells.delete(owner);
			if (shell !== void 0) await terminate(shell, "idle reclamation");
		}
		this.ctx?.logger?.debug?.(\`win-bash: reclaimed \${victims.length} idle shell(s)\`);
	}
	async ensure(owner, runtime, cwd, signal) {`;

// refresh lastUsedAt when a command completes successfully
const A4 = `			if (frame.outcome !== void 0) {
				const result = complete(frame.outcome, stdout, stderr, budget);
				resume();
				return result;
			}`;
const R4 = `			if (frame.outcome !== void 0) {
				const result = complete(frame.outcome, stdout, stderr, budget);
				resume();
				shell.lastUsedAt = this.now();
				return result;
			}`;

let applied = 0;
for (const [a, r, name] of [[A1, R1, 'shell.lastUsedAt'], [A3, R3, 'sweepIdle'], [A2, R2, 'ensure->sweep'], [A4, R4, 'run-refresh']]) {
  const n = src.split(a).length - 1;
  if (n !== 1) {
    console.error(`ERROR: anchor "${name}" matched ${n} times (expected 1) — aborting, nothing written`);
    process.exit(1);
  }
  src = src.replace(a, r);
  applied++;
}

fs.copyFileSync(TARGET, PRISTINE);
fs.writeFileSync(TARGET, src);
console.log(`APPLIED ${applied} anchors -> ${TARGET}`);
console.log('pristine backup -> ' + PRISTINE);
