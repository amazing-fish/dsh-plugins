# Upgrade compatibility assessment — 2026-11-14

Baseline: core `@deepseek-ai/dsh` **0.2.1-rc.5** / openai **7.19.0** / `check-patches.ps1` **32/32 OK**.
Upstream at assessment time: core **0.2.2-rc.1**, dsh-context **0.84.1**, dsh-mnemon **0.5.45**, @linxin666/dsh-win-bash **0.4.18**, dsh-piano-nav **1.4.1** (= local).

This file is the upgrade-companion to the per-patch READMEs. The authoritative
operations copy lives in the machine-local `~/.dsh/patches/PATCHES.md`.

## Gap summary

| Package | Local | Upstream latest | Patch exposure |
| --- | --- | --- | --- |
| @deepseek-ai/dsh | 0.2.1-rc.5 | 0.2.2-rc.1 | group A rewiped on every core upgrade |
| dsh-context | 0.81.0 | 0.84.1 | **B12 slim-headers: 3 minors behind, porting required** |
| dsh-mnemon | ^0.5.39 | 0.5.45 | B4/B5/B10 follow this package |
| @linxin666/dsh-win-bash | 0.4.8 | 0.4.18 | **B13: 10 patch releases behind** |
| dsh-piano-nav | 1.4.1 | 1.4.1 | in sync |

Per-package rule worth repeating: `@deepseek-ai/dsh-settings` / `dsh-mcp-client`
are exactly pinned in the profile and **must move to the same version as core**
(their peer dependency pins the core subpackage exactly).

## Per-patch exposure

### Group A — wiped by core upgrade, replay via idempotent apply scripts

| Patch | Anchor fragility | Porting precedent | Next-upgrade estimate |
| --- | --- | --- | --- |
| A1/A2 openai 503 body | low — single-line anchor in `APIError.generate()` | openai 6.40.0 → 7.19.0 (major): anchor unchanged, replayed as-is | if openai stays 7.19.x under core 0.2.2-rc.1 → straight replay |
| A3 opencode-camo UA | medium — `requestHeaders` signature + UA string; UA version must track the local opencode build | 0.2.0→0.2.1 needed hunk translation (`port-hunks.py`); rc.2→rc.5 pristine byte-identical, zero porting | expect hunk translation if pi-ai ships a delta |
| A4 reasoning-only retry | medium | survived 0.2.1-rc.2 → rc.5 | replay, inspect on delta |
| A5–A7 session-format v0→v1 (summary / descriptor v2 / cron-change) | low–medium — only drifts when core touches the migrator | identical pristine rc.2↔rc.5 | replay |
| A8 session-list activity (`|| kind === "schedule"` ×2) | low | rc.5 pristine identical, replayed 2026-11-04 | replay |
| A9 conversation-first (5 client-half anchors, self-inserted markers) | low–medium — minified client.js, markers are ours | rc.5: five anchors all matched, replayed 2026-11-04 | replay |

### Group B — wiped by plugin update / any pnpm operation in the profile

| Patch | Anchor fragility | Porting precedent | Next-upgrade estimate |
| --- | --- | --- | --- |
| B1 piano probes / B2 windowsHide / B6 branches / B7 retryPolicy / B8 OpenViking sentinel | none — upstreamed or sentinel checks | in-place verification only | just run check |
| B4 recall timeout 120000 | none — one config line | replays in seconds | replay |
| B5 provider-hindsight sync retain | **high** — full `remember()` body replacement | hand-ported on 0.5.4/0.5.5/0.5.6/0.5.7 every single time | dsh-mnemon 0.5.39→0.5.45 will almost certainly need another hand port |
| B10 memory-spaces bounded fan-out | low–medium — 3 anchors | 0.5.18→0.5.20 matched verbatim | verify against the bundled memory-spaces version |
| B11 schedule-native sentinel | none | rewritten once when core 0.2.1 shipped schedule | low |
| B12 dsh-context slim-headers | **highest** | 0.74.0: 8 conflicts; 0.75.1: 8 conflicts; 0.77.0: zero (2 files); **0.81.0: architectural adaptation (19 files, +419/−55, detailShadow/foldLog rewrite)** | 0.81.0→0.84.1 spans 3 minors — budget a full porting round; worst case ≈ the 0.81.0 effort |
| B13 win-bash idle-shell GC | **medium–high** | first port (this repo, 0.4.8) | upstream 0.4.8→0.4.18 includes the temp-dir reclamation (#1993/#1995) and the payload relocation (#1997) — `lib/index.js` will have moved substantially. Before replaying: diff the new pristine, check whether the three anchors survive and whether upstream already grew an equivalent idle-reclamation mechanism (then retire B13 instead) |

### Group C — uv/python environment (hindsight reinstall), unrelated to DSH upgrades

C1–C5 (ONNX chunking/threads, flashrank int8 map): intact; re-apply only when
the uv hash directory changes.

### Group D — persistent configuration

D1 (start-daemon rerank cap): not wiped by upgrades.

## Pre-flight checklist for the next core upgrade (0.2.2-rc.1)

1. Snapshot `profiles/web/package.json` + `pnpm-lock.yaml`; record a fresh
   `check-patches.ps1` baseline.
2. Upgrade core **and** the exactly-pinned `dsh-settings` / `dsh-mcp-client`
   to the same version in one move.
3. Replay group A (all apply scripts are idempotent; `node --check` after each).
4. If plugin upgrades ride the same round (order: core first, then plugins):
   - B4/B10: replay after checking the bundled mnemon versions;
   - **B5**: hand-port `remember()` against 0.5.45 (highest-frequency manual port);
   - **B12**: read the 0.81.0→0.84.1 upstream delta first; budget ≈ the 0.81.0
     architectural port if `detailShadow`/`foldLog` moved again;
   - **B13**: diff the 0.4.18 pristine first — retire if upstream grew an
     equivalent, otherwise re-anchor `sweepIdle`.
5. Post-upgrade verification: `check-patches.ps1` all green, `session/list`
   latency probe, piano keys visible, one `win_bash` smoke call.

Risk ranking for the next round: **B12 > B5 > B13 > A3 > everything else (low)**.
