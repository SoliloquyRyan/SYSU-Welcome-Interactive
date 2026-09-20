# SYSU Welcome Interactive

> 以星光作序，与未来相逢。

这是中山大学智能工程学院迎新晚会的互动系统：观众从手机进入，舞台大屏把每个人的星光汇成一场共同的现场，主控台负责节目、互动、颁奖和收尾。项目从一个“让每个人拥有一颗星”的想法开始，逐渐长成了可以排练、验证、恢复和交接的三端系统。

断网首先是基础设施问题，接下来要做的是把事实记清、把系统补强，让下一次晚会拥有更可靠的起点。

下一年的最高优先级，是把手动断网 PPT/PDF 备用包升级成经过完整彩排的一键离线模式。网络不可用时，主控电脑仍能完成开场、节目推进、互动标题、颁奖和结束；网络恢复后，再由主控确认并安全回到在线模式。完整复盘见[赛后审阅与下一届改进包](./docs/POST_EVENT_REVIEW_20260920.md)。

## 你想先做什么？

| 目标 | 从这里开始 |
| --- | --- |
| 先看项目全貌 | [文档入口](./docs/README.md) |
| 本地安全排练 | [下一届现场一页启动单](./docs/NEXT_YEAR_QUICKSTART.md) |
| 了解现场操作 | [主控操作单](./docs/LIVE_OPERATOR_GUIDE.md) · [主持对稿单](./docs/HOST_CUE_GUIDE.md) |
| 了解发布、备份和恢复 | [运行手册](./docs/RUNBOOK.md) · [服务器部署](./docs/SERVER_DEPLOYMENT.md) |
| 查看创意是否已落地 | [赛后审阅与下一届改进包](./docs/POST_EVENT_REVIEW_20260920.md) |

## 三步开始本地排练

环境要求：Node.js `22.18+`（或 `24.11+`）和 pnpm `11.16.0`。

```bash
pnpm install --frozen-lockfile
pnpm dev:rehearsal
```

首次排练会在被忽略的 `backend/.rehearsal/` 中创建 300 条合成数据，不会读取正式名单。启动后打开：

- `/welcome`：观众手机入口
- `/screen`：舞台大屏
- `/admin`：主控台

提交或接手改动前运行：

```bash
pnpm docs:check
pnpm typecheck
pnpm test
pnpm build
```

需要局域网手机预览时，按[现场验收预览说明](./docs/README.md)设置 `DEMO_HOST`，再运行 `pnpm preview:v2:field`。正式数据、运行凭据和 NFC 映射必须放在代码目录之外；正式启动使用 `pnpm dev:formal`，缺少受保护资产时会安全停止。

## 项目结构

- `frontend/`：Vue 3 + Vite，手机、舞台大屏和后台控制台。
- `backend/`：Fastify + SQLite，协议、权限、轮次、节目、互动、奖项和恢复逻辑。
- `packages/contracts/`：前后端共享的 TypeScript/Zod 契约。
- `deploy/`：Caddy、systemd 和环境模板。
- `docs/`：决策、实施记录、现场手册、发布恢复和下一年交接资料。
- `tests/`：Vitest、Playwright 三浏览器 E2E、协议负载和渲染 soak。

## 交接边界

公开仓库只放源码、脱敏示例配置、测试和流程文档。参与者名册、姓名与学号对应表、令牌、密码、数据库、NFC 私密映射、OBS 凭据、Cookie、聊天导出和含身份信息的截图或录屏不得进入 GitHub、日志或普通协作盘；经负责人授权、仅用于节目单或演出署名的公开演职员资料可以保留，并应按 [`docs/DATA_PRIVACY.md`](./docs/DATA_PRIVACY.md) 的边界维护。

项目中的 AI 产出需要由负责人复核；涉及正式数据、部署、轮次重置和现场推进时，先按文档确认状态、备份和权限。完整约束见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。
