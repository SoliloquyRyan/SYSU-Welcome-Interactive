---
name: ai-multimodal
description: 本项目多模态验收工作流：用 read_image 读取 Playwright 截图、动线 artifact 与金标关键帧做目检对比；对照 D-030 金标检查视觉连续性。替代未安装的上游 ai-multimodal（Gemini 批处理脚本）技能；做视觉目检前先加载本技能。
whenToUse: 需要查看或对比页面截图、动效帧序列、金标关键帧（motion-previsual-personal-star）时使用。
---

# 多模态验收工作流（ai-multimodal · 项目版）

上游 ai-multimodal（Gemini 批处理生图/读图脚本）未随环境安装，本机也未配置多模态外部 API。本技能使用会话内置的 `read_image` 能力 + 项目自有 artifact，完成人工目检的 AI 侧预检。

## 1. 素材来源（全部合成，隐私安全）

- `output/playwright/`（被 Git 忽略）：`preview:journey`、`preview:mobile`、soak 等产出的截图。
- 金标：`motion-previsual-personal-star/` 的 `personal-star-journey-animatic.webm`、`index.html` 与十张关键帧——D-030 唯一视觉标准。
- `tests/reports/*.json`：脱敏自动证据（fps、堆、CLS、时长等），不含截图。

## 2. 目检流程

1. `read_image` 依次查看关键帧与当前版本同阶段截图（寻星开始/捕获/交接/选色/寄语/入轨）。
2. 按 D-030 检查：同一恒星贯穿、无替身圆环、速度/方向连续、交接无闪烁跳位、构图与金标一致。
3. 检查布局：无横向溢出、操作坞不遮挡、触控目标可见、字体回退协调（D-032）。
4. 隐私扫视：截图不得含真实姓名/学号/令牌；发现即停用该 artifact。

## 3. 边界（重要）

- AI 目检只是**预检**，不得写入验收结论；真机/现场签核只认 `docs/V2_10_FIELD_ACCEPTANCE.md` 由项目负责人填写的 PASS/FAIL。
- 不得用 AI 生成预览图冒充真实页面、浏览器证据或真机验收（PROTOCOL_V2 §12）。
- 截图只允许合成数据；若需保留证据，先脱敏并确认目录被 Git 忽略。
