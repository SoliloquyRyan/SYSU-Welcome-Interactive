# 协议 v2：身份激活、星系与现场运行契约

> D-089（本地 schema 19，待配套发布）：节目顺序为 19 个正式节目与 A/B/C 三个互动环节；互动环节不计入节目且不接收礼物。新增服务器权威抢答、上台观众抽取与一人一票，礼物批量数量、个人星色弹幕、节目态礼物统计和谢幕完整账目。现场互动使用独立持久状态并通过 `live.interaction.changed` 广播；schema 18→19 保留当前 epoch 与既有记录。详见 [D-089](./D089_LIVE_INTERACTION_ACCEPTANCE.md)。

> D-088（本地 schema 18，待配套发布）：节目输入增加可选 `performers`（最多 240 字单行；缺省保留既有值，显式空串清空）；`currentProgram` 与各端 `programs` 输出增加 `performers`（旧事件缺省为空）。公开大屏快照新增 `programs`，内容与当前启用目录一致。它是负责人提供的公开演出资料，不是参与者身份，仍不公开身份表的姓名、学号、邀请令牌。`program.changed` 沿用当前投影及重取快照机制，历史事件可继续解析。详见 [D-088](./D088_CREDITS_ACCEPTANCE.md)。

> D-074（2026-09-07）：手机照片式银河替换为极光细丝与点描星尘，光场与星体共享轨道投影；大小屏统一青紫/暖白光色并抬高深靛蓝暗部，兼容和静态路径同样艺术化。覆盖 D-073 的图片主盘面，保留入场人数、D-072 时长与 schema 17 业务。当前范围与验证见 [D-074 验收](./D074_ARTISTIC_GALAXY_ACCEPTANCE.md)。

> D-072（2026-09-07）：当前美术以 [电影感修订与验收](./D072_CINEMATIC_ACCEPTANCE.md) 为准，覆盖下文旧 8.4 秒开场和 D-071 星舰美术。开场现为 12 秒；星舰手机 5.8 秒、公屏 7.2 秒；普通节目背景使用持续流动的正式银河，只有 `media=overlay` 保持透明并停止绘制。手机内容页去整面模糊，档案收紧布局。修复同一连接中快照先于礼物消息导致的漏播，状态与计数不回退。schema 17、四档礼物、身份、审核和抽奖规则保持。

> D-071（2026-09-07，已部署）：活动礼物目录固定 1/5/10/20，每次完整扣除动力，取消节目首礼减免；旧减免记录只保留审计。本人快照新增礼物/弹幕历史，当前节目投影新增各礼物数量；星舰实时事件驱动在线手机与公屏动画且不携带赠送者身份。手机聊天使用可滚动半透明气泡并从快照恢复少量近期公开消息。数据库当前要求 schema 17；精确升级与回滚见 §10.6 和 [验收记录](./D071_GIFT_EXPERIENCE_ACCEPTANCE.md)。
>
> D-069（2026-09-07）：手机发送不再要求匿名勾选；手机聊天列表和后台弹幕列表展示服务器提供的发送者 publicStarId（星号）及消息正文。覆盖此前匿名弹幕约定；新公开事件携带星号，后台旧消息关联星位补全，完整姓名/学号/身份 ID 不公开。
> D-067（2026-09-07，已部署；453/453，浏览器及 OBS 验证范围见记录）：本次用户要求覆盖早期“无手机音乐、手机不显示公共弹幕、节目态只能透明”的限制。新版默认节目星海底图，OBS 表演视频用 `/screen?media=overlay`；节目切换显示标题及节目单表演者后 8.5 秒淡出。手机匿名实时弹幕与大屏共用服务端审核，五种单色免费、三种渐变各 10 动力本场解锁一次。余额仍为 100；每个表演首礼减免最多 10 动力，不可重复领取、不跨节目积攒减免。开场音乐是原创 Web Audio 轻钢琴音色，点按开启、切节目淡出；未打包或下载《星际穿越》原声。字体保留已认可方案 C。数据库新增 schema 16，升级保留业务状态，必须先停本项目服务并建立验证备份。最终验收见 [本轮记录](./D067_OVERNIGHT_ACCEPTANCE.md)。

> D-061 历史补充：节目目录在当时要求 schema 15，14→15 维护仍见 §10.5；当前协议 tip 为 schema 17，16→17 见 §10.6。下方 schema 14 的实际导入记录均为 D-054 历史事实。

> **D-037/D-055 现行覆盖（2026-09-04）**：时光胶囊/寄语已下线，锁色后直接 `ADMITTED`；节目中场使用无放回个人抽奖。D-054 新增 220 人 `PROTECTED` 正式目录：只导入姓名与 8 位学号，数据库保存学号用途隔离的 HMAC 摘要；NFC/二维码承载 256 位随机匿名令牌，公开星号现按 D-065 统一为姓氏首字母与学号后四位。正式库与固定 300 人 `SYNTHETIC_DEMO` 测试库物理隔离，`RESET_DEMO` 对正式库硬拒绝。D-055 把 220 人设为正式大屏视觉满场参考，300 人只作为技术与压力上限；集结态使用盘面离散星为主的低倾角恒星盘、420 颗无身份中性底星、未解析盘面光的有界人数补偿和环境层非同步低振幅呼吸，逐人流星沿切线进入稳定轨道。D-051 的约 8.4 秒错峰汇聚/高温核心/非对称超新星/白场透明节目接管继续有效，节目稳态完全透明且仅实时新弹幕飘过。D-052/D-053 的通用实体手机门与三端 Orbital Signal 视觉语义继续有效。

> 状态：协议 v2 唯一权威（至决策 D-071）。服务器合成内测库为 `V2_ACTIVE + SYNTHETIC_DEMO + schema 17`；本机正式 `backend/.private` 仍是已验证的 `V2_ACTIVE + PROTECTED + schema 14`，启用前须走对应维护路径。实体 NFC 写卡、数据治理责任人与受影响现场复验仍未完成；D-036 签核只属于变更前基线。

## 1. 权威与基本原则

1. 协议版本固定为 `2`，必须由命令请求、服务端快照、命令响应和事件明确携带；v1 客户端不得在 v2 服务端继续写入。
2. v2 是一次不兼容切换，不提供 v1/v2 双写、状态翻译、旧六阶段兼容层或静默降级。
3. 服务端持久化状态是唯一权威。动画结束、前端定时器、浏览器本地状态和 WebSocket 到达顺序都不能推进业务状态。
4. 参与者入场进度与全场运行进度是两只独立时钟。任何页面不得把两者重新拼成一条“六阶段”进度线。

5. NFC 为主入口，二维码/短链接携带同一随机令牌；人工协助使用姓名与 8 位学号恢复同一身份，不得新建第二账号。正式 `PROTECTED` 与合成 `SYNTHETIC_DEMO` 不得混库；抽奖不接 AI、不按星光加权、不含兑奖/核销。公网与实体写卡仍须完成独立上线门。

### 1.1 实现历程速览（只读参考）

| 里程碑 | 完成内容 | 状态 |
|---|---|---|
| V2-00～V2-01 | 共享契约、`0008` 基础迁移、`GET /api/protocol-capabilities` 能力发现、`POST /api/v2/handshake`、`/ws/v2` HELLO/ACK 控制面 | 已实现 |
| V2-02 | 一次性 v1→v2 切换 CLI（`v2-switch.ts`）、维护级 `v2-reset.ts`、`v2-verify.ts`；服务同代 listen/关闭回执门 | 已实现 |
| V2-03 | 参与者入场域：原子 slot 预留、激活、锁色、胶囊提交/跳过/补填、只读恢复 | 已实现 |
| V2-04 | 运行时域：三场景控制、`PREVIEW_FINALE`、LIVE 原子 `COMPLETED`、场景操作与奖励门 | 已实现 |
| V2-05 | 快照与实时层：三类权威快照、`/ws/v2` ACTIVE 分流、游标/缺口/epoch 恢复、v2 命令入口 | 已实现 |
| V2-06 | 匿名后台运营层：v2 控制台、受限胶囊候选、插入子场景、就绪警告 override、后台 `RESET_DEMO` | 已实现 |
| V2-07 | 大屏与公共互动：单 Canvas 300 星、OBS 透明节目层、匿名弹幕/礼物、视觉优先级、终章 | 已实现 |
| V2-08 | 手机入场与三场景：双时钟、双流订阅、单操作坞、D-027 可见性门；2026-08-14 可靠性加固 | 已实现 |
| V2-09 | 三浏览器三端闭环 36/36、300 人协议负载（p95 < 2s、不变量 0） | 通过 |
| V2-10 / D-036 | 30 分钟渲染 soak 与 2026-08-15 的 OBS/局域网/vivo 人工签核 | 历史基线 `PASS` |
| D-027～D-029 | 首次寻星 2.8s 可见性门与连续性自动子门、个人旅程连续镜头（2.8s/1.2s/3.2s） | 自动 `PASS`，已被 D-030 覆盖 |
| D-030～D-032 | 视觉金标（motion-previsual 共用渲染器，参考 5.4s/1.0s/4.2s）、稳定流动星系、学院入口、字体回退、逐字标题、微角操作坞、本人档案边界 | D-036 变更前基线 `PASS` |
| D-037 | 锁色直接准入、寄语/胶囊退役、`START_STAR` 40 星光、节目中场无放回个人抽奖、schema 13 | 2026-09-02 本机自动收口 `PASS`；实际合成库已随 D-054 升至 schema 14，现场复验 `PENDING` |
| D-038 | 大屏集结到节目支持约 7.2 秒连续转场；节目稳态只保留透明弹幕面板 | 2026-09-02 本机自动门、三浏览器、46 秒 smoke 与 300 星视觉检查 `PASS`；OBS/场馆人工复验 `PENDING` |
| D-039 | 三臂星流、能量狭缝与双侧空间门组成约 7.2 秒电影化转场；节目稳态取消常驻面板，仅实时新弹幕短时飘屏 | 自动证据 `PASS`，但视觉编排已被 D-040 替换；实时飘屏规则继续有效 |
| D-040 | 本地无星点暗星云、真实 300 星低饱和重尾亮度、偏心薄引力裂隙与噪声场颗粒消隐组成约 7.2 秒连续转场 | 当前工作树 `verify:g2`、三浏览器 E2E、46 秒 smoke、300 星连续录制、文档门与现场预览 smoke `PASS`；详见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.4；OBS/场馆屏幕与 D-052 实体手机人工复验 `PENDING` |
| D-041 | 集结真实星持续流动且不显示人数进度；约 7.2 秒转场从当前速度连续弯折为黑洞吸积流，并让事件视界、收束和颗粒透明接管相互交叠 | 当前工作树自动证据见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.5；OBS/场馆屏幕主观顺滑度与 D-052 实体手机人工复验 `PENDING` |
| D-042 | 双主臂/倾斜盘核星系保留逐星 `displayColor`；同一批真实星卷入持续可见的黑洞，镜头穿越后以一次平滑白光曝光显露外部 OBS 节目画面 | 当前工作树自动证据见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.6；实际 OBS/场馆屏幕主观观感与 D-052 实体手机人工复验 `PENDING` |
| D-043 | 退役静态黑洞贴图；DOM 外原生 WebGL2 实时折射暗星云与同一批真实星，形成远侧复映、色散和断续焦散后回写唯一可见 Canvas；Canvas2D 回退，视频仅作另行验收的备选 | 当前工作树自动证据见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.7；实际 OBS/场馆屏幕主观观感、目标设备 GPU 回退与 D-052 实体手机人工复验 `PENDING` |
| D-044 | 曲率先于事件视界出现，黑洞从现场星海折射中逐渐凝结；穿越后进入当前画面采样的旋转纵深隧道，中心预辉再拉出缓动白光束并以一次曝光接管 | 当前工作树自动证据见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.8；实际 OBS/场馆屏幕主观观感、目标设备 GPU 回退与 D-052 实体手机人工复验 `PENDING` |
| D-045 | 用单调 `cameraTravel` 连续驱动星流、推镜、事件视界与隧道纵深；视界/隧道提前交叠，出口改用从消失点向外扩张的空间光前沿 | 当前工作树自动证据见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.9；实际 OBS/场馆屏幕主观观感、目标设备 GPU 回退与 D-052 实体手机人工复验 `PENDING` |
| D-046 | 集结态改为低倾角棒旋银河；真实星从抵达首帧起逆时针持续运动，恒星物质流快于尘埃密度波；近白亚像素核心、极薄保色光晕、重尾亮度和极少数衍射芒替代塑料彩珠 | 当前工作树自动证据见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.10；实际 OBS/场馆屏幕主观观感与 D-052 实体手机人工复验 `PENDING` |
| D-047 | 0 人首帧即由不计人数的确定性底星显出棒旋星流；实时首次公开一星只播放一次流星；转场延长为约 8.4 秒连续推镜，事件视界被提前运动、向外掠过的弯曲隧道逐步穿透 | 当前工作树自动证据见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.11；实际 OBS/场馆屏幕主观观感与 D-052 实体手机人工复验 `PENDING` |
| D-048 | 等待态保留 30Hz，高速流星与集结→节目改为 60Hz 目标；WebGL2/纹理预热、1280×720 有界光学缓冲与缓存星云消除首用顿挫；同一持续增速摄影机统一快门、透镜、隧道和柔和白光 | 当前工作树自动证据见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.12；实际 OBS/场馆屏幕主观顺滑度与 D-052 实体手机人工复验 `PENDING` |
| D-049 | 保持 8.4 秒惯性镜头，以约 0.8～1.3 秒让隧道、薄核心/宽体积页白光和透明节目源连续重叠；手机与大屏共用 Orbital Signal 深空色谱，逐星 `displayColor` 不变 | 当前工作树自动证据见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.13；实际 OBS/场馆屏幕主观边界与 D-052 实体手机跨端观感复验 `PENDING` |
| D-050 | 手机寻星、选色、入轨与主场景重置为低饱和 Orbital Signal 背景；保留轻量本地纹理作亮度结构，不下发大屏重素材，逐星 `displayColor`、时长、状态与交互不变 | 当前工作树自动证据见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.13；D-052 实体手机的色彩、可读性、温升与流畅度复验 `PENDING` |
| D-051 | 整体退役黑洞/事件视界/隧道路线；当前星流错峰螺旋坍缩为高温核心，经过一次非对称超新星与连续白场曝光后将 Canvas 平滑透明化并显露 OBS 第一个节目 | 当前工作树自动证据见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.14；实际 OBS/场馆屏主观震撼度、目标设备 GPU 回退与 D-052 实体手机跨端观感复验 `PENDING` |
| D-052 | 取消 vivo X300 指定机型门；当前手机验收只要求至少一台代表实际上线访问方式的实体智能手机，记录机型、系统、浏览器、CSS 视口、DPR 与 reduced-motion | 当前实体手机人工复验 `PENDING`；桌面模拟与可选 Android ADB/CDP 预检均不代签 |
| D-053 | 三端共享 Orbital Signal 语义表面、状态、字体与小圆角；后台为克制深空运营控制台，手机关键操作文案不低于 12px，内部枚举使用可读文案 | 当前工作树自动证据见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.16；不改变协议，实体手机/OBS/场馆复验 `PENDING` |
| D-054 | schema 14 受保护名单运行证据、随机匿名 NFC、8 位学号人工恢复、正式/测试库隔离 | 220 人正式库与 5 个便捷合成测试账号已在本地生成并验证；HTTPS/实体写卡/现场复验 `PENDING` |
| D-055 | 220 人正式视觉基准、盘面主导银河、420 无身份底星、人数有界环境补偿、低振幅呼吸与流星轨道捕获 | 当前工作树自动证据见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.18；实际 OBS/LED 屏与场馆观看距离主观观感 `PENDING` |

> 说明：v1 六阶段实现及 D-022 验收证据只作历史基线。D-054 曾将合成 `.data` 与正式 `.private` 建立为 schema 14，D-061 代码要求显式升级到 15；验证失败时任一启动器都必须停下，不能自动迁移、造数、清空或回退 v1。

### 1.2 实现历程说明

上表只作只读追溯。各里程碑的逐项验收证据（测试文件数、负载 p95、soak 指标等）见 [`TEST_PLAN.md`](./TEST_PLAN.md) 与 [`archive/`](./archive/README.md)；D-027/D-028/D-029 的 2.8s/1.2s/3.2s 时长与自动数字已由 D-030 金标覆盖，不再作为设计目标。现行契约从 §2 开始。

## 2. 两只时钟

### 2.1 参与者入场时钟

参与者只能按下列顺序前进，不允许跳过星色选择：

| 状态 | 进入条件 | 服务端原子效果 | 下一步 |
|---|---|---|---|
| 未建立会话 | NFC 个性令牌、携带同令牌的二维码/短链接，或映射到同一身份的姓名+8 位学号尚未核验 | 无 | 核验身份 |
| `NEEDS_COLOR` | 身份在当前 `resetEpoch` 首次核验成功，且服务端已在同一事务中预留一个不透明稳定 formation slot | 建立会话和唯一参与者状态；写入 `activatedAt`；动力值初始化为 100；按当前规则版本发放“激活”星光 20，且只发一次 | 必须选择并锁定星色 |
| `ADMITTED` | 服务端成功锁定星色 | 同一事务写入不可变星色、`colorLockedAt`、`admittedAt` 和准入时运行事实；把已预留 slot 对应恒星变为公共实体并发布 `star.node.upserted`；不得创建或移动另一颗星 | 进入全场当前场景 |

核验成功就是“身份激活”，不得再设置另一个重复的“激活阶段”。首次激活必须先原子预留 300 个稳定 formation slot 之一；容量已满时整笔激活以 `STAR_CAPACITY_REACHED` 拒绝，不建立参与者状态、不创建会话、不发动力值或星光。恒星只有在星色锁定成功后才成为公共星系实体；仅核验、未锁色的参与者不出现在公共星系中。

### 2.2 退役字段与现行参与者命令

- 新写入路径不会产生 `NEEDS_CAPSULE_DECISION`、`SUBMITTED` 或胶囊正文；锁色后直接 `ADMITTED`。
- `0013` 迁移会删除 `v2_capsules` 与终章胶囊副本，把仍处旧流程的已锁色参与者收敛到 `ADMITTED`；`0014` 增加受保护名单来源证据。旧列/表只作前向兼容。
- 共享请求 schema 暂时仍能解析 `UPSERT_CAPSULE`/`SKIP_CAPSULE`，只为让旧客户端获得稳定 `ONBOARDING_STATE_INVALID`；服务端不得写入正文，三端不得发送这些命令。
- 现行参与者写命令只有 `LOCK_COLOR`、`START_STAR`、`SEND_GIFT`、`POST_BARRAGE`、`COOPERATIVE_LIGHT`。

### 2.3 晚到者与恢复者

- 全场处于 `READY` 或 `RUNNING` 时均允许新参与者按完整入场时钟进入；`PAUSED` 和 `COMPLETED` 均拒绝首次激活及全部参与者业务变更。
- 晚到者锁色并准入后，直接进入全场“当前场景”，不从集结场景补播，也不推动或回退全场时钟。
- 已激活身份在 `PAUSED` 或 `COMPLETED` 仍可重新核验并建立只读会话，再从权威快照恢复；不得仅凭本地存储重建业务事实。
- `COMPLETED` 后，“已有参与者”指当前 `resetEpoch` 内任何已经写入 `activatedAt` 的身份，包括仍停在 `NEEDS_COLOR` 的未完成人员。其只能读取终局/个人现有事实，不能继续选色或完成入场；从未激活的身份不得建立新参与者状态。

## 3. 全场运行时钟

### 3.1 模式、运行状态与场景

全场模式只有：

- `REHEARSAL`：排练，可人工跳转三个场景；结尾只能预览，不产生现场完成事实。
- `LIVE`：现场，场景只能向前推进，并使用一次确认完成全场。

运行状态只有：

- `READY`：尚未正式运行，但允许参与者入场和读取快照。
- `RUNNING`：按当前场景开放对应参与者操作。
- `PAUSED`：保留当前场景并继续提供读取与重连快照；拒绝全部参与者写入。
- `COMPLETED`：不可逆终态；不是场景，也不是“第六阶段”。

运行场景只有以下三个稳定标识：

1. `ASSEMBLY`（待集结）
2. `PROGRAM_SUPPORT`（节目支持）
3. `COOPERATIVE_LIGHT`（协同点亮）

不得新增 `IDENTITY_ACTIVATION`、`CAPSULE` 或 `ARCHIVE` 全场场景。身份激活与锁色属于个人入场时钟；档案/祝福是终局读取界面，不是运行阶段。

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
| `READY` | 允许首次入场 | 不允许任何场景业务写入 | 允许 | 可切换模式、启动、清除公开内容或重置 Demo |
| `RUNNING` | 允许首次入场 | 仅允许下表与当前场景匹配的操作 | 允许 | 可执行合法运行命令、抽奖/投影控制或重置 Demo |
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
| `COMPLETE` | `LIVE + RUNNING + COOPERATIVE_LIGHT` | 一次事务写入 `LIVE + COMPLETED + COOPERATIVE_LIGHT`、`completedAt`、revision、事件和审计 | 仅一次确认；自动关闭活动抽奖/投影但保留本 epoch 抽奖记录；重复命令幂等返回同一终局 |
| `PREVIEW_FINALE` | `REHEARSAL + RUNNING + COOPERATIVE_LIGHT` 且 presentation=`NONE` | 不改运行 tuple；把 presentation 设为 `FINALE_PREVIEW` | 持续显示“排练预览”；服务端权威、可手动清除；不写 `COMPLETED`/`completedAt`/现场完成审计 |
| `OPEN_RAFFLE` | `RUNNING + PROGRAM_SUPPORT + presentation NONE` | 开启抽奖公开层并递增 `presentationRevision`/抽奖 revision | `STAGE_CONTROLLER` 或 `ALL`；不改变运行 tuple |
| `DRAW_RAFFLE` | 抽奖公开层已开启，且仍有未中奖的 `ADMITTED` 参与者 | 服务端随机选择一位未中奖参与者，持久化顺序和时间，递增 revision 并广播安全投影 | `STAGE_CONTROLLER` 或 `ALL`；同一身份本 epoch 最多一次；候选耗尽稳定拒绝 |
| `CLOSE_RAFFLE` | 抽奖公开层已开启 | presentation 回到 `NONE` | `STAGE_CONTROLLER` 或 `ALL`；只收屏，保留中奖记录 |
| `CLEAR_RAFFLE` | `REHEARSAL` | 删除本 epoch 中奖记录并关闭抽奖公开层 | `DEMO_ADMIN` 或 `ALL`；LIVE 禁止清空 |
| `CLEAR_PRESENTATION` | presentation 不是 `NONE` | 不改运行 tuple；把 presentation 设为 `NONE` | 用于安全收屏/终章预览清除；不删除抽奖记录 |
| 旧胶囊命令 | 任意 | 无写入 | `SELECT_CAPSULE`/`SHOW_CAPSULE_INSERT`/`REMOVE_CAPSULE` 仅保留解析兼容并稳定拒绝 |
| `RESET_DEMO` | 任意合法 tuple | 按第 10.1 节建立新 `resetEpoch` 和初始状态 | 要求 `DEMO_ADMIN` 或 `ALL`、确认对话框及合成数据硬门 |

### 3.3.1 D-061 节目目录与串场

- `UPDATE_PROGRAM_CATALOG` 要求 `STAGE_CONTROLLER/ALL`、当前 epoch、幂等键、`expectedRunRevision`、`expectedInteractionRevision`、`expectedCatalogRevision` 与 `confirmed=true`；仅 `READY + currentScene=null` 且没有礼物历史/热度时可写。暂停不能绕过开始后的冻结。
- `catalog={label, items}` 为严格结构：名称 1–80 字，1–64 项；每项为稳定 `id`、从 1 连续的 `order`、1–120 字标题、`PERFORMANCE/INTERLUDE/DEFERRED`、各至多 40 字的形式/时长。文字单行，禁止未知字段与重复 ID。移出项只停用，保留上限 256 行；更名或调序不改 ID。不能用替换目录改写既有热度/礼物归属。
- 成功写入独立 `v2_program_catalog`/`v2_program_catalog_state`，递增 catalog revision 与 interaction revision，清当前选择，写审计和实时通知。`program.changed.currentProgram` 可为 `null`（目录更新但尚未选中）；三端重新取快照。冲突、权限错误或 SQL 失败不留下部分更新，重复幂等键返回原结果。
- 管理快照新增 `programCatalog={revision,label}`；三端当前项/目录项新增 `kind/formatLabel/durationLabel`。公开目录没有演员或参与者个人信息；时长仅为文字提示。
- `SET_PROGRAM` 仍要求 `RUNNING + PROGRAM_SUPPORT`。串场/延期项是独立当前项，`giftCatalog=[]`，参与者能力移除 `SEND_GIFT`；旧页面送上一节目或串场的礼物都由服务端拒绝，不扣动力、不记热度、不发首次礼物奖励。`POST_BARRAGE` 保持原规则；切回表演后恢复送礼。
- “下一项”只切当前节目；“下一场景”依旧由运行协议处理，后台在离开节目支持的确认中提醒未演完的下一项。提醒不是服务端的自动编排限制。竞拍/线上游戏不在本次实现内。

### 3.4 当前场景参与者操作

D-057 抽奖呈现补充：服务端仍立即持久化每次无放回结果；正常大屏按 `drawSequence` 顺序排队揭晓，每位滚动约 1.8 秒、揭晓后至少停留约 1.4 秒。历史区只显示已揭晓结果，后续结果不得提前进入标题、编号或历史列表，也不能打断上一位。刷新、重连、页面隐藏、reduced-motion 和收屏取消临时队列；恢复时直接显示全部持久记录，不补播。连续抽取只增加呈现队列，不改变候选、中奖概率或权威写入时间。

| 场景 | 合法操作 | 权威事实与奖励 |
|---|---|---|
| `ASSEMBLY` | `ADMITTED` 参与者执行一次 `START_STAR` | 写入私有 `started=true`、`startedAt`，并把公共恒星的 `started` 更新为 `true`、递增 `starRevision`、发布完整 `star.node.upserted`；首次成功发放 40 星光，不创建或移动恒星 |
| `PROGRAM_SUPPORT` | `ADMITTED` 参与者送礼或发送弹幕 | 礼物按每次明确操作扣动力；只有首次有效送礼发 10 星光。只有首次服务端接受的合规弹幕发 10 星光 |
| `COOPERATIVE_LIGHT` | `ADMITTED` 参与者执行一次协同点亮 | 首次服务端接受时写入完成事实并发 20 星光 |

D-057 协同反馈：大屏以 `aggregate.cooperativeLightCount / aggregate.admittedCount` 显示协同进度，同时调整集体光场和星群亮度。正常实时新增完成可触发约 1.2 秒、有界且合并密集事件的柔光反馈；快照、刷新、重连、隐藏和 reduced-motion 直接静态显示当前进度。`started` 只表示集结时的 `START_STAR`，不能作为协同参与判断；不增加个人完成状态的公共投影，不根据聚合猜测哪一颗星已参与，不生成假参与者。晚到准入会更新分母，满进度也不能触发 `COMPLETE`。

晚到者只获得到达后当前场景的操作资格；若其在 `ASSEMBLY` 结束后才 `ADMITTED`，不得补做 `START_STAR` 或补领 40 星光。同理，已经离开的节目支持或协同点亮操作与奖励均不补做。动画、返回页面或档案入口不得绕过当前场景校验。

### 3.5 现场完成与排练结尾

D-057 将已知就绪警告与不可逆说明合并到同一确认。提交后仍由服务端先检查当前警告；响应仅包含已确认项时可重试显式 override，不再弹重复对话框；服务端响应出现未展示的新警告时须重新确认。用户取消不发送完成命令，旧 revision、权限和非法状态不能 override。

- `LIVE` 只有在 `RUNNING + COOPERATIVE_LIGHT` 时显示最终操作。
- 项目负责人一次确认后，服务端按 `COMPLETE` 定义在一个事务中写入终态、关闭活动抽奖层、revision、事件和审计；不得由动画回调触发。
- 不得再出现第二个“Stage 6”“结束阶段”或第二次完成命令。
- `REHEARSAL` 只通过 `PREVIEW_FINALE` 建立服务端权威演示投影；刷新与重连从快照恢复同一预览，直到手动清除、场景变化、暂停或重置。预览操作本身写管理审计，但不得伪装成现场完成审计。
- 终局读取可显示祝福、个人档案与最终星系；抽奖结果仍作为本 epoch 后台记录保留，但不进入终章个人内容。

## 4. 公共星系与事件同步

### 4.1 公共恒星模型

公共星系最多承载 300 个真实参与者恒星实体。D-065 将 `PROTECTED` 与 `SYNTHETIC_DEMO` 的 `publicStarId` 统一为“姓氏拼音首字母大写 + `-` + 学号后四位”（例如 `L-4821`），四位数字保留前导零，复姓只取首个字母。英文登记名默认取开头字母，导入可用 `surnameInitial` 校正。导入前检查整份目录唯一性，重号时报行号并停止，数据库唯一约束继续兜底。此星号可关联到身份，只承担显示和管理用途；NFC 邀请仍是独立随机令牌，不能由星号推导或用星号登录。每个公共实体只包含展示所需字段：

- `publicStarId`；
- `colorTemperatureKelvin` 与派生展示色；
- 不透明稳定 `formationSlot`；
- `started`（是否已在 `ASSEMBLY` 成功执行 `START_STAR`；`startedAt` 不公开）；
- `starRevision` 与 `updatedAt`。

公共实体不得包含姓名、学号、邀请令牌、会话标识、胶囊正文或其他私密字段。手机端只有当前参与者自己的恒星显示 `publicStarId` 标签和突出光效；其他参与者恒星不显示编号或身份提示。网络 payload 可以携带构成公共恒星主键所需的 `publicStarId`，这一可检查性属于已接受风险，不代表可以展示其他身份字段。

`formationSlot` 从固定合成身份的确定性、不透明 slot 目录中取得。首次激活先在同一事务中预留 slot；同一 `resetEpoch` 内刷新、重连、换设备或事件重放都不能让恒星无原因跳位。达到 300 个预留名额后必须以 `STAR_CAPACITY_REACHED` 拒绝首次激活，不得先建参与者/发奖励后再在锁色时卡住，也不得静默丢星或仅在客户端截断。锁色只把预留恒星以 `started=false` 公开，不再次占用容量；`START_STAR` 只原位更新该公共实体为 `started=true`。

### 4.2 revision 与事件序列

- `resetEpoch`：确定性重置代际。普通 v2 重置使其加 1；跨 epoch 的命令、会话和事件不得映射或合并。
- `runRevision`：mode/status/currentScene 每次有效变化递增；抽奖和结尾预览不改变它。
- `presentationRevision`：对外活动投影在 `NONE|RAFFLE|FINALE_PREVIEW` 之间变化，或抽奖结果在展示中新增/清空时递增。
- `participantRevision`：单个参与者的入场状态、颜色、场景参与事实、数值摘要或档案事实每次有效变化时递增。
- `interactionRevision`：公开弹幕发布/撤下/清屏/暂停及礼物公共事件每次有效变化时递增；它只版本化大屏互动投影，不改变 `runRevision` 或 `presentationRevision`。
- `streamSeq`：某个 `streamId` 内的连续序号；不是所有受众共享的全局序号。合法逻辑流只有 `public`、`admin` 和 `participant:<participantId>`。服务端只在事件实际追加到该流时递增该流序号；任何其他流中的私有或受限事件不得制造本流缺口，重置后各流均从 0 开始。
- `starRevision`：单个公共恒星实体的版本；锁色首次公开时创建，`START_STAR` 首次改变公共 `started` 时递增；重复、同值或私有事实变化不递增。

同一命令可在一个事务中同时改变多种 revision，并向 0～3 类逻辑流各自追加事件。事件 envelope 固定包含 `protocolVersion/resetEpoch/streamId/streamSeq/eventId/name/revision/payload`，其中事件 ID 由 `(resetEpoch, streamId, streamSeq)` 唯一确定。客户端只在同一 `streamId` 内检查 `lastSeq+1`，重复或旧序列幂等忽略，流内缺口只重拉该流快照。`/screen` 只订阅 `public`，`/welcome` 订阅 `public` 与本人的 participant 流，`/admin` 订阅 `public` 与 `admin`；不同流可在同一 WebSocket 交错传送，但不能改变各流内部顺序。

### 4.3 快照优先、事件增量

1. 首次进入、刷新、重连和任一授权流的 `streamSeq` 缺口恢复时，客户端必须先取得权威快照。
2. 所有角色快照的公共信封至少包含 `protocolVersion`、`resetEpoch`、mode/status/currentScene、`runRevision`、活动 presentation 及 `presentationRevision`、当前客户端获授权的流游标与 `rewardRuleVersion`；`/screen` 返回 `publicSeq`，`/welcome` 返回 `publicSeq+participantSeq`，`/admin` 返回 `publicSeq+adminSeq`。角色专属字段以第 4.4 节为准。
3. 活动 presentation 是服务端权威互斥字段：`NONE`、`RAFFLE` 或 `FINALE_PREVIEW`。`RAFFLE` 的公共视图只携带抽奖状态与中奖公开星号；后台快照另含中奖者目录姓名，正式运行时该姓名仅限受控后台。刷新与重连必须恢复当前展示状态和已持久化结果。
4. 稳定事件名及职责固定为：

   | 事件名 | 触发与最小内容 |
   |---|---|
   | `runtime.changed` | `public`；mode/status/currentScene 或 `runRevision` 变化，携带完整运行 tuple |
   | `presentation.changed` | `public`；presentation 或 `presentationRevision` 变化，携带完整活动投影的安全公共视图 |
   | `star.node.upserted` | `public`；锁色事务把预留恒星变为公共实体，或 `START_STAR` 原位更新公共 `started`，每次携带完整公共恒星投影与 `starRevision` |
   | `aggregate.changed` | `public` 或 `admin`；必须携带 `projection=PUBLIC_AGGREGATE|ADMIN_AGGREGATE`、相应完整安全聚合与独立 `aggregateRevision`，只在对应投影真实变化时追加到该流 |
   | `participant.snapshot.changed` | `participant:<id>`；携带 `projection=SELF`、新 `participantRevision` 与 `requiresSnapshot=true`，只发本人授权会话，不得夹带私有身份到其他流 |
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

- 当前已认证身份的 `displayName`，以及在首次激活预留 formation slot 时确定的稳定 `personalStarCode`；
- `participantRevision`、现行 `onboardingState=NEEDS_COLOR|ADMITTED`、`activatedAt`、锁色 Kelvin/`colorLockedAt`、`ownPublicStarId` 与本人 `formationSlot`（如已锁色）；
- 为 schema 前向兼容保留的旧胶囊字段必须为空或固定退役值，客户端不得据此显示入口、正文或状态；
- `admittedAt`、准入时的 `admittedScene`/`admittedRunRevision`，以及 `started/startedAt`、首次送礼奖励、首次合规弹幕奖励和协同点亮等本人场景事实；本人当前 epoch 按节目/礼物汇总的送礼数量与累计动力，以及本人弹幕正文、星色、时间和撤下状态；
- 当前动力、星光、`rewardRuleVersion` 与可审计的本人奖励摘要；
- `allowedActions`：从 `LOCK_COLOR|START_STAR|SEND_GIFT|POST_BARRAGE|COOPERATIVE_LIGHT` 中由服务端计算出的有序去重集合。

`displayName` 与 `personalStarCode` 这两个字段只属于已认证参与者本人的私有投影，不得进入 `ScreenSnapshot`、`AdminSnapshot`、公共事件或聚合。`personalStarCode` 是预分配星号：在 `NEEDS_COLOR` 时可以已经存在，但此时 `ownPublicStarId`、锁色和成星事实仍为空，不得建立 `publicStars` 行、发布 `star.node.upserted` 或增加 `publicStarCount`。只有锁色事务成功才建立公共恒星，随后必须满足 `ownPublicStarId === personalStarCode`；同一值此后仅按第 4.1 节既有 `publicStarId` 规则进入公共恒星 payload，不能扩张为姓名或其他身份字段。

`studentNumber` 只允许作为人工协助激活的请求输入，绝不能出现在激活响应、`ParticipantSnapshot`、命令响应、任何事件、公共恒星、`ScreenSnapshot` 或 `AdminSnapshot` 中，也不得回显完整学号。手机统一收取姓名与恰好 8 位学号并以 `ASSISTED_STUDENT` 发送原值；`PROTECTED` 目录直接核验 8 位学号摘要，`SYNTHETIC_DEMO` 仅在服务端尝试固定 `2026` 前缀兼容旧合成目录，客户端不得知道或补写该前缀。核验必须恢复同一身份与权威状态，不能创建第二个参与者；姓名/学号不匹配只返回不泄露目录细节的通用失败。

`allowedActions` 的唯一推导规则固定为：

| 动作 | 必要条件 |
|---|---|
| `LOCK_COLOR` | `NEEDS_COLOR` 且 status 为 `READY` 或 `RUNNING` |
| `START_STAR` | `ADMITTED + RUNNING + ASSEMBLY` 且本人尚未启动 |
| `SEND_GIFT`、`POST_BARRAGE` | `ADMITTED + RUNNING + PROGRAM_SUPPORT`；服务端仍按动力余额、内容规则、频率和屏蔽状态逐次校验 |
| `COOPERATIVE_LIGHT` | `ADMITTED + RUNNING + COOPERATIVE_LIGHT` 且本人尚未完成点亮 |

`PAUSED` 与 `COMPLETED` 的 `allowedActions` 必须为空。该集合用于三端一致地展示可操作项，但不是绕过服务端校验的授权令牌；每次命令仍须在事务中重查最新状态。命令成功响应必须返回更新后的参与者投影与当前运行 tuple；客户端收到 `runtime.changed`、`participant.snapshot.changed`、epoch 变化或序列缺口后，必须先刷新 `ParticipantSnapshot`，再重新启用写操作。

`ScreenSnapshot` 只返回公共恒星完整数组（包含 `started`）、安全聚合及 `aggregateRevision`、当前节目及匿名礼物目录与本节目各礼物数量、`interactionRevision`/弹幕暂停/当前显示批次、最多 8 条仍公开且不带发送者的弹幕、抽奖公共视图、活动 presentation 与终章聚合；不得返回来源标识、中奖者姓名或参与者私有字段。安全聚合至少区分 `activatedCount`、`publicStarCount`、`admittedCount`、`starStartedCount`、`cooperativeLightCount` 与星光总量。

`AdminSnapshot` 在公共信封之外返回权限、运行/投影控制收据、`aggregateRevision`、公开弹幕及发送者 `publicStarId` 与审核用匿名 `sourceId`、互动暂停状态、抽奖状态与中奖者姓名+公开星号，以及匿名入场漏斗：`activatedCount`、`publicStarCount`、`admittedCount`、`onboardingPendingCount`、`starStartedCount`、`cooperativeLightCount`。姓名只在已授权后台中奖结果中出现；公屏弹幕和礼物事件不显示赠送者/发送者。旧 `capsuleSubmittedCount/capsuleSkippedCount` 如仍在契约中，只是 schema 兼容计数（现行提交数为 0），不得在产品界面解释为胶囊功能。`sourceId` 只用于审核会话的来源屏蔽，不得展示、导出或映射为参与者身份。漏斗计数以唯一参与者事实聚合，在线会话数只能单列为辅助值，不能作为人数分母；除中奖结果外，后台不得增加姓名、学号或逐人列表。

`ADVANCE` 与 `COMPLETE` 的确认界面必须把最新匿名漏斗与适用警告合并到原有一次确认中。警告谓词固定为：

- `ONBOARDING_PENDING`：`activatedCount - admittedCount > 0`；适用于所有 `ADVANCE` 与 `COMPLETE`；
- `STAR_START_PENDING`：离开 `ASSEMBLY` 时，当前已准入且在该场景结束事务前具备 `START_STAR` 资格、但 `started=false` 的人数大于 0；晚到且从未获得 ASSEMBLY 资格者不进入分母；
- `COOPERATIVE_LIGHT_PENDING`：执行 `COMPLETE` 时，进入 `COOPERATIVE_LIGHT` 前已经准入，或在该场景运行期间完成准入、且仍未协同点亮的人数大于 0。

警告不是人数硬门；有权限的操作者可在同一确认中明确选择继续。服务端执行事务时重新计算警告：若仍有警告而请求没有 `overrideReadinessWarnings=true`，以 `READINESS_CONFIRMATION_REQUIRED` 返回最新匿名摘要且不改变状态；显式 override 后可继续，并把分母/未完成人数、当时摘要、警告和操作者写入审计。权限、旧 revision/epoch、错误 tuple、离线或结果未知仍是不可 override 的硬门。

## 5. 中场个人抽奖

- 抽奖是 `PROGRAM_SUPPORT` 中的服务端权威 presentation，不是全场场景；`OPEN_RAFFLE` 只把对外 presentation 从 `NONE` 改为 `RAFFLE`，递增 `presentationRevision` 与抽奖 revision，不修改 mode、status、currentScene 或 `runRevision`。
- `DRAW_RAFFLE` 由服务端在当前 `resetEpoch` 的 `ADMITTED` 且尚未中奖参与者中随机选择一人；选择与持久化在同一事务完成，`(resetEpoch, identityId)` 和抽取顺序均唯一。客户端不得预选、加权或伪造结果。
- 大屏中奖项只含 `publicStarId`；后台中奖项可额外包含固定合成 `displayName`。任何公共事件、Screen 快照、日志或报告不得出现姓名、学号、令牌、会话或内部身份映射。
- `CLOSE_RAFFLE` 只把 presentation 收回 `NONE`，不删除已抽结果；再次开启、刷新、断线与服务重启必须恢复同一结果和剩余候选数。
- `SET_SCENE`、`ADVANCE`、`PAUSE`、`COMPLETE` 与 `RESET_DEMO` 会自动关闭活动抽奖层；除重置外均保留本 epoch 中奖记录。只有 `REHEARSAL` 下的 `DEMO_ADMIN|ALL` 可通过 `CLEAR_RAFFLE` 删除记录；LIVE 禁止清空。
- 抽奖不使用星光概率、不含奖项配置、兑奖或领奖核销；这些需要后续独立决策。现行三端不得出现胶囊候选、审核或插播入口。

### 5.1 大屏投影、OBS 与实时互动优先级

1. 大屏视觉优先级固定为：`COMPLETED` > `FINALE_PREVIEW` > `RAFFLE` > 持久故障/断线提示 > 当前运行场景 > 实时互动。高优先级层出现时必须立即停止和清理低优先级临时动画，但不得删除已提交业务事实。
2. `ASSEMBLY` 使用本地打包、无点源/文字/天体的暗星云纹理与程序化尘埃密度纹理。公共真实星严格一人一星，协议与渲染技术上限为 300 颗，正式目录与正式美术满场参考为 220 人；D-055 额外允许 420 颗数量固定、确定性生成、更小更暗的中性色装饰底星和连续未解析盘面光，它们不得携带公开星号、身份、事件、参与状态或任何业务语义，也不得进入快照、计数和聚合。真实星与底星共同构成盘面离散星为主体的低倾角恒星盘；核球、短棒及两组宽而弱的密度波只作层次，不得形成发光 S 形旋臂、粗线或霓虹轨道。正常模式从页面 0 人首帧起即持续逆时针流动，未解析盘面光与底星可按真实星数量做有界连续曝光补偿，并以非同步多周期、低振幅曝光及极小尺度变化形成环境呼吸；真实星位置不得随人数重排或缩放，所有真实星不得同相脉冲，reduced-motion、页面隐藏和静态恢复不保留呼吸或位移。真实星继续逐颗保留服务端 `displayColor`、摄影式近白亚像素核心、极薄保色光晕和重尾尺寸/亮度。每个页面会话仅当实时首次收到一颗此前不存在的参与者星时播放一次画外流星，末段沿该真实星位的逆时针轨道切线被盘面捕获并自然沉入稳定星流；已有星更新、初始快照、刷新、重连、从隐藏恢复和 reduced-motion 均不得触发。禁止把装饰底星、未解析盘面光或流星当作参与人数、统一漂白真实星、硬边彩珠、同半径呼吸或奶油光球；集结及离场不得显示当前/目标星数、`x / 220`、`x / 300`、满员率或到场进度。D-048 将低速等待星流固定在稳定 30Hz，将到场流星和 `ASSEMBLY → PROGRAM_SUPPORT` 高速段切换为垂直同步 60Hz 目标且不得忙等。D-051 的正常可见约 8.4 秒镜头在触发瞬间继承真实星位置与切向速度：约 0.0～1.4 秒由当前星海连续出现中心引力预兆；约 0.8～4.8 秒让真实星与装饰底星保持角动量、按不同曲率和到达时序螺旋汇聚；约 4.0～5.6 秒压缩成极小高温核心；约 5.2～7.1 秒只形成一次非对称超新星；约 6.5～8.4 秒让低饱和冲击折射、丝状喷流、电影曝光和整幅 Canvas 透明化连续重叠，从白场自然显露外部 OBS 的第一个节目。真实星在深度压缩前逐颗保留 `displayColor`，进入高温核心后才向星白收敛；稀疏人数只能使用无身份尘埃/等离子体维持爆发尺度，不得伪造参与者。禁止同速直线吸附、规整圆环、烟花粒子球、彩虹冲击波、霓虹描边、现成镜头光斑、纯白矩形硬盖、分段停顿、末帧清空或重复频闪。实现只保留一个可见 `.v2-galaxy` Canvas，允许一个不进入 DOM、首帧显示前预热的 WebGL2 后处理 Canvas；静态星云一次性缓存，后处理缓冲长边限制为 1280（1920×1080 下为 1280×720）再高质量回采样。WebGL2 不可用或上下文丢失时回退 Canvas2D，页面隐藏/中断/刷新/重连/reduced-motion 直接到透明静态终态。运行状态在服务端命令成功时立即改变，动画不得成为业务门。`PROGRAM_SUPPORT` 稳态是 OBS 完全透明浏览器源：`html/body/app/screen` 背景透明，默认不绘制节目占位视频、网页节目板、背景、大标题、节目标题、星点、礼物或常驻弹幕面板；“节目板/节目画面”由透明层下方的外部 OBS 源提供。网页始终静音，不上传、解码、播放或控制节目视频/音频；预渲染视频仍只是未启用备选，未经素材授权、编码/预载/OBS/恢复专项验收不得接入。
3. 合规弹幕正文最多 40 个用户感知字符。单参与者最多 3 条/10 秒，全场最多 12 条/秒；敏感词、链接、联系方式、已屏蔽来源和暂停状态均由服务端事务重查。大屏不显示作者、星号、来源 ID、排行或头像。
4. 后台命令固定为 `SET_BARRAGE_PAUSED`、`REMOVE_BARRAGE`、`BLOCK_BARRAGE_SOURCE`、`CLEAR_BARRAGES`；全部要求角色、当前 revision、确认、原因与幂等门，并写独立审核记录。`COMPLETED` 后只允许撤下、来源屏蔽与清屏等安全减法，不允许重新公开内容。
5. 礼物事件只表示已经提交的服务端事实。普通礼物只更新账本、节目热度、当前节目数量和本人档案；20 动力星舰在正常可见的实时成功事件中让每个在线手机与公屏各播放一次长拖尾掠过银河的有界动画。公共事件和公屏不得显示赠送者；快照、刷新、重连、页面恢复、旧事件补发与高优先级覆层结束后均不补播。高优先级层出现时立即清理星舰视觉，但不能撤销已提交礼物。
6. 仅在正常可见的 `RUNNING + PROGRAM_SUPPORT + presentation NONE` 实时收到新的合规 `barrage.published` 时，才把匿名正文从右向左短时飘屏；节点数量有界、离场即销毁，不从快照、刷新或重连恢复。`RAFFLE` 等高优先级覆层期间的新事件只更新权威游标/快照，不进入视觉回放队列；关闭覆层后直接呈现完全透明节目稳态，不能补演被遮挡的互动。D-066 的静态模式不执行弹幕位移，但必须保留可读正文，最多同时 3 条、每条约 10～12 秒后清除；暂停、换场、覆层、撤下和清屏同样立即清理对应视觉节点。

D-066 大屏动效策略：专用 v2 `/screen` 默认 `motion=full`，银河、场景转场、到场流星、弹幕、抽奖和终章统一使用完整呈现，不受电脑系统关闭动画的偏好覆盖。主控可用 `motion=system` 跟随系统，或 `motion=reduced` 强制静态；`settings=1` 只打开操作设置，不影响权威运行状态。本文大屏段落中的 reduced-motion 指此策略最终解析出的静态模式；手机和后台继续直接尊重系统偏好。页面隐藏、刷新、重连及新 epoch 不补播历史转场、弹幕、中奖揭晓或结束动画；断线与动画资源失败保留可信结果，不让动效模块加载阻塞实时连接。此策略不能保证休眠、后台节流、断网或图形上下文故障时连续完整播放。

## 6. 手机端信息架构与反馈

### 6.1 主舞台

- 主页面是一片持续但克制流动的星系，恒星围绕视觉中心运动；本人恒星随星系运动，但通过更高亮度、轮廓/光晕和唯一编号标签持续可辨认。
- D-050 的手机背景以 Orbital Signal 午夜蓝/深空蓝为基底；现有轻量本地星云只作为降饱和后的亮度结构与尘埃层，并叠加低透明信号蓝/克制青气氛。不得改用约 1.85 MB 的大屏尘埃图、运行时网络素材或偏紫高饱和雾团；寻星、选色、入轨和主场景必须保持同一背景系统，避免阶段交接时换底。
- 页面不展示“实时同步”、裸露的 `RUNNING`、六阶段编号线或长期占位的身份/数值说明。异常状态仍必须明确可见。
- 退出入口放到原“实时同步”位置；每次退出都需要确认。
- 档案/成长读取入口可以保留，但不得伪装成运行阶段或全场归档场景。

### 6.2 单一液态玻璃操作坞

- 下半页只有一个主要操作坞，承载当前场景的核心操作和必要导航；避免多个玻璃卡片堆叠成“玻璃墙”。
- 液态玻璃只使用克制的透明度、边框、高光和静态背景模糊；禁止持续动画化 `filter`/`backdrop-filter`，低性能或不支持模糊时必须退化为可读的不透明深色面板。
- 操作坞内容随参与者状态和全场场景替换，避免一次性显示所有入口。触控目标、底部安全区、软键盘和短视口不得遮挡主要操作。
- `PROGRAM_SUPPORT` 的聊天不使用覆盖银河的大面积背板；消息以逐条半透明气泡从底部向上加入，列表可上下浏览。输入区和必要控件保持可读，但底层星系必须持续可见；低性能不支持模糊时只把单条气泡退化为可读深色，不恢复整块不透明面板。

### 6.3 提示与草稿

- 成功提示显示约 3.5 秒后自动收回；成功事实必须同时落入持久的权威界面状态，不能依赖提示条保存结果。
- 错误、离线、暂停和已完成提示必须保持，直到条件解除、用户确认或取得更新快照。
- 草稿只存在当前浏览器内存，不写服务端、不跨会话恢复；完成、退出或会话重置时清空。弹幕草稿在离开 `PROGRAM_SUPPORT` 时额外清空。

## 7. 首次入场动效契约

### 7.1 正常首次路径

1. NFC/备用令牌由服务端核验成功，响应明确表示首次新建身份并返回 `NEEDS_COLOR` 后，客户端先等待页面处于稳定 `visible`；开始前暂不可见时不得在后台悄悄消耗镜头。
2. 可见性门满足后，以 Vue、CSS 和低 DOM SVG 播放约 5.4 秒“沉入、接近并捕获中性恒星”序列（D-030 视觉金标参考时长；正式页与认可预演共用同一生产渲染器，可组合经压缩验收的原创星云纹理与分层 Canvas）。全屏径向速度线只使用 `transform`/`opacity`，手机端不得为此加载 GSAP。
3. 寻星、选色、锁色确认与入轨必须共用同一颗持久恒星节点与同一坐标系（继承 D-030 视觉语言）；镜头末帧与静态首帧的中心、尺寸和颜色不得跳变。恒星由同心白核、中性光晕和默认 `5800K` 色温光晕构成，色温层在交接末段连续显现。D-028 的 `50% / 42vh` 统一视觉轴只保留为历史方案细节。
4. 选色文案与控件在镜头中提前渲染，但在交接完成前必须保持 `inert`、不可聚焦和不可操作；镜头结束只解除交互隔离，不得替换恒星节点或触发布局重排。正常完成监听主动画 `animationend`，定时器只作缺失事件时的有界兜底。
5. 星色选择不设自动倒计时；参与者必须主动选色并提交，星色不得跳过。
6. 服务端锁色成功且客户端获得包含本人恒星及 `ADMITTED` 的权威确认后，同一持久星先播放约 1.0 秒色温闪烁，再直接衔接约 4.2 秒缩远到 Canvas 本人轨道并展开星系；中间不得出现寄语输入、胶囊决定或等待页。时长继承 D-030 视觉参考，D-037 当前连续性必须重新验证；D-028/D-029 的 2.8s/1.2s/3.2s 只作历史证据。
7. 动画只解释已经确认的状态，不得在时间轴结束时替服务端推进状态或发放奖励；身份响应、权威快照、实时连接和允许动作不得等待表现层完成。

正常首次路径不提供跳过按钮；这一点明确覆盖 D-024 的首帧可跳过与约 0.9 秒约束。为避免把动画变成阻塞器，下列路径不强制重播，直接进入对应静态权威状态：

- 已激活返回、刷新、跨设备登录或断线重连；
- 核验/锁色失败、请求超时、事件 revision 缺口；
- 镜头真正开始后页面进入后台、被挂起或发生无法可靠续播的中断；该次镜头立即结束，返回时不得重播；
- 用户启用 `prefers-reduced-motion: reduce`。

静态降级必须保留完整信息、按钮、焦点顺序和状态反馈，并直接呈现与正常镜头末帧相同的恒星、文案和可操作控件。V2-08 手机端已使用 Vue、CSS、SVG 与 Canvas 实现，未加载 GSAP；D-026 仍只批准 V2-07 `/screen` 动态加载 GSAP core，用于少量 DOM 覆层的 transform/opacity 时间线。该例外不批准 GSAP 插件、逐星 GSAP、重型 3D、媒体控制或把 GSAP 扩到手机端，也不以 AI 生成预览图作为实现验收依据。

## 8. 星光与动力规则

当前 `rewardRuleVersion=v2-rewards-2026-08-30-raffle` 的星光上限为 100，五个奖励事件合计满额 100；服务端只按事件首次有效发生发放：

| 奖励事件 | 默认星光 | 唯一性与边界 |
|---|---:|---|
| 首次成功激活 | 20 | 当前 `resetEpoch` 每位参与者一次；先成功预留 formation slot，再与初始动力值 100 同一激活事务写入 |
| 首次有效启动星星 | 40 | 仅 `ADMITTED + RUNNING + ASSEMBLY` 的 `START_STAR` 成功事实发放一次；错过场景不补领 |
| 首次有效送礼 | 10 | 重复送礼仍消耗动力，但不重复发放该星光 |
| 首次合规弹幕 | 10 | 只有服务端接受的合规弹幕计入 |
| 首次协同点亮 | 20 | 只有服务端接受的协同点亮计入 |

- 每笔星光使用 `(resetEpoch, participantId, rewardEventKey)` 唯一账本约束；每行同时持久化实际 `delta` 和 `rewardRuleVersion`。重试、重连、重复事件和跨设备操作不得重复奖励。
- `0013` 是 D-037 唯一获准的旧合成库规则转换：删除 `CAPSULE_SUBMITTED` 行、把既有 `STAR_STARTED` 调整为 40、校正累计星光并统一规则版本。升级完成后，同一 `resetEpoch` 不得再热切换权重；未来调整仍须新决策与迁移策略。
- 当前抽奖在所有已准入且未中奖参与者中等候选无放回选择，不读取星光作为概率；不实现奖项配置、兑奖、概率公式或领奖核销。
- 本协议不授权后台在终局前后扣减/补发动力值或星光。完成后的安全处理仅限删除、屏蔽、清屏或撤下公开内容，不改变任何数值账本。
- 每位参与者激活时获得 100 动力。活动礼物目录固定为微光 1、信标 5、星轨 10、星舰 20；每次按标价完整扣除并增加对应节目热度与数量，不存在免费档或节目首礼减免。首次有效送礼的 10 星光奖励仍按上表单独发放，它不是折扣、返还或免费礼物。
- schema 16 留存的 `PROGRAM_ALLOWANCE` 记录仅供审计；schema 17 的新礼物事务不得读取或新增它。历史交易保留发生时的实际面值，不能按新目录重算。

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
  | `ONBOARDING_STATE_INVALID` | 参与者状态不满足激活/锁色前置，或旧客户端尝试已退役的胶囊命令 |
  | `SCENE_TRANSITION_INVALID` | mode/status/currentScene 或目标场景不符合第 3.3 节 |
  | `SCENE_ACTION_INVALID` | 参与者命令不属于当前运行场景，或该参与者不具备此场景动作资格 |
  | `PRESENTATION_STATE_INVALID` | 抽奖开启/抽取/关闭/清空、投影清除或结尾预览不满足当前 presentation、场景、模式或权限边界；旧胶囊后台命令也以此稳定拒绝 |
  | `RESOURCE_NOT_FOUND` | 格式合法且调用者有权引用的候选、节目或其他命令资源不存在；响应不得泄露无权资源是否存在 |
  | `REVISION_CONFLICT` | 请求携带的期望 run/presentation revision 已过期 |
  | `READINESS_CONFIRMATION_REQUIRED` | `ADVANCE`/`COMPLETE` 存在匿名就绪警告，但请求未明确确认 override |
  | `IDEMPOTENCY_CONFLICT` | 同一幂等键被用于不同规范化请求体 |
  | `INSUFFICIENT_BALANCE` | 礼物命令通过其他校验但动力余额不足 |
  | `CONTENT_REJECTED` | 弹幕违反内容、长度以外的公开规则 |
  | `SOURCE_BLOCKED` | 当前参与者来源已被后台屏蔽，不能发布公共内容 |
  | `RATE_LIMITED` | 命令超过冻结的频率限制；响应携带可重试提示，不得伪装幂等成功 |
  | `SERVICE_UNAVAILABLE` | 服务端暂时不能安全完成或确认事务；客户端必须按未知结果/安全重试流程处理 |
  | `RESYNC_REQUIRED` | 指定逻辑流的历史保留窗口不足，无法从请求游标连续补发；响应指明需重拉的 `streamId` |

- 错误响应必须携带稳定错误码、当前 `resetEpoch` 和可用于拉取最新快照的提示；不能只显示通用失败。离线是客户端条件，不是服务端错误码；客户端离线时禁止排队伪成功。
- 事件不得泄露邀请令牌、真实姓名、学号、会话凭据、抽奖身份映射或后台账号信息。日志、截图与自动测试证据只使用固定合成身份；公开抽奖事件只含公开星号。
- 旧会话在 v2 切换或 `RESET_DEMO` 后必须失效；`resetEpoch` 不匹配的事件和命令一律拒绝，不能尝试映射到新状态。

## 10. Demo 维护、schema 升级与受保护名单初始化

V2-02 建立了 `protocol_runtime`、v2 表和维护 CLI；D-037 新增 `0013_raffle_and_capsule_retirement.sql`，D-054 新增 `0014_protected_roster_runtime.sql` 与受保护导入器。协议元数据明确区分 `V1_ACTIVE|V2_ACTIVE` 与 `UNVERIFIED|SYNTHETIC_DEMO|PROTECTED`。`SYNTHETIC_DEMO` 的激活必须有原切换备份证据；`PROTECTED` 的激活必须有源 SHA-256 与导入时间，且不得伪造 Demo 切换证据。完整验证失败的库不得启动或回退到 v1 初始化。

### 10.1 v2 运行期 `RESET_DEMO`

`RESET_DEMO` 是显式后台危险命令，不是启动初始化，也不是 v1→v2 迁移：

V2-02 只提供维护窗口使用的 `pnpm exec tsx backend/src/cli/v2-reset.ts` 数据基础命令；V2-06 才实现本节由后台权限、审计和现场状态约束的 `RESET_DEMO`。维护命令同样要求精确确认值 `SYNTHETIC_DEMO_DATA_IS_DISPOSABLE`，且只接受可验证的 `V2_ACTIVE + SYNTHETIC_DEMO` 数据库，在一个事务中递增 epoch 并重建空白 v2 基础；不得用它冒充已上线的后台控制。

1. 可从任意合法运行 tuple 发起，但必须由 `DEMO_ADMIN` 或 `ALL` 当前角色操作、完成确认，并在执行前验证数据库全部为可丢弃的合成/Demo 数据。发现任何真实、个人、不可重建或有保留价值的数据时立即停止。
2. 服务端在一个事务中把 `resetEpoch` 加 1，并建立 `protocolVersion=2`、`mode=REHEARSAL`、`status=READY`、`currentScene=null`、presentation=`NONE`；新 epoch 的 `runRevision`、`presentationRevision`、参与者实体 revision 与每条授权流的 `streamSeq` 从 0 开始。D-061 的节目目录 revision 属于跨 epoch 的维护记录，不随重置归零。
3. 重置清除参与者可变状态、slot 预留/公共恒星成员关系、抽奖记录与展示状态、遗留胶囊表内容、奖励和动力账本、节目互动、弹幕与其他公共内容、幂等记录、运行事件及全部参与者/后台会话。
4. 重置保留固定合成身份目录、邀请令牌映射、每个合成身份的 `publicStarId` 以及确定性、不透明 formation-slot 目录；这些身份目录只用于新 epoch 重新预留，不表示恒星已公开加入。D-061 的维护节目目录、稳定节目 ID 和 catalog revision 同样保留，当前项清空、热度归零。
5. 重置不得在服务启动、迁移失败、客户端版本错误或快照读取失败时自动执行。命令失败不得留下半清空状态；旧 epoch 会话和事件只能得到 `STALE_RESET_EPOCH`。

### 10.2 v1→v2 一次性切换门

v1→v2 只允许在确认数据库全部为可丢弃的合成/Demo 数据后执行破坏性切换。V2-02 的实现入口固定为 `pnpm exec tsx backend/src/cli/v2-switch.ts`，必须同时传入 `--backup <尚不存在的 SQLite 路径>` 与 `--confirm SYNTHETIC_DEMO_DATA_IS_DISPOSABLE`：

1. 切换前检查数据来源、数量、备份和当前 `resetEpoch`；如果发现任何真实、个人、不可重建或有保留价值的参与者历史，立即停止并由项目负责人重新决定迁移方案。
2. v2 基础从 `0008_protocol_v2_foundation.sql` 开始，当前新切换必须先完整应用到仓库迁移顶端 `0017`；既有迁移不得改写。仅应用迁移不会激活 v2。
3. 切换前必须完成当前 v1 服务同一 generation 的真实 `listen` 与干净关闭；构建失败、监听失败、心跳过期或上一代回执均不能满足切换资格。数据库门无法自动发现 `0008` 应用前已启动的旧二进制，因此操作员仍必须人工核验旧 PID、端口和数据库写入进程全部退出。
4. 切换门只接受迁移完整、schema 精确匹配、SQLite 完整性通过、固定 300 身份 seed/manifest 可验证、无未知表/结构漂移、无 v1 可变历史、无部分 v2 事实且运行状态为确定性干净基线的数据库。任何真实、受保护、不可重建、有价值或无法证明为合成的数据均以稳定维护错误停止，不创建备份或清空数据。
5. 备份父目录必须已存在，目标路径必须与活动数据库不同且尚不存在；命令不会覆盖已有文件。切换前先建立可读、完整性通过的 v1 SQLite 备份，计算 SHA-256，并在创建备份期间或取得事务锁前检测数据变化。
6. 通过二次 preflight 后，单个 `BEGIN IMMEDIATE` 事务清除 v1 可变事实、建立空白 v2 epoch、固定 slot 目录和初始游标，把协议元数据原子改为 `2 + V2_ACTIVE + SYNTHETIC_DEMO`，持久化备份摘要与切换时间，再执行完整 v2 基础验证。失败则回滚整个数据库事务并保留已验证备份，不留下半切换状态。
7. 切换后当前 v1 服务会硬拒绝该数据库；不得保留双写、v1 兼容 API、状态翻译或“检测失败就回到六阶段”的旁路。D-036 的启用/验收结论只属于其当时版本，后续 D-037 仍须自己的升级和复验证据。
8. 若验收失败，只能停止服务并整体恢复到保存的 v1 备份与同一套 v1 版本，不能手工拼接 v1/v2 表。恢复或再次切换均需新的明确授权与证据。

### 10.3 合成 schema 12 升级门（当前目标 17；D-054 历史为 14）

已处于 `V2_ACTIVE` 的 schema-12 库不得通过 legacy `migrateDatabase`、`db:setup` 或 `pnpm dev` 自动升级。维护入口固定为：

```powershell
pnpm db:v2:upgrade -- --backup '<尚不存在的绝对路径.sqlite>' --confirm SYNTHETIC_DEMO_DATA_IS_DISPOSABLE
pnpm db:v2:verify
```

1. 执行前停止全部 Demo 服务并人工核验 PID、端口和数据库文件句柄；代码会取得 SQLite 写锁，但不能把“暂时没有写事务”误当作旧服务已经退出。
2. 只接受 `V2_ACTIVE + SYNTHETIC_DEMO`、固定 300 身份 seed、原切换备份证据存在、SQLite 完整性通过、无未知表/结构漂移/遗留 v1 可变事实、schema 精确匹配 `0001`～`0012`，且仓库待应用迁移恰为 `0013`～`0017`。其他数据一律停止。
3. 备份父目录必须存在，目标必须与活动库不同且尚不存在；先生成可读、完整性通过的 v2 schema-12 SQLite 快照和 SHA-256，并检测并发数据变化。
4. 二次 preflight 后在一个 `BEGIN IMMEDIATE` 事务中依次应用 `0013`～`0017`：完成奖励/抽奖转换、受保护来源元数据、独立节目目录、弹幕样式与礼物体验升级，并执行完整 schema-17 v2 验证。失败回滚活动库并保留备份。
5. 回退必须停止服务、按 RUNBOOK 的 WAL 卫生整体恢复 schema-12 备份，并配套恢复 schema-12 代码；禁止手工拼表或让 schema-17 代码继续写 schema-12 库。

### 10.4 D-054 受保护名单初始化门

1. 只能从获授权源抽取姓名与 8 位学号；性别、班级及其他列必须在进入导入器前删除。导入输入携带源 SHA-256，且学号不得缺失或重复。
2. 数据库、运行凭据与 NFC 映射三个目标都必须尚不存在并位于 Git 忽略的私密目录；导入器不得覆盖、合并或更新现存库。
3. 导入器按 D-065 生成姓氏首字母与学号后四位组成的公开星号；内部 ID、visual seed 与 256 位邀请令牌仍独立随机生成。完整学号仅保存用途隔离的 HMAC，令牌保存 SHA-256；私密 NFC 映射保存“学号→星号→令牌 URL”。重号须在生成身份或写入前停止。
4. 新库直接应用当前 `0001`～`0017`，在单事务中建立身份/节目/礼物/slot/v2 空白 epoch，并原子标记 `V2_ACTIVE + PROTECTED`、源 SHA-256 和导入时间；随后必须通过目录指纹、schema、运行时、slot、游标和 SQLite 完整验证。D-054 历史导入时的目标版本为 14。
5. `PROTECTED` 库没有确定性重置语义；维护 CLI、后台命令与正式 UI 均不得提供 `RESET_DEMO`。正式库缺失或验证失败时，启动器必须停止而不是创建合成身份。
6. 真实目录与测试账号不得混合。固定合成 Demo 可导出少量便捷账号，但仍运行在独立数据库、凭据和 epoch 中。

### 10.5 D-061 schema 14→15 保留事实的升级门

显式 `db:v2:catalog-upgrade` 只接受验证通过的 `V2_ACTIVE + SYNTHETIC_DEMO|PROTECTED`、精确 schema 14、唯一待应用迁移 `0015`，并要求目标配置、全新备份路径和停服确认 `V2_SERVICES_STOPPED`。RUNNING 拒绝；先 SQLite 备份/完整性/并发写检查，再取得事务写锁、复查、迁移与完整验证；失败回滚且保留备份。它不更改 epoch、不重发奖励、不重建身份、不修改运行凭据/NFC，也不重算中奖结果。

迁移复制旧节目定义、热度和当前选择，并把 `v2_gift_transactions` 的节目外键迁至新目录，逐行保留礼物事实。旧名单指纹仍使用原零热度规范形式；运行热度不属于身份字段。schema 15 单独验证热度与保留礼物消费之和一致。合成重置清本轮热度/互动但保留所维护的节目目录及 catalog revision；PROTECTED 仍禁止重置。

本轮只在临时合成数据上验证上述路径；正式与既有合成运行库的实际维护另计。命令和恢复要求见 [`RUNBOOK.md`](./RUNBOOK.md) §7.6。

### 10.6 D-071 schema 16→17 礼物体验保留升级门

显式 `db:v2:gift-upgrade` 只接受验证通过的 `V2_ACTIVE + SYNTHETIC_DEMO|PROTECTED`、精确 schema 16、当前迁移 tip 17，并要求目标数据库、同代 manifest、准确人数、全新备份路径和停服确认 `V2_SERVICES_STOPPED`。运行 tuple 可以是合法的 READY/RUNNING/PAUSED/COMPLETED；维护期间所有写者仍必须实际停止。升级器先做一致性 SQLite 备份、完整性与并发变化检查，再在写锁内复查、迁移和执行完整 schema-17 验证；失败回滚事务并保留备份。

`0017` 暂存并恢复旧目录及 v1/v2 礼物交易，保留每笔旧实际面值、余额、节目热度、奖励、epoch 和运行状态。旧 `PROGRAM_ALLOWANCE` 行继续留作审计，新服务不读取或新增；活动目录严格验证为 1/5/10/20。历史 schema≤16 的事件为可回放解析保留旧 50 面值兼容，这个兼容不能进入 schema-17 活动目录或新交易。跨 schema 回退必须同时恢复备份和旧代码，不能只切 release；操作见 [`RUNBOOK.md`](./RUNBOOK.md) §7.8，已部署证据见 [`D071_GIFT_EXPERIENCE_ACCEPTANCE.md`](./D071_GIFT_EXPERIENCE_ACCEPTANCE.md)。

## 11. V2-00 后的实施验收

以下条件全部通过，才能声称协议 v2 已实现；文档完成本身不等于实现完成：

### 11.1 契约与数据库

- 三端和服务端共享同一 v2 枚举、合法 tuple、命令迁移、revision、稳定事件名和第 9 节错误码；不存在仍作为当前逻辑使用的 `stage=1..6`。
- 新迁移可从固定合成 v1 基线执行一次性切换；schema 12→15 及 14→15 只经各自备份优先入口执行并可整体回滚；重复启动不重复奖励、建星或抽奖；既有已发布迁移保持前向顺序。
- 受保护名单只能从新库初始化并保留源证据；真实/有价值数据探测会硬停止，不允许静默清空。`RESET_DEMO` 只接受合成分类，正式库必须拒绝。

### 11.2 参与者入场

- NFC、同令牌二维码/短链接及姓名+8 位学号人工协助均映射同一身份。首次核验先原子预留稳定 slot，再得到会话、动力 100、激活星光 20 和 `NEEDS_COLOR`；重复核验不重复发放。
- 未锁色者不出现在星系，且不能跳过选色；锁色事务只产生一个稳定公共恒星并直接进入 `ADMITTED`，三端没有寄语/胶囊停留。
- 旧胶囊命令稳定拒绝，遗留正文迁移后为空；激活 20 + 启动星星 40 + 首次送礼 10 + 首次合规弹幕 10 + 协同点亮 20 的账本与累计值一致。
- READY/RUNNING 晚到者完成个人流程后进入当前场景；PAUSED 拒绝写入但允许已激活身份只读恢复；COMPLETED 允许任何本 epoch 已激活身份只读重认证，但未完成者不能继续入场。

### 11.3 全场与中场抽奖

- 所有 mode/status/currentScene 只形成第 3.2 节合法 tuple；`SET_MODE`、`START`、`SET_SCENE`、`ADVANCE`、`PAUSE`、`RESUME` 和 `COMPLETE` 的非法来源、目标及过期 revision 均被拒绝。
- LIVE 只能按三个场景向前运行；最终一次确认原子进入 `COMPLETED`，重复命令幂等，不存在第二个结束阶段。
- `START_STAR` 只在 `ADMITTED + RUNNING + ASSEMBLY` 成功一次，不创建或移动恒星；其公共 `started`、`starRevision`、`star.node.upserted`、本人事实与奖励在同一事务收敛，大屏可由快照或增量恢复。晚到错过 ASSEMBLY 者不能补做或补领。礼物/弹幕仅 PROGRAM_SUPPORT，协同点亮仅 COOPERATIVE_LIGHT，均无跨场景补奖励。
- REHEARSAL 只在 `RUNNING + COOPERATIVE_LIGHT + presentation NONE` 建立服务端权威结尾预览，刷新/重连恢复且始终显示排练标记；它可手动清除，数据库没有现场完成事实。
- 抽奖只在 `RUNNING + PROGRAM_SUPPORT` 开启；服务端从已准入且未中奖者中无放回选择，刷新/重连/重启恢复；后台显示目录姓名+公开星号，正式姓名仅限受控后台，大屏只显示公开星号。暂停、换场、完成或手动关闭只收屏并保留结果，只有 `SYNTHETIC_DEMO` 的 REHEARSAL 管理员可清空。
- Participant/Admin/Screen 三类快照符合第 4.4 节；参与者 `allowedActions` 与服务端状态一致，runtime/private 事件后先刷新再写；后台匿名漏斗不泄露逐人身份，就绪警告可明确 override，但任何安全硬门不可 override。

### 11.4 星系同步、恢复与容量

- 首屏和重连先取带 `resetEpoch`、各类 revision 和获授权 `streamSeq` 游标的权威快照，再分流消费稳定事件；不同流交错不制造伪缺口，重复、乱序、真缺口和旧 epoch 测试不会重复建星或错误移位。
- 300 个固定合成参与者各可预留 slot 并形成一个真实公共恒星；第 301 个首次激活在创建参与者状态、会话、动力或星光前得到 `STAR_CAPACITY_REACHED`，不发生静默截断或卡在待选色。
- 公共 payload 和日志通过隐私检查；本人星号仅在本人手机突出，其他星不显示编号。
- 服务重启、浏览器刷新、断线重连和跨设备登录都恢复一致的参与者状态、版本化星光账本、运行 tuple、活动 presentation 和 formation slot。

### 11.5 手机端、动效与无障碍

- 390×844、短视口与软键盘场景无关键操作遮挡；下半页只有一个主要操作坞，模糊不支持时仍清晰可读。
- 正常首次路径在新身份权威激活后先等待页面稳定 `visible`，再按 D-037 当前路径“约 5.4 秒沉入/接近/捕获寻星 → 不限时选色 → 权威锁色并直接准入 → 约 1.0 秒闪烁后衔接约 4.2 秒拉远入轨”执行；全程共用同一持久恒星，不出现寄语/胶囊页，动画不触发或延迟业务推进与实时连接。
- 首次正常路径不出现跳过控件；开播后的真正后台中断立即收束且返回不重播，reduced-motion、返回、刷新、断线和失败路径直接落到可操作静态状态。
- 成功提示约 3.5 秒收回，错误/离线/暂停/完成保持；退出每次确认，草稿按约定清空。
- 键盘、焦点、触控目标、对比度、屏幕阅读器语义和 `prefers-reduced-motion` 通过自动与人工检查。

### 11.6 三端与性能证据

- `/welcome`、`/screen`、`/admin` 使用同一服务端事实，在暂停、恢复、完成、清屏、重置和旧会话失效场景中一致。
- 300 个固定合成参与者的运行/投影、礼物、弹幕、协同点亮和恒星 upsert 传播延迟 p95 均不超过 2 秒；业务失败、重复奖励、重复恒星、负动力和旧 epoch 污染为 0。
- 同一 `resetEpoch` 只使用一个 `rewardRuleVersion`；每行账本保留实际增量和版本，运行中切换规则被拒绝，新规则只从新 epoch 生效且不改写历史。系统不存在未授权的后台数值扣减/补发入口。
- D-027/D-028 的历史自动门（新鲜合成邀请、normal-motion、生产 Vue 页面）只保留原范围：它证明可见性门、约 2.8 秒时长、无跳过、后台中断静态与恢复不重播（D-027），以及同一恒星节点与 F6→F7 中心/尺寸差 `0px`、CLS `0` 的连续性（D-028），但不得扩张为当前视觉通过；当前视觉以 D-030 金标为准。
- D-037 当前视觉门要求：参考 D-030 的 5.4s/1.0s/4.2s 视觉语言，同一恒星贯穿寻星/选色/锁色/入轨；逐字标题、字体回退栈、微角操作坞与本人档案边界继续生效；隐藏/中断/刷新/恢复/reduced-motion 直接呈现同一权威静态结构。D-030～D-032 的既有通过只作变更前基线。
- 自动化浏览器通过不等于实体手机通过；仍需由项目负责人选择至少一台能够代表实际上线访问方式的实体智能手机，用新鲜邀请对 D-037 当前版本完成首次视觉签核，并复验真实触控、软键盘、三端抽奖、OBS、页面隐藏/恢复、断线重连、退出确认和终局只读。品牌、型号与操作系统不作阻塞限制；记录机型、系统、浏览器及版本、CSS 视口、DPR 与 `prefers-reduced-motion`，结果写入 [`D037_FIELD_ACCEPTANCE.md`](./D037_FIELD_ACCEPTANCE.md)。桌面移动端模拟、截图和 AI 观察不代签；[`V2_10_FIELD_ACCEPTANCE.md`](./V2_10_FIELD_ACCEPTANCE.md) 的 D-036 `PASS` 也不代签本次变更。

## 12. 明确不在 v2 当前范围

- 公网部署、实体 NFC 写卡/补卡、场馆硬件、正式品牌授权以及数据责任人与删除流程签核；
- 抽奖概率加权、奖项配置、兑奖和领奖核销；
- 重型 3D 场景、GSAP 插件、逐星 GSAP 或除 D-026 `/screen` core 例外之外的新增大型动画运行时；
- 用 AI 生成预览图替代真实项目页面、浏览器证据或真机验收。
