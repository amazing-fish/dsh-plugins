# Verification evidence — 0.74.0 variant

Date: 2026-10-22. Source base: upstream `v0.74.0` (`7774965`). Port of
`slim-headers` (which targeted `v0.73.3`, `a7ce2158`).

## Port

`source.patch` is the same change set rebased onto `v0.74.0`. It applies with
`git apply -3`: all 12 source files and 7 test files merge cleanly except one
assertion in `tests/client/components/contextView.fileActivity.spec.ts`, where
0.74.0 upstream already replaced the fixed sleep with its own polling assertion
(`+1` instead of `Turn 0 · Step 0`). The upstream 0.74.0 form is kept, because it
carries the same intent.

Only four of the nine patch-target files changed between the two releases
(`browser.tsx` +3, `contextView.tsx` +35, `services.ts` +18, `shared/types.ts`
+19); `headers.ts`, `detail.ts`, `index.ts`, `dna.ts` and `treemap.ts` are
identical, so the host-side behaviour is the reviewed 0.73.3 one.

## Gates actually run (Windows, Node 24.16, DSH 0.2.1-rc.2)

| Gate | Result |
| --- | --- |
| `tsc --noEmit -p tsconfig.tests.json` | pass (exit 0) |
| `vitest run --project host tests/host/headers-slim.spec.ts tests/host/detail.spec.ts` | **24 passed** |
| `vitest run --project client` on `contextView.splitDetail`, `services`, `timelineSource`, `contextView.fileActivity` | **154 passed** |
| `tsdown` build | pass (host 71.71 kB, client 485.19 kB) |
| `node --check lib/index.js` + `lib/client.js` | pass |

Not run here: the repository's full `pnpm run check --full` coverage gate
(100% statements/branches/functions/lines) and the 69-case compatibility
project; both were run for the 0.73.3 variant on Linux. Also not run: browser UI
acceptance on Windows.

## Isolated HTTP A/B (this machine, port 0, disposable homes)

`acceptance.py` from the 0.73.3 variant, unchanged, on Windows. Corpus: 300
synthetic sessions, `bench-0000` with 45 epochs × 50 tools, the rest 6 epochs;
content-bearing `ver=1` header checkpoints.

| Measurement | Pristine 0.74.0 | This candidate |
| --- | ---: | ---: |
| Entire `session/list` response | 6,061,487 B | **165,992 B** (−97.26%) |
| Sum of `contextHeaders` values | 5,995,399 B | **99,904 B** (−98.33%) |
| Long witness `contextHeaders` value | 146,660 B | **337 B** |
| Long witness entire list row | 146,879 B | **556 B** |
| Header segment in detail response | absent | **45 epochs / 2,250 tools** (all names, positive prices, `mcp:bench` attribution asserted) |
| Cache files unchanged by list/detail | 300 / 300 | 300 / 300 |
| Backfill fills untouched witness | yes | yes |
| Warm median, 3 samples | 150.6 ms | 117.7 ms (300 sessions; not a latency claim) |

`acceptance-results.json` holds the raw run. Built halves are not committed here — see
[BUILD.md](./BUILD.md) for the deterministic rebuild and the expected hashes. The two source maps are shipped by the build but
left out of this directory to keep the transferred artifact set small; rebuild instead of
rehydrating them from here. The 300-session corpus is smaller
than the 2,542-session Linux corpus used for the 0.73.3 variant, so the absolute
bytes are not comparable across variants; the ratios are.

## Deployment

Staging only. `contextHeaders` `stateVersion` stays **1**, the state schema and
stored rows are unchanged, and the backfill mount is preserved. Existing `v2`
rows written by the local stopgap patch (B12) become unavailable until a normal
cold refold; `v1` rows are readable immediately.
