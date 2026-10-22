# Slim header envelopes

Local, reviewable implementation based on upstream dsh-context tag v0.73.3 (`a7ce2158c18bd76bd23dfb64146fd357209c12ce`). Production deployment has not occurred; this branch prepares the implementation and evidence for review.

- [Decision and B12 retirement](./DECISION.md)
- [Measurements and verification](./RESULTS.md)
- [English issue draft](./UPSTREAM-ISSUE.md) and [PR draft](./UPSTREAM-PR.md)
- `source.patch`: reviewable source diff; `complete-files/`: complete changed files, including tests and contract documentation.
- `replacement/lib/`: rebuilt host, client and declarations. Replaces the two B12 edits as a pair; no minified mega-line diff.
- `manifest.json`: npm-pristine and replacement SHA-256 values.

## Stage only (Windows PowerShell)

```powershell
node .\stage-package.mjs --source 'C:\Users\h00899877\.dsh\profiles\web\node_modules\dsh-context' --stage 'C:\Temp\dsh-context-slim-headers\package'
```

The command reads the installed package and writes a new temporary copy. It accepts exact npm 0.73.3 bytes or the audited B12 anchor form that normalizes back to those bytes; unknown host/client changes reject before writing. It verifies replacement hashes and runs `node --check` on both halves. Repeating the command verifies the staged result without changing the source. A different comment/anchor variant may require read-only inspection; never relax the hash guard to force it through.

The staged package has no dependency installation. To load it in an isolated profile, supply dependencies from an isolated runtime or copy it as a real directory into that profile's node_modules; a symlink to an external stage may change Node's dependency-resolution root. Do not install/add/remove in the production profile.

This tool deliberately has no production switch or restart action. Deployment, full-package rollback capture, unrelated-patch reconciliation and the host restart remain separate, later authorized actions. See DECISION.md.

## Reproduce HTTP acceptance

From a disposable experiment directory, install the exact CLI in a separate runtime and build the pristine and candidate checkouts with their pinned lockfile. Then run (PowerShell):

```powershell
python .\acceptance.py --runtime 'C:\Temp\ctx-runtime\node_modules\@deepseek-ai\dsh\lib\bin.js' --baseline 'C:\Temp\ctx-pristine' --candidate 'C:\Temp\ctx-candidate' --workdir 'C:\Temp\ctx-ab-new' --count 2542
```

`--workdir` must not exist. The runner creates distinct homes, binds only loopback ephemeral ports, authenticates against each new instance, checks all content assertions, writes measurements.json-style results and redacted server logs, and terminates only the processes it created. No real logs, profile, memory service or port 3080 are used.

## Restore the local implementation branch

In a clone containing upstream v0.73.3:

```powershell
git fetch .\dsh-context-local.bundle fix/slim-header-envelopes:fix/slim-header-envelopes
git switch fix/slim-header-envelopes
```

The bundle depends on the v0.73.3 base already present in that clone. Alternatively apply source.patch to that exact base. complete-files contains every changed file in full, as requested. UPSTREAM-LICENSE accompanies those source and built artifacts.
