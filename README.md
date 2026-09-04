# SYSU Welcome Interactive

中山大学智能工程学院迎新晚会互动网页项目：手机 H5（`/welcome`）、后台控制台（`/admin`）与舞台大屏（`/screen`）三端联动。正式产品以 NFC 明信片邀请函为主入口，二维码/短网址为兼容备用；D-054 已建立受保护正式名单通道与逐人匿名令牌映射，D-055 将 220 人设为大屏正式视觉满场参考并启用盘面主导银河、420 颗无身份底星、低振幅环境呼吸与流星轨道入场；实体写卡、正式 HTTPS 域名及公网部署仍须单独验收。

## 当前状态（详见 [`docs/README.md`](./docs/README.md)）

协议 v2 的 D-036 基线已在 2026-08-15 完成自动门、实际 `backend/.data` 的 v1→v2 切换和 V2-10 人工签核。随后 D-037 取消寄语/时光胶囊并加入节目中场个人抽奖；D-046～D-050 建立逆时针真实星流、逐人流星、摄影式逐星 `displayColor`、30Hz/60Hz 节拍、预热有界 WebGL2 与手机/大屏 Orbital Signal 背景。D-051 用约 8.4 秒的错峰螺旋汇聚、高温核心、一次非对称超新星和连续白场透明接管整体替换黑洞路线；`PROGRAM_SUPPORT` 稳态仍完全透明且只显示实时新弹幕。D-053 将三端收口到共享 Orbital Signal 语义表面；D-054 又完成 220 人受保护名单导入、随机匿名 NFC 映射、8 位学号人工恢复、5 个隔离测试账号与正式启动模式。D-055 进一步以盘面离散星为主体弱化显式旋臂，把底星调整为 420 颗更小更暗的无身份微星，并增加未解析盘面光的有界人数补偿、非同步低振幅呼吸和流星末段轨道捕获；300 人仅保留为技术压力端点。合成 `.data` 和正式 `.private` 当前均为 schema 14 并已通过完整验证，数据证据见 [`docs/TEST_PLAN.md`](./docs/TEST_PLAN.md) §3.17，D-055 动效证据见 §3.18。D-036 的真机、局域网与 OBS 结论只属于变更前基线，不能代签当前正式链路。

## 快速开始

```bash
pnpm install --frozen-lockfile
pnpm dev                    # 300 人合成 Demo 三端
pnpm dev:formal             # 220 人受保护正式三端；缺库/凭据/NFC 映射会安全停止
pnpm build:formal           # 生成 PROTECTED 正式前端文案/功能分支的生产构建
```

现场验收预览（临时 v2 栈，不碰 `.data`）：

```powershell
$env:DEMO_HOST = '本机可信局域网 IPv4'
pnpm preview:v2:field
```

常用验证命令与完整说明见 [`docs/README.md`](./docs/README.md) 和 [`docs/RUNBOOK.md`](./docs/RUNBOOK.md)。

## 目录

- `frontend/`：Vue 3 + Vite，三端页面。
- `backend/`：Fastify + SQLite 本地服务；合成测试资产位于被忽略的 `backend/.data/`，正式受保护资产位于被忽略的 `backend/.private/`。
- `packages/contracts/`：前后端共享 TS/Zod 契约（v1 + v2）。
- `docs/`：项目文档（入口 [`docs/README.md`](./docs/README.md)；v1 历史在 [`docs/archive/`](./docs/archive/README.md)）。
- `tests/`：Vitest、Playwright 三浏览器 E2E、协议负载与渲染 soak。

## 边界与协作

- 测试、截图和公开证据只用固定合成数据；获授权的真实姓名、学号摘要、令牌、口令、数据库与映射只能留在本地 Git 忽略的 `backend/.private/`，不得进入仓库或日志。
- v1 六阶段只作历史；v2 为参与者独立入场 + 三场景运行时 + `COMPLETED` 终态。
- 当前不代表公网/HTTPS、实体 NFC 或外部 AI 审核已上线；这些仍按 RUNBOOK 的独立门禁执行。
- AI 产出由项目负责人复核；未经授权不提交、不推送。详细规则见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。
