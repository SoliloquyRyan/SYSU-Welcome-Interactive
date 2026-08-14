# 协议 v2：身份激活、星系与现场运行契约

> 决策状态：D-025、D-026、D-027、D-028、D-029 已确认，本文是协议 v2 的唯一权威说明。
>
> 实施状态：V2-00～V2-09 已完成。协议、数据库、入场、三场景运行时、快照/实时层、v2 后台/大屏/手机页面，以及三浏览器自动回归与 300 人协议负载已经实现并通过；V2-10 的 30 分钟 Chrome 渲染 soak 已通过。D-027 约 2.8 秒首次寻星、可见性门与 normal-motion 自动浏览器断言已落地并通过，但项目负责人真机观察否决了首版视觉连续性；D-028 已完成当前连续镜头实现与自动连续性子门。vivo X300 仍须用新鲜邀请对 D-028 当前版本重新完成人工视觉签核。实际 `.data` 未执行一次性切换，当前日常运行时仍是 v1；OBS 实际合成与三端局域网人工验收也仍待签核。
>
> 版本边界：当前 v1 六阶段实现及 D-022 验收证据只作历史基线，不能证明 v2 已实现或已验收。

## 1. 权威与基本原则

1. 协议版本固定为 `2`，必须由命令请求、服务端快照、命令响应和事件明确携带；v1 客户端不得在 v2 服务端继续写入。
2. v2 是一次不兼容切换，不提供 v1/v2 双写、状态翻译、旧六阶段兼容层或静默降级。
3. 服务端持久化状态是唯一权威。动画结束、前端定时器、浏览器本地状态和 WebSocket 到达顺序都不能推进业务状态。
4. 参与者入场进度与全场运行进度是两只独立时钟。任何页面不得把两者重新拼成一条“六阶段”进度线。

5. 本项目仍遵守 D-002、D-005、D-009、D-013～D-017 及 D-023 的不冲突边界：NFC 为主入口，二维码/短链接携带同一随机令牌；Demo 人工协助可用合成姓名和合成学号定位同一身份，但必须恢复同一参与者状态，不得新建第二账号。系统只用合成身份；胶囊不由 AI 自动公开；不接真实名单、公网、实体写卡或抽奖核销。

### 1.1 V2-01 已实现的协议握手层

- `GET /api/protocol-capabilities` 是版本中立的能力发现入口。当前返回 `contractVersion='2'`、`activeRuntimeVersion='1'`、`activationState='CONTRACTS_READY'`，并明确声明 `v2BusinessWrites=false`、`v2Snapshots=false`、`v2RealtimeEvents=false`；同时公布 `/api/v2/handshake` 与 `/ws/v2`。
- `POST /api/v2/handshake` 只接受严格对象 `{ protocolVersion:'2', clientSurface:'WELCOME'|'SCREEN'|'ADMIN', clientBuild }`。成功仅确认契约就绪，不确认 v2 业务已激活；缺少/错误版本以 `PROTOCOL_VERSION_MISMATCH` 拒绝，畸形或混入 v1 字段以 `VALIDATION_FAILED` 拒绝。
- `/ws/v2` 当前只处理首帧 `HELLO`。合法首帧依次收到 `HELLO_ACK`、`NOT_ACTIVE(reason='V2_RUNTIME_NOT_ACTIVE')`，随后服务端以 1013/`V2_RUNTIME_NOT_ACTIVE` 关闭；非法、缺失、非 JSON 或二进制首帧返回显式 `ERROR`，再以 1008 关闭。该连接不进入现有实时 hub，也不发送任何 v2 业务事实。
- 当前 v1 API、`/ws` 和三端页面仍以显式 `protocolVersion='1'` 边界运行；收到 missing、畸形或不兼容版本会停止假在线与自动重连并显示协议错误。页面不会在启动时自动切换或调用 v2 业务。
- V2-05 才负责激活 v2 快照、分流实时事件、游标恢复和 ACTIVE WebSocket 订阅；V2-01 的控制面 HELLO/ACK 不能作为 V2-05 完成证据。

### 1.2 V2-03 已实现的参与者入场域

- `backend/src/services/v2-participant-onboarding.ts` 已实现激活、锁色、`UPSERT_CAPSULE` 与 `SKIP_CAPSULE` 的服务端事务；它只接受 `V2_ACTIVE` 数据库，不读取或双写 v1 参与者事实。
- 首次激活原子预留固定 formation slot、建立 `NEEDS_COLOR`、初始化 100 动力并写入唯一 `ACTIVATED +20` 账本；重复核验只建立新会话，`PAUSED/COMPLETED` 的既有身份会话为只读。
- 锁色事务原子建立公共恒星并写入完整 `star.node.upserted`；提交或持久跳过才进入 `ADMITTED`。跳过奖励 0，READY/RUNNING 后补填只写一次 `CAPSULE_SUBMITTED +20`，且不改变首次 `admittedAt/admittedScene/admittedRunRevision`。
- 命令按 `resetEpoch`、`participantRevision` 和幂等键复核；参与者私有流、公共/后台匿名聚合流和账本在同一数据库事务中收敛。V2-03 不启用当前 v1 页面上的 v2 HTTP/实时业务入口，避免在 V2-04/V2-05 未完成时形成半激活运行时。

### 1.3 V2-04 已实现的运行时域

- `backend/src/services/v2-runtime-commands.ts` 已实现三场景控制、revision/幂等/角色门、就绪警告与明确 override 审计；LIVE 只能顺序推进并从 `COOPERATIVE_LIGHT` 一次原子进入 `COMPLETED`。
- 参与者场景操作已接入隔离命令服务：启动恒星、节目送礼/弹幕和协同点亮按当前场景与准入时点复核，错过场景不补领；礼物逐次扣动力，四类首次奖励均由唯一账本事实约束。
- `PREVIEW_FINALE` 只建立排练 presentation，不写 `COMPLETED`；LIVE 完成会在同一事务捕获活动胶囊只读副本、清除 presentation、写终态/事件/控制收据，并以数据库提交先后作为参与者写入硬截止。
- V2-04 仍是未接现有页面的隔离业务域；V2-05 才负责正式快照/实时传输与 HTTP/WS 激活。

### 1.4 V2-05 已实现的快照与实时层

- `GET /api/v2/screen/snapshot` 返回公共恒星、公开聚合、当前节目、presentation 与终局回顾；`GET /api/v2/participant/snapshot` 只接受当前 epoch 的有效参与者会话并返回本人事实与公共投影；`GET /api/v2/admin/snapshot` 只接受有效后台会话并返回匿名漏斗、角色和控制收据。多表读取使用同一一致读视图，所有响应经过共享 v2 schema 校验。
- `V2_ACTIVE` 时 `/ws/v2` 在 `HELLO_ACK` 后要求限时 `SUBSCRIBE`。`SCREEN` 只可订阅 `public`，`WELCOME` 只可订阅 `public` 与本人 `participant:<id>`，`ADMIN` 必须先通过后台会话鉴权才可订阅 `public/admin`；服务端只投递客户端明确请求的流。
- 初次或重连先取得权威快照及各流游标，再以缓冲—历史补齐—去重—live 的顺序接续事件。每个流独立检查 `streamSeq`；未来游标或历史不足只对受影响流返回 `RESYNC_REQUIRED`，`resetEpoch` 变化则关闭全部既有订阅并要求重新认证及重取全部授权快照。
- 新提交事件从 SQLite outbox 增量投递，不扫描全部历史；`star.node.upserted` 继续携带完整稳定恒星投影，客户端按 epoch、公开星号和 `starRevision` 幂等合并。v2 API 与 WebSocket 失败使用 v2 错误信封，v1 业务入口在 `V2_ACTIVE` 下明确关闭。
- `V2_ACTIVE` 同时开放 `POST /api/v2/participant/activate`、`POST /api/v2/participant/commands` 与 `POST /api/v2/admin/commands`，分别接入 V2-03/04 已冻结的命令 schema 和事务服务；能力发现中的 `v2BusinessWrites=true` 因而对应真实可调用入口。V2-06～V2-08 的三端页面现已在严格 ACTIVE 分支调用这些路由，v1 数据库仍只挂载旧页面。
- 本节记录的是 V2-05 当时的传输边界；后续 V2-06～V2-08 已完成三端接入。仓库实际 `.data` 未切换，因此当前证据来自隔离临时 v2 数据库，不能扩张为现场部署验收。

### 1.5 V2-06 已实现的匿名后台运营层

- `/admin` 启动先读取版本中立能力发现：`V2_ACTIVE` 使用新控制台，v1 数据库继续使用原控制台，不做业务状态翻译或双写。v2 后台使用共用合成账号建立 `ALL` 能力的本 epoch 会话；退出会撤销服务端会话并清 Cookie。
- `V2AdminSnapshot` 增加只对 `REVIEWER|ALL` 返回的受限胶囊候选。控制台仅显示匿名漏斗、公开星号、胶囊正文与审核状态，不返回或渲染姓名、完整学号、令牌或参与者会话标识。
- `SELECT_CAPSULE → SHOW_CAPSULE_INSERT → CLEAR_PRESENTATION/REMOVE_CAPSULE` 按第 3.3 节唯一迁移表执行；命令在事务内复核 role、epoch、participant/run/presentation revision 和幂等键，更新私有/公共/后台流后再由页面重取权威快照。插播不改变全场场景，也不自动轮播。
- 推进/完成的匿名就绪警告不会硬卡现场，但必须在同一次动作中明确 override；权限、断线/未知结果、旧 revision、错误 tuple 和终态写入边界仍不可覆盖。`COMPLETED` 后禁止选中或上屏新内容，只允许带原因撤下并同步从终局 recap 做安全减法。
- 后台合成重置调用第 10.1 节服务端硬门，不由前端自行清库；成功后建立新 epoch、轮换管理会话并要求实时订阅重新认证。仓库实际 `.data` 未执行该命令。

### 1.6 V2-07 已实现的大屏与公共互动层

- `/screen` 启动先执行版本中立能力发现：只有严格 `V2_ACTIVE` 才挂载新大屏并订阅 `public` 流；v1 数据库继续挂载旧大屏，不翻译、双写或同时打开两套 WebSocket。
- 大屏最多把 300 颗权威公共恒星绘制到单个 Canvas；稳定 `formationSlot` 决定位置，星色和 `started` 决定表现。大屏 DOM、可访问树和交互层均不渲染参与者编号/星号，也不提供可点击单星入口。
- `ASSEMBLY` 使用完整星系；`PROGRAM_SUPPORT` 将网页背景切为透明，只在画面边缘保留弱星点、匿名弹幕和礼物覆层，节目视频与音频完全由 OBS/导播负责；`COOPERATIVE_LIGHT` 恢复全屏星系并突出已点亮星点。
- 合规弹幕经服务端公开内容与频率规则后写入匿名公共投影；后台可暂停、带原因撤下、屏蔽匿名来源和清屏。礼物公共事件只含节目、礼物种类和时间，不含发送者；页面把 1.5 秒内同类礼物合并，且同时最多表现一个主礼物和一个次礼物。
- 胶囊插入是独占画面；插入期间实时互动仍按权威事务持久化，但大屏不缓存、排队或补播被遮挡的入场动画。结束/预览/插入/故障/场景/互动按第 5.2 节固定优先级投影。
- 只有从非完成态实时观察到 LIVE `COMPLETED` 时播放约 5～6 秒终章收束；首次快照已经完成、刷新、重连及 reduced-motion 都直接显示同一稳定终态。REHEARSAL 始终显示“排练预览”标记。
- V2-07 仅在 `/screen` 动态加载 GSAP core，且只驱动少量覆层的 `transform/opacity`；公共星系继续由 Canvas 绘制。未引入 GSAP 插件、逐星时间线、媒体控制或动画业务回调，V2-08 手机页面也没有加载 GSAP。

### 1.7 V2-08 已实现的手机入场与场景层、D-027/D-028 已落地细则

- `/welcome` 启动先做版本中立能力发现；严格 `V2_ACTIVE` 才挂载 v2 手机页，v1 数据库继续使用历史页面。令牌只交给激活接口，激活后立即从地址栏与当前历史项清除；有效 Cookie 恢复优先于重新激活。
- 手机端以 ParticipantSnapshot 为个人权威、ScreenSnapshot 为公共星系基线，并分别续订 `participant:<id>` 与 `public` 流。重复事件幂等忽略，任一流缺口只重取受影响快照，epoch 变化或协议错误会停止写入并重新认证，不补播离线动效。
- `NEEDS_COLOR → NEEDS_CAPSULE_DECISION → ADMITTED` 与全场场景完全分离。锁色响应及后续快照确认本人公共星点后才播放拉远；提交或持久跳过后进入当下场景，READY 则进入等待。PAUSED 保留页面内草稿但拒绝写入，COMPLETED 以只读终章覆盖未完成入场。
- 主界面使用单 Canvas 绘制最多 300 颗权威恒星，只突出并标注本人星号；删除六阶段条、裸 `RUNNING` 和正常“实时同步”。一个克制的底部操作坞承载三页导航、入场决定和场景动作，短视口/软键盘使用可见视口自适应，礼物仍以可访问模态底部面板呈现。
- D-027 已实现正常首次激活先等待页面处于稳定 `visible`，再以 Vue 与 CSS 播放约 2.8 秒中性寻星；正常首次不可跳过。D-028 在项目负责人真机否决首版视觉连续性后，将该镜头修订为同一持久恒星节点、`50% / 42vh` 统一视觉轴、约 2.8 秒四阶段全屏径向穿越与同心白核—中性晕—`5800K` 色温晕交接。选色文案和控件在镜头中已渲染但保持 `inert`，末帧只解除交互隔离，不替换节点或改变恒星几何/颜色。正常完成以主动画 `animationend` 为准；真正开播后若页面进入后台或被中断，立即收束到权威静态终态且返回不重播，恢复、刷新、失败、超时和 reduced-motion 同样直接静态。锁色权威确认后仍播放约 1.2 秒拉远。手机不加载 GSAP；Canvas 只负责星系，首次叙事镜头使用全屏低 DOM SVG 与低成本 `transform/opacity`，动画回调不写业务事实，实时连接也不得等待表现层。
- D-029 替代本节上一条中“锁色后约 1.2 秒立即拉远”的表现顺序：锁色后同一持久星约 1.2 秒闪烁并上移到寄语画面；提交或持久化跳过胶囊、服务端已确认 `ADMITTED` 后，才以约 3.2 秒缩远到 Canvas 本人轨道并展开流动星系。低亮轨道微尘只作装饰、不计入真实人数；真实恒星仍只来自权威 `publicStars`。隐藏、中断、刷新、恢复和 reduced-motion 直接到对应静态权威状态。
- 成功反馈约 3.5 秒自动收回，同时由原位权威状态保留结果；错误、离线、暂停和终态保持可见。退出始终确认，胶囊/弹幕草稿只驻留当前页面内存，并在退出、会话失效、reset、COMPLETED 或离开相应场景时按冻结规则清理。
- `PROGRAM_SUPPORT` 的当前节目由后台 `SET_PROGRAM` 权威选择；命令同时校验 run/interaction revision，并以 `program.changed` 公开事件同步手机和大屏。迁移 `0012_protocol_v2_program_selection.sql` 只扩展合法公开事件名，不自动激活 v2。

### 1.8 V2-09 已完成的自动化与负载层

- `tests/e2e/v2-three-surfaces.spec.ts` 使用真实 Fastify、SQLite、WebSocket 与生产 Vue 页面，在 `chromium-ci`、系统 Chrome 和系统 Edge 中覆盖 v2 入场、三场景、节目、礼物/弹幕、暂停/恢复、服务重启、终章与公开隐私边界；全量浏览器回归 36/36 通过。
- `tests/load/run-v2-load.ts` 只使用 OS 临时目录中的固定 300 人合成库，建立 301 条 WebSocket 连接与 601 个分流逻辑流，执行 300 人完整入场/三场景旅程、1200 次礼物、幂等重放/冲突、后端重启、v2 reset、旧会话/旧 epoch 拒绝和固定凭据重入。所有操作 p95 小于 2 秒，协议错误、重复帧、私密字段公开、重复奖励/幂等事实、负余额与旧 epoch 污染均为 0。
- 并发公开事件通过服务端按 `streamId/streamSeq` 排序缓冲后投递；客户端仍按流去重和缺口重同步。合法 `STALE_RESET_EPOCH` 控制帧不算协议错误，但必须使全部旧连接失效并重新认证。
- reduced-motion 大屏不再播放移动弹幕，但保留最新权威弹幕的静态列表，确保“减少动态”不会丢失节目互动信息。
- 基线审计曾确认：既有 v2 三端 E2E 的参与者上下文使用 reduced-motion，桌面手机检查器 smoke 只等待选色终态，不能证明 D-027。该缺口现已由新鲜邀请、normal-motion、生产 Vue 页面与隔离 v2 smoke 的聚焦浏览器回归关闭；根级复跑观测正常首次 `2854ms`、隐藏→可见后 `2756ms`，隐藏期间不播放也不选色，开播后进入后台在 `<600ms` 内静态且不重播。历史 36/36、3/3 与其他既有通过数字保持原范围不变。
- D-027 上述自动证据证明几何、时长、可见性、恢复与业务隔离，但没有证明末帧到选色首帧的视觉连续性；项目负责人真机否决首版时不得把其 `PASS` 表述为视觉通过。D-028 新自动证据观测正常首次 `2783ms`、隐藏→可见 `2717ms`、F6→F7 持久恒星中心/尺寸差 `0px`、CLS `0`，并完成六帧序列目检；全量 37 文件/341 条测试、两项 typecheck、前端 71 模块构建、三项目 v2 E2E 与现场预览 smoke 均通过。该自动连续性子门为 `PASS`，但 vivo X300 当前版本人工视觉签核仍为 `PENDING`。
- V2-09 不读取或修改 `backend/.data/`，也不执行真实数据库切换；本机 loopback 300 人协议负载不等于 300 个浏览器渲染或 V2-10 的 30 分钟/真机/现场验收。

### 1.9 V2-10 已完成的自动渲染门与待签现场门

- `pnpm test:v2:soak` 在两个独立的 1920×1080 Chrome 进程中持续测量普通动态和 reduced-motion，使用隔离临时 `V2_ACTIVE` 合成库依次投影 0、24 与 300 颗真实公共恒星、节目透明层、协同点亮和权威终章；六段受测时间合计不得少于 30 分钟。
- 自动门记录 Canvas 绘制频率、帧间隔、长任务、JS 堆、DOM 数量、溢出、浏览器诊断、隐私、后端重启与页面刷新恢复。PROGRAM_SUPPORT 必须停止持续 Canvas 绘制、保持中心完全透明且不包含媒体元素；reduced-motion 全程不得持续绘制。
- 2026-08-13 正式报告状态为 `passed`，实际受测 1,800,056.8ms；动态星系约 27.73～28.60fps，最大堆约 34.1MB、DOM 峰值 59、最长任务 215ms，控制台/页面/外部请求/HTTP 异常均为 0，后端重启和终章刷新均恢复。报告与截图位于 Git 忽略目录，且脱敏自检通过。
- `pnpm preview:v2:field` 为现场验收建立临时合成 v2 栈：只把统一前端入口绑定到显式可信私网 IPv4，后端继续监听回环，退出即删除临时数据库，不读取或切换 `backend/.data/`。
- 自动门不证明 OBS 合成链、场馆网络或 vivo X300。只有项目负责人按 [`V2_10_FIELD_ACCEPTANCE.md`](./V2_10_FIELD_ACCEPTANCE.md) 记录设备、浏览器、网络、OBS 和通过/失败事实后，V2-10 才能整体关闭。

## 2. 两只时钟

### 2.1 参与者入场时钟

参与者只能按下列顺序前进，不允许跳过星色选择：

| 状态 | 进入条件 | 服务端原子效果 | 下一步 |
|---|---|---|---|
| 未建立会话 | NFC 个性令牌、携带同令牌的二维码/短链接，或映射到同一合成身份的人工协助信息尚未核验 | 无 | 核验身份 |
| `NEEDS_COLOR` | 身份在当前 `resetEpoch` 首次核验成功，且服务端已在同一事务中预留一个不透明稳定 formation slot | 建立会话和唯一参与者状态；写入 `activatedAt`；动力值初始化为 100；按当前规则版本发放“激活”星光 20，且只发一次 | 必须选择并锁定星色 |
| `NEEDS_CAPSULE_DECISION` | 服务端成功锁定星色 | 写入不可变的本场星色与 `colorLockedAt`；把已预留 slot 对应的恒星变为公共实体并发布 `star.node.upserted`；不得再创建或移动另一颗星 | 提交或跳过时光胶囊 |
| `ADMITTED` | 胶囊首次有效提交，或服务端持久化 `SKIPPED` 决定 | 首次写入 `admittedAt`；提交路径按规则发放胶囊星光，跳过路径不发放 | 进入全场当前场景 |

核验成功就是“身份激活”，不得再设置另一个重复的“激活阶段”。首次激活必须先原子预留 300 个稳定 formation slot 之一；容量已满时整笔激活以 `STAR_CAPACITY_REACHED` 拒绝，不建立参与者状态、不创建会话、不发动力值或星光。恒星只有在星色锁定成功后才成为公共星系实体；仅核验、未锁色的参与者不出现在公共星系中。

### 2.2 胶囊决定

- `SUBMITTED`：正文最多 80 个可见字符；参与者必须先明确确认“内容可能经人工筛选后，以星号和星色在现场大屏展示”的候选范围，服务端才可原子持久化正文、候选同意和提交时间。不存在“已提交但不进入候选池”的私密提交；第一次实际有效提交发放 20 星光，重复请求、后续修改和并发不得重复发放。
- `SKIPPED`：持久化跳过状态并准入，发放 0 星光。跳过不是临时前端选择，刷新、换设备和重连后必须保持。
- 已跳过者可在全场 `READY` 或 `RUNNING` 时补填。第一次实际有效补填将 `SKIPPED` 更新为 `SUBMITTED` 并发放 20 星光一次；原 `admittedAt` 不改变，不重新播放首次入场动画，也不改变全场场景。
- 已提交者可在 `READY` 或 `RUNNING` 修改本人胶囊；修改后的内容重新进入 `SUBMITTED` 人工审核状态。若旧版本正在活动投影中，服务端必须在同一事务中把旧版本从活动投影撤下并递增 `presentationRevision`，不得让旧正文继续公开，也不得把修改视为第二次奖励。
- `PAUSED` 或 `COMPLETED` 时不得新提交或补填胶囊。
- 不接受候选范围的参与者只能选择 `SKIPPED`。胶囊正文仍是受限候选内容；只有后台人工选中且未被删除/屏蔽的候选才允许进入大屏插入投影。

参与者写命令稳定命名为 `LOCK_COLOR`、`UPSERT_CAPSULE`、`SKIP_CAPSULE`、`START_STAR`、`SEND_GIFT`、`POST_BARRAGE`、`COOPERATIVE_LIGHT`。`UPSERT_CAPSULE` 同时覆盖首次提交、`SKIPPED` 后补填及已提交内容修改；服务端按胶囊决定、运行状态、revision、同意范围和幂等键区分其效果。

### 2.3 晚到者与恢复者

- 全场处于 `READY` 或 `RUNNING` 时均允许新参与者按完整入场时钟进入；`PAUSED` 和 `COMPLETED` 均拒绝首次激活及全部参与者业务变更。
- 晚到者完成提交或跳过后，直接进入全场“当前场景”，不从集结场景补播，也不推动或回退全场时钟。
- 已激活身份在 `PAUSED` 或 `COMPLETED` 仍可重新核验并建立只读会话，再从权威快照恢复；不得仅凭本地存储重建业务事实。
- `COMPLETED` 后，“已有参与者”指当前 `resetEpoch` 内任何已经写入 `activatedAt` 的身份，包括仍停在 `NEEDS_COLOR` 或 `NEEDS_CAPSULE_DECISION` 的未完成人员。其只能读取终局/个人现有事实，不能继续选色、提交/跳过胶囊或完成入场；从未激活的身份不得建立新参与者状态。

## 3. 全场运行时钟

### 3.1 模式、运行状态与场景

全场模式只有：

- `REHEARSAL`：排练，可人工跳转三个场景；结尾只能预览，不产生现场完成事实。
- `LIVE`：现场，场景只能向前推进，并使用一次确认完成全场。

运行状态只有：

- `READY`：尚未正式运行，但允许参与者入场、补填胶囊和读取快照。
- `RUNNING`：按当前场景开放对应参与者操作。
- `PAUSED`：保留当前场景并继续提供读取与重连快照；拒绝全部参与者写入。
- `COMPLETED`：不可逆终态；不是场景，也不是“第六阶段”。

运行场景只有以下三个稳定标识：

1. `ASSEMBLY`（待集结）
2. `PROGRAM_SUPPORT`（节目支持）
3. `COOPERATIVE_LIGHT`（协同点亮）

不得新增 `IDENTITY_ACTIVATION`、`CAPSULE` 或 `ARCHIVE` 全场场景。身份激活和胶囊决定属于个人入场时钟；档案/祝福是终局读取界面，不是运行阶段。

### 3.2 合法组合与写入边界

只有以下 tuple 合法；`null` 表示尚未进入任何运行场景：

| mode | status | currentScene | 说明 |
|---|---|---|---|
| `REHEARSAL` 或 `LIVE` | `READY` | `null` | 已就绪但未开场 |
| `REHEARSAL` 或 `LIVE` | `RUNNING` | 三个场景之一 | 正在运行当前场景 |
| `REHEARSAL` 或 `LIVE` | `PAUSED` | 三个场景之一 | 保留暂停前场景，只读恢复 |
| 仅 `LIVE` | `COMPLETED` | `COOPERATIVE_LIGHT` | 不可逆终态，保留最后运行场景作为终局来源 |

`REHEARSAL + COMPLETED`、`READY + 非空场景`、`RUNNING/PAUSED + null`、`COMPLETED + 非 COOPERATIVE_LIGHT` 及其他组合一律非法。参与者写入边界为：

| status | 入场/档案写入 | 当前场景业务写入 | 读取/重连 | 后台安全处置 |
|---|---|---|---|---|
| `READY` | 允许首次入场与已跳过者补填 | 不允许任何场景业务写入 | 允许 | 可切换模式、启动、清除公开内容或重置 Demo |
| `RUNNING` | 允许首次入场与已跳过者补填 | 仅允许下表与当前场景匹配的操作 | 允许 | 可执行合法运行命令、人工插入/清除投影或重置 Demo |
| `PAUSED` | 拒绝；已激活身份只能建立只读会话 | 拒绝 | 允许 | 可恢复、紧急清屏、删除/屏蔽/撤下公开内容或重置 Demo |
| `COMPLETED` | 拒绝；已激活身份只能建立只读会话 | 拒绝 | 允许，只读 | 不得恢复或重新开场；只可删除、屏蔽、清屏或撤下公开内容，或按重置门执行 Demo 重置 |

“安全处置”只指删除、屏蔽、清屏、撤下公开内容等内容控制，不包含扣减动力值、扣减星光、补发奖励或其他数值调整。所有拒绝必须返回稳定错误码和最新权威快照提示。前端离线是客户端条件而非服务端错误码；离线时禁止排队伪成功，重连后先取快照，再允许新命令。

### 3.3 管理命令与迁移

除 `RESET_DEMO` 的专用门外，运行命令要求 `STAGE_CONTROLLER` 或 `ALL`、幂等键、当前 `resetEpoch` 与期望 `runRevision`；投影命令还要求期望 `presentationRevision`。所有管理命令都写会话、当时角色、前置/结果 revision 和结果审计记录。

| 命令 | 合法前置 | 服务端原子结果 | 补充约束 |
|---|---|---|---|
| `SET_MODE` | 任一合法 `READY + null` | 保持 `READY + null`，把 mode 设为目标 `REHEARSAL` 或 `LIVE` | 只允许 READY；同值重试幂等 |
| `START` | 任一 `READY + null` | 同 mode 进入 `RUNNING + ASSEMBLY` | 开场只从 `ASSEMBLY` 开始 |
| `SET_SCENE` | `REHEARSAL + RUNNING + 任一场景` | 保持 mode/status，切换到指定三场景之一 | 排练可前跳或后跳；场景变化清除活动投影 |
| `ADVANCE` | `LIVE + RUNNING + ASSEMBLY` 或 `LIVE + RUNNING + PROGRAM_SUPPORT` | 依次进入 `PROGRAM_SUPPORT` 或 `COOPERATIVE_LIGHT` | 现场只向前；最后场景不能再 ADVANCE；场景变化清除活动投影 |
| `PAUSE` | 任一 mode 的 `RUNNING + 任一场景` | 保留 mode/currentScene，进入 `PAUSED` | 清除活动投影 |
| `RESUME` | 任一 mode 的 `PAUSED + 任一场景` | 保留 mode/currentScene，回到 `RUNNING` | 只恢复原场景，不补场景事件 |
| `COMPLETE` | `LIVE + RUNNING + COOPERATIVE_LIGHT` | 一次事务写入 `LIVE + COMPLETED + COOPERATIVE_LIGHT`、`completedAt`、终局 recap、revision、事件和审计 | 仅一次确认；先捕获当前插入中最多 6 条胶囊到只读 recap，再把活动投影清为 `NONE`；重复命令幂等返回同一终局 |
| `PREVIEW_FINALE` | `REHEARSAL + RUNNING + COOPERATIVE_LIGHT` 且 presentation=`NONE` | 不改运行 tuple；把 presentation 设为 `FINALE_PREVIEW` | 持续显示“排练预览”；服务端权威、可手动清除；不写 `COMPLETED`/`completedAt`/现场完成审计 |
| `SELECT_CAPSULE` | 候选为 `SUBMITTED` | 把候选标成 `SELECTED` 并递增该参与者 revision | 要求 `REVIEWER` 或 `ALL`；不改变 presentation；同一活动插入集合最多 6 条 |
| `SHOW_CAPSULE_INSERT` | 任一 mode 的 `RUNNING + 任一场景`、presentation=`NONE`，且请求含 1～6 条 `SELECTED` 候选 | 不改运行 tuple；把 presentation 设为 `CAPSULE_INSERT`，所含候选标为 `DISPLAYED` | 要求 `REVIEWER` 或 `ALL`；无自动轮播；空集合非法 |
| `REMOVE_CAPSULE` | 候选为 `SUBMITTED|SELECTED|DISPLAYED` | 把候选标成 `REMOVED`；若正在活动投影则从集合撤下 | 要求 `REVIEWER` 或 `ALL`、原因和审计；若撤下后集合为空则原子把 presentation 清为 `NONE` |
| `CLEAR_PRESENTATION` | presentation 不是 `NONE` | 不改运行 tuple；把 presentation 设为 `NONE` | 胶囊投影要求 `REVIEWER`/`ALL`，结尾预览要求 `STAGE_CONTROLLER`/`ALL` |
| `RESET_DEMO` | 任意合法 tuple | 按第 10.1 节建立新 `resetEpoch` 和初始状态 | 要求 `DEMO_ADMIN` 或 `ALL`、确认对话框及合成数据硬门 |

### 3.4 当前场景参与者操作

| 场景 | 合法操作 | 权威事实与奖励 |
|---|---|---|
| `ASSEMBLY` | `ADMITTED` 参与者执行一次 `START_STAR` | 写入私有 `started=true`、`startedAt`，并把公共恒星的 `started` 更新为 `true`、递增 `starRevision`、发布完整 `star.node.upserted`；首次成功发放 20 星光，不创建或移动恒星 |
| `PROGRAM_SUPPORT` | `ADMITTED` 参与者送礼或发送弹幕 | 礼物按每次明确操作扣动力；只有首次有效送礼发 10 星光。只有首次服务端接受的合规弹幕发 10 星光 |
| `COOPERATIVE_LIGHT` | `ADMITTED` 参与者执行一次协同点亮 | 首次服务端接受时写入完成事实并发 20 星光 |

晚到者只获得到达后当前场景的操作资格；若其在 `ASSEMBLY` 结束后才 `ADMITTED`，不得补做 `START_STAR` 或补领 20 星光。同理，已经离开的节目支持或协同点亮操作与奖励均不补做。动画、返回页面或档案入口不得绕过当前场景校验。

### 3.5 现场完成与排练结尾

- `LIVE` 只有在 `RUNNING + COOPERATIVE_LIGHT` 时显示最终操作。
- 项目负责人一次确认后，服务端按 `COMPLETE` 定义在一个事务中写入终态、终局 recap、revision、事件和审计；不得由动画回调触发。
- 不得再出现第二个“Stage 6”“结束阶段”或第二次完成命令。
- `REHEARSAL` 只通过 `PREVIEW_FINALE` 建立服务端权威演示投影；刷新与重连从快照恢复同一预览，直到手动清除、场景变化、暂停或重置。预览操作本身写管理审计，但不得伪装成现场完成审计。
- 终局读取可显示祝福、个人档案、最终星系以及完成瞬间捕获的最多 6 条胶囊；它们是 `COMPLETED` 的只读投影，不构成新状态。

## 4. 公共星系与事件同步

### 4.1 公共恒星模型

公共星系最多承载 300 个真实参与者恒星实体。`publicStarId` 固定为“合成姓氏拼音首字母 + `-` + 合成学号后四位”（例如 `L-4821`）；身份目录导入和数据库必须保证唯一，冲突时拒绝该目录/身份启用。项目负责人已接受该编号被熟人关联的风险，但不得扩大公开字段。每个公共实体只包含展示所需字段：

- `publicStarId`；
- `colorTemperatureKelvin` 与派生展示色；
- 不透明稳定 `formationSlot`；
- `started`（是否已在 `ASSEMBLY` 成功执行 `START_STAR`；`startedAt` 不公开）；
- `starRevision` 与 `updatedAt`。

公共实体不得包含姓名、学号、邀请令牌、会话标识、胶囊正文或其他私密字段。手机端只有当前参与者自己的恒星显示 `publicStarId` 标签和突出光效；其他参与者恒星不显示编号或身份提示。网络 payload 可以携带构成公共恒星主键所需的 `publicStarId`，这一可检查性属于已接受风险，不代表可以展示其他身份字段。

`formationSlot` 从固定合成身份的确定性、不透明 slot 目录中取得。首次激活先在同一事务中预留 slot；同一 `resetEpoch` 内刷新、重连、换设备或事件重放都不能让恒星无原因跳位。达到 300 个预留名额后必须以 `STAR_CAPACITY_REACHED` 拒绝首次激活，不得先建参与者/发奖励后再在锁色时卡住，也不得静默丢星或仅在客户端截断。锁色只把预留恒星以 `started=false` 公开，不再次占用容量；`START_STAR` 只原位更新该公共实体为 `started=true`。

### 4.2 revision 与事件序列

- `resetEpoch`：确定性重置代际。普通 v2 重置使其加 1；跨 epoch 的命令、会话和事件不得映射或合并。
- `runRevision`：mode/status/currentScene 每次有效变化递增；胶囊插入和结尾预览不改变它。
- `presentationRevision`：活动投影在 `NONE|CAPSULE_INSERT|FINALE_PREVIEW` 之间变化，或终局 recap 因完成捕获/安全撤下发生变化时递增。
- `participantRevision`：单个参与者的入场状态、颜色、场景参与事实、数值摘要或档案事实每次有效变化时递增。
- `interactionRevision`：公开弹幕发布/撤下/清屏/暂停及礼物公共事件每次有效变化时递增；它只版本化大屏互动投影，不改变 `runRevision` 或 `presentationRevision`。
- `streamSeq`：某个 `streamId` 内的连续序号；不是所有受众共享的全局序号。合法逻辑流只有 `public`、`admin` 和 `participant:<participantId>`。服务端只在事件实际追加到该流时递增该流序号；任何其他流中的私有或受限事件不得制造本流缺口，重置后各流均从 0 开始。
- `starRevision`：单个公共恒星实体的版本；锁色首次公开时创建，`START_STAR` 首次改变公共 `started` 时递增；重复、同值或私有事实变化不递增。

同一命令可在一个事务中同时改变多种 revision，并向 0～3 类逻辑流各自追加事件。事件 envelope 固定包含 `protocolVersion/resetEpoch/streamId/streamSeq/eventId/name/revision/payload`，其中事件 ID 由 `(resetEpoch, streamId, streamSeq)` 唯一确定。客户端只在同一 `streamId` 内检查 `lastSeq+1`，重复或旧序列幂等忽略，流内缺口只重拉该流快照。`/screen` 只订阅 `public`，`/welcome` 订阅 `public` 与本人的 participant 流，`/admin` 订阅 `public` 与 `admin`；不同流可在同一 WebSocket 交错传送，但不能改变各流内部顺序。

### 4.3 快照优先、事件增量

1. 首次进入、刷新、重连和任一授权流的 `streamSeq` 缺口恢复时，客户端必须先取得权威快照。
2. 所有角色快照的公共信封至少包含 `protocolVersion`、`resetEpoch`、mode/status/currentScene、`runRevision`、活动 presentation 及 `presentationRevision`、当前客户端获授权的流游标与 `rewardRuleVersion`；`/screen` 返回 `publicSeq`，`/welcome` 返回 `publicSeq+participantSeq`，`/admin` 返回 `publicSeq+adminSeq`。角色专属字段以第 4.4 节为准。
3. 活动 presentation 是服务端权威互斥字段：`NONE`、`CAPSULE_INSERT` 或 `FINALE_PREVIEW`。`CAPSULE_INSERT` 最多携带 6 条已人工选中、可公开的胶囊投影；刷新与重连必须恢复快照中的活动投影。
4. 稳定事件名及职责固定为：

   | 事件名 | 触发与最小内容 |
   |---|---|
   | `runtime.changed` | `public`；mode/status/currentScene 或 `runRevision` 变化，携带完整运行 tuple |
   | `presentation.changed` | `public`；presentation 或 `presentationRevision` 变化，携带完整活动投影的安全公共视图 |
   | `star.node.upserted` | `public`；锁色事务把预留恒星变为公共实体，或 `START_STAR` 原位更新公共 `started`，每次携带完整公共恒星投影与 `starRevision` |
   | `aggregate.changed` | `public` 或 `admin`；必须携带 `projection=PUBLIC_AGGREGATE|ADMIN_AGGREGATE`、相应完整安全聚合与独立 `aggregateRevision`，只在对应投影真实变化时追加到该流 |
   | `participant.snapshot.changed` | `participant:<id>`；携带 `projection=SELF`、新 `participantRevision` 与 `requiresSnapshot=true`，只发本人授权会话，不得夹带正文到其他流 |
   | `barrage.published` | `public`；携带完整匿名弹幕投影及 `interactionRevision`，不得包含来源、身份、会话或客户端地址 |
   | `barrage.removed` | `public`；携带本次从公开层撤下的最多 8 个 barrage ID 及 `interactionRevision` |
   | `barrage.cleared` | `public`；携带新 `displayBatch` 与 `interactionRevision`，使全部旧批次内容立即失效 |
   | `barrage.pause.changed` | `public`；携带暂停布尔值与 `interactionRevision`；暂停只拒绝新弹幕，不删除已公开事实 |
   | `gift.sent` | `public`；携带节目、礼物 ID/名称、发生时间和 `interactionRevision`，不得包含发送者身份或余额 |

5. 快照与各流续订必须从同一一致性读视图建立；客户端取得游标后按各自 `afterSeq` 续订。若服务端无法从保留窗口补齐某一流，返回 `RESYNC_REQUIRED` 并只要求重拉受影响流；`resetEpoch` 变化则重新认证并拉取全部获授权快照。任何事件均不得携带未授权私密资料。
6. 客户端按 `(resetEpoch, publicStarId, starRevision)` 幂等合并恒星。重复或旧事件不得重复建星；`resetEpoch` 不同、某个 `streamId` 内出现缺口或 revision 无法收敛时必须丢弃对应本地投影并按上文重新拉取快照。
7. 只有锁色事务成功，且命令响应或后续权威快照已包含本人公共恒星后，客户端才可以播放锁色后的回退星系动画。

### 4.4 角色快照与参与者能力

`ParticipantSnapshot` 必须在公共信封之外返回以下私有、服务端权威字段：

- `participantRevision`、`onboardingState=NEEDS_COLOR|NEEDS_CAPSULE_DECISION|ADMITTED`、`activatedAt`、锁色 Kelvin/`colorLockedAt`、`ownPublicStarId` 与本人 `formationSlot`（如已锁色）；
- `capsuleDecision=NONE|SKIPPED|SUBMITTED`，以及本人可编辑的胶囊正文、候选范围确认时间、`submittedAt`/`skippedAt` 和 `capsuleModerationStatus=null|SUBMITTED|SELECTED|DISPLAYED|REMOVED`；
- `admittedAt`、准入时的 `admittedScene`/`admittedRunRevision`，以及 `started/startedAt`、首次送礼奖励、首次合规弹幕奖励和协同点亮等本人场景事实；
- 当前动力、星光、`rewardRuleVersion` 与可审计的本人奖励摘要；
- `allowedActions`：从 `LOCK_COLOR|UPSERT_CAPSULE|SKIP_CAPSULE|START_STAR|SEND_GIFT|POST_BARRAGE|COOPERATIVE_LIGHT` 中由服务端计算出的有序去重集合。

`allowedActions` 的唯一推导规则固定为：

| 动作 | 必要条件 |
|---|---|
| `LOCK_COLOR` | `NEEDS_COLOR` 且 status 为 `READY` 或 `RUNNING` |
| `UPSERT_CAPSULE` | status 为 `READY` 或 `RUNNING`，且处于 `NEEDS_CAPSULE_DECISION`，或已 `ADMITTED` 且胶囊决定为 `SKIPPED`/`SUBMITTED` |
| `SKIP_CAPSULE` | `NEEDS_CAPSULE_DECISION`、胶囊决定为 `NONE`，且 status 为 `READY` 或 `RUNNING` |
| `START_STAR` | `ADMITTED + RUNNING + ASSEMBLY` 且本人尚未启动 |
| `SEND_GIFT`、`POST_BARRAGE` | `ADMITTED + RUNNING + PROGRAM_SUPPORT`；服务端仍按动力余额、内容规则、频率和屏蔽状态逐次校验 |
| `COOPERATIVE_LIGHT` | `ADMITTED + RUNNING + COOPERATIVE_LIGHT` 且本人尚未完成点亮 |

`PAUSED` 与 `COMPLETED` 的 `allowedActions` 必须为空。该集合用于三端一致地展示可操作项，但不是绕过服务端校验的授权令牌；每次命令仍须在事务中重查最新状态。命令成功响应必须返回更新后的参与者投影与当前运行 tuple；客户端收到 `runtime.changed`、`participant.snapshot.changed`、epoch 变化或序列缺口后，必须先刷新 `ParticipantSnapshot`，再重新启用写操作。

`ScreenSnapshot` 只返回公共恒星完整数组（包含 `started`）、安全聚合及 `aggregateRevision`、当前节目及匿名礼物目录、`interactionRevision`/弹幕暂停/当前显示批次、最多 8 条仍公开的匿名弹幕、活动 presentation 与终局 recap；不得返回来源标识或参与者私有字段。安全聚合至少区分 `activatedCount`、`publicStarCount`、`admittedCount`、`starStartedCount`、`cooperativeLightCount` 与星光总量。

`AdminSnapshot` 在公共信封之外返回权限、运行/投影控制收据、`aggregateRevision`、公开弹幕及其匿名 `sourceId`、互动暂停状态，以及匿名入场漏斗：`activatedCount`、`publicStarCount`、`admittedCount`、`onboardingPendingCount`、`capsuleSubmittedCount`、`capsuleSkippedCount`、`starStartedCount`、`cooperativeLightCount`。`sourceId` 只用于审核会话的来源屏蔽，不得展示、导出或映射为参与者身份。漏斗计数以唯一参与者事实聚合，在线会话数只能单列为辅助值，不能作为人数分母；后台不得为漏斗增加姓名、学号或逐人列表。

`ADVANCE` 与 `COMPLETE` 的确认界面必须把最新匿名漏斗与适用警告合并到原有一次确认中。警告谓词固定为：

- `ONBOARDING_PENDING`：`activatedCount - admittedCount > 0`；适用于所有 `ADVANCE` 与 `COMPLETE`；
- `STAR_START_PENDING`：离开 `ASSEMBLY` 时，当前已准入且在该场景结束事务前具备 `START_STAR` 资格、但 `started=false` 的人数大于 0；晚到且从未获得 ASSEMBLY 资格者不进入分母；
- `COOPERATIVE_LIGHT_PENDING`：执行 `COMPLETE` 时，进入 `COOPERATIVE_LIGHT` 前已经准入，或在该场景运行期间完成准入、且仍未协同点亮的人数大于 0。

警告不是人数硬门；有权限的操作者可在同一确认中明确选择继续。服务端执行事务时重新计算警告：若仍有警告而请求没有 `overrideReadinessWarnings=true`，以 `READINESS_CONFIRMATION_REQUIRED` 返回最新匿名摘要且不改变状态；显式 override 后可继续，并把分母/未完成人数、当时摘要、警告和操作者写入审计。权限、旧 revision/epoch、错误 tuple、离线或结果未知仍是不可 override 的硬门。

## 5. 时光胶囊插入子场景

- 胶囊展示是后台审核者通过 `SHOW_CAPSULE_INSERT` 触发的大屏投影，不是全场场景；它只把互斥 presentation 从 `NONE` 改为 `CAPSULE_INSERT`，递增 `presentationRevision`，不修改 mode、status、currentScene 或 `runRevision`。
- 每次插入最多包含 6 条已确认候选范围、未被删除/屏蔽且由人工明确选中的胶囊。禁止 AI 自动公开、自动轮播、按时间自动切换以及超过 6 条的隐式截断。
- 插入时大屏可以覆盖或压暗当前主场景；`CLEAR_PRESENTATION` 后回到同一运行 tuple，并通过 `presentation.changed` 同步，不发布伪造的场景切换事件。
- `CAPSULE_INSERT` 与 `FINALE_PREVIEW` 互斥；已有任一活动投影时，必须先手动清为 `NONE` 才能建立另一投影。
- `SET_SCENE`、`ADVANCE`、`PAUSE` 和 `RESET_DEMO` 自动按 `CLEAR_PRESENTATION` 的同一规则清除活动投影；若清除的是 `CAPSULE_INSERT`，其中 `DISPLAYED` 候选回到 `SELECTED` 并递增相应 participant revision。`COMPLETE` 在同一事务中先把完成瞬间正在展示的最多 6 条胶囊捕获到终局 recap，再清除活动投影，但候选保持 `DISPLAYED`。
- `COMPLETED` 后禁止新发起胶囊插入。后台仍可按权限、确认和审计删除/屏蔽/撤下终局 recap 中的公开内容；这只改变公共投影与 `presentationRevision`，不改变运行终态、奖励或动力值。
- 展示、清除及完成后的安全撤下都必须幂等并写管理审计；参与者端不获得后台选择能力。

### 5.1 审核状态迁移

胶囊审核状态只有 `SUBMITTED|SELECTED|DISPLAYED|REMOVED`；没有正文/未提交时为 `null`。唯一合法迁移为：

| 命令/事实 | 前置 | 结果 | revision 与事件 |
|---|---|---|---|
| `UPSERT_CAPSULE` 首次提交/补填 | `null`/`SKIPPED` | `SUBMITTED` | 递增本人 `participantRevision`；私有失效通知；安全聚合变化另发 `aggregate.changed` |
| `UPSERT_CAPSULE` 修改 | `SUBMITTED|SELECTED|DISPLAYED` | 新版本回 `SUBMITTED` | 递增本人 revision；旧版本若在活动投影中则同事务撤下并递增 `presentationRevision`；集合变空时 presentation=`NONE` |
| `SELECT_CAPSULE` | `SUBMITTED` | `SELECTED` | 递增本人 revision，写审核审计；不改变 presentation |
| `SHOW_CAPSULE_INSERT` | 1～6 条 `SELECTED` | 所含候选为 `DISPLAYED` | 同一事务递增各本人 revision 与 `presentationRevision`，发布私有失效及 `presentation.changed` |
| `CLEAR_PRESENTATION` | 活动 `CAPSULE_INSERT` | 所含 `DISPLAYED` 回 `SELECTED`，presentation=`NONE` | 同一事务递增各本人 revision 与 `presentationRevision` |
| `REMOVE_CAPSULE` | `SUBMITTED|SELECTED|DISPLAYED` | `REMOVED` | 递增本人 revision；如正在展示则同时撤下并递增 `presentationRevision`；集合为空时 presentation=`NONE` |
| `COMPLETE` 捕获终局 recap | 活动 `DISPLAYED` | 候选保持 `DISPLAYED`，活动 presentation 清为 `NONE`，只读副本进入 recap | 递增 `presentationRevision`；参与者审核状态不因捕获而回退 |

`REMOVED` 是本次提交版本的终态；参与者在 `READY`/`RUNNING` 再次 `UPSERT_CAPSULE` 时产生新的正文版本并回到 `SUBMITTED`，但仍不重复奖励。`SHOW_CAPSULE_INSERT` 不承担选择职责，不能直接消费 `SUBMITTED`。任何集合变化后都禁止保存空的 `CAPSULE_INSERT`。

### 5.2 大屏投影、OBS 与实时互动优先级

1. 大屏视觉优先级固定为：`COMPLETED` > `FINALE_PREVIEW` > `CAPSULE_INSERT` > 持久故障/断线提示 > 当前运行场景 > 实时弹幕/礼物。高优先级层出现时必须立即停止和清理低优先级临时动画，但不得删除已提交业务事实。
2. `PROGRAM_SUPPORT` 是 OBS 透明浏览器源：`html/body/app/screen` 背景必须透明，中心区域不绘制节目占位视频；弱星系只保留在左右边缘约 15%～20% 安全区。网页始终静音，不上传、解码、播放或控制节目视频/音频。
3. 合规弹幕正文最多 40 个用户感知字符。单参与者最多 3 条/10 秒，全场最多 12 条/秒；敏感词、链接、联系方式、已屏蔽来源和暂停状态均由服务端事务重查。大屏不显示作者、星号、来源 ID、排行或头像。
4. 后台命令固定为 `SET_BARRAGE_PAUSED`、`REMOVE_BARRAGE`、`BLOCK_BARRAGE_SOURCE`、`CLEAR_BARRAGES`；全部要求角色、当前 revision、确认、原因与幂等门，并写独立审核记录。`COMPLETED` 后只允许撤下、来源屏蔽与清屏等安全减法，不允许重新公开内容。
5. 礼物事件只表示已经提交的服务端事实；1.5 秒同类事件可合并为视觉计数，但不能合并账本或扣减。大屏最多同时保留一个主礼物和一个次礼物；星舰允许更突出但有限时的覆层，不得遮挡终章、胶囊或故障信息。
6. `CAPSULE_INSERT` 活动时不显示弹幕/礼物；期间新事件只更新权威游标/快照，不进入视觉回放队列。清除插入后直接呈现当前场景，不能补演被遮挡的互动。

## 6. 手机端信息架构与反馈

### 6.1 主舞台

- 主页面是一片持续但克制流动的星系，恒星围绕视觉中心运动；本人恒星随星系运动，但通过更高亮度、轮廓/光晕和唯一编号标签持续可辨认。
- 页面不展示“实时同步”、裸露的 `RUNNING`、六阶段编号线或长期占位的身份/数值说明。异常状态仍必须明确可见。
- 退出入口放到原“实时同步”位置；每次退出都需要确认。
- 档案/成长读取入口可以保留，但不得伪装成运行阶段或全场归档场景。

### 6.2 单一液态玻璃操作坞

- 下半页只有一个主要操作坞，承载当前场景的核心操作和必要导航；避免多个玻璃卡片堆叠成“玻璃墙”。
- 液态玻璃只使用克制的透明度、边框、高光和静态背景模糊；禁止持续动画化 `filter`/`backdrop-filter`，低性能或不支持模糊时必须退化为可读的不透明深色面板。
- 操作坞内容随参与者状态和全场场景替换，避免一次性显示所有入口。触控目标、底部安全区、软键盘和短视口不得遮挡主要操作。

### 6.3 提示与草稿

- 成功提示显示约 3.5 秒后自动收回；成功事实必须同时落入持久的权威界面状态，不能依赖提示条保存结果。
- 错误、离线、暂停和已完成提示必须保持，直到条件解除、用户确认或取得更新快照。
- 草稿只存在当前浏览器内存，不写服务端、不跨会话恢复；完成、退出或会话重置时清空。弹幕草稿在离开 `PROGRAM_SUPPORT` 时额外清空。

## 7. 首次入场动效契约

### 7.1 正常首次路径

1. NFC/备用令牌由服务端核验成功，响应明确表示首次新建身份并返回 `NEEDS_COLOR` 后，客户端先等待页面处于稳定 `visible`；开始前暂不可见时不得在后台悄悄消耗镜头。
2. 可见性门满足后，以 Vue、CSS 和低 DOM SVG 播放约 2.8 秒“穿过星云、聚焦并找到中性恒星”序列；四阶段依次为建立/加速、连续穿越、减速/捕获、锁定/交接。全屏径向速度线只使用 `transform`/`opacity`，手机端不得为此加载 GSAP。
3. 寻星和选色静态态必须共用同一颗持久恒星节点，并固定在横向 `50%`、纵向 `42vh` 的统一视觉轴；镜头末帧与静态首帧的中心、尺寸和颜色不得跳变。恒星由同心白核、中性光晕和默认 `5800K` 色温光晕构成，色温层在交接末段连续显现。
4. 选色文案与控件在镜头中提前渲染，但在交接完成前必须保持 `inert`、不可聚焦和不可操作；镜头结束只解除交互隔离，不得替换恒星节点或触发布局重排。正常完成监听主动画 `animationend`，定时器只作缺失事件时的有界兜底。
5. 星色选择不设自动倒计时；参与者必须主动选色并提交，星色不得跳过。
6. 服务端锁色成功且客户端已获得包含本人恒星的权威确认后，同一持久星播放约 1.2 秒色温闪烁并平滑上移到寄语画面；提交或持久化跳过胶囊并得到 `ADMITTED` 权威快照后，再以约 3.2 秒缩远到 Canvas 本人轨道并展开星系。
7. 动画只解释已经确认的状态，不得在时间轴结束时替服务端推进状态或发放奖励；身份响应、权威快照、实时连接和允许动作不得等待表现层完成。

正常首次路径不提供跳过按钮；这一点明确覆盖 D-024 的首帧可跳过与约 0.9 秒约束。为避免把动画变成阻塞器，下列路径不强制重播，直接进入对应静态权威状态：

- 已激活返回、刷新、跨设备登录或断线重连；
- 核验/锁色失败、请求超时、事件 revision 缺口；
- 镜头真正开始后页面进入后台、被挂起或发生无法可靠续播的中断；该次镜头立即结束，返回时不得重播；
- 用户启用 `prefers-reduced-motion: reduce`。

静态降级必须保留完整信息、按钮、焦点顺序和状态反馈，并直接呈现与正常镜头末帧相同的恒星、文案和可操作控件。V2-08 手机端已使用 Vue、CSS、SVG 与 Canvas 实现，未加载 GSAP；D-026 仍只批准 V2-07 `/screen` 动态加载 GSAP core，用于少量 DOM 覆层的 transform/opacity 时间线。该例外不批准 GSAP 插件、逐星 GSAP、重型 3D、媒体控制或把 GSAP 扩到手机端，也不以 AI 生成预览图作为实现验收依据。

## 8. 星光与动力规则

当前 `rewardRuleVersion` 的星光上限为 100，当前六个奖励事件合计满额 100；服务端只按事件首次有效发生发放：

| 奖励事件 | 默认星光 | 唯一性与边界 |
|---|---:|---|
| 首次成功激活 | 20 | 当前 `resetEpoch` 每位参与者一次；先成功预留 formation slot，再与初始动力值 100 同一激活事务写入 |
| 首次实际提交时光胶囊 | 20 | `SKIPPED` 为 0；跳过后首次补填仍可获得一次 |
| 首次有效启动星星 | 20 | 仅 `ADMITTED + RUNNING + ASSEMBLY` 的 `START_STAR` 成功事实发放一次；错过场景不补领 |
| 首次有效送礼 | 10 | 重复送礼仍消耗动力，但不重复发放该星光 |
| 首次合规弹幕 | 10 | 只有服务端接受的合规弹幕计入 |
| 首次协同点亮 | 20 | 只有服务端接受的协同点亮计入 |

- 每笔星光使用 `(resetEpoch, participantId, rewardEventKey)` 唯一账本约束；每行同时持久化实际 `delta` 和 `rewardRuleVersion`。重试、重连、重复事件和跨设备操作不得重复奖励。
- 一个 `resetEpoch` 从建立到完成固定使用同一个 `rewardRuleVersion`，运行中不得热切换权重。以后调整奖励事件权重必须建立新的规则集并从新的 `resetEpoch` 生效；旧账本的版本、实际增量和累计值不改写、不回算。
- 星光与未来抽奖概率成正比只是后续产品方向；v2 本阶段不实现抽奖、兑奖、概率公式或领奖核销。
- 本协议不授权后台在终局前后扣减/补发动力值或星光。完成后的安全处理仅限删除、屏蔽、清屏或撤下公开内容，不改变任何数值账本。

## 9. 幂等、错误、事件名与隐私

- 所有写命令必须携带 `protocolVersion=2`、当前 `resetEpoch` 和幂等键，并在服务端事务中同时完成业务状态、奖励账本、revision 与待广播事件写入。管理命令还必须携带对应期望 revision。
- 同一幂等键与同一规范化请求体重试时返回同一权威结果，不重复写入；同一幂等键配不同请求体返回 `IDEMPOTENCY_CONFLICT`。
- 稳定服务端错误码采用以下**闭合集合**；V2-01 不得暗中继承未列出的 v1 码：

  | 错误码 | 触发条件 |
  |---|---|
  | `AUTH_REQUIRED` | 缺少、失效或不属于当前 epoch 的会话；版本/epoch 专项错误优先返回其专用码 |
  | `ROLE_REQUIRED` | 已认证但缺少命令所需角色或权限 |
  | `VALIDATION_FAILED` | 请求结构、枚举、长度、必填确认或参数范围不合法 |
  | `PROTOCOL_VERSION_MISMATCH` | 请求不是协议 v2 |
  | `STALE_RESET_EPOCH` | 请求、会话或事件不属于当前 `resetEpoch` |
  | `RUNTIME_PAUSED` | `PAUSED` 下尝试参与者业务写入 |
  | `RUNTIME_COMPLETED` | `COMPLETED` 下尝试参与者业务写入、重新开场或新建公开投影 |
  | `STAR_CAPACITY_REACHED` | 300 个 formation slot 已预留，首次激活无法原子取得名额 |
  | `ONBOARDING_STATE_INVALID` | 参与者状态不满足激活、锁色、胶囊或补填命令前置条件 |
  | `SCENE_TRANSITION_INVALID` | mode/status/currentScene 或目标场景不符合第 3.3 节 |
  | `SCENE_ACTION_INVALID` | 参与者命令不属于当前运行场景，或该参与者不具备此场景动作资格 |
  | `PRESENTATION_STATE_INVALID` | 胶囊选择/展示/清除/撤下或结尾预览不满足当前 presentation 与审核状态迁移 |
  | `RESOURCE_NOT_FOUND` | 格式合法且调用者有权引用的候选、节目或其他命令资源不存在；响应不得泄露无权资源是否存在 |
  | `REVISION_CONFLICT` | 请求携带的期望 run/presentation revision 已过期 |
  | `READINESS_CONFIRMATION_REQUIRED` | `ADVANCE`/`COMPLETE` 存在匿名就绪警告，但请求未明确确认 override |
  | `IDEMPOTENCY_CONFLICT` | 同一幂等键被用于不同规范化请求体 |
  | `INSUFFICIENT_BALANCE` | 礼物命令通过其他校验但动力余额不足 |
  | `CONTENT_REJECTED` | 胶囊或弹幕违反内容、长度以外的公开规则 |
  | `SOURCE_BLOCKED` | 当前参与者来源已被后台屏蔽，不能发布公共内容 |
  | `RATE_LIMITED` | 命令超过冻结的频率限制；响应携带可重试提示，不得伪装幂等成功 |
  | `SERVICE_UNAVAILABLE` | 服务端暂时不能安全完成或确认事务；客户端必须按未知结果/安全重试流程处理 |
  | `RESYNC_REQUIRED` | 指定逻辑流的历史保留窗口不足，无法从请求游标连续补发；响应指明需重拉的 `streamId` |

- 错误响应必须携带稳定错误码、当前 `resetEpoch` 和可用于拉取最新快照的提示；不能只显示通用失败。离线是客户端条件，不是服务端错误码；客户端离线时禁止排队伪成功。
- 事件不得泄露邀请令牌、真实姓名、学号、会话凭据、私密胶囊或后台账号信息。日志、截图与测试证据只使用固定合成身份。
- 旧会话在 v2 切换或 `RESET_DEMO` 后必须失效；`resetEpoch` 不匹配的事件和命令一律拒绝，不能尝试映射到新状态。

## 10. 普通 Demo 重置与一次性切换

V2-02 已新增 `0008_protocol_v2_foundation.sql`、`backend/src/db/v2-foundation.ts` 和维护 CLI。迁移只追加 `protocol_runtime` 与 v2 表/约束，保持 `active_protocol_version='1'`、`activation_state='V1_ACTIVE'`，不会在启动或迁移时清空数据或自动激活 v2。协议元数据明确区分 `V1_ACTIVE|V2_ACTIVE` 与 `UNVERIFIED|SYNTHETIC_DEMO|PROTECTED`；当前 v1 服务遇到已激活 v2 或任何 v2 运行事实会硬拒绝启动，防止混跑。V2-02 未增加 package 脚本别名；实际入口是 `pnpm exec tsx backend/src/cli/v2-switch.ts`、`pnpm exec tsx backend/src/cli/v2-reset.ts` 与 `pnpm exec tsx backend/src/cli/v2-verify.ts`。仓库实际 `.data` 未执行下述破坏性命令。

### 10.1 v2 运行期 `RESET_DEMO`

`RESET_DEMO` 是显式后台危险命令，不是启动初始化，也不是 v1→v2 迁移：

V2-02 只提供维护窗口使用的 `pnpm exec tsx backend/src/cli/v2-reset.ts` 数据基础命令；V2-06 才实现本节由后台权限、审计和现场状态约束的 `RESET_DEMO`。维护命令同样要求精确确认值 `SYNTHETIC_DEMO_DATA_IS_DISPOSABLE`，且只接受可验证的 `V2_ACTIVE + SYNTHETIC_DEMO` 数据库，在一个事务中递增 epoch 并重建空白 v2 基础；不得用它冒充已上线的后台控制。

1. 可从任意合法运行 tuple 发起，但必须由 `DEMO_ADMIN` 或 `ALL` 当前角色操作、完成确认，并在执行前验证数据库全部为可丢弃的合成/Demo 数据。发现任何真实、个人、不可重建或有保留价值的数据时立即停止。
2. 服务端在一个事务中把 `resetEpoch` 加 1，并建立 `protocolVersion=2`、`mode=REHEARSAL`、`status=READY`、`currentScene=null`、presentation=`NONE`；新 epoch 的 `runRevision`、`presentationRevision`、各实体 revision 与每条授权流的 `streamSeq` 从 0 开始。
3. 重置清除参与者可变状态、slot 预留/公共恒星成员关系、胶囊正文与候选/展示、奖励和动力账本、节目互动、弹幕与其他公共内容、幂等记录、运行事件及全部参与者/后台会话。
4. 重置保留固定合成身份目录、邀请令牌映射、每个合成身份的 `publicStarId` 以及确定性、不透明 formation-slot 目录；这些目录只用于新 epoch 重新预留，不表示恒星已公开加入。
5. 重置不得在服务启动、迁移失败、客户端版本错误或快照读取失败时自动执行。命令失败不得留下半清空状态；旧 epoch 会话和事件只能得到 `STALE_RESET_EPOCH`。

### 10.2 v1→v2 一次性切换门

v1→v2 只允许在确认数据库全部为可丢弃的合成/Demo 数据后执行破坏性切换。V2-02 的实现入口固定为 `pnpm exec tsx backend/src/cli/v2-switch.ts`，必须同时传入 `--backup <尚不存在的 SQLite 路径>` 与 `--confirm SYNTHETIC_DEMO_DATA_IS_DISPOSABLE`：

1. 切换前检查数据来源、数量、备份和当前 `resetEpoch`；如果发现任何真实、个人、不可重建或有保留价值的参与者历史，立即停止并由项目负责人重新决定迁移方案。
2. 独立迁移固定为 `0008_protocol_v2_foundation.sql`；`0001`～`0007` 不得改写。仅应用迁移不会激活 v2。
3. 切换前必须完成当前 v1 服务同一 generation 的真实 `listen` 与干净关闭；构建失败、监听失败、心跳过期或上一代回执均不能满足切换资格。数据库门无法自动发现 `0008` 应用前已启动的旧二进制，因此操作员仍必须人工核验旧 PID、端口和数据库写入进程全部退出。
4. 切换门只接受迁移完整、schema 精确匹配、SQLite 完整性通过、固定 300 身份 seed/manifest 可验证、无未知表/结构漂移、无 v1 可变历史、无部分 v2 事实且运行状态为确定性干净基线的数据库。任何真实、受保护、不可重建、有价值或无法证明为合成的数据均以稳定维护错误停止，不创建备份或清空数据。
5. 备份父目录必须已存在，目标路径必须与活动数据库不同且尚不存在；命令不会覆盖已有文件。切换前先建立可读、完整性通过的 v1 SQLite 备份，计算 SHA-256，并在创建备份期间或取得事务锁前检测数据变化。
6. 通过二次 preflight 后，单个 `BEGIN IMMEDIATE` 事务清除 v1 可变事实、建立空白 v2 epoch、固定 slot 目录和初始游标，把协议元数据原子改为 `2 + V2_ACTIVE + SYNTHETIC_DEMO`，持久化备份摘要与切换时间，再执行完整 v2 基础验证。失败则回滚整个数据库事务并保留已验证备份，不留下半切换状态。
7. 切换后当前 v1 服务会硬拒绝该数据库；V2-03～V2-09 已具备同版实现与自动证据，但只有在 V2-10 的目标证据和维护窗口前置条件完成后，才能对实际数据库授权启用。不得保留双写、v1 兼容 API、状态翻译或“检测失败就回到六阶段”的旁路。
8. 若验收失败，只能停止服务并整体恢复到保存的 v1 备份与同一套 v1 版本，不能手工拼接 v1/v2 表。恢复或再次切换均需新的明确授权与证据。

## 11. V2-00 后的实施验收

以下条件全部通过，才能声称协议 v2 已实现；文档完成本身不等于实现完成：

### 11.1 契约与数据库

- 三端和服务端共享同一 v2 枚举、合法 tuple、命令迁移、revision、稳定事件名和第 9 节错误码；不存在仍作为当前逻辑使用的 `stage=1..6`。
- 新迁移可从固定合成 v1 基线执行一次性重建；重复启动不重复奖励或建星；`0001`～`0007` 未被改写。
- 真实/有价值数据探测会硬停止，不允许静默清空；普通 `RESET_DEMO` 只能显式确认执行，从任意合法 tuple 原子回到新 `resetEpoch` 的 `REHEARSAL + READY + null`，且不会在启动时自动发生。

### 11.2 参与者入场

- NFC、同令牌二维码/短链接及合成姓名/学号人工协助均映射同一身份。首次核验先原子预留稳定 slot，再得到会话、动力 100、激活星光 20 和 `NEEDS_COLOR`；重复核验不重复发放。
- 未锁色者不出现在星系，且不能跳过选色；锁色后只产生一个稳定公共恒星并进入 `NEEDS_CAPSULE_DECISION`。
- 最多 80 个可见字符且明确确认候选范围的胶囊提交，与持久化跳过都能准入；不存在私密但不入候选池的提交。跳过为 0 星光且跨刷新保持；READY/RUNNING 补填只奖励一次且不改 `admittedAt`。
- READY/RUNNING 晚到者完成个人流程后进入当前场景；PAUSED 拒绝写入但允许已激活身份只读恢复；COMPLETED 允许任何本 epoch 已激活身份只读重认证，但未完成者不能继续入场。

### 11.3 全场与胶囊插入

- 所有 mode/status/currentScene 只形成第 3.2 节合法 tuple；`SET_MODE`、`START`、`SET_SCENE`、`ADVANCE`、`PAUSE`、`RESUME` 和 `COMPLETE` 的非法来源、目标及过期 revision 均被拒绝。
- LIVE 只能按三个场景向前运行；最终一次确认原子进入 `COMPLETED`，重复命令幂等，不存在第二个结束阶段。
- `START_STAR` 只在 `ADMITTED + RUNNING + ASSEMBLY` 成功一次，不创建或移动恒星；其公共 `started`、`starRevision`、`star.node.upserted`、本人事实与奖励在同一事务收敛，大屏可由快照或增量恢复。晚到错过 ASSEMBLY 者不能补做或补领。礼物/弹幕仅 PROGRAM_SUPPORT，协同点亮仅 COOPERATIVE_LIGHT，均无跨场景补奖励。
- REHEARSAL 只在 `RUNNING + COOPERATIVE_LIGHT + presentation NONE` 建立服务端权威结尾预览，刷新/重连恢复且始终显示排练标记；它可手动清除，数据库没有现场完成事实。
- 最多 6 条胶囊的人工插入不改变主场景/运行状态；presentation 三态互斥并由 `presentationRevision` 同步；无 AI、无自动轮播。COMPLETED 后不能新展示，但可安全撤下终局 recap 内容。
- Participant/Admin/Screen 三类快照符合第 4.4 节；参与者 `allowedActions` 与服务端状态一致，runtime/private 事件后先刷新再写；后台匿名漏斗不泄露逐人身份，就绪警告可明确 override，但任何安全硬门不可 override。

### 11.4 星系同步、恢复与容量

- 首屏和重连先取带 `resetEpoch`、各类 revision 和获授权 `streamSeq` 游标的权威快照，再分流消费稳定事件；不同流交错不制造伪缺口，重复、乱序、真缺口和旧 epoch 测试不会重复建星或错误移位。
- 300 个固定合成参与者各可预留 slot 并形成一个真实公共恒星；第 301 个首次激活在创建参与者状态、会话、动力或星光前得到 `STAR_CAPACITY_REACHED`，不发生静默截断或卡在待选色。
- 公共 payload 和日志通过隐私检查；本人星号仅在本人手机突出，其他星不显示编号。
- 服务重启、浏览器刷新、断线重连和跨设备登录都恢复一致的参与者状态、版本化星光账本、运行 tuple、活动 presentation 和 formation slot。

### 11.5 手机端、动效与无障碍

- 390×844、短视口与软键盘场景无关键操作遮挡；下半页只有一个主要操作坞，模糊不支持时仍清晰可读。
- 正常首次路径在新身份权威激活后先等待页面稳定 `visible`，再按“约 2.8 秒四阶段全屏径向寻星 → 不限时选色 → 权威锁色后约 1.2 秒闪烁并进入寄语 → 胶囊决定权威完成后约 3.2 秒拉远入轨”执行；寻星、选色、寄语与入轨共用同一持久恒星，动画不触发或延迟业务推进与实时连接。
- 首次正常路径不出现跳过控件；开播后的真正后台中断立即收束且返回不重播，reduced-motion、返回、刷新、断线和失败路径直接落到可操作静态状态。
- 成功提示约 3.5 秒收回，错误/离线/暂停/完成保持；退出每次确认，草稿按约定清空。
- 键盘、焦点、触控目标、对比度、屏幕阅读器语义和 `prefers-reduced-motion` 通过自动与人工检查。

### 11.6 三端与性能证据

- `/welcome`、`/screen`、`/admin` 使用同一服务端事实，在暂停、恢复、完成、清屏、重置和旧会话失效场景中一致。
- 300 个固定合成参与者的运行/投影、礼物、弹幕、协同点亮和恒星 upsert 传播延迟 p95 均不超过 2 秒；业务失败、重复奖励、重复恒星、负动力和旧 epoch 污染为 0。
- 同一 `resetEpoch` 只使用一个 `rewardRuleVersion`；每行账本保留实际增量和版本，运行中切换规则被拒绝，新规则只从新 epoch 生效且不改写历史。系统不存在未授权的后台数值扣减/补发入口。
- D-027 的历史自动门必须以新鲜合成邀请、normal-motion 和生产 Vue 页面断言可见性门、首次约 2.8 秒镜头、无跳过、后台中断静态及刷新/恢复/reduced-motion 不重播；既有只走 reduced-motion 或只等待选色终态的证据不得代替，也不得把该门扩张为视觉连续性通过。
- D-028 自动连续性门还必须采集多个镜头阶段，并断言同一恒星节点持续存在、末帧到选色静态首帧的中心/尺寸差不超过 1 CSS px、颜色相同、CLS 小于 `0.01`、交接前控件不可用而交接后立即可用；人工必须目检至少六帧的穿越方向、速度连续性、捕获和交接。
- 自动化浏览器通过不等于真机通过；仍需在 vivo X300 默认浏览器用新鲜邀请对 D-028 当前版本完成首次视觉连续性、NFC/备用入口、软键盘、断线恢复、退出确认和终局只读的人工证据。

## 12. 明确不在 v2 当前范围

- 真实参与者数据迁移、公网部署、实体 NFC 写卡、场馆硬件和正式品牌授权；
- AI 胶囊审核、自动公开、自动轮播；
- 抽奖概率、兑奖和领奖核销；
- 重型 3D 场景、GSAP 插件、逐星 GSAP 或除 D-026 `/screen` core 例外之外的新增大型动画运行时；
- 用 AI 生成预览图替代真实项目页面、浏览器证据或真机验收。
