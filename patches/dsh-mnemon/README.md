# dsh-mnemon patches

Patches against the `dsh-mnemon` suite (recall tooling for the Mnemon memory
system). Wiped by any `pnpm install` / plugin update in the profile — re-apply
from the reference diffs by anchor, then `node --check`.

## runtime-limits-and-workspace-scope (profile-layer config patch, no diff file)

The `dsh-mnemon` host plugin reads its whole Config from its plugin row.
Two profile-layer config changes beyond the shipped defaults:

**1. Hot-memory budget limits.** Defaults `memoryLimitBytes: 10240` /
`userLimitBytes: 4096` are tight for a multi-workspace machine sharing one
runtime store: the shared MEMORY.md hit the ceiling repeatedly and the
compactor archived entries within hours of writing them. Raised to
`51200` / `8192` (schema max 1048576).

**2. Per-workspace structural isolation.** `storageScope: workspaces` gives
every DSH workspace its own store under
`~/.mnemon/workspaces/<sha256(canonical-path)>/` (hot memory + documents +
memory-spaces state/data), while `runtimeUserScope: global` keeps the USER.md
profile machine-shared.

Patch mechanics (important): a profile-layer row with the same `id`
**replaces the shipped `config` wholesale — it is never deep-merged**, so the
profile row must restate every shipped field. Full restated row (field set
verified against `dsh-mnemon@0.5.28`; re-derive on other versions; takes
effect on the next dsh restart):

```yaml
# in <dsh-profile>/cordis.patch.yml
- id: mnemon
  name: dsh-mnemon
  config:
    storageScope: workspaces
    runtimeUserScope: global
    routingGuidance: true
    lifecycleEnabled: true
    recallMode: guided
    writebackMode: guided
    idleReviewMs: 30000
    tabEnabled: true
    writeEnabled: true
    remoteAccess: read-only
    timeoutMs: 120000
    defaultRecallLimit: 10
    embedding:
      enabled: false
      endpoint: http://localhost:11434
      model: nomic-embed-text
    recallQuality:
      policy: strict-v1
      lowScoreThreshold: 0.25
      highScoreThreshold: 0.6
      candidateMultiplier: 3
      maxMediumResults: 4
      maxUnknownResults: 2
    runtimeMemory:
      memoryLimitBytes: 51200
      userLimitBytes: 8192
      maintenanceMaxTokens: 8192
```

**Scope-switch migration** — upstream ships no migration tool
(StorageScopeInspector is read-only; Pack import lands in the current root
only, and `state/` is not part of the pack payload). We provisioned all 11
workspace stores by hand before flipping the config:

1. Compute each store id as sha256 of the canonical workspace path
   (replicating `canonicalWorkspacePath`: `resolve` + `realpathSync.native`
   walking up).
2. Write `runtime/memories.json` per workspace with the attributed subset of
   memory entries (machine/tool-level entries into every store, project
   entries only into their owning workspace); user-target entries stay in the
   global root (`runtimeUserScope: global`). The store file is authoritative —
   the injected snapshot is projected from it at session start, so no
   MEMORY.md projection needs to be pre-written.
3. Full-copy `documents/`, `state/memory-providers.json`, and `data/` (native
   store DB) into every workspace store. **Quiesce writers first**: this runs
   before the scope flip, so the old global root can still be live — stop all
   DSH/Mnemon processes, or copy the SQLite DB with a consistent online
   backup (e.g. Python `sqlite3` `src.backup(dst)`) instead of a raw file
   copy, so the DB and its WAL/journal are never captured mid-write. If the
   source changes after the copy (a late maintenance pass), re-sync the delta
   with the same backup while no workspace copy has diverged yet.
4. Keep the old global root in place (it remains the home of the shared
   USER.md); take a full backup before touching anything.

Upstream tracking: external provider banks only mount on service-settings
save — omdsh-dev/dsh-mnemon#373; per-component storage scope + migration
tooling (would make this whole section unnecessary) —
omdsh-dev/dsh-mnemon#374.

## recall-timeout-120s (config patch, no diff file)

The `dsh-mnemon` host plugin declares its recall tool timeout in
`cordis.patch.yml`. The stock value (10s, later 60s) is far below what large
memory banks need when recall includes cross-encoder reranking.

```yaml
# in dsh-mnemon/cordis.patch.yml
timeoutMs: 120000
```

`120000` is the plugin's schema maximum (`max(12e4)` in `lib/index.js`) — it
cannot go higher without patching the schema itself.

## provider-hindsight-sync-retain

Reference diff: `provider-hindsight-sync-retain.patch` (against
`dsh-mnemon-provider-hindsight@0.5.5`).

| | |
| --- | --- |
| Why | Stock `remember()` always posts `async: true` (queued extraction) and returns `queued` — the provider never learns whether the content actually landed |
| Fix | Try a synchronous retain first (`async: false`); when the daemon commits synchronously return `action: "committed"` with the stored count, and only fall back to the queued path when the daemon cannot commit synchronously |
| Fallback safety (Codex review, 2026-10-12) | The queued fallback fires **only on a definitive 4xx refusal** (the request was never committed). Transport failures, timeouts, aborts, and 5xx propagate instead — their outcome is ambiguous (the sync request may already have committed server-side, and the daemon ignores `operation_id` for synchronous retains, so an async replay would duplicate the write) |
| Markers | `async: false`, `action: "committed"`, `HTTP (\d{3})` guard |

## memory-spaces-bounded-fanout

Reference diff: `memory-spaces-bounded-fanout.patch` (against
`dsh-mnemon-source-memory-spaces@0.5.18`; `search()` gained an `options`
parameter in 0.5.18 — older versions use the two-arg signature).

| | |
| --- | --- |
| Symptom | Federated search over multiple memory spaces goes `unavailable` / red across the board; most spaces time out (>120s each) |
| Root cause | `search()` fans out with `Promise.all` over **all** spaces in parallel. Parallel recalls self-congest the shared reranker behind the memory daemon: 7-way parallel left most spaces over 120s and effectively dead |
| Fix | Bound the fan-out to concurrency 2 via an inserted `mapBounded` helper. Sequential measurement: every space completes in 12–40s. Each provider call keeps its own full timeout budget because its clock starts when its turn begins — staggering alone saves the day |
| Markers | `async mapBounded`, `this.mapBounded(spaces, ...)` |

## Upstreamed (retired, no patch needed)

- **Budget accounting per workspace** — `dsh-mnemon-source-runtime@0.5.14+`
  ships a native branches mechanism: `scopeBranch` / `entryMatchesBranch`,
  `entry.branches` on writes, projection filtering (USER.md entries globally
  visible, MEMORY.md entries branch-scoped), hidden-entry counting, and budget
  `used` computed over the filtered set. Semantically equivalent to (and more
  complete than) the old `budgetVisibleEntries` patch.
- **vision-toolkit providerRetryPolicy** — fixed upstream in
  `@anionex/dsh-vision-toolkit` ≥ 0.1.40 (issue #129).
