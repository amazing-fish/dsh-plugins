# @openviking/dsh-memory-plugin patch

Reference diff: `auto-memory-off.patch` (against
`@openviking/dsh-memory-plugin@0.5.8`).

| | |
| --- | --- |
| Target | `index.mjs` — module top level |
| Why | The plugin's automatic memory participation (session-start / pre-step / session-event / session-flush hooks that read-inject and write-capture into OpenViking) is disabled in this setup: a separate Mnemon + Hindsight stack owns automatic memory, and OpenViking stays as a resource/skill library plus manual tooling |
| Fix | `const AUTO_MEMORY = false` gates the four auto hooks behind `if (AUTO_MEMORY)` prefixes. Everything else is **kept**: MCP tools, the openviking-memory skill, `viking://` guards, manual APIs and the openvikingMemory service |
| Markers | `const AUTO_MEMORY = false` |

The plugin is modularized since 0.3.2, so the gate works by prefixing the four
auto-hook registrations. Wiped on plugin update; re-apply from the reference
diff by anchor.

**Obsolete on ≥ 0.5.25 (2026-10-15):** the plugin restructured — `index.mjs`
became a thin entry (~5 KB) that wires `runtime.mjs` (the capture engine,
invoked as `runtime.capture(session, event)` from `index.mjs`), plus
`lifecycle.mjs` (`injectStartupProfile`), `capture.mjs`, `mcp.mjs`,
`skills.mjs`, `uri-guard.mjs`. The `AUTO_MEMORY` constant no longer exists, so
the old reference patch has no anchor. Re-gating on 0.5.25 requires a new port
(gate `runtime.capture()` and `injectStartupProfile()`), or disabling the
plugin row outright — note that disabling by the wrong entry id silently does
nothing: the loader entry is `openviking-memory-runtime`, not
`openviking-memory`. Direction of record on this machine: Mnemon + Hindsight
are the sole automatic memory chain; OpenViking stays as a resource/skill
library plus manual tooling. The MCP server connection (`openviking`) is
independent of this plugin, so manual `mcp__openviking__*` tooling keeps
working either way.

**Resolved 2026-10-15 (option A — full retirement):** the plugin entry
`openviking-memory-runtime` was disabled via the plugin manager (persisted as
a `disabled: true` row in the profile's patch layer). Automatic capture /
startup injection / duplicate writes stop; the MCP server connection and the
on-disk data stay available for manual tooling. No port of this patch will be
made — the whole plugin no longer loads. A disabled row must use the real
patch id `openviking-memory-runtime`; a row named `openviking-memory` matches
nothing and silently no-ops (that inert row caused a "retirement didn't
happen" misdiagnosis).
