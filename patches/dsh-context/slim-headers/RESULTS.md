# Verification evidence

Date: 2026-10-22. Source base: upstream v0.73.3, `a7ce2158c18bd76bd23dfb64146fd357209c12ce`. Implemented source HEAD: `62a63de6b230401abb2a3e3f160e7318be316e21`, local branch `fix/slim-header-envelopes`. Help-repository base: `49b3f4a002ade7874ded44ecee64a7a456b2c380`, local branch `fix/context-headers-on-demand`.

## Actual HTTP A/B on synthetic corpus

Actual CLI: @deepseek-ai/dsh 0.2.1-rc.2. Linux, Node 24.19.0, loopback HTTP, separate fresh DSH_HOME directories, ephemeral ports, no browser. Same deterministic corpus on each side: 2,542 sessions, 45 epochs in the long-session witness and 6 elsewhere, 50 tools per epoch, content-bearing v1 header checkpoints. This is 764,550 tool entries; it is not a copy of the Windows production corpus. Both builds use the same dependency lockfile.

| Measurement | Pristine source build | Candidate |
| --- | ---: | ---: |
| Entire session/list HTTP response | 50,410,489 B | 1,405,818 B |
| Sum of serialized contextHeaders values | 49,851,161 B | 846,490 B |
| contextHeaders share of response | 98.89% | 60.21% |
| First measured request | 4,609.988 ms | 1,455.092 ms |
| Subsequent three, median | 2,231.828 ms | 2,235.853 ms |
| Subsequent three, raw times | 2,522.288 / 2,231.828 / 2,189.046 ms | 1,181.452 / 2,235.853 / 2,516.387 ms |
| Long witness, contextHeaders value | 146,660 B | 337 B |
| Long witness, entire list row | 146,879 B | 556 B |
| Header segment in detail response | absent (old client reads list) | 45 epochs / 2,250 tools |
| v1 files unchanged after list + cold detail | 2,542 / 2,542 | 2,542 / 2,542 |
| Never-opened backfill witness | activity + timeline filled | activity + timeline filled |

Whole-response reduction: 97.21%; contextHeaders reduction: 98.30%. Size results are deterministic for this corpus. Timing is end-to-end Python HTTP read time, not just server serialization. Samples were rerun after the review fix on a shared development host; the warmed medians are effectively equal. The original run, including its 14.53 s baseline outlier, remains in measurements-initial.json. Payload reduction is established; latency improvement is not established by the final run. These four samples are insufficient to claim a production latency SLA or a stable speedup percentage. The warmed three-sample median is descriptive only.

`measurements.json` preserves every sample. The runner verifies all 45 epochs, all 50 names per epoch, positive per-tool token prices and mcp:bench attribution; success does not mean only HTTP 200. Before triggering backfill it compares both SHA-256 and mtime_ns of every v1 cache file. It then requires a previously unopened witness's activity day to contain one request and its timeline/activity values to appear in list. Backfill is permitted to write the isolated cache as normal.

The baseline route has no header segment; its Context UI uses the full list projection. Candidate ContextView component tests prove the fetched tools replace count-only envelopes. Aggregate token areas/counts remain valid while detail is pending. No manual Windows browser acceptance was performed.

## Source gates

```
VITEST_MAX_WORKERS=2 pnpm run check --full
```

Passed again after the review fix: lint and typecheck, with all 138 source files at 100% coverage: 9,933/9,933 statements, 9,357/9,357 branches, 1,851/1,851 functions and 8,162/8,162 lines. The final Vitest cache records zero failed files (121 client, 42 host, 2 compatibility). The check command exited zero but its captured coverage stream only contains the command line, so no final total test count is claimed. The prior pre-review full log records 2,439 passing tests; the four focused new regression cases are recorded separately in logs/review-regressions.log. The standard check skips 62 real-source compatibility cases when DSH_REPO is absent; they were run separately below. The original full output, including React act warnings, remains in logs/check-full.log. Final gate output, generated coverage totals and cached file results are retained in logs/check-review-full.log, logs/coverage-review.html and logs/vitest-results-cache.json. No coverage exclusions or thresholds were loosened.

```
DSH_REPO=<full harness checkout> VITEST_MAX_WORKERS=2 pnpm exec vitest run --project compat
pnpm run build
```

Passed: 69/69 compatibility cases over the real dsh-v0.1.7-rc.2 and dsh-v0.2.0-rc.2 source trees, plus the built bundle. A first compatibility run timed out while a partial clone lazily downloaded old source blobs; after fetching those objects, the unchanged tests passed again in 2.48 s on the final review-fixed build. Initial full-suite runs under concurrent load hit existing fixed-time hover/long-log timeouts. The hover test now waits for its observable result, and the 2,001-event content/yield test keeps its assertions with a 15 s timeout. The complete final gate is green.

## Codex review regression and correction

PR #12 first review identified a real P2: counting header-only events in the existing persisted timeline revision makes cold-refold revisions run ahead of old v28 checkpoints. A failing regression reproduced cold 46 versus resumed 1. The fix leaves host fold.ts and its persisted counter unchanged from v0.73.3. The client instead watches the latest header seq, invalidates obsolete in-flight reads, keeps the last good payload during refresh and resumes a pending read after reopening. Four focused regression tests pass, including the actual ContextView update. This adds no schema bump or migration. See logs/review-repro.log and logs/review-regressions.log.

## Replacement stager

Verified pristine npm 0.73.3 (published host is exactly 68,471 B), a constructed B12 input, repeated idempotent staging, and rejection of an unexpected host edit before any stage directory was created. Both staged JS halves passed node --check. A staged B12 replacement, with dependencies from an isolated tree, passed the 3-session HTTP runner with 45-epoch/2,250-tool assertions and backfill. Final artifacts are paired in replacement/lib and hash-pinned by manifest.json; no real installed package was changed.

## Limits and next gate

- Windows paths, original build_iso.py/probe.py and the actual production logs were unavailable in this environment. The original 3280 failure was not retrospectively proven; reproduced core enumeration gates are documented in DECISION.md.
- No exact Windows same-corpus before/after measurement exists yet. The handoff's 6,496,825 B / 1.44–1.58 s B12 result and 41.8–59.0 MB counterfactual are reporter-provided historical facts, not this benchmark.
- Old cache disk usage is intentionally unchanged. This fixes list/network shape, not the 36 MB retained state on disk.
- The size guarantee applies when the detail route is mounted; channel-less fallback remains inline.
- B12 remains in production. Any eventual production switch requires reconciliation of unrelated local patches, full-package rollback capture, isolated acceptance with the real corpus, and an explicitly authorized maintenance restart. Nothing should restart port 3080 automatically.
- The implementation/evidence PR is https://github.com/amazing-fish/dsh-plugins/pull/12, with issue #8 reopened. External bowenliang123/dsh-context issue/PR submissions remain drafts. The existing upstream #37 should be referenced, not silently duplicated. Current upstream main at inspection was 2bde34d76679d5c748985431cc6d021f04334616; this implementation deliberately targets the requested 0.73.3 baseline and needs a final rebase/check before submission to main.
