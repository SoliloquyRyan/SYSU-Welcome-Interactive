# 迎新晚会互动系统 · 文档入口

> 一句话：手机 H5（`/welcome`）、后台（`/admin`）、舞台大屏（`/screen`）三端联动的"智工星域"迎新互动系统；协议 v2 为当前权威，正式受保护名单与合成测试库物理隔离。

## 一、5 分钟了解现状

1. 读完本页（现状卡 + 规则卡）。
2. 读 [`PROJECT_CONTEXT.md`](./PROJECT_CONTEXT.md)：目标、已完成/未完成、边界。
3. 要跑起来：读 [`RUNBOOK.md`](./RUNBOOK.md)。
4. 要写代码：按需查 [`PROTOCOL_V2.md`](./PROTOCOL_V2.md)（协议）、[`REQUIREMENTS.md`](./REQUIREMENTS.md)（需求）、[`VISUAL_GUIDE.md`](./VISUAL_GUIDE.md)（视觉）、[`API.md`](./API.md)（接口）。

## 二、现状卡（D-037/D-051/D-055 当前候选，详见 PROJECT_CONTEXT）

| 事项 | 状态 |
|---|---|
| D-036 变更前协议 v2 / D-030～D-032 / V2-10 | ✅ 历史基线已签核 |
| D-037：锁色直接准入 + 中场个人抽奖 | ✅ 2026-09-02 本机自动收口通过；人工门另计 |
| D-045：连续相机坠落 + 视界/隧道交叠 + 空间光前沿接管 | ✅ 当前工作树快速门、三浏览器、46 秒 smoke、1920×1080/300 星逐帧与连续录屏、GPU/Canvas2D 透明终态及文档门均通过；详见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.9，实际 OBS 观感另计 |
| D-046：棒旋银河 + 首帧逆时针星流 + 摄影式星点 | ✅ 当前工作树快速门、三浏览器、46 秒 smoke、1920×1080/300 星逐帧与连续录屏、reduced-motion、透明终态及文档门均通过；详见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.10，实际 OBS/场馆屏主观观感另计 |
| D-047：零人流动底星 + 逐人单次流星 + 连续黑洞隧道 | 🟢 当前工作树快速门、三浏览器旅程、46 秒 smoke、文档门、独立现场预览 smoke 与 1920×1080 连续录像/透明像素检查均通过；实际 OBS/场馆屏主观观感另计；详见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.11 |
| D-048：60Hz 惯性光流 + GPU 预热 + 连续快门 | 🟢 当前工作树核心 17 项单测、三浏览器旅程及 54.4 秒 smoke 通过；双浏览器并行的 300 星高速段 `52.70 FPS`，单大屏无录制干扰实测约 `59 FPS`，等待态约 30 FPS、节目透明态 0 FPS；实际 OBS/场馆屏主观观感另计；详见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.12 |
| D-049：柔性光学边界 + Orbital Signal 跨端色谱 | 🟢 当前工作树已实现 0.8～1.3 秒尾段重叠溶解、薄核心/宽体积白光以及共享色标；18 项大屏核心单测、三浏览器旅程、54.5 秒 smoke 和 300 星无录屏性能门通过，详见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.13；实际 OBS/场馆屏主观签核仍待负责人完成 |
| D-050：手机背景同源重置 | 🟢 当前工作树保留约 32 KB 手机本地纹理作低饱和亮度结构，叠加 Orbital Signal 气氛且不复用约 1.85 MB 大屏素材；手机视觉 E2E、生产构建和跨端标记断言通过，D-052 实体手机的色彩/温升/流畅度仍待负责人签核 |
| D-051：恒星坍缩 + 非对称超新星 + 白场节目接管 | 🟢 当前工作树已退役黑洞/事件视界/隧道运行路径，并以同一约 8.4 秒时间线实现错峰螺旋汇聚、高温核心、一次非对称超新星和连续 Canvas 透明化；核心单测、仓库快速门、三浏览器闭环、54.4 秒 smoke、24/300 星关键帧、正式 Chrome 性能与强制 Canvas2D 回退均通过，详见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.14；实际 OBS/场馆屏主观震撼度仍待负责人签核 |
| D-053：三端 Orbital Signal 视觉收口 | 🟢 当前工作树已统一共享语义表面/文字/状态/焦点/禁用令牌与本机字体角色；手机关键标签不低于 12px，后台改为无持续氛围动画的克制深空运营控制台且不显示内部 presentation 枚举。快速门、三浏览器闭环、390/1366/1920 浏览器实看、键盘焦点、禁用态与 reduced-motion 通过，详见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.16；实体手机/OBS/场馆仍待负责人签核 |
| D-054：受保护名单 + 匿名 NFC + 隔离测试账号 | 🟢 220 人正式库已导入 `backend/.private/` 并以 `V2_ACTIVE + PROTECTED + schema 14` 验证通过；只使用姓名/8 位学号，NFC URL 使用随机令牌，5 个测试账号留在独立合成库；正式域名和实体写卡仍待完成 |
| D-055：220 人盘面银河 + 420 底星 + 呼吸与轨道入场 | 🟢 当前工作树 21 项核心单测、40 文件/389 项全仓门、三浏览器闭环、0/40/80/120/160/220 正式视觉梯度、300 技术压力档、单人流星两阶段截图、reduced-motion 与透明节目端点均通过；详见 [`TEST_PLAN.md`](./TEST_PLAN.md) §3.18，实际 OBS/LED 屏和场馆观看距离主观签核仍待完成 |
| **实际 `backend/.data` 合成 Demo** | ✅ 已备份优先从 schema 12→14，完整验证通过；继续只作独立测试库 |
| D-037/D-052/D-053 实体手机 / 三端局域网 / OBS 复验 | ⏳ `PENDING`；至少一台代表实际上线访问方式的实体智能手机即可，不限定品牌、型号或操作系统；D-036 结果不能代签变更后流程或当前 UI |

**口径**：D-036 已关闭的是 2026-08-15 基线；D-037/D-048～D-053/D-055 仍需受影响的现场复验。D-054 已完成本机受保护名单导入和合成 Demo 升级，但 HTTPS 正式入口、实体写卡、数据告知/保管/删除责任以及实体手机/OBS/场馆签核仍是独立上线门。

## 三、规则卡

### 不可妥协（安全红线）

1. 真实姓名、学号、令牌与私密映射只允许存在于获授权源文件和 Git 忽略的 `backend/.private/`；不得进入代码、日志、截图、报告或 Git。
2. 合成测试只使用 `backend/.data/`，正式运行只使用 `backend/.private/`；两者不得合并。切换、升级与重置均按 RUNBOOK 维护门执行。
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
| [`D037_FIELD_ACCEPTANCE.md`](./D037_FIELD_ACCEPTANCE.md) | D-037/D-051/D-053 当前人工复验表（`PENDING`） |
| [`V2_10_FIELD_ACCEPTANCE.md`](./V2_10_FIELD_ACCEPTANCE.md) | D-036 变更前历史人工签核原表 |
| [`FIELD_AUTOMATION.md`](./FIELD_AUTOMATION.md) | Android 实体手机只读预检脚手架（adb+CDP，可选），不代签人工验收 |
| [`VISUAL_GUIDE.md`](./VISUAL_GUIDE.md) | 三端视觉规范与设计令牌（D-053 现行） |
| [`DATA_PRIVACY.md`](./DATA_PRIVACY.md) | 数据最小化与隐私边界 |
| [`API.md`](./API.md) | v2 端点总览；v1 接口参考在 [`archive/v1-api.md`](./archive/v1-api.md) |
| [`GLOSSARY.md`](./GLOSSARY.md) | 术语表（slot、epoch、revision、presentation、金标等） |
| [`DECISIONS.md`](./DECISIONS.md) | 决策日志（D-001～D-055，倒序：编号越大越新） |

### 历史层（只读追溯）

- [`archive/`](./archive/README.md)：v1 需求、测试证据、运行手册、API 参考、G0～G4 验收原文（含 SHA）与早期视觉方案。
- 根目录的 `ACCEPTANCE_G0_G4.md`、`ACCEPTANCE_G0_G4_D022.md` 是指向归档原文的指路桩（兼容旧链接）。

## 五、常用命令

```text
pnpm install --frozen-lockfile   # 安装
pnpm dev                         # 本地三端；未通过验证的 v2 库会安全停止
pnpm dev:formal                  # 只启动已验证的 backend/.private 正式名单库
pnpm preview:v2:field            # 现场验收临时 v2 栈（需 $env:DEMO_HOST 可信私网 IPv4）
pnpm test                        # 单元/集成/API 回归
pnpm test:v2:e2e                 # 三浏览器 v2 E2E
pnpm test:v2:load                # 300 人协议负载
pnpm test:v2:soak                # 30 分钟渲染 soak（先 smoke）
pnpm verify:v2-09                # 全量自动门
pnpm docs:check                  # 文档链接与 DECISIONS 倒序自检
pnpm db:verify                   # 数据库/种子校验
pnpm db:v2:upgrade -- --backup <新路径> --confirm SYNTHETIC_DEMO_DATA_IS_DISPOSABLE
pnpm db:test-accounts:export -- --output <私密新路径.csv> --count 5
```
