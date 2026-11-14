# dsh-context — B12 0.84.1 withdrawn; retain full upstream data

**Do not deploy the 0.84.1 slim recipe from #20.** Its complete headers/detail
round trip was not implemented. This revision disables that recipe instead of
activating a partial implementation. It does not install, restore, restart or
change an existing host. Existing machine installations need inspection.

## What users retain, and what they do not gain

Use the official, unpatched **dsh-context 0.84.1 host and client together**.
This retains upstream tool arrays, historical header epochs, tool search,
token views and difference calculations. It does **not** deliver the proposed
three-envelope list reduction. Larger list payloads remain an unresolved cost.
The earlier 9.9 MB → 2–3.1 MB / first-paint claims cannot be attributed to the
repository's exact recipe and are not acceptance evidence for it.

## Why the recipe was withdrawn

- `o.live` referenced an attribution object with only `ownerOf`; it was not the
  actual detail gate. Simply switching to `s.live` would activate incomplete
  data removal, not fix the design.
- The official detail path serves contextTimeline, not the missing complete
  headers epoch/tool segment; the client has no matching consumer.
- Both client replacement needles matched zero times on the verified official
  package, but the old script still reported APPLIED. Marker-only checks also
  incorrectly reported success.
- Bind-time wire schema selection failed when the live gate changed. Replacing
  persisted Xs with the slim wire schema rejected legitimate v1 stored rows.
- Adding counts alone cannot replace arrays. In particular, difference headers
  contain only added tools; a retained total toolCount would mislabel additions.

Source investigation and real Zod reproduction are recorded in
[PR #20 review evidence](https://github.com/amazing-fish/dsh-plugins/pull/20#issuecomment-6875063282).

## Safe inspection

```sh
node patches/dsh-context/patch-0.84.1.mjs --check --lib /absolute/path/to/dsh-context/lib
```

Without `--lib`, the historical `~/.dsh/profiles/web/node_modules/dsh-context/lib`
location is inspected. `--check` returns 0 only for the exact official 0.84.1
index.js + client.js bytes, reporting **FULL_DATA_UNPATCHED**, never APPLIED.
Missing, modified, mixed-version or historical slim files fail. This is not a
universal version checker: even a legitimate other version needs its own review.
A passing disk check does not prove a running process loaded those files.

Normal apply and `--revert` now return nonzero **without writes**. In particular,
old `*.pristine-slim` files are not blindly copied: their origin may be unknown.
For an already modified installation, inspect differences and restore the
verified official package pair through the normal package workflow during an
appropriate maintenance window. Preserve local changes/backups first. This PR
performs none of those machine operations and does not stop Bridge/Ghost.

## Follow-up acceptance for real slimming

A separate host/client implementation must provide a complete headers detail
channel, retain v1 state, accept both wire states across gate transitions, and
prove cold/live/reconnect behavior, old epoch selection, search, token totals,
and difference counts against the unpatched baseline. Until then retain full
data; do not treat a marker, smaller response or syntax check as compatibility.
Older 0.73/0.74/0.81 artifacts remain historical; this notice does not validate
or deploy them on 0.84.1.
