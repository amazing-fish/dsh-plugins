# dsh-context — slim-headers (B12)

`session/list` carries every session's `contextHeaders` projection: for each of a
session's recent request headers it inlines the **full tool table** (name/tokens/
plugin for every tool). On a machine with ~1.2k sessions this dominates the list
response — measured 9.9 MB / 4.5 s before the patch.

slim-headers keeps the list wire small and moves the tool tables to the detail
route:

- the list carries the **newest three** envelopes, each with `toolCount` and
  `totalToolTokens` instead of the `tools` array;
- the projection grows `epochCount` and `detail: true` so the client knows the
  full tables arrive through the detail route's `headers` segment;
- `stateVersion` stays `1` (a serve-time change — no row rewrite);
- a host without a live detail channel serves the inline tables unchanged.

Result: list 9.9 MB → ~2.0–3.1 MB, first paint of a deep-linked session
7.16 s → 1.1–1.4 s.

## Version history

| Upstream | Porting shape |
| --- | --- |
| 0.74.0 / 0.75.1 | 8 conflicts each |
| 0.77.0 | zero conflicts (2 files touched upstream only) |
| 0.81.0 | architectural adaptation — `detailShadow`/fold rewrite, 19 files +419/−55 |
| **0.84.1** | **anchor-translation port** (this patch): `index.js` 111 KB → 191 KB, identifiers fully reshuffled (`Ti`→`Us` …) but structurally isomorphic — `Qs` is still the full wire schema, `tc()` is still the `contextHeaders` projection, and the `.live` gate is intact |

## The patch (`slim-headers@0.84.1-*.patch`)

`index.js` (3 anchors):

1. insert a slim wire schema (`B12_slim`) immediately before the full one (`Qs`);
2. replace `tc()` with a version that takes a live-gate thunk: when the detail
   channel is live it registers the slim schema and emits 3 envelopes with
   `toolCount`/`totalToolTokens`/`epochCount`/`detail:true`; otherwise it behaves
   exactly as upstream;
3. pass `() => o.live` at the registration site.

`client.js` (3 tool-count fallbacks) — with slim, `header.tools` is empty, so every
count has to come from `toolCount`:

- the category-count helper (`tools` branch);
- the `browser.items` label;
- the category-existence predicate.

Verified: `node --check` on both files; `check-patches.ps1` B12 green; upstream
`temp`/`live` mechanisms untouched.

## Caveat that matters when re-testing

The slim path only engages once the **detail route is live** (`live = true`). A
freshly started isolated instance measured **12.9 MB** while the long-running
production host measured **3.06 MB** with the same patched lib — the difference is
the gate, not the patch. Measure after a normal start, not on a cold isolated
instance.

## Re-apply

Machine-local script `~/.dsh/patches/patch-dsh-context-0.84.1.mjs`
(`--check` / `--revert`; pristine backups as `*.pristine-slim`).
Markers: `B12 slim-headers`, `B12_slim`.

Requires a `dsh web` restart (host-side module).
