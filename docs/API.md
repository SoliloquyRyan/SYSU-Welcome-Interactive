# Demo v0 API 边界

> 状态：G2 本地业务契约与 G4 实时负载边界（v0.6，根级 `pnpm verify:g4` 全门已通过）；G1 基础接口继续兼容。
> 适用范围：本地局域网、固定合成数据、`/welcome`、`/admin`、`/screen`。正式公网 API 和部署平台仍待确认。

## 1. 总体约束

- 服务端持久化状态是身份、阶段、数值、内容和聚合的唯一权威来源。
- 客户端使用相对 `/api` 和同源或由当前页面主机推导的 `/ws`，不得硬编码 `localhost`。
- 除登录外，所有业务写命令携带 `Idempotency-Key`；受阶段限制的命令同时携带 `stageRevision` 和 `resetEpoch`。
- 所有业务命令与权威快照响应返回当前 `resetEpoch`、`stageRevision` 和必要的权威快照片段。
- 屏幕快照和公共事件不得包含姓名、未来寄语、完整邀请令牌、六位 Demo 码、Cookie、后台密码或会话凭据。
- 写事务提交后才允许广播事件；不得先播放成功效果再补写数据库。
- 初始邀请 URL 可以携带随机令牌；前端读取后立即把当前地址和历史项替换为不含令牌的 `/welcome`，激活请求与服务端访问日志必须对令牌做字段级脱敏。
- 所有 JSON 请求与响应由 `@sysu-welcome/contracts` 的严格 Zod Schema 约束；未知字段不作为兼容扩展静默接受。

## 2. 会话与角色

### 2.1 参与者会话

- 激活使用随机邀请令牌、虚构姓名和六位 Demo 码。
- 激活成功后创建 `HttpOnly` 参与者会话；允许同一参与者存在多个设备会话。
- 多设备读取同一个服务端参与者状态，不能各自生成积分、星星或档案。
- Cookie 名为 `sysu_welcome_participant`，`HttpOnly; SameSite=Lax; Path=/`，本地 Demo 有效期 12 小时。Cookie 只含一次性随机会话材料；数据库只保存摘要。
- 首次激活与重新核验都创建新的会话；幂等只保证参与者事实和奖励恰好一次，不把原始 Cookie 写入幂等响应记录。

### 2.2 后台会话

- 后台使用一个共用账号和独立 `HttpOnly` 管理会话；未登录请求不得读取管理数据。
- 任何已登录管理会话可自行取得 `REVIEWER`、`STAGE_CONTROLLER`、`DEMO_ADMIN` 或 `ALL`。
- 服务端仍检查命令所需的当前角色，但该机制不构成可靠的最小权限或个人身份认证。
- 操作记录只包含会话短 ID、执行时角色、动作、时间和结果，不得称为具体操作者审计。
- Cookie 名为 `sysu_welcome_admin`，`HttpOnly; SameSite=Lax; Path=/`，本地 Demo 有效期 8 小时。退出、过期和确定性重置均使会话失效。

### 2.3 本地 HTTP 边界

- Demo v0 只允许在可信本地局域网和合成数据下使用 HTTP。
- Cookie 至少使用 `HttpOnly` 和合适的 `SameSite`，服务端严格校验 `Origin` 与 `Host`。
- HTTP 不提供传输机密性；正式公网运行必须改用 HTTPS 和 `Secure` Cookie。
- `GET`/`HEAD` 仍校验完整允许 `Host authority`；所有其他 HTTP 方法和 WebSocket 升级还必须携带与启动器输出完全一致的允许 `Origin`。`Origin: null`、缺失 Origin、错误端口和非允许来源均拒绝。

## 3. 接口族

G2 保留 G1 的公共接口，并实现以下精确路径。除登录、登出与只读接口外，写命令必须携带 `Idempotency-Key`。

### 3.1 公共与大屏

- `GET /api/health`：进程存活。
- `GET /api/ready`：数据库、迁移、固定种子和实时层可用。
- `GET /api/screen/snapshot`：当前阶段、固定节目、匿名聚合、仍公开的弹幕和显示批次。
- `GET /ws?resetEpoch=<n>&afterEventSeq=<n>`：只读事件连接；首次可不传高水位，重连应带最近权威快照的 epoch 和序号。

### 3.2 参与者

| 方法与路径 | 作用 |
|---|---|
| `POST /api/participant/activate` | 以令牌、虚构姓名和六位 Demo 码核验并建立参与者会话 |
| `GET /api/participant/snapshot` | 读取本人权威状态、当前运行状态、固定节目、礼物和档案 |
| `POST /api/participant/logout` | 撤销当前参与者会话 |
| `PUT /api/participant/future-message` | 保存或修改本人私密未来寄语 |
| `POST /api/participant/star/start` | 在第 3 阶段启动一次个人星星 |
| `POST /api/participant/gifts` | 在第 4 阶段向当前开放节目赠送一档虚拟礼物 |
| `POST /api/participant/barrages` | 在第 4 阶段确认公开告知后提交弹幕 |
| `POST /api/participant/cooperative-light` | 在第 5 阶段完成一次协同点亮 |

未来寄语是私密档案数据，不具有人工审核或公开状态，永不进入大屏。弹幕通过本地确定性规则后进入 `PUBLISHED` 并立即匿名广播；规则失败进入 `REJECTED_BY_RULE` 且不得广播。只有已经发布的弹幕可由后台改为 `REMOVED`。

参与者快照同时承担个人档案读取；只有第 6 阶段或 `COMPLETED` 才将 `archiveAvailable` 标为真。`READY / Stage 1` 允许入口激活和私密寄语；`RUNNING` 时星星、礼物/弹幕、协同点亮分别只在第 3、4、5 阶段可写。`PAUSED` 拒绝所有参与者业务写入。`COMPLETED` 允许已经激活的身份重新核验并读取档案，但未激活邀请不得再创建参与者事实。

### 3.3 后台

| 方法与路径 | 作用 / 所需当前角色 |
|---|---|
| `POST /api/admin/login`、`POST /api/admin/logout` | 建立或撤销共用后台会话 |
| `GET /api/admin/snapshot` | 读取运行、聚合、节目、公开弹幕、脱敏邀请状态和最近会话操作 |
| `PUT /api/admin/roles` | 当前会话自行取得 `REVIEWER`、`STAGE_CONTROLLER`、`DEMO_ADMIN` 或 `ALL` |
| `POST /api/admin/runtime` | 模式、开始、暂停、恢复、跳转、推进、节目和结束；`STAGE_CONTROLLER|ALL` |
| `POST /api/admin/barrages/:id/remove` | 单条下屏；`REVIEWER|ALL` |
| `POST /api/admin/sources/:sourceId/block` | 屏蔽匿名来源并移除其可见内容；`REVIEWER|ALL` |
| `POST /api/admin/barrages/pause` | 暂停或恢复新弹幕；`REVIEWER|ALL` |
| `POST /api/admin/barrages/clear` | 紧急清屏；`DEMO_ADMIN|ALL` |
| `POST /api/admin/invitations/:id/status` | 启用或作废一个合成邀请；`DEMO_ADMIN|ALL` |
| `POST /api/admin/reset` | 完整确定性重置；`DEMO_ADMIN|ALL` |

运行状态固定为 `mode=REHEARSAL|LIVE`、`status=READY|RUNNING|PAUSED|COMPLETED` 和 `stage=1..6`。模式只可在 `READY` 切换；排练运行中允许跳阶段，现场运行中只能向前推进；暂停后必须先恢复才能推进。模式、状态、阶段和当前节目每次成功变更都递增 `stageRevision`。`PAUSED` 时参与者业务写入返回 `RUNTIME_PAUSED`，但权威读取、恢复、弹幕删除、来源屏蔽与清屏仍可用。

## 4. 幂等、事务与版本

- 相同幂等键与相同请求体：返回首次保存的结果，不重复执行业务或广播事件。
- 相同幂等键与不同请求体：返回 `409 IDEMPOTENCY_CONFLICT`。
- 过期 `stageRevision`：返回 `409 STALE_STAGE`，客户端拉取新快照。
- 过期 `resetEpoch`：返回 `409 RESET_EPOCH_CHANGED`，旧会话不得继续写入。
- 激活、奖励、协同点亮、送礼扣款通过数据库事务和唯一业务键保证一次性。
- 动力值余额不得为负；送礼事务必须同时完成扣款、礼物事实、节目热度和领域事件。
- 超时结果未知时，客户端使用原幂等键查询或重试，不得生成新键盲目重发。
- `Idempotency-Key` 为 8–128 个可打印安全字符；记录按当前 `resetEpoch + 会话主体 + 命令路径` 隔离。G2 在当前 epoch 内不主动过期业务幂等记录，重置时整体清除。
- 激活请求也必须携带幂等键以保护首次参与者事实；重复成功激活可以签发新会话，但不能再次发放初始值。

## 5. 实时协议

WebSocket 使用同源 `/ws`。每条事件至少包含：

```text
protocolVersion
resetEpoch
stream
eventSeq
eventId
type
committedAt
payload
```

事件范围至少包括：

- `runtime.stage.changed`
- `runtime.status.changed`
- `program.changed`
- `participant.activated`
- `participant.snapshot.changed`
- `aggregate.updated`
- `star.started`
- `gift.accepted`
- `barrage.published`
- `barrage.removed`
- `barrage.cleared`
- `barrage.pause.changed`
- `source.blocked`
- `cooperation.updated`
- `demo.reset`
- `resync.required`

`stream` 查询参数表示连接的访问范围，不要求该连接收到的每个 envelope 都与查询参数同名。服务端根据已验证会话决定订阅范围：`public/screen` 可见公共与大屏事实，`participant` 在此基础上可见属于本人的参与者事实，`admin` 在此基础上可见后台事实；客户端不能通过自报角色订阅私密流。

所有 G2 事实共用持久的 `resetEpoch + eventSeq` 高水位。参与者状态变化会以 `participant.snapshot.changed` 持久化；对应参与者在该序号收到不含正文的私有失效通知，其他连接在同一序号收到隐私安全的 `aggregate.updated` 别名。这样每个已授权连接都能按连续全局序号补发，又不会把姓名、寄语或凭据放入公共事件。参与者仍必须先取本人权威快照；事件只用于提示刷新，不能替代快照恢复完整私有状态。当前 `/welcome` 使用 `participant` 访问范围；`/screen` 与 `/admin` 使用 `screen` 范围并通过各自 HTTP 快照读取页面状态。后台角色与合成邀请状态成功变更也会产生隐私安全的失效事件，使其他已打开的后台页面刷新权威快照。

阶段、运行状态、节目、`barrage.pause.changed`（携带新 `stageRevision`）以及礼物热度等公共事件允许客户端按序更新本地投影；私有失效或需要完整聚合校正的事件使用合并快照刷新。客户端只接受同一 `resetEpoch` 中不早于当前 `eventSeq` 的快照，旧快照不得覆盖较新的实时事实；发生 epoch 变化或会话退出时，正在途中的快照结果必须作废。

断线期间客户端阻止业务写入，不建立离线发送队列。重连时先获取带 `resetEpoch + eventSeq` 的完整权威快照，再用该高水位建立 WebSocket。连接先进入缓冲状态，服务端按序补发同 epoch 中序号更大的、该连接有权看到的历史事实，再去重刷新并发到达的实时事实后切换为实时广播；epoch 不同、历史不可用或序号出现不可解释的洞时发送严格脱敏的 `resync.required`，客户端重新取快照。断线期间的礼物轨迹等装饰动画不补播，但持久化数值必须正确。

G2 的 `/ws` 仍为只读，不接受任何客户端业务命令。持久公共事实使用 `G2RealtimeEventEnvelopeSchema` 的按 `type` 判别联合；公共事件只包含运行状态、匿名星号、节目/礼物聚合、公开弹幕和匿名计数。参与者失效通知只表达“请刷新本人快照”，不携带正文。参与者私密寄语与姓名只通过对应的认证 HTTP 快照返回，不进入公共事件或公共别名。

服务端对同一个已提交事件只做一次序列化，再向有权限的连接复用该载荷。若某连接当前 `bufferedAmount` 加待发送载荷会超过 1 MiB，服务端将它从活动集合移除并以 WebSocket 1013 关闭/终止；客户端必须按常规重连流程取权威快照，不得要求服务端无限积压事件。

### 5.1 内容与限频基线

- 未来寄语按 Unicode 码点计算，最多 80 个可见字符。
- 弹幕按 Unicode 码点计算，最多 40 个可见字符；空白、内置敏感词、URL/域名、手机号和明显联系方式被本地规则拒绝。
- 同一匿名来源 10 秒最多提交 3 次弹幕请求，规则拒绝的尝试也计入该窗口。参与者激活与后台登录按“操作类别 + 本地来源地址”分别计算：60 秒最多 5 次失败，第 6 次起返回 `429 RATE_LIMITED`，成功后清除对应失败窗口；来源表只在内存中有界保存。限频不记录凭据，也不调用外部 AI 或第三方服务。

## 6. 确定性重置

G2 提供根级 `pnpm db:reset` 和受角色保护的后台完整重置。后台重置必须在受控事务中：

1. 进入 `resetting` 状态并阻止新业务写入；
2. 清除激活、积分、内容、互动、旧会话和当前运行记录；
3. 恢复相同的固定合成身份、六位 Demo 码、节目和礼物；
4. 保持固定邀请令牌不变，使旧二维码继续有效；
5. 增加 `resetEpoch`，使旧参与者和后台会话失效；成功响应为发起重置的后台页面签发一个新 epoch 管理会话，其他旧会话仍须重新登录；
6. 提交后广播一次 `demo.reset`；
7. 任一步失败则整体回滚，不留下半重置数据。

## 7. 错误分类

共享契约覆盖：

- `AUTH_REQUIRED`
- `ROLE_REQUIRED`
- `RATE_LIMITED`
- `VALIDATION_FAILED`
- `IDEMPOTENCY_CONFLICT`
- `STALE_STAGE`
- `RESET_EPOCH_CHANGED`
- `RUNTIME_PAUSED`
- `STAGE_LOCKED`
- `INSUFFICIENT_BALANCE`
- `CONTENT_REJECTED`
- `SOURCE_BLOCKED`
- `SERVICE_UNAVAILABLE`

错误响应只返回可操作的公开信息、稳定错误码和请求 ID，不返回堆栈、SQL、内部路径或凭据。
