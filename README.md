# DSH Plugins

> **ARCHIVED 2026-10-26 — this repository is read-only.**
>
> It served two purposes and both have run their course:
>
> - **Plugins** — `skill-fuzzy-match` was retired (DSH core ≥ 0.2.0 ships
>   native `rankByName` in `dsh-client-ui-primitives`, called directly by
>   `dsh-client-ui-skill`; see
>   [deepseek-harness#4490](https://github.com/deepseek-ai/deepseek-harness/discussions/4490)).
>   It is removed from this tree and remains only in git history. Active
>   plugin development lives in its own repositories — e.g.
>   [`amazing-fish/dsh-piano-nav`](https://github.com/amazing-fish/dsh-piano-nav),
>   [`amazing-fish/dsh-sysnotify`](https://github.com/amazing-fish/dsh-sysnotify).
> - **Patches** — [`patches/`](./patches) was a mirror of one machine's local
>   patch library. The authoritative copy is (and always was)
>   `~/.dsh/patches` on that machine (`PATCHES.md` + `check-patches.ps1`);
>   the files here are reference diffs kept for history. **No further sync
>   will be pushed to this repository** — anything newer than the last commit
>   exists only in that local library.
>
> Nothing here is needed to run DSH. Clone it if you want the historical
> diffs; do not expect updates.

A historical collection of plugins and UI extensions for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), plus reference diffs for environment patches.

## Plugins (as of archival)

| Plugin | Description | Status |
| --- | --- | --- |
| [Memo](./plugins/memo) | Persistent, draggable four-zone memo window with light/dark theme support | Historical |
| ~~Skill Fuzzy Match~~ | Made the `/` slash menu match skills by subsequence instead of name prefix | **Removed 2026-10-26** — obsolete since DSH 0.2.0 (native `rankByName`); npm package `@amazing-fish/dsh-plugin-skill-fuzzy-match@0.1.x` is deprecated |

## Patches

[`patches/`](./patches) holds reference diffs for environment patches applied
directly to installed packages (DSH core, the Mnemon memory stack, the
Hindsight daemon, FlashRank) — too small for plugins, too easy to lose on
reinstall. See the [patches index](./patches/README.md) for the full list,
version anchors, and wipe/re-apply rules. **Snapshot only — further patches
are applied locally and are not mirrored here.**

## Installing a plugin (npm / GitHub Packages)

Historical instructions, retained for reference. Configure the `@amazing-fish`
scope, then install with your package manager:

```ini
# ~/.npmrc
@amazing-fish:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then add a plugin row to your DSH profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: <plugin-id>
      name: '@amazing-fish/<plugin-package>'
```

Restart DSH (or reload the profile) to mount it.

## Repository layout

Each plugin lived under `plugins/<name>` and could contain separate Host and
Client Cordis packages. Plugins also published to npm carried a `package.json`
with `publishConfig.registry=https://npm.pkg.github.com`.

## Compatibility

The archived sources targeted the DeepSeek Harness workspace APIs used by
`0.1.0-rc.5`. DSH plugin APIs have moved on since; treat everything here as
historical.

## License

MIT
