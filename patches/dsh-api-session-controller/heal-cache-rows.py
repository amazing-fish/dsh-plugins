#!/usr/bin/env python
"""Heal session-projection cache rows frozen before this patch was applied.

`apply.mjs` changes how future events fold, but cached `sessionListMetadata` rows keep
their old value (by design — no `stateVersion` bump). A session that already sits at its
last human prompt therefore stays stale until its next delivery. This script rewrites
just `rows.sessionListMetadata.val.lastPromptAt` for sessions whose last *scheduled*
delivery is newer, leaving `ver`, `seq` and every other projection row untouched.

Session logs are read in both supported encodings: `session.v4.jsonl.zstd`
(`compression: zstd`, the default) and plain `session.v4.jsonl`
(`compression: none`).

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
import re
import sys

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


def log_paths(sid):
    """Session log candidates, newest format generation first.

    The extension follows the configured `compression`: `.jsonl.zstd` for zstd,
    `.jsonl` for `compression: none`. Both are valid; neither is preferred for
    reading, only for picking the highest generation.
    """
    paths = glob.glob(os.path.join(ROOT, 'sessions', '*', sid, 'session*.jsonl'))
    paths += glob.glob(os.path.join(ROOT, 'sessions', '*', sid, 'session*.jsonl.zstd'))

    def rank(path):
        generation = re.search(r'session\.v(\d+)\.jsonl', os.path.basename(path))
        return (int(generation.group(1)) if generation else 0, os.path.getmtime(path))

    return sorted(set(paths), key=rank, reverse=True)


def read_log(path):
    with open(path, 'rb') as fh:
        if path.endswith('.zstd'):
            import zstandard  # pip install zstandard; only needed for compressed logs
            # A session log is a concatenation of zstd frames; a single-frame read
            # returns the header only, so read across frames.
            return zstandard.ZstdDecompressor().stream_reader(fh, read_across_frames=True).read()
        return fh.read()


def fold(sid, seq):
    """Return (last human prompt, last scheduled delivery) inside the folded prefix."""
    human = sched = 0
    for path in log_paths(sid):
        raw = read_log(path)
        seen = False
        for line in raw.decode('utf-8', 'replace').splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)  # the tail frame / line may be torn
            except Exception:
                continue
            if event.get('type') != 'user/message' or (event.get('seq') or 0) > seq:
                continue
            seen = True
            kind = (event.get('data') or {}).get('source', {}).get('kind')
            if kind == 'user':
                human = max(human, event['time'])
            elif kind == 'schedule':
                sched = max(sched, event['time'])
        if seen:
            break  # the highest-generation log that carries events wins
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
