# SYSU Welcome Interactive

中山大学智能工程学院迎新晚会互动网页项目：手机 H5（`/welcome`）、后台控制台（`/admin`）与舞台大屏（`/screen`）三端联动。正式产品以 NFC 明信片邀请函为主入口，二维码/短网址为兼容备用；Demo v0 只验证同一随机令牌的网页入口，实体制作与公网部署属于正式版延期事项。

## 当前状态（详见 [`docs/README.md`](./docs/README.md)）

协议 v2 全部实现并关闭全部门禁：自动门（V2-00～V2-09、D-030～D-032、30 分钟渲染 soak、300 人协议负载）、实际 `backend/.data` 的 v1→v2 一次性切换（D-034）、以及 V2-10 现场人工验收（D-036，2026-08-15 负责人签核全部通过）。**Demo v0 已收口**，剩余只有正式版延期事项（NFC 写卡、印刷、公网、真实名单、正式 VI 等）。

## 快速开始

```bash
pnpm install --frozen-lockfile
pnpm dev                    # 本地三端（协议 v2 现行）
```

现场验收预览（临时 v2 栈，不碰 `.data`）：

```powershell
$env:DEMO_HOST = '本机可信局域网 IPv4'
pnpm preview:v2:field
```

常用验证命令与完整说明见 [`docs/README.md`](./docs/README.md) 和 [`docs/RUNBOOK.md`](./docs/RUNBOOK.md)。

## 目录

- `frontend/`：Vue 3 + Vite，三端页面。
- `backend/`：Fastify + SQLite 本地服务；运行数据库与凭据只生成在被忽略的 `backend/.data/`。
- `packages/contracts/`：前后端共享 TS/Zod 契约（v1 + v2）。
- `docs/`：项目文档（入口 [`docs/README.md`](./docs/README.md)；v1 历史在 [`docs/archive/`](./docs/archive/README.md)）。
- `tests/`：Vitest、Playwright 三浏览器 E2E、协议负载与渲染 soak。

## 边界与协作

- 只用固定合成数据；真实姓名、学号、令牌、口令、数据库与现场导出文件不得进入仓库。
- v1 六阶段只作历史；v2 为参与者独立入场 + 三场景运行时 + `COMPLETED` 终态。
- 不公网部署、不接真实名单、不写实体 NFC、不接 AI 审核服务。
- AI 产出由项目负责人复核；未经授权不提交、不推送。详细规则见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。
