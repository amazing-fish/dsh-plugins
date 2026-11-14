# B12 0.84.1 reference status

The earlier working-machine reference diffs were not included in this repository.
They are not evidence that the public recipe reproduces the installed build.
The recipe is now withdrawn; do not reconstruct or deploy those historical diffs
as an alternative to the disabled script.

The trusted full-data baseline for this guard is the official npm package
`dsh-context@0.84.1`, verified against its published SHA512 integrity:

`sha512-LK+4+cDgQ3Y1CuaOA2/86cy+8KMnKlnOTFnf1QK8TW7RXbzRq+8y4fiQodp4FG9yRahKbh6iuJX/+aO8Z6q6sw==`

| File | SHA256 |
| --- | --- |
| lib/index.js | 32131496f62f80b084cebce2ce4d45f4222fea061c06360465962a88901d9c3d |
| lib/client.js | 120a8d30ae6bca61a3c61e682c99d5a0472b2b495d277d644721fd9ce6e6fa88 |

Only exact matching paired bytes pass `--check`. No package source, machine
files, screenshots, credentials or process state is included in this change.
The guard performs no writes and cannot certify a running host's loaded code.
