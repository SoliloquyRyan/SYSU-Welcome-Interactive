# 迎新晚会互动系统 · 文档入口

> 一句话：手机 H5（`/welcome`）、后台（`/admin`）、舞台大屏（`/screen`）三端联动的"智工星域"迎新互动系统，本地局域网 + 固定合成数据，协议 v2 为当前权威。

## 一、5 分钟了解现状

1. 读完本页（现状卡 + 规则卡）。
2. 读 [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md)：目标、已完成/未完成、边界。
3. 要跑起来：读 [`RUNBOOK.md`](./RUNBOOK.md)。
4. 要写代码：按需查 [`PROTOCOL_V2.md`](./PROTOCOL_V2.md)（协议）、[`REQUIREMENTS.md`](./REQUIREMENTS.md)（需求）、[`VISUAL_GUIDE.md`](./VISUAL_GUIDE.md)（视觉）、[`API.md`](./API.md)（接口）。

## 二、现状卡（D-037 收口候选，详见 PROJECT_CONTEXT）

| 事项 | 状态 |
|---|---|
| D-036 变更前协议 v2 / D-030～D-032 / V2-10 | ✅ 历史基线已签核 |
| D-037：锁色直接准入 + 中场个人抽奖 | ✅ 2026-09-02 本机自动收口通过；人工门另计 |
| **实际 `backend/.data`** | 🟡 已是 `V2_ACTIVE`，但 schema 12→13 尚未执行；必须按 RUNBOOK 先备份再升级 |
| D-037 vivo X300 / 三端局域网 / OBS 复验 | ⏳ `PENDING`；D-036 结果不能代签变更后流程 |

**口径**：D-036 已关闭的是 2026-08-15 基线；D-037 重新打开了受影响的数据库升级与现场复验门。代码提交完成不等于实际库已升级，也不等于真机/OBS 已重新签核。

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
| [`D037_FIELD_ACCEPTANCE.md`](./D037_FIELD_ACCEPTANCE.md) | D-037 当前人工复验表（`PENDING`） |
| [`V2_10_FIELD_ACCEPTANCE.md`](./V2_10_FIELD_ACCEPTANCE.md) | D-036 变更前历史人工签核原表 |
| [`FIELD_AUTOMATION.md`](./FIELD_AUTOMATION.md) | vivo 真机只读预检脚手架（adb+CDP），不代签人工验收 |
| [`VISUAL_GUIDE.md`](./VISUAL_GUIDE.md) | 三端视觉规范与设计令牌（D-030～D-032 现行） |
| [`DATA_PRIVACY.md`](./DATA_PRIVACY.md) | 数据最小化与隐私边界 |
| [`API.md`](./API.md) | v2 端点总览；v1 接口参考在 [`archive/v1-api.md`](./archive/v1-api.md) |
| [`GLOSSARY.md`](./GLOSSARY.md) | 术语表（slot、epoch、revision、presentation、金标等） |
| [`DECISIONS.md`](./DECISIONS.md) | 决策日志（D-001～D-037，倒序：编号越大越新） |

### 历史层（只读追溯）

- [`archive/`](./archive/README.md)：v1 需求、测试证据、运行手册、API 参考、G0～G4 验收原文（含 SHA）与早期视觉方案。
- 根目录的 `ACCEPTANCE_G0_G4.md`、`ACCEPTANCE_G0_G4_D022.md` 是指向归档原文的指路桩（兼容旧链接）。

## 五、常用命令

```text
pnpm install --frozen-lockfile   # 安装
pnpm dev                         # 本地三端；未通过验证的 v2 库会安全停止
pnpm preview:v2:field            # 现场验收临时 v2 栈（需 $env:DEMO_HOST 可信私网 IPv4）
pnpm test                        # 单元/集成/API 回归
pnpm test:v2:e2e                 # 三浏览器 v2 E2E
pnpm test:v2:load                # 300 人协议负载
pnpm test:v2:soak                # 30 分钟渲染 soak（先 smoke）
pnpm verify:v2-09                # 全量自动门
pnpm docs:check                  # 文档链接与 DECISIONS 倒序自检
pnpm db:verify                   # 数据库/种子校验
pnpm db:v2:upgrade -- --backup <新路径> --confirm SYNTHETIC_DEMO_DATA_IS_DISPOSABLE
```
