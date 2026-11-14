# Patch regressions (Node 24)

No installed DSH profile or running process is modified. Tests execute the actual
`ShellRegistry` class from the official packages with fake subprocess/clock seams.
They do not establish Windows process teardown or production module loading.

1. Download the two official tarballs listed in `win-bash-fixtures.json`.
2. Verify each tarball's SHA-512 integrity before extraction. Extract only
   `package/lib/index.js` and `package/package.json` into `<fixture-root>/0.4.8/`
   and `<fixture-root>/0.4.18/`. Do not install packages or run lifecycle scripts.
3. Run:

```sh
WIN_BASH_FIXTURE_ROOT=/absolute/fixture-root node --test tests/*.test.mjs
```

The suite checks the exact source SHA-256 in the manifest. Missing sources fail
explicitly, not skip. The old B13 patches under `fixtures/` are regression-only:
they reproduce the active-command reclamation defect and must never be deployed.

Coverage includes old-fails/new-passes, pristine and v1 migration, CRLF, strict
check/no-op behavior, leases before `ensure`, overlapping calls, long commands,
abort/timeout/error cleanup, and identity/busy rechecks after asynchronous cleanup.
Conversation-first checks run in an in-memory filesystem and verify missing,
partial, marker-only, drifted, and fully installed states.
