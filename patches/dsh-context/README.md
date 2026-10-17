# dsh-context

Patches against `dsh-context` (bowenliang123) — the plugin that registers the
`contextHeaders` session projection (per-session file/tool/etc. context header
history rendered inside sessions). The patch is **anchor-based (no reference
diff file)**: 0.7x ships minified single-mega-line `lib/index.js`, so a
unified diff would degenerate to the entire file. Re-apply by the anchors
below, then `node --check`.

## session-list-bloat (contextHeaders projection eviction + backfill off)

**Verified on:** dsh-context@0.70.0 (readable source) and dsh-context@0.73.0
(minified; anchors below are the 0.73.0 forms). **Status:** active.

### Root cause

`dsh-context` registers a `contextHeaders` session projection and **backfills
it for every historical session** on mount (its own `watchActivityBackfill` /
`Hn(e,n)` in 0.73.0). The projection stores a rolling window of raw context
headers per session (~21 KB/row on the machine that diagnosed this; 2150 rows
backfilled). DSH core ships **every projection's cached value in `session/list`
responses**, so once the backfill has run:

- every session-list request serializes the full projection table:
  **46 MB / ~2.8-3.5 s server-side** over ~2443 sessions (measured 2026-10-16);
- the browser pays a further ~7 s JSON parse on top — "new tab loads forever"
  and "send message takes forever to start processing" both trace back here.

### Fix (two edits, both required)

**1. Bump the projection's `stateVersion` 1 → 2.** DSH core's
`viewCheckpoint` invalidation skips cached rows whose `ver` no longer matches
the definition's `stateVersion`, so the 2150 stale v1 rows stop being served
without any migration.

  - 0.73.0 anchor (the **registered** `contextHeaders` definition — the one
    whose view slices headers to the last 50; NOT the generic `J` helper whose
    bare `stateVersion:1` must not be touched):

    ```
    return{headers:i.length>50?i.slice(-50):i}},stateVersion:1
                                              → stateVersion:2 /* <date> local patch: bump contextHeaders stateVersion to evict stale v1 cache rows (session/list bloat fix) */
    ```

  - disambiguation: the generic helper occurrence reads
    `wire:{viewSchema:t,view:r},schema:t,view:r,stateVersion:1` — leave it
    alone; only the `slice(-50)` one is the real definition.

**2. Remove the backfill mount call.** Without this, the bump only helps
until the backfill re-populates v2 rows on the next mount.

  - 0.73.0 anchor, in the plugin apply tail:

    ```
    e.sessionProjections.register(Yt()),Hn(e,n),Cr(e,t)}
                        → delete `Hn(e,n),`   (keep the rest verbatim)
    ```

  - 0.70.0 form for reference: remove the `watchActivityBackfill(...)` mount
    call in `apply`.

Live sessions keep recording new context headers through the plugin's normal
event wiring — only the historical backfill is gone, so the projection stays
useful for current sessions while `session/list` stops bloating.

### Measured effect (A/B, 2026-10-17)

| | pristine | patched |
| --- | --- | --- |
| `session/list` response | 46.6 MB | 4.6 MB |
| direct POST (server side) | ~3.4 s | ~2.5-3.0 s |
| browser cold-open (incl. parse) | ~15 s | ~6.7 s |

(The residual ~4.6 MB is core fixed cost: `turnOutline` ~1.4 MB + base fields
over ~2474 items — not this plugin's.)

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
- Wiped-and-drifted = re-derive from the 0.73.0 anchors; if the plugin's
  structure changed again, re-derive from the 0.70.0 README description
  above (registered `contextHeaders` definition + backfill mount call).
