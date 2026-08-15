---
name: browser-preview
description: 本项目的浏览器预览与截图工作流：用 pnpm preview:v2:field / preview:journey 起临时 v2 栈、拿三端截图与动线 artifact、跑既有 Playwright 用例做视觉验证。相当于本项目的浏览器工具插件（无独立浏览器 MCP）；需要"打开页面看效果/截图"时先加载本技能。
whenToUse: 需要启动预览、打开三端页面、截图、目检动效或复跑浏览器回归时使用。
---

# 浏览器预览与截图（browser-preview · 项目版）

本项目没有接入独立浏览器 MCP，但自带完整的 Playwright + 预览脚本体系，可作为"浏览器能力"使用。

## 1. 预览入口

```powershell
# 现场验收级三端预览（需要可信私网 IPv4；自动打开已登录后台/大屏/手机二维码页）
$env:DEMO_HOST='本机可信局域网 IPv4'; pnpm preview:v2:field

# 个人旅程金标预览（桌面 Chrome，含动线 artifact）
pnpm preview:journey

# 历史入口（旧 2.8s 方案检查器，仅回看旧动线）
pnpm preview:mobile
```

- 全部使用 OS 临时 `V2_ACTIVE` 合成库，退出/Ctrl+C 自动清理；**绝不读改 `backend/.data/`**。
- 预览窗口在真实桌面上打开；Agent 看不到窗口内容时，用下方截图路径取证据。

## 2. 截图与证据

- 各预览脚本支持 `DEMO_PREVIEW_ARTIFACTS=1`，产物落在 `output/playwright/`（被 Git 忽略）。
- 需要任意页面的即时截图时，可写一次性 Playwright 脚本（chromium，指向预览端口），截图后用 `read_image` 目检——先加载 `ai-multimodal` 技能按金标检查。
- 时长/连续性数据看 `tests/reports/` 的脱敏 JSON（如 soak 的 fps/堆/DOM/CLS）。

## 3. 回归入口

```bash
pnpm test:v2:e2e      # 三浏览器 v2 三端闭环
pnpm test:v2:soak     # 30 分钟渲染长跑（先 smoke）
```

## 4. 卫生与边界

- 用完即关：临时库、端口、浏览器配置必须清理；不得长期挂着预览进程。
- 截图/录屏只含合成数据；不截令牌、姓名、学号、后台密码。
- 桌面截图与自动证据不得代签 vivo X300/局域网/OBS 人工验收。
