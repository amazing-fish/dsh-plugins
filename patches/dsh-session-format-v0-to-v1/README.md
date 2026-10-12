# dsh-session-format-v0-to-v1 patches

Reference diff against `@deepseek-ai/dsh-session-format-v0-to-v1@0.2.0-rc.2`
(bundled inside `@deepseek-ai/dsh`). Both patches live in the same file, so
`lib.index.js.patch` carries them together.

Note: the migrator's `lib/index.js` is byte-identical (SHA256) between
`dsh@0.1.7-rc.2` and `dsh@0.2.0-rc.2` — the diff applies to both.

## v0 session summary compatibility

| | |
| --- | --- |
| Symptom | ~20% of legacy v0 sessions fail to load: `历史加载失败` on the session list |
| Root cause | The stock v0→v1 migrator validates plugin message sources against the released v0 schema and rejects `summary` records with a non-`notice` form, throwing on the `plugin source` check |
| Fix | Relax the check to type validation only: accept `summary` when it is a string, regardless of form. New sessions write v3 directly and are unaffected |
| Markers | `if (source["summary"] !== void 0)` replacing the old throw |

## Subagent descriptor v2 + cron/change compatibility

| | |
| --- | --- |
| Symptom | Legacy sessions containing subagent logs or `cron/change` events fail migration |
| Root cause | Old sessions embed subagent descriptors at v2 (current is v3), and `cron/change` events from the retired community scheduler plugin are unknown to the disposition map |
| Fix | `normalizeLegacySubagentDescriptorVersion` upgrades v2 descriptors to v3; `cron/change` gets an explicit disposition so those events pass through instead of failing the whole session |
| Markers | `normalizeLegacySubagentDescriptorVersion`, `"cron/change": disposition`, `cronChangeValue` |

Wiped on every `@deepseek-ai/dsh` upgrade; re-apply from the reference diff by
anchor, then `node --check`.
