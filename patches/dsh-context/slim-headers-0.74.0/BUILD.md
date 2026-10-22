# Rebuild the 0.74.0 replacement

The built halves are **not** stored in this directory: the outbound proxy on the
machine that produced this port rejects uploads above roughly 40 kB, so only the
source patch, the hashes and the evidence could be transferred. Rebuilding is
deterministic and takes about a minute.

```bash
git clone https://github.com/bowenliang123/dsh-context
cd dsh-context && git checkout v0.74.0
git apply -3 ../source.patch          # one test assertion keeps upstream's own 0.74.0 form
pnpm install --ignore-scripts
npx tsdown                            # writes lib/index.js, lib/client.js, lib/index.d.ts, maps
node --check lib/index.js && node --check lib/client.js
```

Then verify the two shipped halves against `manifest.json` (`replacement` object):
`lib/index.js` must hash to `193424e0…` and `lib/client.js` to `9d5413e9…`. If they
differ, the rebuild picked up a different dependency set — stop and compare.

A prebuilt copy with both source maps lives on the production machine at
`~/.dsh/patches/patched/dsh-context@0.74.0-slim-headers/lib/` (archived 2026-10-22,
same hashes).

## Deploying (staging, not this PR)

1. Copy the whole installed package to a staging directory; keep its identity and
   every file, not just `lib/`.
2. Replace `lib/index.js`, `lib/client.js` and `lib/index.d.ts` with the rebuilt
   pair for **0.74.0** (never the 0.73.3 artifacts).
3. Package identity and version stay 0.74.0; do not bump `stateVersion`, do not
   re-apply the B12 stopgap edits to this build.
4. Host changes take effect only at a maintenance restart; refreshing the browser
   alone changes the client half.
