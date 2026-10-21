# dsh-context

Patches against `dsh-context` (bowenliang123) — the plugin that registers the
`contextHeaders` session projection (per-session request-header epoch metadata:
boundaries, token prices, tool attribution). The patch is **anchor-based (no
reference diff file)**: 0.7x ships minified single-mega-line `lib/index.js`, so
a unified diff would degenerate to the entire file. Re-apply by the anchors
below, then `node --check`.

## session-list bloat (contextHeaders eviction + backfill off)

**Verified on:** dsh-context@0.73.3 (anchors unchanged since 0.73.0; the
0.70.0 readable-source form is described under *Version drift*).
**Status: stopgap — awaiting an upstream fix.** The patch removes the payload
by invalidating historical rows; it does not shrink what a single row carries,
so it regrows as sessions go live. See *Cost / risk*.

### What is actually large

Upstream already fixed the *content* problem: `#37` ("project header epochs as
metadata and fetch content on demand") stopped the projection from carrying the
system prompt and the tool schemas, and core's `viewCheckpoint` runs
`wire.view(state)` at serve time, so even legacy content-bearing cache rows go
out stripped. Measured on the machine that diagnosed this: **36.36 MB of stored
state shrinks to only 35.61 MB through the view** — content was never the
driver.

What remains is the *shape*: up to **50 epochs per session**, each carrying the
full tool list (`name` + `tokens` + attribution). The projection is per-session
data, yet DSH ships **every projection's value in `session/list`**, so the whole
corpus pays for it on every list call:

- 2,516 cached rows on that machine, **774,006 tool entries** in total
  (≈23.2 B of attribution per entry, calibrated on rows served today);
- pristine `session/list` ≈ **41.8 MB** (lower bound) to **59.0 MB**;
- and the browser pays the JSON parse on top ("new tab loads forever", "send
  message takes forever to start processing" both traced back here).

### Fix (two edits, both required)

**1. Bump the projection's `stateVersion` 1 → 2.** DSH core's
`viewCheckpoint` invalidation skips cached rows whose `ver` no longer matches
the definition's `stateVersion`, so the stale v1 rows stop being served
without any migration.

  - 0.73.0 / 0.73.3 anchor (the **registered** `contextHeaders` definition —
    the one whose view slices headers to the last 50; NOT the generic `J`
    helper whose bare `stateVersion:1` must not be touched):

    ```
    return{headers:i.length>50?i.slice(-50):i}},stateVersion:1
                                              → stateVersion:2 /* <date> local patch: bump contextHeaders stateVersion to evict stale v1 cache rows (session/list bloat fix) */
    ```

  - disambiguation: the generic helper occurrence reads
    `wire:{viewSchema:t,view:r},schema:t,view:r,stateVersion:1` — leave it
    alone; only the `slice(-50)` one is the real definition.

**2. Remove the backfill mount call.** Without this, the bump only helps
until the backfill re-populates v2 rows on the next mount.

  - 0.73.0 / 0.73.3 anchor, in the plugin apply tail:

    ```
    e.sessionProjections.register(Yt()),Hn(e,n),Cr(e,t)}
                        → delete `Hn(e,n),`   (keep the rest verbatim)
    ```

  - 0.70.0 form for reference: remove the `watchActivityBackfill(...)` mount
    call in `apply`.

Live sessions keep recording new context headers through the plugin's normal
event wiring — only the historical backfill is gone.

### Cost / risk (measured 2026-10-21)

- **2,516 of 2,542 sessions lose the list-level `contextHeaders` value** until
  they next go live. Upstream states the mechanism explicitly: a bump
  "invalidates every cached row and, for an idle session with no projection
  refresh channel, orphans the key until it goes live". This is why upstream
  keeps `stateVersion: 1` **by decision** after `#37` — this patch knowingly
  diverges from that decision.
- The per-session Context tab still renders: the detail route folds a session
  that was only ever viewed cold from its immutable log, and a live session
  folds for itself. What disappears is the *list-level* envelope metadata
  (and the fleet-level header data) for sessions that never come back.
- **It regrows.** Refolded rows still cap at 50 epochs × the full tool list.
  The 24 sessions already live-folded under the patch carry 1.14 MB
  (≈47 KB/session, vs ≈14 KB/session across the old rows); as more sessions go
  live the payload climbs back toward the pristine figure.
- Removing the mount also removes `/api/dsh-context/backfill`, whose only
  reader is the Context Insights page's first open. The corpus-wide warm-up
  that gives every stored session its `contextActivity` / `contextTimeline`
  rows is lost; per-session activity/timeline still folds for live sessions and
  through the detail route, so the visible loss is the fleet/heatmap view for
  never-opened sessions.

### Better fixes (upstream, not applied here)

Both need host + client changes, which is why they are recorded rather than
patched locally:

1. **Cap what the projection carries** — e.g. serve only the newest epoch (plus
   counts), instead of up to 50 epochs with their tool lists.
2. **Move the per-epoch tool list into the on-demand detail channel**, the same
   split `contextTimeline` already uses. A host-only trim is not possible: the
   client's `headersOf()` validator requires `tools` on every epoch and degrades
   the whole projection to `null` when it is missing.

### Measured effect

| build / date | pristine | patched |
| --- | --- | --- |
| 0.70.0, 2026-10-16 (2,443 sessions) | 46.6 MB | 4.6 MB |
| 0.73.3, 2026-10-21 (2,542 sessions) | 41.8 MB (lower bound) – 59.0 MB (counterfactual) | **6.50 MB / 1.44–1.58 s** |

The 0.73.3 pristine column is a counterfactual over the *same* live list and
the *same* cache rows: measured patched payload + the `view()` output of the
2,516 orphaned v1 rows, with the attribution overhead calibrated on the 28 rows
still served. Latency on 0.70.0 was ~3.4 s → 2.5–3.0 s server-side.

Route-level proof that the patch is live: `POST /api/dsh-context/backfill`
answers **404** (mount removed) while its sibling routes (`balance`, `fleet`,
`skills`, `detail`) still answer 200.

### Re-apply / verify

1. Both edits are wiped by any `pnpm install` / plugin update in the profile
   (version bumps not required). After any pnpm operation, re-derive by
   anchor — never by line numbers — and `node --check` the file.
2. Marker check: patched file must contain the `stateVersion:2 /* ... local
   patch ... */` comment and must **not** contain `Hn(e,n)`.
3. Restart `dsh web` afterwards (ESM cache).
4. Functional probe after restart: `session/list` response size drops to
   single-digit MB; the conversation fleet/detail routes still work.

### Version drift notes

- 0.70.0 → 0.73.0 renamed/minified the patch points (readable
  `watchActivityBackfill`/`stateVersion:1` in the registered definition →
  compressed `Hn`/same-key anchors); the anchors above are the 0.73.0 forms
  and were ported the same day a `pnpm remove` chain-upgrade installed 0.73.0.
- 0.73.0 → 0.73.3 (2026-10-20): **anchors unchanged**, no re-derivation
  needed — `return{headers:i.length>50?i.slice(-50):i}},stateVersion:1}}` still
  matches exactly once (the generic `J` helper keeps its own bare
  `stateVersion:1`), and the apply tail still reads
  `e.sessionProjections.register(Yt()),Hn(e,n),Cr(e,t)}` (the backfill
  function is still `function Hn(e,t=I(),n=Pn)` and still owns
  `/api/dsh-context/backfill`). Post-patch assertions that must all hold:
  `stateVersion:1` → 1 remaining (the `J` helper), `Hn(e,n)` → 0 calls,
  `function Hn(` → 1 (dead-code definition), local-patch markers → 2.
- Wiped-and-drifted = re-derive from the 0.73.x anchors; if the plugin's
  structure changed again, re-derive from the 0.70.0 description above
  (registered `contextHeaders` definition + backfill mount call).
- Automation: an idempotent applier that skips when the marker is already
  present, fails loudly when an anchor matches zero or several times, and runs
  the assertions above is the reliable way to re-apply this patch across
  versions (that is how 0.73.0 → 0.73.3 was ported in minutes).
