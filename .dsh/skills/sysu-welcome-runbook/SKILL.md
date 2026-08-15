---
name: sysu-welcome-runbook
description: SYSU 迎新晚会互动系统（智工星域）的项目级工作规则：现行文档地图、安全红线、决策流程、常用命令与常见错误。处理本仓库任何代码、文档、测试或验收问题时先加载本技能。
whenToUse: 在本仓库内修改代码/文档、讨论需求或验收、运行验证命令、涉及 v1/v2 协议、数据库或视觉金标时使用。
---

# SYSU Welcome Interactive · 项目规则

三端联动的迎新晚会互动系统（手机 `/welcome`、后台 `/admin`、大屏 `/screen`）。当前权威：协议 v2（D-025～D-032）。

## 第一步：先读文档

1. [`docs/README.md`](../../../docs/README.md)——现状卡、规则卡、文档地图、常用命令。
2. 按需：`docs/PROJECT_CONTEXT.md`（现状）、`docs/RUNBOOK.md`（运行/维护）、`docs/PROTOCOL_V2.md`（协议）、`docs/REQUIREMENTS.md`（需求）、`docs/VISUAL_GUIDE.md`（视觉）、`docs/GLOSSARY.md`（术语）。
3. 历史内容在 `docs/archive/`：**v1 数字（27/27、G4 p95、2.8s 等）不得当作现行证据引用**。

## 安全红线（不可妥协）

1. 只用合成数据；真实姓名、学号、令牌、正文不得进入代码、日志、截图、报告或 Git。
2. 不碰 `backend/.data/`：测试/预览只用 OS 临时库；切换与重置是破坏性维护门（RUNBOOK §7、PROTOCOL_V2 §10）。
3. 动画不得承载、推进或延迟业务事实；reduced-motion 与断线直接静态终态。
4. 桌面自动化不能代签真机/现场人工验收（`docs/V2_10_FIELD_ACCEPTANCE.md` 是唯一人工门）。

## 工作流程

- 影响实现或验收的决定先写入 `docs/DECISIONS.md`（新增 D-xxx，倒序置顶），再改代码；其余文档按需同步，不做连锁更新。
- AI 产出由项目负责人复核；不把建议写成学院定案；未经授权不提交、不推送。
- 现状：Demo v0 已收口（D-036，V2-10 人工签核关闭）；剩余只有正式版延期事项（NFC 写卡、印刷、公网、真实名单、正式 VI）。工作树未经授权不提交、不推送（D-014）。

## 关键事实（防错）

- 手机动效现行时长 = D-030 金标：约 5.4s 寻星 / 1.0s 锁色闪烁 / 4.2s 拉远入轨；2.8s/1.2s/3.2s 是历史数字。
- 三场景：`ASSEMBLY → PROGRAM_SUPPORT → COOPERATIVE_LIGHT`；`COMPLETED` 是终态，没有第六阶段。
- 合法运行 tuple：`READY+null`、`RUNNING/PAUSED+三场景之一`、`LIVE+COMPLETED+COOPERATIVE_LIGHT`。
- 星光：激活 20、胶囊首次实际提交 20、星星启动 20、首次送礼 10、首次合规弹幕 10、协同点亮 20；上限 100。
- 胶囊人工插入 ≤6 条；弹幕 ≤40 字符、单人 3 条/10s、全场 12 条/s；大屏无身份字段。
- `pnpm dev` 为协议感知启动器：`V2_ACTIVE` 库直接跑 v2 三端，v1 库走旧 setup 路径。

## 常用命令

```text
pnpm test / pnpm typecheck / pnpm build     # 快速回归
pnpm test:v2:e2e | test:v2:load | test:v2:soak   # v2 专项（只用 OS 临时库）
pnpm verify:v2-09                           # 全量自动门
$env:DEMO_HOST='可信私网 IPv4'; pnpm preview:v2:field   # 现场验收预览
pnpm exec tsx backend/src/cli/v2-switch.ts --backup <新路径> --confirm SYNTHETIC_DEMO_DATA_IS_DISPOSABLE  # 一次性切换（维护窗口）
```
