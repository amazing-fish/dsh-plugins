# FlashRank int8 model map patch

Reference diff: `Config.py.patch` (against `FlashRank==0.2.10`).

| | |
| --- | --- |
| Target | `flashrank/Config.py` — model registry mapping |
| Why | The registry entry for `bge-zh-reranker-base` points at the full-precision ONNX file; on CPU-only deployments the int8 quantized file is dramatically faster and fits the rerank latency budget (see the sibling hindsight-api-engine patches) |
| Fix | `"bge-zh-reranker-base": "model_quantized.onnx"` |
| Markers | `model_quantized.onnx` under `bge-zh-reranker-base` |

Wiped whenever the Python env / FlashRank is reinstalled; re-apply from the
reference diff, then `python -m py_compile`.
