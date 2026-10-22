# Bound contextHeaders list envelopes and fetch per-epoch tool tables on demand

Draft only — do not submit without approval.

Following #37, the remaining session-list cost is the shape of the metadata: up to 50 epochs × a full tool attribution table × every listed session. This is not a request to restore system text or tool schemas to projections.

Reporter-supplied audit, 2026-10-21, dsh-context 0.73.3 / DSH 0.2.1-rc.2:

- 2,542 sessions; 2,516 old v1 checkpoints contain 774,006 tool entries.
- Stored contextHeaders: 36.36 MB; view-normalized output: 35.61 MB before attribution overhead.
- Same-corpus pristine list counterfactual: 41.8–59.0 MB (not a directly timed pristine response).
- Local invalidation/backfill-removal workaround: 6,496,825 bytes / 1.44–1.58 seconds, but 2,516 sessions lose list headers and data regrows as they resume.

## Minimal reproduction

1. Fold 45 request/header epochs, each with 50 tools; store the existing v1 state.
2. Serve that checkpoint through viewCheckpoint() and session/list.
3. Inspect bytes of the session row. #37 strips content, but still sends 2,250 tool metadata entries.
4. Compare a slim envelope view with full headers returned from the already-existing detail route. The attached implementation keeps stateVersion 1 and does not migrate cache rows.

The runnable acceptance.py boots the actual CLI into separate new DSH_HOME directories and ephemeral ports, with lifecycle-valid synthetic V4 logs and v1 cache rows. It asserts list cardinality, byte counts, full 45-epoch detail contents and attribution, unchanged v1 files before backfill, and activity/timeline backfill for a never-opened witness. Synthetic HTTP numbers are recorded separately in RESULTS.md and are not the reporter's production measurements.

Proposed contract: list the latest three envelope summaries plus retained epochCount; fetch all retained per-epoch tools through /api/dsh-context/detail. Keep backfill and stateVersion 1. Gate the split on detail-route liveness, preserving inline compatibility. Count-only client envelopes must remain usable while detail loads; tools-only header changes must invalidate detail through the epoch seq, without changing persisted timeline revision semantics.
