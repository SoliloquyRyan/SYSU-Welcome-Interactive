# 产品与系统需求（v2 现行）

> 状态：协议 v2 现行（D-037 已取消寄语并启用中场个人抽奖）；细节与验收口径以 [`PROTOCOL_V2.md`](./PROTOCOL_V2.md) 顶部 D-037 覆盖说明为权威。v1 六阶段历史需求已归档，不再是实现或验收依据。

## 1. 角色

- **Demo 参与者**：固定合成邀请令牌进入 H5；二维码/短链接携带同一令牌；人工协助使用虚构姓名 + 合成学号定位同一身份，不得建立第二账号。
- **共用后台操作会话**：登录后可自提 `REVIEWER`、`STAGE_CONTROLLER`、`DEMO_ADMIN` 或 `ALL`；角色只是能力分组（接受无个人归因风险，D-010）。
- **大屏会话**：只读聚合数据、公开星号/星色、公开弹幕与抽奖公开结果；不读取姓名。
- **项目负责人**：单人维护，负责产品取舍、运行与最终验收。

## 2. 入口与身份

- **REQ-ENTRY-001**：NFC 为主入口、同令牌二维码/短链接为兼容备用；实体写卡与印刷为 `FORMAL-PENDING`。
- **REQ-ENTRY-002**：所有入口进入同一 H5 并恢复同一参与者状态，不得重复发放或生成两个档案。
- **REQ-ENTRY-003**：入口 URL 与 NFC 数据不得包含姓名、学号等个人信息。
- **REQ-ENTRY-004**：页面提供轻触、扫码与人工协助说明。
- **REQ-ENTRY-005**：后台可识别有效/无效/已作废合成入口；令牌操作需 `DEMO_ADMIN`/`ALL` + 确认。
- **REQ-ENTRY-006**：一人一卡一码；同卡 NFC 与二维码编码同一不可猜测随机令牌。
- **REQ-ENTRY-007**：入口 URL 可承载令牌；读取后立即把地址栏与历史项替换为不含令牌的 `/welcome`，不得外传或写日志。
- **REQ-ID-001**：个性 NFC 令牌是主要核验方式；二维码/短链接携带同一随机令牌。Demo 人工协助可用虚构姓名和合成学号定位同一合成身份，但必须恢复该身份既有状态，不得生成第二账号；失败信息不得分别泄露姓名或学号是否存在。
- **REQ-ID-002**：公开星号 = 姓氏拼音首字母 + 合成学号后四位（如 `L-4821`），导入与数据库层保证唯一；该编号可被熟人关联，不得称为不可关联匿名 ID。
- **REQ-ID-003**：同一参与者多设备登录共享同一服务端状态。
- **REQ-ID-004**（`FORMAL-PENDING`）：真实名单来源、核验授权、访客模式与碰撞应急规则。

## 3. 协议 v2 要求（V2-MUST，详见 PROTOCOL_V2 对应章节）

### 3.1 版本与权威状态（PROTOCOL_V2 §1/§4.2）

- **REQ-V2-PROTOCOL-001**：命令、快照、响应、事件携带 `protocolVersion=2` 与 `resetEpoch`；v1/v2 不得同实例混用。revision 家族：`runRevision`、`presentationRevision`、`participantRevision`、`aggregateRevision`、`starRevision`、`interactionRevision`；`public|admin|participant:<id>` 三流各自连续 `streamSeq`。
- **REQ-V2-PROTOCOL-002**：合法运行 tuple 只有 `READY+null`、`RUNNING/PAUSED+三场景之一`、`LIVE+COMPLETED+COOPERATIVE_LIGHT`。
- **REQ-V2-PROTOCOL-003**：LIVE 终章由最后场景一次确认、服务端原子写入 `COMPLETED`；REHEARSAL 只能显式预演结尾。
- **REQ-V2-PROTOCOL-004**：`PAUSED` 拒绝参与者写入、允许只读恢复；`COMPLETED` 硬关闭写入；安全处置不含数值调整。
- **REQ-V2-PROTOCOL-005**：管理命令迁移（`SET_MODE` 仅 READY、`START`、REHEARSAL 可跳场景、LIVE 只向前、`PAUSE`/`RESUME`、`COMPLETE`）非法组合稳定拒绝。
- **REQ-V2-PROTOCOL-006**：错误码为 PROTOCOL_V2 §9 的闭合集合，不继承 v1 码。
- **REQ-V2-PROTOCOL-007**：参与者快照含完整个人事实与服务端计算的 `allowedActions`；事件后先刷新快照再启用写入。

### 3.2 参与者入场与晚到者（PROTOCOL_V2 §2）

- **REQ-V2-ONBOARD-001**：激活先原子预留 300 slot 之一，再建会话并发 100 动力 + 20 星光一次；满员以 `STAR_CAPACITY_REACHED` 整笔拒绝。
- **REQ-V2-ONBOARD-002**：`READY`/`RUNNING` 接受新到与晚到者；晚到者完成后直接进入当前场景，不补播。
- **REQ-V2-ONBOARD-003**：锁色即把预留恒星以 `publicStarId` 原子加入公开星系、发 `star.node.upserted` 并直接准入；本人端突出标注，他人无标签。
- **REQ-V2-ONBOARD-004**：手机端、后台和大屏均不提供寄语/时光胶囊入口；旧字段只作迁移兼容，旧写命令稳定拒绝。
- **REQ-V2-ONBOARD-005**：重复、刷新、多设备、断线、并发不重复激活/锁色/入星系/奖励。
- **REQ-V2-ONBOARD-006**：`PAUSED` 不接受入场写入；`COMPLETED` 后本 epoch 已激活身份只读重认证，未完成者不能继续入场。

### 3.3 星系与三场景（PROTOCOL_V2 §3/§4）

- **REQ-V2-GALAXY-001**：最多 300 颗真实恒星，不用装饰星补位、不静默截断；slot 从确定性目录预留。
- **REQ-V2-GALAXY-002**：客户端先取权威快照再幂等消费事件；刷新/重连/乱序/重放不制造重复恒星或伪缺口。
- **REQ-V2-SCENE-001**：`ASSEMBLY` 仅一次 `START_STAR`（+40 星光）；`PROGRAM_SUPPORT` 允许礼物/弹幕/抽奖；`COOPERATIVE_LIGHT` 仅一次点亮（+20 星光）；晚到者不补旧场景奖励。
- **REQ-V2-SCENE-002**：presentation 为服务端权威互斥状态 `NONE|RAFFLE|FINALE_PREVIEW`，独立 `presentationRevision`；抽奖只在 `RUNNING + PROGRAM_SUPPORT` 合法。
- **REQ-V2-SCENE-003**：抽奖由服务端在已准入参与者中无放回随机抽取；后台显示姓名+星号，大屏只显示星号；场景变化/暂停/完成自动关闭投影并保留记录，排练模式可清空。
- **REQ-V2-SCENE-004**：大屏恒星含 `started`；聚合至少区分激活/公开恒星/已准入/已启动/点亮/星光总量；后台匿名漏斗不以在线数作分母。
- **REQ-V2-SCENE-005**：`ADVANCE`/`COMPLETE` 的就绪警告合并进一次确认，可明确 override 并审计；权限/旧 revision/非法 tuple 不可 override。
- **REQ-V2-SCENE-006**：抽奖结果持久化并随快照、刷新和重连恢复；同一轮同一身份不得重复中奖。

### 3.4 大屏、OBS 与公共互动（PROTOCOL_V2 §5.2）

- **REQ-V2-SCREEN-001**：大屏最多 300 颗真实恒星、单 Canvas、稳定槽位；不显示编号/星号/排行/头像/可点击节点。
- **REQ-V2-SCREEN-002**：`ASSEMBLY` 全屏星系；`PROGRAM_SUPPORT` 为 OBS 透明源，仅边缘 15%～20% 弱星系 + 匿名弹幕/礼物；网页不碰媒体。
- **REQ-V2-SCREEN-003**：弹幕 ≤40 字符、单人 3 条/10s、全场 12 条/s，规则拒绝敏感词/链接/联系方式/暂停/屏蔽；Screen 不含来源，Admin 只取匿名 `sourceId`。
- **REQ-V2-SCREEN-004**：后台可暂停、带原因撤下、屏蔽来源、紧急清屏；`COMPLETED` 后只允许减少公开内容。
- **REQ-V2-SCREEN-005**：礼物事件只含节目/礼物/时间；1.5 秒同类可合并；大屏最多一主一次；星舰可突出但限时。
- **REQ-V2-SCREEN-006**：视觉优先级 `COMPLETED > FINALE_PREVIEW > RAFFLE > 故障提示 > 当前场景 > 实时互动`；抽奖期间不排队补播，减少动态时直接显示结果。
- **REQ-V2-SCREEN-007**：终章只在实时观察到权威完成时播 5～6 秒；快照已完成/刷新/重连/reduced-motion 直接静态终态。
- **REQ-V2-SCREEN-008**：`/screen` 可按需加载 GSAP core 只做少量覆层 transform/opacity；300 星点必须 Canvas 绘制；手机端不迁移 GSAP。

### 3.5 手机信息架构与动效（PROTOCOL_V2 §6/§7，视觉细节见 VISUAL_GUIDE）

- **REQ-V2-MOBILE-001**：沉浸式流动星系 + 唯一底部液态玻璃操作坞；无六阶段线、"实时同步"、裸 `RUNNING`、玻璃卡片墙；不支持模糊时用不透明降级。
- **REQ-V2-MOBILE-002**：成功提示约 3.5 秒自动收回并由持久权威状态接替；错误/离线/暂停/完成提示持续可见。
- **REQ-V2-MOTION-001**：正常首次核验成功且服务端返回新建身份 + `NEEDS_COLOR` 后，先等稳定 `visible`，再播约 5.4 秒寻星（D-030 金标参考）；选色不计时；权威锁色后约 1.0 秒闪烁；权威准入后约 4.2 秒拉远入轨。**D-028/D-029 的 2.8s/1.2s/3.2s 是历史自动证据数字，不再作为设计目标。**
- **REQ-V2-MOTION-002**：正常首次不提供跳过按钮；开播前隐藏则等待；开播后后台中断立即静态且不重播；reduced-motion/返回/刷新/失败/超时直接静态可操作终态；不再使用怀士堂或建筑轮廓。
- **REQ-V2-MOTION-003**：叙事镜头用 Vue/CSS 低成本 `transform`/`opacity`，Canvas 只承担权威星系；动效不得承载或延迟业务提交。
- **REQ-V2-MOTION-004**：D-027～D-032 的自动与真机结果是 D-037 之前的历史基线；D-037 取消寄语页后，锁色确认直接衔接约 4.2 秒入轨，当前路径须重新执行自动门与 vivo X300 人工复验。

### 3.6 数值与重置（PROTOCOL_V2 §8/§10）

- **REQ-V2-VALUE-001**：星光 = 激活 20、首次启动星星 40、首次送礼 10、首次合规弹幕 10、协同点亮 20；上限 100。寄语/胶囊不再产生奖励。
- **REQ-V2-VALUE-002**：奖励规则服务端版本化（`rewardRuleVersion`），每行账本保存实际增量与版本。D-037 的一次性 schema 12→13 合成库迁移删除旧胶囊奖励、把既有 `STAR_STARTED` 调整为 40 并校正累计值；此后不得在运行中热切换规则。
- **REQ-V2-VALUE-003**：后台无扣减/补发入口；安全处置仅删除、屏蔽、清屏或撤下。
- **REQ-V2-RESET-001**：`RESET_DEMO` 需 `DEMO_ADMIN`/`ALL` + 确认 + 合成数据硬门；永不在启动时自动执行。
- **REQ-V2-RESET-002**：普通重置原子进入新 epoch 的 `REHEARSAL+READY+null`；清参与者可变状态，保留固定合成身份、令牌映射、`publicStarId` 与 slot 目录。
- **REQ-V2-RESET-003**：v1→v2 只允许一次性合成数据切换（v2 基础迁移）；失败整体恢复 v1 备份，不混跑。
- **REQ-V2-RESET-004**：已激活的 schema 12 合成库升级至 schema 13 时必须停服、显式确认、先写入不覆盖的独立 SQLite 备份，并在单事务内迁移和完整复验；失败回滚并保留备份。启动器不得自动升级或退回 v1 初始化。

## 4. 待确认汇总

1. 正式到场规模、节目单、场地、时间与舞台 Cue。
2. 真实身份字段、名单来源、访客模式与人工核验。
3. 抽奖奖项、每轮人数、领奖/核销（如未来需要）、记录保留期，以及录像/直播提示。
4. 公网托管、HTTPS 域名、数据库、第三方服务、备份与数据负责人。
5. 实体 NFC 写入、二维码、短网址、邀请函印刷与补卡流程。
6. 学院 Logo/VI 授权、审批、预算与最终验收人。
7. AI 内容审核供应商、隐私、成本与降级方案（Demo v0 不接入）。
