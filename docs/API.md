# Demo v0 API 边界

> 状态：v2 现行。v2 端点与字段以共享契约（`packages/contracts/src/protocol-v2.ts`）与 [`PROTOCOL_V2.md`](./PROTOCOL_V2.md) 第 4/9 节为唯一权威。协议 v1 的完整接口参考（`stage=1..6`、旧路径与字段）已归档至 [`archive/v1-api.md`](./archive/v1-api.md)，只作历史回归参考，不得据此自行发明兼容路由或双写层。
> 适用范围：本地局域网、固定合成数据、`/welcome`、`/admin`、`/screen`。正式公网 API 和部署平台仍待确认。

## 1. 通用约束

- 服务端持久化状态是身份、场景、数值、内容和聚合的唯一权威来源。
- 客户端使用相对 `/api` 与同源或由当前页面 host 推导的 `/ws`，不得硬编码 `localhost`。
- 所有 v2 写命令携带 `protocolVersion=2`、当前 `resetEpoch` 与幂等键；管理命令还携带期望 revision。稳定错误码为 PROTOCOL_V2 §9 的闭合集合。
- 写事务提交后才允许广播事件；快照与公共事件不得包含姓名、学号、令牌、胶囊正文或会话凭据。
- 初始邀请 URL 可携带随机令牌；前端读取后立即把地址栏与历史项替换为不含令牌的 `/welcome`。
- 所有 JSON 请求/响应由 `@sysu-welcome/contracts` 的严格 Zod Schema 约束。

## 2. v2 端点（`V2_ACTIVE` 合成库）

| 端点 | 用途 |
|---|---|
| `GET /api/protocol-capabilities` | 版本中立能力发现（`contractVersion`/`activeRuntimeVersion`/`activationState`/v2 业务开关） |
| `POST /api/v2/handshake` | 严格 v2 握手：`{protocolVersion:'2', clientSurface, clientBuild}` |
| `/ws/v2` | ACTIVE 实时：`HELLO`→`HELLO_ACK`→限时 `SUBSCRIBE`；按 `public`/`admin`/`participant:<id>` 分流 |
| `GET /api/v2/screen/snapshot` | 大屏：公共恒星（含 `started`）、聚合、节目、presentation、终局 recap |
| `GET /api/v2/participant/snapshot` | 参与者：本人事实 + 公共投影 + `allowedActions` |
| `GET /api/v2/admin/snapshot` | 后台：匿名漏斗、角色、控制收据、受限胶囊候选 |
| `POST /api/v2/participant/activate` | 身份激活（原子 slot 预留 + 会话 + 初始双值） |
| `POST /api/v2/participant/commands` | 参与者命令：`LOCK_COLOR`/`UPSERT_CAPSULE`/`SKIP_CAPSULE`/`START_STAR`/`SEND_GIFT`/`POST_BARRAGE`/`COOPERATIVE_LIGHT` |
| `POST /api/v2/admin/commands` | 管理命令：`SET_MODE`/`START`/`SET_SCENE`/`ADVANCE`/`PAUSE`/`RESUME`/`COMPLETE`/`PREVIEW_FINALE`/`SET_PROGRAM`/胶囊审核命令/弹幕处置/`RESET_DEMO` |

字段、生命周期、事件名与错误信封以 PROTOCOL_V2 §2～§9 为准。

## 3. v1 接口（历史参考）

`/api/health`、`/api/ready`、`/api/screen/snapshot`、六阶段命令族与 `/ws` 的完整说明见 [`archive/v1-api.md`](./archive/v1-api.md)。v1 服务在数据库激活 v2 后会硬拒绝启动，两者不同时运行。
