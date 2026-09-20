# D121 开场霓虹背景、头像移交与 Worth it 背景

## 变更

- 负责人讲话网页只保留报幕标题和舞台背景，不再加载孙晟博、罗慧婷头像；两张头像由 OBS 现场图层自行放置。
- 负责人讲话阶段网页仍保持 HOST 视觉，但 scene cue 发出 `ceremony-speech` 专属节目标识，桥接按本地映射切换到 OBS `负责人讲话` 场景。
- 活动开始前的大屏继续显示与活动阶段同源的霓虹背景，保留入场人数和流星状态逻辑，不切换为纯黑画面。
- 校园图鉴奖项读取顺序固定为：路线三等奖、路线二等奖、路线一等奖、最佳摄影/最佳创意组合、打卡积分前 20。
- 《Worth it》（`event2026-04`）使用负责人提供的 `worth-it-obs.jpg` 作为网页/OBS 浏览器源背景。

## 验证

- `pnpm typecheck`
- `pnpm exec vitest run tests/integration/v2-awards.test.ts tests/integration/v2-runtime-flow.test.ts tests/unit/protocol-v2.test.ts`
- `pnpm test`
- `pnpm docs:check`
- `VITE_BASE_PATH=/welcomeparty/ pnpm build:formal`

## 发布记录

- 生产版本：`20260919-d120-ca9cdd5d000c`
- 发布包 SHA-256：`cb677aedc14caca6918ebde1474d4be6ce0d1ad2dbb32dfb830745b78834b32a`
- 服务器原子切换、数据库备份与事实校验、健康检查已完成；OBS 两个浏览器源已强制刷新。
- 本地映射已验证：`ceremony-speech → 负责人讲话`。现场执行负责人讲话时，桥接会调用 OBS `SetCurrentProgramScene` 并回读确认。
