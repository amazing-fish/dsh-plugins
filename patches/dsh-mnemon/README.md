# dsh-mnemon patches

Patches against the `dsh-mnemon` suite (recall tooling for the Mnemon memory
system). Wiped by any `pnpm install` / plugin update in the profile — re-apply
from the reference diffs by anchor, then `node --check`.

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
