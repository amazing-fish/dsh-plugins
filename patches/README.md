# patches

Environment patches for bundled dependencies of DeepSeek Harness that are too
small to ship as plugins but too annoying to lose on every upgrade. None of
these are npm packages — they are applied directly to the installed packages.

## openai-error-503-body

| | |
| --- | --- |
| Target | `@deepseek-ai/dsh` → bundled `openai/core/error.mjs` (ESM runtime path) + `error.js` (CJS, belt-and-braces) |
| Symptom | Upstream 503 queue responses show as `503 status code (no body)`; the queue notice (e.g. `已为您锁定...`) is dropped |
| Root cause | Upstream sends a non-standard body `{code, message}` without an `error` wrapper. The JS OpenAI SDK's `APIError.generate()` only reads `errorResponse['error']`, so the body message is discarded |
| Fix | Fall back to `errorResponse['message']` when no `error` object exists |
| Verified on | openai@6.26.0 / @deepseek-ai/dsh 0.1.1-rc.2 (2026-08-29) |

### Usage

```powershell
./apply.ps1                                   # auto-detect dsh install
./apply.ps1 -DshRoot "path\to\@deepseek-ai\dsh"  # explicit
```

The script is idempotent (skips already-patched files), anchored by text
rather than line numbers, and runs `node --check` after inserting.
**Restart the DSH process afterwards** — ESM modules are cached per process.

### Manual verification

```powershell
node -e "import('file:///<dsh>/node_modules/openai/core/error.mjs').then(m => { console.log(m.APIError.generate(503, {code: 503, message: 'queued, please wait'}, undefined, new Headers()).message) })"
# expect: 503 queued, please wait
```

### Notes

- The patch is lost whenever `@deepseek-ai/dsh` is upgraded (its install
  reinstalls `node_modules`). Re-run `apply.ps1` after each upgrade.
- `openai-error-503-body.patch` is a reference diff anchored to
  openai@6.26.0; prefer `apply.ps1` across versions.
- If `apply.ps1` throws `anchor not found`, openai's `generate()` has changed
  upstream — check whether the fix landed upstream before re-deriving it.
