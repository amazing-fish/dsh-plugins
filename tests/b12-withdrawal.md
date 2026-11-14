# B12 withdrawal regression

Download official npm `dsh-context@0.84.1` to an isolated directory, verify the
package SHA512 from `b12-fixtures.json`, then extract `package/lib/index.js` and
`package/lib/client.js`. Do not install into or restart a working profile.

```sh
B12_FIXTURE_ROOT=/absolute/path/to/package/lib node --test tests/b12-withdrawal.test.mjs
```

The fixture is external to the repository. Missing input or either wrong hash
fails immediately, rather than silently skipping. Tests run the actual CLI on
copies in temporary directories, covering exact-pair success, refused apply and
revert, partial/missing/modified files, marker-only false positives, and unknown
arguments. Snapshots verify no file writes on each path.

This verifies the deployment guard, not the original performance optimization,
Windows process behavior, working-machine installation or loaded-host version.
