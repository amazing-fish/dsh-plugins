# Reference diffs for slim-headers @0.84.1 — not in this repo

The two reference diffs for the 0.84.1 port are **too large to land through this
machine's egress gateway** (a ~40 kB POST/push ceiling: `api.github.com` PUT and
`git push` both answer `403` with `Server: netentsec_page_push`). Same reason the
0.81.0 `source.patch` (52 KB) never made it in.

Sizes, for the record:

| File | Bytes |
| --- | --- |
| `slim-headers@0.84.1-index.patch` | 165,422 |
| `slim-headers@0.84.1-client.patch` | 262,009 |

They live on the source machine under `~/.dsh/patches/patched/dsh-context@0.84.1-slim-headers/`
alongside the `*.pristine-slim` baselines, and can be regenerated any time from the
pristine + deployed pair:

```bash
git diff --no-index \\
  ~/.dsh/patches/patched/dsh-context@0.84.1-slim-headers/index.js.pristine \\
  ~/.dsh/profiles/web/node_modules/dsh-context/lib/index.js
git diff --no-index \\
  ~/.dsh/patches/patched/dsh-context@0.84.1-slim-headers/client.js.pristine \\
  ~/.dsh/profiles/web/node_modules/dsh-context/lib/client.js
```

Because the deployed files are minified single-line bundles, the diffs are
necessarily huge; there is no smaller faithful form. What *is* reproducible in
full from this repo is the **recipe**: [`patch-0.84.1.mjs`](./patch-0.84.1.mjs)
applies the three `index.js` anchors and the three `client.js` tool-count
fallbacks by exact string, and fails loud if any anchor drifted.
