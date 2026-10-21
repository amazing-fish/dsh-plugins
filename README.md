# DSH Plugins

A community-oriented collection of plugins and UI extensions for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

## Plugins

| Plugin | Description | Status |
| --- | --- | --- |
| [Memo](./plugins/memo) | Persistent, draggable four-zone memo window with light/dark theme support | Available |
| [Skill Fuzzy Match](./plugins/skill-fuzzy-match) | Make the `/` slash menu match skills by subsequence (e.g. `/web` finds `coding-web-search`), not only by name prefix | **Retired** — obsolete since DSH 0.2.0 (native `rankByName`); useful only on DSH 0.1.x · [npm](https://github.com/users/amazing-fish/packages/npm/package/dsh-plugin-skill-fuzzy-match) |

## Patches

[`patches/`](./patches) holds reference diffs for environment patches applied
directly to installed packages (DSH core, the Mnemon memory stack, the
Hindsight daemon, FlashRank) — too small for plugins, too easy to lose on
reinstall. See the [patches index](./patches/README.md) for the full list,
version anchors, and wipe/re-apply rules.

## Installing a plugin (npm / GitHub Packages)

Some plugins here are also published to GitHub Packages as installable npm packages. Configure the `@amazing-fish` scope, then install with your package manager:

```ini
# ~/.npmrc
@amazing-fish:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
pnpm add @amazing-fish/dsh-plugin-skill-fuzzy-match   # example — this plugin is retired, see its README
```

Then add a plugin row to your DSH profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: ui-skill-fuzzy
      name: '@amazing-fish/dsh-plugin-skill-fuzzy-match'
```

Restart DSH (or reload the profile) to mount it.

## Repository layout

Each plugin lives under `plugins/<name>` and may contain separate Host and Client Cordis packages. Plugins also published to npm carry a `package.json` with `publishConfig.registry=https://npm.pkg.github.com`.

## Compatibility

The current sources target the DeepSeek Harness workspace APIs used by `0.1.0-rc.5`. DSH plugin APIs are evolving; pin or test against your checkout before deployment.

## License

MIT