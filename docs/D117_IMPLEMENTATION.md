# D-117 网页节目切换同步 OBS

日期：2026-09-19

状态：已发布；自动化、远端浏览器与本机 OBS 实测通过，现场投影和音视频联排待完成。

## 已实施

- 后台网页仍是当前节目的唯一权威来源。节目页点击“下一项”或“执行选中项”成功后，服务端发布一个受保护的 OBS scene cue。
- 本机 `scripts/obs-audio.mjs` 桥接每 500ms 拉取 scene cue，使用本地 `OBS-迎新晚会-20260913/节目素材对应.json` 按 `programId` 做唯一映射，确认后调用 OBS WebSocket `SetCurrentProgramScene`。
- 桥接启动、断线重连或 OBS 被人工改到其他场景时都会重新对齐；未知、重复或缺失映射会停止本次切换并持续重试，不按标题猜测场景。
- 非 `RUNNING + PROGRAM_SUPPORT`、没有当前节目或桥接令牌不可用时不切场，避免开场、谢幕和服务器状态不完整时误触发。
- 控台文案已改为“网页确认切换后 OBS 桥接自动同步对应场景”，并保留普通节目媒体由主持口令控制的说明。

## 验证

- `pnpm typecheck` 通过。
- `tests/unit/interaction-audio.test.ts` 与 `tests/integration/v2-runtime-flow.test.ts` 共 26 项通过，覆盖唯一节目映射、缺失／重复映射 fail closed 和服务端 cue 边界。
- `node --check scripts/obs-audio.mjs`、`node --check scripts/obs/scene-sync.mjs` 通过。
- 正式构建 `VITE_BASE_PATH=/welcomeparty/ pnpm build:formal` 通过。
- `pnpm deploy:check` 与 `pnpm docs:check` 通过。全量并行测试有 533 项通过、14 项因并行 I/O 超时；受影响的 7 个文件随后以单 worker 重跑，99 项全部通过，没有断言失败。
- 生产版本 `20260919-d117-23676e22f400` 已原子切换，归档 SHA-256 为 `b639684bdff8f331760e3c229280934a3cdb3e1dc754311c82589d290b3553c3`。发布前后的 `resetEpoch=4`、`RUNNING + PROGRAM_SUPPORT`、互动一 `BUZZER_OPEN`、节目目录和奖项数据均保持。
- 远端受保护 scene cue 返回当前节目 `event2026-07`，本机 OBS 当前场景为唯一映射的“互动环节一 · 歌名 decoder”；远端大屏、观众页、后台、健康检查和快照均返回 200，后台可见自动同步提示与最新版答案。
- 在 OBS 未推流、未录制时，将 Program 临时切到纯黑的“应急 · 黑色背景”；常驻桥接在 105ms 内按服务器当前节目恢复到“互动环节一 · 歌名 decoder”。证据见 `output/deploy-d117/obs-scene-reconcile.json`。

## 操作与边界

1. 确认本机 OBS WebSocket 和 `启动互动音频桥接.ps1` 正在运行。
2. 在网页点击“下一项”；网页成功回执表示服务器节目已切换，桥接随后把 OBS 切到对应场景。
3. OBS 不可用时服务器节目状态仍保留，桥接恢复后会按当前节目补做一次对齐；不会把网页回退到旧节目。
4. 真实投影画面、音视频连续性和场馆现场仍需要联排记录，浏览器/API 通过不等于现场硬件签核。
