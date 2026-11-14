# dsh-win-bash — idle shell reclamation (B13)

Persistent shells are keyed by the calling agent and normally released on
`agent/disposed`, which is not the same as a subagent finishing a turn. The
original incident and memory measurements are recorded in [issue #18](https://github.com/amazing-fish/dsh-plugins/issues/18).

## v2: execution is not idleness

The original B13 used only the timestamp of the last completed command. Another
owner's call could therefore kill a command still running for 30 minutes, or a
new command using a previously idle shell. v2 acquires an owner execution lease
**before the first await in `run()`**, releases it in `finally`, and excludes active
owners from idle reclamation. It rechecks both the lease and shell identity after
every asynchronous termination, so a newly active or replaced shell is not killed.

Idle/exited shells are still reclaimed by `ensure()`. The caller's own shell stays
intact. Default idle time remains 30 minutes (`DSH_WIN_BASH_IDLE_MS` may override
with a finite positive number). There is no timer, scheduler, or new process.
If a reader/write error leaves command completion unknown, that shell is excluded
from idle GC until it exits or is explicitly disposed. A later successful command
does not erase another run's uncertainty. This can retain a shell longer after an
exception; avoiding accidental termination takes precedence over reclaiming it.
Upstream command abort/timeout and explicit disposal behavior remain unchanged.

## Apply / inspect / rollback

`apply-shell-gc.mjs` supports the official **0.4.8 and 0.4.18** source shapes,
including the latter's `temp` field. Complete original B13 v1 patches can migrate;
unknown or incomplete patch shapes fail before writing.

```sh
node apply-shell-gc.mjs --target /absolute/path/to/lib/index.js --check
node apply-shell-gc.mjs --target /absolute/path/to/lib/index.js
node apply-shell-gc.mjs --target /absolute/path/to/lib/index.js --revert
```

Without `--target`, it uses the historical `~/.dsh/profiles/web/node_modules/
@linxin666/dsh-win-bash/lib/index.js`. `--check` checks all v2 anchors, not merely
a marker. Application preserves an exact pre-v2 snapshot at
`index.js.before-shell-gc-v2`; a differing existing snapshot causes an error
rather than silently overwriting rollback evidence. This is separate from the
older `.pristine-shell-gc` backup. Revert restores the pre-v2 state, which may
include the defective v1 patch; it does not assert that state is safe.

No command in this tool restarts the host or terminates a live process. Adoption
by a running host remains a separate deployment step. A file timestamp preceding
host startup alone does not prove the resolved module was loaded.

## Evidence and scope

Reference diffs are generated against official npm 0.4.8 / 0.4.18 tarballs with
verified SHA-512, and source SHA-256 recorded in `tests/win-bash-fixtures.json`.
See [regression instructions](../../tests/README.md). These tests use real class
code with simulated process/clock seams; they are not Windows E2E or a claim that
any real task was interrupted. TEMP-directory cleanup fixed upstream is distinct
from shell-process reclamation and remains untouched.
