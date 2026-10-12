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
