# dsh-llm-pi-ai patches

Reference diffs against `@deepseek-ai/dsh-llm-pi-ai@0.2.0-rc.2` (bundled inside
`@deepseek-ai/dsh`). Both patches live in the same file, so
`lib.index.js.patch` carries them together.

## opencode-camo user-agent

| | |
| --- | --- |
| Target | `@deepseek-ai/dsh-llm-pi-ai/lib/index.js` → `requestHeaders()` + adapter call site |
| Why | Some self-hosted / managed gateways only accept requests that look like the official opencode client and reject unknown agents. This maps specific gateway hosts to the real opencode client UA (extracted from the opencode binary: `opencode/<ver> ai-sdk/provider-utils/<ver> runtime/bun/<major>`) and overrides `user-agent` for them, leaving everything else untouched |
| Notes | **Hosts in the committed diff are anonymized placeholders** (`<your-gateway-1.internal.example`) — substitute your own gateway hostnames in `OPENCODE_CAMO_TARGETS`. Update the version numbers whenever your opencode client self-upgrades, or the gateway will see a stale client version |
| Markers | `OPENCODE_CAMO_TARGETS`, `opencodeCamoUserAgent` |

## llm-reasoning-only-retry

| | |
| --- | --- |
| Target | same file → `mapStopReason()` |
| Symptom | A model finishes with `stop` but emits only thinking blocks (no visible content). Stock code treats this as a normal empty completion, so the turn silently "succeeds" with nothing |
| Fix | Treat thinking-only completions like empty ones: fail with `EMPTY_RESPONSE_CODE` and message `... (reasoning only)`, which routes into the harness LLM retry path and gets a fresh attempt |
| Markers | `reasoning only`, `block.type === "thinking"` |

Both patches are wiped whenever `@deepseek-ai/dsh` is upgraded. Re-apply from
the reference diff by anchor (not line numbers), then `node --check` the file.
