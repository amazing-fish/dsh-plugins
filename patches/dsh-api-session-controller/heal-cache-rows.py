#!/usr/bin/env python
"""Heal session-projection cache rows frozen before this patch was applied.

`apply.mjs` changes how future events fold, but cached `sessionListMetadata` rows keep
their old value (by design — no `stateVersion` bump). A session that already sits at its
last human prompt therefore stays stale until its next delivery. This script rewrites
just `rows.sessionListMetadata.val.lastPromptAt` for sessions whose last *scheduled*
delivery is newer, leaving `ver`, `seq` and every other projection row untouched.

Safety:
  * only events with `seq <= row.seq` are considered (the cached watermark must stay
    truthful);
  * the original cache file is copied to `$DSH_HOME/backup/session-projcache-activity-heal-<ts>/`
    before it is rewritten;
  * with `--dry-run` nothing is written.

Usage:
  python heal-cache-rows.py                 # sessions with a delivery today
  python heal-cache-rows.py --all           # scan every session log (slow)
  python heal-cache-rows.py --dry-run
"""
import datetime
import glob
import json
import os
import sys

import zstandard  # pip install zstandard

ROOT = os.environ.get('DSH_HOME') or os.path.expanduser('~/.dsh')
ALL = '--all' in sys.argv
DRY = '--dry-run' in sys.argv
BK = os.path.join(ROOT, 'backup',
                  f"session-projcache-activity-heal-{datetime.datetime.now():%Y%m%d-%H%M%S}")


def targets():
    path = os.path.join(ROOT, 'storages/schedule.json')
    if not os.path.exists(path):
        sys.exit(f'no schedule store at {path}')
    tasks = json.load(open(path, encoding='utf-8'))['tables']['tasks']
    today = datetime.date.today().isoformat()
    out = {}
    for task in tasks.values():
        for rec in (task.get('deliveryHistory') or {}).get('records') or []:
            if ALL or rec['deliveredAt'].startswith(today):
                sid = task['sessionId']
                out[sid] = max(out.get(sid, ''), rec['deliveredAt'])
    return out


def fold(sid, seq):
    """Return (last human prompt, last scheduled delivery) inside the folded prefix."""
    logs = sorted(glob.glob(os.path.join(ROOT, 'sessions', '*', sid, 'session*.jsonl.zstd')),
                  key=os.path.getmtime)
    if not logs:
        return 0, 0
    # A session log is a concatenation of zstd frames; a single-frame read returns the
    # header only, so read across frames.
    with open(logs[-1], 'rb') as fh:
        raw = zstandard.ZstdDecompressor().stream_reader(fh, read_across_frames=True).read()
    human = sched = 0
    for line in raw.decode('utf-8', 'replace').splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)  # the tail frame may be torn
        except Exception:
            continue
        if event.get('type') != 'user/message' or (event.get('seq') or 0) > seq:
            continue
        kind = (event.get('data') or {}).get('source', {}).get('kind')
        if kind == 'user':
            human = max(human, event['time'])
        elif kind == 'schedule':
            sched = max(sched, event['time'])
    return human, sched


def fmt(ms):
    return datetime.datetime.fromtimestamp(ms / 1000).strftime('%m-%d %H:%M') if ms else None


def main():
    healed = skipped = 0
    for sid in targets():
        cache = os.path.join(ROOT, 'storages/session_projcache/sessions', sid + '.json')
        if not os.path.exists(cache):
            continue
        record = json.load(open(cache, encoding='utf-8'))
        row = record['record']['rows'].get('sessionListMetadata')
        if not row:
            continue
        old = row['val'].get('lastPromptAt') or 0
        human, sched = fold(sid, row['seq'])
        if sched > old and sched > human:
            print(f'HEAL {sid[:8]} {fmt(old)} -> {fmt(sched)} (seq={row["seq"]}, human={fmt(human)})')
            if not DRY:
                os.makedirs(BK, exist_ok=True)
                with open(os.path.join(BK, sid + '.json'), 'w', encoding='utf-8') as fh:
                    json.dump(record, fh, ensure_ascii=False)
                row['val']['lastPromptAt'] = sched
                with open(cache, 'w', encoding='utf-8') as fh:
                    json.dump(record, fh, ensure_ascii=False)
            healed += 1
        else:
            skipped += 1
    tag = '(dry-run) ' if DRY else ''
    print(f'{tag}healed={healed} skipped={skipped}' + ('' if DRY or not healed else f' backups={BK}'))


if __name__ == '__main__':
    main()
