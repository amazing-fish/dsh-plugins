# hindsight-coding-agents patch

Reference diff: `daemon-start.windowshide.patch` (against
`@vectorize-io/hindsight-coding-agents@0.7.0`).

| | |
| --- | --- |
| Target | `dist/daemon-start.js` — the two `spawn()` call sites that launch the memory daemon |
| Symptom | Every daemon (re)start flashes console windows on Windows desktop sessions |
| Fix | Add `windowsHide: true` to both `spawn(cmd, args, { stdio: "pipe", ... })` calls |
| Markers | `spawn(cmd, args, { stdio: "pipe", windowsHide: true })` |
| Note | The sibling package `hindsight-all` already ships this natively in its `dist/index.js` — no patch needed there |

Wiped by any `pnpm install` that reinstalls the package; re-apply from the
reference diff by anchor, then `node --check`.
