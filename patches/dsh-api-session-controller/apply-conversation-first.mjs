#!/usr/bin/env node
/**
 * 会话优先渲染（conversation-first）——A⑯ + A⑰ 幂等重打脚本
 *
 * 背景：新开标签/点 Toast 深链时，对话要等整份 session/list（9.9MB / 4-7s）才渲染，
 * 而该会话历史 session/follow 快照 0.9s 就到了。两处客户端门槛：
 *   A⑯ dsh-api-session-controller/lib/client.js  manager.resolveTarget()
 *       原对不在 list summaries 里的会话 id 抛 "sessions.retain: unknown session"，
 *       导致 list 到达前无法打开会话。
 *   A⑰ 同文件 projectList() + retainScope()
 *       临时行逻辑只覆盖子代理（address === undefined 就 continue），且 retain 时的
 *       重投影也被 subagentAddress !== undefined 拦住；于是顶层会话在 list 到达前
 *       在 ListSnapshot.byId 里没有行，UI 用 retainedBy.mainView 扫不到主会话 → 不渲染。
 *
 * 效果（2026-10-26 实测，热宿主 3080）：正文 7.16s → 1.28s 出现，而 list 仍 6.93s 才回。
 * 影响面：client 半，刷新页面即生效，无需重启 dsh web。
 *
 * 用法：
 *   node apply-conversation-first.mjs           # 重打（幂等）
 *   node apply-conversation-first.mjs --check   # 只体检，缺任一处退出码 1
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DSH_ROOT = join(homedir(), 'npm-global', 'node_modules', '@deepseek-ai', 'dsh');
const TARGET = join(DSH_ROOT, 'node_modules', '@deepseek-ai', 'dsh-api-session-controller', 'lib', 'client.js');
const CHECK = process.argv.includes('--check');

const EDITS = [
    {
        id: 'A16',
        name: 'resolveTarget 允许 list 到达前按合法会话 id 打开',
        marker: 'A16 conversation-first',
        from: 'if (typeof target === "string" && !this.sessions.has(id) && !this.summaries.some((summary) => summary.sessionId === id) && address === void 0) throw new Error(`sessions.retain: unknown session ${id}`);',
        to: [
            'if (typeof target === "string" && !this.sessions.has(id) && !this.summaries.some((summary) => summary.sessionId === id) && address === void 0) {',
            '\t\t\t\t\t// 2026-10-26 local patch (A16 conversation-first): a durable session id may be opened before',
            '\t\t\t\t\t// session/list has landed (deep-link / toast-click path). A bogus id now fails asynchronously',
            '\t\t\t\t\t// at open() instead of here, so real errors still surface.',
            '\t\t\t\t\tif (!/^session-/.test(id)) throw new Error(`sessions.retain: unknown session ${id}`);',
            '\t\t\t\t}',
        ].join('\n'),
    },
    {
        id: 'A17a',
        name: 'projectList 为顶层已 retain 会话造临时行',
        marker: 'A17 conversation-first',
        from: [
            '\t\t\t\t\tconst address = this.manager.subagentAddress(id);',
            '\t\t\t\t\tif (address === void 0) continue;',
            '\t\t\t\t\tconst previous = previousById[id];',
        ].join('\n'),
        to: [
            '\t\t\t\t\tconst address = this.manager.subagentAddress(id);',
            '\t\t\t\t\t// 2026-10-26 local patch (A17 conversation-first): a directly retained top-level Session',
            '\t\t\t\t\t// also needs a provisional row before session/list lands, otherwise the main pane finds',
            '\t\t\t\t\t// no retained mainView row and renders nothing while the list is still loading.',
            '\t\t\t\t\tconst previous = previousById[id];',
            '\t\t\t\t\tif (address === void 0 && previous === void 0 && Object.keys(record.retention.retainedBy).length === 0) continue;',
        ].join('\n'),
    },
    {
        id: 'A17b',
        name: '临时行的 parentId/origin 改为条件展开',
        marker: 'origin: "subagent"',
        from: [
            '\t\t\t\t\t\tparentId: address.parentSessionId,',
            '\t\t\t\t\t\torigin: "subagent",',
        ].join('\n'),
        to: [
            '\t\t\t\t\t\t...address === void 0 ? {} : {',
            '\t\t\t\t\t\t\tparentId: address.parentSessionId,',
            '\t\t\t\t\t\t\torigin: "subagent"',
            '\t\t\t\t\t\t},',
        ].join('\n'),
        // A17b 的结果态与原始态都含 origin: "subagent"，故用 parentId 展开形态判定
        doneWhen: '\t\t\t\t\t\t...address === void 0 ? {} : {\n\t\t\t\t\t\t\tparentId: address.parentSessionId,',
    },
    {
        id: 'A17d',
        name: '临时行 updatedAt 取投影元数据（避免侧栏显示异常相对时间）',
        marker: 'A17d',
        from: [
            '\t\t\t\t\t\t...previous ?? {',
            '\t\t\t\t\t\t\tid,',
            '\t\t\t\t\t\t\tdisplayTitle: id,',
            '\t\t\t\t\t\t\tupdatedAt: 0',
            '\t\t\t\t\t\t},',
        ].join('\n'),
        to: [
            '\t\t\t\t\t\t...previous ?? {',
            '\t\t\t\t\t\t\tid,',
            '\t\t\t\t\t\t\tdisplayTitle: id,',
            '\t\t\t\t\t\t\t// 2026-10-26 local patch (A17d): a real summary time is unavailable before the list',
            '\t\t\t\t\t\t\t// lands; Date.now() renders as "刚刚" and the arriving list replaces the row within',
            '\t\t\t\t\t\t\t// seconds. Leaving 0 / undefined renders "56年" / "NaN年" instead.',
            '\t\t\t\t\t\t\tupdatedAt: projectionValues?.sessionListMetadata?.lastPromptAt ?? Date.now()',
            '\t\t\t\t\t\t},',
        ].join('\n'),
    },
    {
        id: 'A17c',
        name: 'retainScope 对任何缺行 id 触发重投影',
        marker: 'A17): re-project for any retained id missing a row',
        from: 'if (this.list.getSnapshot().byId[id] === void 0 && this.manager.subagentAddress(id) !== void 0) this.projectList();',
        to: [
            '// 2026-10-26 local patch (A17): re-project for any retained id missing a row, not only subagents.',
            '\t\t\t\tif (this.list.getSnapshot().byId[id] === void 0) this.projectList();',
        ].join('\n'),
    },
];

if (!existsSync(TARGET)) {
    console.error(`[FAIL] 目标文件不存在（dsh 路径变了？）：${TARGET}`);
    process.exit(2);
}

let text = readFileSync(TARGET, 'utf8');
const results = [];

for (const edit of EDITS) {
    const done = edit.doneWhen !== undefined
        ? text.includes(edit.doneWhen)
        : text.includes(edit.marker);
    if (done) {
        results.push({ id: edit.id, state: 'OK', name: edit.name });
        continue;
    }
    const count = text.split(edit.from).length - 1;
    if (count !== 1) {
        results.push({ id: edit.id, state: `DRIFT(${count})`, name: edit.name });
        continue;
    }
    text = text.replace(edit.from, edit.to);
    results.push({ id: edit.id, state: 'APPLIED', name: edit.name });
}

const bad = results.filter(r => r.state !== 'OK' && r.state !== 'APPLIED');

if (CHECK) {
    for (const r of results) console.log(`  [${r.state.padEnd(8)}] ${r.id}  ${r.name}`);
    if (bad.length > 0) {
        console.error(`\n[FAIL] ${bad.length} 处缺失/漂移，需人工按 PATCHES.md A⑯/A⑰ 重打`);
        process.exit(1);
    }
    console.log('\n[OK] conversation-first (A16+A17) 全部在位');
    process.exit(0);
}

if (bad.length > 0) {
    for (const r of results) console.log(`  [${r.state.padEnd(8)}] ${r.id}  ${r.name}`);
    console.error('\n[ABORT] 有锚点漂移，未写入任何改动。请按 PATCHES.md A⑯/A⑰ 核对当前文件形态。');
    process.exit(1);
}

if (results.every(r => r.state === 'OK')) {
    console.log('[OK] 全部已在位，无需重打');
    process.exit(0);
}

const backupDir = join(homedir(), '.dsh', 'backup', `a16-a17-replay-${Date.now()}`);
mkdirSync(backupDir, { recursive: true });
copyFileSync(TARGET, join(backupDir, 'dsh-api-session-controller-client.js.bak'));
writeFileSync(TARGET, text, 'utf8');

for (const r of results) console.log(`  [${r.state.padEnd(8)}] ${r.id}  ${r.name}`);
console.log(`\n[OK] 已写入 ${TARGET}`);
console.log(`[INFO] 备份：${backupDir}`);
console.log('[INFO] client 半 → 刷新页面即生效，无需重启 dsh web');
