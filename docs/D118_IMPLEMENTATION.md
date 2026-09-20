# D-118 最终联动与界面修正实施记录

日期：2026-09-19

发布：`/opt/sysu-welcome-internal/releases/20260919-d118-bbd942f108cb`；包 SHA-256：`bb460ab26bcc6c2a8387a0d69831a0459a11b8108c97161f900f185d8c3e3e05`；远端 `health`、`welcome`、`screen`、`admin`、协议能力和 snapshot 均返回 200，发布前后轮次 6、RUNNING、PROGRAM_SUPPORT、互动 IDLE 保持。

## 已实施

- 游客转学生核验在 `V2WelcomeExperience.vue` 使用 `is-student-verification` 独立根类；表单卡内部滚动，短屏和键盘状态保留按钮与错误提示可达性。
- `/api/v2/integrations/obs/scene-cue` cue 增加 `stageRevision`、`stageMode`，`HOST` 固定解析到 `00 开场与集结`；节目和颁奖继续要求唯一 `programId` 映射，未知、重复、无效状态返回空映射。
- 公共颁奖屏幕仅在揭晓后显示 `entry.name`，不渲染 `detail`；分页仅按姓名长度计算，管理端内部备注保留。
- 互动页集中舞台操作、互动 A/B/C、音频状态、答案和进入下一项，避免同页出现重复舞台按钮。

## 固定现场流程

1. 互动页点击“报幕／主题背景”，确认 cue 为 `HOST`，OBS 为 `00 开场与集结`。
2. 主持完成报幕；选择节目后点击“执行选中项”，桥接按唯一节目 ID 切换节目或颁奖场景。
3. 颁奖先揭晓再公开姓名；公共屏幕不显示备注、班级、学号或作品说明。

## 验证边界

已运行类型检查、构建、文档检查和相关单元／集成测试。服务器发布和 HOST cue 已复核：`stageMode=HOST`、`programId=null`、cue ID 含 `HOST:host`。本机 OBS 桥接进程已启动，`pnpm obs:audio --check` 确认当前场景 `00 开场与集结`、三个互动 mix 均可用。真实手机、LED 屏幕和现场长链路仍需人工复核；旧 E2E 中仍有基线标题断言失败，不能用作本次改动的绿色证据。
