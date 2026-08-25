# Skill Fuzzy Match Plugin

Make the DSH `/` slash menu match **skills** by ordered-subsequence fuzzy match instead of strict `startsWith` prefix match.

## Problem

In the DSH slash menu, the **skill** source (`dsh-client-ui-skill`) matches candidate skills with `skill.name.startsWith(query)`. So typing `/xx` only surfaces skills whose name **starts with** `xx`; skills whose name merely **contains** `xx` (e.g. `aa-xx-bb`) never appear.

This is inconvenient because skill names are kebab-case and often long (`coding-web-search`, `dataworks-sql-runner`, `openviking-memory`, `python-code-review-optimize`). Users frequently remember only a middle token (`web`, `sql`, `memory`, `review`) and type `/web` expecting to see `coding-web-search` — but it does not appear.

It is also inconsistent with the sibling **command** source (`dsh-client-ui-commands`), which already uses an ordered-subsequence fuzzy matcher (`fuzzyScore` + `boundaryBonus`, `-`/`_` boundary weighting, prefix-first ranking, case-insensitive). So `/xx` can fuzzy-match a command `aa-xx-bb` but cannot fuzzy-match a skill `aa-xx-bb` — same menu, two behaviors.

## What this plugin does

Patches the live `/skill` source's `candidates` method in place to use the **same fuzzy subsequence matcher** as the command source:

- empty query → return all skills (unchanged)
- non-empty query → keep any skill whose name contains `query` as an ordered subsequence, rank by score, **prefix matches first**, `-`/`_` boundary matches boosted
- case-insensitive (also fixes `/Web` not matching `coding-web-search`)

The original `candidates` is restored when the plugin is stopped, updated, or unloaded.

## How it works

`dsh-client-ui-skill` already registered a `/` source named `skill`. Re-registering the same `(trigger, name)` throws, so this plugin monkey-patches the live source object's `candidates` field instead. It reuses the original catalog fetch (calling the original `candidates` with an empty query returns the full skill list, since `startsWith('')` is true for every name) and then filters/ranks locally with `fuzzyScore`. No duplicate fetch, no new network calls.

It injects `inputTriggers` (to access the source registry) and `timer` (to retry briefly if the skill source registers after the plugin loads).

## Files

- `client/src/index.js` — the client plugin body (plain JavaScript; no build step)

## Usage

### As a dynamic plugin (temporary, per-process)

Load it through the DSH dynamic Cordis plugin tooling (`cordis_define` + `cordis_run`) with `code.client` set to the contents of `client/src/index.js`. The patch takes effect immediately in the current process and is undone on stop/unload. Dynamic plugins do not survive a DSH process restart.

Verify in the browser DevTools console:

```js
window.__skillFuzzyPatched   // true once patched
```

You should also see `[skill-fuzzy] PATCHED skill source candidates ...` in the console. Then typing `/sql`, `/memory`, `/web` in the slash menu surfaces `dataworks-sql-runner`, `openviking-memory`, `coding-web-search` respectively.

### Permanent integration

For a permanent fix that survives restarts, the matching logic should be changed in the DSH source itself (`packages/client/ui-skill` in `deepseek-ai/deepseek-harness`) — reuse the `fuzzyScore`/`boundaryBonus` already present in `packages/client/ui-commands`. See the upstream discussion: <https://github.com/deepseek-ai/deepseek-harness/discussions/4490>.

## Compatibility

Targets the DSH workspace APIs used by `0.1.0-rc.5`-era builds. The patched APIs (`inputTriggers.live.sources`, the `/skill` source shape) are internal and may change; pin or test against your checkout before deployment.

## License

MIT