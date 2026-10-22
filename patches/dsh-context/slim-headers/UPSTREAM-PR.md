# perf: bound header envelopes and fetch epoch tools through detail

External upstream draft. The implementation/evidence is already submitted as amazing-fish/dsh-plugins#12.

Every session/list response currently includes up to 50 per-epoch tool tables per session. #37 removed raw content but retained the multiplicative tool metadata. This change serves three envelope summaries (with retained epoch count and tool totals) while the detail channel is live, and returns all retained per-epoch tool metadata in the existing detail payload.

The persisted v1 state is unchanged. No cache invalidation, migration, or backfill removal is needed. Channel-less hosts retain the inline fallback. The client accepts count-only envelopes, keeps aggregate tool figures during loading, and merges full epochs when detail lands. The client independently invalidates detail on a new header epoch seq, preserving the persisted timeline counter semantics and keeping old checkpoints comparable with cold refolds.

Validation: see RESULTS.md for commands, complete check logs, exact base, build identities, synthetic HTTP A/B and limitations. The HTTP runner checks actual data rather than status codes. The reporter's Windows production corpus and browser remain a separate deployment acceptance gate.

Tradeoff: full tool metadata moves to an on-demand fetch and may briefly show an aggregate before landing. The existing 50-epoch retention and bounded detail caches remain. This is a paired host/client package change.
