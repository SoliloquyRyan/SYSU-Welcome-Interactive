---
name: frontend-design
description: 本项目（SYSU 智工星域）的 Vue 3 + Vite 前端实现规范：组件与文件结构、设计令牌用法、Canvas 星系约束、动效安全边界、无障碍与代码评审清单。修改 frontend/ 任何页面、组件或样式前先加载本技能。
whenToUse: 编写或评审 /welcome、/screen、/admin 三端页面、组件、Canvas 渲染、CSS 动效或样式令牌时使用。
---

# 前端实现规范（frontend-design · 项目版）

本技能是上游 frontend-design 在本项目的落地版。上游技能未随环境安装，此处固化项目自己的硬规则；规则冲突时以 `docs/VISUAL_GUIDE.md`、`docs/PROTOCOL_V2.md` 与最新 D 决策为准。

## 1. 架构与文件地图

- 入口：`frontend/src/main.js` → `App.vue` → `router/index.js`（`/welcome`、`/screen`、`/admin`，catch-all 重定向 `/welcome`）。
- 三端页面先做能力发现再挂载 v1/v2 分支：`WelcomeRoutePage.vue` / `ScreenRoutePage.vue` / `AdminPage.vue` 是路由壳，`V2WelcomeExperience.vue` / `V2ScreenExperience.vue` / `V2AdminConsole.vue` 是 v2 实现。
- 关键模块：`pages/student/mobile-galaxy-renderer.js`（手机单 Canvas 星系）、`pages/screen/galaxy-renderer.js`（大屏单 Canvas）、`composables/useV2ParticipantRealtime.js`（双流订阅）、`services/api.js`（可取消请求）。
- 状态只从服务端快照派生：`v2-mobile-state.js` / `v2-admin-state.js` 等本地模块只做投影与派生，不得发明服务端没有的事实。

## 2. 样式与令牌

- 一律使用 `src/styles/tokens.css` 的语义令牌（`--color-*`、`--space-*`、`--font-stack-*`），禁止散落无语义十六进制。
- `/welcome` 操作区用 D-032 微角令牌 `--shape-panel/control/item/sheet`；玻璃仅限唯一底部操作坞，模糊不可用时降级不透明面板。
- 字体只用本机回退栈（D-032）；不新增网络字体、不捆绑字库。
- 触控目标 ≥44×44px；`:focus-visible` 保留；状态必须有文字，不只靠颜色。
- 加载顺序 `tokens.css → motion.css → style.css`；旧别名（`--ink` 等）只作兼容。

## 3. 动效安全边界（硬规则）

- 只动画 `transform`/`opacity` 等低成本属性；禁止持续动画 `filter`/`backdrop-filter`。
- 动画不得承载、推进或延迟任何业务事实；实时连接与权威快照不等待表现层。
- `prefers-reduced-motion: reduce`、页面隐藏、开播后后台中断、刷新、失败、超时 → 直接同一权威静态结构，不重播。
- 手机端禁止 GSAP；GSAP core 例外仅限 `/screen` 少量覆层（独立 chunk，禁插件、禁逐星时间线）。
- 手机首次镜头按 D-030 金标：同一持久恒星贯穿寻星/选色/寄语/入轨，参考时长约 5.4s/1.0s/4.2s；正常首次无跳过按钮。

## 4. 星系渲染

- 最多 300 颗真实恒星来自权威 `publicStars`；稳定 `formationSlot` 定位置；幂等合并 `(resetEpoch, publicStarId, starRevision)`。
- 装饰微尘/轨道尘不代表参与人数；本人星只轻微突出并标注本人星号，他人无标签。
- 页面隐藏时停绘；大屏 PROGRAM_SUPPORT 时背景透明、中心清空（OBS 拥有媒体），持续 Canvas 绘制为 0。

## 5. 评审清单（改完必查）

- [ ] 无新增运行依赖（尤其动画库）；无外部网络请求；无真实身份字段进入 DOM/日志。
- [ ] reduced-motion 静态路径信息完整；软键盘/短视口无遮挡、无横向溢出。
- [ ] 写操作沿用幂等键与 revision 门；断线禁写、重连先取快照。
- [ ] `pnpm --dir frontend build` 与相关 Vitest 通过。
