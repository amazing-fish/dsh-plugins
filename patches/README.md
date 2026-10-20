# patches

Environment patches for bundled dependencies of DeepSeek Harness (and its
memory stack) that are too small to ship as plugins but too annoying to lose
on every upgrade / reinstall. None of these are npm packages — they are
applied directly to installed files, anchored by text (never line numbers).

All `*.patch` files here are **reference diffs**: `a/` is the pristine
published package, `b/` is the patched local file. Re-apply by anchor and run
`node --check` (JS) or `python -m py_compile` (Python) afterwards.

## Index

| Patch | Package / version anchor | Status |
| --- | --- | --- |
| [openai-503-body](./openai-503-body) | openai@7.19.0 (bundled in @deepseek-ai/dsh 0.2.1-rc.2) | active |
| [dsh-llm-pi-ai](./dsh-llm-pi-ai) — opencode-camo UA + reasoning-only retry | @deepseek-ai/dsh-llm-pi-ai@0.2.1-rc.2 | active |
| [dsh-session-format-v0-to-v1](./dsh-session-format-v0-to-v1) — summary + descriptor-v2/cron compat | @deepseek-ai/dsh-session-format-v0-to-v1@0.2.1-rc.2 (identical to 0.2.0-rc.2) | active |
| [dsh-mnemon](./dsh-mnemon) — recall timeout 120s, sync retain, bounded fan-out, hot-memory limits 51200/8192, per-workspace storage scope (profile-layer config patch) | dsh-mnemon@0.5.33, dsh-mnemon-provider-hindsight@0.5.6, dsh-mnemon-source-memory-spaces@0.5.22 | active |
| [dsh-context](./dsh-context) — session-list bloat fix: contextHeaders stateVersion bump (stale-row eviction) + historical backfill mount removed | dsh-context@0.73.3 (anchor-based, no diff file) | active |
| [hindsight-api-engine](./hindsight-api-engine) — ONNX chunking/threads, length-sorted rerank | hindsight-api-slim==0.9.2 | active |
| [flashrank-int8-map](./flashrank-int8-map) — bge-zh int8 model map | FlashRank==0.2.10 | active |
| [dsh-sm-context-piano](./dsh-sm-context-piano.md) | managed as a fork of hjj345345/dsh-sm-context-piano | fork |

### Upstreamed / retired (kept for the record)

- **hindsight-coding-agents daemon `windowsHide`** — upstreamed: 0.8.1+ ships
  `windowsHide: true` on all daemon spawns, so the patch is an in-place
  verification on pristine 0.8.x rather than an edit. (0.7.0-era reference
  diff kept in [hindsight-coding-agents](./hindsight-coding-agents).)
- **openviking-dsh-memory-plugin auto-memory off** — obsolete on ≥0.5.25: the
  plugin was restructured (`AUTO_MEMORY` gate removed, auto hooks moved to
  `runtime.capture` / `injectStartupProfile`), so the old anchor no longer
  exists; see the package README for the retirement record.

### Upstreamed / retired (kept for the record)

- **Experimental schedule bundle** — retired: since **dsh 0.2.1** schedule
  ships natively (`dsh-schedule` + `dsh-tool-schedule` + `dsh-client-ui-schedule`,
  mounted directly by the `@deepseek-ai/dsh-web-app` bundle as `id: schedule`
  and `id: ui-schedule`). Listing
  `@deepseek-ai/dsh-experimental-schedule-bundle` in a profile's `bundles` is
  now **silently pruned by profile sanitization at startup** (the profile
  `package.json` mtime becomes the process start time) — that is expected
  convergence, not a wiped patch. Presence check for any wrapper script:
  the core `package.json` declares `dsh-tool-schedule`.
- **dsh-mnemon budget per workspace** — upstreamed natively in
  `dsh-mnemon-source-runtime` ≥ 0.5.14 (branches mechanism: writes carry
  `entry.branches`, projections filter MEMORY.md entries by git branch,
  budget accounting over the filtered set). No patch needed anymore.
- **vision-toolkit providerRetryPolicy** — fixed upstream
  (`@anionex/dsh-vision-toolkit` ≥ 0.1.40).
- **hindsight-coding-agents daemon windowsHide** — ships natively in
  `@vectorize-io/hindsight-coding-agents@0.8.1` (verified on a fresh install
  with no local patch applied, 2026-10-15). Reference diff kept for older
  installs.
- **dsh-cron-scheduler** — retired with dsh 0.2.0 (depended on the removed
  `snapshotEvents()` API; task persistence lived in session logs and died on
  session rebases — three independently observed losses). Replaced by the
  official `@deepseek-ai/dsh-schedule` tools + the experimental schedule
  bundle. The retired six-fix patch is archived as
  [dsh-cron-scheduler@0.1.0-retired.patch](./dsh-cron-scheduler@0.1.0-retired.patch).

## Wipe conditions (why this exists)

Any of the following restores pristine package files and silently wipes the
patches — no error, no warning:

- `@deepseek-ai/dsh` upgrade (global side)
- `pnpm install` / plugin update in a profile (profile side; version bumps are
  **not** required — relinking from the store alone restores pristine content)
- Python env recreation (daemon side)

Rule of thumb: after any install/upgrade, run a marker check against this
index and re-apply what got wiped, then restart the affected process.

## Conventions

- Reference diffs are anchored to exact published versions (see each README's
  "Verified on" line). On version drift, re-derive by anchor, not line numbers.
- `node --check` / `py_compile` after every re-apply; restart the owning
  process (ESM/daemon state is cached).
- Sanitization: diffs must never carry private registry URLs, tokens, internal
  hostnames, or local absolute paths. Gateway hosts in the opencode-camo patch
  are placeholders on purpose.
