# 手机端动画协作交接（归档）

> 来源：`docs/ANIMATION_HANDOFF.md`（2026-08-14，工作基线 `feature/mobile-interaction-layout`）。该交接针对 D-027/D-028 的 2.8 秒镜头方案，已被 D-030（视觉金标：`motion-previsual-personal-star`）及 D-031/D-032 覆盖。现行视觉规范见 [`../VISUAL_GUIDE.md`](../VISUAL_GUIDE.md)。

## 仍有效的通用边界（已并入 VISUAL_GUIDE / PROTOCOL_V2）

- 动画不决定、延迟或伪造激活、锁色、准入、奖励、场景与结束事实；`prefers-reduced-motion` 直接静态终态。
- 手机端 Vue/CSS/SVG/单 Canvas，不迁移 GSAP；GSAP core 例外仅限 `/screen`。
- 不恢复怀士堂线稿、紫粉渐变、玻璃卡片墙；不做持续动画 blur/filter。
- 草稿只存内存，退出确认，成功提示 3.5 秒收回。

## 已过时的内容（不再执行）

- 约 2.8 秒四阶段径向寻星 + `50%/42vh` 轴 + 约 1.2 秒拉远方案（D-027/D-028）；
- `motion-previsual-personal-star` 之外旧"扁平径向线"方向；
- 交付门槛中的 `preview:mobile` 检查器（其 `persistent-focus-star` DOM 测量点已被 D-032 之后的生产旅程取代，见 VISUAL_GUIDE 第 10 节说明）。

## 预览入口（现行）

- `pnpm preview:v2:field`（现场三端 + OBS 验收）；`pnpm preview:journey`（个人旅程金标检查）；旧 `打开手机端预览.cmd` / `pnpm preview:mobile` 仅作历史。
