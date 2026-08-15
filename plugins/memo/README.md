# Memo Plugin

A persistent floating memo window for DeepSeek Harness.

## Features

- Four zones: urgent, important/later, ideas, and other
- Add and delete memo items
- Durable JSON persistence on the DSH Host
- Draggable floating window constrained to the viewport
- Collapsed mode previews the first memo
- Responsive layout
- Automatic light and dark theme adaptation using DSH theme tokens
- Host-side serialized writes and atomic file replacement

## Packages

- `host/`: Host Cordis service and generated Typert Remote source contract
- `client/`: Client Cordis plugin registered in the additive `shell.overlay` slot

## Data

The Host package accepts a `root` directory and stores the document as `memo.json` beneath it. Example:

```yaml
- id: memo
  name: '@deepseek-ai/dsh-host-memo'
  config:
    root: 'D:\Data\dsh\memo'
```

The resulting file is `D:\Data\dsh\memo\memo.json`.

## DSH integration

This plugin currently follows the in-workspace package integration model. To integrate it into a DSH checkout:

1. Copy `host` to `packages/host/memo` and `client` to `packages/client/ui-memo`.
2. Add the packages to the root TypeScript project references and path mappings.
3. Import and mount `@deepseek-ai/dsh-host-memo/remote` in `packages/api/remotes/src/client/index.ts`.
4. Add both package dependencies to `packages/bundle/web-app/package.json`.
5. Add the Host and Client rows to `packages/bundle/web-app/cordis.patch.yml`:

```yaml
- id: memo
  name: '@deepseek-ai/dsh-host-memo'
  config:
    root: 'D:\Data\dsh\memo'

- id: ui-memo
  name: '@deepseek-ai/dsh-client-ui-memo'
```

6. Install dependencies and rebuild Host, Client, and Web artifacts.

See the [DeepSeek Harness repository](https://github.com/deepseek-ai/deepseek-harness) for its current workspace conventions.

## Persistence behavior

- A missing file is initialized as an empty version-1 document.
- Existing data is validated before use.
- Malformed data is not silently replaced.
- Mutations are serialized inside one DSH process.
- Writes use atomic sibling-file replacement.
- Do not point multiple DSH processes at the same file without adding a cross-process lock.

## License

MIT
