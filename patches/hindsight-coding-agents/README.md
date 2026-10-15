# hindsight-coding-agents patch

Reference diff: `daemon-start.windowshide.patch` (against
`@vectorize-io/hindsight-coding-agents@0.7.0`).

| | |
| --- | --- |
| Target | `dist/daemon-start.js` — the two `spawn()` call sites that launch the memory daemon |
| Symptom | Every daemon (re)start flashes console windows on Windows desktop sessions |
| Fix | Add `windowsHide: true` to both `spawn(cmd, args, { stdio: "pipe", ... })` calls |
| Markers | `spawn(cmd, args, { stdio: "pipe", windowsHide: true })` |
| Note | The sibling package `hindsight-all` already shipped this natively in its `dist/index.js` — no patch needed there |

**Upstreamed (2026-10-15):** `@vectorize-io/hindsight-coding-agents@0.8.1`
carries `windowsHide` natively in `dist/daemon-start.js` (5 occurrences,
verified on a fresh 2026-10-14 install with no local patch applied). No patch
needed on ≥ 0.8.1; the reference diff is kept for the record and for older
installs.
