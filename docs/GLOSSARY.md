# 术语表

> 现行体系（协议 v2）的常用术语速查。协议细节以 [`PROTOCOL_V2.md`](./PROTOCOL_V2.md) 为准；历史术语（六阶段、Stage 1～6）只出现在 [`archive/`](./archive/README.md)。

## 身份与入场

| 术语 | 含义 |
|---|---|
| formation slot | 300 个固定、不透明的稳定星位之一；首次激活在同一事务中原子预留，满员整笔拒绝 |
| `NEEDS_COLOR` | 首次激活后的入场状态：已建会话、已发初始双值，等待选色 |
| `NEEDS_CAPSULE_DECISION` | 锁色成功后的状态：本人恒星已入公开星系，等待提交或跳过时光胶囊 |
| `ADMITTED` | 已准入：胶囊决定已持久化（`SUBMITTED` 或 `SKIPPED`），进入当前全场场景 |
| `publicStarId` | 公开星号 = 姓氏拼音首字母 + 合成学号后四位（如 `L-4821`）；锁色后成为公共恒星主键 |
| `personalStarCode` | 预分配星号，只进本人私有投影；锁色前不代表公共恒星已建立 |
| 晚到者 | 全场已在 `READY`/`RUNNING` 时才开始入场的人；完成后直接进入当前场景，不补旧场景奖励 |

## 运行与状态

| 术语 | 含义 |
|---|---|
| tuple | `mode(REHEARSAL\|LIVE) + status(READY\|RUNNING\|PAUSED\|COMPLETED) + currentScene(三场景之一\|null)` 的合法组合 |
| 三场景 | `ASSEMBLY`（集结）→ `PROGRAM_SUPPORT`（节目支持）→ `COOPERATIVE_LIGHT`（协同点亮）；`COMPLETED` 是终态不是第四场景 |
| presentation | 服务端权威互斥投影 `NONE\|CAPSULE_INSERT\|FINALE_PREVIEW`，由 `presentationRevision` 版本化，不改变运行 tuple |
| `V2_ACTIVE` / `CONTRACTS_READY` | 数据库激活状态：前者开放 v2 业务；后者只说明契约就绪（v1 数据库当前状态） |
| 匿名漏斗 | 后台按激活/公开恒星/准入/胶囊提交/跳过/启动/点亮计数的匿名统计，不以在线会话数作分母 |

## 版本与同步

| 术语 | 含义 |
|---|---|
| `resetEpoch` | 重置代际；重置 +1，跨 epoch 的会话/命令/事件一律拒绝 |
| revision 家族 | `runRevision`（运行 tuple）、`presentationRevision`（投影）、`participantRevision`（个人事实）、`aggregateRevision`（聚合）、`starRevision`（单星）、`interactionRevision`（弹幕/礼物互动投影） |
| `streamId` / `streamSeq` | 逻辑流（`public` / `admin` / `participant:<id>`）与流内连续序号；缺口只重拉受影响流 |
| `allowedActions` | 服务端为参与者计算的可执行动作集合（三端一致的展示依据，不是免校验令牌） |
| `rewardRuleVersion` | 星光规则的版本化权重；每个 epoch 固定一套，调整只从新 epoch 生效 |
| 快照优先 | 首屏/刷新/重连/缺口时先取权威快照，再消费增量事件 |

## 视觉与动效

| 术语 | 含义 |
|---|---|
| 金标（D-030） | `motion-previsual-personal-star` 预演是手机个人旅程的唯一视觉标准；正式页与预演共用同一生产渲染器 |
| 参考时长 | 金标的镜头节奏：约 5.4s 寻星 / 1.0s 锁色闪烁 / 4.2s 拉远入轨（D-028/D-029 的 2.8s/1.2s/3.2s 是历史数字） |
| 静态同构 | 隐藏/中断/刷新/恢复/reduced-motion 直接呈现与正常镜头末帧相同的静态权威结构 |
| OBS 透明源 | `PROGRAM_SUPPORT` 时大屏网页背景透明，中心留给导播节目视频，网页不碰媒体 |
| reduced-motion | `prefers-reduced-motion: reduce`；一切信息不依赖运动，直接静态终态 |

## 治理与验收

| 术语 | 含义 |
|---|---|
| D-xxx | DECISIONS.md 决策编号；倒序排列，编号越大越新 |
| V2-xx | 协议 v2 实施里程碑（V2-00～V2-10），均已完成自动门 |
| 自动门 / 子门 | 可由命令自动化证明的门禁；真机/现场人工项不能被自动证据代签 |
| soak | 长时间运行测试（本项目为 30 分钟 1920×1080 Chrome 渲染长跑） |
| 维护门 | v1→v2 一次性切换与合成重置的破坏性操作门槛（RUNBOOK §7、PROTOCOL_V2 §10） |
| 合成数据 | 固定种子的虚构身份与节目；真实数据一律禁止进入仓库与证据 |
| 六阶段 / Stage 1～6 / G0～G4 | v1 历史体系与历史门禁，只出现在 archive/ |
