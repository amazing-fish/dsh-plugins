# dsh-win-bash — idle shell reclamation (B13)

`@linxin666/dsh-win-bash` keeps one persistent bash per **calling agent**
(`ShellRegistry`, keyed by the agent object) and releases shells only on
`agent/disposed` — which Cordis emits when the owning **fiber** is disposed
(`@deepseek-ai/dsh-agent/lib/index.js:474-489`). A subagent that merely
finishes produces a `stopReason` (`completed`/`aborted`/…) and never disposes
its agent, so its shell — one `runner.js` node + one `bash.exe` — outlives the
work indefinitely.

Measured on one machine (2026-11-13): **19 shell families / 522 MB private
commit, oldest 27.8 h**, start times mapping 1:1 to subagent sessions; 12-second
CPU delta of zero (fully idle); oldest shells' working sets swapped out to
~6 MB. Related but distinct: upstream #1993/#1995 fixed the per-shell private
TEMP directory leak (disk); this fixes the shell process leak (memory).

Tracking issue: [#18](https://github.com/amazing-fish/dsh-plugins/issues/18).

## The patch (`shell-gc@0.4.8.patch`)

Three insertions into `lib/index.js`:

1. shell record gains `lastUsedAt` (set at creation);
2. `run()` refreshes `shell.lastUsedAt` after every completed command;
3. `ensure()` first calls `sweepIdle(owner)` — reclaims shells idle for
   ≥ `DSH_WIN_BASH_IDLE_MS` (env override, default **30 min**) that are not the
   calling owner; already-`exited` shells go immediately.

Ownership semantics unchanged: a reclaimed session's next `win_bash` call just
restarts its bash. No idle-timeout existed upstream at 0.4.8.

Verified: `node --check`; unit test on a real `ShellRegistry` with a controllable
clock (idle 40 min reclaimed; idle 5 min and the `keep` owner survive); live
reclaim of 16 idle families 19→4 with no session impact.

## Re-apply

Machine-local script `~/.dsh/patches/apply-win-bash-shell-gc.mjs`
(idempotent, `--check`, `--revert`; pristine backup beside the target).
Anchor markers: `DSH_WIN_BASH_IDLE_MS`, `lastUsedAt: this.now()`.

**Version exposure:** upstream moved 0.4.8 → 0.4.18 (temp-dir reclamation,
payload relocation) — before replaying on a newer version, diff the pristine
and check whether upstream grew an equivalent mechanism (then retire this
patch). See [UPGRADE-COMPAT.md](../UPGRADE-COMPAT.md).

Requires a `dsh web` restart after applying (host half imports once at start).
