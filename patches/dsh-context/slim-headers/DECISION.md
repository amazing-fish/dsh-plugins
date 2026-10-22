# Header envelope split — implementation decision

Status: implementation and evidence prepared for review in amazing-fish/dsh-plugins. External upstream submissions remain drafts. Production profile and port 3080 were not accessed.

## Decision

Choose B, with a three-envelope list tail to satisfy the explicit 2 KiB per-session acceptance threshold. The list carries seq/time/systemTokens plus toolCount/totalToolTokens, epochCount (retained count, at most 50), and a detail marker. An empty tools array remains as a compatibility field; no tool names, prices, or attribution tables ride it. The on-demand detail response carries all retained header epochs and per-tool metadata, alongside the timeline at the same synchronous live cut or cold log observation.

A alone still multiplies a full tool table by every listed session; it is only a fallback. C removes useful envelopes from unopened sessions. B preserves the existing split-channel lifecycle and backfill. Keeping all 50 verbose envelope objects in a list row would not reliably satisfy 2 KiB, hence the bounded tail. This does not change the existing retained-history limit of 50.

## Compatibility and integrity

- contextHeaders stateVersion remains 1; state schema and stored records are unchanged. Old content-bearing v1 rows normalize through view(). No cache deletion or migration is required.
- The detail channel gates both timeline and header splits. If it cannot mount, the existing inline generation still works; that compatibility fallback does not receive the payload-size guarantee.
- headersOf accepts a tools-less epoch only with valid nonnegative integer counts, then normalizes to tools:[] so existing name/sort consumers stay safe. Aggregate token/count figures remain available while detail loads.
- Header epochs now advance the existing detail revision, including tools-only changes. Otherwise an already-open page could retain an obsolete tool table. This change is future-event-backfillable and requires no stateVersion bump.
- Backfill stays mounted with its existing pacing, cold-read gate, live-session skip and activity/timeline warm-up.

## Isolation discovery

Core v0.2.1-rc.2 enumerates cold sessions from sessionPersistence.list(); its session controller then includes cold rows only if header.cwd is present. A workspace registry entry cannot replace that header field. The JSONL backend scans root/project/session/session.vN.jsonl[.zstd], according to the configured compression. A config override must carry root explicitly: replacing config with only compression makes the persistence service fail activation.

This run reproduced and resolved these gates in a disposable home. The earlier Windows build_iso.py and probe.py were unavailable here, so their exact failure cause remains unconfirmed. The supplied acceptance runner creates valid V4 logs, explicit root, matching compression, cwd, and lifecycle-matching v1 checkpoints; it asserts the expected session count before measuring anything. It requires no separate session-index or archive-registration file.

## B12 retirement

Do not automatically apply this to the live profile or restart port 3080. Stage a whole-package copy with both rebuilt host and client, retaining package identity and all other files. Do not install dependencies in the real profile. The candidate is based on pristine 0.73.3, so it removes both B12 edits: the definition returns to stateVersion 1 and backfill is mounted. Existing v2 cache rows will be unavailable until a normal cold refold/live refresh; backfill restores activity/timeline and its cold snapshot can rebuild mismatched units without manual cache edits. Existing v1 rows are immediately readable.

Before a future authorized deployment, compare the installed package with its pristine copy and inspect unrelated changes. The staging script refuses unknown input hashes and never targets a live profile. Capture the complete current package for rollback, not only lib/index.js. Host changes take effect only at a separately authorized maintenance restart; refreshing the browser alone changes only the client. Until that restart, B12 remains the running stopgap.

If upstream declines B, retain a maintained local build of this split. If only the old two-edit stopgap can be used, an emergency fallback must cap BOTH HEADERS_MAX in apply and the view's returned epoch tail (e.g. 1), along with B12. This bounds per-session epoch growth but does not bound the number of active sessions or the number of tools in the newest epoch; it also retains B12's data-loss/backfill drawbacks. Do not describe it as a corpus-wide cure. Ship no unverified minified anchor rewrite for a bundle not inspected.
