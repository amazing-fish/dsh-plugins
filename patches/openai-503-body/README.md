# openai 503 body passthrough

| | |
| --- | --- |
| Target | `@deepseek-ai/dsh` → bundled `openai/core/error.mjs` (ESM runtime path) + `error.js` (CJS, belt-and-braces) |
| Symptom | Upstream 503 queue responses show as `503 status code (no body)`; the queue notice (e.g. a "locked, please wait" message) is dropped |
| Root cause | Upstream sends a non-standard body `{code, message}` without an `error` wrapper. The JS OpenAI SDK's `APIError.generate()` only reads `errorResponse['error']`, so the body message is discarded |
| Fix | Fall back to `errorResponse['message']` when no `error` object exists |
| Verified on | openai@7.19.0 / @deepseek-ai/dsh 0.2.1-rc.2 (2026-10-20); previously openai@6.40.0 / dsh 0.2.0-rc.2 (2026-10-12) and openai@6.26.0 / dsh 0.1.1-rc.2 (2026-08-29) |

Reference diffs: `error.mjs.patch` + `error.js.patch` (anchored to
openai@7.19.0). The historical single diff against openai@6.26.0 is kept as
`openai-error-503-body@openai-6.26.0.patch`.

The 6.40.0 → 7.19.0 jump (dsh 0.2.1-rc.2 pulls a new major of the SDK) did
**not** touch `APIError.generate()`: the anchor line
`        const error = errorResponse?.['error'];` is still unique, so the same
three inserted lines apply verbatim (+3 lines per file, `node --check` clean).

## Usage

```powershell
./apply.ps1                                   # auto-detect dsh install
./apply.ps1 -DshRoot "path\to\@deepseek-ai\dsh"  # explicit
```

The script is idempotent (skips already-patched files), anchored by text
rather than line numbers, and runs `node --check` after inserting.
**Restart the DSH process afterwards** — ESM modules are cached per process.

## Manual verification

```powershell
node -e "import('file:///<dsh>/node_modules/openai/core/error.mjs').then(m => { console.log(m.APIError.generate(503, {code: 503, message: 'queued, please wait'}, undefined, new Headers()).message) })"
# expect: 503 queued, please wait
```

## Notes

- The patch is lost whenever `@deepseek-ai/dsh` is upgraded (its install
  reinstalls `node_modules`). Re-run `apply.ps1` after each upgrade.
- If `apply.ps1` throws `anchor not found`, openai's `generate()` has changed
  upstream — check whether the fix landed upstream before re-deriving it.
