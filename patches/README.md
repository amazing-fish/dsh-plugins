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
| [openai-503-body](./openai-503-body) | openai@6.40.0 (bundled in @deepseek-ai/dsh) | active |
| [dsh-llm-pi-ai](./dsh-llm-pi-ai) — opencode-camo UA + reasoning-only retry | @deepseek-ai/dsh-llm-pi-ai@0.2.0-rc.2 | active |
| [dsh-session-format-v0-to-v1](./dsh-session-format-v0-to-v1) — summary + descriptor-v2/cron compat | @deepseek-ai/dsh-session-format-v0-to-v1@0.2.0-rc.2 | active |
| [dsh-mnemon](./dsh-mnemon) — recall timeout 120s, sync retain, bounded fan-out, hot-memory limits 51200/8192, per-workspace storage scope (profile-layer config patch) | dsh-mnemon@0.5.28, dsh-mnemon-provider-hindsight@0.5.5, dsh-mnemon-source-memory-spaces@0.5.18 | active |
| [hindsight-coding-agents](./hindsight-coding-agents) — daemon windowsHide | @vectorize-io/hindsight-coding-agents@0.7.0 | active |
| [openviking-dsh-memory-plugin](./openviking-dsh-memory-plugin) — auto-memory off | @openviking/dsh-memory-plugin@0.5.8 | active |
| [hindsight-api-engine](./hindsight-api-engine) — ONNX chunking/threads, length-sorted rerank | hindsight-api-slim==0.9.2 | active |
| [flashrank-int8-map](./flashrank-int8-map) — bge-zh int8 model map | FlashRank==0.2.10 | active |
| [dsh-sm-context-piano](./dsh-sm-context-piano.md) | managed as a fork of hjj345345/dsh-sm-context-piano | fork |

### Upstreamed / retired (kept for the record)

- **dsh-mnemon budget per workspace** — upstreamed natively in
  `dsh-mnemon-source-runtime` ≥ 0.5.14 (branches mechanism: writes carry
  `entry.branches`, projections filter MEMORY.md entries by git branch,
  budget accounting over the filtered set). No patch needed anymore.
- **vision-toolkit providerRetryPolicy** — fixed upstream
  (`@anionex/dsh-vision-toolkit` ≥ 0.1.40).
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
