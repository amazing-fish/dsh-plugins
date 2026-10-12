# hindsight-api engine patches

Reference diffs against `hindsight-api-slim==0.9.2` (the wheel that actually
ships `hindsight_api/engine/*`; the `hindsight-api` package is a metadata shell
depending on it). Applied to the daemon's site-packages; wiped whenever the
Python env is recreated.

## ONNX embeddings chunking — `embeddings.py.patch`

| | |
| --- | --- |
| Why | Encoding large recall candidate sets in a single `onnxruntime` call spikes memory and stalls the daemon's shared inference thread |
| Fix | Chunk encode calls via `HINDSIGHT_API_EMBEDDINGS_ONNX_ENCODE_CHUNK` (env-tunable chunk size) |
| Markers | `ONNX_ENCODE_CHUNK` |

## ONNX thread caps — `embeddings.py.patch` + `cross_encoder.py.patch`

| | |
| --- | --- |
| Why | Default onnxruntime intra-op threads oversubscribe the box and starve the daemon's other workers |
| Fix | `HINDSIGHT_ONNX_INTRA_THREADS` env knob (both engine files) — set alongside `OMP_NUM_THREADS` |
| Markers | `HINDSIGHT_ONNX_INTRA_THREADS` |

## Length-sorted rerank batching — `cross_encoder.py.patch`

| | |
| --- | --- |
| Symptom | Recall latency dominated by FlashRank cross-encoder reranking: 300 candidates took 52–168s end to end; recall on large banks blew past every timeout and internal `reflect` loops (10–15 search calls, each paying a full rerank) racked up 900s+ walls with zero successes over 12h |
| Root cause | FlashRank batches pad to the longest member of each batch. Unsorted batches pad everything to the tail length, inflating compute quadratically with outlier documents |
| Fix | Sort passages by length before batching (`sorted(indexed_texts, key=lambda p: len(p[1]))`), so each batch only pads to its own max. Isolated benchmark: **2.0–2.14×** speedup at 8 threads. Production: large-bank recall 52s → 22s; biggest bank 146s → 117–119s; reflect success rate 0/384 → 57% |
| Quality | No loss — rank perturbation stays within the int8 dynamic-quantization batch noise floor (a truncation-based alternative was evaluated and rejected) |
| Markers | `sorted(indexed_texts`, length-order batching comment |

## Verifying

```powershell
python -m py_compile <env>\Lib\site-packages\hindsight_api\engine\embeddings.py `
                          <env>\Lib\site-packages\hindsight_api\engine\cross_encoder.py
```
then restart the daemon.
