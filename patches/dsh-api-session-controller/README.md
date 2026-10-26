# Session list activity: count scheduled deliveries

| | |
| --- | --- |
| Target | `@deepseek-ai/dsh` → bundled `@deepseek-ai/dsh-api-session-controller/lib/index.js` (two anchors: `applySessionListMetadata` + the host `ctx.on('session/event')` hook that emits `api-session/activity`) |
| Symptom | A session driven by a DSH schedule (`schedule_create`) visibly refreshes its content, but the sidebar keeps showing the age of the last **human** prompt — e.g. "5天前" for a session whose scheduled run finished this morning. It also never bubbles up the list. |
| Root cause | The list row time is `updatedAt = max(header.createdAt, sessionListMetadata.lastPromptAt)`, and that projection only advances on `user/message` whose `source.kind === 'user'`. A scheduled delivery is `createUserMessage({ source: { kind: 'schedule' } })`, so it is folded into the transcript but never into list metadata. The live-reorder signal `api-session/activity` carries the same `source.kind === 'user'` gate. |
| Fix | Accept `source.kind === 'schedule'` next to `'user'` in both places (two single-line changes). |
| Verified on | `@deepseek-ai/dsh` 0.2.1-rc.2 (dsh-api-session-controller 0.2.1-rc.2), 2026-10-26 |

Upstream source (for the report, not for patching): the same two predicates live in
`packages/api/session-controller/src/list.ts` (`applySessionListMetadata` and
`updatedAt`) and `packages/api/session-controller/src/index.ts` (`api-session/activity`),
with the delivery side in `packages/schedule/schedule/src/runtime.ts`
(`source: { kind: 'schedule' }`).

Reference diff: `session-list-activity@0.2.1-rc.2.patch` (+2 lines, two hunks).
On Windows with `core.autocrlf=true`, `git apply` writes CRLF; compare against the
install with line endings normalised, or just use `apply.mjs`.

## Why the projection `stateVersion` is *not* bumped

Bumping it invalidates every cached `sessionListMetadata` row, and a cold (never opened)
session then falls back to `header.createdAt` — the whole list would briefly show
creation dates. Keeping `stateVersion: 1` means old rows stay valid and every row
self-corrects on its next delivery. Rows frozen before the patch can be healed
immediately with `heal-cache-rows.py`, which rewrites only
`rows.sessionListMetadata.val.lastPromptAt` (never `ver`/`seq`).

## Behaviour change (accepted by the reporter)

Background schedules now push their session to the top of the sidebar and refresh its
relative time. That is the point of the patch; if you prefer "list time = last human
prompt", do not apply it. The wire schema description still says
"Latest human-authored prompt time in the folded prefix" — cosmetic, left untouched.

## Anchors

```
A  const lastPromptAt = event.type === "user/message" && event.data.source.kind === "user" ? event.time : state.lastPromptAt;
B  if (event.type !== "user/message" || event.data.source.kind !== "user") return;
```

Both are unique in the file on 0.2.1-rc.2. Each edit prepends a marker comment
containing `2026-10-26 local patch: schedule counts as activity`, so a presence check is
`grep -c` == 2.

## Usage

```bash
node apply.mjs                      # auto-detect the dsh install
node apply.mjs --dsh-root <dir>     # explicit: the @deepseek-ai/dsh directory
node apply.mjs --check              # PATCHED / WIPED only
```

Then **restart `dsh web`**: the controller is a host-side module, loaded once at process
start.

## Evidence (`evidence/`)

- `fold-replay.txt` — the patched predicate replayed over three real session logs;
  `lastPromptAt` lands on the delivery time instead of the last human prompt.
- `list-after-restart.txt` — `POST /api/session/list` after a restart: the three
  previously stuck sessions report today's delivery times, ranked 12/15/17 of 2670.
