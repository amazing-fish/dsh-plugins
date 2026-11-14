# 升级前置硬约束：先停光 dsh 进程，再装 core

> 来源：2026-11-14 core `0.2.1-rc.5 → 0.2.2-rc.3` 升级实证。同款记录已写入本机
> `~/.dsh/patches/PATCHES.md` 顶部（权威运维面）。

## 硬约束

**`npm install -g @deepseek-ai/dsh@<ver>` 必须在 DSH 进程全部停止的状态下执行。**

## 为什么

core 内含原生模块 `@koromix/koffi-win32-x64/win32_x64/koffi.node`。任何 dsh 进程一旦
加载它，就把它映射进自己的地址空间；Windows 对已映射的 `.node` 持有独占句柄。

npm 安装全局包时**先把内容复制到同级暂存目录**（`@deepseek-ai/.dsh-<随机后缀>`）再切换。
复制阶段就要打开源文件 → 撞锁：

```
EBUSY: resource busy or locked, copyfile
  ...\dsh\node_modules\@koromix\koffi-win32-x64\win32_x64\koffi.node
  -> ...\@deepseek-ai\.dsh-<rand>\...\koffi.node
errno -4082
```

## 易踩的三个坑

1. **只停 `dsh web` 不够。** 本次实际的锁持有者是自 11-03 长驻的 `dsh --profile acp`
   （PID 33104）。既有的 `update-dsh-core-*.ps1` 只杀 `...bin.js ... web` 与 3080 端口，
   漏掉了 acp profile。**任何 `--profile <其它>` 的实例都持有同一份 koffi.node。**
2. **半途中断会掏空旧树。** 本次失败后实测 `undici` 仅 133/214 个文件、54 个嵌套包 0 文件，
   `dsh web` 随即报 `MODULE_NOT_FOUND` / V8 `Zone Allocation failed`。失败并非总是无害。
3. **中断后不要直接重跑。** 先核对旧树完整性（`undici` 文件数、嵌套包非空），必要时
   干净重装，否则会在残缺树上叠加。

## 固定顺序

```
停所有 dsh 进程（按 bin.js 全杀，web + acp + headless 等）
  → 装 core（+ dsh-settings / dsh-mcp-client 同步钉版）
  → 重放补丁（A 组按新版锚点移植，B 组 apply-mnemon-patches.ps1）
  → 启宿主
```

全杀命令（按 `bin.js` 匹配，不要只匹配 `web`）：

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*@deepseek-ai\dsh\lib\bin.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

## 事后核验（rc.3 实测，可作模板）

| 检查 | 期望 |
| --- | --- |
| `dsh --version` | 目标版本 |
| `undici` 文件数 | 214/214 |
| 嵌套包 0 文件数 | 0 |
| `dsh --dump-config` | exit 0 |
| `check-patches.ps1` | 32/32 |
| `dsh web` | HTTP 200 |

**加载态还要单独核**：补丁文件 mtime 必须早于宿主进程启动时间，才说明宿主真载入了
（磁盘在位 ≠ 宿主已加载，ESM 缓存要重启）。
