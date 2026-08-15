# 迎新晚会互动系统 · 文档入口

> 一句话：手机 H5（`/welcome`）、后台（`/admin`）、舞台大屏（`/screen`）三端联动的"智工星域"迎新互动系统，本地局域网 + 固定合成数据，协议 v2 为当前权威。

## 一、5 分钟了解现状

1. 读完本页（现状卡 + 规则卡）。
2. 读 [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md)：目标、已完成/未完成、边界。
3. 要跑起来：读 [`RUNBOOK.md`](./RUNBOOK.md)。
4. 要写代码：按需查 [`PROTOCOL_V2.md`](./PROTOCOL_V2.md)（协议）、[`REQUIREMENTS.md`](./REQUIREMENTS.md)（需求）、[`VISUAL_GUIDE.md`](./VISUAL_GUIDE.md)（视觉）、[`API.md`](./API.md)（接口）。

## 二、现状卡（2026-08-15 基线，详见 PROJECT_CONTEXT）

| 事项 | 状态 |
|---|---|
| 协议 v2 全部实现（V2-00～V2-09） | ✅ 完成，自动门全绿 |
| D-030 视觉金标 + D-031/D-032 自动子门 | ✅ 完成 |
| 30 分钟渲染 soak、三浏览器 E2E、300 人协议负载 | ✅ 通过 |
| **实际 `backend/.data` 切换 v1→v2** | ✅ **已切换（D-034，2026-08-15，epoch 9）**，`pnpm dev` 即 v2 三端 |
| vivo X300 / 三端局域网 / OBS 现场人工验收 | ✅ **已关闭（D-036，2026-08-15 负责人签核全部通过）** |

**Demo v0 已完成收口**：协议 v2（V2-00～V2-10）全部门禁关闭。剩余事项只有正式版延期项（NFC 写卡、印刷、公网、真实名单、正式 VI 等，见 [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) §5），均不阻塞 Demo。

## 三、规则卡

### 不可妥协（安全红线）

1. 只用合成数据；真实姓名、学号、令牌、正文不得进入代码、日志、截图、报告或 Git。
2. 不碰 `backend/.data/`：测试与预览只用 OS 临时库；切换/重置是显式破坏性操作，按 RUNBOOK 维护门执行。
3. 动画不得承载、推进或延迟业务事实；reduced-motion 与断线直接静态终态。
4. 桌面自动化证据不能代签真机/现场人工验收。

### 可以灵活

- 文案、视觉细节、动效节奏（在 D-030 金标与 VISUAL_GUIDE 框架内）；
- 文档排版与结构（本次重组即一例）；
- 测试组织方式与脚本命名（不改变门禁语义即可）。

### 协作规则（AI 与协作者）

1. 影响实现或验收的决定先写入 [`DECISIONS.md`](./DECISIONS.md)，再改代码；其余文档按需同步，不再要求逐份连锁更新。
2. AI 产出由项目负责人复核；不得把建议写成学院定案。
3. 未经授权不提交、不推送。

## 四、文档地图

### 当前层（现行权威）

| 文档 | 用途 |
|---|---|
| [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md) | 项目目标、基线、待办、边界（唯一"现状"来源） |
| [`PROTOCOL_V2.md`](./PROTOCOL_V2.md) | 协议 v2 唯一权威：入场时钟、三场景、快照/事件、错误码、重置与切换 |
| [`REQUIREMENTS.md`](./REQUIREMENTS.md) | 当前需求清单（V2-MUST），细节指向 PROTOCOL_V2 |
| [`RUNBOOK.md`](./RUNBOOK.md) | 运行手册：启动、验证门、现场流程、维护门 |
| [`TEST_PLAN.md`](./TEST_PLAN.md) | 现行测试计划与门禁入口 |
| [`V2_10_FIELD_ACCEPTANCE.md`](./V2_10_FIELD_ACCEPTANCE.md) | **唯一未关闭的人工验收表**（vivo/OBS/局域网） |
| [`FIELD_AUTOMATION.md`](./FIELD_AUTOMATION.md) | vivo 真机只读预检脚手架（adb+CDP），不代签人工验收 |
| [`VISUAL_GUIDE.md`](./VISUAL_GUIDE.md) | 三端视觉规范与设计令牌（D-030～D-032 现行） |
| [`DATA_PRIVACY.md`](./DATA_PRIVACY.md) | 数据最小化与隐私边界 |
| [`API.md`](./API.md) | v2 端点总览；v1 接口参考在 [`archive/v1-api.md`](./archive/v1-api.md) |
| [`GLOSSARY.md`](./GLOSSARY.md) | 术语表（slot、epoch、revision、presentation、金标等） |
| [`DECISIONS.md`](./DECISIONS.md) | 决策日志（D-001～D-033，倒序：编号越大越新） |

### 历史层（只读追溯）

- [`archive/`](./archive/README.md)：v1 需求、测试证据、运行手册、API 参考、G0～G4 验收原文（含 SHA）与早期视觉方案。
- 根目录的 `ACCEPTANCE_G0_G4.md`、`ACCEPTANCE_G0_G4_D022.md` 是指向归档原文的指路桩（兼容旧链接）。

## 五、常用命令

```text
pnpm install --frozen-lockfile   # 安装
pnpm dev                         # 本地三端（v2 现行；V2_ACTIVE 合成库）
pnpm preview:v2:field            # 现场验收临时 v2 栈（需 $env:DEMO_HOST 可信私网 IPv4）
pnpm test                        # 单元/集成/API 回归
pnpm test:v2:e2e                 # 三浏览器 v2 E2E
pnpm test:v2:load                # 300 人协议负载
pnpm test:v2:soak                # 30 分钟渲染 soak（先 smoke）
pnpm verify:v2-09                # 全量自动门
pnpm docs:check                  # 文档链接与 DECISIONS 倒序自检
pnpm db:verify                   # 数据库/种子校验
```
